import { Event, EventType } from "./events.js";
import { Account } from "./models.js";
import { Booking, SimResult } from "./results.js";
import { formatISODate, parseISODate } from "./dates.js";
import { SimulationState, validateStrategySignal, StrategySignalType } from "./strategy-contracts.js";

const EPS = 0.001;
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const POLICY_ORDER = { strict: 0, defer: 1, best_effort: 2 };
const dateKey = date => Number(formatISODate(date).replaceAll("-", ""));
const keyDate = key => String(key).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

/**
 * Shared authoritative executor for strategy decision sessions.
 *
 * Strategies can inspect planningView() and submit revision-bound signals.
 * This runtime alone processes actual events, settles obligations, performs
 * transfers/bookings, schedules actual cash flows, and constructs SimResult.
 */
export class SimulationRuntime {
  constructor(context, {
    strategy_name = "Strategy", compound = false, actual_leap_year = true,
    ait_enabled = false, ait_rate = 0.10, outflow_account_tiebreak = false
  } = {}) {
    if (!context?.accounts?.length || !context?.options?.length) {
      throw new TypeError("SimulationRuntime requires a normalized simulation context.");
    }
    this.context = context;
    this.strategyName = strategy_name;
    this.compound = Boolean(compound);
    this.actualLeapYear = Boolean(actual_leap_year);
    this.aitEnabled = Boolean(ait_enabled);
    this.aitRate = Number(ait_rate);
    this.effectiveAitRate = ait_enabled ? this.aitRate : 0;
    this.outflowAccountTiebreak = Boolean(outflow_account_tiebreak);
    this.accounts = new Map(context.accounts.map(account => [account.id, new Account({
      id: account.id, bank_id: account.bank_id, bank_key: account.bank_key,
      label: account.label, balance: account.balance, supports_efd: account.supports_efd
    })]));
    this.state = null;
    this.timeline = {};
    this.bookings = [];
    this.pending = [];
    this.processed = new Set();
    this.currentDate = null;
    this.bookingNumber = 0;
    this.totalFees = 0;
    this.totalOutflowsPaid = 0;
    this.totalInflows = Object.values(context.inflows).reduce((total, entries) =>
      total + Object.values(entries).reduce((sum, amount) => sum + amount, 0), 0);
    this.valid = true;
    this.decisionLog = [];
    this.#initializeEvents();
    this.#initializeState();
  }

  #initializeState() {
    this.state = new SimulationState([...this.accounts.values()]);
  }

  #initializeEvents() {
    let inflowNumber = 0;
    for (const [date, entries] of Object.entries(this.context.inflows).sort(([a], [b]) => a.localeCompare(b))) {
      for (const [accountId, amount] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
        const account = this.accounts.get(accountId);
        this.schedule(new Event({
          event_type: EventType.INFLOW, on_date: date, amount,
          label: "Inflow " + String(++inflowNumber).padStart(2, "0"),
          account_id: accountId, bank_key: account.bank_key, bank_id: account.bank_id
        }));
      }
    }
    for (const [date, entries] of Object.entries(this.context.outflows).sort(([a], [b]) => a.localeCompare(b))) {
      for (const entry of entries) {
        const account = this.accounts.get(String(entry.account_id));
        this.schedule(new Event({
          event_type: EventType.OUTFLOW, on_date: date, amount: Number(entry.amount),
          label: String(entry.name || "Outflow"), account_id: account.id,
          payment_policy: String(entry.payment_policy || "strict"),
          bank_key: account.bank_key, bank_id: account.bank_id
        }));
      }
    }
    const startKey = dateKey(this.context.start);
    if (!this.timeline[startKey] && [...this.accounts.values()].some(account => account.balance > EPS)) {
      const account = this.accounts.get(this.context.inflow_account_id);
      this.schedule(new Event({
        event_type: EventType.INFLOW, on_date: this.context.start, amount: 0,
        label: "Opening balance trigger", account_id: account.id,
        bank_key: account.bank_key, bank_id: account.bank_id
      }));
    }
  }

  schedule(event) {
    if (!(event instanceof Event)) throw new TypeError("SimulationRuntime only schedules Event instances.");
    if (event.on_date < this.context.start || event.on_date > this.context.end) {
      throw new RangeError("Scheduled event is outside the simulation period.");
    }
    (this.timeline[event.date_key] ??= []).push(event);
    return event;
  }

  #balanceMap() {
    return new Map(this.state.snapshot().map(account => [account.id, account.balance]));
  }

  #commitBalances(balances) {
    this.state.applyBalanceUpdates([...balances].map(([account_id, balance]) => ({ account_id, balance })), this.state.revision);
  }

  #totalBalance(balances) {
    return [...balances.values()].reduce((sum, balance) => sum + balance, 0);
  }

  nextEventDate() {
    const keys = Object.keys(this.timeline).map(Number)
      .filter(key => !this.processed.has(key) && keyDate(key) <= this.context.end_iso)
      .sort((a, b) => a - b);
    if (keys.length) return parseISODate(keyDate(keys[0]));
    if (!this.processed.has(dateKey(this.context.start))) return new Date(this.context.start);
    return null;
  }

  processDate(date) {
    const today = parseISODate(date);
    if (today < this.context.start || today > this.context.end) {
      throw new RangeError("Cannot process a date outside the simulation period.");
    }
    const key = dateKey(today);
    if (this.processed.has(key)) throw new Error("Simulation date has already been processed.");
    this.processed.add(key);
    this.currentDate = today;
    const balances = this.#balanceMap();
    const events = this.timeline[key] ?? [];

    for (const event of events) {
      if (![EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY].includes(event.event_type)) continue;
      const account = this.accounts.get(event.account_id) ?? this.accounts.get(this.context.inflow_account_id);
      if (!account) throw new RangeError("Event references an unknown account.");
      balances.set(account.id, (balances.get(account.id) ?? 0) + event.amount);
      event.account_id = account.id;
      event.bank_key = account.bank_key;
      event.bank_id = account.bank_id;
      event.balance_after = balances.get(account.id);
      event.total_balance_after = this.#totalBalance(balances);
    }

    const dueOutflowEvents = events.filter(event => event.event_type === EventType.OUTFLOW);
    for (const event of dueOutflowEvents) {
      this.pending.push({
        name: event.label, account_id: event.account_id,
        remaining: event.amount, payment_policy: event.payment_policy || "strict",
        due_date: today
      });
    }

    const remaining = [];
    this.pending.sort((a, b) =>
      (POLICY_ORDER[a.payment_policy] ?? 3) - (POLICY_ORDER[b.payment_policy] ?? 3) ||
      formatISODate(a.due_date).localeCompare(formatISODate(b.due_date)) ||
      (this.outflowAccountTiebreak ? a.account_id.localeCompare(b.account_id) : 0));
    for (const obligation of this.pending) {
      const account = this.accounts.get(obligation.account_id);
      if (!account) throw new RangeError("Pending outflow targets an unknown account.");
      const required = Number(obligation.remaining);
      const available = balances.get(account.id) ?? 0;
      let paid = 0;
      if (obligation.payment_policy === "strict") {
        if (available + EPS < required) {
          this.valid = false;
          remaining.push(obligation);
          continue;
        }
        paid = required;
      } else if (obligation.payment_policy === "defer") {
        if (available + EPS < required) {
          remaining.push(obligation);
          continue;
        }
        paid = required;
      } else if (obligation.payment_policy === "best_effort") {
        paid = Math.min(available, required);
      } else {
        throw new RangeError("Unknown outflow payment policy: " + obligation.payment_policy);
      }

      if (paid > EPS) {
        balances.set(account.id, round2(available - paid));
        this.totalOutflowsPaid += paid;
        const paidEvent = new Event({
          event_type: EventType.OUTFLOW, on_date: today, amount: -paid,
          label: "Paid " + obligation.name + " (" + obligation.payment_policy + ")",
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: balances.get(account.id), total_balance_after: this.#totalBalance(balances)
        });
        (this.timeline[key] ??= []).push(paidEvent);
      }
      const unpaid = round2(required - paid);
      if (unpaid > EPS) remaining.push({ ...obligation, remaining: unpaid });
    }
    this.pending = remaining;
    this.#commitBalances(balances);
    return { date: today, valid: this.valid, events: this.timeline[key] ?? [] };
  }

  planningView() {
    if (!this.currentDate) throw new Error("Process the initial event boundary before requesting a planning view.");
    const futureDates = Object.keys(this.timeline).map(Number)
      .filter(key => !this.processed.has(key) && keyDate(key) > formatISODate(this.currentDate))
      .map(keyDate);
    return this.state.planningView({
      date: formatISODate(this.currentDate), end_date: this.context.end_iso,
      pending_outflows: this.pending.map(item => ({ ...item, due_date: formatISODate(item.due_date) })),
      scheduled_dates: futureDates
    });
  }

  executeSignal(signal) {
    if (!this.currentDate) throw new Error("Process an event boundary before executing a strategy signal.");
    const view = this.planningView();
    validateStrategySignal(signal, {
      revision: view.revision,
      current_date: formatISODate(this.currentDate),
      end_date: this.context.end_iso
    });
    if (signal.signal_type === StrategySignalType.WAIT ||
        signal.signal_type === StrategySignalType.COMPLETE) return signal;

    const balances = this.#balanceMap();
    const balancesAtDecisionStart = Object.fromEntries(balances);
    const account = id => {
      const value = this.accounts.get(String(id));
      if (!value) throw new RangeError("Decision references unknown account " + id + ".");
      return value;
    };
    const transfer = item => {
      const source = account(item.source_account_id);
      const target = account(item.target_account_id);
      if (source.id === target.id) throw new RangeError("Transfer source and target must differ.");
      const amount = Number(item.amount);
      const expectedFee = this.context.fee_config.getFee(source.bank_identity, target.bank_identity);
      const fee = Number(item.fee);
      if (!Number.isFinite(amount) || amount <= 0 || amount > (balances.get(source.id) ?? 0) + 1e-9) {
        throw new RangeError("Transfer amount exceeds available source balance.");
      }
      if (!Number.isFinite(expectedFee) || expectedFee < 0 ||
          !Number.isFinite(fee) || Math.abs(fee - expectedFee) > EPS || amount <= fee) {
        throw new RangeError("Transfer fee or net transfer amount is invalid.");
      }
      const channel = source.bank_identity.trim().toUpperCase() === target.bank_identity.trim().toUpperCase()
        ? "intra_bank" : "domestic_ceft";
      balances.set(source.id, (balances.get(source.id) ?? 0) - amount);
      const sourceTotalAfter = this.#totalBalance(balances);
      pendingFees += fee;
      this.schedule(new Event({
        event_type: EventType.TRANSFER, on_date: this.currentDate, amount,
        label: "Transfer to " + target.label + " (Amt: " + (amount - fee).toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
        account_id: source.id, bank_key: source.bank_key, bank_id: source.bank_id,
        transfer_channel: channel, fee, balance_after: balances.get(source.id),
        total_balance_after: sourceTotalAfter
      }));
      balances.set(target.id, (balances.get(target.id) ?? 0) + amount - fee);
      this.schedule(new Event({
        event_type: EventType.TRANSFER, on_date: this.currentDate, amount: amount - fee,
        label: "Transfer received from " + source.label, account_id: target.id,
        bank_key: target.bank_key, bank_id: target.bank_id,
        transfer_channel: channel, balance_after: balances.get(target.id),
        total_balance_after: this.#totalBalance(balances)
      }));
    };
    const book = (item, balancesBeforeOverride = null) => {
      const target = account(item.account_id);
      const optionIndex = Number(item.option_index);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= this.context.options.length) {
        throw new RangeError("Booking references an invalid FD option index.");
      }
      const option = this.context.options[optionIndex];
      const principal = Number(item.principal);
      const available = balances.get(target.id) ?? 0;
      const fitsHorizon = option.fitsBefore(this.currentDate, this.context.end);
      const accountEligible = target.canUseOption(option);
      if (!Number.isFinite(principal) || principal <= 0 ||
          principal > available + 1e-9 ||
          principal + EPS < option.min_amount ||
          !accountEligible || !fitsHorizon) {
        throw new RangeError("Booking is not eligible: " + JSON.stringify({
          date: formatISODate(this.currentDate), account_id: target.id, principal,
          available, minimum: option.min_amount, efd: option.is_efd,
          supports_efd: target.supports_efd, accountEligible, fitsHorizon,
          maturity: formatISODate(option.maturityDate(this.currentDate)),
          end: this.context.end_iso
        }));
      }
      const balancesBeforeBooking = balancesBeforeOverride ?? Object.fromEntries(balances);
      balances.set(target.id, (balances.get(target.id) ?? 0) - principal);
      const grossFlows = option.generateCashFlows(principal, this.currentDate, this.compound, this.actualLeapYear);
      const netFlows = option.generateCashFlowsAfterAIT(principal, this.currentDate, this.effectiveAitRate, this.compound, this.actualLeapYear);
      const booking = new Booking({
        option, principal, start: this.currentDate, cash_flows: grossFlows,
        account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id
      });
      const ref = "FD-" + String(++pendingBookingNumber).padStart(4, "0");
      pendingBookings.push(booking);
      this.schedule(new Event({
        event_type: EventType.BOOKING, on_date: this.currentDate, amount: principal,
        label: "Book " + option.label + " @ " + option.annual_rate.toFixed(2) + "% -> matures " + formatISODate(booking.end),
        booking_ref: ref, account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id,
        balance_after: balances.get(target.id), total_balance_after: this.#totalBalance(balances),
        decision_context: { action: signal.action.toLowerCase(), balances_before: balancesBeforeBooking }
      }));
      netFlows.forEach((flow, index) => {
        const maturity = flow.date.getTime() === booking.end.getTime() &&
          (option.payout_type === "cumulative" || index === netFlows.length - 1);
        this.schedule(new Event({
          event_type: maturity ? EventType.MATURITY : EventType.CASH_FLOW,
          on_date: flow.date, amount: flow.amount,
          label: (maturity ? "Maturity " : "Cash flow ") + "[" + ref + "] (" + option.label + ")",
          booking_ref: ref, account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id
        }));
      });
    };

    // Validate the complete decision against a private balance copy first.
    // Any failure leaves authoritative balances and ledger untouched.
    const pendingEvents = [];
    const pendingBookings = [];
    let pendingBookingNumber = this.bookingNumber;
    let pendingFees = 0;
    const originalSchedule = this.schedule.bind(this);
    this.schedule = event => { pendingEvents.push(event); return event; };
    try {
      if (signal.action === "CONSOLIDATE") {
        for (const item of signal.plan.transfers ?? []) transfer(item);
        book({
          account_id: signal.plan.target_account_id,
          option_index: signal.plan.option_index,
          principal: signal.plan.principal
        }, balancesAtDecisionStart);
      } else if (signal.action === "SPLIT") {
        for (const item of signal.plan.bookings ?? []) book(item);
      } else if (signal.action === "CARRY") {
        // Carry decisions do not mutate cash. Their events are emitted below.
      }
      for (const id of signal.plan.carries ?? []) {
        const target = account(id);
        const amount = balances.get(target.id) ?? 0;
        if (amount <= EPS) continue;
        const balancesBeforeCarry = signal.plan.carry_snapshot === "decision_start"
          ? balancesAtDecisionStart : Object.fromEntries(balances);
        pendingEvents.push(new Event({
          event_type: EventType.CARRY_FORWARD, on_date: this.currentDate, amount,
          label: signal.plan.carry_label
            ? signal.plan.carry_label + "; balance " + amount.toFixed(2) + " carries forward"
            : "Below min / no option fits; balance " + amount.toFixed(2) + " carries forward",
          account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id,
          balance_after: amount, total_balance_after: this.#totalBalance(balances),
          decision_context: { action: "carry", balances_before: balancesBeforeCarry }
        }));
      }
    } finally {
      this.schedule = originalSchedule;
    }

    this.#commitBalances(balances);
    this.totalFees += pendingFees;
    this.bookingNumber = pendingBookingNumber;
    this.bookings.push(...pendingBookings);
    for (const event of pendingEvents) originalSchedule(event);
    this.decisionLog.push({ date: formatISODate(this.currentDate), action: signal.action });
    return signal;
  }

  buildResult() {
    const accounts = {};
    const balances = this.#balanceMap();
    for (const [id, account] of this.accounts) {
      accounts[id] = new Account({
        id, bank_id: account.bank_id, bank_key: account.bank_key, label: account.label,
        balance: balances.get(id) ?? 0, supports_efd: account.supports_efd
      });
    }
    const outstanding = this.pending.map(item => ({
      name: item.name, account_id: item.account_id, remaining: item.remaining,
      payment_policy: item.payment_policy, due_date: item.due_date
    }));
    return new SimResult({
      strategy_name: this.strategyName, timeline: this.timeline, bookings: this.bookings,
      total_principal: this.context.original_capital + this.totalInflows,
      end_date: this.context.end, accounts, total_transfer_fees: this.totalFees,
      total_outflows_paid: this.totalOutflowsPaid, outstanding_outflows: outstanding,
      valid: this.valid, ait_enabled: this.aitEnabled, ait_rate: this.aitRate,
      decision_log: this.decisionLog
    });
  }
}
