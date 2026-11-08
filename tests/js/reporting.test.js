import test from "node:test";
import assert from "node:assert/strict";
import { Account } from "../../src/core/models.js";
import { Event, EventType } from "../../src/core/events.js";
import { SimResult } from "../../src/core/results.js";
import { formatSimulation } from "../../src/reporting/console.js";
import { generateHtmlReport, formatProductEligibility } from "../../src/reporting/html.js";

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
  assert.ok(html.includes("const minRadius=nonZeroMagnitudes.length?Math.min(...nonZeroMagnitudes):maxAbs"));
  assert.ok(html.includes("const nextRadius=clamp(v.yMax*factor,minRadius,maxAbs)"));
  assert.ok(html.includes("state.yMin=-nextRadius;state.yMax=nextRadius"));
  assert.ok(html.includes("const yRadius=state.yMax==null?maxAbs:clamp(state.yMax,minRadius,maxAbs)"));
  assert.ok(html.includes('isZero?"#a8bacd"'));
  assert.ok(!html.includes("const range=v.yMax-v.yMin,anchor="));
  assert.ok(html.includes("Reset view"));
  assert.ok(html.includes("chart-zoom-controls"));
  assert.ok(html.includes("pointermove"));
  assert.ok(html.includes("font-size:15px"));
  assert.ok(html.includes("min-height:44px"));
  assert.ok(html.includes('classList.add("has-chart-reset")'));
  assert.ok(html.includes("canvas.parentElement.appendChild(reset)"));
  assert.ok(html.includes('reset.className="chart-reset"'));
  assert.ok(html.includes(".chart-panel .chart-reset{position:absolute;top:12px;right:14px"));
  assert.ok(html.includes("Shift + wheel scales vertically; Alt + wheel scales horizontally around the cursor"));
});


test("report layout, decision accents, maturity colors and chart hover controls stay consistent", () => {
  const account = { id: "main", bank_id: "BANK_A", label: "Main", balance: 1000, supports_efd: false };
  const booking = {
    account_id: "main", bank_id: "BANK_A", principal: 500, total_interest: 50,
    start: "2026-11-04", end: "2027-11-04", payout_type: "cumulative",
    cash_flows: [{ date: "2027-11-04", amount: 550 }],
    option: { label: "Bank A FD", bank_identity: "BANK_A", annual_rate: 10 }
  };
  const result = {
    strategy_name: "Test", start_date: "2026-11-04", end_date: "2026-11-05",
    timeline: {
      20261104: [{ event_type: "inflow", on_date: "2026-11-04", amount: 100,
        account_id: "main", balance_after: 1100, label: "Deposit" }]
    },
    accounts: { main: account }, bookings: [booking], total_interest: 50,
    ait_withheld: 0, total_transfer_fees: 0, net_interest: 50, final_value: 1150,
    total_principal: 1000, total_outflows_paid: 0, outstanding_outflows: [],
    ait_enabled: false, ait_rate: 0
  };
  const config = {
    start: "2026-11-04", end: "2026-11-05", compound: false, actual_leap_year: true,
    accounts: [account], consolidation_account_id: "main", ait_enabled: false, ait_rate: 0,
    fee_config: { default_inter_bank_fee: 0, same_bank_fee: 0 },
    inflow_summaries: [], outflow_summaries: [], bank_registry: { BANK_A: { name: "Bank A" } }
  };
  const html = generateHtmlReport(result, config);
  const json = html.match(/<script id="fd-report-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, "report should embed chart data");
  const charts = JSON.parse(json);
  assert.equal(charts.maturities[0].color, charts.fd_principal[0].color);
  assert.match(html, /style="--decision-color:rgb\(130,170,255\)"/);
  assert.ok(html.includes("min(100%,150px)"), "overview tiles should use a compact responsive minimum width");
  assert.ok(html.includes("var(--decision-color,var(--blue))"), "decision accent should use event-derived color");
  assert.ok(html.includes("const candidates=[[8,8],[maxX,8],[8,maxY],[maxX,maxY]]"), "hover detail should choose a corner away from the pointer");
  assert.ok(html.includes("function returnsChart(canvas,items)"));
  assert.ok(html.includes("item._fdHidden=!item._fdHidden;returnsChart(canvas,items)"), "pie legend should support series visibility toggles");
  assert.ok(html.includes("const items=(data.returns||[]).filter(v=>!v._fdHidden)"), "pie hover should track visible slices only");
});

test("goal reports show the canonical consolidation-interest outcome and event progression", () => {
  const account = new Account({ id: "main", bank_id: "BANK_A", bank_key: "bank_a", label: "Main", balance: 1100 });
  const credit = new Event({
    event_type: EventType.MATURITY, on_date: "2026-12-01", amount: 1100,
    label: "Maturity [FD-0001]", account_id: "main", balance_after: 1100
  });
  credit.goal_metric_after = 100;
  const result = new SimResult({
    strategy_name: "Greedy", timeline: { 20261201: [credit] },
    accounts: { main: account }, total_principal: 1000, end_date: "2026-12-01"
  });
  result.start_date = "2026-11-01";
  result.goal_outcome = {
    achieved: true, target: 90, actual: 100, achievement_date: "2026-12-01",
    elapsed_days: 30, overshoot: 10, stopping_reason: "goal_achieved"
  };
  result.credited_net_interest = 100;
  const config = {
    start: "2026-11-01", end: "2026-12-01", compound: false,
    actual_leap_year: true, accounts: [account], consolidation_account_id: "main",
    ait_enabled: true, ait_rate: 0.1,
    fee_config: { default_inter_bank_fee: 25, same_bank_fee: 0 },
    inflow_summaries: [], outflow_summaries: [], bank_registry: { BANK_A: { name: "Bank A" } }
  };
  const html = generateHtmlReport(result, config);
  assert.match(html, /Goal achievement · consolidation net interest/);
  assert.match(html, /Time to goal/);
  assert.match(html, /Supporting portfolio accounting at the stopping boundary/);
  assert.match(html, /First achievement boundary/);
  assert.match(html, /100\.00/);
  result.goal_outcome.stopping_reason = "goal_achieved_on_final_consolidation";
  const finalSweepHtml = generateHtmlReport(result, config);
  assert.match(finalSweepHtml, /Reached only on final consolidation sweep/);
  assert.match(finalSweepHtml, /Final consolidation sweep/);
  const consoleText = formatSimulation(result, config, "goal.json", "fd_options.csv", { color: false, showBookingLedger: false });
  assert.match(consoleText, /GOAL OUTCOME/);
  assert.match(consoleText, /ACHIEVED/);
});

test("report eligibility summary describes bank catalogue conditions without claiming verification", () => {
  assert.equal(
    formatProductEligibility({ customer_segment: "senior", min_age: 60, max_age: 100, min_age_inclusive: false, max_age_inclusive: true, guardian_required: true }),
    "Senior-citizen product · minimum age > 60; maximum age ≤ 100; parent/guardian required"
  );
  assert.match(formatProductEligibility({ customer_segment: "minor" }), /no age conditions recorded in catalogue/);
});

test("standalone report includes selected-bank source status and honest review-date fallback", () => {
  const result = new SimResult({
    strategy_name: "Greedy", total_principal: 1000, end_date: "2026-02-01",
    accounts: { main: { id: "main", label: "Main", bank_id: "BANK_A", bank_key: "bank_a", balance: 1000 } },
    timeline: {}, bookings: []
  });
  const html = generateHtmlReport(result, {
    start: new Date("2026-01-01"), end: new Date("2026-02-01"),
    bank_registry: { BANK_A: { name: "Bank A" } },
    bank_dataset_registry: { BANK_A: { research_status: "populated_secondary", dataset_reviewed_at: "" } }
  });
  assert.match(html, /Selected-bank source status/);
  assert.match(html, /populated_secondary/);
  assert.match(html, /Review date not recorded/);
});
