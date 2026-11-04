import test from "node:test";
import assert from "node:assert/strict";
import { Account } from "../../src/core/models.js";
import { Event, EventType } from "../../src/core/events.js";
import { SimResult } from "../../src/core/results.js";
import { formatSimulation } from "../../src/reporting/console.js";

test("unsigned carry-forward amounts align numerically with signed timeline amounts", () => {
  const account = new Account({ id: "main", bank_id: "BANK_A", bank_key: "bank_a", label: "Main", balance: 10030 });
  const inflow = new Event({
    event_type: EventType.INFLOW, on_date: "2026-11-04", amount: 11000,
    label: "Inflow 01", account_id: "main", balance_after: 21030
  });
  const carry = new Event({
    event_type: EventType.CARRY_FORWARD, on_date: "2026-11-04", amount: 10030,
    label: "Holding liquidity; balance 10030.00 carries forward",
    account_id: "main", balance_after: 10030
  });
  const result = new SimResult({
    strategy_name: "GAML", timeline: { 20261104: [inflow, carry] },
    accounts: { main: account }, total_principal: 21030, end_date: "2026-11-04"
  });
  const config = {
    start: "2026-11-04", end: "2026-11-04", compound: false,
    actual_leap_year: true, accounts: [account], ait_enabled: false,
    ait_rate: 0.10, fee_config: { default_inter_bank_fee: 25, same_bank_fee: 0 },
    inflow_summaries: [], outflow_summaries: []
  };
  const output = formatSimulation(result, config, "scenario.json", "fd_options.csv", {
    color: false, showEventTimeline: true, showBookingLedger: false
  });
  const inflowLine = output.split("\n").find(line => line.includes("INFLOW"));
  const carryLine = output.split("\n").find(line => line.includes("CARRY FORWARD"));
  assert.ok(inflowLine);
  assert.ok(carryLine);
  assert.equal(inflowLine.indexOf("11,000.00"), carryLine.indexOf("10,030.00"));
});
