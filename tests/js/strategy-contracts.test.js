import test from "node:test";
import assert from "node:assert/strict";
import {
  SimulationState, StrategyDecisionType, createStrategyDecision,
  createStrategyWait, createStrategyComplete, validateStrategySignal
} from "../../src/core/strategy-contracts.js";

const accounts = [
  { id: "main", bank_id: "BANK_A", bank_key: "a", label: "Main", balance: 1000, supports_efd: true },
  { id: "reserve", bank_id: "BANK_B", bank_key: "b", label: "Reserve", balance: 500, supports_efd: false }
];

test("planning views are immutable snapshots and do not expose authoritative account objects", () => {
  const state = new SimulationState(accounts);
  const view = state.planningView({ date: "2026-01-01", end_date: "2026-12-31" });
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.accounts), true);
  assert.equal(Object.isFrozen(view.accounts[0]), true);
  assert.throws(() => { view.accounts[0].balance = 0; }, TypeError);
  state.applyBalanceUpdates([{ account_id: "main", balance: 900 }], view.revision);
  assert.equal(view.accounts[0].balance, 1000);
  assert.equal(state.planningView({ date: "2026-01-02", end_date: "2026-12-31" }).accounts[0].balance, 900);
});

test("state updates validate atomically and reject stale revisions", () => {
  const state = new SimulationState(accounts);
  assert.throws(() => state.applyBalanceUpdates([
    { account_id: "main", balance: 0 }, { account_id: "missing", balance: 1 }
  ], 0), /unknown account/);
  assert.equal(state.planningView({ date: "2026-01-01", end_date: "2026-12-31" }).accounts[0].balance, 1000);
  state.applyBalanceUpdates([{ account_id: "main", balance: 900 }], 0);
  assert.throws(() => state.applyBalanceUpdates([{ account_id: "main", balance: 800 }], 0), /Stale state update/);
  assert.throws(() => state.applyBalanceUpdates([{ account_id: "main", balance: -1 }], 1), /finite and non-negative/);
});

test("decision, wait and completion signals are revision-bound and validated", () => {
  const decision = createStrategyDecision({
    revision: 2, date: "2026-01-01", action: StrategyDecisionType.SPLIT,
    plan: { bookings: [{ account_id: "main", option_id: "fd-30d" }], carries: ["reserve"] }
  });
  assert.equal(Object.isFrozen(decision.plan.bookings[0]), true);
  assert.equal(validateStrategySignal(decision, {
    revision: 2, current_date: "2026-01-01", end_date: "2026-12-31"
  }), decision);
  const mutableSignal = { ...decision, plan: { ...decision.plan } };
  assert.throws(() => validateStrategySignal(mutableSignal, {
    revision: 2, current_date: "2026-01-01", end_date: "2026-12-31"
  }), /must be immutable/);
  assert.throws(() => validateStrategySignal(decision, {
    revision: 3, current_date: "2026-01-01", end_date: "2026-12-31"
  }), /Stale strategy signal/);
  assert.throws(() => validateStrategySignal(decision, {
    revision: 2, current_date: "2026-01-02", end_date: "2026-12-31"
  }), /decision date/);

  const wait = createStrategyWait({ revision: 2, until: "2026-01-10" });
  assert.equal(validateStrategySignal(wait, {
    revision: 2, current_date: "2026-01-01", end_date: "2026-12-31"
  }), wait);
  assert.throws(() => validateStrategySignal(wait, {
    revision: 2, current_date: "2026-01-10", end_date: "2026-12-31"
  }), /after the current date/);
  const complete = createStrategyComplete({ revision: 2 });
  assert.equal(validateStrategySignal(complete, {
    revision: 2, current_date: "2026-01-01", end_date: "2026-12-31"
  }), complete);
});

test("planning views reject malformed dates and invalid pending obligations", () => {
  const state = new SimulationState(accounts);
  assert.throws(() => state.planningView({
    date: "2026-02-30", end_date: "2026-12-31"
  }), /valid YYYY-MM-DD/);
  assert.throws(() => state.planningView({
    date: "2026-01-01", end_date: "2026-12-31",
    pending_outflows: [{ account_id: "unknown", remaining: 10 }]
  }), /unknown account/);
  assert.throws(() => state.planningView({
    date: "2026-01-01", end_date: "2026-12-31",
    pending_outflows: [{ account_id: "main", remaining: Number.NaN }]
  }), /finite and positive/);
  assert.throws(() => state.planningView({
    date: "2026-01-01", end_date: "2026-12-31",
    scheduled_dates: ["not-a-date"]
  }), /valid YYYY-MM-DD/);
});
