const DAY_MS = 86_400_000;

export function parsePeriod(period) {
  const match = /^(\d+)([dmy])$/i.exec(String(period).trim());
  if (!match) throw new RangeError(`Unknown period format ${period}; use e.g. 100d, 1m, or 1y.`);
  return { amount: Number(match[1]), unit: match[2].toLowerCase() };
}

export function parseISODate(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Date must use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) throw new RangeError(`Invalid calendar date: ${value}`);
  return result;
}

export function formatISODate(value) {
  const d = parseISODate(value);
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")].join("-");
}

export function addPeriod(start, period, multiplier = 1) {
  const date = parseISODate(start);
  const { amount, unit } = parsePeriod(period);
  const count = amount * multiplier;
  if (!Number.isInteger(count)) throw new RangeError("Period multiplier must produce a whole number.");
  if (unit === "d") return new Date(date.getTime() + count * DAY_MS);
  const months = unit === "m" ? count : count * 12;
  const targetMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function daysBetween(start, end) {
  return Math.round((parseISODate(end) - parseISODate(start)) / DAY_MS);
}

export function parsePeriodDays(period, start = null) {
  if (start !== null) return daysBetween(start, addPeriod(start, period));
  const { amount, unit } = parsePeriod(period);
  if (unit === "d") return amount;
  return Math.round(amount * (unit === "m" ? 30.4375 : 365.25));
}
