import test from "node:test";
import assert from "node:assert/strict";
import { compareGoalScores } from "../../src/strategies/search-strategy-base.js";

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
