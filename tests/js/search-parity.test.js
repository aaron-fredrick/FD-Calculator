import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { GAMLStrategy } from "../../src/strategies/gaml.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { LegacySearchStrategyBase } from "../fixtures/legacy-search-oracle.js";

function scenario() {
  return {
    options: [
      new FDOption({
        label: "30d cumulative", period_str: "30d", annual_rate: 10,
        min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
      }),
      new FDOption({
        label: "45d periodic", period_str: "45d", annual_rate: 11,
        min_amount: 25000, payout_type: "periodic_interest",
        payout_period_str: "15d", bank_id: "BANK_A", bank_key: "a"
      })
    ],
    start: "2026-01-01", end: "2026-03-15",
    accounts: [new Account({
      id: "main", bank_id: "BANK_A", bank_key: "a", balance: 30000
    })],
    inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: { "2026-01-20": 5000 },
    outflow_schedule: {
      "2026-02-10": [{ account_id: "main", amount: 1000, name: "Deferred bill", payment_policy: "defer" }]
    },
    fee_config: new TransferFeeConfig(), ait_enabled: true
  };
}

function multiAccountScenario() {
  return {
    options: [
      new FDOption({
        label: "Bank A 30d", period_str: "30d", annual_rate: 20,
        min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
      }),
      new FDOption({
        label: "Bank B 30d", period_str: "30d", annual_rate: 20,
        min_amount: 25000, bank_id: "BANK_B", bank_key: "b"
      })
    ],
    start: "2026-01-01", end: "2026-03-15",
    accounts: [
      new Account({ id: "a", bank_id: "BANK_A", bank_key: "a", balance: 30000 }),
      new Account({ id: "b", bank_id: "BANK_B", bank_key: "b", balance: 30000 })
    ],
    inflow_account_id: "a", consolidation_account_id: "a",
    inflow_schedule: {}, outflow_schedule: {},
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 })
  };
}

const iso = value => new Date(value).toISOString().slice(0, 10);
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function normalize(result) {
  return {
    valid: result.valid,
    total_principal: round(result.total_principal),
    total_interest: round(result.total_interest),
    total_transfer_fees: round(result.total_transfer_fees),
    total_outflows_paid: round(result.total_outflows_paid),
    outstanding_outflows: result.outstanding_outflows.map(item => ({
      name: item.name, account_id: item.account_id, remaining: round(item.remaining),
      payment_policy: item.payment_policy, due_date: iso(item.due_date)
    })),
    accounts: Object.fromEntries(Object.entries(result.accounts).sort(([a], [b]) => a.localeCompare(b))
      .map(([id, account]) => [id, round(account.balance)])),
    bookings: result.bookings.map(booking => ({
      option: booking.option.label, principal: round(booking.principal),
      start: iso(booking.start), end: iso(booking.end), account_id: booking.account_id,
      cash_flows: booking.cash_flows.map(flow => ({ date: iso(flow.date), amount: round(flow.amount) }))
    })),
    events: Object.entries(result.timeline).sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([key, events]) => events.map(event => ({
        key: Number(key), type: event.event_type, date: iso(event.on_date),
        amount: round(event.amount), label: event.label, booking_ref: event.booking_ref,
        account_id: event.account_id, fee: round(event.fee),
        transfer_channel: event.transfer_channel,
        balance_after: round(event.balance_after),
        total_balance_after: round(event.total_balance_after),
        decision_context: event.decision_context
      }))),
    decision_log: result.decision_log,
    total_decisions_evaluated: result.total_decisions_evaluated,
    alternative_leaf_net_interests: result.alternative_leaf_net_interests,
    search_diagnostics: Object.fromEntries(
      Object.entries(result.search_diagnostics).filter(([key]) =>
        !["calculation_cache", "result_selection", "budget_stopped", "budget_frontier_states", "state_memo_size", "state_memo_hits", "state_memo_evictions", "raw_state_memo", "bound_pruned", "memo_pruned", "leaves", "local_branches_generated", "consolidation_branches_generated", "candidate_states_generated", "candidate_state_duplicates"].includes(key)
      )
    ),
    optimality_proven: result.optimality_proven,
    search_settings: result.search_settings
  };
}

for (const [name, Strategy, mode, settings] of [
  ["GAML", GAMLStrategy, "gaml", { beam_width: 8, max_local_branches: 4, max_decisions: 500 }],
  ["Absolute", AbsoluteStrategy, "absolute", { max_local_branches: 2 }]
]) {
  test(name + " session replay matches the pre-refactor execution ledger and diagnostics", () => {
    const input = scenario();
    const legacy = new LegacySearchStrategyBase({ ...settings, ait_enabled: true }, mode).simulate(input);
    const migrated = new SimulationEngine().runUnfinalized(new Strategy({ ...settings, ait_enabled: true }), input);
    assert.deepEqual(normalize(migrated), normalize(legacy));
  });
  test(name + " keeps Greedy when an equal multi-account candidate is not strategically better", () => {
    const input = multiAccountScenario();
    const legacy = new LegacySearchStrategyBase({ ...settings, ait_enabled: true }, mode).simulate(input);
    const migrated = new SimulationEngine().runUnfinalized(new Strategy({ ...settings, ait_enabled: true }), input);
    const actual = normalize(migrated);
    const expected = normalize(legacy);
    assert.ok(legacy.bookings.length >= 1);
    assert.equal(migrated.search_diagnostics.result_selection.selected, "Greedy");
    assert.equal(migrated.strategy_name, "Greedy");
    for (const field of [
      "valid", "total_principal", "total_interest", "total_transfer_fees",
      "total_outflows_paid", "outstanding_outflows", "accounts", "bookings"
    ]) {
      assert.deepEqual(actual[field], expected[field], field);
    }
  });
}
