import test from "node:test";
import assert from "node:assert/strict";
import { SimulationEngine } from "../../src/core/simulation.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { GAMLStrategy } from "../../src/strategies/gaml.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { GSSStrategy } from "../../src/strategies/gss.js";

test("all production strategies expose planning sessions, not simulation adapters", () => {
  const strategies = [
    new GreedyStrategy(),
    new GAMLStrategy(),
    new AbsoluteStrategy(),
    new GSSStrategy()
  ];
  for (const strategy of strategies) {
    assert.equal(typeof strategy.createSession, "function");
    assert.equal("simulate" in strategy, false);
  }
});

test("SimulationEngine rejects legacy simulate-only execution paths", () => {
  const legacyOnly = { simulate: () => ({}) };
  const engine = new SimulationEngine();
  assert.throws(() => engine.run(legacyOnly, {}), /createSession/);
  assert.throws(() => engine.runUnfinalized(legacyOnly, {}), /createSession/);
});
