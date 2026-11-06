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

console.log("Validated 324 observations, 108 scenarios, 0–60m horizon, and four 2-year cash-flow sweeps.");
