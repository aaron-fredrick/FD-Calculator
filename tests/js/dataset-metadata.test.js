import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBankDatasetMetadata, mergeBankDatasetMetadata
} from "../../src/io/dataset-metadata.js";

test("bank dataset metadata keeps data changes, source reviews and schema versions independent", () => {
  const initial = normalizeBankDatasetMetadata({
    dataset_updated_at: "2026-08-05",
    dataset_reviewed_at: "2026-09-10",
    dataset_schema_version: "1"
  });
  const migrated = mergeBankDatasetMetadata(initial, { dataset_schema_version: 2 });
  assert.deepEqual(migrated, {
    dataset_updated_at: "2026-08-05",
    dataset_reviewed_at: "2026-09-10",
    dataset_schema_version: 2
  });
});

test("unknown bank dataset dates remain unrecorded instead of being inferred from commits", () => {
  assert.deepEqual(normalizeBankDatasetMetadata({ dataset_schema_version: "1" }), {
    dataset_updated_at: "",
    dataset_reviewed_at: "",
    dataset_schema_version: 1
  });
});

test("bank dataset metadata rejects invalid dates and schema versions", () => {
  assert.throws(() => normalizeBankDatasetMetadata({ dataset_updated_at: "2026-02-30" }), /real calendar date/);
  assert.throws(() => normalizeBankDatasetMetadata({ dataset_reviewed_at: "09-11-2026" }), /YYYY-MM-DD/);
  assert.throws(() => normalizeBankDatasetMetadata({ dataset_schema_version: "v2" }), /positive integer/);
});
