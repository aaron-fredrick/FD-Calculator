import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { AbsolutePlusStrategy } from "../../src/strategies/absolute-plus.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { compareScopedResults, searchStateKey } from "../../src/strategies/search-strategy-base.js";

const run = (strategy, input) => new SimulationEngine().run(strategy, input);


function budgetSensitivityScenario() {
  const banks = ["BANK_A", "BANK_B", "BANK_C", "BANK_D"];
  const accounts = banks.map((bank_id, index) => new Account({
    id: "account-" + index, bank_id, bank_key: bank_id.toLowerCase(),
    label: bank_id, balance: 30000, supports_efd: false
  }));
  const durations = ["30d", "45d", "60d", "90d", "120d", "180d"];
  const options = banks.flatMap((bank_id, index) => durations.map((period_str, durationIndex) =>
    new FDOption({
      label: bank_id + " " + period_str, bank_id, bank_key: bank_id.toLowerCase(),
      period_str, annual_rate: 8 + index + durationIndex * 0.4, min_amount: 25000
    })
  ));
  const inflow_schedule = {};
  for (let month = 1; month <= 36; month++) {
    const year = 2026 + Math.floor((month - 1) / 12);
    const monthOfYear = (month - 1) % 12 + 1;
    const date = year + "-" + String(monthOfYear).padStart(2, "0") + "-01";
    inflow_schedule[date] = Object.fromEntries(accounts.map((account, index) => [
      account.id, 1000 + index * 250
    ]));
  }
  return {
    options, start: "2026-01-01", end: "2030-01-01", accounts,
    inflow_account_id: "account-0", consolidation_account_id: "account-0",
    inflow_schedule, outflow_schedule: {}, fee_config: new TransferFeeConfig()
  };
}
function scenario() {
  const account = new Account({
    id: "main", bank_id: "BANK_A", bank_key: "bank_a",
    label: "Main", balance: 30000, supports_efd: false
  });
  const options = [
    new FDOption({
      label: "Standard 30d", bank_id: "BANK_A", bank_key: "bank_a",
      period_str: "30d", annual_rate: 10, min_amount: 25000
    }),
    new FDOption({
      label: "High-minimum 30d", bank_id: "BANK_A", bank_key: "bank_a",
      period_str: "30d", annual_rate: 15, min_amount: 50000
    }),
    new FDOption({
      label: "eFD 30d", bank_id: "BANK_A", bank_key: "bank_a",
      period_str: "30d", annual_rate: 10, min_amount: 25000, is_efd: true
    })
  ];
  return {
    options, start: "2026-01-01", end: "2026-03-10",
    inflow_schedule: { "2026-02-01": { main: 30000 } }, accounts: [account], inflow_account_id: "main",
    fee_config: new TransferFeeConfig(), consolidation_account_id: "main",
    outflow_schedule: {}
  };
}

test("Absolute runs exhaustive portfolio search and returns a replayed SimResult", () => {
  const result = run(new AbsoluteStrategy({ ait_enabled: true }), scenario());
  assert.equal(result.strategy_name, "Absolute R");
  assert.equal(result.valid, true);
  assert.ok(result.bookings.length > 0);
  assert.ok(result.bookings.some(booking => booking.start.toISOString().slice(0, 10) === "2026-02-01"));
  assert.ok(result.search_diagnostics.expanded_states > 0);
  assert.equal(result.optimality_proven, true);
  assert.ok(result.bookings.every(booking => !booking.option.is_efd));
});

test("Absolute+ runs bounded search and honours its three Python-compatible settings", () => {
  const strategy = new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 8, max_local_branches: 4, max_decisions: 100
  });
  const result = run(strategy, scenario());
  assert.equal(result.strategy_name, "Absolute R+");
  assert.equal(result.valid, true);
  assert.ok(result.bookings.length > 0);
  assert.ok(result.bookings.some(booking => booking.start.toISOString().slice(0, 10) === "2026-02-01"));
  assert.ok(result.search_diagnostics.expanded_states <= 100);
  assert.equal(result.search_settings.beamWidth, 8);
  assert.equal(result.search_settings.maxLocalBranches, 4);
  assert.equal(result.search_settings.maxDecisions, 100);
  assert.ok(result.bookings.every(booking => !booking.option.is_efd));
});

test("Absolute+ never returns a worse objective than Greedy for the same small scenario", () => {
  const input = scenario();
  const greedy = run(new GreedyStrategy({ ait_enabled: true }), input);
  const gaml = run(new AbsolutePlusStrategy({ ait_enabled: true, beam_width: 8, max_local_branches: 8 }), input);
  assert.ok(gaml.final_value >= greedy.final_value - 0.01);
});

test("Absolute+ rejects invalid search settings", () => {
  assert.throws(() => new AbsolutePlusStrategy({ beam_width: 0 }), /beam_width/);
  assert.throws(() => new AbsolutePlusStrategy({ max_local_branches: 0 }), /max_local_branches/);
  assert.throws(() => new AbsolutePlusStrategy({ max_decisions: 0 }), /max_decisions/);
});

test("search strategies never place an eFD in an account without eFD capability", () => {
  const accounts = [
    new Account({ id: "a-main", bank_id: "BANK_A", bank_key: "bank_a", balance: 25000, supports_efd: false }),
    new Account({ id: "a-efd", bank_id: "BANK_A", bank_key: "bank_a", balance: 25000, supports_efd: true }),
    new Account({ id: "b-main", bank_id: "BANK_B", bank_key: "bank_b", balance: 25000, supports_efd: true })
  ];
  const options = [
    new FDOption({ label: "A standard", bank_id: "BANK_A", bank_key: "bank_a", period_str: "30d", annual_rate: 8, min_amount: 25000 }),
    new FDOption({ label: "A eFD", bank_id: "BANK_A", bank_key: "bank_a", period_str: "30d", annual_rate: 9, min_amount: 25000, is_efd: true }),
    new FDOption({ label: "B standard", bank_id: "BANK_B", bank_key: "bank_b", period_str: "30d", annual_rate: 7, min_amount: 25000 })
  ];
  const result = run(new AbsolutePlusStrategy({ beam_width: 16, max_local_branches: 16, ait_enabled: true }), {
    options, start: "2026-01-01", end: "2026-02-01", inflow_schedule: {},
    accounts, inflow_account_id: "a-main", fee_config: new TransferFeeConfig(),
    consolidation_account_id: "a-main", outflow_schedule: {}
  });
  const efdEligible = new Set(accounts.filter(account => account.supports_efd).map(account => account.id));
  assert.ok(result.bookings.some(booking => booking.option.is_efd));
  assert.ok(result.bookings.filter(booking => booking.option.is_efd).every(booking => efdEligible.has(booking.account_id)));
});

test("Absolute+ marks a search that reaches its configured state cap as unproven", () => {
  const result = run(new AbsolutePlusStrategy({ beam_width: 8, max_local_branches: 4, max_decisions: 1 }), scenario());
  assert.equal(result.search_diagnostics.expanded_states, 1);
  assert.ok(result.search_diagnostics.budget_frontier_states > 0);
  assert.equal(result.optimality_proven, false);
});

test("Absolute+ exposes bounded state-expansion reuse diagnostics", () => {
  const result = run(new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 8, max_local_branches: 8, max_decisions: 100
  }), scenario());
  const diagnostics = result.search_diagnostics;
  assert.ok(diagnostics.expansion_cache_size >= 0);
  assert.ok(diagnostics.calculation_cache.expansion.misses > 0);
  assert.ok(diagnostics.beam_duplicate_pruned >= 0);
});

test("Absolute+ computes and caches option-interest scores during local ranking", () => {
  const input = scenario();
  input.options.push(new FDOption({
    label: "Alternative 30d", bank_id: "BANK_A", bank_key: "bank_a",
    period_str: "30d", annual_rate: 11, min_amount: 25000
  }));
  const result = run(new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 8, max_local_branches: 8
  }), input);
  const cache = result.search_diagnostics.calculation_cache;
  assert.ok(cache.option_interest.misses > 0);
  assert.ok(cache.option_interest.misses > 0);
  assert.ok(cache.option_interest.hits >= 0);
});

test("scoped selection compares finance first and only replaces Greedy on a strategic tie-break", () => {
  const context = {
    consolidationId: "main",
    feeConfig: { getFee: () => 0 }
  };
  const result = ({ value, outstanding = 0, bookings = 0, transfers = 0 }) => ({
    valid: true,
    final_value: value,
    outstanding_outflows: outstanding ? [{ remaining: outstanding }] : [],
    accounts: {
      main: { id: "main", balance: value, bank_identity: "BANK_A" }
    },
    bookings: Array.from({ length: bookings }, () => ({})),
    timeline: transfers ? { events: Array.from({ length: transfers * 2 }, () => ({ type: "transfer" })) } : {}
  });

  const greedy = result({ value: 100, outstanding: 5, bookings: 2, transfers: 1 });
  assert.equal(compareScopedResults(result({ value: 101, bookings: 5, transfers: 3 }), greedy, context), 1);
  assert.equal(compareScopedResults(result({ value: 90, outstanding: 0 }), greedy, context), -1);

  // Equal net value: clearing more of the outstanding obligation is strategically better.
  assert.equal(compareScopedResults(result({ value: 95, outstanding: 0, bookings: 3 }), greedy, context), 1);

  const equalBaseline = result({ value: 100, bookings: 2, transfers: 1 });
  assert.equal(compareScopedResults(equalBaseline, equalBaseline, context), 0);
  assert.equal(compareScopedResults(result({ value: 100, bookings: 1 }), equalBaseline, context), 1);
  assert.equal(compareScopedResults(result({ value: 100, bookings: 3, transfers: 1 }), equalBaseline, context), -1);
  assert.equal(compareScopedResults({ valid: false }, equalBaseline, context), -1);
  assert.equal(compareScopedResults(equalBaseline, { valid: false }, context), 1);
});

test("Absolute R preserves the Greedy financial baseline", () => {
  const input = scenario();
  const greedy = run(new GreedyStrategy({ ait_enabled: true }), input);
  const absolute = run(new AbsoluteStrategy({ ait_enabled: true }), input);
  assert.equal(absolute.valid, true);
  assert.ok(absolute.final_value >= greedy.final_value - 0.01);
  assert.ok(["Absolute R", "Greedy"].includes(absolute.strategy_name));
  assert.equal(absolute.strategy_name, absolute.search_diagnostics.result_selection.selected);
  assert.ok(absolute.search_diagnostics.result_selection);
});

test("Absolute+ preserves a frontier and safely completes after its decision budget", () => {
  const input = scenario();
  const greedy = run(new GreedyStrategy({ ait_enabled: true }), input);
  const bounded = run(new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 8, max_local_branches: 4, max_decisions: 2
  }), input);
  assert.equal(bounded.valid, true);
  assert.equal(bounded.search_diagnostics.budget_stopped, true);
  assert.ok(bounded.search_diagnostics.budget_frontier_states > 0);
  assert.equal(bounded.optimality_proven, false);
  assert.ok(bounded.final_value >= greedy.final_value - 0.01);
  assert.ok(bounded.search_diagnostics.result_selection);
});

test("scoped state identity includes every future-relevant cash-flow field", () => {
  const state = {
    date: "2026-01-01",
    balances: [["account-a", 25000], ["account-b", 10000]],
    flows: [["2026-03-01", [["account-a", 26000]]]],
    obligations: [["outflow-a", "2026-02-01", 5000]],
    paid: 1200
  };
  assert.equal(searchStateKey(state), searchStateKey(JSON.parse(JSON.stringify(state))));
  const variants = [
    { ...state, date: "2026-01-02" },
    { ...state, balances: [["account-a", 24999], ["account-b", 10000]] },
    { ...state, flows: [["2026-03-02", [["account-a", 26000]]]] },
    { ...state, flows: [["2026-03-01", [["account-b", 26000]]]] },
    { ...state, flows: [["2026-03-01", [["account-a", 26001]]]] },
    { ...state, obligations: [["outflow-a", "2026-02-02", 5000]] },
    { ...state, obligations: [["outflow-b", "2026-02-01", 5000]] },
    { ...state, obligations: [["outflow-a", "2026-02-01", 5001]] },
    { ...state, paid: 1199 }
  ];
  for (const variant of variants) assert.notEqual(searchStateKey(variant), searchStateKey(state));
});


test("Absolute+ preserves earlier budget-checkpoint incumbents as the decision cap grows", () => {
  const input = budgetSensitivityScenario();
  const lowerBudget = run(new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 64, max_local_branches: 16, max_decisions: 500
  }), input);
  const higherBudget = run(new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 64, max_local_branches: 16, max_decisions: 1000
  }), input);

  assert.equal(lowerBudget.search_diagnostics.expanded_states, 500);
  assert.equal(higherBudget.search_diagnostics.expanded_states, 1000);
  assert.equal(lowerBudget.search_diagnostics.budget_frontier_checkpoints, 1);
  assert.equal(higherBudget.search_diagnostics.budget_frontier_checkpoints, 2);
  assert.ok(higherBudget.final_value >= lowerBudget.final_value - 0.01);
});
