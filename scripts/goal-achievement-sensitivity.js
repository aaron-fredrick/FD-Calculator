import { readFileSync } from "node:fs";
import { parseCSV } from "../src/io/csv.js";
import { Account, FDOption, TransferFeeConfig } from "../src/core/models.js";
import { addPeriod, formatISODate } from "../src/core/dates.js";
import { SimulationEngine } from "../src/core/simulation.js";
import { GreedyStrategy } from "../src/strategies/greedy.js";
import { AbsolutePlusStrategy } from "../src/strategies/absolute-plus.js";
import { GSSStrategy } from "../src/strategies/gss.js";

const START = "2026-11-05";
const BANK_IDS = ["LK_DFCC_BANK", "LK_COMMERCIAL_BANK_OF_CEYLON", "LK_NATIONAL_DEVELOPMENT_BANK"];
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const banks = new Map(parseCSV(read("data/banks/banks.csv")).map(row => [row.id, row]));
const index = new Map(parseCSV(read("data/fd_options/fd_options.csv")).map(row => [row.bank_id, row]));
const optionsByBank = new Map();

for (const bankId of BANK_IDS) {
  const entry = index.get(bankId);
  if (!entry) throw new Error("Missing FD option index for " + bankId);
  const key = entry.bank_key.toLowerCase();
  const minimum = ({ dfcc: 10000, commercial: 25000, ndb: 25000 })[key] ?? 25000;
  const rows = parseCSV(read("data/fd_options/" + entry.options_file));
  const options = rows.map(row => new FDOption({
    label: row.name, period_str: row.period, annual_rate: Number(row.annual_rate),
    min_amount: row.min_amount ? Number(row.min_amount) : minimum,
    payout_type: row.payout_type || "cumulative", payout_period_str: row.payout_period || "",
    bank_key: key, bank_id: bankId, is_efd: String(row.eFD).toLowerCase() === "true"
  }));
  if (!options.length) throw new Error("No FD products for " + bankId);
  optionsByBank.set(bankId, options);
}
const options = [...optionsByBank.values()].flat();
const bankFees = Object.fromEntries(BANK_IDS.map(id => {
  const bank = banks.get(id);
  return [id.toUpperCase(), [Number(bank.intra_bank_transfer_fee || 0), Number(bank.domestic_inter_bank_transfer_fee || 25)]];
}));
const feeConfig = new TransferFeeConfig({ default_inter_bank_fee: 25, same_bank_fee: 0, bank_fees: bankFees });
const engine = new SimulationEngine();

function makeAccounts(count, capital, bankCount, efd) {
  const chosenBanks = BANK_IDS.slice(0, bankCount);
  const base = Math.floor(capital / count), remainder = capital - base * count;
  return Array.from({ length: count }, (_, i) => {
    const bankId = chosenBanks[i % chosenBanks.length], bank = banks.get(bankId);
    return new Account({
      id: "account_" + (i + 1), bank_id: bankId, bank_key: index.get(bankId).bank_key,
      label: bank.name + " account " + (i + 1), balance: base + (i === 0 ? remainder : 0),
      supports_efd: efd
    });
  });
}

function makeInflows(kind, accountId, end) {
  const schedule = {};
  const recurring = kind === "monthly_10k" ? ["1m", 10000] : kind === "quarterly_30k" ? ["3m", 30000] : null;
  if (recurring) {
    for (let i = 1; ; i++) {
      const date = formatISODate(addPeriod(START, recurring[0], i));
      if (date > end) break;
      schedule[date] = { [accountId]: recurring[1] };
    }
  } else if (kind === "lump_100k") {
    const date = formatISODate(addPeriod(START, "6m"));
    if (date <= end) schedule[date] = { [accountId]: 100000 };
  }
  return schedule;
}

const strategies = [
  ["Greedy", () => new GreedyStrategy({ ait_enabled: true })],
  ["Absolute+", () => new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 16, max_local_branches: 8, max_decisions: 48
  })],
  ["GSS", () => new GSSStrategy({ ait_enabled: true, small_period_days: 30 })]
];
const results = [];

function runPoint(category, value, {
  target = 50000, months = 12, capital = 300000, accountCount = 3,
  bankCount = 3, inflow = "none", efd = true
} = {}) {
  const end = formatISODate(addPeriod(START, months + "m"));
  const accounts = makeAccounts(accountCount, capital, bankCount, efd);
  const input = {
    options, start: START, end,
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target } },
    accounts, inflow_account_id: accounts[0].id, consolidation_account_id: accounts[0].id,
    inflow_schedule: makeInflows(inflow, accounts[0].id, end),
    outflow_schedule: {}, fee_config: feeConfig
  };
  for (const [name, createStrategy] of strategies) {
    const started = Date.now();
    const result = engine.run(createStrategy(), input);
    const runtimeMs = Date.now() - started;
    if (!result.finalized || !result.goal_outcome || !Number.isFinite(result.credited_net_interest)) {
      throw new Error(name + " produced an invalid goal result at " + category + "/" + value);
    }
    const goal = result.goal_outcome;
    const row = {
      category, value, strategy: name, target_lkr: target, maximum_months: months,
      starting_capital_lkr: capital, account_count: accountCount, bank_count: bankCount,
      inflow, efd: efd ? "eligible" : "standard_only",
      achieved: goal.achieved, achievement_date: goal.achievement_date,
      days_to_achievement: goal.elapsed_days,
      actual_net_interest_at_achievement: goal.achieved ? Number(goal.actual.toFixed(2)) : null,
      credited_net_interest_at_stop: Number(result.credited_net_interest.toFixed(2)),
      final_net_interest_after_ait: Number(result.net_interest_after_ait.toFixed(2)),
      shortfall_lkr: goal.achieved ? 0 : Number(goal.shortfall.toFixed(2)),
      transfer_fees_lkr: Number(result.total_transfer_fees.toFixed(2)),
      booking_count: result.bookings.length,
      runtime_ms: runtimeMs,
      absolute_plus_expanded_states: result.search_diagnostics?.expanded_states ?? null,
      optimality_proven: result.search_diagnostics?.optimality_proven ?? null,
      stopping_reason: goal.stopping_reason
    };
    results.push(row);
    process.stdout.write("GOAL_SENSITIVITY_POINT=" + JSON.stringify({
      category, value, strategy: name, achieved: row.achieved,
      days_to_achievement: row.days_to_achievement, credited_net_interest: row.credited_net_interest_at_stop,
      runtime_ms: runtimeMs
    }) + "\n");
  }
}

// One-factor-at-a-time design. Outflows are deliberately excluded pending
// independent verification of the shared outflow/provenance interaction.
for (const target of [10000, 25000, 50000, 75000, 100000]) runPoint("goal_target_lkr", target, { target });
for (const capital of [25000, 100000, 300000, 1000000]) runPoint("starting_capital_lkr", capital, { capital });
for (const accountCount of [1, 2, 3]) runPoint("account_count", accountCount, { accountCount, bankCount: 1 });
for (const bankCount of [1, 2, 3]) runPoint("bank_count", bankCount, { bankCount, accountCount: 3 });
for (const inflow of ["none", "monthly_10k", "quarterly_30k", "lump_100k"]) runPoint("inflow_pattern", inflow, { inflow });
for (const efd of [false, true]) runPoint("efd_eligibility", efd ? "eligible" : "standard_only", { efd });
for (const months of [6, 12, 24]) runPoint("maximum_scope_months", months, { months });

const groups = new Map();
for (const row of results) {
  const key = row.category + "|" + row.value;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
for (const rows of groups.values()) {
  const baseline = rows.find(row => row.strategy === "Greedy");
  for (const row of rows) {
    row.delta_days_vs_greedy = row.days_to_achievement === null || baseline.days_to_achievement === null
      ? null : baseline.days_to_achievement - row.days_to_achievement;
    row.delta_credited_interest_vs_greedy = Number((row.credited_net_interest_at_stop - baseline.credited_net_interest_at_stop).toFixed(2));
  }
}
process.stdout.write("GOAL_ACHIEVEMENT_SENSITIVITY_JSON=" + JSON.stringify({
  generated_at: new Date().toISOString(), start_date: START, banks: BANK_IDS.map(id => ({
    id, name: banks.get(id).name, rate_file: index.get(id).options_file,
    research_status: index.get(id).research_status, option_count: optionsByBank.get(id).length
  })),
  objective: "First-time net interest credited to consolidation account after AIT and attributable transfer fees.",
  ait_enabled: true, compound: false, outflows_included: false,
  absolute_plus_budget: { beam_width: 16, max_local_branches: 8, max_decisions: 48 },
  results
}) + "\n");
