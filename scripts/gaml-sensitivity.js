import { readFileSync, writeFileSync } from "node:fs";
import { parseCSV } from "../src/io/csv.js";
import { Account, FDOption, TransferFeeConfig } from "../src/core/models.js";
import { addPeriod, formatISODate } from "../src/core/dates.js";
import { SimulationEngine } from "../src/core/simulation.js";
import { GAMLStrategy } from "../src/strategies/gaml.js";

const START = "2026-11-05";
const BANK_IDS = ["LK_DFCC_BANK", "LK_COMMERCIAL_BANK_OF_CEYLON", "LK_NATIONAL_DEVELOPMENT_BANK"];
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const banks = new Map(parseCSV(read("data/banks/banks.csv")).map(row => [row.id, row]));
const index = new Map(parseCSV(read("data/fd_options/fd_options.csv")).map(row => [row.bank_id, row]));
const options = [];
for (const bankId of BANK_IDS) {
  const entry = index.get(bankId);
  const bankKey = entry.bank_key.toLowerCase();
  const minimum = ({ dfcc: 10000, commercial: 25000, ndb: 25000 })[bankKey] ?? 25000;
  options.push(...parseCSV(read("data/fd_options/" + entry.options_file)).map(row => new FDOption({
    label: row.name, period_str: row.period, annual_rate: Number(row.annual_rate),
    min_amount: row.min_amount ? Number(row.min_amount) : minimum,
    payout_type: row.payout_type || "cumulative", payout_period_str: row.payout_period || "",
    bank_key: bankKey, bank_id: bankId, is_efd: String(row.eFD).toLowerCase() === "true"
  })));
}
const accounts = BANK_IDS.map((bankId, i) => new Account({
  id: "account_" + (i + 1), bank_id: bankId, bank_key: index.get(bankId).bank_key,
  label: banks.get(bankId).name, balance: 100000, supports_efd: true
}));
const bankFees = Object.fromEntries(BANK_IDS.map(id => {
  const bank = banks.get(id);
  return [id.toUpperCase(), [Number(bank.intra_bank_transfer_fee || 0), Number(bank.domestic_inter_bank_transfer_fee || 25)]];
}));
const feeConfig = new TransferFeeConfig({ default_inter_bank_fee: 25, same_bank_fee: 0, bank_fees: bankFees });
const input = {
  options, start: START, end: formatISODate(addPeriod(START, "24m")), accounts,
  inflow_account_id: accounts[0].id, consolidation_account_id: accounts[0].id,
  inflow_schedule: {}, outflow_schedule: {}, fee_config: feeConfig
};
const engine = new SimulationEngine();
const cases = [
  ...[32, 64, 96, 192, 256].map(beam_width => ({ sweep: "beam_width", value: beam_width, beam_width, max_local_branches: 48, max_decisions: 5000 })),
  ...[16, 32, 48, 96, 128].map(max_local_branches => ({ sweep: "local_branch_limit", value: max_local_branches, beam_width: 96, max_local_branches, max_decisions: 5000 })),
  ...[500, 1000, 2500, 5000, 10000].map(max_decisions => ({ sweep: "decision_cap", value: max_decisions, beam_width: 96, max_local_branches: 48, max_decisions }))
];
const results = [];
for (const settings of cases) {
  const strategy = new GAMLStrategy({ ait_enabled: true, ...settings });
  const started = performance.now();
  const result = engine.run(strategy, input);
  const duration_ms = Number((performance.now() - started).toFixed(2));
  if (!result.finalized || !result.valid || !Number.isFinite(result.net_interest_after_ait)) {
    throw new Error("Invalid GAML sensitivity result: " + JSON.stringify(settings));
  }
  const row = {
    sweep: settings.sweep, value: settings.value, beam_width: strategy.beam_width,
    max_local_branches: strategy.max_local_branches, max_decisions: strategy.max_decisions,
    net_interest: Number(result.net_interest_after_ait.toFixed(2)),
    final_value: Number(result.final_value_after_ait.toFixed(2)),
    expanded_states: result.search_diagnostics?.expanded_states ?? 0,
    beam_pruned: result.search_diagnostics?.beam_pruned ?? 0,
    local_combination_pruned: result.search_diagnostics?.local_combination_pruned ?? 0,
    state_memo_hits: result.search_diagnostics?.state_memo_hits ?? 0,
    state_memo_evictions: result.search_diagnostics?.state_memo_evictions ?? 0,
    expansion_cache_hits: result.search_diagnostics?.expansion_cache?.hits ?? 0,
    expansion_cache_entries: result.search_diagnostics?.expansion_cache?.entries ?? 0,
    expansion_cache_retained_children: result.search_diagnostics?.expansion_cache?.retained_children ?? 0,
    local_branches_generated: result.search_diagnostics?.local_branches_generated ?? 0,
    consolidation_branches_generated: result.search_diagnostics?.consolidation_branches_generated ?? 0,
    candidate_states_generated: result.search_diagnostics?.candidate_states_generated ?? 0,
    candidate_state_duplicates: result.search_diagnostics?.candidate_state_duplicates ?? 0,
    budget_stopped: result.search_diagnostics?.budget_stopped ?? false,
    budget_frontier_states: result.search_diagnostics?.budget_frontier_states ?? 0,
    selected_strategy: result.search_diagnostics?.result_selection?.selected ?? result.strategy_name,
    selected_reason: result.search_diagnostics?.result_selection?.reason ?? null,
    optimality_proven: result.optimality_proven === true,
    duration_ms
  };
  results.push(row);
  process.stdout.write("GAML_SENSITIVITY_POINT=" + JSON.stringify(row) + "\n");
}
const output = {
  generated_at: new Date().toISOString(), start_date: START,
  scenario: { horizon_months: 24, capital_lkr: 300000, accounts: 3, banks: BANK_IDS, inflows: "none", efd_eligible: true, ait_enabled: true, compound: false },
  baseline: { beam_width: 96, max_local_branches: 48, max_decisions: 5000 },
  results
};
writeFileSync(new URL("docs/strategies/benchmarks/gaml-search-results.json", root), JSON.stringify(output, null, 2) + "\n");
process.stdout.write("GAML_SENSITIVITY_JSON=" + JSON.stringify(output) + "\n");
