import test from "node:test";
import assert from "node:assert/strict";
import { runExhaustiveSearch, runBeamSearch } from "../../src/core/strategies/search-engine.js";

function treeFixture() {
  return {
    initialState: { depth: 0, value: 0, path: [] },
    startDate: "2026-01-01",
    isTerminal: state => state.depth === 2,
    getKey: state => JSON.stringify([state.depth, state.value]),
    upperBound: state => state.value + (2 - state.depth) * 10,
    scoreTerminal: state => state.value,
    expand: state => (state.depth >= 2 ? [] : [1, 2].map(value => ({
      date: "2026-01-0" + (state.depth + 2),
      action: value,
      state: { depth: state.depth + 1, value: state.value + value, path: [...state.path, value] },
      priority: state.value + value + (1 - state.depth) * 10,
      root_signature: state.depth === 0 ? ["branch-" + value] : undefined,
    }))),
  };
}

test("exhaustive search returns the best terminal path and counts leaves", () => {
  const result = runExhaustiveSearch(treeFixture());
  assert.equal(result.score, 4);
  assert.deepEqual(result.path.map(item => item.action), [2, 2]);
  assert.ok(result.diagnostics.terminal_states >= 1);
  assert.ok(result.diagnostics.expanded_states >= 3);
});

test("beam search respects width, retains a valid best path and reports pruning", () => {
  const result = runBeamSearch({ ...treeFixture(), beamWidth: 1 });
  assert.ok(result.score >= 3);
  assert.ok(result.path.length > 0);
  assert.equal(result.diagnostics.optimality_proven, false);
  assert.ok(result.diagnostics.beam_pruned > 0);
});

test("beam search rejects invalid widths", () => {
  assert.throws(() => runBeamSearch({ ...treeFixture(), beamWidth: 0 }), /positive integer/);
});

test("search drivers require deterministic transition callbacks", () => {
  assert.throws(() => runExhaustiveSearch({ initialState: {} }), /expand callback/);
});
