import { Account, TransferFeeConfig } from "../core/models.js";
import { Event, EventType, normalizeInflowSchedule } from "../core/events.js";
import { Booking } from "../core/results.js";
import { daysBetween, formatISODate, parseISODate } from "../core/dates.js";
import { validateOutflowSchedule } from "../core/cashflows.js";
import { createSimulationContext } from "../core/simulation-context.js";
import { runStrategySession } from "../core/simulation.js";
import {
  createStrategyDecision, createStrategyWait, createStrategyComplete,
  StrategyDecisionType
} from "../core/strategy-contracts.js";
import { FDOptionManager } from "../fd-options/index.js";

const EPS = 0.001;
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
const dateKey = date => Number(formatISODate(date).replaceAll("-", ""));
const keyDate = key => String(key).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
const sumBalances = balances => [...balances.values()].reduce((sum, value) => sum + value, 0);
const POLICY_ORDER = { strict: 0, defer: 1, best_effort: 2 };

function cloneAccount(account) {
  return new Account({
    id: account.id, bank_id: account.bank_id, bank_key: account.bank_key,
    label: account.label, balance: account.balance, supports_efd: account.supports_efd
  });
}

function netInterest(option, principal, date, compound, actualLeapYear, aitRate) {
  const flows = option.generateCashFlowsAfterAIT(principal, date, aitRate, compound, actualLeapYear);
  return flows.reduce((sum, flow) => sum + flow.amount, 0) - principal;
}

/**
 * Independent recursive goal planner. Candidate eligibility and ordering are
 * supplied by FDOptionManager; no other strategy is invoked.
 */
export class GSSStrategy {
  static name = "GSS";

  constructor({
    compound = false, actual_leap_year = true, ait_enabled = false,
    ait_rate = 0.10, small_period_days = 30
  } = {}) {
    if (!Number.isInteger(small_period_days) || small_period_days < 1) {
      throw new RangeError("small_period_days must be a positive integer.");
    }
    this.name = "GSS";
    this.compound = compound;
    this.actual_leap_year = actual_leap_year;
    this.ait_enabled = ait_enabled;
    this.ait_rate = ait_rate;
    this.effective_ait_rate = ait_enabled ? ait_rate : 0;
    this.small_period_days = small_period_days;
    this.outflow_account_tiebreak = true;
    this.outflow_due_date_sort = "string";
    this.round_balances = true;
    this.opening_trigger_always = true;
  }

  #planHypothetically({
    options, start, end, inflow_schedule = {}, accounts = null,
    inflow_account_id = null, fee_config = null,
    consolidation_account_id = null, outflow_schedule = {}
  }) {
    const startDate = parseISODate(start), endDate = parseISODate(end);
    if (!Array.isArray(options) || !options.length) throw new TypeError("GSS simulation requires FD options.");
    if (!accounts?.length) {
      const bank = options[0].bank_identity || "commercial";
      accounts = [new Account({ id: "default", bank_id: bank, bank_key: bank, label: "Main Account" })];
    }
    inflow_account_id ||= accounts[0].id;
    consolidation_account_id ||= inflow_account_id;
    fee_config ||= new TransferFeeConfig();

    const originalCapital = accounts.reduce((sum, account) => sum + account.balance, 0);
    const accountMap = new Map(accounts.map(account => [account.id, cloneAccount(account)]));
    if (!accountMap.has(inflow_account_id)) throw new RangeError("inflow_account_id does not reference a configured account.");
    if (!accountMap.has(consolidation_account_id)) throw new RangeError("consolidation_account_id does not reference a configured account.");

    const optionManager = new FDOptionManager(options);
    const normalizedInflows = normalizeInflowSchedule(inflow_schedule, inflow_account_id);
    validateOutflowSchedule(outflow_schedule, formatISODate(startDate), formatISODate(endDate), new Set(accountMap.keys()));

    const timeline = {};
    const bookings = [];
    const decisionLog = [];
    const decisionPath = [];
    const processed = new Set();
    let pending = [], inflowNumber = 0, bookingNumber = 0;
    let totalFees = 0, totalOutflowsPaid = 0, strictFailed = false;
    let earlyGoal = null, earlyGoalRechecks = 0, earlyGoalExecutions = 0;
    let forecastInterrupt = null, forecastRechecks = 0, forecastContractions = 0;
    let recursiveCalls = 0, candidatesConsidered = 0, splitPlansEvaluated = 0;
    let consolidatePlansEvaluated = 0, futureGoals = 0, maximumDepth = 0;

    const addEvent = event => { (timeline[event.date_key] ||= []).push(event); };
    const balanceSnapshot = () => new Map([...accountMap].map(([id, account]) => [id, account.balance]));
    const accountList = () => [...accountMap.values()];
    const eventDates = (after, through) => Object.keys(timeline).map(Number)
      .filter(key => !processed.has(key) && keyDate(key) > formatISODate(after) && keyDate(key) <= formatISODate(through))
      .sort((a, b) => a - b);

    for (const [date, amounts] of Object.entries(normalizedInflows).sort(([a], [b]) => a.localeCompare(b))) {
      if (date > formatISODate(endDate)) continue;
      for (const [accountId, amount] of Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b))) {
        const account = accountMap.get(accountId);
        if (!account) throw new RangeError("Inflow destination account " + accountId + " is not configured.");
        inflowNumber++;
        addEvent(new Event({
          event_type: EventType.INFLOW, on_date: date, amount,
          label: "Inflow " + String(inflowNumber).padStart(2, "0"),
          account_id: accountId, bank_key: account.bank_key, bank_id: account.bank_id
        }));
      }
    }
    for (const [date, entries] of Object.entries(outflow_schedule).sort(([a], [b]) => a.localeCompare(b))) {
      for (const entry of entries) {
        const account = accountMap.get(String(entry.account_id));
        if (!account) throw new RangeError("Outflow destination account is not configured.");
        addEvent(new Event({
          event_type: EventType.OUTFLOW, on_date: date, amount: Number(entry.amount),
          label: String(entry.name || "Outflow"), account_id: account.id,
          payment_policy: String(entry.payment_policy || "strict"),
          bank_key: account.bank_key, bank_id: account.bank_id
        }));
      }
    }
    if ([...accountMap.values()].some(account => account.balance > EPS)) {
      const account = accountMap.get(inflow_account_id);
      addEvent(new Event({
        event_type: EventType.INFLOW, on_date: startDate, amount: 0,
        label: "Opening balance trigger", account_id: account.id,
        bank_key: account.bank_key, bank_id: account.bank_id
      }));
    }

    const processDate = date => {
      const key = dateKey(date);
      if (processed.has(key)) return !strictFailed;
      processed.add(key);
      const dayEvents = timeline[key] ?? [];
      for (const event of dayEvents) {
        if (![EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY].includes(event.event_type)) continue;
        const account = accountMap.get(event.account_id) || accountMap.get(inflow_account_id);
        account.balance = round2(account.balance + event.amount);
        event.account_id = account.id;
        event.bank_key = account.bank_key;
        event.bank_id = account.bank_id;
        event.balance_after = account.balance;
        event.total_balance_after = sumBalances(balanceSnapshot());
      }

      for (const event of dayEvents.filter(item => item.event_type === EventType.OUTFLOW)) {
        pending.push({
          name: event.label, account_id: event.account_id, remaining: event.amount,
          payment_policy: event.payment_policy || "strict", due_date: date
        });
      }
      const remaining = [];
      pending.sort((a, b) => (POLICY_ORDER[a.payment_policy] ?? 3) - (POLICY_ORDER[b.payment_policy] ?? 3) ||
        String(a.due_date).localeCompare(String(b.due_date)) || a.account_id.localeCompare(b.account_id));
      for (const obligation of pending) {
        const account = accountMap.get(obligation.account_id);
        const required = Number(obligation.remaining);
        let paid = 0;
        if (obligation.payment_policy === "strict") {
          if (account.balance + EPS < required) {
            strictFailed = true;
            remaining.push(obligation);
            continue;
          }
          paid = required;
        } else if (obligation.payment_policy === "defer") {
          if (account.balance + EPS < required) {
            remaining.push(obligation);
            continue;
          }
          paid = required;
        } else {
          paid = Math.min(account.balance, required);
        }
        if (paid > EPS) {
          account.balance = round2(account.balance - paid);
          totalOutflowsPaid += paid;
          addEvent(new Event({
            event_type: EventType.OUTFLOW, on_date: date, amount: -paid,
            label: "Paid " + obligation.name + " (" + obligation.payment_policy + ")",
            account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
            balance_after: account.balance, total_balance_after: sumBalances(balanceSnapshot())
          }));
        }
        const unpaid = round2(required - paid);
        if (unpaid > EPS) remaining.push({ ...obligation, remaining: unpaid });
      }
      pending = remaining;
      return !strictFailed;
    };

    const candidateList = (date, horizon) => {
      const candidates = [];
      for (const account of accountList()) {
        // This is the full manager-ordered list, not a prematurely selected option.
        const products = optionManager.getCandidateOptions({
          account, investmentDate: date, simulationEndDate: horizon
        });
        for (const option of products) candidates.push({ account, option });
      }
      return candidates;
    };

    const reservedLiquidity = (accountId, fromDate, throughDate, balances, pendingState = pending) => {
      let cumulative = 0, minimum = 0;
      for (const obligation of pendingState) {
        if (obligation.account_id === accountId && parseISODate(obligation.due_date) <= parseISODate(throughDate)) {
          cumulative -= Number(obligation.remaining);
          minimum = Math.min(minimum, cumulative);
        }
      }
      for (const key of eventDates(fromDate, throughDate)) {
        const date = keyDate(key);
        for (const event of timeline[key] ?? []) {
          if (event.account_id !== accountId) continue;
          if ([EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY].includes(event.event_type)) {
            cumulative += event.amount;
          } else if (event.event_type === EventType.OUTFLOW) {
            cumulative -= event.amount;
          }
          minimum = Math.min(minimum, cumulative);
        }
      }
      return Math.max(0, -minimum);
    };

    const buildPlans = (candidate, date, balances, horizon, pendingState = pending, parentGoals = []) => {
      const plans = [];
      const targetAccount = candidate.account;
      const candidateBalance = balances.get(targetAccount.id) ?? 0;
      const candidateOption = candidate.option;
      const targetMaturity = candidateOption.maturityDate(date);
      const targetReserve = reservedLiquidity(targetAccount.id, date, targetMaturity, balances, pendingState);
      const targetInvestable = Math.max(0, candidateBalance - targetReserve);

      // SPLIT: the goal product must be booked in its own account. Other
      // accounts use their first viable option in FDOptionManager order.
      if (candidateOption.canInvest(targetInvestable, date, horizon)) {
        const splitBookings = [];
        for (const account of accountList()) {
          const balance = balances.get(account.id) ?? 0;
          if (balance <= EPS) continue;
          let option = null, amount = 0;
          if (account.id === targetAccount.id) {
            option = candidateOption;
            amount = targetInvestable;
          } else {
            const products = optionManager.getCandidateOptions({
              account, investmentDate: date, simulationEndDate: horizon
            });
            for (const product of products) {
              const maturity = product.maturityDate(date);
              const reserve = reservedLiquidity(account.id, date, maturity, balances, pendingState);
              const investable = Math.max(0, balance - reserve);
              if (product.canInvest(investable, date, horizon)) {
                option = product;
                amount = investable;
                break;
              }
            }
          }
          if (option && amount > EPS) splitBookings.push({ account, option, principal: amount });
        }
        const targetIncluded = splitBookings.some(item =>
          item.account.id === targetAccount.id && item.option === candidateOption);
        if (targetIncluded) {
          const interest = splitBookings.reduce((sum, item) =>
            sum + netInterest(item.option, item.principal, date, this.compound,
              this.actual_leap_year, this.effective_ait_rate), 0);
          splitPlansEvaluated++;
          if (interest > EPS) plans.push({
            type: "SPLIT", bookings: splitBookings, transfers: [],
            carries: accountList().filter(account =>
              !splitBookings.some(item => item.account.id === account.id)).map(account => account.id),
            fees: 0, net_interest: interest
          });
        }
      }

      // CONSOLIDATE: deduct each source-to-target fee before testing the FD minimum.
      const transfers = [];
      let deployable = targetInvestable, fees = 0;
      const carries = [];
      for (const source of accountList()) {
        if (source.id === targetAccount.id) continue;
        const balance = balances.get(source.id) ?? 0;
        if (balance <= EPS) continue;
        // Keep enough source-account liquidity for its scheduled obligations
        // across the remaining overall horizon; only excess funds are moved.
        const reserve = reservedLiquidity(source.id, date, endDate, balances, pendingState);
        const amount = Math.max(0, balance - reserve);
        if (amount <= EPS) { carries.push(source.id); continue; }
        const fee = fee_config.getFee(source.bank_identity, targetAccount.bank_identity);
        if (amount <= fee) { carries.push(source.id); continue; }
        transfers.push({ source, amount, fee, net: amount - fee });
        deployable += amount - fee;
        fees += fee;
      }
      if (candidateOption.canInvest(deployable, date, horizon) && transfers.length) {
        const interest = netInterest(candidateOption, deployable, date, this.compound,
          this.actual_leap_year, this.effective_ait_rate) - fees;
        consolidatePlansEvaluated++;
        if (interest > EPS) plans.push({
          type: "CONSOLIDATE",
          bookings: [{ account: targetAccount, option: candidateOption, principal: deployable }],
          target_account: targetAccount, transfers, carries, fees, net_interest: interest
        });
      }
      if (parentGoals.length) {
        const protectedTargets = parentGoals.map(goal => (goal.candidate || goal).account.id);
        for (let index = plans.length - 1; index >= 0; index--) {
          const plan = plans[index];
          if (plan.type === "CONSOLIDATE" &&
              protectedTargets.some(accountId => accountId !== plan.target_account.id)) {
            plans.splice(index, 1);
          }
        }
      }
      plans.sort((a, b) => b.net_interest - a.net_interest ||
        a.fees - b.fees || (a.type === "SPLIT" ? -1 : 1));
      return plans;
    };

    const findFutureDate = (candidate, fromDate, horizon, parentGoals = []) => {
      const balances = balanceSnapshot();
      let projectedPending = pending.map(item => ({ ...item }));
      for (const key of eventDates(fromDate, horizon)) {
        const date = parseISODate(keyDate(key));
        const events = timeline[key] ?? [];
        for (const event of events) {
          if ([EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY].includes(event.event_type)) {
            const accountId = accountMap.has(event.account_id) ? event.account_id : inflow_account_id;
            balances.set(accountId, round2((balances.get(accountId) ?? 0) + event.amount));
          }
        }
        for (const event of events.filter(item => item.event_type === EventType.OUTFLOW)) {
          projectedPending.push({
            name: event.label, account_id: event.account_id, remaining: event.amount,
            payment_policy: event.payment_policy || "strict", due_date: date
          });
        }
        const stillPending = [];
        projectedPending.sort((a, b) => (POLICY_ORDER[a.payment_policy] ?? 3) - (POLICY_ORDER[b.payment_policy] ?? 3) ||
          String(a.due_date).localeCompare(String(b.due_date)) || a.account_id.localeCompare(b.account_id));
        for (const obligation of projectedPending) {
          const available = balances.get(obligation.account_id) ?? 0;
          const required = Number(obligation.remaining);
          if (obligation.payment_policy === "strict" && available + EPS < required) return null;
          if (obligation.payment_policy === "defer" && available + EPS < required) {
            stillPending.push(obligation);
            continue;
          }
          const paid = obligation.payment_policy === "best_effort" ? Math.min(available, required) : required;
          balances.set(obligation.account_id, round2(available - paid));
          const unpaid = round2(required - paid);
          if (unpaid > EPS) stillPending.push({ ...obligation, remaining: unpaid });
        }
        projectedPending = stillPending;
        if (buildPlans(candidate, date, balances, horizon, projectedPending, parentGoals).length) return date;
      }
      return null;
    };

    const recordCarry = (date, context) => {
      const balances = balanceSnapshot();
      if (context?.action === "candidate_exhaustion") {
        decisionPath.push({
          date: formatISODate(date), type: "CARRY",
          carries: accountList().map(account => account.id),
          carry_label: "GSS holding liquidity", carry_context: context
        });
      }
      for (const account of accountList()) {
        const amount = balances.get(account.id) ?? 0;
        if (amount <= EPS) continue;
        addEvent(new Event({
          event_type: EventType.CARRY_FORWARD, on_date: date, amount,
          label: "GSS holding liquidity; balance " + amount.toFixed(2) + " carries forward",
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: amount, total_balance_after: sumBalances(balances),
          decision_context: context
        }));
      }
    };

    const executePlan = (plan, date, decisionDate, candidate) => {
      const before = Object.fromEntries(balanceSnapshot());
      const bookingDecisionContext = {
        strategy: "GSS", goal_account_id: candidate.account.id,
        goal_option: candidate.option.label, plan: plan.type,
        balances_before: before, considered_from: formatISODate(decisionDate)
      };
      const decisionLogEntry = {
        date: formatISODate(date), goal_account_id: candidate.account.id,
        goal_option: candidate.option.label, plan: plan.type,
        net_interest: round2(plan.net_interest), transfer_fees: round2(plan.fees)
      };
      decisionPath.push({
        date: formatISODate(date), type: plan.type,
        goal_account_id: candidate.account.id, goal_option: candidate.option,
        target_account_id: plan.target_account?.id,
        principal: plan.bookings[0]?.principal,
        transfers: plan.transfers.map(item => ({
          source_account_id: item.source.id,
          target_account_id: plan.target_account.id,
          amount: item.amount, fee: item.fee
        })),
        bookings: plan.bookings.map(item => ({
          account_id: item.account.id, option: item.option, principal: item.principal,
          decision_context: bookingDecisionContext
        })),
        carries: accountList().map(account => account.id),
        carry_label: "GSS holding liquidity",
        carry_context: {
          strategy: "GSS", action: "liquidity_carry",
          goal_account_id: candidate.account.id, goal_option: candidate.option.label
        },
        decision_log_entry: decisionLogEntry
      });
      if (plan.type === "CONSOLIDATE") {
        for (const transfer of plan.transfers) {
          const { source, amount, fee, net } = transfer;
          source.balance = round2(source.balance - amount);
          totalFees += fee;
          const channel = source.bank_identity.trim().toUpperCase() ===
            plan.target_account.bank_identity.trim().toUpperCase() ? "intra_bank" : "domestic_ceft";
          addEvent(new Event({
            event_type: EventType.TRANSFER, on_date: date, amount,
            label: "Transfer to " + plan.target_account.label + " (Amt: " + net.toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
            account_id: source.id, bank_key: source.bank_key, bank_id: source.bank_id,
            transfer_channel: channel, fee, balance_after: source.balance,
            total_balance_after: sumBalances(balanceSnapshot())
          }));
          plan.target_account.balance = round2(plan.target_account.balance + net);
          addEvent(new Event({
            event_type: EventType.TRANSFER, on_date: date, amount: net,
            label: "Transfer received from " + source.label,
            account_id: plan.target_account.id, bank_key: plan.target_account.bank_key,
            bank_id: plan.target_account.bank_id, transfer_channel: channel,
            balance_after: plan.target_account.balance,
            total_balance_after: sumBalances(balanceSnapshot())
          }));
        }
      }

      for (const item of plan.bookings) {
        const account = item.account;
        const principal = Math.min(Number(item.principal ?? account.balance), account.balance);
        if (principal <= EPS) continue;
        account.balance = round2(account.balance - principal);
        bookingNumber++;
        const reference = "FD-" + String(bookingNumber).padStart(4, "0");
        const grossFlows = item.option.generateCashFlows(principal, date, this.compound, this.actual_leap_year);
        const netFlows = item.option.generateCashFlowsAfterAIT(principal, date,
          this.effective_ait_rate, this.compound, this.actual_leap_year);
        const booking = new Booking({
          option: item.option, principal, start: date, cash_flows: grossFlows,
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id
        });
        bookings.push(booking);
        addEvent(new Event({
          event_type: EventType.BOOKING, on_date: date, amount: principal,
          label: "Book " + item.option.label + " @ " + item.option.annual_rate.toFixed(2) +
            "% -> matures " + formatISODate(booking.end),
          booking_ref: reference, account_id: account.id, bank_key: account.bank_key,
          bank_id: account.bank_id, balance_after: account.balance,
          total_balance_after: sumBalances(balanceSnapshot()),
          decision_context: bookingDecisionContext
        }));
        netFlows.forEach((flow, index) => {
          const isMaturity = flow.date.getTime() === booking.end.getTime() &&
            (item.option.payout_type === "cumulative" || index === netFlows.length - 1);
          addEvent(new Event({
            event_type: isMaturity ? EventType.MATURITY : EventType.CASH_FLOW,
            on_date: flow.date, amount: flow.amount,
            label: (isMaturity ? "Maturity " : "Cash flow ") + "[" + reference + "] (" + item.option.label + ")",
            booking_ref: reference, account_id: account.id,
            bank_key: account.bank_key, bank_id: account.bank_id
          }));
        });
      }
      decisionLog.push(decisionLogEntry);
      recordCarry(date, {
        strategy: "GSS", action: "liquidity_carry",
        goal_account_id: candidate.account.id, goal_option: candidate.option.label
      });
    };

    const reassessParentGoals = (date, parentGoals) => {
      // Every recursive frame owns a forecast. Descendant decisions can add
      // cash-flow/maturity events, so recompute each ancestor against the
      // updated timeline and actual account state.
      for (let index = parentGoals.length - 1; index >= 0; index--) {
        const frame = parentGoals[index];
        frame.currentDate = date;
        const candidate = frame.candidate || frame;
        const ancestors = parentGoals.slice(0, index);
        earlyGoalRechecks++;
        const plans = buildPlans(candidate, date, balanceSnapshot(), frame.goalHorizon || endDate,
          pending, ancestors);
        if (plans.length) {
          earlyGoal = { candidate, date, frame };
          frame.status = "viable";
          if (forecastInterrupt?.frame === frame) forecastInterrupt = null;
          return true;
        }

        forecastRechecks++;
        const revisedDate = findFutureDate(
          candidate, date, frame.goalHorizon || endDate, ancestors
        );
        if (!revisedDate) {
          frame.status = "infeasible";
          if (forecastInterrupt?.frame === frame) forecastInterrupt = null;
          continue;
        }
        frame.status = "waiting";
        if (revisedDate < frame.projectedTargetDate && revisedDate > date) {
          const previousDate = frame.projectedTargetDate;
          frame.projectedTargetDate = revisedDate;
          forecastContractions++;
          decisionLog.push({
            date: formatISODate(date), action: "FORECAST_CONTRACTED",
            goal_account_id: candidate.account.id, goal_option: candidate.option.label,
            previous_target_date: formatISODate(previousDate),
            target_date: formatISODate(revisedDate),
            days_reduced: daysBetween(revisedDate, previousDate),
            owner_depth: frame.ownerDepth
          });
          if (!forecastInterrupt || revisedDate < forecastInterrupt.targetDate) {
            forecastInterrupt = { frame, targetDate: revisedDate };
          }
        }
      }
      return false;
    };

    const advanceWindow = (fromDate, throughDate, depth, allowNested, parentGoals = []) => {
      let cursor = fromDate;
      while (!strictFailed) {
        // A contracted ancestor boundary can pre-empt this frame's original
        // boundary. Only interrupt windows that actually extend to that date.
        const interruptApplies = forecastInterrupt &&
          forecastInterrupt.targetDate > cursor && forecastInterrupt.targetDate <= throughDate;
        const boundary = interruptApplies ? forecastInterrupt.targetDate : throughDate;
        const next = eventDates(cursor, boundary)[0];
        if (next === undefined) {
          processDate(boundary);
          if (reassessParentGoals(boundary, parentGoals)) return boundary;
          return boundary;
        }
        const date = parseISODate(keyDate(next));
        if (!processDate(date)) return date;
        cursor = date;
        if (reassessParentGoals(date, parentGoals)) return date;
        if (date < boundary) {
          cursor = considerAtDate(date, boundary, depth + 1, allowNested, parentGoals);
          // Interim bookings add future cash-flow and maturity events. Reforecast
          // ancestors immediately after the decision, not only after events.
          if (reassessParentGoals(cursor, parentGoals)) return cursor;
          // Execution and contraction signals travel to their owning frames.
          if (earlyGoal) return cursor;
          if (forecastInterrupt && forecastInterrupt.targetDate <= boundary &&
              forecastInterrupt.targetDate <= cursor) return cursor;
        }
        if (cursor >= boundary) return boundary;
      }
      return cursor;
    };

    const considerAtDate = (initialDate, horizon, depth, allowFuture, parentGoals = []) => {
      let today = initialDate;
      maximumDepth = Math.max(maximumDepth, depth);
      while (!strictFailed) {
        const candidates = candidateList(today, horizon);
        let advanced = false;
        for (const candidate of candidates) {
          candidatesConsidered++;
          const plans = buildPlans(candidate, today, balanceSnapshot(), horizon, pending, parentGoals);
          if (plans.length) {
            executePlan(plans[0], today, initialDate, candidate);
            return today;
          }
          if (!allowFuture) continue;
          const targetDate = findFutureDate(candidate, today, horizon, parentGoals);
          if (!targetDate || targetDate <= today) continue;

          futureGoals++;
          const waitDays = daysBetween(today, targetDate);
          const recurseFurther = waitDays > this.small_period_days && depth < 64;
          recursiveCalls++;
          decisionLog.push({
            date: formatISODate(today), action: "WAIT",
            goal_account_id: candidate.account.id, goal_option: candidate.option.label,
            target_date: formatISODate(targetDate), wait_days: waitDays,
            recursive_wait: recurseFurther
          });
          const goalFrame = {
            candidate, ownerDepth: depth, currentDate: today,
            projectedTargetDate: targetDate, goalHorizon: horizon,
            parentGoals, status: "waiting"
          };
          today = advanceWindow(
            today, targetDate, depth + 1, recurseFurther,
            [...parentGoals, goalFrame]
          );

          // An ancestor may become viable or receive a contracted forecast
          // while this frame is nested. Only its owning frame may execute it.
          if (earlyGoal) {
            if (earlyGoal.candidate !== candidate) return today;
            const earlyPlans = buildPlans(candidate, today, balanceSnapshot(), horizon, pending, parentGoals);
            if (earlyPlans.length) {
              executePlan(earlyPlans[0], today, initialDate, candidate);
              if (today < targetDate) earlyGoalExecutions++;
              goalFrame.status = "completed";
              if (forecastInterrupt?.frame === goalFrame) forecastInterrupt = null;
              earlyGoal = null;
              return today;
            }
            earlyGoal = null;
          }

          if (forecastInterrupt?.frame === goalFrame) {
            today = forecastInterrupt.targetDate;
            processDate(today);
            const contractedPlans = buildPlans(candidate, today, balanceSnapshot(), horizon, pending, parentGoals);
            if (contractedPlans.length) {
              executePlan(contractedPlans[0], today, initialDate, candidate);
              goalFrame.status = "completed";
              forecastInterrupt = null;
              return today;
            }
            // A projected date is never an execution guarantee. If actual
            // state does not validate the plan, discard the signal and resume
            // normal candidate evaluation from the current state.
            forecastInterrupt = null;
          } else if (forecastInterrupt &&
              forecastInterrupt.targetDate <= today &&
              forecastInterrupt.frame !== goalFrame) {
            return today;
          }

          // Rebuild the candidate plan from actual balances after the child GSS
          // window has processed its cash flows, outflows and interim bookings.
          const actualPlans = buildPlans(candidate, today, balanceSnapshot(), horizon, pending, parentGoals);
          if (actualPlans.length) {
            executePlan(actualPlans[0], today, initialDate, candidate);
            return today;
          }
          advanced = true;
          break;
        }
        if (!advanced) {
          recordCarry(today, { strategy: "GSS", action: "candidate_exhaustion", depth });
          decisionLog.push({ date: formatISODate(today), action: "CANDIDATES_EXHAUSTED", depth });
          return today;
        }
      }
      return today;
    };

    processDate(startDate);
    let cursor = considerAtDate(startDate, endDate, 0, true);
    cursor = advanceWindow(cursor, endDate, 0, true, []);
    if (!processed.has(dateKey(endDate))) processDate(endDate);

    return {
      decision_path: decisionPath,
      decision_log: decisionLog,
      valid: !strictFailed,
      gss_diagnostics: {
        candidates_considered: candidatesConsidered,
        split_plans_evaluated: splitPlansEvaluated,
        consolidate_plans_evaluated: consolidatePlansEvaluated,
        future_goals: futureGoals, recursive_waits: recursiveCalls,
        early_goal_rechecks: earlyGoalRechecks,
        early_goal_executions: earlyGoalExecutions,
        forecast_rechecks: forecastRechecks,
        forecast_contractions: forecastContractions,
        maximum_recursion_depth: maximumDepth,
        small_period_days: this.small_period_days
      }
    };
  }

  createSession(context) {
    const planned = this.#planHypothetically({
      options: context.options, start: context.start, end: context.end,
      inflow_schedule: context.inflows, accounts: context.accounts,
      inflow_account_id: context.inflow_account_id,
      fee_config: context.fee_config,
      consolidation_account_id: context.consolidation_account_id,
      outflow_schedule: context.outflows
    });
    const optionIndex = option => {
      const exact = context.options.indexOf(option);
      if (exact >= 0) return exact;
      const compatible = context.options.findIndex(candidate =>
        candidate.label === option.label &&
        candidate.economic_terms_key === option.economic_terms_key &&
        candidate.is_efd === option.is_efd
      );
      if (compatible < 0) throw new RangeError("GSS plan references an FD option outside the simulation context.");
      return compatible;
    };
    const actions = new Map();
    for (const item of planned.decision_path) {
      const entry = {
        date: item.date,
        action: item.type === "CONSOLIDATE" ? StrategyDecisionType.CONSOLIDATE
          : item.type === "SPLIT" ? StrategyDecisionType.SPLIT : StrategyDecisionType.CARRY,
        plan: {
          carries: item.carries,
          carry_label: item.carry_label,
          carry_context: item.carry_context
        }
      };
      if (item.type === "CONSOLIDATE") {
        const booking = item.bookings[0];
        entry.plan.target_account_id = item.target_account_id;
        entry.plan.option_index = optionIndex(booking.option);
        entry.plan.principal = booking.principal;
        entry.plan.transfers = item.transfers;
        entry.plan.decision_context = booking.decision_context;
      } else if (item.type === "SPLIT") {
        entry.plan.bookings = item.bookings.map(booking => ({
          account_id: booking.account_id,
          option_index: optionIndex(booking.option),
          principal: booking.principal,
          decision_context: booking.decision_context
        }));
      } else {
        entry.plan.carry_all = true;
      }
      const sameDate = actions.get(item.date) ?? [];
      sameDate.push(entry);
      actions.set(item.date, sameDate);
    }

    return {
      resultMetadata: {
        decision_log: planned.decision_log,
        gss_diagnostics: planned.gss_diagnostics
      },
      nextSignal(view) {
        const entries = actions.get(view.date);
        if (entries) {
          actions.delete(view.date);
          if (entries.length === 1) {
            const entry = entries[0];
            return createStrategyDecision({
              revision: view.revision, date: view.date,
              action: entry.action, plan: entry.plan
            });
          }
          return createStrategyDecision({
            revision: view.revision, date: view.date,
            action: StrategyDecisionType.BATCH,
            plan: { actions: entries.map(({ action, plan }) => ({ action, plan })) }
          });
        }
        const overdue = [...actions.keys()].filter(date => date < view.date).sort();
        if (overdue.length) throw new Error("GSS decision date " + overdue[0] + " was skipped by actual simulation progression.");
        const nextActionDate = [...actions.keys()].sort()[0];
        const until = nextActionDate ?? context.end_iso;
        if (view.date < until) return createStrategyWait({ revision: view.revision, until });
        return createStrategyComplete({ revision: view.revision });
      }
    };
  }

  // Compatibility adapter for callers that require an unfinished result.
  simulate(input) {
    return runStrategySession(this, createSimulationContext(input));
  }
}
