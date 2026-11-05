import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { GAMLStrategy } from "../../src/strategies/gaml.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { GSSStrategy } from "../../src/strategies/gss.js";

const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const iso = value => new Date(value).toISOString().slice(0, 10);

function makeScenario() {
  return {
    options: [
      new FDOption({
        label: "Baseline 30-day FD A", period_str: "30d", annual_rate: 12,
        min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
      }),
      new FDOption({
        label: "Baseline 30-day FD B", period_str: "30d", annual_rate: 12,
        min_amount: 25000, bank_id: "BANK_B", bank_key: "b"
      })
    ],
    start: "2026-01-01",
    end: "2026-03-15",
    accounts: [
      new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", label: "Main", balance: 20000 }),
      new Account({ id: "reserve", bank_id: "BANK_B", bank_key: "b", label: "Reserve", balance: 15000 })
    ],
    inflow_account_id: "main",
    consolidation_account_id: "main",
    inflow_schedule: { "2026-02-05": { main: 5000 } },
    outflow_schedule: {},
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 })
  };
}

function normalizeLedger(result) {
  const events = Object.values(result.timeline).flat().map(event => ({
    date: iso(event.on_date),
    type: event.event_type,
    amount: round(event.amount),
    account_id: event.account_id,
    booking_ref: event.booking_ref,
    fee: round(event.fee),
    transfer_channel: event.transfer_channel
  }));
  return {
    valid: result.valid,
    total_principal: round(result.total_principal),
    total_interest: round(result.total_interest),
    total_transfer_fees: round(result.total_transfer_fees),
    total_outflows_paid: round(result.total_outflows_paid),
    outstanding_outflows: result.outstanding_outflows.map(item => ({
      account_id: item.account_id, remaining: round(item.remaining),
      payment_policy: item.payment_policy
    })),
    accounts: Object.fromEntries(Object.entries(result.accounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, account]) => [id, round(account.balance)])),
    bookings: result.bookings.map(booking => ({
      account_id: booking.account_id,
      label: booking.option.label,
      start: iso(booking.start),
      end: iso(booking.end),
      principal: round(booking.principal),
      received: round(booking.total_received)
    })),
    events
  };
}

const strategies = [
  ["Greedy", () => new GreedyStrategy()],
  ["GAML", () => new GAMLStrategy({ beam_width: 8, max_local_branches: 4 })],
  ["Absolute", () => new AbsoluteStrategy({ max_local_branches: 4 })],
  ["GSS", () => new GSSStrategy()]
];

for (const [name, createStrategy] of strategies) {
  test(name + " produces a stable normalized baseline booking and event ledger", () => {
    const first = new SimulationEngine().run(createStrategy(), makeScenario());
    const second = new SimulationEngine().run(createStrategy(), makeScenario());
    assert.equal(first.finalized, true);
    assert.deepEqual(normalizeLedger(first), normalizeLedger(second));
    const ledger = normalizeLedger(first);
    assert.equal(ledger.events.filter(event => event.type === "simulation_start").length, 1);
    assert.ok(ledger.events.some(event => event.type === "booking"));
    assert.ok(ledger.bookings.length > 0);
    assert.ok(Number.isFinite(ledger.total_interest));
    assert.ok(Number.isFinite(ledger.total_transfer_fees));
  });
}
