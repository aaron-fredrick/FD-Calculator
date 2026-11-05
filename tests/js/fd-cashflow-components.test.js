import test from "node:test";
import assert from "node:assert/strict";
import { FDOption, CUMULATIVE, PERIODIC_INTEREST, INSTALLMENT } from "../../src/core/models.js";

const start = "2026-01-01";
const common = { label: "Test FD", period_str: "6m", annual_rate: 10, bank_id: "BANK_A" };

for (const [payout_type, payout_period_str] of [
  [CUMULATIVE, ""], [PERIODIC_INTEREST, "1m"], [INSTALLMENT, "1m"]
]) {
  test(payout_type + " cash-flow components reconcile after AIT", () => {
    const option = new FDOption({ ...common, payout_type, payout_period_str });
    const flows = option.generateCashFlowComponentsAfterAIT(100000, start, 0.10);
    const legacy = option.generateCashFlowsAfterAIT(100000, start, 0.10);
    assert.equal(flows.length, legacy.length);
    flows.forEach((flow, index) => {
      assert.equal(flow.amount, legacy[index].amount);
      assert.equal(Math.round((flow.principal + flow.interest) * 100) / 100, flow.amount);
      assert.ok(flow.principal >= 0 && flow.interest >= 0);
    });
    assert.equal(Math.round(flows.reduce((sum, flow) => sum + flow.principal, 0) * 100) / 100, 100000);
  });
}

test("periodic interest-only flows have no principal until maturity", () => {
  const option = new FDOption({ ...common, payout_type: PERIODIC_INTEREST, payout_period_str: "1m" });
  const flows = option.generateCashFlowComponentsAfterAIT(100000, start, 0.10);
  assert.ok(flows.slice(0, -1).every(flow => flow.principal === 0));
  assert.equal(flows.at(-1).principal, 100000);
});

test("installments allocate the full principal with final-cent reconciliation", () => {
  const option = new FDOption({ ...common, payout_type: INSTALLMENT, payout_period_str: "1m" });
  const flows = option.generateCashFlowComponentsAfterAIT(100000.01, start, 0.10);
  assert.equal(Math.round(flows.reduce((sum, flow) => sum + flow.principal, 0) * 100) / 100, 100000.01);
});
