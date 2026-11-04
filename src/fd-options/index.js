/**
 * Bank-aware FD product catalogue.
 *
 * Canonical options are retained in a stable, sorted array. Secondary indexes
 * group products by rate and tenor for efficient ordered retrieval. Eligibility
 * remains account-specific because eFD support can differ between accounts.
 */
import { parseISODate } from "../core/dates.js";

const PAYOUT_ORDER = new Map([
  ["periodic_interest", 0],
  ["installment", 1],
  ["cumulative", 2],
]);
const normaliseBankIdentity = value => String(value ?? "").trim().toUpperCase();
const freezeBuckets = buckets => {
  for (const [key, values] of buckets) buckets.set(key, Object.freeze(values));
  return buckets;
};

export function compareFDOptions(a, b) {
  return Number(b.annual_rate) - Number(a.annual_rate) ||
    Number(a.days) - Number(b.days) ||
    (PAYOUT_ORDER.get(a.payout_type) ?? 99) - (PAYOUT_ORDER.get(b.payout_type) ?? 99) ||
    (a.payout_type === "periodic_interest" && b.payout_type === "periodic_interest"
      ? Number(a.payout_period_days) - Number(b.payout_period_days) : 0) ||
    String(a.label ?? "").localeCompare(String(b.label ?? "")) ||
    String(a.economic_terms_key ?? "").localeCompare(String(b.economic_terms_key ?? ""));
}

/**
 * Compare eligible options using the configured tenor preference.
 * Rate remains the primary criterion; payout and label ordering remain stable.
 */
export function compareFDOptionsByPolicy(a, b, tenorTieBreaker = "shortest") {
  if (!["shortest", "longest"].includes(tenorTieBreaker)) {
    throw new RangeError('tenorTieBreaker must be "shortest" or "longest".');
  }
  const tenorOrder = tenorTieBreaker === "shortest"
    ? Number(a.days) - Number(b.days)
    : Number(b.days) - Number(a.days);
  return Number(b.annual_rate) - Number(a.annual_rate) ||
    tenorOrder ||
    (PAYOUT_ORDER.get(a.payout_type) ?? 99) - (PAYOUT_ORDER.get(b.payout_type) ?? 99) ||
    (a.payout_type === "periodic_interest" && b.payout_type === "periodic_interest"
      ? Number(a.payout_period_days) - Number(b.payout_period_days) : 0) ||
    String(a.label ?? "").localeCompare(String(b.label ?? "")) ||
    String(a.economic_terms_key ?? "").localeCompare(String(b.economic_terms_key ?? ""));
}

export function fdOptionKey(option) {
  return JSON.stringify([
    normaliseBankIdentity(option.bank_identity),
    String(option.label ?? ""),
    String(option.period_str ?? ""),
    option.economic_terms_key,
    Boolean(option.is_efd),
  ]);
}

export class BankFDOptionManager {
  constructor(bankIdentity, options = []) {
    this.bank_identity = normaliseBankIdentity(bankIdentity);
    this.options = Object.freeze([...options].sort(compareFDOptions));

    const lookup = new Map();
    const byRate = new Map();
    const byRateAndTenor = new Map();
    const byTenor = new Map();
    for (const option of this.options) {
      const key = fdOptionKey(option);
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(option);

      const rate = Number(option.annual_rate);
      const tenor = Number(option.days);
      if (!byRate.has(rate)) byRate.set(rate, []);
      byRate.get(rate).push(option);
      if (!byRateAndTenor.has(rate)) byRateAndTenor.set(rate, new Map());
      const tenorBuckets = byRateAndTenor.get(rate);
      if (!tenorBuckets.has(tenor)) tenorBuckets.set(tenor, []);
      tenorBuckets.get(tenor).push(option);
      if (!byTenor.has(tenor)) byTenor.set(tenor, []);
      byTenor.get(tenor).push(option);
    }

    this.lookup = freezeBuckets(lookup);
    this.indexes = Object.freeze({
      byRate: freezeBuckets(byRate),
      byRateAndTenor: new Map([...byRateAndTenor].map(([rate, buckets]) =>
        [rate, freezeBuckets(buckets)])),
      byTenor: freezeBuckets(byTenor),
    });
    Object.freeze(this);
  }

  getOption(key) { return this.lookup.get(String(key))?.[0] ?? null; }
  getOptionsByKey(key) { return this.lookup.get(String(key)) ?? Object.freeze([]); }
  getOptionsByRate(rate) { return this.indexes.byRate.get(Number(rate)) ?? Object.freeze([]); }
  getOptionsByRateAndTenor(rate, days) {
    return this.indexes.byRateAndTenor.get(Number(rate))?.get(Number(days)) ?? Object.freeze([]);
  }
  getRates(order = "descending") {
    return [...this.indexes.byRate.keys()].sort((a, b) =>
      order === "ascending" ? a - b : b - a);
  }
  getTenorsForRate(rate, order = "ascending") {
    const tenors = this.indexes.byRateAndTenor.get(Number(rate));
    return tenors ? [...tenors.keys()].sort((a, b) =>
      order === "descending" ? b - a : a - b) : [];
  }

  getAccountOptions(account) {
    if (!account || normaliseBankIdentity(account.bank_identity) !== this.bank_identity) return [];
    return this.options.filter(option => account.canUseOption(option));
  }

  getEligibleOptions({ account, amount, investmentDate, simulationEndDate }) {
    if (!account) throw new TypeError("An account is required to resolve FD options.");
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Investment amount must be finite and non-negative.");
    const start = parseISODate(investmentDate);
    const end = parseISODate(simulationEndDate);
    return this.getAccountOptions(account).filter(option => option.canInvest(amount, start, end));
  }
}

export class FDOptionManager {
  constructor(options = []) {
    if (!Array.isArray(options)) throw new TypeError("FD options must be supplied as an array.");
    this.globalOptions = Object.freeze(options.filter(option => !normaliseBankIdentity(option.bank_identity)).sort(compareFDOptions));
    const grouped = new Map();
    for (const option of options) {
      const bank = normaliseBankIdentity(option.bank_identity);
      if (!bank) continue;
      if (!grouped.has(bank)) grouped.set(bank, []);
      grouped.get(bank).push(option);
    }
    this.banks = new Map();
    for (const [bank, bankOptions] of grouped) {
      this.banks.set(bank, new BankFDOptionManager(bank, [...this.globalOptions, ...bankOptions]));
    }
    Object.freeze(this);
  }

  getBankManager(bankIdentity) {
    const bank = normaliseBankIdentity(bankIdentity);
    return this.banks.get(bank) ?? new BankFDOptionManager(bank, this.globalOptions);
  }
  getAccountOptions(account) { return this.getBankManager(account?.bank_identity).getAccountOptions(account); }
  getEligibleOptions(args) { return this.getBankManager(args?.account?.bank_identity).getEligibleOptions(args); }
  getOption(bankIdentity, key) { return this.getBankManager(bankIdentity).getOption(key); }
}
