import test from "node:test";
import assert from "node:assert/strict";
import { getDatasetFreshness } from "../../src/core/catalogue-freshness.js";

test("catalogue review freshness distinguishes missing and invalid dates", () => {
  assert.equal(getDatasetFreshness("", "2026-11-09").state, "unverified");
  assert.equal(getDatasetFreshness("2026-02-30", "2026-11-09").state, "unverified");
  assert.equal(getDatasetFreshness("2026-11-10", "2026-11-09").state, "invalid");
});

test("catalogue review freshness uses the owner-approved 180 and 365 day thresholds", () => {
  const now = "2026-11-09";
  assert.equal(getDatasetFreshness("2026-05-14", now).ageDays, 179);
  assert.equal(getDatasetFreshness("2026-05-13", now).state, "due");
  assert.equal(getDatasetFreshness("2025-11-10", now).state, "due");
  assert.equal(getDatasetFreshness("2025-11-09", now).state, "stale");
});

test("freshness labels use source-review date rather than repository modification time", () => {
  const result = getDatasetFreshness("2026-11-01", "2026-11-09");
  assert.equal(result.state, "current");
  assert.match(result.label, /Reviewed 2026-11-01/);
});
