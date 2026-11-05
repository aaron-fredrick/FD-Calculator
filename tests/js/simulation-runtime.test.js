import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { createSimulationContext } from "../../src/core/simulation-context.js";
import { SimulationRuntime } from "../../src/core/simulation-runtime.js";
import {
  createStrategyDecision, StrategyDecisionType
} from "../../src/core/strategy-contracts.js";

function makeRuntime() {
  const context = createSimulationContext({
    start: "2026-01-01", end: "2026-03-31",
    options: [
      new FDOption({
        label: "Bank A 30d", period_str: "30d", annual_rate: 10,
        min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
      }),
      new FDOption({
        label: "Bank B 30d", period_str: "30d", annual_rate: 10,
        min_amount: 25000, bank_id: "BANK_B", bank_key: "b"
      })
    ],
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 10000 }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", balance: 30000 })
    ],
    inflow_account_id: "main", consolidation_account_id: "main",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 })
  });
  const runtime = new SimulationRuntime(context, { strategy_name: "Test" });
  runtime.processDate(runtime.nextEventDate());
  return runtime;
}

test("shared runtime executes validated consolidation transfers and bookings", () => {
  const runtime = makeRuntime();
  const view = runtime.planningView();
  const signal = createStrategyDecision({
    revision: view.revision, date: "2026-01-01",
    action: StrategyDecisionType.CONSOLIDATE,
    plan: {
      target_account_id: "main", option_index: 0, principal: 39970,
      transfers: [{ source_account_id: "reserve", target_account_id: "main", amount: 30000, fee: 30 }],
      carries: []
    }
  });
  runtime.executeSignal(signal);
  const after = runtime.planningView();
  assert.equal(after.accounts.find(account => account.id === "main").balance, 0);
  assert.equal(after.accounts.find(account => account.id === "reserve").balance, 0);
  assert.equal(runtime.bookings.length, 1);
  assert.equal(runtime.totalFees, 30);
  assert.equal(runtime.timeline[20260101].filter(event => event.event_type === "transfer").length, 2);
  assert.equal(runtime.timeline[20260101].filter(event => event.event_type === "booking").length, 1);
});

test("invalid compound decision leaves balances, ledger, bookings and fees unchanged", () => {
  const runtime = makeRuntime();
  const view = runtime.planningView();
  const signal = createStrategyDecision({
    revision: view.revision, date: "2026-01-01",
    action: StrategyDecisionType.CONSOLIDATE,
    plan: {
      target_account_id: "main", option_index: 99, principal: 39970,
      transfers: [{ source_account_id: "reserve", target_account_id: "main", amount: 30000, fee: 30 }],
      carries: []
    }
  });
  const before = runtime.planningView();
  const eventsBefore = Object.values(runtime.timeline).flat().length;
  assert.throws(() => runtime.executeSignal(signal), /invalid FD option index/);
  const after = runtime.planningView();
  assert.deepEqual(after.accounts, before.accounts);
  assert.equal(runtime.totalFees, 0);
  assert.equal(runtime.bookings.length, 0);
  assert.equal(Object.values(runtime.timeline).flat().length, eventsBefore);
});

test("shared runtime processes inflows and outflows before exposing planning state", () => {
  const context = createSimulationContext({
    start: "2026-01-01", end: "2026-02-28",
    options: [new FDOption({
      label: "Bank A 30d", period_str: "30d", annual_rate: 10,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    })],
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 1000 })],
    inflow_schedule: { "2026-01-01": 5000 },
    outflow_schedule: {
      "2026-01-01": [{ account_id: "main", amount: 500, payment_policy: "strict" }]
    }
  });
  const runtime = new SimulationRuntime(context);
  runtime.processDate(runtime.nextEventDate());
  const view = runtime.planningView();
  assert.equal(view.accounts[0].balance, 5500);
  assert.equal(runtime.totalOutflowsPaid, 500);
  assert.equal(view.pending_outflows.length, 0);
});
