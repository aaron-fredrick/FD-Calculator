import test from "node:test";
import assert from "node:assert/strict";
import { FDOption } from "../../src/core/models.js";
import {
  compareGoalScores, createPathReplayStrategy, evaluateGoalPath,
  goalSearchStateKey, selectSearchOptions
} from "../../src/strategies/search-strategy-base.js";

const score = overrides => ({
  achieved: false, elapsed_days: Infinity, actual: 0, fees: 0,
  operations: 0, terminal_value: 0, signature: "", ...overrides
});

test("goal ranking prefers achievement over every non-achieving candidate", () => {
  assert.ok(compareGoalScores(score({ achieved: true, elapsed_days: 30, actual: 100 }), score({ actual: 100000 })) > 0);
});

test("goal ranking prefers the earliest achievement date", () => {
  assert.ok(compareGoalScores(score({ achieved: true, elapsed_days: 30 }), score({ achieved: true, elapsed_days: 60 })) > 0);
});

test("same-day achievers rank by credited interest, fees, then operation count", () => {
  const baseline = score({ achieved: true, elapsed_days: 30, actual: 100, fees: 20, operations: 4 });
  assert.ok(compareGoalScores(score({ ...baseline, actual: 101 }), baseline) > 0);
  assert.ok(compareGoalScores(score({ ...baseline, fees: 10 }), baseline) > 0);
  assert.ok(compareGoalScores(score({ ...baseline, operations: 2 }), baseline) > 0);
});

test("non-achievers rank by credited net interest at the maximum boundary", () => {
  assert.ok(compareGoalScores(score({ actual: 500 }), score({ actual: 400 })) > 0);
});

test("terminal value and stable signature are deterministic final tie-breakers", () => {
  const a = score({ achieved: true, elapsed_days: 30, actual: 100, fees: 10, operations: 2, terminal_value: 1000, signature: "a" });
  const b = score({ ...a, terminal_value: 900, signature: "b" });
  assert.ok(compareGoalScores(a, b) > 0);
  assert.ok(compareGoalScores(score({ ...a, signature: "a" }), score({ ...a, signature: "b" })) > 0);
});

test("goal candidate replay inherits the strategy's financial and runtime settings", () => {
  const settings = {
    compound: true, actual_leap_year: false, ait_enabled: true, ait_rate: 0.08,
    outflow_account_tiebreak: true, outflow_due_date_sort: "string",
    round_balances: true, opening_trigger_always: true
  };
  const replay = createPathReplayStrategy([], { options: [] }, settings);
  for (const [key, value] of Object.entries(settings)) assert.equal(replay[key], value);
});

test("invalid hypothetical goal candidates are rejected without aborting the search", () => {
  const invalid = evaluateGoalPath([], {}, 0, {});
  assert.equal(invalid.invalid_candidate, true);
  assert.equal(invalid.achieved, false);
  assert.equal(invalid.actual, -Infinity);
  assert.ok(invalid.invalid_reason);
  const valid = score({ achieved: false, actual: 10 });
  assert.ok(compareGoalScores(valid, invalid) > 0);
});


test("goal search retains longer products that scoped dominance pruning would remove", () => {
  const shorter = new FDOption({
    label: "Shorter", period_str: "6m", annual_rate: 12,
    min_amount: 10000, bank_id: "BANK_A", bank_key: "a"
  });
  const longer = new FDOption({
    label: "Longer", period_str: "12m", annual_rate: 10,
    min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
  });
  assert.deepEqual(selectSearchOptions([shorter, longer], { mode: "scoped" }), [shorter]);
  assert.deepEqual(selectSearchOptions([shorter, longer], { mode: "goal" }), [shorter, longer]);
});

test("goal beam state identity preserves distinct decision histories with equal scalar state", () => {
  const state = {
    date: "2026-06-01", balances: [["a", 100000]], flows: [],
    obligations: [], paid: 0
  };
  const firstPath = [{
    date: "2026-01-01",
    action: { type: "local", bookings: [{ account_id: "a", option: { economic_terms_key: "term-a" }, principal: 100000 }], carries: [] }
  }];
  const secondPath = [{
    date: "2026-01-01",
    action: { type: "local", bookings: [{ account_id: "a", option: { economic_terms_key: "term-b" }, principal: 100000 }], carries: [] }
  }];
  assert.notEqual(goalSearchStateKey(state, firstPath), goalSearchStateKey(state, secondPath));
  assert.equal(goalSearchStateKey(state, firstPath), goalSearchStateKey(state, firstPath));
});
