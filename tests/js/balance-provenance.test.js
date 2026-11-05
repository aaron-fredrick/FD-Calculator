import test from "node:test";
import assert from "node:assert/strict";
import { BalanceProvenance } from "../../src/core/balance-provenance.js";

test("opening capital is principal and transfers preserve provenance", () => {
  const ledger = new BalanceProvenance(["a", "b"]);
  ledger.addPrincipal("a", 1000);
  const moved = ledger.transfer("a", "b", 400, 10);
  assert.deepEqual(moved.gross, { principal: 400, uncredited_interest: 0, counted_interest: 0 });
  assert.deepEqual(moved.fee, { principal: 10, uncredited_interest: 0, counted_interest: 0 });
  assert.equal(ledger.total("a"), 600);
  assert.equal(ledger.total("b"), 390);
});

test("mixed transfer and fee are allocated proportionally across principal and interest", () => {
  const ledger = new BalanceProvenance(["a", "b"]);
  ledger.add("a", { principal: 600, uncredited_interest: 400 });
  const moved = ledger.transfer("a", "b", 500, 10);
  assert.deepEqual(moved.gross, { principal: 300, uncredited_interest: 200, counted_interest: 0 });
  assert.deepEqual(moved.fee, { principal: 6, uncredited_interest: 4, counted_interest: 0 });
  assert.deepEqual(moved.net, { principal: 294, uncredited_interest: 196, counted_interest: 0 });
  assert.equal(ledger.total("a"), 500);
  assert.equal(ledger.total("b"), 490);
});

test("consolidation credit is counted once and remains counted when moved again", () => {
  const ledger = new BalanceProvenance(["fd", "consolidation", "other"]);
  ledger.add("fd", { principal: 1000, uncredited_interest: 100 });
  ledger.transfer("fd", "consolidation", 1100, 10);
  assert.equal(ledger.recognizeConsolidationCredit("consolidation"), 99.09);
  assert.equal(ledger.creditedNetInterest, 99.09);
  ledger.transfer("consolidation", "other", 500, 0);
  ledger.transfer("other", "consolidation", 500, 0);
  assert.equal(ledger.recognizeConsolidationCredit("consolidation"), 0);
  assert.equal(ledger.creditedNetInterest, 99.09);
});

test("proportional debit reconciles to cents for mixed balances", () => {
  const ledger = new BalanceProvenance(["a"]);
  ledger.add("a", { principal: 100.01, uncredited_interest: 50.02, counted_interest: 25.03 });
  const debit = ledger.debit("a", 33.34);
  assert.equal(Math.round(Object.values(debit).reduce((a, b) => a + b, 0) * 100) / 100, 33.34);
  assert.equal(ledger.total("a"), 141.72);
});

test("invalid debits and transfers are rejected without silent negative balances", () => {
  const ledger = new BalanceProvenance(["a", "b"]);
  ledger.addPrincipal("a", 100);
  assert.throws(() => ledger.debit("a", 101), /exceeds/);
  assert.throws(() => ledger.transfer("a", "b", 100, 100), /invalid/);
  assert.equal(ledger.total("a"), 100);
  assert.equal(ledger.total("b"), 0);
});

test("outflows consume mixed provenance proportionally without reversing historical goal credit", () => {
  const ledger = new BalanceProvenance(["consolidation"]);
  ledger.add("consolidation", { principal: 600, uncredited_interest: 400 });
  assert.equal(ledger.recognizeConsolidationCredit("consolidation"), 400);
  const paid = ledger.debit("consolidation", 500);
  assert.equal(paid.principal, 300);
  assert.equal(paid.counted_interest, 200);
  assert.equal(ledger.total("consolidation"), 500);
  assert.equal(ledger.creditedNetInterest, 400);
});
