import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const resultPath = new URL("../docs/strategies/benchmarks/results.json", import.meta.url);
const results = JSON.parse(readFileSync(resultPath, "utf8"));
const rows = results.results;
const strategies = ["Greedy", "Absolute R+", "GSS"];
const groups = new Map();

assert.ok(Array.isArray(rows), "Benchmark results must contain a results array.");
for (const row of rows) {
  assert.equal(typeof row.category, "string", "Every observation must have a category.");
  assert.ok(row.value !== undefined, "Every observation must have a scenario value.");
  assert.ok(strategies.includes(row.strategy), "Unexpected strategy: " + row.strategy);
  const key = row.category + "|" + row.value;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}

assert.equal(rows.length, 324, "Expected 324 strategy observations.");
assert.equal(groups.size, 108, "Expected 108 distinct scenario points.");
for (const [key, group] of groups) {
  assert.deepEqual(
    group.map(row => row.strategy).sort(),
    [...strategies].sort(),
    key + " must include exactly one observation for each strategy."
  );
}

const values = category => [...new Set(
  rows.filter(row => row.category === category).map(row => Number(row.value))
)].sort((a, b) => a - b);
const sequence = (count, step, start = 0) => Array.from({ length: count }, (_, index) => start + index * step);

assert.deepEqual(values("horizon_months"), sequence(21, 3));
assert.deepEqual(values("inflow_monthly_amount_lkr"), sequence(21, 10000));
assert.deepEqual(values("outflow_monthly_amount_lkr"), sequence(21, 10000));
assert.deepEqual(values("inflow_duration_months"), sequence(12, 1, 1));
assert.deepEqual(values("outflow_duration_months"), sequence(12, 1, 1));

const cashFlowCategories = new Set([
  "inflow_monthly_amount_lkr",
  "inflow_duration_months",
  "outflow_monthly_amount_lkr",
  "outflow_duration_months"
]);
for (const row of rows.filter(row => cashFlowCategories.has(row.category))) {
  assert.equal(row.months, 24, "Cash-flow sweeps must run for 2 years.");
}
for (const row of rows.filter(row => row.category === "inflow_duration_months")) {
  assert.equal(row.inflow_amount, 100000, "Inflow duration sweep must hold monthly amount fixed.");
  assert.equal(row.inflow_duration_months, Number(row.value));
}
for (const row of rows.filter(row => row.category === "outflow_duration_months")) {
  assert.equal(row.outflow_amount, 100000, "Outflow duration sweep must hold monthly amount fixed.");
  assert.equal(row.outflow_duration_months, Number(row.value));
}
for (const row of rows.filter(row =>
  row.category.startsWith("outflow_") && row.valid === false && row.outflow_unpaid === null
)) {
  assert.equal(row.outflows_paid, null, "Unexecuted outflow totals must remain unmeasured.");
  assert.ok(Number.isFinite(row.outflow_scheduled_total), "Scheduled outflows must be reported separately.");
}

const searchResultsPath = new URL("../docs/strategies/benchmarks/gaml-search-results.json", import.meta.url);
const searchResults = JSON.parse(readFileSync(searchResultsPath, "utf8"));
assert.ok(searchResults && typeof searchResults === "object", "Absolute R+ search results must be valid JSON.");
assert.ok(Array.isArray(searchResults.results), "Absolute R+ search results must contain a results array.");
assert.equal(searchResults.results.length, 15, "Expected 15 Absolute R+ parameter observations.");
assert.deepEqual(searchResults.baseline, {
  beam_width: 96,
  max_local_branches: 48,
  max_decisions: 5000
});
const searchSweeps = {
  beam_width: [32, 64, 96, 192, 256],
  local_branch_limit: [16, 32, 48, 96, 128],
  decision_cap: [500, 1000, 2500, 5000, 10000]
};
for (const [sweep, expectedValues] of Object.entries(searchSweeps)) {
  const sweepRows = searchResults.results.filter(row => row.sweep === sweep);
  assert.equal(sweepRows.length, 5, sweep + " must contain five parameter observations.");
  assert.deepEqual(sweepRows.map(row => row.value), expectedValues);
}
for (const row of searchResults.results) {
  for (const field of [
    "beam_width", "max_local_branches", "max_decisions", "net_interest",
    "final_value", "expanded_states", "beam_pruned", "local_combination_pruned",
    "duration_ms"
  ]) {
    assert.ok(Number.isFinite(row[field]), "Absolute R+ result field " + field + " must be finite.");
  }
  assert.equal(typeof row.optimality_proven, "boolean");
}

console.log("Validated 324 strategy observations, 108 scenarios, 0–60m horizon, four 2-year cash-flow sweeps, and 15 Absolute R+ parameter observations.");
