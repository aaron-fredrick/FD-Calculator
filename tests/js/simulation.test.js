import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { EventType } from "../../src/core/events.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { GAMLStrategy } from "../../src/strategies/gaml.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { SimulationEngine } from "../../src/core/simulation.js";

function scenario() {
  const accounts = [
    new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", label: "Main", balance: 10000 }),
    new Account({ id: "other", bank_id: "BANK_B", bank_key: "b", label: "Other", balance: 10000 })
  ];
  const options = [
    new FDOption({ label: "Too high minimum A", bank_id: "BANK_A", bank_key: "a", period_str: "30d", annual_rate: 8, min_amount: 50000 }),
    new FDOption({ label: "Too high minimum B", bank_id: "BANK_B", bank_key: "b", period_str: "30d", annual_rate: 8, min_amount: 50000 })
  ];
  return {
    options, start: "2026-01-01", end: "2026-02-01",
    inflow_schedule: {}, accounts, inflow_account_id: "main",
    consolidation_account_id: "main",
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 }),
    outflow_schedule: {}
  };
}

for (const [name, makeStrategy] of [
  ["Greedy", () => new GreedyStrategy()],
  ["GAML", () => new GAMLStrategy({ beam_width: 8, max_local_branches: 4 })],
  ["Absolute", () => new AbsoluteStrategy()]
]) {
  test(name + " leaves final consolidation to the shared simulation engine", () => {
    const input = scenario();
    const raw = makeStrategy().simulate(input);
    const rawEvents = Object.values(raw.timeline).flat();
    assert.equal(rawEvents.some(event => event.event_type === EventType.SIMULATION_START), false);
    assert.equal(raw.total_transfer_fees, 0);
    assert.equal(rawEvents.filter(event => event.label.startsWith("Final sweep")).length, 0);
    assert.equal(rawEvents.filter(event => event.event_type === EventType.IDLE).length, 0);

    const result = new SimulationEngine().run(makeStrategy(), input);
    const events = Object.values(result.timeline).flat();
    assert.equal(result.finalized, true);
    const startEvents = events.filter(event => event.event_type === EventType.SIMULATION_START);
    assert.equal(startEvents.length, 1);
    assert.equal(startEvents[0].on_date.toISOString().slice(0, 10), input.start);
    assert.equal(result.timeline[20260101][0], startEvents[0]);
    assert.equal(result.total_transfer_fees, 30);
    assert.equal(events.filter(event => event.label.startsWith("Final sweep to")).length, 1);
    assert.equal(events.filter(event => event.label.startsWith("Final sweep received")).length, 1);
    assert.equal(events.filter(event => event.event_type === EventType.IDLE).length, 1);
    assert.equal(result.accounts.other.balance, 0);
    assert.equal(result.accounts.main.balance, 19970);
  });
}

test("shared finalization rejects a second final sweep", () => {
  const input = scenario();
  const engine = new SimulationEngine();
  const result = engine.run(new GreedyStrategy(), input);
  assert.throws(() => engine.run({ simulate: () => result }, input), /already been finalized/);
});
