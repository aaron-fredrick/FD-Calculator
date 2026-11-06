import { readFileSync, writeFileSync } from "node:fs";
import { parseCSV } from "../src/io/csv.js";
import { Account, FDOption, TransferFeeConfig } from "../src/core/models.js";
import { addPeriod, formatISODate } from "../src/core/dates.js";
import { SimulationEngine } from "../src/core/simulation.js";
import { GreedyStrategy } from "../src/strategies/greedy.js";
import { AbsolutePlusStrategy } from "../src/strategies/absolute-plus.js";
import { GSSStrategy } from "../src/strategies/gss.js";

const START = "2026-11-05";
const BANK_IDS = [
  "LK_DFCC_BANK",
  "LK_COMMERCIAL_BANK_OF_CEYLON",
  "LK_NATIONAL_DEVELOPMENT_BANK"
];
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const banks = new Map(parseCSV(read("data/banks/banks.csv")).map(row => [row.id, row]));
const index = new Map(parseCSV(read("data/fd_options/fd_options.csv")).map(row => [row.bank_id, row]));
const optionsByBank = new Map();
for (const bankId of BANK_IDS) {
  const entry = index.get(bankId);
  if (!entry) throw new Error("Missing FD option index for " + bankId);
  const key = entry.bank_key.toLowerCase();
  const fallbackMinimum = ({ dfcc: 10000, commercial: 25000, ndb: 25000 })[key] ?? 25000;
  const rows = parseCSV(read("data/fd_options/" + entry.options_file));
  const options = rows.map(row => new FDOption({
    label: row.name,
    period_str: row.period,
    annual_rate: Number(row.annual_rate),
    min_amount: row.min_amount ? Number(row.min_amount) : fallbackMinimum,
    payout_type: row.payout_type || "cumulative",
    payout_period_str: row.payout_period || "",
    bank_key: key,
    bank_id: bankId,
    is_efd: String(row.eFD).toLowerCase() === "true"
  }));
  if (!options.length) throw new Error("No FD products for " + bankId);
  optionsByBank.set(bankId, options);
}
const options = [...optionsByBank.values()].flat();
const bankFees = Object.fromEntries(BANK_IDS.map(id => {
  const bank = banks.get(id);
  return [id.toUpperCase(), [
    Number(bank.intra_bank_transfer_fee || 0),
    Number(bank.domestic_inter_bank_transfer_fee || 25)
  ]];
}));
const feeConfig = new TransferFeeConfig({
  default_inter_bank_fee: 25,
  same_bank_fee: 0,
  bank_fees: bankFees
});
const engine = new SimulationEngine();

function makeAccounts(count, capital, bankCount = 3, efd = true) {
  const chosenBanks = BANK_IDS.slice(0, bankCount);
  const quotient = Math.floor(capital / count);
  let remainder = capital - quotient * count;
  return Array.from({ length: count }, (_, i) => {
    const balance = quotient + (i === 0 ? remainder : 0);
    const bankId = chosenBanks[i % chosenBanks.length];
    const bank = banks.get(bankId);
    return new Account({
      id: "account_" + (i + 1),
      bank_id: bankId,
      bank_key: index.get(bankId).bank_key,
      label: bank.name + " account " + (i + 1),
      balance,
      supports_efd: efd
    });
  });
}

function makeInflows(kind, accountId, end) {
  const schedule = {};
  if (kind === "monthly_10k" || kind === "quarterly_30k") {
    const period = kind === "monthly_10k" ? "1m" : "3m";
    const amount = kind === "monthly_10k" ? 10000 : 30000;
    for (let i = 1; ; i++) {
      const date = formatISODate(addPeriod(START, period, i));
      if (date > end) break;
      schedule[date] = { [accountId]: amount };
    }
  } else if (kind === "lump_100k") {
    const date = formatISODate(addPeriod(START, "6m"));
    if (date <= end) schedule[date] = { [accountId]: 100000 };
  }
  return schedule;
}

const strategies = [
  ["Greedy", () => new GreedyStrategy({ ait_enabled: true })],
  ["Absolute R+", () => new AbsolutePlusStrategy({ ait_enabled: true, beam_width: 96, max_local_branches: 48, max_decisions: 5000 })],
  ["GSS", () => new GSSStrategy({ ait_enabled: true, small_period_days: 30 })]
];
const results = [];
function runCase(category, value, {
  months = 24, capital = 300000, accountCount = 3, bankCount = 3,
  inflow = "none", efd = true
} = {}) {
  const end = formatISODate(addPeriod(START, months + "m"));
  const accounts = makeAccounts(accountCount, capital, bankCount, efd);
  const input = {
    options,
    start: START,
    end,
    accounts,
    inflow_account_id: accounts[0].id,
    consolidation_account_id: accounts[0].id,
    inflow_schedule: makeInflows(inflow, accounts[0].id, end),
    outflow_schedule: {},
    fee_config: feeConfig
  };
  for (const [name, makeStrategy] of strategies) {
    const started = Date.now();
    const result = engine.run(makeStrategy(), input);
    const duration = Date.now() - started;
    if (!result.finalized || !result.valid || !Number.isFinite(result.net_interest_after_ait)) {
      throw new Error(name + " produced an invalid result for " + category + "/" + value);
    }
    const row = {
      category, value, strategy: name, months, capital,
      accounts: accountCount, banks: bankCount, inflow, efd,
      net_interest: Number(result.net_interest_after_ait.toFixed(2)),
      gross_interest: Number(result.total_interest.toFixed(2)),
      ait: Number(result.ait_withheld.toFixed(2)),
      transfer_fees: Number(result.total_transfer_fees.toFixed(2)),
      principal: Number(result.total_principal.toFixed(2)),
      final_value: Number(result.final_value_after_ait.toFixed(2)),
      bookings: result.bookings.length,
      cash_retained: Number(result.cash_retained.toFixed(2)),
      duration_ms: duration,
      optimality_proven: result.optimality_proven ?? null,
      search_expanded: result.search_diagnostics?.expanded_states ?? null
    };
    results.push(row);
    process.stdout.write("SENSITIVITY_POINT=" + JSON.stringify({ category, value, strategy: name, net_interest: row.net_interest, duration_ms: duration }) + "\n");
  }
}

// One-factor-at-a-time sweeps. All strategies receive identical inputs per point.
for (const months of [6, 12, 24]) {
  runCase("horizon_months", months, { months });
}
for (const capital of [25000, 100000, 300000, 1000000]) {
  runCase("starting_capital_lkr", capital, { capital });
}
for (const accountCount of [1, 2, 3]) {
  runCase("account_count", accountCount, { accountCount, capital: 300000, bankCount: 1 });
}
for (const bankCount of [1, 2, 3]) {
  runCase("bank_count", bankCount, { accountCount: 3, capital: 300000, bankCount });
}
for (const inflow of ["none", "monthly_10k", "lump_100k"]) {
  runCase("inflow_pattern", inflow, { inflow });
}
for (const efd of [false, true]) {
  runCase("efd_eligibility", efd ? "eligible" : "standard_only", { efd });
}

const grouped = new Map();
for (const row of results) {
  const key = row.category + "|" + row.value;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
}
for (const rows of grouped.values()) {
  const byStrategy = new Map(rows.map(row => [row.strategy, row]));
  const baseline = byStrategy.get("Greedy");
  for (const row of rows) {
    row.delta_vs_greedy = Number((row.net_interest - baseline.net_interest).toFixed(2));
    row.delta_pct_vs_greedy = baseline.net_interest
      ? Number(((row.net_interest / baseline.net_interest - 1) * 100).toFixed(3))
      : null;
  }
}
const output = {
  generated_at: new Date().toISOString(),
  start_date: START,
  banks: BANK_IDS.map(id => ({
    id,
    name: banks.get(id).name,
    rate_file: index.get(id).options_file,
    research_status: index.get(id).research_status,
    options: optionsByBank.get(id).length
  })),
  ait_enabled: true,
  compound: false,
  transfer_fee_basis: "Bank catalogue intra/inter-bank transfer fees; all transfer decisions and final sweep use the same fee config.",
  design: {
    one_factor_sweeps: ["horizon_months", "starting_capital_lkr", "account_count", "bank_count", "inflow_pattern", "efd_eligibility"],
    interaction_matrix: "capital_horizon",
    interaction_points: 9,
    timing_note: "Single-run wall-clock measurements are observational; compare only on the same runner."
  },
  results
};
writeFileSync(new URL("docs/strategies/benchmarks/results.json", root), JSON.stringify(output, null, 2) + "\n");
process.stdout.write("STRATEGY_SENSITIVITY_JSON=" + JSON.stringify(output) + "\n");
