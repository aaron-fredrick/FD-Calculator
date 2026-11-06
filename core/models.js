import { addPeriod, daysBetween, parsePeriodDays } from "./dates.js";
import { calcInterest } from "./interest.js";

export const CUMULATIVE = "cumulative";
export const PERIODIC_INTEREST = "periodic_interest";
export const INSTALLMENT = "installment";
export const AIT_RATE = 0.10;

export class Account {
  constructor({ id, bank_id = "", bank_key = "", label = "", balance = 0, supports_efd = true }) {
    if (!String(id ?? "").trim()) throw new TypeError("Account id is required.");
    if (typeof supports_efd !== "boolean") throw new TypeError("supports_efd must be a boolean.");
    if (!Number.isFinite(balance) || balance < 0) throw new RangeError("Account balance must be finite and non-negative.");
    this.id = String(id);
    this.bank_id = bank_id;
    this.bank_key = bank_key;
    this.label = label || `${(bank_key || bank_id).replace(/\b\w/g, c => c.toUpperCase())} Account`;
    this.balance = balance;
    this.supports_efd = supports_efd;
  }
  get bank_identity() { return this.bank_id || this.bank_key; }
  canUseOption(option) { return !option.is_efd || this.supports_efd; }
}

export class TransferFeeConfig {
  constructor({ default_inter_bank_fee = 30, same_bank_fee = 0, custom_fees = {}, bank_fees = {} } = {}) {
    this.default_inter_bank_fee = default_inter_bank_fee;
    this.same_bank_fee = same_bank_fee;
    this.custom_fees = custom_fees;
    this.bank_fees = bank_fees;
  }
  getFee(fromBankId, toBankId) {
    const from = String(fromBankId).trim().toUpperCase();
    const to = String(toBankId).trim().toUpperCase();
    const bankFee = this.bank_fees[from] ?? [this.same_bank_fee, this.default_inter_bank_fee];
    if (from === to) return bankFee[0];
    const override = this.custom_fees[JSON.stringify([from, to])];
    return override ?? bankFee[1];
  }
}

export class FDOption {
  constructor({ label, period_str, annual_rate, min_amount = 25000, payout_type = CUMULATIVE, payout_period_str = "", bank_key = "", is_efd = false, bank_id = "" }) {
    this.label = label;
    this.period_str = period_str;
    this.annual_rate = annual_rate;
    this.min_amount = min_amount;
    const aliases = { periodic: PERIODIC_INTEREST, monthly_interest: PERIODIC_INTEREST, emi: INSTALLMENT, lump: CUMULATIVE, maturity: CUMULATIVE };
    this.payout_type = aliases[String(payout_type).toLowerCase()] || String(payout_type).toLowerCase();
    if (![CUMULATIVE, PERIODIC_INTEREST, INSTALLMENT].includes(this.payout_type)) throw new RangeError(`Invalid payout type: ${payout_type}`);
    this.payout_period_str = payout_period_str;
    if (this.payout_type !== CUMULATIVE && !payout_period_str) throw new TypeError(`Option ${label} requires payout_period_str.`);
    this.bank_key = bank_key;
    this.bank_id = bank_id;
    this.is_efd = Boolean(is_efd);
    this.days = parsePeriodDays(period_str);
    this.payout_period_days = payout_period_str ? parsePeriodDays(payout_period_str) : this.days;
  }
  get bank_identity() { return this.bank_id || this.bank_key; }
  get economic_terms_key() {
    return JSON.stringify([this.bank_identity, this.days, this.annual_rate, this.min_amount, this.payout_type, this.payout_period_str]);
  }
  maturityDate(start) { return addPeriod(start, this.period_str); }
  fitsBefore(start, end) { return this.maturityDate(start) <= new Date(end); }
  canInvest(cash, start, end) { return cash >= this.min_amount && this.fitsBefore(start, end); }
  totalInterestOn(principal, start = null, compound = false, actualLeapYear = true) {
    const days = start ? daysBetween(start, this.maturityDate(start)) : this.days;
    return calcInterest(principal, this.annual_rate, days, start, compound, actualLeapYear);
  }
  generateCashFlows(principal, start, compound = false, actualLeapYear = true) {
    const maturity = this.maturityDate(start);
    const tenorDays = daysBetween(start, maturity);
    if (this.payout_type === CUMULATIVE) {
      return [{ date: maturity, amount: principal + calcInterest(principal, this.annual_rate, tenorDays, start, compound, actualLeapYear) }];
    }
    if (this.payout_type === PERIODIC_INTEREST) {
      const flows = [];
      let current = start;
      for (let step = 1; ; step++) {
        const payDate = addPeriod(start, this.payout_period_str, step);
        if (payDate >= maturity) {
          const days = daysBetween(current, maturity);
          const interest = days > 0 ? calcInterest(principal, this.annual_rate, days, current, compound, actualLeapYear) : 0;
          flows.push({ date: maturity, amount: principal + interest });
          break;
        }
        flows.push({ date: payDate, amount: calcInterest(principal, this.annual_rate, daysBetween(current, payDate), current, compound, actualLeapYear) });
        current = payDate;
      }
      return flows;
    }
    const dates = [];
    for (let step = 1; ; step++) {
      const date = addPeriod(start, this.payout_period_str, step);
      dates.push(date);
      if (date >= maturity) break;
    }
    const totalInterest = calcInterest(principal, this.annual_rate, tenorDays, start, compound, actualLeapYear);
    const installment = (principal + totalInterest) / dates.length;
    return dates.map(date => ({ date, amount: installment }));
  }
  applyAITToCashFlows(principal, grossFlows, aitRate) {
    if (aitRate <= 0) return grossFlows.map(flow => ({ ...flow }));
    const totalInterest = grossFlows.reduce((sum, flow) => sum + flow.amount, 0) - principal;
    return grossFlows.map((flow, index) => {
      let interest;
      if (this.payout_type === CUMULATIVE) interest = flow.amount - principal;
      else if (this.payout_type === PERIODIC_INTEREST) interest = flow.amount - (index === grossFlows.length - 1 ? principal : 0);
      else interest = totalInterest / grossFlows.length;
      const withheld = Math.round(Math.max(0, interest) * aitRate * 100) / 100;
      return { date: flow.date, amount: Math.round((flow.amount - withheld) * 100) / 100 };
    });
  }
  generateCashFlowComponentsAfterAIT(principal, start, aitRate, compound = false, actualLeapYear = true) {
    const grossFlows = this.generateCashFlows(principal, start, compound, actualLeapYear);
    const totalInterest = grossFlows.reduce((sum, flow) => sum + flow.amount, 0) - principal;
    let principalAllocated = 0;
    return grossFlows.map((flow, index) => {
      let principalComponent = 0;
      if (this.payout_type === CUMULATIVE || this.payout_type === PERIODIC_INTEREST) {
        if (index === grossFlows.length - 1) principalComponent = principal;
      } else {
        principalComponent = index === grossFlows.length - 1
          ? Math.round((principal - principalAllocated) * 100) / 100
          : Math.round((principal / grossFlows.length) * 100) / 100;
        principalAllocated += principalComponent;
      }
      const grossInterest = Math.max(0, flow.amount - principalComponent);
      const aitBase = this.payout_type === INSTALLMENT
        ? totalInterest / grossFlows.length : grossInterest;
      const withheld = Math.round(Math.max(0, aitBase) * Math.max(0, aitRate) * 100) / 100;
      const netInterest = Math.round((grossInterest - withheld) * 100) / 100;
      const principalAmount = Math.round(principalComponent * 100) / 100;
      return {
        date: flow.date,
        principal: principalAmount,
        interest: netInterest,
        amount: Math.round((principalAmount + netInterest) * 100) / 100,
        ait_withheld: withheld
      };
    });
  }
  generateCashFlowsAfterAIT(principal, start, aitRate, compound = false, actualLeapYear = true) {
    return this.applyAITToCashFlows(principal, this.generateCashFlows(principal, start, compound, actualLeapYear), aitRate);
  }
}
