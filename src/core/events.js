import { parseISODate, formatISODate } from "./dates.js";

export const EventType = Object.freeze({
  INFLOW: "inflow",
  OUTFLOW: "outflow",
  TRANSFER: "transfer",
  BOOKING: "booking",
  CASH_FLOW: "cash_flow",
  MATURITY: "maturity",
  CARRY_FORWARD: "carry_forward",
  IDLE: "idle"
});

export class Event {
  constructor({
    event_type, on_date, amount, label = "", booking_ref = "", account_id = "",
    payment_policy = "", bank_key = "", bank_id = "", fee = 0,
    transfer_channel = "", balance_after = -1, total_balance_after = -1,
    decision_context = {}
  }) {
    if (!Object.values(EventType).includes(event_type)) throw new RangeError(`Unknown event type: ${event_type}`);
    if (!Number.isFinite(amount)) throw new TypeError("Event amount must be finite.");
    if (!Number.isFinite(fee) || fee < 0) throw new RangeError("Event fee must be finite and non-negative.");
    this.event_type = event_type;
    this.on_date = parseISODate(on_date);
    this.amount = amount;
    this.label = String(label);
    this.booking_ref = String(booking_ref);
    this.account_id = String(account_id);
    this.payment_policy = String(payment_policy);
    this.bank_key = String(bank_key);
    this.bank_id = String(bank_id);
    this.fee = fee;
    this.transfer_channel = String(transfer_channel);
    this.balance_after = balance_after;
    this.total_balance_after = total_balance_after;
    this.decision_context = decision_context;
  }
  get date_key() { return Number(formatISODate(this.on_date).replaceAll("-", "")); }
}

export function normalizeInflowSchedule(schedule, defaultAccountId) {
  const normalized = {};
  const entries = schedule instanceof Map ? [...schedule.entries()] : Object.entries(schedule ?? {});
  for (const [rawDate, value] of entries) {
    const date = formatISODate(rawDate);
    const dayEntries = typeof value === "object" && value !== null && !Array.isArray(value)
      ? value : { [defaultAccountId]: value };
    for (const [rawAccountId, rawAmount] of Object.entries(dayEntries)) {
      const accountId = String(rawAccountId).trim();
      const amount = Number(rawAmount);
      if (!accountId) throw new TypeError(`Inflow on ${date} has an empty account_id.`);
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`Inflow on ${date} cannot be negative or non-finite.`);
      if (amount) {
        normalized[date] ??= {};
        normalized[date][accountId] = (normalized[date][accountId] ?? 0) + amount;
      }
    }
  }
  return normalized;
}
