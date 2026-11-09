import test from "node:test";
import assert from "node:assert/strict";
import { FDOption } from "../../src/core/models.js";

const valid = overrides => new FDOption({
  label: "Validation fixture",
  period_str: "6m",
  annual_rate: 8,
  min_amount: 25000,
  ...overrides
});

test("FD option rejects empty and zero-length tenors centrally", () => {
  assert.throws(() => valid({ period_str: "" }), /Unknown period format/);
  assert.throws(() => valid({ period_str: "0m" }), /tenor must be a positive period/);
});

test("FD option requires a finite non-negative annual rate", () => {
  assert.throws(() => valid({ annual_rate: Number.NaN }), /annual_rate must be finite and non-negative/);
  assert.throws(() => valid({ annual_rate: -0.01 }), /annual_rate must be finite and non-negative/);
  assert.equal(valid({ annual_rate: 0 }).annual_rate, 0);
});

test("FD option requires a finite non-negative minimum principal", () => {
  assert.throws(() => valid({ min_amount: -1 }), /min_amount must be finite and non-negative/);
  assert.throws(() => valid({ min_amount: Number.POSITIVE_INFINITY }), /min_amount must be finite and non-negative/);
  assert.equal(valid({ min_amount: 0 }).min_amount, 0);
});

test("non-cumulative products require a positive payout interval", () => {
  assert.throws(() => valid({
    payout_type: "installment", payout_period_str: "0m"
  }), /payout interval must be a positive period/);
  assert.throws(() => valid({
    payout_type: "installment", payout_period_str: ""
  }), /requires payout_period_str/);
  assert.equal(valid({
    payout_type: "installment", payout_period_str: "2m"
  }).payout_period_days > 0, true);
});
