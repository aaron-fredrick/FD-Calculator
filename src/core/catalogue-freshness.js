const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const token = String(value ?? "").trim();
  if (!DATE_PATTERN.test(token)) return null;
  const [year, month, day] = token.split("-").map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const date = new Date(stamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return stamp;
}

/**
 * Classify catalogue freshness from the date a bank source was actually reviewed.
 * Repository file/merge timestamps must not be substituted for this date.
 */
export function getDatasetFreshness(reviewedAt, now = new Date()) {
  const reviewed = utcDay(reviewedAt);
  if (reviewed === null) {
    return { state: "unverified", ageDays: null, label: "Review date not recorded · freshness unverified" };
  }
  const current = utcDay(now);
  if (current === null) throw new TypeError("Current date must be a valid date.");
  const ageDays = Math.floor((current - reviewed) / DAY_MS);
  if (ageDays < 0) {
    return { state: "invalid", ageDays, label: "Review date is in the future · verify catalogue metadata" };
  }
  if (ageDays >= 365) {
    return { state: "stale", ageDays, label: "Stale — last reviewed " + String(reviewedAt) + " (" + ageDays + " days ago)" };
  }
  if (ageDays >= 180) {
    return { state: "due", ageDays, label: "Review due — last reviewed " + String(reviewedAt) + " (" + ageDays + " days ago)" };
  }
  return { state: "current", ageDays, label: "Reviewed " + String(reviewedAt) + " (" + ageDays + " days ago)" };
}
