import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption } from "../../src/core/models.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { GSSStrategy } from "../../src/strategies/gss.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { AbsolutePlusStrategy } from "../../src/strategies/absolute-plus.js";

function scenario() {
  return {
    options: [new FDOption({
      label: "Unavailable-by-minimum control", period_str: "30d",
      annual_rate: 10, min_amount: 25000, bank_id: "BANK_A", bank_key: "a"
    })],
    start: "2026-01-01",
    end: "2026-03-01",
    accounts: [new Account({
      id: "main", bank_id: "BANK_A", bank_key: "a", balance: 5000
    })],
    inflow_account_id: "main",
    consolidation_account_id: "main",
    inflow_schedule: { "2026-01-10": { main: 2000 } },
    outflow_schedule: {
      "2026-01-15": [{ account_id: "main", amount: 4000, name: "Priority bill", payment_policy: "strict" }],
      "2026-02-15": [{ account_id: "main", amount: 5000, name: "Deferred bill", payment_policy: "defer" }]
    }
  };
}

const strategies = [
  ["Greedy", () => new GreedyStrategy({ ait_enabled: true })],
  ["GSS", () => new GSSStrategy({ ait_enabled: true, small_period_days: 30 })],
  ["Absolute R", () => new AbsoluteStrategy({ ait_enabled: true, max_local_branches: 4, max_decisions: 500 })],
  ["Absolute R+", () => new AbsolutePlusStrategy({ ait_enabled: true, beam_width: 8, max_local_branches: 4, max_decisions: 500 })]
];

function obligationSnapshot(result) {
  return {
    valid: result.valid,
    paid: Math.round(result.total_outflows_paid * 100) / 100,
    outstanding: result.outstanding_outflows.map(item => ({
      name: item.name,
      remaining: Math.round(item.remaining * 100) / 100,
      payment_policy: item.payment_policy
    })).sort((a, b) => a.name.localeCompare(b.name)),
    endingCash: Math.round(result.accounts.main.balance * 100) / 100
  };
}

test("all strategies preserve the same authoritative outflow settlement and obligation ledger", () => {
  const engine = new SimulationEngine();
  const snapshots = strategies.map(([name, create]) => {
    const result = engine.run(create(), scenario());
    const snapshot = obligationSnapshot(result);
    assert.equal(snapshot.valid, true, name + " should complete the strict obligation.");
    assert.equal(snapshot.paid, 4000, name + " should settle the 4,000 strict obligation; defer is all-or-nothing.");
    assert.deepEqual(snapshot.outstanding, [{
      name: "Deferred bill", remaining: 5000, payment_policy: "defer"
    }], name + " should retain the same deferred liability.");
    assert.equal(snapshot.endingCash, 3000, name + " should retain the cash reserved for the deferred obligation.");
    assert.equal(snapshot.paid + snapshot.outstanding.reduce((sum, item) => sum + item.remaining, 0), 9000);
    return [name, snapshot];
  });
  for (const [name, snapshot] of snapshots.slice(1)) {
    assert.deepEqual(snapshot, snapshots[0][1], name + " must match the cross-strategy outflow baseline.");
  }
});
