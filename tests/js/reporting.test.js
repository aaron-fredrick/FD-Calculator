import test from "node:test";
import assert from "node:assert/strict";
import { Account } from "../../src/core/models.js";
import { Event, EventType } from "../../src/core/events.js";
import { SimResult } from "../../src/core/results.js";
import { formatSimulation } from "../../src/reporting/console.js";
import { generateHtmlReport } from "../../src/reporting/html.js";

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


test("cash movement chart uses stable event-specific colors and separates FD principal, interest and AIT", () => {
  const account = { id: "main", bank_id: "BANK_A", label: "Main", balance: 1000, supports_efd: false };
  const booking = {
    account_id: "main", principal: 500, total_interest: 100,
    start: "2026-11-04", end: "2026-11-05", payout_type: "cumulative",
    cash_flows: [{ date: "2026-11-05", amount: 600 }],
    option: {
      label: "Test FD", is_efd: false, payout_period_str: "", annual_rate: 10,
      period_str: "1 year",
      applyAITToCashFlows: () => [{ date: "2026-11-05", amount: 590 }]
    }
  };
  const event = (event_type, on_date, amount, extra = {}) => ({
    event_type, on_date, amount, account_id: "main", balance_after: 1000,
    label: event_type, ...extra
  });
  const result = {
    strategy_name: "Test", start_date: "2026-11-04", end_date: "2026-11-05",
    timeline: {
      20261104: [
        event("inflow", "2026-11-04", 1000),
        event("booking", "2026-11-04", -500, { booking_ref: "FD-0001" }),
        event("transfer", "2026-11-04", 110, { fee: 10, label: "Transfer to destination" }),
        event("transfer", "2026-11-04", 100, { label: "Transfer received from source" })
      ],
      20261105: [
        event("maturity", "2026-11-05", 590, { booking_ref: "FD-0001" })
      ]
    },
    accounts: { main: account }, bookings: [booking],
    total_interest: 100, ait_withheld: 10, total_transfer_fees: 10,
    net_interest: 80, net_interest_after_ait: 90, final_value: 1090,
    total_principal: 500, total_outflows_paid: 0, outstanding_outflows: [],
    ait_enabled: true, ait_rate: 0.1
  };
  const config = {
    start: "2026-11-04", end: "2026-11-05", compound: false,
    actual_leap_year: true, accounts: [account], consolidation_account_id: "main",
    ait_enabled: true, ait_rate: 0.1,
    fee_config: { default_inter_bank_fee: 10, same_bank_fee: 0 },
    inflow_summaries: [], outflow_summaries: [], bank_registry: { BANK_A: { name: "Bank A" } }
  };
  const html = generateHtmlReport(result, config);
  const json = html.match(/<script id="fd-report-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, "report should embed chart data");
  const flows = JSON.parse(json).cashflows;
  const colors = Object.fromEntries(flows.map(flow => [flow.name, flow.color]));
  assert.equal(colors["Inflow (Deposits)"], "#82aaff");
  assert.equal(colors["Transfer Out (TF)"], "#ef7777");
  assert.equal(colors["Transfer In (TI)"], "#56d8e8");
  assert.equal(colors["FD Booking"], "#d78bfa");
  assert.equal(colors["FD Maturity (Principal)"], "#f08ab5");
  assert.equal(colors["FD Interest"], "#55c99a");
  assert.equal(colors.AIT, "#d55e00");
  assert.equal(flows.find(flow => flow.name === "Transfer Out (TF)").points[0].y, -100);
  assert.equal(flows.find(flow => flow.name === "Transfer Fees").points[0].y, -10);
  assert.equal(flows.find(flow => flow.name === "FD Maturity (Principal)").points[0].y, 500);
  assert.equal(flows.find(flow => flow.name === "FD Interest").points[0].y, 100);
  assert.equal(flows.find(flow => flow.name === "AIT").points[0].y, -10);
});


test("cash movement chart exposes cursor-anchored wheel zoom and reset controls", () => {
  const account = { id: "main", bank_id: "BANK_A", label: "Main", balance: 1000, supports_efd: false };
  const result = {
    strategy_name: "Test", start_date: "2026-11-04", end_date: "2026-11-05",
    timeline: {
      20261104: [{ event_type: "inflow", on_date: "2026-11-04", amount: 1000, account_id: "main", balance_after: 1000, label: "Deposit" }],
      20261105: [{ event_type: "outflow", on_date: "2026-11-05", amount: -100, account_id: "main", balance_after: 900, label: "Withdrawal" }]
    },
    accounts: { main: account }, bookings: [], total_interest: 0, ait_withheld: 0,
    total_transfer_fees: 0, net_interest: 0, final_value: 900, total_principal: 1000,
    total_outflows_paid: 100, outstanding_outflows: [], ait_enabled: false, ait_rate: 0
  };
  const config = {
    start: "2026-11-04", end: "2026-11-05", compound: false, actual_leap_year: true,
    accounts: [account], consolidation_account_id: "main", ait_enabled: false, ait_rate: 0,
    fee_config: { default_inter_bank_fee: 0, same_bank_fee: 0 }, inflow_summaries: [],
    outflow_summaries: [], bank_registry: { BANK_A: { name: "Bank A" } }
  };
  const html = generateHtmlReport(result, config);
  assert.ok(html.includes("e.shiftKey"));
  assert.ok(html.includes("e.altKey"));
  assert.ok(html.includes("passive:false"));
  assert.ok(html.includes("const anchor=v.xStart"));
  assert.ok(html.includes("Reset view"));
  assert.ok(html.includes("Shift + wheel scales vertically; Alt + wheel scales horizontally around the cursor"));
});
