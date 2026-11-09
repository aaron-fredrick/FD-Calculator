const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value, field) {
  const token = String(value ?? "").trim();
  if (!token) return "";
  if (!DATE_PATTERN.test(token)) throw new TypeError(field + " must use YYYY-MM-DD.");
  const [year, month, day] = token.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError(field + " must be a real calendar date.");
  }
  return token;
}

/** Keep source review, economic-data change and CSV schema version independent. */
export function normalizeBankDatasetMetadata(row = {}) {
  const versionToken = String(row.dataset_schema_version ?? "").trim();
  const schemaVersion = versionToken ? Number(versionToken) : 1;
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new RangeError("dataset_schema_version must be a positive integer.");
  }
  return Object.freeze({
    dataset_updated_at: normalizeDate(row.dataset_updated_at, "dataset_updated_at"),
    dataset_reviewed_at: normalizeDate(row.dataset_reviewed_at, "dataset_reviewed_at"),
    dataset_schema_version: schemaVersion
  });
}

/**
 * Use when changing metadata or migrating a bank CSV schema. A schema-version
 * update preserves economic-data and source-review dates unless explicitly
 * changed by a separately verified data update/review.
 */
export function mergeBankDatasetMetadata(existing = {}, changes = {}) {
  return normalizeBankDatasetMetadata({ ...existing, ...changes });
}
