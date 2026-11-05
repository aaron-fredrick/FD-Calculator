import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("strategy modules do not own actual runtime execution or finalization", async () => {
  const sources = await Promise.all([
    "greedy.js", "search-strategy-base.js", "gss.js"
  ].map(name => readFile(new URL("../../src/strategies/" + name, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.equal(source.includes("SimulationRuntime"), false);
    assert.equal(source.includes("finalizeSimulation"), false);
    assert.equal(source.includes("new SimResult"), false);
  }
});

test("CLI and browser production entry points execute through SimulationEngine", async () => {
  const [cli, web] = await Promise.all([
    readFile(new URL("../../src/cli/fd-cal.js", import.meta.url), "utf8"),
    readFile(new URL("../../src/web/app.js", import.meta.url), "utf8")
  ]);
  assert.match(cli, /SimulationEngine/);
  assert.match(web, /SimulationEngine/);
});
