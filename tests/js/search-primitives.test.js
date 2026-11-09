import test from "node:test";
import assert from "node:assert/strict";
import {
  makeBalanceState,
  setSearchBalance,
  addSearchBalance,
  zeroSearchBalances,
  mergePendingFlows,
  pruneDominatedOptions,
  selectDiverseBeam,
  SearchTreeNode,
} from "../../src/strategies/search-primitives.js";

test("search balance states are sorted and round to cents", () => {
  assert.deepEqual(makeBalanceState({ z: 10.126, a: 20 }), [["a", 20], ["z", 10.13]]);
  assert.deepEqual(setSearchBalance([["a", 10], ["b", 20]], "b", 0), [["a", 10], ["b", 0]]);
  assert.deepEqual(addSearchBalance([["a", 10.1]], "a", 0.2), [["a", 10.3]]);
});

test("pending flows merge by date and account deterministically", () => {
  const merged = mergePendingFlows(
    [["2027-01-01", [["b", 10], ["a", 2]]]],
    [["2027-01-01", "a", 3.111], ["2027-02-01", "c", 7]]
  );
  assert.deepEqual(merged, [
    ["2027-01-01", [["a", 5.11], ["b", 10]]],
    ["2027-02-01", [["c", 7]]],
  ]);
});

test("dominance pruning preserves different payout timing and eFD alternatives", () => {
  const make = (label, days, rate, minimum, payout = "cumulative", interval = "") => ({
    label, days, annual_rate: rate, min_amount: minimum,
    payout_type: payout, payout_period_str: interval,
    bank_identity: "BANK_A", is_efd: false,
  });
  const short = make("short", 90, 10, 25000);
  const dominated = make("dominated", 180, 9, 25000);
  const monthly = make("monthly", 180, 9, 25000, "periodic_interest", "1 month");
  const result = pruneDominatedOptions([short, dominated, monthly]);
  assert.deepEqual(result.map(option => option.label), ["short", "monthly"]);
});

test("beam selection reserves root diversity and then fills by score", () => {
  const selected = selectDiverseBeam([
    { id: "a1", score: 100, root_signature: ["A"], state_key: "a1" },
    { id: "a2", score: 99, root_signature: ["A"], state_key: "a2" },
    { id: "b1", score: 80, root_signature: ["B"], state_key: "b1" },
    { id: "c1", score: 70, root_signature: ["C"], state_key: "c1" },
    { id: "d1", score: 60, root_signature: ["D"], state_key: "d1" },
  ], 3);
  assert.deepEqual(selected.map(item => item.id), ["a1", "a2", "b1"]);
});

test("search tree reconstructs actions in chronological order", () => {
  const root = new SearchTreeNode({ date: "2026-01-01" });
  const first = new SearchTreeNode({ parent: root, date: "2026-02-01", action: { type: "book" }, root_signature: ["book"] });
  const last = new SearchTreeNode({ parent: first, date: "2026-03-01", action: { type: "carry" } });
  assert.deepEqual(last.getPath(), [
    { date: "2026-02-01", action: { type: "book" } },
    { date: "2026-03-01", action: { type: "carry" } },
  ]);
});

test("multiple balance zeroes are applied in one canonical pass", () => {
  const state = [["a", 10], ["b", 20], ["c", 30]];
  assert.deepEqual(zeroSearchBalances(state, ["a", "c"]), [["a", 0], ["b", 20], ["c", 0]]);
  assert.equal(zeroSearchBalances(state, []), state);
});
