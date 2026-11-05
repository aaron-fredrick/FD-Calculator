import { Account, TransferFeeConfig } from "../core/models.js";
import { normalizeInflowSchedule } from "../core/events.js";
import { formatISODate, parseISODate, daysBetween } from "../core/dates.js";
import { processOutflows, validateOutflowSchedule } from "../core/cashflows.js";
import { GreedyStrategy } from "./greedy.js";
import { SimulationEngine } from "../core/simulation.js";
import {
  createStrategyDecision, createStrategyWait, createStrategyComplete,
  StrategyDecisionType
} from "../core/strategy-contracts.js";
import { FDOptionManager } from "../fd-options/index.js";
import { pruneDominatedOptions, roundSearchMoney, makeBalanceState, setSearchBalance, addSearchBalance, mergePendingFlows, SEARCH_EPSILON } from "./search-primitives.js";

const EPS = SEARCH_EPSILON;
const round2 = roundSearchMoney;
const sum = values => values.reduce((total, value) => total + value, 0);
const mapOf = entries => new Map(entries);
const asObject = map => Object.fromEntries(map);
const balanceTotal = balances => sum(balances.map(([, value]) => value));
const dateSort = (a, b) => a.localeCompare(b);


function nextEventDate(today, flows, inflows, outflows, end) {
  const candidates = [end];
  for (const date of [...Object.keys(inflows), ...Object.keys(outflows)]) {
    if (date > today && date < end) candidates.push(date);
  }
  const flowDate = flows.find(([date]) => date > today)?.[0];
  if (flowDate && flowDate <= end) candidates.push(flowDate);
  return candidates.sort(dateSort)[0];
}

function stateKey(state) {
  return JSON.stringify([
    state.date, state.balances, state.flows, state.obligations, state.paid
  ]);
}

function makeNode(parent, action, date, rootSignature = null) {
  return { parent, action, date, root_signature: rootSignature ?? parent?.root_signature ?? null };
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

export function createPathReplayStrategy(path, engineContext, runtimeSettings = {}) {
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
        carries: action.carries, carry_label: "Holding liquidity"
      }
    });
    if (action.type === "carry") return createStrategyDecision({
      revision: view.revision, date: view.date, action: StrategyDecisionType.CARRY,
      plan: { carries: action.carries, carry_label: "Holding liquidity", carry_snapshot: "decision_start" }
    });
    throw new RangeError("Unknown search path action: " + action.type);
  };
  return {
    name: "Absolute+ goal candidate replay",
    compound: runtimeSettings.compound,
    actual_leap_year: runtimeSettings.actual_leap_year,
    ait_enabled: runtimeSettings.ait_enabled,
    ait_rate: runtimeSettings.ait_rate,
    outflow_account_tiebreak: runtimeSettings.outflow_account_tiebreak,
    outflow_due_date_sort: runtimeSettings.outflow_due_date_sort,
    round_balances: runtimeSettings.round_balances,
    opening_trigger_always: runtimeSettings.opening_trigger_always,
    createSession() {
      return {
        nextSignal(view) {
          const action = actions.get(view.date);
          if (action) { actions.delete(view.date); return signalFor(action, view); }
          const overdue = [...actions.keys()].filter(date => date < view.date).sort();
          if (overdue.length) throw new Error("Goal candidate decision date " + overdue[0] + " was skipped.");
          const next = [...actions.keys()].sort()[0];
          if (next && view.date < next) return createStrategyWait({ revision: view.revision, until: next });
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

export function evaluateGoalPath(path, engineContext, terminalValue, runtimeSettings) {
  const signature = JSON.stringify(path.map(item => [item.date, item.action.type, item.action.target_id ?? ""]));
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
      signature, invalid_candidate: true, invalid_reason: String(error?.message ?? error)
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
  const slots = accountIds.map(id => [null, ...context.fdOptionManager.getEligibleOptions({
    account: context.accounts.get(id), amount: balances.get(id), investmentDate: today, simulationEndDate: settings.endDate
  })]);
  if (!slots.length || slots.every(slot => slot.length === 1)) return { branches: [], pruned: 0 };
  const efdFor = choices => choices.reduce((count, [id, option]) => {
    if (!option?.is_efd) return count;
    return count + ((optionsByAccount.get(id) || []).some(candidate =>
      !candidate.is_efd && candidate.economic_terms_key === option.economic_terms_key
    ) ? 1 : 0);
  }, 0);
  const profitFor = choices => sum(choices.filter(([, option]) => option).map(([id, option]) =>
    option.totalInterestOn(balances.get(id), today, settings.compound, settings.actualLeapYear) *
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
    let partials = [{ score: 0, choices: [] }];
    for (let index = 0; index < accountIds.length; index++) {
      const id = accountIds[index], expanded = [];
      const accountOptions = slots[index].slice(1);
      const standardTerms = new Set(accountOptions.filter(option => !option.is_efd).map(option => option.economic_terms_key));
      const choices = accountOptions.sort((a, b) => {
        const profit = b.totalInterestOn(balances.get(id), today, settings.compound, settings.actualLeapYear) -
          a.totalInterestOn(balances.get(id), today, settings.compound, settings.actualLeapYear);
        if (Math.abs(profit) > 1e-9) return profit;
        return Number(b.is_efd && standardTerms.has(b.economic_terms_key)) -
          Number(a.is_efd && standardTerms.has(a.economic_terms_key));
      });
      for (const partial of partials) {
        expanded.push({ score: partial.score, choices: [...partial.choices, [id, null]] });
        for (const option of choices) {
          expanded.push({
            score: partial.score + option.totalInterestOn(balances.get(id), today, settings.compound, settings.actualLeapYear) * (1 - settings.aitRate),
            choices: [...partial.choices, [id, option]]
          });
        }
      }
      expanded.sort((a, b) => b.score - a.score || efdFor(b.choices) - efdFor(a.choices));
      if (expanded.length > settings.maxLocalBranches) pruned += expanded.length - settings.maxLocalBranches;
      partials = expanded.slice(0, settings.maxLocalBranches);
    }
    for (const partial of partials) {
      if (partial.choices.some(([, option]) => option)) branches.push({
        score: partial.score, efd: efdFor(partial.choices), choices: partial.choices
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
    for (const option of context.fdOptionManager.getEligibleOptions({ account: target, amount: deployable, investmentDate: today, simulationEndDate: settings.endDate })) {
      const score = option.totalInterestOn(deployable, today, settings.compound, settings.actualLeapYear) *
        (1 - settings.aitRate) - fees;
      if (score <= 0) continue;
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
  let balances = state.balances;
  const todayInflows = inflows[state.date] || {};
  for (const [accountId, amount] of Object.entries(todayInflows)) {
    if (!context.accounts.has(accountId)) throw new RangeError("Inflow destination account " + accountId + " is not configured.");
    balances = addSearchBalance(balances, accountId, amount);
  }

  const pending = [];
  for (const [date, entries] of state.flows) {
    if (date < state.date) continue;
    if (date === state.date) {
      for (const [accountId, amount] of entries) balances = addSearchBalance(balances, accountId, amount);
    } else pending.push([date, entries]);
  }

  const processed = processOutflows(state.date, balances, state.obligations, outflows[state.date] || []);
  if (!processed.valid) return null;
  return {
    ...state,
    balances: processed.balances,
    flows: pending,
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
  const rate = context.maxRate;
  const grow = (amount, fromDate) => {
    const years = Math.max(0, daysBetween(fromDate, context.endDate)) / 365;
    return amount * (exponential ? Math.exp(rate * years) : 1 + rate * years);
  };
  let total = sum(state.balances.map(([, amount]) => grow(amount, state.date)));
  for (const [date, entries] of state.flows) {
    if (date <= context.end) total += grow(sum(entries.map(([, amount]) => amount)), date);
  }
  for (const [date, amounts] of Object.entries(context.inflows)) {
    if (date > state.date && date <= context.end) total += grow(sum(Object.values(amounts)), date);
  }
  return total + state.paid - sum(state.obligations.map(item => Number(item[2])));
}

function makePriority(state, context) {
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
  for (const [date, amounts] of Object.entries(context.inflows)) {
    if (date > state.date && date <= context.end) {
      for (const [id, amount] of Object.entries(amounts)) add(id, date, amount);
    }
  }
  for (const [key, amount] of buckets) {
    const [accountId, date] = key.split("|");
    const account = context.accounts.get(accountId);
    const options = context.fdOptionManager.getEligibleOptions({ account, amount, investmentDate: date, simulationEndDate: context.endDate });
    const rate = options.reduce((best, option) => Math.max(best, option.annual_rate / 100), 0);
    estimate += amount * Math.exp(rate * Math.max(0, daysBetween(parseISODate(date), context.endDate)) / 365);
  }
  return estimate + 0.05 * Math.max(0, upper - estimate);
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
  const effectiveOptions = pruneDominatedOptions(options);
  const fdOptionManager = new FDOptionManager(effectiveOptions);
  const optionsByAccount = new Map();
  for (const [id, account] of accountMap) {
    optionsByAccount.set(id, fdOptionManager.getAccountOptions(account));
  }
  if ([...optionsByAccount.values()].some(list => list.length === 0)) throw new RangeError("Every account must have at least one compatible FD product.");
  const fittingRates = effectiveOptions.filter(option => option.fitsBefore(startDate, endDate)).map(option => option.annual_rate);
  const maxRate = fittingRates.length ? Math.max(0, ...fittingRates) / 100 : 0.11;
  const totalCapital = sum(accounts.map(account => account.balance)) + sum(Object.values(inflows).flatMap(day => Object.values(day)));
  return {
    accounts: accountMap, options: effectiveOptions, optionsByAccount, fdOptionManager, inflows, outflows,
    startDate, endDate, start: formatISODate(startDate), end: formatISODate(endDate), simulation: simulation ?? { mode: "scoped" },
    inflowAccountId: inflow_account_id, consolidationId: consolidation_account_id, feeConfig: fee_config,
    compound: strategy.compound, actualLeapYear: strategy.actual_leap_year, aitRate: strategy.effective_ait_rate,
    maxRate, totalCapital
  };
}

function expandState(rawState, context, settings, mode, counters) {
  const state = advanceState(rawState, context);
  if (!state) return { terminal: false, children: [] };
  if (state.date >= context.end) {
    counters.leaves++;
    const value = terminalValue(state, context);
    return { terminal: true, value, state, children: [] };
  }
  const goalMode = context.simulation?.mode === "goal";
  const bound = makeUpperBound(state, context, mode === "gaml");
  if (!goalMode && bound <= counters.bestValue + EPS) {
    counters.boundPruned++;
    return { terminal: false, children: [] };
  }
  const key = stateKey(state);
  const prior = counters.memo.get(key);
  if (!goalMode && prior !== undefined && prior >= bound - EPS) {
    counters.memoPruned++;
    return { terminal: false, children: [] };
  }
  if (!goalMode) counters.memo.set(key, bound);

  const nextDate = nextEventDate(state.date, state.flows, context.inflows, context.outflows, context.end);
  const activeIds = state.balances.filter(([, amount]) => amount > EPS).map(([id]) => id);
  if (!activeIds.length) return {
    terminal: false,
    children: [{ state: { ...state, date: nextDate }, action: null, root_signature: null, priority: null }]
  };

  const balances = new Map(state.balances);
  const children = [];
  const pushAction = (date, nextBalances, nextFlows, action, rootSignature = null) => {
    children.push({
      state: { date, balances: nextBalances, flows: nextFlows, obligations: state.obligations, paid: state.paid },
      date: state.date, action, root_signature: rootSignature
    });
  };

  let waitFirst = false;
  if (mode === "gaml") {
    const futureInflows = Object.keys(context.inflows).filter(date => date > state.date).sort();
    const nextInflow = futureInflows[0];
    if (nextInflow && daysBetween(parseISODate(state.date), parseISODate(nextInflow)) <= 30) {
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
          for (const option of context.fdOptionManager.getEligibleOptions({ account: target, amount: deployable, investmentDate: state.date, simulationEndDate: context.endDate })) {
            best = Math.max(best, option.annual_rate);
          }
        }
        return best;
      };
      let aligned = false;
      for (const id of activeIds) {
        const account = context.accounts.get(id);
        for (const option of context.fdOptionManager.getEligibleOptions({ account, amount: balances.get(id), investmentDate: state.date, simulationEndDate: context.endDate })) {
          const maturity = formatISODate(new Date(parseISODate(state.date).getTime() + option.days * 86_400_000));
          const alignedDate = futureInflows.find(date => date >= maturity);
          if (alignedDate && daysBetween(parseISODate(maturity), parseISODate(alignedDate)) <= 7) aligned = true;
        }
      }
      waitFirst = !aligned || bestRate(projected) > bestRate(balances) + EPS;
      waitFirst = waitFirst && daysBetween(parseISODate(state.date), parseISODate(nextInflow)) > 0;
    }
  }
  if (waitFirst && (mode !== "gaml" || settings.maxDecisions == null || counters.expanded < settings.maxDecisions)) {
    const action = { type: "carry", carries: activeIds };
    pushAction(nextDate, state.balances, state.flows, action, ["carry"]);
  }

  const consolidation = buildConsolidationBranches(state.balances, context.accounts, context, context.feeConfig, parseISODate(state.date), {
    ...settings, endDate: context.endDate, compound: context.compound, actualLeapYear: context.actualLeapYear, aitRate: context.aitRate
  });
  for (const branch of consolidation) {
    if (mode === "gaml" && settings.maxDecisions != null && counters.expanded >= settings.maxDecisions) break;
    let nextBalances = state.balances;
    for (const transfer of branch.transfers) nextBalances = setSearchBalance(nextBalances, transfer.src_id, 0);
    nextBalances = setSearchBalance(nextBalances, branch.target_id, 0);
    const flows = branch.option.generateCashFlowsAfterAIT(branch.principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear)
      .map(flow => [formatISODate(flow.date), branch.target_id, flow.amount]);
    const action = {
      type: "consolidate", target_id: branch.target_id, option: branch.option,
      transfers: branch.transfers, principal: branch.principal, carries: branch.carries
    };
    const root = ["consolidate", branch.target_id, branch.option.label, branch.option.payout_type, branch.option.payout_period_str];
    const merged = mergePendingFlows(state.flows, flows);
    pushAction(nextEventDate(state.date, merged, context.inflows, context.outflows, context.end), nextBalances, merged, action, root);
  }

  const local = allLocalCombinations(activeIds, context, balances, parseISODate(state.date), {
    endDate: context.endDate, compound: context.compound, actualLeapYear: context.actualLeapYear,
    aitRate: context.aitRate, maxLocalBranches: mode === "gaml" ? settings.maxLocalBranches : null
  });
  counters.localPruned += local.pruned;
  for (const branch of local.branches) {
    if (mode === "gaml" && settings.maxDecisions != null && counters.expanded >= settings.maxDecisions) break;
    const bookings = branch.choices.filter(([, option]) => option).map(([account_id, option]) => ({
      account_id, option, principal: balances.get(account_id)
    }));
    const bookedIds = new Set(bookings.map(item => item.account_id));
    const carries = activeIds.filter(id => !bookedIds.has(id));
    let nextBalances = state.balances;
    const additions = [];
    for (const booking of bookings) {
      nextBalances = setSearchBalance(nextBalances, booking.account_id, 0);
      for (const flow of booking.option.generateCashFlowsAfterAIT(booking.principal, parseISODate(state.date), context.aitRate, context.compound, context.actualLeapYear)) {
        additions.push([formatISODate(flow.date), booking.account_id, flow.amount]);
      }
    }
    const merged = mergePendingFlows(state.flows, additions);
    const action = { type: "local", bookings, carries };
    const root = ["local", bookings.map(item => [
      item.account_id, item.option.label, item.option.payout_type, item.option.payout_period_str
    ]).sort((a, b) => a[0].localeCompare(b[0]))];
    pushAction(nextEventDate(state.date, merged, context.inflows, context.outflows, context.end), nextBalances, merged, action, root);
  }

  if ((!waitFirst || mode !== "gaml") &&
      (mode !== "gaml" || settings.maxDecisions == null || counters.expanded < settings.maxDecisions)) {
    const action = { type: "carry", carries: activeIds };
    pushAction(nextDate, state.balances, state.flows, action, ["carry"]);
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

function runAbsolute(initial, context, settings, counters, evaluateGoal = null, initialGoalScore = null) {
  let bestNode = null, bestGoalScore = initialGoalScore, goalPrunedByAchievement = 0;
  function visit(rawState, parentNode = null) {
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
    const expanded = expandState(rawState, context, settings, "absolute", counters);
    if (expanded.terminal) {
      if (evaluateGoal) {
        const score = evaluateGoal(path ?? nodePath(parentNode), expanded.value);
        if (compareGoalScores(score, bestGoalScore) > 0) { bestGoalScore = score; bestNode = parentNode; }
        return;
      }
      if (expanded.value > counters.bestValue + EPS) {
        counters.bestValue = expanded.value;
        bestNode = parentNode;
      } else counters.alternatives.push(expanded.value - context.totalCapital);
      return;
    }
    for (const child of expanded.children) {
      const node = child.action ? makeNode(parentNode, child.action, child.date, parentNode?.root_signature ? null : child.root_signature) : parentNode;
      visit(child.state, node);
    }
  }
  visit(initial);
  return { bestNode, bestGoalScore, goalPrunedByAchievement, optimalityProven: true };
}

function runGaml(initial, context, settings, counters, evaluateGoal = null, initialGoalScore = null) {
  let bestNode = null, bestGoalScore = initialGoalScore, sequence = 0;
  let goalPrunedByAchievement = 0;
  let beam = [{ state: initial, node: null, priority: makeUpperBound(initial, context, true), sequence: sequence++ }];
  let budgetStopped = false, beamPruned = 0, rootPeak = 0;
  while (beam.length) {
    const candidates = [], rootBest = new Map();
    let generated = 0;
    for (const entry of beam) {
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
        budgetStopped = true; break;
      }
      counters.expanded++;
      const expanded = expandState(entry.state, context, settings, "gaml", counters);
      if (expanded.terminal) {
        if (evaluateGoal) {
          const score = evaluateGoal(path ?? nodePath(entry.node), expanded.value);
          if (compareGoalScores(score, bestGoalScore) > 0) { bestGoalScore = score; bestNode = entry.node; }
          continue;
        }
        if (expanded.value > counters.bestValue + EPS) {
          counters.bestValue = expanded.value;
          bestNode = entry.node;
        } else {
          counters.alternatives.push(expanded.value - context.totalCapital);
          counters.alternatives.sort((a, b) => b - a);
          counters.alternatives.length = Math.min(10, counters.alternatives.length);
        }
        continue;
      }
      for (const child of expanded.children) {
        generated++;
        sequence++;
        const node = child.action ? makeNode(entry.node, child.action, child.date, entry.node?.root_signature ? null : child.root_signature) : entry.node;
        const priority = makePriority(child.state, context);
        const candidate = { state: child.state, node, priority, sequence };
        const signature = node?.root_signature || ["unclassified"];
        const rootKey = JSON.stringify(signature);
        const prior = rootBest.get(rootKey);
        if (!prior || candidate.priority > prior.priority) rootBest.set(rootKey, candidate);
        candidates.push(candidate);
      }
    }
    if (budgetStopped) break;
    const bestByState = new Map();
    for (const candidate of candidates) {
      const key = stateKey(candidate.state);
      const previous = bestByState.get(key);
      if (!previous || candidate.priority > previous.priority) bestByState.set(key, candidate);
    }
    const unique = [...bestByState.values()].sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
    const diversity = [...rootBest.values()].sort((a, b) => b.priority - a.priority).slice(0, Math.max(1, Math.floor(settings.beamWidth / 3)));
    rootPeak = Math.max(rootPeak, diversity.length);
    const selected = [], seen = new Set();
    for (const candidate of diversity) {
      const key = stateKey(candidate.state);
      if (!seen.has(key)) { selected.push(candidate); seen.add(key); }
    }
    for (const candidate of unique) {
      if (selected.length >= settings.beamWidth) break;
      const key = stateKey(candidate.state);
      if (!seen.has(key)) { selected.push(candidate); seen.add(key); }
    }
    beamPruned += Math.max(0, generated - selected.length);
    beam = selected;
  }
  return {
    bestNode, bestGoalScore, beamPruned, rootPeak, budgetStopped, goalPrunedByAchievement,
    optimalityProven: !budgetStopped && (settings.maxDecisions == null || counters.expanded < settings.maxDecisions) && beamPruned === 0 && counters.localPruned === 0
  };
}

export class SearchStrategyBase {
  constructor({ compound = false, actual_leap_year = true, ait_enabled = false, ait_rate = 0.10, ...settings } = {}, mode) {
    this.name = mode === "absolute" ? "Absolute" : "Absolute+";
    this.mode = mode;
    this.compound = compound;
    this.actual_leap_year = actual_leap_year;
    this.ait_enabled = ait_enabled;
    this.ait_rate = ait_rate;
    this.effective_ait_rate = ait_enabled ? ait_rate : 0;
    this.outflow_account_tiebreak = true;
    this.max_decisions = settings.max_decisions ?? settings.state_cap ?? null;
    this.max_local_branches = settings.max_local_branches === undefined ? 128 : settings.max_local_branches;
    this.beam_width = settings.beam_width === undefined ? 256 : settings.beam_width;
    if (this.max_decisions != null && (!Number.isInteger(this.max_decisions) || this.max_decisions < 1)) throw new RangeError("max_decisions must be at least 1.");
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
    const evaluatedGoalPaths = new Set();
    const evaluateGoal = goalMode ? (path, value) => {
      const pathKey = JSON.stringify(path.map(item => [item.date, item.action.type, item.action.target_id ?? ""]));
      if (evaluatedGoalPaths.has(pathKey)) return { achieved: false, elapsed_days: Infinity, actual: -Infinity, fees: Infinity, operations: Infinity, terminal_value: -Infinity, signature: pathKey, duplicate: true };
      evaluatedGoalPaths.add(pathKey);
      goalCandidatesEvaluated++;
      const score = evaluateGoalPath(path, engineContext, value, this);
      if (score.invalid_candidate) {
        goalInvalidCandidates++;
        const reason = score.invalid_reason || "Unknown candidate replay failure";
        goalInvalidReasons.set(reason, (goalInvalidReasons.get(reason) ?? 0) + 1);
      }
      return score;
    } : null;
    const counters = {
      expanded: 0, leaves: 0, boundPruned: 0, memoPruned: 0, localPruned: 0,
      bestValue: goalMode ? -Infinity : greedyObjective, alternatives: [], memo: new Map()
    };
    const initial = {
      date: context.start,
      balances: makeBalanceState(Object.fromEntries([...context.accounts].map(([id, account]) => [id, account.balance]))),
      flows: [], obligations: [], paid: 0
    };
    // Goal mode has a finite default budget so a 30-year safety horizon
    // cannot turn a browser search into an effectively unbounded run.
    const goalSearchBudget = goalMode ? (this.max_decisions ?? 5000) : this.max_decisions;
    const settings = {
      maxDecisions: goalSearchBudget, maxLocalBranches: this.max_local_branches,
      beamWidth: this.beam_width, endDate: context.endDate
    };
    const search = this.mode === "absolute"
      ? runAbsolute(initial, context, settings, counters, evaluateGoal, initialGoalScore)
      : runGaml(initial, context, settings, counters, evaluateGoal, initialGoalScore);
    const diagnostics = {
      expanded_states: counters.expanded, leaves: counters.leaves,
      bound_pruned: counters.boundPruned, memo_pruned: counters.memoPruned,
      beam_pruned: search.beamPruned || 0, local_combination_pruned: counters.localPruned,
      root_strategy_peak: search.rootPeak || 0,
      optimality_proven: search.optimalityProven,
      alternative_leaf_net_interests: counters.alternatives.sort((a, b) => b - a).slice(0, 10),
      settings,
      ...(goalMode ? { goal_candidates_evaluated: goalCandidatesEvaluated, goal_invalid_candidates: goalInvalidCandidates, goal_invalid_candidate_reasons: Object.fromEntries(goalInvalidReasons), goal_objective: "earliest consolidation net-interest achievement", goal_search_budget: goalSearchBudget, goal_pruned_after_achievement: search.goalPrunedByAchievement ?? 0, selected_goal_score: search.bestGoalScore ?? initialGoalScore } : {})
    };
    const resultMetadata = {
      total_decisions_evaluated: diagnostics.expanded_states,
      alternative_leaf_net_interests: diagnostics.alternative_leaf_net_interests,
      search_diagnostics: diagnostics,
      optimality_proven: diagnostics.optimality_proven,
      search_settings: settings
    };

    if (!search.bestNode) {
      if (!greedy.valid) throw new Error(this.name + " found no feasible path satisfying strict outflows.");
      const fallback = new GreedyStrategy({
        compound: this.compound, actual_leap_year: this.actual_leap_year,
        ait_enabled: this.ait_enabled, ait_rate: this.ait_rate
      }).createSession(engineContext);
      fallback.resultMetadata = resultMetadata;
      return fallback;
    }

    const path = nodePath(search.bestNode);
    const actions = new Map(path.map(item => [item.date, item.action]));
    const optionIndex = option => {
      const exact = engineContext.options.indexOf(option);
      if (exact >= 0) return exact;
      const compatible = engineContext.options.findIndex(candidate =>
        candidate.label === option.label &&
        candidate.economic_terms_key === option.economic_terms_key &&
        candidate.is_efd === option.is_efd
      );
      if (compatible < 0) throw new RangeError("Search path references an FD option outside the simulation context.");
      return compatible;
    };
    const signalFor = (action, view) => {
      if (action.type === "consolidate") {
        return createStrategyDecision({
          revision: view.revision, date: view.date,
          action: StrategyDecisionType.CONSOLIDATE,
          plan: {
            target_account_id: action.target_id,
            option_index: optionIndex(action.option),
            principal: action.principal,
            transfers: action.transfers.map(item => ({
              source_account_id: item.src_id, target_account_id: item.tgt_id,
              amount: item.amount, fee: item.fee
            })),
            carries: action.carries,
            carry_label: "Holding liquidity",
            carry_snapshot: "decision_start"
          }
        });
      }
      if (action.type === "local") {
        return createStrategyDecision({
          revision: view.revision, date: view.date,
          action: StrategyDecisionType.SPLIT,
          plan: {
            bookings: action.bookings.map(item => ({
              account_id: item.account_id,
              option_index: optionIndex(item.option),
              principal: item.principal
            })),
            carries: action.carries,
            carry_label: "Holding liquidity"
          }
        });
      }
      if (action.type === "carry") {
        return createStrategyDecision({
          revision: view.revision, date: view.date,
          action: StrategyDecisionType.CARRY,
          plan: {
            carries: action.carries,
            carry_label: "Holding liquidity",
            carry_snapshot: "decision_start"
          }
        });
      }
      throw new RangeError("Unknown search path action: " + action.type);
    };

    return {
      resultMetadata,
      nextSignal(view) {
        const action = actions.get(view.date);
        if (action) {
          actions.delete(view.date);
          return signalFor(action, view);
        }
        const overdue = [...actions.keys()].filter(date => date < view.date).sort();
        if (overdue.length) throw new Error("Search decision date " + overdue[0] + " was skipped by actual simulation progression.");
        const nextActionDate = [...actions.keys()].sort()[0];
        const until = nextActionDate ?? engineContext.end_iso;
        if (view.date < until) {
          return createStrategyWait({ revision: view.revision, until });
        }
        return createStrategyComplete({ revision: view.revision });
      }
    };
  }


}
