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

function makeInflows(accountId, end, amount, durationMonths) {
  const schedule = {};
  if (amount <= 0 || durationMonths <= 0) return schedule;
  for (let month = 1; month <= durationMonths; month += 1) {
    const date = formatISODate(addPeriod(START, month + "m"));
    if (date > end) break;
    schedule[date] = { [accountId]: amount };
  }
  return schedule;
}

function makeOutflows(accountId, end, amount, durationMonths) {
  const schedule = {};
  if (amount <= 0 || durationMonths <= 0) return schedule;
  for (let month = 1; month <= durationMonths; month += 1) {
    const date = formatISODate(addPeriod(START, month + "m"));
    if (date > end) break;
    schedule[date] = [{
      name: "Scheduled liquidity obligation",
      account_id: accountId,
      amount,
      payment_policy: "strict"
    }];
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
  inflowAmount = 0, inflowDurationMonths = months,
  outflowAmount = 0, outflowDurationMonths = months, efd = true
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
    inflow_schedule: makeInflows(accounts[0].id, end, inflowAmount, inflowDurationMonths),
    outflow_schedule: makeOutflows(accounts[0].id, end, outflowAmount, outflowDurationMonths),
    fee_config: feeConfig
  };
  for (const [name, makeStrategy] of strategies) {
    const started = Date.now();
    let result;
    try {
      result = engine.run(makeStrategy(), input);
    } catch (error) {
      if (outflowAmount <= 0 || !String(error?.message ?? error).includes("strict outflows")) throw error;
      const duration = Date.now() - started;
      const scheduled = Object.values(input.outflow_schedule)
        .flat()
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const row = {
        category, value, strategy: name, months, capital,
        accounts: accountCount, banks: bankCount,
        inflow_amount: inflowAmount, inflow_duration_months: inflowDurationMonths,
        outflow_amount: outflowAmount, outflow_duration_months: outflowDurationMonths,
        efd, valid: false, validity_pct: 0, outflows_paid: null,
        outflow_unpaid: null, outflow_scheduled_total: Number(scheduled.toFixed(2)),
        net_interest: null, gross_interest: null, ait: null,
        transfer_fees: null, principal: capital, final_value: null,
        bookings: 0, cash_retained: null, duration_ms: duration,
        optimality_proven: false, search_expanded: null,
        strategy_error: error.message
      };
      results.push(row);
      process.stdout.write("SENSITIVITY_POINT=" + JSON.stringify({
        category, value, strategy: name, valid: false,
        outflow_scheduled_total: row.outflow_scheduled_total, duration_ms: duration,
        error: error.message
      }) + "\n");
      continue;
    }
    const duration = Date.now() - started;
    if (!result.finalized || !Number.isFinite(result.net_interest_after_ait) || (outflowAmount === 0 && !result.valid)) {
      throw new Error(name + " produced an invalid result for " + category + "/" + value);
    }
    const row = {
      category, value, strategy: name, months, capital,
      accounts: accountCount, banks: bankCount,
      inflow_amount: inflowAmount, inflow_duration_months: inflowDurationMonths,
      outflow_amount: outflowAmount, outflow_duration_months: outflowDurationMonths, efd,
      valid: result.valid === true,
      validity_pct: result.valid === true ? 100 : 0,
      outflows_paid: Number((result.total_outflows_paid ?? 0).toFixed(2)),
      outflow_unpaid: Number((result.outstanding_outflows ?? []).reduce((sum, item) => sum + Number(item.remaining || 0), 0).toFixed(2)),
      outflow_scheduled_total: Number(Object.values(input.outflow_schedule).flat().reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
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
      search_expanded: result.search_diagnostics?.expanded_states ?? null,
      state_memo_hits: result.search_diagnostics?.state_memo_hits ?? null,
      state_memo_evictions: result.search_diagnostics?.state_memo_evictions ?? null,
      expansion_cache_hits: result.search_diagnostics?.expansion_cache?.hits ?? null,
      expansion_cache_entries: result.search_diagnostics?.expansion_cache?.entries ?? null,
      expansion_cache_retained_children: result.search_diagnostics?.expansion_cache?.retained_children ?? null
    };
    results.push(row);
    process.stdout.write("SENSITIVITY_POINT=" + JSON.stringify(row) + "\n");
  }
}

// Investment horizon: every 3 months from an immediate 0-month scope through 5 years.
for (let months = 0; months <= 60; months += 3) {
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
// Cash inflows: monthly amount sweep and fixed-amount duration sweep, both over 2 years.
for (let amount = 0; amount <= 200000; amount += 10000) {
  runCase("inflow_monthly_amount_lkr", amount, {
    months: 24, inflowAmount: amount
  });
}
for (let duration = 1; duration <= 12; duration += 1) {
  runCase("inflow_duration_months", duration, {
    months: 24, inflowAmount: 100000, inflowDurationMonths: duration
  });
}
for (const efd of [false, true]) {
  runCase("efd_eligibility", efd ? "eligible" : "standard_only", { efd });
}

// Strict outflows mirror the two inflow sweeps over the same 2-year horizon.
for (let amount = 0; amount <= 200000; amount += 10000) {
  runCase("outflow_monthly_amount_lkr", amount, {
    months: 24, outflowAmount: amount
  });
}
for (let duration = 1; duration <= 12; duration += 1) {
  runCase("outflow_duration_months", duration, {
    months: 24, outflowAmount: 100000, outflowDurationMonths: duration
  });
}

// Two-factor matrix: exposes capital/horizon interactions hidden by isolated sweeps.
for (const months of [6, 12, 24]) {
  for (const capital of [100000, 300000, 1000000]) {
    runCase("capital_horizon", `${capital}:${months}`, { months, capital });
  }
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
  const baselineComparable = baseline?.valid === true && Number.isFinite(baseline.net_interest);
  for (const row of rows) {
    const comparable = baselineComparable && row.valid === true && Number.isFinite(row.net_interest);
    row.delta_vs_greedy = comparable ? Number((row.net_interest - baseline.net_interest).toFixed(2)) : null;
    row.delta_pct_vs_greedy = comparable && baseline.net_interest
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
    one_factor_sweeps: ["horizon_months", "starting_capital_lkr", "account_count", "bank_count", "efd_eligibility"],
    cash_inflow_sweeps: {
      monthly_amount_lkr: { min: 0, max: 200000, step: 10000, duration_months: 24, horizon_months: 24 },
      duration_months: { min: 1, max: 12, step: 1, amount_lkr: 100000, horizon_months: 24, payment_frequency: "monthly", first_payment_month: 1 }
    },
    strict_outflow_sweeps: {
      monthly_amount_lkr: { min: 0, max: 200000, step: 10000, duration_months: 24, horizon_months: 24 },
      duration_months: { min: 1, max: 12, step: 1, amount_lkr: 100000, horizon_months: 24, payment_frequency: "monthly", first_payment_month: 1 }
    },
    interaction_matrices: ["capital_horizon"],
    interaction_points: 9,
    liquidity_note: "Strict obligations are scored for runtime validity and observed unpaid amount. When a strategy throws before a result exists, paid/unpaid totals remain unmeasured and the scheduled total is reported separately.",
    timing_note: "Single-run wall-clock measurements are observational; compare only on the same runner."
  },
  results
};
writeFileSync(new URL("docs/strategies/benchmarks/results.json", root), JSON.stringify(output, null, 2) + "\n");
process.stdout.write("STRATEGY_SENSITIVITY_JSON=" + JSON.stringify(output) + "\n");
