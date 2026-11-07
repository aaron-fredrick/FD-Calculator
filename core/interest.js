import { parsePeriodDays, parseISODate } from "./dates.js";

export function getYearBaseDays(onDate = null, actualLeapYear = true) {
  if (!actualLeapYear || onDate === null) return 365;
  const year = parseISODate(onDate).getUTCFullYear();
  return new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
}

export function calcInterest(principal, annualRatePct, days, onDate = null, compound = false, actualLeapYear = true) {
  for (const [name, value] of Object.entries({ principal, annualRatePct, days })) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  }
  if (days < 0) throw new RangeError("days cannot be negative.");
  const baseDays = getYearBaseDays(onDate, actualLeapYear);
  const rate = annualRatePct / 100;
  return compound
    ? principal * ((1 + rate / baseDays) ** days - 1)
    : principal * rate / baseDays * days;
}

export { parsePeriodDays };
