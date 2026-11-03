import { Account, FDOption, TransferFeeConfig } from "../models.js";
import { Event, EventType, normalizeInflowSchedule } from "../events.js";
import { Booking, SimResult } from "../results.js";
import { formatISODate, parseISODate, addPeriod, daysBetween } from "../dates.js";
import { processOutflows, validateOutflowSchedule } from "../cashflows.js";
import { GreedyStrategy } from "./greedy.js";
import { pruneDominatedOptions, roundSearchMoney, makeBalanceState, setSearchBalance, addSearchBalance, mergePendingFlows, SEARCH_EPSILON } from "./search-primitives.js";

const EPS = SEARCH_EPSILON;
const round2 = roundSearchMoney;
const sum = values => values.reduce((total, value) => total + value, 0);
const mapOf = entries => new Map(entries);
const asObject = map => Object.fromEntries(map);
const balanceTotal = balances => sum(balances.map(([, value]) => value));
const dateSort = (a, b) => a.localeCompare(b);
const optionBankMatch = (option, account) => !option.bank_identity || option.bank_identity === account.bank_identity;

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

function allLocalCombinations(accountIds, optionsByAccount, balances, today, settings) {
  const slots = accountIds.map(id => [null, ...(optionsByAccount.get(id) || []).filter(option =>
    option.canInvest(balances.get(id), today, settings.endDate)
  )]);
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
      const choices = slots[index].slice(1).sort((a, b) =>
        b.totalInterestOn(balances.get(id), today, settings.compound, settings.actualLeapYear) -
        a.totalInterestOn(balances.get(id), today, settings.compound, settings.actualLeapYear)
      );
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

function buildConsolidationBranches(balances, accounts, optionsByAccount, feeConfig, today, settings) {
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
    for (const option of optionsByAccount.get(targetId) || []) {
      if (!option.canInvest(deployable, today, settings.endDate)) continue;
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
    const options = context.optionsByAccount.get(accountId) || [];
    const rate = options.filter(option => option.fitsBefore(parseISODate(date), context.endDate) && option.min_amount <= amount)
      .reduce((best, option) => Math.max(best, option.annual_rate / 100), 0);
    estimate += amount * Math.exp(rate * Math.max(0, daysBetween(parseISODate(date), context.endDate)) / 365);
  }
  return estimate + 0.05 * Math.max(0, upper - estimate);
}

function createContext({ options, start, end, inflow_schedule, accounts, inflow_account_id, fee_config, consolidation_account_id, outflow_schedule }, strategy) {
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
  const optionsByAccount = new Map();
  for (const [id, account] of accountMap) {
    optionsByAccount.set(id, effectiveOptions.filter(option => optionBankMatch(option, account) && account.canUseOption(option)));
  }
  if ([...optionsByAccount.values()].some(list => list.length === 0)) throw new RangeError("Every account must have at least one compatible FD product.");
  const maxRate = Math.max(0, ...effectiveOptions.filter(option => option.fitsBefore(startDate, endDate)).map(option => option.annual_rate)) / 100;
  const totalCapital = sum(accounts.map(account => account.balance)) + sum(Object.values(inflows).flatMap(day => Object.values(day)));
  return {
    accounts: accountMap, options: effectiveOptions, optionsByAccount, inflows, outflows,
    startDate, endDate, start: formatISODate(startDate), end: formatISODate(endDate),
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
  const bound = makeUpperBound(state, context, mode === "gaml");
  if (bound <= counters.bestValue + EPS) {
    counters.boundPruned++;
    return { terminal: false, children: [] };
  }
  const key = stateKey(state);
  const prior = counters.memo.get(key);
  if (prior !== undefined && prior >= bound - EPS) {
    counters.memoPruned++;
    return { terminal: false, children: [] };
  }
  counters.memo.set(key, bound);

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
          for (const option of context.optionsByAccount.get(targetId) || []) {
            if (option.canInvest(deployable, parseISODate(state.date), context.endDate)) best = Math.max(best, option.annual_rate);
          }
        }
        return best;
      };
      let aligned = false;
      for (const id of activeIds) {
        const account = context.accounts.get(id);
        for (const option of context.optionsByAccount.get(id) || []) {
          if (!option.canInvest(balances.get(id), parseISODate(state.date), context.endDate)) continue;
          const maturity = formatISODate(addPeriod(parseISODate(state.date), option.period_str));
          const alignedDate = futureInflows.find(date => date >= maturity);
          if (alignedDate && daysBetween(parseISODate(maturity), parseISODate(alignedDate)) <= 7) aligned = true;
        }
      }
      waitFirst = !aligned || bestRate(projected) > bestRate(balances) + EPS;
      waitFirst = waitFirst && daysBetween(parseISODate(state.date), parseISODate(nextInflow)) > 0;
    }
  }
  if (waitFirst) {
    const action = { type: "carry", carries: activeIds };
    pushAction(nextDate, state.balances, state.flows, action, ["carry"]);
  }

  const consolidation = buildConsolidationBranches(state.balances, context.accounts, context.optionsByAccount, context.feeConfig, parseISODate(state.date), {
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

  const local = allLocalCombinations(activeIds, context.optionsByAccount, balances, parseISODate(state.date), {
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

  if (!waitFirst || mode !== "gaml") {
    const action = { type: "carry", carries: activeIds };
    pushAction(nextDate, state.balances, state.flows, action, ["carry"]);
  }
  return { terminal: false, children };
}

function runAbsolute(initial, context, settings, counters) {
  let bestNode = null;
  function visit(rawState, parentNode = null) {
    counters.expanded++;
    const expanded = expandState(rawState, context, settings, "absolute", counters);
    if (expanded.terminal) {
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
  return { bestNode, optimalityProven: true };
}

function runGaml(initial, context, settings, counters) {
  let bestNode = null, sequence = 0;
  let beam = [{ state: initial, node: null, priority: makeUpperBound(initial, context, true), sequence: sequence++ }];
  let budgetStopped = false, beamPruned = 0, rootPeak = 0;
  while (beam.length) {
    const candidates = [], rootBest = new Map();
    let generated = 0;
    for (const entry of beam) {
      if (settings.maxDecisions != null && counters.expanded >= settings.maxDecisions) {
        budgetStopped = true; break;
      }
      counters.expanded++;
      const expanded = expandState(entry.state, context, settings, "gaml", counters);
      if (expanded.terminal) {
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
    bestNode, beamPruned, rootPeak, budgetStopped,
    optimalityProven: !budgetStopped && beamPruned === 0 && counters.localPruned === 0
  };
}

function replay(path, context, strategy, diagnostics) {
  const accounts = new Map([...context.accounts].map(([id, account]) => [id, new Account({
    id, bank_key: account.bank_key, bank_id: account.bank_id, label: account.label,
    balance: account.balance, supports_efd: account.supports_efd
  })]));
  const timeline = {};
  const bookings = [];
  let bookingNumber = 0, totalFees = 0, totalOutflowsPaid = 0;
  let pending = [], strictFailed = false;
  const addEvent = event => { (timeline[event.date_key] ||= []).push(event); };
  const totalBalance = () => sum([...accounts.values()].map(account => account.balance));

  let inflowNumber = 0;
  for (const [date, amounts] of Object.entries(context.inflows).sort(([a], [b]) => a.localeCompare(b))) {
    if (date > context.end) continue;
    for (const [accountId, amount] of Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b))) {
      const account = accounts.get(accountId);
      inflowNumber++;
      addEvent(new Event({ event_type: EventType.INFLOW, on_date: date, amount,
        label: "Inflow " + String(inflowNumber).padStart(2, "0"), account_id: accountId,
        bank_key: account.bank_key, bank_id: account.bank_id }));
    }
  }
  for (const [date, entries] of Object.entries(context.outflows).sort(([a], [b]) => a.localeCompare(b))) {
    for (const entry of entries) {
      const account = accounts.get(String(entry.account_id));
      addEvent(new Event({ event_type: EventType.OUTFLOW, on_date: date, amount: Number(entry.amount),
        label: String(entry.name || "Outflow"), account_id: account.id, payment_policy: entry.payment_policy || "strict",
        bank_key: account.bank_key, bank_id: account.bank_id }));
    }
  }
  const startKey = Number(context.start.replaceAll("-", ""));
  if (!timeline[startKey] && [...accounts.values()].some(account => account.balance > EPS)) {
    const account = accounts.get(context.inflowAccountId);
    addEvent(new Event({ event_type: EventType.INFLOW, on_date: context.start, amount: 0,
      label: "Opening balance trigger", account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id }));
  }

  const actions = new Map(path.map(item => [item.date, item.action]));
  const processed = new Set();
  while (true) {
    const keys = Object.keys(timeline).map(Number).filter(key => !processed.has(key)).sort((a, b) => a - b);
    if (!keys.length) break;
    const key = keys[0]; processed.add(key);
    const date = String(key).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const dayEvents = timeline[key];
    for (const event of dayEvents) {
      if ([EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY].includes(event.event_type)) {
        const account = accounts.get(event.account_id) || accounts.get(context.inflowAccountId);
        account.balance += event.amount;
        event.account_id = account.id; event.bank_key = account.bank_key; event.bank_id = account.bank_id;
        event.balance_after = account.balance; event.total_balance_after = totalBalance();
      }
    }
    for (const event of dayEvents.filter(item => item.event_type === EventType.OUTFLOW)) {
      pending.push({ name: event.label, account_id: event.account_id, remaining: event.amount,
        payment_policy: event.payment_policy || "strict", due_date: parseISODate(date) });
    }
    const policyOrder = { strict: 0, defer: 1, best_effort: 2 };
    const stillPending = [];
    pending.sort((a, b) => (policyOrder[a.payment_policy] ?? 3) - (policyOrder[b.payment_policy] ?? 3) ||
      a.due_date - b.due_date || a.account_id.localeCompare(b.account_id));
    for (const obligation of pending) {
      const account = accounts.get(obligation.account_id), required = Number(obligation.remaining);
      let paid = 0;
      if (obligation.payment_policy === "strict") {
        if (account.balance + EPS < required) { strictFailed = true; stillPending.push(obligation); continue; }
        paid = required;
      } else if (obligation.payment_policy === "defer") {
        if (account.balance + EPS < required) { stillPending.push(obligation); continue; }
        paid = required;
      } else {
        paid = Math.min(account.balance, required);
      }
      if (paid > EPS) {
        account.balance = round2(account.balance - paid);
        totalOutflowsPaid += paid;
        addEvent(new Event({ event_type: EventType.OUTFLOW, on_date: date, amount: -paid,
          label: "Paid " + obligation.name + " (" + obligation.payment_policy + ")",
          account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: account.balance, total_balance_after: totalBalance() }));
      }
      const remaining = round2(required - paid);
      if (remaining > EPS) stillPending.push({ ...obligation, remaining });
    }
    pending = stillPending;
    if (strictFailed) break;

    const action = actions.get(date);
    if (!action) continue;
    const before = Object.fromEntries([...accounts].map(([id, account]) => [id, account.balance]));
    const recordCarry = ids => {
      for (const id of ids || []) {
        const account = accounts.get(id);
        if (account?.balance > EPS) addEvent(new Event({
          event_type: EventType.CARRY_FORWARD, on_date: date, amount: account.balance,
          label: "Holding liquidity; balance " + account.balance.toFixed(2) + " carries forward",
          account_id: id, bank_key: account.bank_key, bank_id: account.bank_id,
          balance_after: account.balance, total_balance_after: totalBalance(),
          decision_context: { action: "carry", balances_before: { ...before } }
        }));
      }
    };
    const book = (account, option, actionName) => {
      const principal = account.balance;
      if (principal <= EPS) return;
      account.balance = 0;
      bookingNumber++;
      const ref = "FD-" + String(bookingNumber).padStart(4, "0");
      const grossFlows = option.generateCashFlows(principal, parseISODate(date), context.compound, context.actualLeapYear);
      const netFlows = option.generateCashFlowsAfterAIT(principal, parseISODate(date), context.aitRate, context.compound, context.actualLeapYear);
      const booking = new Booking({ option, principal, start: date, cash_flows: grossFlows,
        account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id });
      bookings.push(booking);
      addEvent(new Event({ event_type: EventType.BOOKING, on_date: date, amount: principal,
        label: "Book " + option.label + " @ " + option.annual_rate.toFixed(2) + "% -> matures " + formatISODate(booking.end),
        booking_ref: ref, account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
        balance_after: account.balance, total_balance_after: totalBalance(),
        decision_context: { action: actionName, balances_before: { ...before } } }));
      netFlows.forEach((flow, index) => {
        const isMaturity = flow.date.getTime() === booking.end.getTime() &&
          (option.payout_type === "cumulative" || index === netFlows.length - 1);
        addEvent(new Event({ event_type: isMaturity ? EventType.MATURITY : EventType.CASH_FLOW,
          on_date: flow.date, amount: flow.amount,
          label: (isMaturity ? "Maturity " : "Cash flow ") + "[" + ref + "] (" + option.label + ")",
          booking_ref: ref, account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id }));
      });
    };

    if (action.type === "consolidate") {
      const target = accounts.get(action.target_id);
      for (const transfer of action.transfers) {
        const source = accounts.get(transfer.src_id), fee = transfer.fee, net = transfer.net, amount = transfer.amount;
        totalFees += fee; source.balance = 0;
        const channel = source.bank_identity.trim().toUpperCase() === target.bank_identity.trim().toUpperCase() ? "intra_bank" : "domestic_ceft";
        addEvent(new Event({ event_type: EventType.TRANSFER, on_date: date, amount,
          label: "Transfer to " + target.label + " (Amt: " + net.toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
          account_id: source.id, bank_key: source.bank_key, bank_id: source.bank_id,
          transfer_channel: channel, fee, balance_after: source.balance, total_balance_after: totalBalance() }));
        target.balance += net;
        addEvent(new Event({ event_type: EventType.TRANSFER, on_date: date, amount: net,
          label: "Transfer received from " + source.label, account_id: target.id,
          bank_key: target.bank_key, bank_id: target.bank_id, transfer_channel: channel,
          balance_after: target.balance, total_balance_after: totalBalance() }));
      }
      book(target, action.option, "consolidate");
      recordCarry(action.carries);
    } else if (action.type === "local") {
      for (const item of action.bookings) book(accounts.get(item.account_id), item.option, "split");
      recordCarry(action.carries);
    } else if (action.type === "carry") recordCarry(action.carries);
  }

  const target = accounts.get(context.consolidationId);
  for (const account of accounts.values()) {
    if (account.id === target.id || account.balance <= EPS) continue;
    const fee = context.feeConfig.getFee(account.bank_identity, target.bank_identity);
    if (account.balance <= fee) continue;
    const amount = account.balance, net = amount - fee;
    totalFees += fee; account.balance = 0;
    const channel = account.bank_identity.trim().toUpperCase() === target.bank_identity.trim().toUpperCase() ? "intra_bank" : "domestic_ceft";
    addEvent(new Event({ event_type: EventType.TRANSFER, on_date: context.end, amount,
      label: "Final sweep to " + target.label + " (Amt: " + net.toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
      account_id: account.id, bank_key: account.bank_key, bank_id: account.bank_id,
      transfer_channel: channel, fee, balance_after: 0, total_balance_after: totalBalance() }));
    target.balance += net;
    addEvent(new Event({ event_type: EventType.TRANSFER, on_date: context.end, amount: net,
      label: "Final sweep received from " + account.label, account_id: target.id,
      bank_key: target.bank_key, bank_id: target.bank_id, transfer_channel: channel,
      balance_after: target.balance, total_balance_after: totalBalance() }));
  }
  for (const account of accounts.values()) if (account.balance > 0.01) addEvent(new Event({
    event_type: EventType.IDLE, on_date: context.end, amount: account.balance,
    label: "Final cash balance in " + account.label, account_id: account.id,
    bank_key: account.bank_key, bank_id: account.bank_id,
    balance_after: account.balance, total_balance_after: totalBalance()
  }));

  const totalInflow = sum(Object.values(context.inflows).flatMap(day => Object.values(day)));
  const result = new SimResult({
    strategy_name: strategy.name, timeline, bookings,
    total_principal: context.totalCapital, end_date: context.endDate, accounts: asObject(accounts),
    total_transfer_fees: totalFees, total_decisions_evaluated: diagnostics.expanded_states,
    alternative_leaf_net_interests: diagnostics.alternative_leaf_net_interests,
    total_outflows_paid: totalOutflowsPaid, outstanding_outflows: pending,
    valid: !strictFailed, ait_enabled: strategy.ait_enabled, ait_rate: strategy.ait_rate
  });
  result.search_diagnostics = diagnostics;
  result.optimality_proven = diagnostics.optimality_proven;
  result.search_settings = diagnostics.settings;
  return result;
}

export class SearchStrategyBase {
  constructor({ compound = false, actual_leap_year = true, ait_enabled = true, ait_rate = 0.10, ...settings } = {}, mode) {
    this.name = mode === "absolute" ? "Absolute" : "GAML";
    this.mode = mode;
    this.compound = compound;
    this.actual_leap_year = actual_leap_year;
    this.ait_enabled = ait_enabled;
    this.ait_rate = ait_rate;
    this.effective_ait_rate = ait_enabled ? ait_rate : 0;
    this.max_decisions = settings.max_decisions ?? settings.state_cap ?? null;
    this.max_local_branches = settings.max_local_branches === undefined ? 128 : settings.max_local_branches;
    this.beam_width = settings.beam_width === undefined ? 256 : settings.beam_width;
    if (this.max_decisions != null && (!Number.isInteger(this.max_decisions) || this.max_decisions < 1)) throw new RangeError("max_decisions must be at least 1.");
    if (this.max_local_branches != null && (!Number.isInteger(this.max_local_branches) || this.max_local_branches < 1)) throw new RangeError("max_local_branches must be at least 1 or null.");
    if (!Number.isInteger(this.beam_width) || this.beam_width < 1) throw new RangeError("beam_width must be at least 1.");
  }

  simulate(input) {
    const context = createContext(input, this);
    const greedy = new GreedyStrategy({
      compound: this.compound, actual_leap_year: this.actual_leap_year,
      ait_enabled: this.ait_enabled, ait_rate: this.ait_rate
    }).simulate(input);
    const liabilities = sum(greedy.outstanding_outflows.map(item => Number(item.remaining || 0)));
    const greedyObjective = greedy.valid ? greedy.final_value - liabilities : -Infinity;
    const counters = {
      expanded: 0, leaves: 0, boundPruned: 0, memoPruned: 0, localPruned: 0,
      bestValue: greedyObjective, alternatives: [], memo: new Map()
    };
    const initial = {
      date: context.start,
      balances: makeBalanceState(Object.fromEntries([...context.accounts].map(([id, account]) => [id, account.balance]))),
      flows: [], obligations: [], paid: 0
    };
    const settings = {
      maxDecisions: this.max_decisions, maxLocalBranches: this.max_local_branches,
      beamWidth: this.beam_width, endDate: context.endDate
    };
    const search = this.mode === "absolute"
      ? runAbsolute(initial, context, settings, counters)
      : runGaml(initial, context, settings, counters);
    const path = nodePath(search.bestNode);
    const diagnostics = {
      expanded_states: counters.expanded, leaves: counters.leaves,
      bound_pruned: counters.boundPruned, memo_pruned: counters.memoPruned,
      beam_pruned: search.beamPruned || 0, local_combination_pruned: counters.localPruned,
      root_strategy_peak: search.rootPeak || 0,
      optimality_proven: search.optimalityProven,
      alternative_leaf_net_interests: counters.alternatives.sort((a, b) => b - a).slice(0, 10),
      settings
    };
    if (!search.bestNode) {
      if (!greedy.valid) throw new Error(this.name + " found no feasible path satisfying strict outflows.");
      greedy.strategy_name = this.name;
      greedy.search_diagnostics = diagnostics;
      greedy.optimality_proven = diagnostics.optimality_proven;
      greedy.search_settings = settings;
      return greedy;
    }
    return replay(path, context, this, diagnostics);
  }
}
