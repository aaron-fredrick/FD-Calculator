import { Account } from "../core/models.js";
import { addPeriod, formatISODate, parseISODate } from "../core/dates.js";
import { createStrategyDecision, StrategyDecisionType } from "../core/strategy-contracts.js";
import { FDOptionManager } from "../fd-options/index.js";

const EPS = 0.001;

const validateTenorTieBreaker = (value, name) => {
  if (!["shortest", "longest"].includes(value)) {
    throw new RangeError(name + ' must be "shortest" or "longest".');
  }
  return value;
};

export function rankOptions(candidates, tenorTieBreaker = "shortest") {
  validateTenorTieBreaker(tenorTieBreaker, "tenor_tiebreaker");
  if (!candidates.length) return [];
  return [...candidates].sort((a, b) => {
    const tenorOrder = tenorTieBreaker === "shortest"
      ? Number(a.days) - Number(b.days)
      : Number(b.days) - Number(a.days);
    return Number(b.annual_rate) - Number(a.annual_rate) ||
      tenorOrder ||
      // Prefer eFD only when economic terms are otherwise equivalent.
      (a.economic_terms_key === b.economic_terms_key
        ? Number(Boolean(b.is_efd)) - Number(Boolean(a.is_efd)) : 0);
  });
}

export function selectBestOption(candidates, tenorTieBreaker = "shortest") {
  return rankOptions(candidates, tenorTieBreaker)[0] ?? null;
}

function upcomingStrictOutflows(outflows, today) {
  const due = new Map();
  const todayKey = formatISODate(today);
  for (const [date, entries] of Object.entries(outflows || {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (date <= todayKey) continue;
    for (const entry of entries || []) {
      if (String(entry.payment_policy || "strict") !== "strict") continue;
      const accountId = String(entry.account_id);
      const items = due.get(accountId) ?? [];
      const existing = items.find(item => item.date === date);
      if (existing) existing.amount += Number(entry.amount);
      else items.push({ date, amount: Number(entry.amount) });
      due.set(accountId, items);
    }
  }
  return due;
}

function investmentPrincipalForOutflow(balance, option, obligations, today) {
  if (!obligations?.length) return balance;
  const maturityDate = formatISODate(addPeriod(today, option.period_str));
  const reserved = obligations
    .filter(obligation => obligation.date < maturityDate)
    .reduce((total, obligation) => total + obligation.amount, 0);
  const investable = balance - reserved;
  return investable + EPS >= option.min_amount ? investable : null;
}

function planPreservesUpcomingStrictOutflows(plan, accounts, obligations, today) {
  const projected = new Map(Object.values(accounts).map(account => [account.id, account.balance]));
  for (const transfer of plan.transfers || []) {
    projected.set(transfer.src.id, (projected.get(transfer.src.id) ?? 0) - transfer.amount);
    projected.set(transfer.tgt.id, (projected.get(transfer.tgt.id) ?? 0) + transfer.amount - transfer.fee);
  }
  const bookings = [...(plan.bookings || [])];
  if (plan.booking) bookings.push(plan.booking);
  for (const booking of bookings) {
    projected.set(booking.account.id, (projected.get(booking.account.id) ?? 0) - booking.principal);
  }
  for (const [accountId, accountObligations] of obligations) {
    const booking = bookings.find(item => item.account.id === accountId);
    const maturityDate = booking
      ? formatISODate(addPeriod(today, booking.option.period_str))
      : null;
    const requiredCash = accountObligations
      .filter(obligation => !maturityDate || obligation.date < maturityDate)
      .reduce((total, obligation) => total + obligation.amount, 0);
    if ((projected.get(accountId) ?? 0) + EPS < requiredCash) return false;
  }
  return true;
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

function firstCreditedInterest(option, principal, date, aitRate, compound, actualLeapYear) {
  const flow = option.generateCashFlowComponentsAfterAIT(
    principal, date, aitRate, compound, actualLeapYear
  ).find(item => item.interest > EPS);
  return flow ? { date: flow.date, interest: flow.interest } : null;
}

function compareGoalPlans(a, b) {
  if (a.credit.date.getTime() !== b.credit.date.getTime()) {
    return a.credit.date - b.credit.date;
  }
  return Number(b.credit.interest) - Number(a.credit.interest) ||
    Number(a.fees_today) - Number(b.fees_today) ||
    Number(b.net_interest) - Number(a.net_interest);
}

export function pickDailyGreedyPlan(accounts, options, optionManager, today, end, feeConfig, consolidationId, compound, actualLeapYear, aitRate, tenorTieBreaker, planTenorTieBreaker, goalMode = false, outflows = {}) {
  const upcomingOutflows = upcomingStrictOutflows(outflows, today);
  const active = Object.values(accounts).filter(account => account.balance > EPS);
  if (!active.length) return { type: "CARRY", carries: [] };
  const splitBookings = [], splitCarries = [];
  let splitGross = 0;
  for (const account of active) {
    if (goalMode && account.id !== consolidationId) {
      splitCarries.push(account);
      continue;
    }
    const eligible = optionManager.getEligibleOptions({ account, amount: account.balance, investmentDate: today, simulationEndDate: end });
    const safeEligible = rankOptions(eligible, tenorTieBreaker).map(option => ({
      option,
      principal: investmentPrincipalForOutflow(
        account.balance, option, upcomingOutflows.get(account.id), today
      )
    })).filter(item => item.principal !== null && item.principal > EPS);
    let selected = safeEligible[0] ?? null;
    if (goalMode && safeEligible.length) {
      selected = safeEligible.map(item => ({
        ...item,
        credit: firstCreditedInterest(
          item.option, item.principal, today, aitRate, compound, actualLeapYear
        )
      })).filter(item => item.credit).sort((a, b) =>
        a.credit.date - b.credit.date ||
        b.credit.interest - a.credit.interest ||
        b.option.annual_rate - a.option.annual_rate ||
        a.option.days - b.option.days
      )[0] ?? null;
    }
    if (!selected) { splitCarries.push(account); continue; }
    const { option, principal } = selected;
    const interest = option.totalInterestOn(principal, today, compound, actualLeapYear);
    splitBookings.push({ account, option, principal, interest, rate: option.annual_rate, days: option.days });
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
    for (const option of rankOptions(eligible, tenorTieBreaker)) {
      const principal = investmentPrincipalForOutflow(
        deployable, option, upcomingOutflows.get(target.id), today
      );
      if (principal === null || principal <= EPS) continue;
      const gross = option.totalInterestOn(principal, today, compound, actualLeapYear);
      const net = gross * (1 - aitRate) - feesEval;
      if (net <= 0) continue;
      consolidationPlans.push({
        type: "CONSOLIDATE", target_account: target, option, transfers,
        booking: { account: target, option, principal }, carries,
        rate: option.annual_rate, days: option.days, fees_today: feesToday,
        fees_eval: feesEval, gross_interest: gross, net_interest: net
      });
    }
  }

  if (goalMode) {
    // Goal mode optimizes the first interest-credit boundary, not annual yield
    // over the entire 30-year safety horizon. Only interest reaching the
    // configured consolidation account advances this objective.
    const goalCandidates = [];
    const consolidationBooking = (split?.bookings || []).find(item => item.account.id === consolidationId);
    if (consolidationBooking) {
      const credit = firstCreditedInterest(
        consolidationBooking.option, consolidationBooking.principal, today,
        aitRate, compound, actualLeapYear
      );
      if (credit) goalCandidates.push({ ...split, credit });
    }
    for (const plan of consolidationPlans) {
      if (plan.target_account.id !== consolidationId) continue;
      const credit = firstCreditedInterest(
        plan.option, plan.booking.principal, today, aitRate, compound, actualLeapYear
      );
      if (credit) goalCandidates.push({ ...plan, credit });
    }
    const safeGoalCandidates = goalCandidates.filter(plan =>
      planPreservesUpcomingStrictOutflows(plan, accounts, upcomingOutflows, today)
    );
    if (safeGoalCandidates.length) {
      safeGoalCandidates.sort(compareGoalPlans);
      return safeGoalCandidates[0];
    }
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
  return candidates.find(plan =>
    planPreservesUpcomingStrictOutflows(plan, accounts, upcomingOutflows, today)
  ) ?? { type: "CARRY", carries: active };
}

export class GreedyStrategy {
  static name = "Greedy";
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

  createSession(context) {
    const optionManager = new FDOptionManager(context.options);
    return {
      nextSignal: view => {
        const accounts = Object.fromEntries(view.accounts.map(account => [account.id, new Account({
          id: account.id, bank_id: account.bank_id, bank_key: account.bank_key,
          label: account.label, balance: account.balance, supports_efd: account.supports_efd
        })]));
        const plan = pickDailyGreedyPlan(
          accounts, context.options, optionManager, parseISODate(view.date), context.end,
          context.fee_config, context.consolidation_account_id,
          this.compound, this.actual_leap_year, this.effective_ait_rate,
          this.tenor_tiebreaker, this.plan_tenor_tiebreaker,
          context.simulation?.mode === "goal", context.outflows
        );
        const carries = (plan.carries || []).map(account => account.id);
        if (plan.type === "SPLIT") {
          return createStrategyDecision({
            revision: view.revision, date: view.date,
            action: StrategyDecisionType.SPLIT,
            plan: {
              bookings: plan.bookings.map(item => ({
                account_id: item.account.id,
                option_index: context.options.indexOf(item.option),
                principal: item.principal
              })),
              carries
            }
          });
        }
        if (plan.type === "CONSOLIDATE") {
          return createStrategyDecision({
            revision: view.revision, date: view.date,
            action: StrategyDecisionType.CONSOLIDATE,
            plan: {
              target_account_id: plan.target_account.id,
              option_index: context.options.indexOf(plan.option),
              principal: plan.booking.principal,
              transfers: plan.transfers.map(item => ({
                source_account_id: item.src.id,
                target_account_id: item.tgt.id,
                amount: item.amount,
                fee: item.fee
              })),
              carries
            }
          });
        }
        return createStrategyDecision({
          revision: view.revision, date: view.date,
          action: StrategyDecisionType.CARRY,
          plan: { carries }
        });
      }
    };
  }


}
