import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { GSSStrategy } from "../../src/strategies/gss.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { LegacyGSSStrategy } from "../fixtures/legacy-gss-oracle.js";

const fd = (label, rate, min, period = "30d", bank = "BANK_A") => new FDOption({
  label, annual_rate: rate, min_amount: min, period_str: period,
  bank_id: bank, bank_key: bank.toLowerCase()
});
const account = (id, bank, balance, supports_efd = true) => new Account({
  id, bank_id: bank, bank_key: bank.toLowerCase(), balance, supports_efd
});

const scenarios = [
  {
    options: [fd("Future goal", 12, 25000)],
    start: "2026-01-01", end: "2026-03-15",
    accounts: [account("main", "BANK_A", 10000)],
    inflow_schedule: { "2026-02-01": { main: 20000 } }
  },
  {
    options: [
      fd("Parent goal", 20, 25000, "30d"),
      fd("Interim FD", 10, 24950, "10d")
    ],
    start: "2026-01-01", end: "2026-03-01",
    accounts: [account("main", "BANK_A", 24949)],
    inflow_schedule: {
      "2026-01-02": { main: 1 },
      "2026-01-20": { main: 100 }
    }
  },
  {
    options: [
      fd("Combined", 12, 25000, "30d", "BANK_A"),
      fd("Other bank", 12, 25000, "30d", "BANK_B")
    ],
    start: "2026-01-01", end: "2026-02-15",
    accounts: [account("a", "BANK_A", 15000), account("b", "BANK_B", 15000)],
    consolidation_account_id: "a",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 })
  },
  {
    options: [fd("One month", 10, 25000)],
    start: "2026-01-01", end: "2026-03-01",
    accounts: [account("main", "BANK_A", 30000)],
    outflow_schedule: {
      "2026-01-15": [{ name: "Expense", amount: 5000, account_id: "main", payment_policy: "strict" }]
    }
  }
];

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
    accounts: Object.fromEntries((result.accounts instanceof Map
      ? [...result.accounts.entries()] : Object.entries(result.accounts))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, value]) => [id, round(value.balance)])),
    bookings: result.bookings.map(booking => ({
      option: booking.option.label, principal: round(booking.principal),
      start: iso(booking.start), end: iso(booking.end), account_id: booking.account_id,
      cash_flows: booking.cash_flows.map(flow => ({ date: iso(flow.date), amount: round(flow.amount) }))
    })),
    events: Object.entries(result.timeline).sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([key, events]) => events.map(event => ({
        key: Number(key), type: event.event_type, date: iso(event.on_date),
        amount: round(event.amount), label: event.label, booking_ref: event.booking_ref,
        account_id: event.account_id, payment_policy: event.payment_policy,
        fee: round(event.fee), transfer_channel: event.transfer_channel,
        balance_after: round(event.balance_after),
        total_balance_after: round(event.total_balance_after),
        decision_context: event.decision_context
      }))),
    decision_log: result.decision_log,
    gss_diagnostics: result.gss_diagnostics
  };
}

for (const [index, input] of scenarios.entries()) {
  test("GSS shared-runtime replay matches legacy ledger scenario " + (index + 1), () => {
    const settings = { small_period_days: 30, ait_enabled: true };
    const legacy = new LegacyGSSStrategy(settings).simulate(input);
    const migrated = new SimulationEngine().runUnfinalized(new GSSStrategy(settings), input);
    assert.deepEqual(normalize(migrated), normalize(legacy));
  });
}
