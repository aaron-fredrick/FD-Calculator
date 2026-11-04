import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { GreedyStrategy, selectBestOption, compareGreedyPlans } from "../../src/strategies/greedy.js";
import { EventType } from "../../src/core/events.js";

const option = (label, period_str) => new FDOption({
  label, period_str, annual_rate: 10, min_amount: 25000,
  bank_id: "BANK_A", bank_key: "a"
});

test("greedy books an eligible local FD and records maturity cash", () => {
  const account = new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 30000 });
  const fd = new FDOption({ label: "1 month", period_str: "1m", annual_rate: 12, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" });
  const result = new GreedyStrategy({ ait_enabled: true }).simulate({
    options: [fd], start: "2026-01-01", end: "2026-03-01",
    accounts: [account], inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: {}, fee_config: new TransferFeeConfig()
  });
  assert.equal(result.bookings.length, 2);
  assert.equal(result.bookings[0].principal, 30000);
  assert.equal(result.bookings[0].account_id, "main");
  assert.ok(result.net_interest > 0);
  assert.ok(Object.values(result.timeline).flat().some(event => event.event_type === EventType.MATURITY));
});

test("greedy respects account-level eFD eligibility when consolidating", () => {
  const accounts = [
    new Account({ id: "plain", bank_id: "BANK_A", bank_key: "a", balance: 15000, supports_efd: false }),
    new Account({ id: "efd", bank_id: "BANK_A", bank_key: "a", balance: 15000, supports_efd: true })
  ];
  const options = [
    new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, min_amount: 25000, bank_id: "BANK_A", bank_key: "a" }),
    new FDOption({ label: "eFD", period_str: "1m", annual_rate: 12, min_amount: 25000, bank_id: "BANK_A", bank_key: "a", is_efd: true })
  ];
  const result = new GreedyStrategy().simulate({
    options, start: "2026-01-01", end: "2026-02-01", accounts,
    inflow_account_id: "plain", consolidation_account_id: "plain",
    fee_config: new TransferFeeConfig(), inflow_schedule: {}
  });
  assert.ok(result.bookings.length);
  assert.ok(result.bookings.every(booking => booking.account_id !== "plain" || !booking.option.is_efd));
});

test("option selection supports both tenor tie-breaker directions", () => {
  const short = option("short", "6m");
  const long = option("long", "1y");
  assert.equal(selectBestOption([long, short]).label, "short");
  assert.equal(selectBestOption([short, long], "longest").label, "long");
  assert.throws(() => selectBestOption([short], "middle"), RangeError);
});

test("Greedy strategy migrates option and plan tenor policies independently", () => {
  const short = option("short", "6m");
  const long = option("long", "1y");
  const account = new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 30000 });
  const args = {
    options: [short, long], start: "2026-01-01", end: "2027-01-02",
    accounts: [account], inflow_account_id: "main", consolidation_account_id: "main",
    inflow_schedule: {}, fee_config: new TransferFeeConfig()
  };
  const shortest = new GreedyStrategy().simulate(args);
  const longest = new GreedyStrategy({ tenor_tiebreaker: "longest" }).simulate(args);
  assert.equal(shortest.bookings[0].option.days, short.days);
  assert.equal(longest.bookings[0].option.days, long.days);
  assert.throws(() => new GreedyStrategy({ plan_tenor_tiebreaker: "middle" }), RangeError);
});

test("plan ranking supports both tenor tie-breaker directions", () => {
  const short = { rate: 10, days: 180, net_interest: 100, fees_today: 0 };
  const long = { rate: 10, days: 365, net_interest: 110, fees_today: 0 };
  assert.ok(compareGreedyPlans(short, long, "shortest") < 0);
  assert.ok(compareGreedyPlans(short, long, "longest") > 0);
  assert.throws(() => compareGreedyPlans(short, long, "invalid"), RangeError);
});
