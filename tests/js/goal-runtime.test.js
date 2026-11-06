import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { AbsolutePlusStrategy } from "../../src/strategies/absolute-plus.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
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
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", label: "Main", balance: 100000 })],
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

test("goal mode returns an explicit shortfall when no future events can advance it", () => {
  const result = new SimulationEngine().run(makeGoalStrategy(), input(1000000));
  assert.equal(result.valid, true);
  assert.equal(result.goal_outcome.achieved, false);
  assert.equal(result.goal_outcome.achievement_date, null);
  assert.equal(result.goal_outcome.stopping_reason, "no_future_events");
  assert.ok(result.goal_outcome.shortfall > 0);
  assert.equal(result.end_date.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(result.finalized, true);
});

test("Absolute goal search evaluates complete goal paths and reports exhaustive proof status", () => {
  const result = new SimulationEngine().run(new AbsoluteStrategy({ ait_enabled: true }), input(100));
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.optimality_proven, true);
  assert.ok(result.search_diagnostics.goal_candidates_evaluated >= 1);
  assert.equal(result.search_diagnostics.goal_objective, "earliest consolidation net-interest achievement");
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
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.ok(result.search_diagnostics.goal_candidates_evaluated >= 1);
  assert.equal(result.search_diagnostics.goal_search_budget, 80);
  assert.equal(result.search_diagnostics.goal_objective, "earliest consolidation net-interest achievement");
  assert.ok(result.search_diagnostics.selected_goal_score);
});

test("final consolidation at the last event can be the first goal-credit boundary", () => {
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
    new Account({ id: "reserve", bank_id: "BANK_A", bank_key: "a", label: "Reserve", balance: 100000 })
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

test("Greedy goal mode chooses the earliest credited-interest payout and responds to target size", () => {
  const scenario = input(1);
  scenario.options = [
    new FDOption({
      label: "High-rate annual cumulative", period_str: "1y", annual_rate: 15,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    }),
    new FDOption({
      label: "Lower-rate monthly cumulative", period_str: "30d", annual_rate: 5,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    })
  ];

  const smallTarget = new SimulationEngine().run(new GreedyStrategy({ ait_enabled: true }), scenario);
  assert.equal(smallTarget.goal_outcome.achieved, true);
  assert.equal(smallTarget.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(smallTarget.bookings[0].option.label, "Lower-rate monthly cumulative");
  assert.equal(smallTarget.end_date.toISOString().slice(0, 10), smallTarget.goal_outcome.achievement_date);

  const largerTarget = new SimulationEngine().run(
    new GreedyStrategy({ ait_enabled: true }),
    { ...scenario, simulation: { ...scenario.simulation, goal: { ...scenario.simulation.goal, target: 1000 } } }
  );
  assert.equal(largerTarget.goal_outcome.achieved, true);
  assert.ok(largerTarget.goal_outcome.elapsed_days > smallTarget.goal_outcome.elapsed_days);
  assert.equal(largerTarget.end_date.toISOString().slice(0, 10), largerTarget.goal_outcome.achievement_date);
});

test("Greedy goal mode consolidates other accounts into the goal account before earning interest", () => {
  const scenario = input(1);
  scenario.accounts = [
    new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 100000 }),
    new Account({ id: "reserve", bank_id: "BANK_A", bank_key: "a", balance: 100000 })
  ];
  scenario.inflow_account_id = "main";
  scenario.consolidation_account_id = "main";
  scenario.options = [
    new FDOption({
      label: "30-day cumulative", period_str: "30d", annual_rate: 5,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    }),
    new FDOption({
      label: "Annual cumulative", period_str: "1y", annual_rate: 15,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    })
  ];

  const result = new SimulationEngine().run(new GreedyStrategy({ ait_enabled: true }), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.bookings[0].principal, 200000,
    "the selected booking should include both accounts' balances after consolidation");
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
    assert.equal(result.goal_outcome.achieved, true);
    assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
    assert.equal(result.goal_outcome.elapsed_days, 30);
    assert.equal(result.finalized, true);
  }
});

test("Absolute+ waits for a near-term inflow when it enables an earlier goal payout", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-04-01",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 1000 } },
    options: [
      new FDOption({ label: "60d current", period_str: "60d", annual_rate: 20, min_amount: 100000, bank_id: "BANK_A", bank_key: "a" }),
      new FDOption({ label: "30d threshold", period_str: "30d", annual_rate: 10, min_amount: 150000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 100000 })],
    inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: { "2026-01-15": 100000 }
  };
  const result = new SimulationEngine().run(new AbsolutePlusStrategy({
    ait_enabled: false, beam_width: 2, max_local_branches: 2, max_decisions: 500
  }), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-02-14");
  assert.equal(result.bookings[0].option.label, "30d threshold");
  assert.equal(result.bookings[0].start.toISOString().slice(0, 10), "2026-01-15");
});

test("Absolute retains a fee-heavy consolidation path when it credits the goal sooner", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-03-10",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 500 } },
    options: [
      new FDOption({ label: "Reserve high-yield", period_str: "30d", annual_rate: 36.5, min_amount: 25000, bank_id: "BANK_B", bank_key: "b" }),
      new FDOption({ label: "Main low-yield", period_str: "30d", annual_rate: 1, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0 }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 100000 })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 1000, same_bank_fee: 0 })
  };
  const result = new SimulationEngine().run(new AbsoluteStrategy({ ait_enabled: false }), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.ok(result.credited_net_interest >= 500);
  assert.ok(result.total_transfer_fees >= 1000);
  assert.equal(result.optimality_proven, true);
});

test("Absolute+ goal ranking keeps the faster lower-interest payout under local truncation", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-03-10",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 700 } },
    options: [
      new FDOption({ label: "Fast 30d", period_str: "30d", annual_rate: 10, min_amount: 10000, bank_id: "BANK_A", bank_key: "a" }),
      new FDOption({ label: "Slow 60d", period_str: "60d", annual_rate: 20, min_amount: 10000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 100000 })],
    inflow_account_id: "main", consolidation_account_id: "main"
  };
  const result = new SimulationEngine().run(new AbsolutePlusStrategy({
    ait_enabled: false, beam_width: 4, max_local_branches: 2, max_decisions: 100
  }), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.bookings[0].option.label, "Fast 30d");
  assert.equal(result.optimality_proven, false);
});


test("Absolute+ local truncation retains an earlier low-interest goal path", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-04-01",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 500 } },
    options: [
      new FDOption({ label: "Fast eFD 30d", period_str: "30d", annual_rate: 10, min_amount: 25000, bank_id: "BANK_B", bank_key: "b", is_efd: true }),
      new FDOption({ label: "Slow standard 60d", period_str: "60d", annual_rate: 20, min_amount: 25000, bank_id: "BANK_B", bank_key: "b" }),
      new FDOption({ label: "Consolidation standard 60d", period_str: "60d", annual_rate: 20, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0, supports_efd: false }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 100000, supports_efd: true })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 0, same_bank_fee: 0 })
  };
  const engine = new SimulationEngine();
  const exhaustive = engine.run(new AbsoluteStrategy({ ait_enabled: false }), scenario);
  const bounded = engine.run(new AbsolutePlusStrategy({
    ait_enabled: false, beam_width: 32, max_local_branches: 2, max_decisions: 500
  }), scenario);
  assert.equal(exhaustive.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(bounded.goal_outcome.achievement_date, exhaustive.goal_outcome.achievement_date);
  assert.equal(bounded.bookings[0].option.label, "Fast eFD 30d");
  assert.ok(bounded.search_diagnostics.local_combination_pruned > 0);
  assert.equal(bounded.optimality_proven, false);
});



test("GSS keeps a directly goal-achieving path ahead of an earlier insufficient payout", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-04-01",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 3000 } },
    options: [
      new FDOption({ label: "Fast eFD 30d", period_str: "30d", annual_rate: 10, min_amount: 25000, bank_id: "BANK_B", bank_key: "b", is_efd: true }),
      new FDOption({ label: "Slow standard 60d", period_str: "60d", annual_rate: 20, min_amount: 25000, bank_id: "BANK_B", bank_key: "b" }),
      new FDOption({ label: "Consolidation standard 60d", period_str: "60d", annual_rate: 20, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0, supports_efd: false }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 100000, supports_efd: true })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 0, same_bank_fee: 0 })
  };
  const engine = new SimulationEngine();
  const greedy = engine.run(new GreedyStrategy({ ait_enabled: false }), scenario);
  const gss = engine.run(new GSSStrategy({ ait_enabled: false }), scenario);
  assert.equal(greedy.goal_outcome.achievement_date, "2026-03-02");
  assert.equal(gss.goal_outcome.achievement_date, "2026-03-02");
  assert.equal(gss.bookings[0].option.label, "Consolidation standard 60d");
});


test("GSS goal planning reserves source liquidity for strict outflows beyond the next maturity", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-03-10",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 5000 } },
    options: [
      new FDOption({ label: "Reserve high-yield", period_str: "30d", annual_rate: 36.5, min_amount: 25000, bank_id: "BANK_B", bank_key: "b" }),
      new FDOption({ label: "Main standard", period_str: "30d", annual_rate: 1, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0 }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 100000 })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    outflow_schedule: {
      "2026-02-15": [{ account_id: "reserve", amount: 50000, payment_policy: "strict" }]
    },
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 0, same_bank_fee: 0 })
  };
  const result = new SimulationEngine().run(new GSSStrategy({ ait_enabled: false }), scenario);
  assert.equal(result.valid, true, JSON.stringify({
    total_outflows_paid: result.total_outflows_paid,
    outstanding_outflows: result.outstanding_outflows,
    goal_outcome: result.goal_outcome,
    gss_diagnostics: result.gss_diagnostics,
    bookings: result.bookings.map(item => ({ option: item.option.label, principal: item.principal, start: item.start.toISOString().slice(0, 10) })),
    outflow_events: result.timeline[20260215]
  }));
  assert.equal(result.total_outflows_paid, 50000);
  assert.equal(result.outstanding_outflows.length, 0);
  assert.ok(result.timeline[20260215].some(event => event.event_type === "outflow" && event.amount === 50000));
});


test("GSS goal planning can use a scheduled source inflow to cover a later strict outflow", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-03-10",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 5000 } },
    options: [
      new FDOption({ label: "Reserve high-yield", period_str: "30d", annual_rate: 36.5, min_amount: 25000, bank_id: "BANK_B", bank_key: "b" }),
      new FDOption({ label: "Main standard", period_str: "30d", annual_rate: 1, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" })
    ],
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0 }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 100000 })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: { "2026-02-10": { reserve: 60000 } },
    outflow_schedule: {
      "2026-02-15": [{ account_id: "reserve", amount: 50000, payment_policy: "strict" }]
    },
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 0, same_bank_fee: 0 })
  };
  const result = new SimulationEngine().run(new GSSStrategy({ ait_enabled: false }), scenario);
  assert.equal(result.valid, true, JSON.stringify({
    total_outflows_paid: result.total_outflows_paid,
    outstanding_outflows: result.outstanding_outflows,
    accounts: result.accounts,
    goal_outcome: result.goal_outcome,
    gss_diagnostics: result.gss_diagnostics
  }));
  assert.equal(result.total_outflows_paid, 50000);
  assert.equal(result.outstanding_outflows.length, 0);
});


test("GSS waits for an earlier consolidation opportunity instead of rebooking interest elsewhere", () => {
  const scenario = {
    start: "2026-01-01", end: "2026-03-10",
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 1000 } },
    options: [
      new FDOption({
        label: "Reserve eFD", period_str: "30d", annual_rate: 36.5,
        min_amount: 25000, bank_id: "BANK_B", bank_key: "b", is_efd: true
      }),
      new FDOption({
        label: "Consolidation standard", period_str: "30d", annual_rate: 1,
        min_amount: 110000, bank_id: "BANK_A", bank_key: "a"
      })
    ],
    accounts: [
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 100000, supports_efd: true }),
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 0, supports_efd: false })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: { "2026-02-01": { main: 20000 } },
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 0, same_bank_fee: 0 })
  };
  const result = new SimulationEngine().run(new GSSStrategy({ ait_enabled: false }), scenario);
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-02-01", JSON.stringify({
    gss_diagnostics: result.gss_diagnostics,
    decision_log: result.decision_log,
    bookings: result.bookings.map(item => ({ option: item.option.label, start: item.start.toISOString().slice(0, 10), end: item.end.toISOString().slice(0, 10) }))
  }));
  assert.equal(result.gss_diagnostics.planner_stopped_on_goal, true);
  assert.ok(result.gss_diagnostics.goal_plan_evaluations > 0);
  assert.ok(result.credited_net_interest >= 1000);
  assert.equal(result.bookings[0].option.label, "Reserve eFD");
  assert.equal(result.bookings[1].option.label, "Consolidation standard");
});

test("Absolute+ applies a finite default decision budget in goal mode", () => {
  const result = new SimulationEngine().run(new AbsolutePlusStrategy({
    beam_width: 8, max_local_branches: 4, ait_enabled: true
  }), input(1));
  assert.equal(result.goal_outcome.achieved, true);
  assert.equal(result.goal_outcome.achievement_date, "2026-01-31");
  assert.equal(result.search_diagnostics.goal_search_budget, 5000);
  assert.ok(result.search_diagnostics.goal_candidates_evaluated >= 2);
  assert.ok(result.total_decisions_evaluated < 5000);
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
