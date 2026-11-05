import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { AbsolutePlusStrategy } from "../../src/strategies/absolute-plus.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { GSSStrategy } from "../../src/strategies/gss.js";
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
  assert.equal(result.goal_outcome.stopping_reason, "safety_horizon_reached");
  assert.ok(result.goal_outcome.shortfall > 0);
  assert.equal(result.end_date.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(result.finalized, true);
});

test("Absolute+ evaluates goal candidates against the Greedy baseline with bounded-search diagnostics", () => {
  const scenario = input(100);
  scenario.end = "2026-04-01";
  scenario.options.push(new FDOption({
    label: "60-day cumulative", period_str: "60d", annual_rate: 11,
    min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
  }));
  const result = new SimulationEngine().run(new AbsolutePlusStrategy({
    beam_width: 8, max_local_branches: 4, max_decisions: 80,
    ait_enabled: true
  }), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.ok(result.search_diagnostics.goal_candidates_evaluated >= 1);
  assert.equal(result.search_diagnostics.goal_objective, "earliest consolidation net-interest achievement");
  assert.ok(result.search_diagnostics.selected_goal_score);
});

test("maximum-date final consolidation can be the first goal-credit boundary", () => {
  let booked = false;
  const strategy = {
    name: "Reserve maturity",
    createSession() {
      return {
        nextSignal(view) {
          if (!booked) {
            booked = true;
            return createStrategyDecision({
              revision: view.revision, date: view.date,
              action: StrategyDecisionType.SPLIT,
              plan: { bookings: [{ account_id: "reserve", option_index: 0, principal: 100000 }], carries: [] }
            });
          }
          return createStrategyComplete({ revision: view.revision });
        }
      };
    }
  };
  const scenario = input(100);
  scenario.accounts = [
    new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0 }),
    new Account({ id: "reserve", bank_id: "BANK_A", bank_key: "a", balance: 100000 })
  ];
  scenario.inflow_account_id = "main";
  scenario.consolidation_account_id = "main";
  const result = new SimulationEngine().run(strategy, scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.goal_outcome.stopping_reason, "goal_achieved_on_final_consolidation");
  assert.equal(result.accounts.reserve.balance, 0);
  assert.ok(result.accounts.main.balance > 100000);
});

test("interest transferred to consolidation is counted before a same-signal reinvestment", () => {
  let stage = 0;
  const strategy = {
    name: "Transfer then reinvest",
    createSession() {
      return {
        nextSignal(view) {
          if (stage++ === 0) return createStrategyDecision({
            revision: view.revision, date: view.date,
            action: StrategyDecisionType.SPLIT,
            plan: { bookings: [{ account_id: "reserve", option_index: 0, principal: 100000 }], carries: [] }
          });
          const reserve = view.accounts.find(account => account.id === "reserve");
          return createStrategyDecision({
            revision: view.revision, date: view.date,
            action: StrategyDecisionType.CONSOLIDATE,
            plan: {
              target_account_id: "main", option_index: 0, principal: 25000,
              transfers: [{ source_account_id: "reserve", target_account_id: "main", amount: reserve.balance, fee: 0 }],
              carries: []
            }
          });
        }
      };
    }
  };
  const scenario = input(100);
  scenario.end = "2026-03-02";
  scenario.accounts = [
    new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0 }),
    new Account({ id: "reserve", bank_id: "BANK_A", bank_key: "a", balance: 100000 })
  ];
  scenario.inflow_account_id = "main";
  scenario.consolidation_account_id = "main";
  const result = new SimulationEngine().run(strategy, scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.ok(result.credited_net_interest >= 100);
  assert.ok(result.provenance.main.counted_interest > 0);
  assert.equal(result.end_date.toISOString().slice(0, 10), "2026-01-31");
});

test("Greedy and GSS use the same shared goal outcome and stopping contract", () => {
  for (const strategy of [
    new GreedyStrategy({ ait_enabled: true }),
    new GSSStrategy({ ait_enabled: true, small_period_days: 30 })
  ]) {
    const result = new SimulationEngine().run(strategy, input(1));
    assert.equal(result.valid, true);
    assert.equal(result.simulation_mode, "goal");
    assert.ok(result.goal_outcome);
    assert.ok(["goal_achieved", "safety_horizon_reached"].includes(result.goal_outcome.stopping_reason));
    assert.equal(result.finalized, true);
  }
});

test("goal termination excludes scheduled inflows after the achievement boundary", () => {
  const scenario = input(100);
  scenario.end = "2026-03-02";
  scenario.inflow_schedule = { "2026-02-15": { main: 50000 } };
  const result = new SimulationEngine().run(makeGoalStrategy(), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.total_principal, 100000);
  assert.equal(result.accounts.main.balance, 100000 + result.goal_outcome.actual);
});

test("invalid strict outflow execution is distinct from an unachieved goal", () => {
  const scenario = input(100);
  scenario.outflow_schedule = { "2026-01-01": [{ account_id: "main", amount: 150000, payment_policy: "strict" }] };
  const result = new SimulationEngine().run(makeGoalStrategy(), scenario);
  assert.equal(result.valid, false);
  assert.equal(result.goal_outcome.achieved, false);
  assert.equal(result.goal_outcome.stopping_reason, "simulation_invalid");
  assert.equal(result.goal_outcome.achievement_date, null);
});
