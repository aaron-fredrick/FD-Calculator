import { Account, TransferFeeConfig } from "../core/models.js";
import { normalizeInflowSchedule } from "../core/events.js";
import { formatISODate, parseISODate, daysBetween } from "../core/dates.js";
import { processOutflows, validateOutflowSchedule } from "../core/cashflows.js";
import { GreedyStrategy } from "./greedy.js";
import { SimulationEngine } from "../core/simulation.js";
import { BalanceProvenance } from "../core/balance-provenance.js";
import {
  createStrategyDecision, createStrategyWait, createStrategyComplete,
  StrategyDecisionType
} from "../core/strategy-contracts.js";
import { FDOptionManager } from "../fd-options/index.js";
import { pruneDominatedOptions, roundSearchMoney, makeBalanceState, addSearchBalance, zeroSearchBalances, mergePendingFlows, SEARCH_EPSILON } from "./search-primitives.js";

const EPS = SEARCH_EPSILON;
const round2 = roundSearchMoney;
const sum = values => values.reduce((total, value) => total + value, 0);
const mapOf = entries => new Map(entries);
const asObject = map => Object.fromEntries(map);
const balanceTotal = balances => sum(balances.map(([, value]) => value));
const dateSort = (a, b) => a.localeCompare(b);
const SEARCH_CACHE_LIMIT = 10000;
const SEARCH_STATE_MEMO_LIMIT = 50000;
const SEARCH_EXPANSION_CACHE_LIMIT = 4096;
const SEARCH_BUDGET_CHECKPOINT_INTERVAL = 500;
const defaultMonotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const STATE_KEY_CACHE = new WeakMap();

function cachedValue(cache, key, compute, stats) {
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    stats.hits++;
    return value;
  }
  stats.misses++;
  const value = compute();
  if (cache.size >= SEARCH_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

function getEligibleOptions(context, { account, amount, investmentDate, simulationEndDate = context.endDate }) {
  // Goal search has separate provenance-sensitive semantics; leave its path unchanged.
  if (context.simulation?.mode === "goal") {
    return context.fdOptionManager.getEligibleOptions({ account, amount, investmentDate, simulationEndDate });
  }
  const date = investmentDate instanceof Date ? formatISODate(investmentDate) : String(investmentDate);
  const endDate = simulationEndDate instanceof Date ? formatISODate(simulationEndDate) : String(simulationEndDate);
  const key = JSON.stringify([
    account.id, account.bank_id, account.bank_key, account.bank_identity,
    Boolean(account.supports_efd), round2(amount), date, endDate
  ]);
  return cachedValue(
    context.eligibleOptionsCache, key,
    () => context.fdOptionManager.getEligibleOptions({
      account, amount, investmentDate: date, simulationEndDate: endDate
    }),
    context.cacheStats.eligibleOptions
  );
}

function optionInterestKey(option) {
  return [
    option.bank_identity || option.bank_id || "",
    option.economic_terms_key || "",
    option.label || "",
    option.annual_rate, option.days, option.payout_type,
    option.payout_period_str, option.payout_period,
    Boolean(option.is_efd)
  ];
}

function getOptionInterest(context, option, amount, investmentDate) {
  const date = investmentDate instanceof Date ? formatISODate(investmentDate) : String(investmentDate);
  const key = JSON.stringify([
    optionInterestKey(option), round2(amount), date,
    Boolean(context.compound), Boolean(context.actualLeapYear)
  ]);
  return cachedValue(
    context.optionInterestCache, key,
    () => option.totalInterestOn(amount, parseISODate(date), context.compound, context.actualLeapYear),
    context.cacheStats.optionInterest
  );
}

function firstIndexAfter(events, today, dateOf = event => event) {
  let low = 0, high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (dateOf(events[middle]) <= today) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstIndexAtOrAfter(events, date, dateOf = event => event) {
  let low = 0, high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (dateOf(events[middle]) < date) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstDateAfter(events, today, dateOf = event => event) {
  const index = firstIndexAfter(events, today, dateOf);
  return events[index] ? dateOf(events[index]) : null;
}

function nextEventDate(today, flows, eventDates, end) {
  const staticDate = firstDateAfter(eventDates, today);
  const flowDate = firstDateAfter(flows, today, flow => flow[0]);
  let next = staticDate && staticDate < end ? staticDate : end;
  if (flowDate && flowDate < next && flowDate <= end) next = flowDate;
  return next;
}

/**
 * Scoped search identity is the complete future-relevant state. Booking terms
 * are represented by their remaining per-account cash-flow schedule; once a
 * booking is made, its future decisions depend on those flows, balances,
 * obligations and paid amount rather than the historical product object.
 * Goal mode additionally retains its action history in goalSearchStateKey.
 */
function stateKey(state) {
  const cached = STATE_KEY_CACHE.get(state);
  if (cached) return cached;
  const key = JSON.stringify([
    state.date, state.balances, state.flows, state.obligations, state.paid
  ]);
  STATE_KEY_CACHE.set(state, key);
  return key;
}

export { stateKey as searchStateKey };

/**
 * Scoped optimisation may discard products dominated on identical payout
 * mechanics. Goal search keeps the complete catalogue: a longer product can
 * still be the only single payout large enough to cross a particular target.
 */
export function selectSearchOptions(options, simulation = { mode: "scoped" }) {
  return simulation?.mode === "goal" ? [...options] : pruneDominatedOptions(options);
}

function actionOperationCount(action) {
  if (action?.type === "local") return action.bookings?.length ?? 0;
  if (action?.type === "consolidate") return 1 + (action.transfers?.length ?? 0);
  if (action?.type === "carry") return action.carries?.length ?? 0;
  return 0;
}

function makeNode(parent, action, date, rootSignature = null) {
  return {
    parent, action, date,
    root_signature: rootSignature ?? parent?.root_signature ?? null,
    operation_count: (parent?.operation_count ?? 0) + actionOperationCount(action)
  };
}

function nodePath(node) {
  const path = [];
  for (let current = node; current?.action; current = current.parent) {
    path.push({ date: current.date, action: current.action });
  }
  return path.reverse();
}

export function compareGoalScores(a, b) {
  if (!b) return 1;
  if (a.achieved !== b.achieved) return a.achieved ? 1 : -1;
  if (a.achieved) {
    if (a.elapsed_days !== b.elapsed_days) return b.elapsed_days - a.elapsed_days;
    if (Math.abs(a.actual - b.actual) > EPS) return a.actual - b.actual;
  } else if (Math.abs(a.actual - b.actual) > EPS) return a.actual - b.actual;
  if (Math.abs(a.fees - b.fees) > EPS) return b.fees - a.fees;
  if (a.operations !== b.operations) return b.operations - a.operations;
  if (Math.abs(a.terminal_value - b.terminal_value) > EPS) return a.terminal_value - b.terminal_value;
  return String(b.signature).localeCompare(String(a.signature));
}

export function createPathReplayStrategy(path, engineContext, runtimeSettings = {}, { greedyContinuation = false } = {}) {
  const actions = new Map(path.map(item => [item.date, item.action]));
  const optionIndex = option => {
    const exact = engineContext.options.indexOf(option);
    if (exact >= 0) return exact;
    const compatible = engineContext.options.findIndex(candidate =>
      candidate.label === option.label && candidate.economic_terms_key === option.economic_terms_key &&
      candidate.is_efd === option.is_efd
    );
    if (compatible < 0) throw new RangeError("Search path references an FD option outside the simulation context.");
    return compatible;
  };
  const signalFor = (action, view) => {
    if (action.type === "consolidate") return createStrategyDecision({
      revision: view.revision, date: view.date, action: StrategyDecisionType.CONSOLIDATE,
      plan: {
        target_account_id: action.target_id, option_index: optionIndex(action.option),
        principal: action.principal,
        transfers: action.transfers.map(item => ({
          source_account_id: item.src_id, target_account_id: item.tgt_id,
          amount: item.amount, fee: item.fee
        })),
        carries: action.carries, carry_label: "Holding liquidity",
        carry_snapshot: "decision_start"
      }
    });
    if (action.type === "local") return createStrategyDecision({
      revision: view.revision, date: view.date, action: StrategyDecisionType.SPLIT,
      plan: {
        bookings: action.bookings.map(item => ({
          account_id: item.account_id, option_index: optionIndex(item.option), principal: item.principal
        })),
        carries: action.carries, carry_label: "Holding liquidity",
        carry_snapshot: "decision_start"
      }
    });
    if (action.type === "carry") return createStrategyDecision({
      revision: view.revision, date: view.date, action: StrategyDecisionType.CARRY,
      plan: { carries: action.carries, carry_label: "Holding liquidity", carry_snapshot: "decision_start" }
    });
    throw new RangeError("Unknown search path action: " + action.type);
  };
  return {
    name: runtimeSettings.name ?? "Absolute search candidate replay",
    compound: runtimeSettings.compound,
    actual_leap_year: runtimeSettings.actual_leap_year,
    ait_enabled: runtimeSettings.ait_enabled,
    ait_rate: runtimeSettings.ait_rate,
    outflow_account_tiebreak: runtimeSettings.outflow_account_tiebreak,
    outflow_due_date_sort: runtimeSettings.outflow_due_date_sort,
    round_balances: runtimeSettings.round_balances,
    opening_trigger_always: runtimeSettings.opening_trigger_always,
    createSession() {
      const greedySession = greedyContinuation
        ? new GreedyStrategy({
          compound: runtimeSettings.compound,
          actual_leap_year: runtimeSettings.actual_leap_year,
          ait_enabled: runtimeSettings.ait_enabled,
          ait_rate: runtimeSettings.ait_rate,
          tenor_tiebreaker: runtimeSettings.tenor_tiebreaker,
          plan_tenor_tiebreaker: runtimeSettings.plan_tenor_tiebreaker
        }).createSession(engineContext)
        : null;
      return {
        nextSignal(view) {
          const action = actions.get(view.date);
          if (action) { actions.delete(view.date); return signalFor(action, view); }
          const overdue = [...actions.keys()].filter(date => date < view.date).sort();
          if (overdue.length) throw new Error("Search candidate decision date " + overdue[0] + " was skipped.");
          const next = [...actions.keys()].sort()[0];
          if (next && view.date < next) return createStrategyWait({ revision: view.revision, until: next });
          if (greedySession) return greedySession.nextSignal(view);
          if (view.date < view.end_date) return createStrategyWait({ revision: view.revision, until: view.end_date });
          return createStrategyComplete({ revision: view.revision });
        }
      };
    }
  };
}

function scoreGoalResult(result, terminalValue, signature = "") {
  const goal = result.goal_outcome ?? {};
  const transfers = Object.values(result.timeline ?? {}).flat().filter(event =>
    event.event_type === "transfer" && (event.label.startsWith("Transfer to ") || event.label.startsWith("Final sweep to "))
  ).length;
  return {
    achieved: Boolean(goal.achieved),
    elapsed_days: goal.elapsed_days ?? Infinity,
    actual: Number(goal.actual ?? result.credited_net_interest ?? 0),
    fees: Number(result.total_transfer_fees ?? 0),
    operations: (result.bookings?.length ?? 0) + transfers,
    terminal_value: Number(terminalValue ?? result.final_value ?? 0),
    signature
  };
}

function goalPathSignature(path) {
  return JSON.stringify(path.map(({ date, action }) => [
    date, action.type, action.target_id ?? null,
    action.option?.economic_terms_key ?? null,
    action.principal ?? null,
    (action.bookings ?? []).map(item => [
      item.account_id, item.option?.economic_terms_key ?? null, item.principal
    ]),
    (action.transfers ?? []).map(item => [
      item.src_id, item.tgt_id, item.amount, item.fee
    ]),
    action.carries ?? []
  ]));
}

/**
 * Scalar balances and aggregate cash flows are insufficient to prove two goal
 * search paths equivalent: their interest/principal provenance can differ.
 * Keep distinct action histories separate in goal-mode beam deduplication.
 */
export function goalSearchStateKey(state, path = []) {
  return JSON.stringify([stateKey(state), goalPathSignature(path)]);
}

export function evaluateGoalPath(path, engineContext, terminalValue, runtimeSettings) {
  const signature = goalPathSignature(path);
  try {
    const strategy = createPathReplayStrategy(path, engineContext, runtimeSettings);
    const result = new SimulationEngine().run(strategy, {
      options: engineContext.options, start: engineContext.start, end: engineContext.end,
      simulation: engineContext.simulation, inflow_schedule: engineContext.inflows,
      accounts: engineContext.accounts, inflow_account_id: engineContext.inflow_account_id,
      fee_config: engineContext.fee_config, consolidation_account_id: engineContext.consolidation_account_id,
      outflow_schedule: engineContext.outflows
    });
    return scoreGoalResult(result, terminalValue, signature);
  } catch (error) {
    return {
      achieved: false, elapsed_days: Infinity, actual: -Infinity,
      fees: Infinity, operations: Infinity, terminal_value: -Infinity,
      signature, invalid_candidate: true, invalid_reason: String(error?.message ?? error),
      invalid_stack: String(error?.stack ?? "")
    };
  }
}

function equivalentEfdBookings(bookings, optionsByAccount) {
  let count = 0;
  for (const booking of bookings) {
    if (!booking.option.is_efd) continue;
    if ((optionsByAccount.get(booking.account_id) || []).some(option =>
      !option.is_efd && option.economic_terms_key === booking.option.economic_terms_key
    )) count++;
  }
  return count;
}

function compareBranch(a, b) {
  return b.score - a.score || b.efd - a.efd;
}

function allLocalCombinations(accountIds, context, balances, today, settings) {
  const optionsByAccount = context.optionsByAccount;
  const slots = accountIds.map(id => [null, ...getEligibleOptions(context, {
    account: context.accounts.get(id), amount: balances.get(id), investmentDate: today, simulationEndDate: settings.endDate
  })]);
  if (!slots.length || slots.every(slot => slot.length === 1)) return { branches: [], pruned: 0 };
  const efdFor = choices => choices.reduce((count, [id, option]) => {
    if (!option?.is_efd) return count;
    return count + ((optionsByAccount.get(id) || []).some(candidate =>
      !candidate.is_efd && candidate.economic_terms_key === option.economic_terms_key
    ) ? 1 : 0);
  }, 0);
  const goalOptionScores = new Map();
  const goalOptionScore = (id, option) => {
    const key = id + "|" + option.economic_terms_key;
    if (goalOptionScores.has(key)) return goalOptionScores.get(key);
    const amount = balances.get(id);
    const ledger = settings.goalProvenance.clone();
    const booked = ledger.debit(id, amount);
    const flows = option.generateCashFlowComponentsAfterAIT(
      amount, today, settings.aitRate, settings.compound, settings.actualLeapYear
    ).map(flow => {
      const returned = ledger.allocateBookedPrincipal(booked, flow.principal, amount);
      return {
        date: formatISODate(flow.date),
        amount: returned.uncredited_interest + flow.interest
      };
    }).filter(flow => flow.amount > EPS);
    const existing = (settings.goalFlows ?? []).map(([date, accountId, components]) => ({
      date, accountId,
      amount: Number(components?.principal_components?.uncredited_interest || 0) +
        Number(components?.interest || 0)
    })).filter(flow => flow.amount > EPS);
    const direct = id === settings.consolidationId;
    const directSchedule = [
      ...existing.filter(flow => flow.accountId === settings.consolidationId),
      ...(direct ? flows : [])
    ].sort((a, b) => a.date.localeCompare(b.date));
    let credited = settings.goalProvenance.creditedNetInterest;
    for (const flow of directSchedule) {
      credited = round2(credited + flow.amount);
      if (credited + EPS >= settings.goalTarget) {
        const days = daysBetween(today, parseISODate(flow.date));
        const score = 1e12 - days * 1e6 + credited;
        goalOptionScores.set(key, score);
        return score;
      }
    }
    const firstDate = flows[0]?.date ?? formatISODate(today);
    const days = daysBetween(today, parseISODate(firstDate));
    const interest = sum(flows.map(flow => flow.amount));
    const score = (direct ? 1e10 : 1e9) - days * 1e4 + interest;
    goalOptionScores.set(key, score);
    return score;
  };
  const profitFor = choices => sum(choices.filter(([, option]) => option).map(([id, option]) =>
    settings.goalMode
      ? goalOptionScore(id, option)
      : getOptionInterest(context, option, balances.get(id), today) *
        (1 - settings.aitRate)
  ));
  const branches = [];
  let pruned = 0;
  if (settings.maxLocalBranches == null) {
    const indices = slots.map(() => 0);
    const total = slots.reduce((n, slot) => n * slot.length, 1);
    for (let n = 0; n < total; n++) {
      const choices = slots.map((slot, index) => [accountIds[index], slot[indices[index]]]);
      if (choices.some(([, option]) => option)) branches.push({ score: profitFor(choices), efd: efdFor(choices), choices });
      for (let i = indices.length - 1; i >= 0; i--) {
        indices[i]++;
        if (indices[i] < slots[i].length) break;
        indices[i] = 0;
      }
    }
  } else {
    let partials = [{ score: 0, efd: 0, choices: [] }];
    for (let index = 0; index < accountIds.length; index++) {
      const id = accountIds[index], expanded = [];
      const accountOptions = slots[index].slice(1);
      const standardTerms = new Set(accountOptions.filter(option => !option.is_efd).map(option => option.economic_terms_key));
      // Resolve each option's score and eFD tie-break once. The old comparator
      // recalculated these values O(log n) times per option during sorting and
      // recalculated the accumulated eFD count for every partial comparison.
      const rankedOptions = accountOptions.map(option => ({
        option,
        score: settings.goalMode
          ? goalOptionScore(id, option)
          : getOptionInterest(context, option, balances.get(id), today) * (1 - settings.aitRate),
        efd: Number(option.is_efd && standardTerms.has(option.economic_terms_key))
      })).sort((a, b) => {
        const profit = b.score - a.score;
        if (Math.abs(profit) > 1e-9) return profit;
        return b.efd - a.efd;
      });
      for (const partial of partials) {
        expanded.push({
          score: partial.score, efd: partial.efd,
          choices: [...partial.choices, [id, null]]
        });
        for (const ranked of rankedOptions) {
          expanded.push({
            score: partial.score + ranked.score,
            efd: partial.efd + ranked.efd,
            choices: [...partial.choices, [id, ranked.option]]
          });
        }
      }
      expanded.sort((a, b) => b.score - a.score || b.efd - a.efd);
      if (expanded.length > settings.maxLocalBranches) pruned += expanded.length - settings.maxLocalBranches;
      partials = expanded.slice(0, settings.maxLocalBranches);
    }
    for (const partial of partials) {
      if (partial.choices.some(([, option]) => option)) branches.push({
        score: partial.score, efd: partial.efd, choices: partial.choices
      });
    }
  }
  branches.sort(compareBranch);
  return { branches, pruned };
}

function buildConsolidationBranches(balances, accounts, context, feeConfig, today, settings) {
  const optionsByAccount = context.optionsByAccount;
  const branches = [];
  const active = balances.filter(([, amount]) => amount > EPS);
  for (const [targetId, target] of accounts) {
    const transfers = [], carries = [];
    let deployable = 0;
    for (const [sourceId, amount] of active) {
      if (sourceId === targetId) { deployable += amount; continue; }
      const source = accounts.get(sourceId);
      const fee = feeConfig.getFee(source.bank_identity, target.bank_identity);
      if (amount > fee) {
        transfers.push({ src_id: sourceId, tgt_id: targetId, amount, fee, net: amount - fee });
        deployable += amount - fee;
      } else carries.push(sourceId);
    }
    if (!transfers.length) continue;
    const fees = sum(transfers.map(item => item.fee));
    for (const option of getEligibleOptions(context, { account: target, amount: deployable, investmentDate: today, simulationEndDate: settings.endDate })) {
      const score = getOptionInterest(context, option, deployable, today) *
        (1 - settings.aitRate) - fees;
      // A negative portfolio-return delta is not proof that a transfer path
      // cannot contribute positive credited interest after provenance-based
      // fee allocation. Keep every financially executable goal candidate.
      if (score <= 0 && context.simulation?.mode !== "goal") continue;
      branches.push({
        score, efd: option.is_efd && (optionsByAccount.get(targetId) || []).some(candidate =>
          !candidate.is_efd && candidate.economic_terms_key === option.economic_terms_key
        ) ? 1 : 0,
        target_id: targetId, option, transfers, principal: deployable, carries
      });
    }
  }
  branches.sort(compareBranch);
  return branches;
}

function advanceState(state, context) {
  const { inflows, outflows } = context;
  const goalMode = context.simulation?.mode === "goal";
  const goalProvenance = goalMode ? state.goalProvenance.clone() : null;
  let balances = state.balances;
  const todayInflows = inflows[state.date] || {};
  for (const [accountId, amount] of Object.entries(todayInflows)) {
    if (!context.accounts.has(accountId)) throw new RangeError("Inflow destination account " + accountId + " is not configured.");
    balances = addSearchBalance(balances, accountId, amount);
    goalProvenance?.addPrincipal(accountId, amount);
  }

  const pending = [];
  for (const [date, entries] of state.flows) {
    if (date < state.date) continue;
    if (date === state.date) {
      for (const [accountId, amount] of entries) balances = addSearchBalance(balances, accountId, amount);
    } else pending.push([date, entries]);
  }

  const pendingGoalFlows = [];
  for (const [date, accountId, components] of state.goalFlows ?? []) {
    if (date < state.date) continue;
    if (date === state.date) {
      goalProvenance?.addCashFlow(
        accountId, components.principal_components ?? {}, components.interest ?? 0
      );
    } else pendingGoalFlows.push([date, accountId, components]);
  }
  goalProvenance?.recognizeConsolidationCredit(context.consolidationId);

  const beforeOutflows = goalMode ? new Map(balances) : null;
  const processed = processOutflows(state.date, balances, state.obligations, outflows[state.date] || []);
  if (!processed.valid) return null;
  if (goalProvenance) {
    const afterOutflows = new Map(processed.balances);
    for (const [accountId, before] of beforeOutflows) {
      const paid = round2(before - (afterOutflows.get(accountId) || 0));
      if (paid > EPS) goalProvenance.debit(accountId, paid);
    }
    for (const [accountId, balance] of afterOutflows) {
      if (Math.abs(round2(balance) - goalProvenance.total(accountId)) > 0.02) {
        throw new Error("Goal search provenance does not reconcile for account " + accountId + ".");
      }
    }
  }
  return {
    ...state,
    balances: processed.balances,
    flows: pending,
    goalFlows: pendingGoalFlows,
    goalProvenance: goalProvenance ?? state.goalProvenance,
    goalPriorityHint: null,
    obligations: processed.pending,
    paid: round2(state.paid + processed.paid),
  };
}

function calculateFinalSweepFees(accounts, consolidationId, feeConfig) {
  const entries = accounts instanceof Map ? [...accounts.values()] : Object.values(accounts);
  const target = accounts instanceof Map ? accounts.get(consolidationId) : accounts[consolidationId];
  if (!target) return 0;
  let fees = 0;
  for (const account of entries) {
    if (account.id === target.id || account.balance <= EPS) continue;
    const fee = feeConfig.getFee(account.bank_identity, target.bank_identity);
    if (account.balance > fee) fees += fee;
  }
  return fees;
}

function scopedObjective(result, context) {
  if (!result?.valid) return -Infinity;
  const liabilities = sum((result.outstanding_outflows ?? []).map(item => Number(item.remaining || 0)));
  return Number(result.final_value ?? 0) -
    calculateFinalSweepFees(result.accounts, context.consolidationId, context.feeConfig) - liabilities;
}

function resultOperationCount(result) {
  const events = Object.values(result.timeline ?? {}).flat();
  const transferEvents = events.filter(event => event.type === "transfer").length;
  const carryForwardEvents = events.filter(event => event.type === "carry_forward").length;
  // The runtime records both sides of each transfer as separate ledger events.
  const transfers = Math.floor(transferEvents / 2);
  return (result.bookings?.length ?? 0) + transfers + carryForwardEvents;
}

/**
 * Financial value is the primary objective. On equality, prefer a valid plan
 * with fewer outstanding obligations, then fewer booking, transfer and
 * carry-forward operations. Fees are already included in scopedObjective and are not counted
 * again here.
 */
export function compareScopedResults(candidate, baseline, context) {
  if (!candidate?.valid) return -1;
  if (!baseline?.valid) return 1;
  const candidateObjective = scopedObjective(candidate, context);
  const baselineObjective = scopedObjective(baseline, context);
  if (candidateObjective > baselineObjective + EPS) return 1;
  if (candidateObjective < baselineObjective - EPS) return -1;

  const outstanding = result =>
    sum((result.outstanding_outflows ?? []).map(item => Number(item.remaining || 0)));
  const candidateOutstanding = outstanding(candidate);
  const baselineOutstanding = outstanding(baseline);
  if (candidateOutstanding < baselineOutstanding - EPS) return 1;
  if (candidateOutstanding > baselineOutstanding + EPS) return -1;

  const candidateOperations = resultOperationCount(candidate);
  const baselineOperations = resultOperationCount(baseline);
  return candidateOperations < baselineOperations ? 1 : candidateOperations > baselineOperations ? -1 : 0;
}

function terminalValue(state, context) {
  const balances = new Map(state.balances);
  const targetId = context.consolidationId;
  const target = context.accounts.get(targetId);
  for (const [accountId, amount] of state.balances) {
    if (accountId === targetId || amount <= EPS) continue;
    const fee = context.feeConfig.getFee(context.accounts.get(accountId).bank_identity, target.bank_identity);
    if (amount > fee) {
      balances.set(targetId, round2((balances.get(targetId) || 0) + amount - fee));
      balances.set(accountId, 0);
    }
  }
  const liabilities = sum(state.obligations.map(item => Number(item[2])));
  return (balances.get(targetId) || 0) + state.paid - liabilities;
}

function makeUpperBound(state, context, exponential = false) {
  const key = JSON.stringify([stateKey(state), Boolean(exponential)]);
  return cachedValue(context.upperBoundCache, key,
    () => calculateUpperBound(state, context, exponential),
    context.cacheStats.upperBound);
}

function calculateUpperBound(state, context, exponential = false) {
  const rate = context.maxRate;
  const grow = (amount, fromDate) => {
    const years = Math.max(0, daysBetween(fromDate, context.endDate)) / 365;
    return amount * (exponential ? Math.exp(rate * years) : 1 + rate * years);
  };
  let total = sum(state.balances.map(([, amount]) => grow(amount, state.date)));
  for (const [date, entries] of state.flows) {
    if (date <= context.end) total += grow(sum(entries.map(([, amount]) => amount)), date);
  }
  for (let index = firstIndexAfter(context.inflowDateTotals, state.date, item => item.date);
    index < context.inflowDateTotals.length; index++) {
    const inflow = context.inflowDateTotals[index];
    if (inflow.date > context.end) break;
    total += grow(inflow.amount, inflow.date);
  }
  return total + state.paid - sum(state.obligations.map(item => Number(item[2])));
}

function makePriority(state, context) {
  const key = stateKey(state);
  return cachedValue(context.priorityCache, key,
    () => calculatePriority(state, context),
    context.cacheStats.priority);
}

function calculatePriority(state, context) {
  const upper = makeUpperBound(state, context, true);
  let estimate = state.paid - sum(state.obligations.map(item => Number(item[2])));
  const buckets = new Map();
  const add = (accountId, date, amount) => {
    if (amount <= 0 || date > context.end) return;
    const key = accountId + "|" + date;
    buckets.set(key, (buckets.get(key) || 0) + amount);
  };
  for (const [id, amount] of state.balances) add(id, state.date, amount);
  for (const [id, amount] of Object.entries(context.inflows[state.date] || {})) add(id, state.date, amount);
  for (const [date, entries] of state.flows) for (const [id, amount] of entries) add(id, date, amount);
  for (let index = firstIndexAfter(context.inflowEvents, state.date, item => item.date);
    index < context.inflowEvents.length; index++) {
    const inflow = context.inflowEvents[index];
    if (inflow.date > context.end) break;
    add(inflow.accountId, inflow.date, inflow.amount);
  }
  for (const [key, amount] of buckets) {
    const [accountId, date] = key.split("|");
    const account = context.accounts.get(accountId);
    const options = getEligibleOptions(context, { account, amount, investmentDate: date, simulationEndDate: context.endDate });
    const rate = options.reduce((best, option) => Math.max(best, option.annual_rate / 100), 0);
    estimate += amount * Math.exp(rate * Math.max(0, daysBetween(parseISODate(date), context.endDate)) / 365);
  }
  return estimate + 0.05 * Math.max(0, upper - estimate);
}

function estimateGoalOpportunity(state, context) {
  const goal = context.simulation?.goal;
  if (!goal || !state.goalProvenance) return null;
  const targetId = context.consolidationId;
  const targetAccount = context.accounts.get(targetId);
  const ledger = state.goalProvenance.clone();
  const balances = mapOf(state.balances);
  for (const [sourceId, amount] of state.balances) {
    if (sourceId === targetId || amount <= EPS) continue;
    const source = context.accounts.get(sourceId);
    const fee = context.feeConfig.getFee(source.bank_identity, targetAccount.bank_identity);
    if (amount <= fee) continue;
    ledger.transfer(sourceId, targetId, amount, fee);
    balances.set(sourceId, 0);
    balances.set(targetId, round2((balances.get(targetId) || 0) + amount - fee));
  }
  ledger.recognizeConsolidationCredit(targetId);
  if (ledger.creditedNetInterest + EPS >= goal.target) return state.date;

  const existingCredits = (state.goalFlows ?? [])
    .filter(([, accountId]) => accountId === targetId)
    .map(([date, , components]) => ({
      date,
      amount: Number(components?.principal_components?.uncredited_interest || 0) +
        Number(components?.interest || 0)
    })).filter(item => item.amount > EPS);
  const principal = balances.get(targetId) || 0;
  const options = getEligibleOptions(context, {
    account: targetAccount, amount: principal,
    investmentDate: parseISODate(state.date), simulationEndDate: context.endDate
  });
  let bestDate = null;
  const evaluate = additions => {
    let actual = ledger.creditedNetInterest;
    for (const flow of [...existingCredits, ...additions].sort((a, b) => a.date.localeCompare(b.date))) {
      actual = round2(actual + flow.amount);
      if (actual + EPS >= goal.target) return flow.date;
    }
    return null;
  };
  bestDate = evaluate([]);
  for (const option of options) {
    const trial = ledger.clone();
    const booked = trial.debit(targetId, principal);
    const additions = option.generateCashFlowComponentsAfterAIT(
      principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear
    ).map(flow => {
      const returned = trial.allocateBookedPrincipal(booked, flow.principal, principal);
      return {
        date: formatISODate(flow.date),
        amount: returned.uncredited_interest + flow.interest
      };
    }).filter(item => item.amount > EPS);
    const date = evaluate(additions);
    if (date && (!bestDate || date < bestDate)) bestDate = date;
  }
  return bestDate;
}

function makeGoalPriority(state, context) {
  const goal = context.simulation?.goal;
  const provenance = state.goalProvenance;
  if (!goal || !provenance) return -Infinity;
  const target = Number(goal.target);
  const credited = provenance.creditedNetInterest;
  if (credited + EPS >= target) {
    const days = daysBetween(parseISODate(context.start), parseISODate(state.date));
    return 1e15 - days * 1e9 + credited;
  }
  const pending = (state.goalFlows ?? []).map(([date, accountId, components]) => ({
    date, accountId,
    interest: Number(components?.principal_components?.uncredited_interest || 0) +
      Number(components?.interest || 0)
  })).filter(item => item.interest > EPS);
  const direct = pending.filter(item => item.accountId === context.consolidationId)
    .sort((a, b) => a.date.localeCompare(b.date));
  let running = credited;
  let directAchievementDate = null;
  for (const flow of direct) {
    running = round2(running + flow.interest);
    if (running + EPS >= target) {
      directAchievementDate = flow.date;
      break;
    }
  }
  if (state.goalPriorityHint &&
      (!directAchievementDate || state.goalPriorityHint < directAchievementDate)) {
    const days = daysBetween(parseISODate(context.start), parseISODate(state.goalPriorityHint));
    return 1e14 - days * 1e9 + 5e8;
  }
  if (directAchievementDate) {
    const days = daysBetween(parseISODate(context.start), parseISODate(directAchievementDate));
    return 1e14 - days * 1e9 + running;
  }

  const liquidUncredited = sum([...provenance.accounts.values()].map(item => item.uncredited_interest));
  const pendingPotential = sum(pending.map(item => item.interest));
  const potential = credited + liquidUncredited + pendingPotential;
  const earliestPotentialDate = liquidUncredited > EPS
    ? state.date
    : pending.reduce((earliest, item) => !earliest || item.date < earliest ? item.date : earliest, null) ?? state.date;
  const days = daysBetween(parseISODate(context.start), parseISODate(earliestPotentialDate));
  if (potential + EPS >= target) return 1e12 - days * 1e6 + potential;
  const elapsed = daysBetween(parseISODate(context.start), parseISODate(state.date));
  return 1e9 * Math.min(1, potential / target) + credited * 100 - elapsed * 1e4;
}

function createContext({ options, start, end, simulation, inflow_schedule, accounts, inflow_account_id, fee_config, consolidation_account_id, outflow_schedule }, strategy) {
  const startDate = parseISODate(start), endDate = parseISODate(end);
  if (!Array.isArray(options) || !options.length) throw new TypeError(strategy.name + " simulation requires FD options.");
  if (!accounts?.length) {
    const bank = options[0].bank_identity || "commercial";
    accounts = [new Account({ id: "default", bank_key: bank, bank_id: bank, label: "Main Account" })];
  }
  inflow_account_id ||= accounts[0].id;
  consolidation_account_id ||= inflow_account_id;
  fee_config ||= new TransferFeeConfig();
  const accountMap = new Map(accounts.map(account => [account.id, new Account({
    id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
    label: account.label, balance: account.balance, supports_efd: account.supports_efd
  })]));
  if (!accountMap.has(inflow_account_id)) throw new RangeError("inflow_account_id does not reference a configured account.");
  if (!accountMap.has(consolidation_account_id)) throw new RangeError("consolidation_account_id does not reference a configured account.");
  const inflows = normalizeInflowSchedule(inflow_schedule, inflow_account_id);
  const outflows = outflow_schedule || {};
  validateOutflowSchedule(outflows, formatISODate(startDate), formatISODate(endDate), new Set(accountMap.keys()));
  const effectiveOptions = selectSearchOptions(options, simulation);
  const fdOptionManager = new FDOptionManager(effectiveOptions);
  const optionsByAccount = new Map();
  for (const [id, account] of accountMap) {
    optionsByAccount.set(id, fdOptionManager.getAccountOptions(account));
  }
  if ([...optionsByAccount.values()].some(list => list.length === 0)) throw new RangeError("Every account must have at least one compatible FD product.");
  const fittingRates = effectiveOptions.filter(option => option.fitsBefore(startDate, endDate)).map(option => option.annual_rate);
  const maxRate = fittingRates.length ? Math.max(0, ...fittingRates) / 100 : 0.11;
  const totalCapital = sum(accounts.map(account => account.balance)) + sum(Object.values(inflows).flatMap(day => Object.values(day)));
  const inflowDates = Object.keys(inflows).sort(dateSort);
  const inflowDateTotals = inflowDates.map(date => ({
    date, amount: sum(Object.values(inflows[date]))
  }));
  const inflowEvents = inflowDates.flatMap(date =>
    Object.entries(inflows[date]).map(([accountId, amount]) => ({ date, accountId, amount }))
  ).sort((a, b) => dateSort(a.date, b.date) || a.accountId.localeCompare(b.accountId));
  const eventDates = [...new Set([...inflowDates, ...Object.keys(outflows)])].sort(dateSort);
  return {
    accounts: accountMap, options: effectiveOptions, optionsByAccount, fdOptionManager,
    inflows, outflows, inflowDates, inflowDateTotals, inflowEvents, eventDates,
    eligibleOptionsCache: new Map(), optionInterestCache: new Map(),
    upperBoundCache: new Map(), priorityCache: new Map(), expansionCache: new Map(),
    cacheStats: {
      eligibleOptions: { hits: 0, misses: 0 },
      optionInterest: { hits: 0, misses: 0 },
      upperBound: { hits: 0, misses: 0 },
      priority: { hits: 0, misses: 0 },
      expansion: { hits: 0, misses: 0 }
    },
    startDate, endDate, start: formatISODate(startDate), end: formatISODate(endDate), simulation: simulation ?? { mode: "scoped" },
    inflowAccountId: inflow_account_id, consolidationId: consolidation_account_id, feeConfig: fee_config,
    compound: strategy.compound, actualLeapYear: strategy.actual_leap_year, aitRate: strategy.effective_ait_rate,
    maxRate, totalCapital
  };
}

function expandState(rawState, context, settings, mode, counters, operationCount = 0) {
  const state = advanceState(rawState, context);
  if (!state) return { terminal: false, children: [] };
  if (state.date >= context.end) {
    counters.leaves++;
    const value = terminalValue(state, context);
    return { terminal: true, value, state, children: [] };
  }
  const goalMode = context.simulation?.mode === "goal";
  const bound = makeUpperBound(state, context, mode === "gaml");
  const stillSeekingBaselineTie = counters.bestValue <= counters.baselineValue + EPS;
  if (!goalMode && (stillSeekingBaselineTie
    ? bound < counters.bestValue - EPS
    : bound <= counters.bestValue + EPS)) {
    counters.boundPruned++;
    return { terminal: false, children: [] };
  }
  const key = stateKey(state);
  const prior = counters.memo.get(key);
  if (!goalMode && prior) {
    counters.memo.delete(key);
    counters.memo.set(key, prior);
  }
  if (!goalMode && prior &&
      prior.bound >= bound - EPS &&
      prior.operationCount <= operationCount) {
    counters.memoPruned++;
    return { terminal: false, children: [] };
  }
  if (!goalMode) {
    if (!prior && counters.memo.size >= SEARCH_STATE_MEMO_LIMIT) {
      counters.memo.delete(counters.memo.keys().next().value);
      counters.memoEvictions++;
    }
    counters.memo.set(key, {
      bound: Math.max(bound, prior?.bound ?? -Infinity),
      operationCount: Math.min(operationCount, prior?.operationCount ?? Infinity)
    });

    const expansionKey = mode + "|" + key;
    const cachedExpansion = context.expansionCache.get(expansionKey);
    if (cachedExpansion) {
      context.expansionCache.delete(expansionKey);
      context.expansionCache.set(expansionKey, cachedExpansion);
      context.cacheStats.expansion.hits++;
      return {
        terminal: false,
        children: cachedExpansion.map(child => ({
          ...child,
          state: child.state,
          action: child.action,
          root_signature: child.root_signature
        }))
      };
    }
    context.cacheStats.expansion.misses++;
  }

  const nextDate = nextEventDate(state.date, state.flows, context.eventDates, context.end);
  const activeIds = state.balances.filter(([, amount]) => amount > EPS).map(([id]) => id);
  if (!activeIds.length) return {
    terminal: false,
    children: [{ state: { ...state, date: nextDate }, action: null, root_signature: null, priority: null }]
  };

  const balances = new Map(state.balances);
  const children = [];
  const pushAction = (
    date, nextBalances, nextFlows, action, rootSignature = null,
    nextGoalProvenance = state.goalProvenance, nextGoalFlows = state.goalFlows ?? [],
    goalPriorityHint = null
  ) => {
    children.push({
      state: {
        date, balances: nextBalances, flows: nextFlows,
        goalProvenance: nextGoalProvenance, goalFlows: nextGoalFlows,
        goalPriorityHint, obligations: state.obligations, paid: state.paid
      },
      date: state.date, action, root_signature: rootSignature
    });
  };

  let waitFirst = false;
  let waitGoalDate = null;
  if (mode === "gaml") {
    const nextInflowIndex = firstIndexAfter(context.inflowDates, state.date);
    const nextInflow = context.inflowDates[nextInflowIndex];
    if (goalMode) {
      if (nextInflow && nextInflow === nextDate &&
          daysBetween(parseISODate(state.date), parseISODate(nextInflow)) <= 30) {
        const projected = advanceState({ ...state, date: nextInflow }, context);
        if (projected) {
          const currentGoalDate = estimateGoalOpportunity(state, context);
          const futureGoalDate = estimateGoalOpportunity(projected, context);
          waitFirst = Boolean(futureGoalDate && (!currentGoalDate || futureGoalDate < currentGoalDate));
          if (waitFirst) waitGoalDate = futureGoalDate;
        }
      }
    } else if (nextInflow && daysBetween(parseISODate(state.date), parseISODate(nextInflow)) <= 30) {
      const projected = new Map(balances);
      for (const [id, amount] of Object.entries(context.inflows[nextInflow] || {})) projected.set(id, round2((projected.get(id) || 0) + amount));
      const bestRate = map => {
        let best = 0;
        for (const [targetId, target] of context.accounts) {
          let deployable = 0;
          for (const [sourceId, amount] of map) {
            if (amount <= EPS) continue;
            if (sourceId === targetId) deployable += amount;
            else {
              const fee = context.feeConfig.getFee(context.accounts.get(sourceId).bank_identity, target.bank_identity);
              if (amount > fee) deployable += amount - fee;
            }
          }
          for (const option of getEligibleOptions(context, { account: target, amount: deployable, investmentDate: state.date, simulationEndDate: context.endDate })) {
            best = Math.max(best, option.annual_rate);
          }
        }
        return best;
      };
      let aligned = false;
      for (const id of activeIds) {
        const account = context.accounts.get(id);
        for (const option of getEligibleOptions(context, { account, amount: balances.get(id), investmentDate: state.date, simulationEndDate: context.endDate })) {
          const maturity = formatISODate(new Date(parseISODate(state.date).getTime() + option.days * 86_400_000));
          const alignedDate = context.inflowDates[firstIndexAtOrAfter(context.inflowDates, maturity)];
          if (alignedDate && daysBetween(parseISODate(maturity), parseISODate(alignedDate)) <= 7) aligned = true;
        }
      }
      waitFirst = !aligned || bestRate(projected) > bestRate(balances) + EPS;
      waitFirst = waitFirst && daysBetween(parseISODate(state.date), parseISODate(nextInflow)) > 0;
    }
  }
  if (waitFirst && (mode !== "gaml" || settings.maxDecisions == null || counters.expanded < settings.maxDecisions)) {
    const action = { type: "carry", carries: activeIds };
    pushAction(nextDate, state.balances, state.flows, action, ["carry"],
      state.goalProvenance, state.goalFlows ?? [], waitGoalDate);
  }

  const consolidation = buildConsolidationBranches(state.balances, context.accounts, context, context.feeConfig, parseISODate(state.date), {
    ...settings, endDate: context.endDate, compound: context.compound, actualLeapYear: context.actualLeapYear, aitRate: context.aitRate
  });
  for (const branch of consolidation) {
    if (mode === "gaml" && settings.maxDecisions != null && counters.expanded >= settings.maxDecisions) break;
    const nextBalances = zeroSearchBalances(
      state.balances,
      [...branch.transfers.map(transfer => transfer.src_id), branch.target_id]
    );
    const flows = branch.option.generateCashFlowsAfterAIT(branch.principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear)
      .map(flow => [formatISODate(flow.date), branch.target_id, flow.amount]);
    let nextGoalProvenance = state.goalProvenance;
    let nextGoalFlows = state.goalFlows ?? [];
    if (nextGoalProvenance) {
      nextGoalProvenance = nextGoalProvenance.clone();
      for (const transfer of branch.transfers) {
        nextGoalProvenance.transfer(transfer.src_id, transfer.tgt_id, transfer.amount, transfer.fee);
        if (transfer.tgt_id === context.consolidationId) {
          nextGoalProvenance.recognizeConsolidationCredit(context.consolidationId);
        }
      }
      const bookedComponents = nextGoalProvenance.debit(branch.target_id, branch.principal);
      const componentFlows = branch.option.generateCashFlowComponentsAfterAIT(
        branch.principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear
      );
      nextGoalFlows = [...nextGoalFlows];
      for (const flow of componentFlows) {
        const principalComponents = nextGoalProvenance.allocateBookedPrincipal(
          bookedComponents, flow.principal, branch.principal
        );
        nextGoalFlows.push([formatISODate(flow.date), branch.target_id, {
          principal_components: principalComponents, interest: flow.interest
        }]);
      }
      nextGoalProvenance.recognizeConsolidationCredit(context.consolidationId);
    }
    const action = {
      type: "consolidate", target_id: branch.target_id, option: branch.option,
      transfers: branch.transfers, principal: branch.principal, carries: branch.carries
    };
    const root = ["consolidate", branch.target_id, branch.option.label, branch.option.payout_type, branch.option.payout_period_str];
    const merged = mergePendingFlows(state.flows, flows);
    pushAction(
      nextEventDate(state.date, merged, context.eventDates, context.end),
      nextBalances, merged, action, root, nextGoalProvenance, nextGoalFlows
    );
  }

  const local = allLocalCombinations(activeIds, context, balances, parseISODate(state.date), {
    endDate: context.endDate, compound: context.compound, actualLeapYear: context.actualLeapYear,
    aitRate: context.aitRate, maxLocalBranches: mode === "gaml" ? settings.maxLocalBranches : null,
    goalMode, goalTarget: context.simulation?.goal?.target,
    goalProvenance: state.goalProvenance, goalFlows: state.goalFlows,
    consolidationId: context.consolidationId
  });
  counters.localPruned += local.pruned;
  for (const branch of local.branches) {
    if (mode === "gaml" && settings.maxDecisions != null && counters.expanded >= settings.maxDecisions) break;
    const bookings = branch.choices.filter(([, option]) => option).map(([account_id, option]) => ({
      account_id, option, principal: balances.get(account_id)
    }));
    const bookedIds = new Set(bookings.map(item => item.account_id));
    const carries = activeIds.filter(id => !bookedIds.has(id));
    const nextBalances = zeroSearchBalances(
      state.balances,
      bookings.map(booking => booking.account_id)
    );
    const additions = [];
    let nextGoalProvenance = state.goalProvenance;
    let nextGoalFlows = state.goalFlows ?? [];
    if (nextGoalProvenance) {
      nextGoalProvenance = nextGoalProvenance.clone();
      nextGoalFlows = [...nextGoalFlows];
    }
    for (const booking of bookings) {
      if (nextGoalProvenance) {
        const bookedComponents = nextGoalProvenance.debit(booking.account_id, booking.principal);
        const componentFlows = booking.option.generateCashFlowComponentsAfterAIT(
          booking.principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear
        );
        for (const flow of componentFlows) {
          additions.push([formatISODate(flow.date), booking.account_id, flow.amount]);
          const principalComponents = nextGoalProvenance.allocateBookedPrincipal(
            bookedComponents, flow.principal, booking.principal
          );
          nextGoalFlows.push([formatISODate(flow.date), booking.account_id, {
            principal_components: principalComponents, interest: flow.interest
          }]);
        }
      } else {
        for (const flow of booking.option.generateCashFlowsAfterAIT(
          booking.principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear
        )) additions.push([formatISODate(flow.date), booking.account_id, flow.amount]);
      }
    }
    nextGoalProvenance?.recognizeConsolidationCredit(context.consolidationId);
    const merged = mergePendingFlows(state.flows, additions);
    const action = { type: "local", bookings, carries };
    const root = ["local", bookings.map(item => [
      item.account_id, item.option.label, item.option.payout_type, item.option.payout_period_str
    ]).sort((a, b) => a[0].localeCompare(b[0]))];
    pushAction(
      nextEventDate(state.date, merged, context.eventDates, context.end),
      nextBalances, merged, action, root, nextGoalProvenance, nextGoalFlows
    );
  }

  if ((!waitFirst || mode !== "gaml") &&
      (mode !== "gaml" || settings.maxDecisions == null || counters.expanded < settings.maxDecisions)) {
    const action = { type: "carry", carries: activeIds };
    pushAction(nextDate, state.balances, state.flows, action, ["carry"]);
  }
  if (!goalMode && (settings.maxDecisions == null || counters.expanded < settings.maxDecisions)) {
    const expansionKey = mode + "|" + key;
    if (context.expansionCache.size >= SEARCH_EXPANSION_CACHE_LIMIT && !context.expansionCache.has(expansionKey)) {
      context.expansionCache.delete(context.expansionCache.keys().next().value);
    }
    context.expansionCache.set(expansionKey, children.map(child => ({
      ...child,
      state: child.state,
      action: child.action,
      root_signature: child.root_signature
    })));
  }
  return { terminal: false, children };
}

function goalPathCanCredit(path, consolidationId) {
  return path.some(({ action }) =>
    (action.type === "consolidate" && action.target_id === consolidationId) ||
    (action.type === "local" && action.bookings?.some(item => item.account_id === consolidationId))
  );
}

function goalDateHasPassed(stateDate, context, score) {
  return Boolean(score?.achieved &&
    daysBetween(context.startDate, parseISODate(stateDate)) > score.elapsed_days);
}

function updateScopedBest(value, state, node, counters) {
  const operations = node?.operation_count ?? 0;
  const outstanding = sum((state.obligations ?? []).map(item => Number(item[2])));
  if (value > counters.bestValue + EPS) {
    counters.bestValue = value;
    counters.bestOutstanding = outstanding;
    counters.bestOperationCount = operations;
    counters.bestNode = node;
    return;
  }
  if (Math.abs(value - counters.bestValue) <= EPS &&
      (outstanding < counters.bestOutstanding - EPS ||
        (Math.abs(outstanding - counters.bestOutstanding) <= EPS &&
          operations < counters.bestOperationCount))) {
    counters.bestOutstanding = outstanding;
    counters.bestOperationCount = operations;
    counters.bestNode = node;
  }
  counters.alternatives.push(value - counters.totalCapital);
  counters.alternatives.sort((a, b) => b - a);
  counters.alternatives.length = Math.min(10, counters.alternatives.length);
}

function runAbsolute(initial, context, settings, counters, evaluateGoal = null, initialGoalScore = null, budget = null) {
  let bestNode = null, bestGoalScore = initialGoalScore, goalPrunedByAchievement = 0;
  let budgetStopped = false, budgetStopReason = null;
  const timeExpired = () => budget?.deadlineAt != null && budget.now() >= budget.deadlineAt;
  function visit(rawState, parentNode = null) {
    if (timeExpired()) { budgetStopped = true; budgetStopReason = "time_limit"; return; }
    const path = evaluateGoal && parentNode ? nodePath(parentNode) : null;
    if (path && goalPathCanCredit(path, context.consolidationId)) {
      const score = evaluateGoal(path, null);
      if (compareGoalScores(score, bestGoalScore) > 0) {
        bestGoalScore = score;
        bestNode = parentNode;
      }
    }
    if (evaluateGoal && goalDateHasPassed(rawState.date, context, bestGoalScore)) {
      goalPrunedByAchievement++;
      return;
    }
    counters.expanded++;
    const expanded = expandState(
      rawState, context, settings, "absolute", counters, parentNode?.operation_count ?? 0
    );
    if (timeExpired()) { budgetStopped = true; budgetStopReason = "time_limit"; }
    if (expanded.terminal) {
      if (evaluateGoal) {
        const score = evaluateGoal(path ?? nodePath(parentNode), expanded.value);
        if (compareGoalScores(score, bestGoalScore) > 0) { bestGoalScore = score; bestNode = parentNode; }
        return;
      }
      updateScopedBest(expanded.value, expanded.state, parentNode, counters);
      bestNode = counters.bestNode;
      return;
    }
    if (budgetStopped) return;
    for (const child of expanded.children) {
      const node = child.action ? makeNode(parentNode, child.action, child.date, parentNode?.root_signature ? null : child.root_signature) : parentNode;
      visit(child.state, node);
    }
  }
  visit(initial, makeNode(null, null, context.start));
  const optimalityProven = !budgetStopped && (evaluateGoal
    ? counters.localPruned === 0 && counters.boundPruned === 0 && counters.memoPruned === 0
    : true);
  return { bestNode, bestGoalScore, goalPrunedByAchievement, budgetStopped, budgetStopReason, optimalityProven };
}

function runGaml(initial, context, settings, counters, evaluateGoal = null, initialGoalScore = null, budget = null) {
  let bestNode = null, bestGoalScore = initialGoalScore, sequence = 0;
  let goalPrunedByAchievement = 0;
  const goalMode = context.simulation?.mode === "goal";
  let beam = [{
    state: initial, node: makeNode(null, null, context.start),
    priority: goalMode ? makeGoalPriority(initial, context) : makeUpperBound(initial, context, true),
    sequence: sequence++
  }];
  let budgetStopped = false, budgetStopReason = null, beamPruned = 0, beamDuplicatePruned = 0, rootPeak = 0;
  const timeExpired = () => budget?.deadlineAt != null && budget.now() >= budget.deadlineAt;
  let budgetFrontier = [];
  const budgetFrontierCheckpoints = [];
  const candidateKey = candidate => goalMode
    ? goalSearchStateKey(candidate.state, candidate.node ? nodePath(candidate.node) : [])
    : stateKey(candidate.state);
  const selectBeam = (candidates, rootBest, carry = []) => {
    const allCandidates = [...candidates, ...carry];
    const bestByState = new Map();
    for (const candidate of allCandidates) {
      const key = candidateKey(candidate);
      const previous = bestByState.get(key);
      if (!previous || candidate.priority > previous.priority ||
          (Math.abs(candidate.priority - previous.priority) <= EPS &&
            (candidate.node?.operation_count ?? 0) < (previous.node?.operation_count ?? 0))) {
        bestByState.set(key, candidate);
      }
    }
    const unique = [...bestByState.values()].sort((a, b) =>
      b.priority - a.priority ||
      (a.node?.operation_count ?? 0) - (b.node?.operation_count ?? 0) ||
      a.sequence - b.sequence
    );
    const diversity = [...rootBest.values()].sort((a, b) =>
      b.priority - a.priority ||
      (a.node?.operation_count ?? 0) - (b.node?.operation_count ?? 0)
    ).slice(0, Math.max(1, Math.floor(settings.beamWidth / 3)));
    const selected = [], seen = new Set();
    for (const candidate of diversity) {
      const key = candidateKey(candidate);
      if (!seen.has(key)) { selected.push(candidate); seen.add(key); }
    }
    for (const candidate of unique) {
      if (selected.length >= settings.beamWidth) break;
      const key = candidateKey(candidate);
      if (!seen.has(key)) { selected.push(candidate); seen.add(key); }
    }
    return {
      selected,
      diversitySize: diversity.length,
      pruned: Math.max(0, allCandidates.length - selected.length)
    };
  };
  while (beam.length) {
    const beamByState = new Map();
    for (const entry of beam) {
      const key = stateKey(entry.state);
      const previous = beamByState.get(key);
      if (!previous || entry.priority > previous.priority ||
          (Math.abs(entry.priority - previous.priority) <= EPS &&
            (entry.node?.operation_count ?? 0) < (previous.node?.operation_count ?? 0))) {
        beamByState.set(key, entry);
      }
    }
    beamDuplicatePruned += beam.length - beamByState.size;
    beam = [...beamByState.values()];

    const candidates = [], rootBest = new Map();
    for (let beamIndex = 0; beamIndex < beam.length; beamIndex++) {
      const entry = beam[beamIndex];
      const path = evaluateGoal && entry.node ? nodePath(entry.node) : null;
      if (path && goalPathCanCredit(path, context.consolidationId)) {
        const score = evaluateGoal(path, null);
        if (compareGoalScores(score, bestGoalScore) > 0) {
          bestGoalScore = score;
          bestNode = entry.node;
        }
      }
      if (evaluateGoal && goalDateHasPassed(entry.state.date, context, bestGoalScore)) {
        goalPrunedByAchievement++;
        continue;
      }
      if (settings.maxDecisions != null && counters.expanded >= settings.maxDecisions) {
        budgetStopped = true;
        budgetStopReason = "expanded_state_limit";
        candidates.push(...beam.slice(beamIndex));
        break;
      }
      if (timeExpired()) {
        budgetStopped = true;
        budgetStopReason = "time_limit";
        candidates.push(...beam.slice(beamIndex));
        break;
      }
      const expanded = expandState(
        entry.state, context, settings, "gaml", counters, entry.node?.operation_count ?? 0
      );
      counters.expanded++;
      if (expanded.terminal) {
        if (evaluateGoal) {
          const score = evaluateGoal(path ?? nodePath(entry.node), expanded.value);
          if (compareGoalScores(score, bestGoalScore) > 0) { bestGoalScore = score; bestNode = entry.node; }
        } else {
          updateScopedBest(expanded.value, expanded.state, entry.node, counters);
          bestNode = counters.bestNode;
        }
        if (timeExpired()) {
          budgetStopped = true;
          budgetStopReason = "time_limit";
          candidates.push(...beam.slice(beamIndex + 1));
          break;
        }
        if (timeExpired()) {
        budgetStopped = true;
        budgetStopReason = "time_limit";
        candidates.push(...beam.slice(beamIndex + 1));
        break;
      }
      if (!goalMode && settings.maxDecisions != null && counters.expanded % SEARCH_BUDGET_CHECKPOINT_INTERVAL === 0) {
          const checkpoint = selectBeam(candidates, rootBest, beam.slice(beamIndex + 1));
          rootPeak = Math.max(rootPeak, checkpoint.diversitySize);
          budgetFrontierCheckpoints.push([...checkpoint.selected]
          .sort((a, b) => b.priority - a.priority ||
            (a.node?.operation_count ?? 0) - (b.node?.operation_count ?? 0))
          .slice(0, 4));
        }
        continue;
      }
      for (const child of expanded.children) {
        sequence++;
        const node = child.action ? makeNode(entry.node, child.action, child.date, entry.node?.root_signature ? null : child.root_signature) : entry.node;
        const priority = goalMode ? makeGoalPriority(child.state, context) : makePriority(child.state, context);
        const candidate = { state: child.state, node, priority, sequence };
        const signature = node?.root_signature || ["unclassified"];
        const rootKey = JSON.stringify(signature);
        const prior = rootBest.get(rootKey);
        if (!prior || candidate.priority > prior.priority ||
            (Math.abs(candidate.priority - prior.priority) <= EPS &&
              (candidate.node?.operation_count ?? 0) < (prior.node?.operation_count ?? 0))) {
          rootBest.set(rootKey, candidate);
        }
        candidates.push(candidate);
      }
      if (!goalMode && settings.maxDecisions != null && counters.expanded % SEARCH_BUDGET_CHECKPOINT_INTERVAL === 0) {
        const checkpoint = selectBeam(candidates, rootBest, beam.slice(beamIndex + 1));
        rootPeak = Math.max(rootPeak, checkpoint.diversitySize);
        budgetFrontierCheckpoints.push([...checkpoint.selected]
          .sort((a, b) => b.priority - a.priority ||
            (a.node?.operation_count ?? 0) - (b.node?.operation_count ?? 0))
          .slice(0, 4));
      }
    }
    const { selected, diversitySize, pruned } = selectBeam(candidates, rootBest);
    rootPeak = Math.max(rootPeak, diversitySize);
    beamPruned += pruned;
    beam = selected;
    if (budgetStopped) {
      budgetFrontier = selected;
      break;
    }
  }
  return {
    bestNode, bestGoalScore, beamPruned, beamDuplicatePruned, rootPeak, budgetStopped, budgetStopReason, budgetFrontier,
    budgetFrontierCheckpoints, goalPrunedByAchievement,
    optimalityProven: !budgetStopped && (settings.maxDecisions == null || counters.expanded < settings.maxDecisions) && beamPruned === 0 && counters.localPruned === 0
  };
}

export class SearchStrategyBase {
  constructor({ compound = false, actual_leap_year = true, ait_enabled = false, ait_rate = 0.10, ...settings } = {}, mode) {
    this.name = mode === "absolute" ? "Absolute R" : "Absolute R+";
    this.mode = mode;
    this.compound = compound;
    this.actual_leap_year = actual_leap_year;
    this.ait_enabled = ait_enabled;
    this.ait_rate = ait_rate;
    this.effective_ait_rate = ait_enabled ? ait_rate : 0;
    this.outflow_account_tiebreak = true;
    this.max_decisions = settings.max_decisions ?? settings.state_cap ?? null;
    this.time_limit_ms = settings.time_limit_ms ?? 0;
    this.clock = typeof settings.clock === "function" ? settings.clock : defaultMonotonicNow;
    this.max_local_branches = settings.max_local_branches === undefined ? 128 : settings.max_local_branches;
    this.beam_width = settings.beam_width === undefined ? 256 : settings.beam_width;
    if (this.max_decisions != null && (!Number.isInteger(this.max_decisions) || this.max_decisions < 1)) throw new RangeError("max_decisions must be at least 1.");
    if (!Number.isInteger(this.time_limit_ms) || this.time_limit_ms < 0) throw new RangeError("time_limit_ms must be a non-negative integer.");
    if (this.max_local_branches != null && (!Number.isInteger(this.max_local_branches) || this.max_local_branches < 1)) throw new RangeError("max_local_branches must be at least 1 or null.");
    if (!Number.isInteger(this.beam_width) || this.beam_width < 1) throw new RangeError("beam_width must be at least 1.");
  }

  createSession(engineContext) {
    const input = {
      options: engineContext.options, start: engineContext.start, end: engineContext.end, simulation: engineContext.simulation,
      inflow_schedule: engineContext.inflows, accounts: engineContext.accounts,
      inflow_account_id: engineContext.inflow_account_id,
      fee_config: engineContext.fee_config,
      consolidation_account_id: engineContext.consolidation_account_id,
      outflow_schedule: engineContext.outflows
    };
    const context = createContext(input, this);
    const greedyStrategy = new GreedyStrategy({
      compound: this.compound, actual_leap_year: this.actual_leap_year,
      ait_enabled: this.ait_enabled, ait_rate: this.ait_rate
    });
    const greedy = new SimulationEngine().runUnfinalized(greedyStrategy, input);
    const liabilities = sum(greedy.outstanding_outflows.map(item => Number(item.remaining || 0)));
    const greedyObjective = greedy.valid
      ? greedy.final_value - calculateFinalSweepFees(greedy.accounts, context.consolidationId, context.feeConfig) - liabilities
      : -Infinity;
    const goalMode = engineContext.simulation?.mode === "goal";
    const greedyGoal = goalMode ? new SimulationEngine().run(greedyStrategy, input) : null;
    const initialGoalScore = greedyGoal ? scoreGoalResult(greedyGoal, greedyObjective, "greedy-baseline") : null;
    let goalCandidatesEvaluated = greedyGoal ? 1 : 0;
    let goalInvalidCandidates = 0;
    const goalInvalidReasons = new Map();
    const goalInvalidExamples = [];
    const evaluatedGoalPaths = new Set();
    const evaluateGoal = goalMode ? (path, value) => {
      const pathKey = goalPathSignature(path);
      if (evaluatedGoalPaths.has(pathKey)) return { achieved: false, elapsed_days: Infinity, actual: -Infinity, fees: Infinity, operations: Infinity, terminal_value: -Infinity, signature: pathKey, duplicate: true };
      evaluatedGoalPaths.add(pathKey);
      goalCandidatesEvaluated++;
      const score = evaluateGoalPath(path, engineContext, value, this);
      if (score.invalid_candidate) {
        goalInvalidCandidates++;
        const reason = score.invalid_reason || "Unknown candidate replay failure";
        goalInvalidReasons.set(reason, (goalInvalidReasons.get(reason) ?? 0) + 1);
        if (goalInvalidExamples.length < 5) {
          goalInvalidExamples.push({
            reason, stack: score.invalid_stack.split("\n").slice(0, 6),
            actions: path.map(({ date, action }) => ({
              date, type: action.type, target_id: action.target_id ?? null,
              principal: action.principal ?? null,
              transfers: (action.transfers ?? []).map(item => ({
                source: item.src_id, target: item.tgt_id, amount: item.amount, fee: item.fee
              })),
              bookings: (action.bookings ?? []).map(item => ({
                account_id: item.account_id, option: item.option?.label, principal: item.principal
              }))
            }))
          });
        }
      }
      return score;
    } : null;
    const counters = {
      expanded: 0, leaves: 0, boundPruned: 0, memoPruned: 0, localPruned: 0,
      bestValue: goalMode ? -Infinity : greedyObjective,
      baselineValue: goalMode ? -Infinity : greedyObjective,
      bestOperationCount: goalMode ? Infinity : resultOperationCount(greedy),
      bestOutstanding: goalMode ? Infinity : sum((greedy.outstanding_outflows ?? []).map(item => Number(item.remaining || 0))),
      totalCapital: context.totalCapital,
      bestNode: null, alternatives: [], memo: new Map(), memoEvictions: 0
    };
    const initialGoalProvenance = goalMode ? new BalanceProvenance([...context.accounts.keys()]) : null;
    if (initialGoalProvenance) {
      for (const [id, account] of context.accounts) initialGoalProvenance.addPrincipal(id, account.balance);
    }
    const initial = {
      date: context.start,
      balances: makeBalanceState(Object.fromEntries([...context.accounts].map(([id, account]) => [id, account.balance]))),
      flows: [], goalFlows: [], goalProvenance: initialGoalProvenance,
      obligations: [], paid: 0
    };
    // Goal mode has a finite default budget so a 30-year safety horizon
    // cannot turn a browser search into an effectively unbounded run.
    const goalSearchBudget = goalMode ? (this.max_decisions ?? 5000) : this.max_decisions;
    const settings = {
      maxDecisions: goalSearchBudget, maxLocalBranches: this.max_local_branches,
      beamWidth: this.beam_width, ...(this.time_limit_ms > 0 ? { timeLimitMs: this.time_limit_ms } : {}), endDate: context.endDate
    };
    const searchStartedAt = this.clock();
    const budget = { deadlineAt: this.time_limit_ms > 0 ? searchStartedAt + this.time_limit_ms : null, now: this.clock };
    const search = this.mode === "absolute"
      ? runAbsolute(initial, context, settings, counters, evaluateGoal, initialGoalScore, budget)
      : runGaml(initial, context, settings, counters, evaluateGoal, initialGoalScore, budget);
    const diagnostics = {
      expanded_states: counters.expanded, leaves: counters.leaves,
      bound_pruned: counters.boundPruned, memo_pruned: counters.memoPruned,
      beam_pruned: search.beamPruned || 0, beam_duplicate_pruned: search.beamDuplicatePruned || 0, local_combination_pruned: counters.localPruned,
      root_strategy_peak: search.rootPeak || 0,
      budget_stopped: Boolean(search.budgetStopped),
      ...(search.budgetStopped ? { budget_stop_reason: search.budgetStopReason ?? "expanded_state_limit" } : {}),
      ...(this.time_limit_ms > 0 ? { time_budget_ms: this.time_limit_ms } : {}),
      budget_frontier_states: search.budgetFrontier?.length ?? 0,
      budget_frontier_checkpoints: search.budgetFrontierCheckpoints?.length ?? 0,
      state_memo_size: counters.memo.size,
      state_memo_evictions: counters.memoEvictions,
      expansion_cache_size: context.expansionCache.size,
      optimality_proven: search.optimalityProven,
      alternative_leaf_net_interests: counters.alternatives.sort((a, b) => b - a).slice(0, 10),
      settings,
      calculation_cache: {
        eligible_options: { ...context.cacheStats.eligibleOptions },
        option_interest: { ...context.cacheStats.optionInterest },
        upper_bound: { ...context.cacheStats.upperBound },
        priority: { ...context.cacheStats.priority },
        expansion: { ...context.cacheStats.expansion }
      },
      ...(goalMode ? { goal_candidates_evaluated: goalCandidatesEvaluated, goal_invalid_candidates: goalInvalidCandidates, goal_invalid_candidate_reasons: Object.fromEntries(goalInvalidReasons), goal_invalid_candidate_examples: goalInvalidExamples, goal_objective: "earliest consolidation net-interest achievement", goal_search_budget: goalSearchBudget, goal_pruned_after_achievement: search.goalPrunedByAchievement ?? 0, selected_goal_score: search.bestGoalScore ?? initialGoalScore } : {})
    };
    const resultMetadata = {
      total_decisions_evaluated: diagnostics.expanded_states,
      alternative_leaf_net_interests: diagnostics.alternative_leaf_net_interests,
      search_diagnostics: diagnostics,
      optimality_proven: diagnostics.optimality_proven,
      search_settings: settings
    };

    let selectedPath = null;
    let selectedContinuation = false;
    let selectedReplay = null;

    if (goalMode) {
      if (search.bestNode) selectedPath = nodePath(search.bestNode);
    } else {
      const candidates = [];
      if (search.bestNode) {
        candidates.push({ path: nodePath(search.bestNode), continuation: false, source: "search" });
      }
      const seen = new Set(candidates.map(candidate => goalPathSignature(candidate.path)));
      const checkpoints = search.budgetFrontierCheckpoints ?? [];
      for (let index = 0; index < checkpoints.length; index++) {
        for (const entry of checkpoints[index]) {
          const path = nodePath(entry.node);
          if (!path.length) continue;
          const key = goalPathSignature(path);
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ path, continuation: true, source: "budget_checkpoint_" + ((index + 1) * SEARCH_BUDGET_CHECKPOINT_INTERVAL) });
        }
      }
      if (search.budgetStopped) {
        const frontier = [...(search.budgetFrontier ?? [])]
          .sort((a, b) => b.priority - a.priority ||
            (a.node?.operation_count ?? 0) - (b.node?.operation_count ?? 0));
        for (const entry of frontier.slice(0, 4)) {
          const path = nodePath(entry.node);
          if (!path.length) continue;
          const key = goalPathSignature(path);
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ path, continuation: true, source: "budget_completion" });
        }
      }

      let replayedCandidates = 0;
      const rejectedReplays = [];
      for (const candidate of candidates) {
        let replay = null;
        try {
          const replayStrategy = createPathReplayStrategy(
            candidate.path, engineContext, this,
            { greedyContinuation: candidate.continuation }
          );
          replay = new SimulationEngine().runUnfinalized(replayStrategy, input);
        } catch (error) {
          replay = { valid: false, replay_error: String(error?.message ?? error) };
        }
        replayedCandidates++;
        const comparison = compareScopedResults(replay, greedy, context);
        if (comparison <= 0) {
          const rejectedObjective = scopedObjective(replay, context);
          rejectedReplays.push({
            valid: Boolean(replay?.valid),
            comparison,
            objective: Number.isFinite(rejectedObjective) ? rejectedObjective : null,
            operations: replay?.valid ? resultOperationCount(replay) : null,
            outstanding: replay?.valid
              ? sum((replay.outstanding_outflows ?? []).map(item => Number(item.remaining || 0))) : null,
            error: replay?.replay_error ?? replay?.error ?? replay?.invalid_reason ?? null
          });
          continue;
        }
        if (!selectedReplay || compareScopedResults(replay, selectedReplay, context) > 0) {
          selectedReplay = replay;
          selectedPath = candidate.path;
          selectedContinuation = candidate.continuation;
        }
      }

      const candidateObjective = selectedReplay ? scopedObjective(selectedReplay, context) : -Infinity;
      diagnostics.result_selection = {
        selected: selectedPath ? this.name : "Greedy",
        reason: !selectedPath ? "no_absolute_candidate_beats_greedy"
          : candidateObjective > greedyObjective + EPS ? "absolute_financially_better"
          : "equal_financially_strategically_better",
        completion_mode: !selectedPath ? "greedy_fallback" : selectedContinuation ? "absolute_prefix_then_greedy" : "complete_absolute_path",
        candidates_replayed: replayedCandidates,
        rejected_replays: rejectedReplays,
        candidate_objective: Number.isFinite(candidateObjective) ? candidateObjective : null,
        greedy_objective: Number.isFinite(greedyObjective) ? greedyObjective : null,
        candidate_operations: selectedReplay ? resultOperationCount(selectedReplay) : null,
        greedy_operations: resultOperationCount(greedy),
        candidate_outstanding: selectedReplay
          ? sum((selectedReplay.outstanding_outflows ?? []).map(item => Number(item.remaining || 0))) : null,
        greedy_outstanding: sum((greedy.outstanding_outflows ?? []).map(item => Number(item.remaining || 0)))
      };
    }

    if (!selectedPath) {
      if (!greedy.valid) throw new Error(this.name + " found no feasible path satisfying strict outflows.");
      const fallback = new GreedyStrategy({
        compound: this.compound, actual_leap_year: this.actual_leap_year,
        ait_enabled: this.ait_enabled, ait_rate: this.ait_rate
      }).createSession(engineContext);
      fallback.resultMetadata = { ...resultMetadata, strategy_name: "Greedy" };
      return fallback;
    }

    const selectedStrategy = createPathReplayStrategy(
      selectedPath, engineContext, this,
      { greedyContinuation: selectedContinuation }
    );
    const session = selectedStrategy.createSession(engineContext);
    session.resultMetadata = resultMetadata;
    return session;
  }


}
