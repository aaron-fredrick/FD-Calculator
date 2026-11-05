import { Account, TransferFeeConfig } from "../../src/core/models.js";
import { Event, EventType, normalizeInflowSchedule } from "../../src/core/events.js";
import { Booking, SimResult } from "../../src/core/results.js";
import { formatISODate, parseISODate } from "../../src/core/dates.js";
import { validateOutflowSchedule } from "../../src/core/cashflows.js";
import { FDOptionManager } from "../../src/fd-options/index.js";

const EPS = 0.001;
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const sumBalances = accounts => Object.values(accounts).reduce((sum, account) => sum + account.balance, 0);
const dateKey = date => Number(formatISODate(date).replaceAll("-", ""));
const keyDate = key => String(key).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

const validateTenorTieBreaker = (value, name) => {
  if (!["shortest", "longest"].includes(value)) {
    throw new RangeError(name + ' must be "shortest" or "longest".');
  }
  return value;
};

export function selectBestOption(candidates, tenorTieBreaker = "shortest") {
  validateTenorTieBreaker(tenorTieBreaker, "tenor_tiebreaker");
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const tenorOrder = tenorTieBreaker === "shortest"
      ? Number(a.days) - Number(b.days)
      : Number(b.days) - Number(a.days);
    return Number(b.annual_rate) - Number(a.annual_rate) ||
      tenorOrder ||
      // Prefer eFD only when economic terms are otherwise equivalent.
      (a.economic_terms_key === b.economic_terms_key
        ? Number(Boolean(b.is_efd)) - Number(Boolean(a.is_efd)) : 0);
  })[0] ?? null;
}

export function compareGreedyPlans(a, b, tenorTieBreaker = "shortest") {
  validateTenorTieBreaker(tenorTieBreaker, "plan_tenor_tiebreaker");
  const tenorOrder = tenorTieBreaker === "shortest"
    ? Number(a.days) - Number(b.days)
    : Number(b.days) - Number(a.days);
  return Number(b.rate) - Number(a.rate) ||
    tenorOrder ||
    Number(b.net_interest) - Number(a.net_interest) ||
    Number(a.fees_today) - Number(b.fees_today);
}

function pickDailyGreedyPlan(accounts, options, optionManager, today, end, feeConfig, consolidationId, compound, actualLeapYear, aitRate, tenorTieBreaker, planTenorTieBreaker) {
  const active = Object.values(accounts).filter(account => account.balance > EPS);
  if (!active.length) return { type: "CARRY", carries: [] };
  const splitBookings = [], splitCarries = [];
  let splitGross = 0;
  for (const account of active) {
    const eligible = optionManager.getEligibleOptions({ account, amount: account.balance, investmentDate: today, simulationEndDate: end });
    const option = selectBestOption(eligible, tenorTieBreaker);
    if (!option) { splitCarries.push(account); continue; }
    const interest = option.totalInterestOn(account.balance, today, compound, actualLeapYear);
    splitBookings.push({ account, option, principal: account.balance, interest, rate: option.annual_rate, days: option.days });
    splitGross += interest;
  }
  let split = null;
  if (splitBookings.length) {
    split = {
      type: "SPLIT", bookings: splitBookings, transfers: [], carries: splitCarries,
      rate: Math.max(...splitBookings.map(item => item.rate)),
      days: Math.min(...splitBookings.map(item => item.days)),
      fees_today: 0, fees_eval: 0, gross_interest: splitGross,
      net_interest: splitGross * (1 - aitRate)
    };
  }

  const consolidationPlans = [];
  for (const target of Object.values(accounts)) {
    const transfers = [], carries = [];
    let deployable = 0, feesToday = 0, feesEval = 0;
    for (const source of Object.values(accounts)) {
      if (source.balance <= EPS) continue;
      if (source.id === target.id) { deployable += source.balance; continue; }
      const fee = feeConfig.getFee(source.bank_identity, target.bank_identity);
      if (source.balance <= fee) { carries.push(source); continue; }
      const net = source.balance - fee;
      deployable += net;
      feesToday += fee;
      feesEval += source.id === consolidationId ? 2 * fee : target.id === consolidationId ? fee : 2 * fee;
      transfers.push({ src: source, tgt: target, amount: source.balance, fee, net });
    }
    if (!transfers.length) continue;
    const eligible = optionManager.getEligibleOptions({ account: target, amount: deployable, investmentDate: today, simulationEndDate: end });
    const option = selectBestOption(eligible, tenorTieBreaker);
    if (!option) continue;
    const gross = option.totalInterestOn(deployable, today, compound, actualLeapYear);
    const net = gross * (1 - aitRate) - feesEval;
    if (net <= 0) continue;
    consolidationPlans.push({
      type: "CONSOLIDATE", target_account: target, option, transfers,
      booking: { account: target, option, principal: deployable }, carries,
      rate: option.annual_rate, days: option.days, fees_today: feesToday,
      fees_eval: feesEval, gross_interest: gross, net_interest: net
    });
  }

  const candidates = split ? [split] : [];
  for (const plan of consolidationPlans) {
    if (split) {
      if (plan.rate > split.rate && plan.net_interest > split.net_interest) candidates.push(plan);
      else if (plan.rate === split.rate && plan.net_interest > split.net_interest + 0.01) candidates.push(plan);
    } else if (plan.net_interest > 0) candidates.push(plan);
  }
  if (!candidates.length) return { type: "CARRY", carries: active };

  const equivalentEfdCount = plan => {
    const selected = (plan.bookings || []).map(item => [item.account, item.option]);
    if (plan.option && plan.target_account) selected.push([plan.target_account, plan.option]);
    return selected.filter(([account, option]) => option.is_efd && optionManager.getAccountOptions(account).some(standard =>
      !standard.is_efd && standard.economic_terms_key === option.economic_terms_key)).length;
  };
  candidates.sort((a, b) =>
    compareGreedyPlans(a, b, planTenorTieBreaker) ||
    equivalentEfdCount(b) - equivalentEfdCount(a));
  return candidates[0];
}

// Frozen pre-session Greedy implementation used only as a migration parity oracle.
export class LegacyGreedyStrategy {
  static name = "LegacyGreedyOracle";
  constructor({
    compound = false, actual_leap_year = true, ait_enabled = false, ait_rate = 0.10,
    tenor_tiebreaker = "shortest", plan_tenor_tiebreaker = "shortest"
  } = {}) {
    this.name = "Greedy";
    this.compound = compound;
    this.actual_leap_year = actual_leap_year;
    this.ait_enabled = ait_enabled;
    this.ait_rate = ait_rate;
    this.effective_ait_rate = ait_enabled ? ait_rate : 0;
    this.tenor_tiebreaker = validateTenorTieBreaker(tenor_tiebreaker, "tenor_tiebreaker");
    this.plan_tenor_tiebreaker = validateTenorTieBreaker(plan_tenor_tiebreaker, "plan_tenor_tiebreaker");
  }

  simulate({
    options, start, end, inflow_schedule = {}, accounts = null, inflow_account_id = null,
    fee_config = null, consolidation_account_id = null, outflow_schedule = {}
  }) {
    const startDate = parseISODate(start), endDate = parseISODate(end);
    if (!Array.isArray(options) || !options.length) throw new TypeError("Greedy simulation requires FD options.");
    if (!accounts?.length) {
      const bank = options[0].bank_identity || "commercial";
      accounts = [new Account({ id: "default", bank_key: bank, bank_id: bank, label: "Main Account" })];
    }
    inflow_account_id ||= accounts[0].id;
    consolidation_account_id ||= inflow_account_id;
    fee_config ||= new TransferFeeConfig();
    const originalCapital = accounts.reduce((sum, account) => sum + account.balance, 0);
    const optionManager = new FDOptionManager(options);
    const accountMap = Object.fromEntries(accounts.map(account => [account.id, new Account({
      id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
      label: account.label, balance: account.balance, supports_efd: account.supports_efd
    })]));
    if (!accountMap[inflow_account_id]) throw new RangeError("inflow_account_id does not reference a configured account.");
    if (!accountMap[consolidation_account_id]) throw new RangeError("consolidation_account_id does not reference a configured account.");

    const normalizedInflows = normalizeInflowSchedule(inflow_schedule, inflow_account_id);
    const outflows = outflow_schedule || {};
    validateOutflowSchedule(outflows, formatISODate(startDate), formatISODate(endDate), new Set(Object.keys(accountMap)));
    const timeline = {};
    const bookings = [];
    const addEvent = event => { const key = event.date_key; (timeline[key] ||= []).push(event); };
    let inflowNumber = 0, bookingNumber = 0, totalFees = 0, totalOutflowsPaid = 0;
    for (const [date, amounts] of Object.entries(normalizedInflows).sort(([a], [b]) => a.localeCompare(b))) {
      const day = parseISODate(date);
      if (day > endDate) continue;
      for (const [accountId, amount] of Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b))) {
        const account = accountMap[accountId];
        if (!account) throw new RangeError("Inflow destination account " + accountId + " is not configured.");
        inflowNumber++;
        addEvent(new Event({ event_type: EventType.INFLOW, on_date: day, amount,
          label: "Inflow " + String(inflowNumber).padStart(2, "0"), account_id: accountId,
          bank_key: account.bank_key, bank_id: account.bank_id }));
      }
    }
    for (const [date, entries] of Object.entries(outflows).sort(([a], [b]) => a.localeCompare(b))) {
      const day = parseISODate(date);
      if (day < startDate || day > endDate) throw new RangeError("Outflow date is outside the investment period.");
      for (const entry of entries) {
        const account = accountMap[String(entry.account_id)];
        if (!account) throw new RangeError("Outflow destination account is not configured.");
        addEvent(new Event({ event_type: EventType.OUTFLOW, on_date: day, amount: Number(entry.amount),
          label: String(entry.name || "Outflow"), account_id: account.id,
          payment_policy: String(entry.payment_policy || "strict"), bank_key: account.bank_key, bank_id: account.bank_id }));
      }
    }
    const startKey = dateKey(startDate);
    if (!timeline[startKey] && Object.values(accountMap).some(account => account.balance > EPS)) {
      const account = accountMap[inflow_account_id];
      addEvent(new Event({ event_type: EventType.INFLOW, on_date: startDate, amount: 0,
        label: "Opening balance trigger", account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id }));
    }

    let pending = [], strictFailed = false;
    const processed = new Set();
    while (true) {
      const nextKeys = Object.keys(timeline).map(Number).filter(key => !processed.has(key)).sort((a, b) => a - b);
      if (!nextKeys.length) break;
      const key = nextKeys[0]; processed.add(key);
      const today = parseISODate(keyDate(key));
      const dayEvents = timeline[key];
      for (const event of dayEvents) {
        if ([EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY].includes(event.event_type)) {
          const account = accountMap[event.account_id] || accountMap[inflow_account_id];
          account.balance += event.amount;
          event.account_id = account.id; event.bank_key = account.bank_key; event.bank_id = account.bank_id;
          event.balance_after = account.balance; event.total_balance_after = sumBalances(accountMap);
        }
      }
      for (const event of dayEvents.filter(item => item.event_type === EventType.OUTFLOW)) {
        pending.push({ name: event.label, account_id: event.account_id, remaining: event.amount,
          payment_policy: event.payment_policy || "strict", due_date: today });
      }
      const policyOrder = { strict: 0, defer: 1, best_effort: 2 };
      const stillPending = [];
      pending.sort((a, b) => (policyOrder[a.payment_policy] ?? 3) - (policyOrder[b.payment_policy] ?? 3) || a.due_date - b.due_date);
      for (const obligation of pending) {
        const account = accountMap[obligation.account_id], required = Number(obligation.remaining);
        const policy = obligation.payment_policy;
        let paid = 0;
        if (policy === "strict") {
          if (account.balance + EPS < required) { strictFailed = true; stillPending.push(obligation); continue; }
          paid = required;
        } else if (policy === "defer") {
          if (account.balance + EPS < required) { stillPending.push(obligation); continue; }
          paid = required;
        } else {
          paid = Math.min(account.balance, required);
          if (paid + EPS < required) stillPending.push({ ...obligation, remaining: round2(required - paid) });
        }
        if (paid > EPS) {
          account.balance = round2(account.balance - paid);
          totalOutflowsPaid += paid;
          addEvent(new Event({ event_type: EventType.OUTFLOW, on_date: today, amount: -paid,
            label: "Paid " + obligation.name + " (" + policy + ")", account_id: account.id,
            bank_key: account.bank_key, bank_id: account.bank_id, balance_after: account.balance,
            total_balance_after: sumBalances(accountMap) }));
        }
      }
      pending = stillPending;
      if (strictFailed) break;

      const plan = pickDailyGreedyPlan(accountMap, options, optionManager, today, endDate, fee_config,
        consolidation_account_id, this.compound, this.actual_leap_year, this.effective_ait_rate,
        this.tenor_tiebreaker, this.plan_tenor_tiebreaker);
      const makeBooking = (account, option, principal, action, balancesBefore) => {
        account.balance = 0;
        bookingNumber++;
        const ref = "FD-" + String(bookingNumber).padStart(4, "0");
        const grossFlows = option.generateCashFlows(principal, today, this.compound, this.actual_leap_year);
        const netFlows = option.generateCashFlowsAfterAIT(principal, today, this.effective_ait_rate, this.compound, this.actual_leap_year);
        const booking = new Booking({ option, principal, start: today, cash_flows: grossFlows,
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id });
        bookings.push(booking);
        addEvent(new Event({ event_type: EventType.BOOKING, on_date: today, amount: principal,
          label: "Book " + option.label + " @ " + option.annual_rate.toFixed(2) + "% -> matures " + formatISODate(booking.end),
          booking_ref: ref, account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: account.balance, total_balance_after: sumBalances(accountMap),
          decision_context: { action, balances_before: balancesBefore } }));
        const maturity = booking.end;
        netFlows.forEach((flow, index) => {
          const isMaturity = flow.date.getTime() === maturity.getTime() &&
            (option.payout_type === "cumulative" || index === netFlows.length - 1);
          addEvent(new Event({ event_type: isMaturity ? EventType.MATURITY : EventType.CASH_FLOW,
            on_date: flow.date, amount: flow.amount,
            label: (isMaturity ? "Maturity " : "Cash flow ") + "[" + ref + "] (" + option.label + ")",
            booking_ref: ref, account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id }));
        });
      };
      const carries = plan.carries || [];
      if (plan.type === "CONSOLIDATE") {
        const target = plan.target_account, balancesBefore = Object.fromEntries(Object.entries(accountMap).map(([id, a]) => [id, a.balance]));
        for (const transfer of plan.transfers) {
          const { src, tgt, fee, net, amount } = transfer;
          totalFees += fee; src.balance = 0;
          const channel = src.bank_identity.trim().toUpperCase() === tgt.bank_identity.trim().toUpperCase() ? "intra_bank" : "domestic_ceft";
          addEvent(new Event({ event_type: EventType.TRANSFER, on_date: today, amount,
            label: "Transfer to " + tgt.label + " (Amt: " + net.toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
            account_id: src.id, bank_key: src.bank_key, bank_id: src.bank_id, transfer_channel: channel,
            fee, balance_after: src.balance, total_balance_after: sumBalances(accountMap) }));
          tgt.balance += net;
          addEvent(new Event({ event_type: EventType.TRANSFER, on_date: today, amount: net,
            label: "Transfer received from " + src.label, account_id: tgt.id,
            bank_key: tgt.bank_key, bank_id: tgt.bank_id, transfer_channel: channel,
            balance_after: tgt.balance, total_balance_after: sumBalances(accountMap) }));
        }
        const principal = target.balance;
        makeBooking(target, plan.option, principal, "consolidate", balancesBefore);
      } else if (plan.type === "SPLIT") {
        for (const item of plan.bookings) {
          const balancesBefore = Object.fromEntries(Object.entries(accountMap).map(([id, a]) => [id, a.balance]));
          makeBooking(item.account, item.option, item.account.balance, "split", balancesBefore);
        }
      }
      if (plan.type !== "CARRY") {
        for (const account of carries) if (account.balance > EPS) addEvent(new Event({
          event_type: EventType.CARRY_FORWARD, on_date: today, amount: account.balance,
          label: "Below min / no option fits; balance " + account.balance.toFixed(2) + " carries forward",
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: account.balance, total_balance_after: sumBalances(accountMap),
          decision_context: { action: "carry", balances_before: Object.fromEntries(Object.entries(accountMap).map(([id, a]) => [id, a.balance])) }
        }));
      } else {
        for (const account of carries) if (account.balance > EPS) addEvent(new Event({
          event_type: EventType.CARRY_FORWARD, on_date: today, amount: account.balance,
          label: "Below min / no option fits; balance " + account.balance.toFixed(2) + " carries forward",
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: account.balance, total_balance_after: sumBalances(accountMap),
          decision_context: { action: "carry", balances_before: Object.fromEntries(Object.entries(accountMap).map(([id, a]) => [id, a.balance])) }
        }));
      }
    }

    const totalInflow = Object.values(normalizedInflows).reduce((sum, amounts) =>
      sum + Object.values(amounts).reduce((inner, amount) => inner + amount, 0), 0);
    const result = new SimResult({ strategy_name: this.name, timeline, bookings,
      total_principal: totalInflow + originalCapital, end_date: endDate, accounts: accountMap,
      total_transfer_fees: totalFees, total_outflows_paid: totalOutflowsPaid,
      outstanding_outflows: pending, valid: !strictFailed, ait_enabled: this.ait_enabled, ait_rate: this.ait_rate });
    result.decision_log = [];
    return result;
  }
}
