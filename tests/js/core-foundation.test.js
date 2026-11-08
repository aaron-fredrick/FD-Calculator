import test from "node:test";
import assert from "node:assert/strict";
import { addPeriod, daysBetween, parsePeriodDays, formatISODate } from "../../src/core/dates.js";
import { calcInterest, getYearBaseDays } from "../../src/core/interest.js";
import { Account, FDOption, TransferFeeConfig, PERIODIC_INTEREST, INSTALLMENT } from "../../src/core/models.js";
import { processOutflows } from "../../src/core/cashflows.js";

test("period arithmetic follows calendar month-end clamping", () => {
  assert.equal(formatISODate(addPeriod("2026-01-31", "1m")), "2026-02-28");
  assert.equal(formatISODate(addPeriod("2026-01-31", "1m", 2)), "2026-03-31");
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(parsePeriodDays("1m"), 30);
});

test("interest supports actual leap-year bases and daily compounding", () => {
  assert.equal(getYearBaseDays("2024-01-01"), 366);
  assert.equal(getYearBaseDays("2025-01-01"), 365);
  assert.equal(getYearBaseDays("2024-01-01", false), 365);
  assert.equal(calcInterest(100000, 10, 365, "2024-01-01"), 100000 * 0.10 * 365 / 366);
  assert.equal(calcInterest(100000, 10, 366, "2024-01-01"), 10000);
  assert.ok(calcInterest(100000, 10, 365, "2025-01-01", true) > calcInterest(100000, 10, 365, "2025-01-01"));
});

test("account-level eFD eligibility and transfer channel fee rules", () => {
  const account = new Account({ id: "a", bank_id: "BANK", supports_efd: false });
  assert.equal(account.canUseOption({ is_efd: true }), false);
  assert.equal(account.canUseOption({ is_efd: false }), true);
  const fees = new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0, bank_fees: { BANK: [0, 25] } });
  assert.equal(fees.getFee("BANK", "BANK"), 0);
  assert.equal(fees.getFee("BANK", "OTHER"), 25);
  assert.equal(fees.getFee("OTHER", "BANK"), 30);
});

test("FD payout schedules and AIT preserve principal treatment", () => {
  const periodic = new FDOption({ label: "monthly", period_str: "6m", annual_rate: 10, payout_type: PERIODIC_INTEREST, payout_period_str: "1m" });
  const flows = periodic.generateCashFlows(100000, "2026-01-01");
  assert.equal(flows.length, 6);
  assert.equal(flows.at(-1).amount > 100000, true);
  const net = periodic.applyAITToCashFlows(100000, flows, 0.1);
  assert.equal(net.at(-1).amount, Math.round((flows.at(-1).amount - (flows.at(-1).amount - 100000) * 0.1) * 100) / 100);
  const emi = new FDOption({ label: "emi", period_str: "6m", annual_rate: 10, payout_type: INSTALLMENT, payout_period_str: "1m" });
  assert.equal(emi.generateCashFlows(100000, "2026-01-01").length, 6);
});

test("outflow processing is immutable and honours strict/defer/best-effort policies", () => {
  const balances = [["a", 100]];
  const result = processOutflows("2026-01-01", balances, [], [{ name: "rent", account_id: "a", amount: 40, payment_policy: "strict" }]);
  assert.deepEqual(result.balances, [["a", 60]]);
  assert.deepEqual(balances, [["a", 100]]);
  const deferred = processOutflows("2026-01-01", [["a", 10]], [], [{ name: "bill", account_id: "a", amount: 20, payment_policy: "defer" }]);
  assert.equal(deferred.pending.length, 1);
});
