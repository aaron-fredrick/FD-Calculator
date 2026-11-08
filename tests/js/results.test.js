import test from "node:test";
import assert from "node:assert/strict";
import { Event, EventType, normalizeInflowSchedule } from "../../src/core/events.js";
import { Booking, SimResult } from "../../src/core/results.js";
import { FDOption } from "../../src/core/models.js";

test("events normalize dates and expose canonical integer date keys", () => {
  const event = new Event({ event_type: EventType.INFLOW, on_date: "2026-11-04", amount: 100, account_id: "a" });
  assert.equal(event.date_key, 20261104);
  assert.equal(event.on_date.toISOString().slice(0, 10), "2026-11-04");
});

test("inflow schedules normalize scalar and account-targeted entries", () => {
  assert.deepEqual(normalizeInflowSchedule({ "2026-01-01": 100, "2026-02-01": { a: 50, b: 25 } }, "main"), {
    "2026-01-01": { main: 100 }, "2026-02-01": { a: 50, b: 25 }
  });
});

test("booking and simulation result accounting apply AIT and transfer fees", () => {
  const option = new FDOption({ label: "6m", period_str: "6m", annual_rate: 10 });
  const booking = new Booking({ option, principal: 100000, start: "2026-01-01", cash_flows: [{ date: "2026-07-01", amount: 105000 }] });
  const result = new SimResult({
    strategy_name: "Greedy", bookings: [booking], total_principal: 100000,
    end_date: "2026-07-01", total_transfer_fees: 30, ait_enabled: true,
    accounts: { a: { balance: 500 } }
  });
  assert.equal(result.total_interest, 5000);
  assert.equal(result.ait_withheld, 500);
  assert.equal(result.net_interest, 4470);
  assert.equal(result.final_value, 104470);
  assert.equal(result.cash_retained, 500);
});

test("invalid event and booking financial values are rejected", () => {
  assert.throws(() => new Event({ event_type: "not-an-event", on_date: "2026-01-01", amount: 1 }), /Unknown event type/);
  const option = new FDOption({ label: "1m", period_str: "1m", annual_rate: 8 });
  assert.throws(() => new Booking({ option, principal: 0, start: "2026-01-01", cash_flows: [{ date: "2026-02-01", amount: 1 }] }), /positive/);
});

test("result exposes distinct pre-withdrawal and closing-position metrics", () => {
  const result = new SimResult({
    strategy_name: "Greedy",
    total_principal: 100000,
    end_date: "2026-12-31",
    accounts: { a: { balance: 60000 } },
    total_outflows_paid: 40000,
    outstanding_outflows: []
  });
  assert.equal(result.contributed_capital, 100000);
  assert.equal(result.pre_withdrawal_value, 100000);
  assert.equal(result.total_outflows_paid, 40000);
  assert.equal(result.closing_assets, 60000);
  assert.equal(result.outstanding_liabilities, 0);
  assert.equal(result.closing_net_worth, 60000);
});

test("closing net worth deducts deferred and partially unpaid outflows", () => {
  const deferred = new SimResult({
    strategy_name: "Greedy", total_principal: 100000, end_date: "2026-12-31",
    accounts: { a: { balance: 100000 } },
    outstanding_outflows: [{ name: "rent", remaining: 120000 }]
  });
  assert.equal(deferred.closing_assets, 100000);
  assert.equal(deferred.outstanding_liabilities, 120000);
  assert.equal(deferred.closing_net_worth, -20000);

  const partial = new SimResult({
    strategy_name: "Greedy", total_principal: 100000, end_date: "2026-12-31",
    accounts: { a: { balance: 0 } }, total_outflows_paid: 100000,
    outstanding_outflows: [{ name: "rent", remaining: 20000 }]
  });
  assert.equal(partial.total_outflows_paid, 100000);
  assert.equal(partial.closing_assets, 0);
  assert.equal(partial.closing_net_worth, -20000);
});
