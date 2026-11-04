import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { EventType } from "../../src/core/events.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { GSSStrategy } from "../../src/strategies/gss.js";

const fd = (label, rate, min, period = "30d", bank = "BANK_A") => new FDOption({
  label, annual_rate: rate, min_amount: min, period_str: period,
  bank_id: bank, bank_key: bank.toLowerCase()
});
const account = (id, bank, balance, supports_efd = true) => new Account({
  id, bank_id: bank, bank_key: bank.toLowerCase(), balance, supports_efd
});
const run = (input, settings = {}) => new SimulationEngine().run(new GSSStrategy(settings), {
  fee_config: new TransferFeeConfig(), inflow_schedule: {}, outflow_schedule: {},
  consolidation_account_id: input.accounts[0].id, inflow_account_id: input.accounts[0].id,
  ...input
});

test("GSS tries later manager-ordered candidates when the first candidate is unaffordable", () => {
  const result = run({
    options: [fd("High minimum", 15, 100000), fd("Affordable", 10, 25000)],
    start: "2026-01-01", end: "2026-03-01",
    accounts: [account("main", "BANK_A", 30000)]
  });
  assert.ok(result.bookings.length > 0);
  assert.equal(result.bookings[0].option.label, "Affordable");
  assert.equal(result.strategy_name, "GSS");
  assert.equal(result.finalized, true);
});

test("GSS recursively waits for scheduled inflows before booking a future goal", () => {
  const result = run({
    options: [fd("Future goal", 12, 25000)],
    start: "2026-01-01", end: "2026-03-15",
    accounts: [account("main", "BANK_A", 10000)],
    inflow_schedule: { "2026-02-01": { main: 20000 } }
  });
  assert.ok(result.bookings.length > 0);
  assert.equal(result.bookings[0].start.toISOString().slice(0, 10), "2026-02-01");
  assert.ok(result.gss_diagnostics.recursive_waits > 0);
});

test("GSS compares consolidation when no individual account can meet an FD minimum", () => {
  const result = run({
    options: [
      fd("Combined", 12, 25000, "30d", "BANK_A"),
      fd("Other bank", 12, 25000, "30d", "BANK_B")
    ],
    start: "2026-01-01", end: "2026-02-15",
    accounts: [account("a", "BANK_A", 15000), account("b", "BANK_B", 15000)],
    consolidation_account_id: "a",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 })
  });
  assert.ok(result.bookings.length > 0);
  assert.equal(result.bookings[0].account_id, "a");
  assert.ok(result.total_transfer_fees >= 30);
  assert.ok(Object.values(result.timeline).flat().some(event =>
    event.event_type === EventType.TRANSFER && event.label.startsWith("Transfer to")));
});

test("GSS limits interim bookings to maturities no later than the parent goal date", () => {
  const result = run({
    options: [
      fd("Parent goal", 20, 50000, "30d"),
      fd("Interim short", 10, 25000, "10d")
    ],
    start: "2026-01-01", end: "2026-04-15",
    accounts: [account("main", "BANK_A", 30000)],
    inflow_schedule: {
      "2026-01-15": { main: 5000 },
      "2026-03-01": { main: 25000 }
    }
  });
  const parent = result.bookings.find(booking => booking.option.label === "Parent goal");
  assert.ok(parent, "parent goal should be booked");
  const interim = result.bookings.filter(booking => booking.option.label === "Interim short");
  assert.ok(interim.length > 0, "waiting period should use interim investments");
  for (const booking of interim) assert.ok(booking.end <= parent.start);
});

test("GSS returns liquid balances when no candidate can become viable", () => {
  const result = run({
    options: [fd("Too expensive", 12, 100000)],
    start: "2026-01-01", end: "2026-02-01",
    accounts: [account("main", "BANK_A", 10000)]
  });
  assert.equal(result.bookings.length, 0);
  assert.ok(result.accounts.main.balance > 0);
});

test("GSS validates the small-period recursion threshold", () => {
  assert.throws(() => new GSSStrategy({ small_period_days: 0 }), RangeError);
});

test("GSS handles strict outflows through the normal simulation lifecycle", () => {
  const result = run({
    options: [fd("One month", 10, 25000)],
    start: "2026-01-01", end: "2026-03-01",
    accounts: [account("main", "BANK_A", 30000)],
    outflow_schedule: {
      "2026-01-15": [{ name: "Expense", amount: 5000, account_id: "main", payment_policy: "strict" }]
    }
  });
  assert.equal(result.valid, true);
  assert.equal(result.total_outflows_paid, 5000);
});
