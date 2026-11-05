import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { createSimulationContext } from "../../src/core/simulation-context.js";

function fixture() {
  return {
    start: "2026-01-01", end: "2026-12-31",
    options: [new FDOption({
      label: "Bank A 30d", period_str: "30d", annual_rate: 10,
      min_amount: 1000, bank_id: "A", bank_key: "a"
    })],
    accounts: [new Account({
      id: "main", bank_id: "A", bank_key: "a", balance: 5000
    })],
    inflow_schedule: { "2026-03-01": 1000 },
    outflow_schedule: {
      "2026-04-01": [{ account_id: "main", amount: 500, payment_policy: "defer" }]
    },
    fee_config: new TransferFeeConfig()
  };
}

test("simulation context normalizes dates, account ids and cash-flow schedules", () => {
  const input = fixture();
  const context = createSimulationContext(input);
  assert.equal(context.start_iso, "2026-01-01");
  assert.equal(context.end_iso, "2026-12-31");
  assert.equal(context.inflow_account_id, "main");
  assert.equal(context.consolidation_account_id, "main");
  assert.deepEqual(context.inflows, { "2026-03-01": { main: 1000 } });
  assert.equal(context.original_capital, 5000);
  assert.equal(context.accounts[0].balance, 5000);
  assert.notEqual(context.accounts[0], fixture().accounts[0]);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.options[0]), true);
  assert.equal(Object.isFrozen(context.accounts[0]), true);
  assert.equal(Object.isFrozen(context.fee_config), true);
  assert.equal(Object.isFrozen(context.inflows["2026-03-01"]), true);
  assert.equal(Object.isFrozen(context.outflows["2026-04-01"][0]), true);
  assert.notEqual(context.options[0], input.options[0]);
});

test("simulation context rejects invalid periods and unknown flow destinations", () => {
  const input = fixture();
  input.start = "2027-01-01";
  assert.throws(() => createSimulationContext(input), /start must not be after/);

  const unknownInflow = fixture();
  unknownInflow.inflow_schedule = { "2026-03-01": { missing: 100 } };
  assert.throws(() => createSimulationContext(unknownInflow), /Inflow destination account/);

  const unknownOutflow = fixture();
  unknownOutflow.outflow_schedule = {
    "2026-04-01": [{ account_id: "missing", amount: 10 }]
  };
  assert.throws(() => createSimulationContext(unknownOutflow), /Outflow targets unknown account/);
});

test("simulation context preserves default account and fee configuration semantics", () => {
  const input = fixture();
  delete input.accounts;
  delete input.fee_config;
  input.outflow_schedule = {};
  const context = createSimulationContext(input);
  assert.equal(context.accounts[0].id, "default");
  assert.equal(context.fee_config instanceof TransferFeeConfig, true);
});
