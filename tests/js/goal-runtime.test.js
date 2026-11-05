import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import {
  createStrategyDecision, createStrategyComplete, StrategyDecisionType
} from "../../src/core/strategy-contracts.js";

function makeGoalStrategy() {
  let booked = false;
  return {
    name: "Goal test",
    createSession() {
      return {
        nextSignal(view) {
          if (!booked) {
            booked = true;
            return createStrategyDecision({
              revision: view.revision, date: view.date,
              action: StrategyDecisionType.SPLIT,
              plan: {
                bookings: [{ account_id: "main", option_index: 0, principal: 100000 }],
                carries: []
              }
            });
          }
          return createStrategyComplete({ revision: view.revision });
        }
      };
    }
  };
}

function input(target) {
  return {
    start: "2026-01-01", end: "2026-01-31",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target } },
    options: [new FDOption({
      label: "30-day cumulative", period_str: "30d", annual_rate: 10,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    })],
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 100000 })],
    inflow_account_id: "main", consolidation_account_id: "main",
    fee_config: new TransferFeeConfig()
  };
}

test("goal mode stops on the first maturity boundary that credits the target interest", () => {
  const result = new SimulationEngine().run(makeGoalStrategy(), input(100));
  assert.equal(result.valid, true);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.goal_outcome.elapsed_days, 30);
  assert.ok(result.goal_outcome.actual >= 100);
  assert.equal(result.end_date.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(result.finalized, true);
});

test("goal mode reaches the maximum boundary with explicit shortfall when target is unreachable", () => {
  const result = new SimulationEngine().run(makeGoalStrategy(), input(1000000));
  assert.equal(result.valid, true);
  assert.equal(result.goal_outcome.achieved, false);
  assert.equal(result.goal_outcome.achievement_date, null);
  assert.equal(result.goal_outcome.stopping_reason, "maximum_end_date_reached");
  assert.ok(result.goal_outcome.shortfall > 0);
  assert.equal(result.end_date.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(result.finalized, true);
});
