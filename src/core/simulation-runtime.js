import { Event, EventType } from "./events.js";
import { Account, AIT_RATE } from "./models.js";
import { Booking, SimResult } from "./results.js";
import { formatISODate, parseISODate, daysBetween } from "./dates.js";
import { SimulationState, validateStrategySignal, StrategySignalType, StrategyDecisionType } from "./strategy-contracts.js";
import { BalanceProvenance } from "./balance-provenance.js";

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
    ait_enabled = false, ait_rate = AIT_RATE, outflow_account_tiebreak = false,
    outflow_due_date_sort = "iso", round_balances = false, opening_trigger_always = false
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
    this.outflowDueDateSort = outflow_due_date_sort;
    this.roundBalances = Boolean(round_balances);
    this.openingTriggerAlways = Boolean(opening_trigger_always);
    this.accounts = new Map(context.accounts.map(account => [account.id, new Account({
      id: account.id, bank_id: account.bank_id, bank_key: account.bank_key,
      label: account.label, balance: account.balance, supports_efd: account.supports_efd
    })]));
    this.state = null;
    this.provenance = new BalanceProvenance(this.accounts.keys());
    this.bookingProvenance = new Map();
    this.timeline = {};
    this.bookings = [];
    this.pending = [];
    this.processed = new Set();
    this.currentDate = null;
    this.goalOutcome = null;
    this.bookingNumber = 0;
    this.totalFees = 0;
    this.totalOutflowsPaid = 0;
    this.totalInflows = 0;
    this.valid = true;
    this.#initializeEvents();
    this.#initializeState();
  }

  #initializeState() {
    this.state = new SimulationState([...this.accounts.values()]);
    for (const account of this.accounts.values()) this.provenance.addPrincipal(account.id, account.balance);
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
    if ((this.openingTriggerAlways || !this.timeline[startKey]) &&
        [...this.accounts.values()].some(account => account.balance > EPS)) {
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

  #assertProvenance(balances) {
    for (const [id, balance] of balances) {
      if (Math.abs(round2(balance) - this.provenance.total(id)) > 0.02) {
        throw new Error("Balance provenance does not reconcile for account " + id + " on " + formatISODate(this.currentDate) + ": balance=" + round2(balance) + ", provenance=" + this.provenance.total(id) + ", events=" + JSON.stringify((this.timeline[dateKey(this.currentDate)] ?? []).filter(event => event.account_id === id).map(event => ({ type: event.event_type, amount: event.amount, label: event.label, cash_components: event.cash_components }))) + ".");
      }
    }
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
      const nextBalance = (balances.get(account.id) ?? 0) + event.amount;
      balances.set(account.id, this.roundBalances ? round2(nextBalance) : nextBalance);
      event.account_id = account.id;
      event.bank_key = account.bank_key;
      event.bank_id = account.bank_id;
      event.balance_after = balances.get(account.id);
      event.total_balance_after = this.#totalBalance(balances);
      if (event.event_type === EventType.INFLOW) {
        this.totalInflows += event.amount;
        this.provenance.addPrincipal(account.id, event.amount);
      } else if (event.cash_components) {
        this.provenance.addCashFlow(
          account.id, event.cash_components.principal_components ?? {}, event.cash_components.interest ?? 0
        );
      } else {
        // Compatibility for externally-created cash events without component metadata.
        this.provenance.addPrincipal(account.id, event.amount);
      }
    }
    this.provenance.recognizeConsolidationCredit(this.context.consolidation_account_id);

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
      (this.outflowDueDateSort === "string"
        ? String(a.due_date).localeCompare(String(b.due_date))
        : formatISODate(a.due_date).localeCompare(formatISODate(b.due_date))) ||
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
        this.provenance.debit(account.id, paid);
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
    for (const event of this.timeline[key] ?? []) event.goal_metric_after = this.provenance.creditedNetInterest;
    if (this.context.simulation?.mode === "goal") this.#assertProvenance(balances);
    else for (const [id, balance] of balances) this.provenance.reconcile(id, balance);
    this.#commitBalances(balances);
    return { date: today, valid: this.valid, events: this.timeline[key] ?? [] };
  }

  isGoalAchieved() {
    const goal = this.context.simulation?.goal;
    if (!goal || this.goalOutcome || this.provenance.creditedNetInterest + EPS < goal.target) return Boolean(this.goalOutcome?.achieved);
    const actual = this.provenance.creditedNetInterest;
    this.goalOutcome = {
      achieved: true, target: goal.target, actual,
      achievement_date: formatISODate(this.currentDate),
      elapsed_days: daysBetween(this.context.start, this.currentDate),
      overshoot: round2(actual - goal.target),
      stopping_reason: "goal_achieved"
    };
    return true;
  }

  completeGoalOutcome(stoppingReason = null) {
    const goal = this.context.simulation?.goal;
    if (!goal || this.goalOutcome) return this.goalOutcome;
    const actual = this.provenance.creditedNetInterest;
    this.goalOutcome = {
      achieved: false, target: goal.target, actual,
      achievement_date: null, elapsed_days: null, overshoot: 0,
      shortfall: round2(Math.max(0, goal.target - actual)),
      safety_horizon_end_date: this.context.end_iso,
      stopping_reason: this.valid ? (stoppingReason ?? "safety_horizon_reached") : "simulation_invalid"
    };
    return this.goalOutcome;
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
    const provenance = this.provenance.clone();
    const pendingBookingProvenance = new Map();
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
      let amount = Number(item.amount);
      const expectedFee = this.context.fee_config.getFee(source.bank_identity, target.bank_identity);
      const fee = Number(item.fee);
      const available = balances.get(source.id) ?? 0;
      if (!Number.isFinite(amount) || amount <= 0 || amount > available + 1e-9) {
        throw new RangeError("Transfer amount exceeds available source balance.");
      }
      // Validation permits a 1e-9 tolerance for floating-point residue. Clamp
      // that tolerated excess before updating balances or provenance.
      if (amount > available) amount = available;
      if (!Number.isFinite(expectedFee) || expectedFee < 0 ||
          !Number.isFinite(fee) || Math.abs(fee - expectedFee) > EPS || amount <= fee) {
        throw new RangeError("Transfer fee or net transfer amount is invalid.");
      }
      const channel = source.bank_identity.trim().toUpperCase() === target.bank_identity.trim().toUpperCase()
        ? "intra_bank" : "domestic_ceft";
      provenance.transfer(source.id, target.id, amount, fee);
      if (target.id === this.context.consolidation_account_id) provenance.recognizeConsolidationCredit(target.id);
      const sourceBalance = (balances.get(source.id) ?? 0) - amount;
      balances.set(source.id, this.roundBalances ? round2(sourceBalance) : sourceBalance);
      const sourceTotalAfter = this.#totalBalance(balances);
      pendingFees += fee;
      this.schedule(new Event({
        event_type: EventType.TRANSFER, on_date: this.currentDate, amount,
        label: "Transfer to " + target.label + " (Amt: " + (amount - fee).toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
        account_id: source.id, bank_key: source.bank_key, bank_id: source.bank_id,
        transfer_channel: channel, fee, balance_after: balances.get(source.id),
        total_balance_after: sourceTotalAfter
      }));
      const targetBalance = (balances.get(target.id) ?? 0) + amount - fee;
      balances.set(target.id, this.roundBalances ? round2(targetBalance) : targetBalance);
      this.schedule(new Event({
        event_type: EventType.TRANSFER, on_date: this.currentDate, amount: amount - fee,
        label: "Transfer received from " + source.label, account_id: target.id,
        bank_key: target.bank_key, bank_id: target.bank_id,
        transfer_channel: channel, balance_after: balances.get(target.id),
        total_balance_after: this.#totalBalance(balances)
      }));
    };
    const book = (item, balancesBeforeOverride = null, actionName = signal.action, decisionContextOverride = null) => {
      const target = account(item.account_id);
      const optionIndex = Number(item.option_index);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= this.context.options.length) {
        throw new RangeError("Booking references an invalid FD option index.");
      }
      const option = this.context.options[optionIndex];
      const available = balances.get(target.id) ?? 0;
      const requestedPrincipal = Number(item.principal);
      // Search projections intentionally round hypothetical balances to cents.
      // When the selected path books the whole account, replay against the
      // authoritative amount if the difference is only that rounding residue.
      const principal = Math.abs(available - requestedPrincipal) <= EPS
        ? available : requestedPrincipal;
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
      const remainingBalance = (balances.get(target.id) ?? 0) - principal;
      balances.set(target.id, this.roundBalances ? round2(remainingBalance) : remainingBalance);
      const grossFlows = option.generateCashFlows(principal, this.currentDate, this.compound, this.actualLeapYear);
      const bookedComponents = provenance.debit(target.id, principal);
      const netFlows = option.generateCashFlowComponentsAfterAIT(principal, this.currentDate, this.effectiveAitRate, this.compound, this.actualLeapYear);
      const booking = new Booking({
        option, principal, start: this.currentDate, cash_flows: grossFlows,
        account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id
      });
      const ref = "FD-" + String(++pendingBookingNumber).padStart(4, "0");
      pendingBookings.push(booking);
      pendingBookingProvenance.set(ref, bookedComponents);
      this.schedule(new Event({
        event_type: EventType.BOOKING, on_date: this.currentDate, amount: principal,
        label: "Book " + option.label + " @ " + option.annual_rate.toFixed(2) + "% -> matures " + formatISODate(booking.end),
        booking_ref: ref, account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id,
        balance_after: balances.get(target.id), total_balance_after: this.#totalBalance(balances),
        decision_context: decisionContextOverride ?? item.decision_context ?? { action: actionName.toLowerCase(), balances_before: balancesBeforeBooking }
      }));
      netFlows.forEach((flow, index) => {
        const maturity = flow.date.getTime() === booking.end.getTime() &&
          (option.payout_type === "cumulative" || index === netFlows.length - 1);
        this.schedule(new Event({
          event_type: maturity ? EventType.MATURITY : EventType.CASH_FLOW,
          on_date: flow.date, amount: flow.amount,
          label: (maturity ? "Maturity " : "Cash flow ") + "[" + ref + "] (" + option.label + ")",
          booking_ref: ref, account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id,
          cash_components: {
            principal_components: provenance.allocateBookedPrincipal(bookedComponents, flow.principal, principal),
            interest: flow.interest
          }
        }));
      });
    };

    // Validate the complete decision (or same-date batch) against a private
    // balance copy. Any failure leaves authoritative state and ledger untouched.
    const actions = signal.action === StrategyDecisionType.BATCH
      ? signal.plan.actions
      : [{ action: signal.action, plan: signal.plan }];
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new TypeError("A batched decision requires at least one action.");
    }
    for (const entry of actions) {
      if (!entry || !Object.values(StrategyDecisionType).includes(entry.action) ||
          entry.action === StrategyDecisionType.BATCH ||
          !entry.plan || typeof entry.plan !== "object" || Array.isArray(entry.plan)) {
        throw new TypeError("Batched decisions must contain valid non-batch actions and plans.");
      }
    }

    const pendingEvents = [];
    const pendingBookings = [];
    let pendingBookingNumber = this.bookingNumber;
    let pendingFees = 0;
    const originalSchedule = this.schedule.bind(this);
    this.schedule = event => { pendingEvents.push(event); return event; };
    try {
      for (const entry of actions) {
        const actionName = entry.action;
        const plan = entry.plan;
        const balancesAtActionStart = Object.fromEntries(balances);

        if (actionName === StrategyDecisionType.CONSOLIDATE) {
          for (const item of plan.transfers ?? []) transfer(item);
          book({
            account_id: plan.target_account_id,
            option_index: plan.option_index,
            principal: plan.principal,
            decision_context: plan.decision_context
          }, balancesAtActionStart, actionName, plan.decision_context);
        } else if (actionName === StrategyDecisionType.SPLIT) {
          for (const item of plan.bookings ?? []) {
            book(item, null, actionName, item.decision_context ?? plan.decision_context);
          }
        } else if (actionName !== StrategyDecisionType.CARRY) {
          throw new RangeError("Unsupported strategy action: " + actionName);
        }

        const carryIds = plan.carry_all ? [...this.accounts.keys()] : (plan.carries ?? []);
        for (const id of carryIds) {
          const target = account(id);
          const amount = balances.get(target.id) ?? 0;
          if (amount <= EPS) continue;
          const balancesBeforeCarry = plan.carry_snapshot === "decision_start"
            ? balancesAtActionStart : Object.fromEntries(balances);
          const carryContext = plan.carry_context ??
            { action: "carry", balances_before: balancesBeforeCarry };
          pendingEvents.push(new Event({
            event_type: EventType.CARRY_FORWARD, on_date: this.currentDate, amount,
            label: plan.carry_label
              ? plan.carry_label + "; balance " + amount.toFixed(2) + " carries forward"
              : "Below min / no option fits; balance " + amount.toFixed(2) + " carries forward",
            account_id: target.id, bank_key: target.bank_key, bank_id: target.bank_id,
            balance_after: amount, total_balance_after: this.#totalBalance(balances),
            decision_context: carryContext
          }));
        }
      }
    } finally {
      this.schedule = originalSchedule;
    }

    for (const event of pendingEvents) {
      if (!(event instanceof Event) || event.on_date < this.context.start || event.on_date > this.context.end) {
        throw new RangeError("Decision produced an invalid or out-of-horizon event; no state was committed.");
      }
    }
    if (!Number.isFinite(this.totalFees + pendingFees)) {
      throw new RangeError("Decision would produce a non-finite transfer-fee total.");
    }
    if (this.context.simulation?.mode === "goal") {
      for (const [id, balance] of balances) {
        if (Math.abs(round2(balance) - provenance.total(id)) > 0.02) throw new Error("Decision provenance does not reconcile for account " + id + ".");
      }
    } else {
      for (const [id, balance] of balances) provenance.reconcile(id, balance);
    }
    this.#commitBalances(balances);
    this.provenance = provenance;
    for (const [ref, components] of pendingBookingProvenance) this.bookingProvenance.set(ref, components);
    this.provenance.recognizeConsolidationCredit(this.context.consolidation_account_id);
    for (const event of pendingEvents) event.goal_metric_after = this.provenance.creditedNetInterest;
    this.totalFees += pendingFees;
    this.bookingNumber = pendingBookingNumber;
    this.bookings.push(...pendingBookings);
    for (const event of pendingEvents) originalSchedule(event);
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
    const result = new SimResult({
      strategy_name: this.strategyName, timeline: this.timeline, bookings: this.bookings,
      total_principal: this.context.original_capital + this.totalInflows,
      end_date: this.context.simulation?.mode === "goal" ? (this.currentDate ?? this.context.end) : this.context.end, accounts, total_transfer_fees: this.totalFees,
      total_outflows_paid: this.totalOutflowsPaid, outstanding_outflows: outstanding,
      valid: this.valid, ait_enabled: this.aitEnabled, ait_rate: this.aitRate,
      decision_log: this.decisionLog
    });
    result.start_date = this.context.start_iso;
    result.credited_net_interest = this.provenance.creditedNetInterest;
    result.simulation_mode = this.context.simulation?.mode ?? "scoped";
    if (this.context.simulation?.goal) result.goal_outcome = this.goalOutcome ?? this.completeGoalOutcome();
    result.provenance = Object.fromEntries([...this.provenance.accounts].map(([id, value]) => [id, { ...value }]));
    result.provenance_adjustments = this.provenance.adjustments.map(item => ({ ...item }));
    return result;
  }
}
