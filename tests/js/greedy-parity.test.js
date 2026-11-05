import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { LegacyGreedyStrategy } from "../fixtures/legacy-greedy-oracle.js";

const date = value => new Date(value).toISOString().slice(0, 10);
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function scenario() {
  const options = [
    new FDOption({ label: "A 30d cumulative", period_str: "30d", annual_rate: 10, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" }),
    new FDOption({ label: "A 60d cumulative", period_str: "60d", annual_rate: 11, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" }),
    new FDOption({ label: "B 30d periodic", period_str: "30d", annual_rate: 9.5, min_amount: 25000, payout_type: "periodic_interest", payout_period_str: "15d", bank_id: "BANK_B", bank_key: "b" }),
    new FDOption({ label: "B 60d cumulative", period_str: "60d", annual_rate: 10.5, min_amount: 25000, bank_id: "BANK_B", bank_key: "b" })
  ];
  const accounts = [
    new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", label: "Main", balance: 30000 }),
    new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", label: "Reserve", balance: 40000 })
  ];
  return {
    options, start: "2026-01-01", end: "2026-04-01", accounts,
    inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: {
      "2026-01-15": { main: 10000 },
      "2026-02-15": { reserve: 20000 }
    },
    outflow_schedule: {
      "2026-01-20": [{ account_id: "main", amount: 1000, name: "Deferred bill", payment_policy: "defer" }],
      "2026-02-10": [{ account_id: "reserve", amount: 500, name: "Partial bill", payment_policy: "best_effort" }],
      "2026-03-05": [{ account_id: "main", amount: 15000, name: "Strict bill", payment_policy: "strict" }]
    },
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 }),
    ait_enabled: true
  };
}

function normalize(result) {
  const events = Object.entries(result.timeline).sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([key, values]) => values.map(event => ({
      key: Number(key), type: event.event_type, date: date(event.on_date),
      amount: round(event.amount), label: event.label, booking_ref: event.booking_ref,
      account_id: event.account_id, payment_policy: event.payment_policy,
      bank_key: event.bank_key, bank_id: event.bank_id, fee: round(event.fee),
      transfer_channel: event.transfer_channel,
      balance_after: round(event.balance_after),
      total_balance_after: round(event.total_balance_after),
      decision_context: event.decision_context
    })));
  const bookings = result.bookings.map(booking => ({
    option: {
      label: booking.option.label, period_str: booking.option.period_str,
      annual_rate: booking.option.annual_rate, payout_type: booking.option.payout_type,
      payout_period_str: booking.option.payout_period_str
    },
    principal: round(booking.principal), start: date(booking.start), end: date(booking.end),
    account_id: booking.account_id,
    cash_flows: booking.cash_flows.map(flow => ({ date: date(flow.date), amount: round(flow.amount) }))
  }));
  return {
    valid: result.valid, total_principal: round(result.total_principal),
    total_interest: round(result.total_interest), total_transfer_fees: round(result.total_transfer_fees),
    total_outflows_paid: round(result.total_outflows_paid),
    outstanding_outflows: result.outstanding_outflows.map(item => ({
      name: item.name, account_id: item.account_id, remaining: round(item.remaining),
      payment_policy: item.payment_policy, due_date: date(item.due_date)
    })),
    accounts: Object.fromEntries(Object.entries(result.accounts).sort(([a], [b]) => a.localeCompare(b))
      .map(([id, account]) => [id, round(account.balance)])),
    bookings, events
  };
}

test("Greedy session migration matches the pre-refactor execution ledger", () => {
  const input = scenario();
  const legacy = new LegacyGreedyStrategy({ ait_enabled: true }).simulate(input);
  const migrated = new GreedyStrategy({ ait_enabled: true }).simulate(input);
  assert.deepEqual(normalize(migrated), normalize(legacy));
});
