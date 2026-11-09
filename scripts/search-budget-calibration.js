import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseCSV } from "../src/io/csv.js";
import { Account, FDOption, TransferFeeConfig } from "../src/core/models.js";
import { addPeriod, formatISODate } from "../src/core/dates.js";
import { SimulationEngine } from "../src/core/simulation.js";
import { GAMLStrategy } from "../src/strategies/gaml.js";

const START = "2026-11-05";
const BANK_IDS = ["LK_DFCC_BANK", "LK_COMMERCIAL_BANK_OF_CEYLON", "LK_NATIONAL_DEVELOPMENT_BANK"];
const ROOT = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), "utf8");
const banks = new Map(parseCSV(read("data/banks/banks.csv")).map(row => [row.id, row]));
const index = new Map(parseCSV(read("data/fd_options/fd_options.csv")).map(row => [row.bank_id, row]));
const options = [];

for (const bankId of BANK_IDS) {
  const entry = index.get(bankId);
  if (!entry) throw new Error("Missing benchmark bank index entry: " + bankId);
  const bankKey = entry.bank_key.toLowerCase();
  const minimum = ({ dfcc: 10000, commercial: 25000, ndb: 25000 })[bankKey] ?? 25000;
  const rows = parseCSV(read("data/fd_options/" + entry.options_file));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      options.push(new FDOption({
        label: row.name, period_str: row.period, annual_rate: Number(row.annual_rate),
        min_amount: row.min_amount ? Number(row.min_amount) : minimum,
        payout_type: row.payout_type || "cumulative", payout_period_str: row.payout_period || "",
        bank_key: bankKey, bank_id: bankId, is_efd: String(row.eFD).toLowerCase() === "true"
      }));
    } catch (error) {
      process.stderr.write("Skipping invalid benchmark catalogue row " + entry.options_file +
        ":" + (i + 2) + ": " + error.message + "\n");
    }
  }
}

const startingBalances = [333333, 333333, 333334];
const accounts = BANK_IDS.map((bankId, i) => new Account({
  id: "account_" + (i + 1), bank_id: bankId, bank_key: index.get(bankId).bank_key,
  label: banks.get(bankId).name, balance: startingBalances[i], supports_efd: true
}));
const bankFees = Object.fromEntries(BANK_IDS.map(id => {
  const bank = banks.get(id);
  return [id.toUpperCase(), [
    Number(bank.intra_bank_transfer_fee || 0),
    Number(bank.domestic_inter_bank_transfer_fee || 25)
  ]];
}));
const horizonMonths = 60;
const end = formatISODate(addPeriod(START, horizonMonths + "m"));
const inflowSchedule = {};
const outflowSchedule = {};
for (let month = 1; month <= horizonMonths; month++) {
  const date = formatISODate(addPeriod(START, "1m", month));
  inflowSchedule[date] = { [accounts[0].id]: 10000 };
  outflowSchedule[date] = [{
    account_id: accounts[0].id, amount: 5000, payment_policy: "strict",
    name: "Monthly planned outflow"
  }];
}
const input = {
  options, start: START, end, accounts,
  inflow_account_id: accounts[0].id, consolidation_account_id: accounts[0].id,
  inflow_schedule: inflowSchedule, outflow_schedule: outflowSchedule,
  fee_config: new TransferFeeConfig({ default_inter_bank_fee: 25, same_bank_fee: 0, bank_fees: bankFees })
};
const engine = new SimulationEngine();
const stateCaps = [5000, 10000, 20000, null];
const timeBudgets = [15000, 30000, 60000];
const results = [];

for (const stateCap of stateCaps) {
  for (const timeLimitMs of timeBudgets) {
    const settings = {
      beam_width: 256,
      max_local_branches: 128,
      max_decisions: stateCap,
      time_limit_ms: timeLimitMs
    };
    const strategy = new GAMLStrategy(settings);
    const started = performance.now();
    let result = null;
    let error = null;
    try {
      result = engine.run(strategy, input);
    } catch (caught) {
      error = { name: caught?.name ?? "Error", message: caught?.message ?? String(caught) };
    }
    const runtimeMs = Number((performance.now() - started).toFixed(2));
    const diagnostics = result?.search_diagnostics ?? {};
    const row = {
      state_cap: stateCap,
      time_limit_ms: timeLimitMs,
      beam_width: settings.beam_width,
      max_local_branches: settings.max_local_branches,
      runtime_ms: runtimeMs,
      finalized: result?.finalized === true,
      valid: result?.valid === true,
      optimality_proven: result?.optimality_proven === true,
      net_interest_after_ait: Number.isFinite(result?.net_interest_after_ait)
        ? Number(result.net_interest_after_ait.toFixed(2)) : null,
      final_value_after_ait: Number.isFinite(result?.final_value_after_ait)
        ? Number(result.final_value_after_ait.toFixed(2)) : null,
      transfer_fees: Number.isFinite(result?.total_transfer_fees)
        ? Number(result.total_transfer_fees.toFixed(2)) : null,
      booking_count: result?.bookings?.length ?? null,
      expanded_states: diagnostics.expanded_states ?? null,
      beam_pruned: diagnostics.beam_pruned ?? null,
      local_combination_pruned: diagnostics.local_combination_pruned ?? null,
      stop_reason: diagnostics.stop_reason ?? diagnostics.termination_reason ?? null,
      error
    };
    results.push(row);
    process.stdout.write("SEARCH_BUDGET_POINT=" + JSON.stringify(row) + "\n");
  }
}

const output = {
  generated_at: new Date().toISOString(),
  scenario: {
    start: START, horizon_months: horizonMonths, total_starting_capital_lkr: 1000000,
    accounts: 3, banks: BANK_IDS, monthly_inflow_lkr: 10000, monthly_outflow_lkr: 5000,
    cash_flow_account: accounts[0].id,
    ait_enabled: true, compound: false
  },
  fixed_search_settings: { beam_width: 256, max_local_branches: 128 },
  matrix: { state_caps: stateCaps, time_limits_ms: timeBudgets },
  results
};
const outputPath = resolve(process.env.SEARCH_BUDGET_OUTPUT || "search-budget-calibration.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
process.stdout.write("SEARCH_BUDGET_OUTPUT=" + outputPath + "\n");
