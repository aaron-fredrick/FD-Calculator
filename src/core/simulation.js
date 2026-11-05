import { Event, EventType } from "./events.js";
import { TransferFeeConfig } from "./models.js";
import { createSimulationContext } from "./simulation-context.js";
import { SimulationRuntime } from "./simulation-runtime.js";
import { parseISODate, formatISODate } from "./dates.js";
import { StrategySignalType } from "./strategy-contracts.js";

/**
 * Apply the one simulation-wide final consolidation sweep.
 *
 * Strategies return an unfinished SimResult. This finalizer runs once after
 * the selected strategy has processed the complete simulation horizon.
 * Recursive planning boundaries must never invoke it.
 */
export function finalizeSimulation(result, {
  fee_config = null,
  consolidation_account_id = null
} = {}) {
  if (!result || typeof result !== "object" || !result.accounts) {
    throw new TypeError("Finalization requires a simulation result with accounts.");
  }
  if (result.finalized) {
    throw new Error("Simulation result has already been finalized.");
  }

  const accounts = result.accounts instanceof Map
    ? result.accounts
    : new Map(Object.entries(result.accounts));
  const targetId = String(consolidation_account_id ?? accounts.keys().next().value ?? "");
  const target = accounts.get(targetId);
  if (!target) {
    throw new RangeError("Final consolidation account does not exist in the simulation result.");
  }

  const fees = fee_config ?? new TransferFeeConfig();
  const endDate = result.end_date;
  const timeline = result.timeline ?? {};
  const addEvent = event => {
    if (timeline instanceof Map) {
      const events = timeline.get(event.date_key) ?? [];
      events.push(event);
      timeline.set(event.date_key, events);
    } else {
      (timeline[event.date_key] ??= []).push(event);
    }
  };
  const values = [...accounts.values()];
  const totalBalance = () => values.reduce((sum, account) => sum + account.balance, 0);
  let finalSweepFees = 0;

  for (const account of values) {
    if (account.id === target.id || account.balance <= 0.001) continue;
    const fee = fees.getFee(account.bank_identity, target.bank_identity);
    if (account.balance <= fee) continue;

    const amount = account.balance;
    const net = amount - fee;
    account.balance = 0;
    finalSweepFees += fee;
    const channel = account.bank_identity.trim().toUpperCase() ===
      target.bank_identity.trim().toUpperCase() ? "intra_bank" : "domestic_ceft";

    addEvent(new Event({
      event_type: EventType.TRANSFER,
      on_date: endDate,
      amount,
      label: "Final sweep to " + target.label + " (Amt: " + net.toFixed(2) + ", Fee: " + fee.toFixed(2) + ")",
      account_id: account.id,
      bank_key: account.bank_key,
      bank_id: account.bank_id,
      transfer_channel: channel,
      fee,
      balance_after: account.balance,
      total_balance_after: totalBalance()
    }));

    target.balance += net;
    addEvent(new Event({
      event_type: EventType.TRANSFER,
      on_date: endDate,
      amount: net,
      label: "Final sweep received from " + account.label,
      account_id: target.id,
      bank_key: target.bank_key,
      bank_id: target.bank_id,
      transfer_channel: channel,
      balance_after: target.balance,
      total_balance_after: totalBalance()
    }));
  }

  result.total_transfer_fees = Number(result.total_transfer_fees || 0) + finalSweepFees;
  for (const account of values) {
    if (account.balance <= 0.01) continue;
    addEvent(new Event({
      event_type: EventType.IDLE,
      on_date: endDate,
      amount: account.balance,
      label: "Final cash balance in " + account.label,
      account_id: account.id,
      bank_key: account.bank_key,
      bank_id: account.bank_id,
      balance_after: account.balance,
      total_balance_after: totalBalance()
    }));
  }

  result.timeline = timeline;
  result.accounts = Object.fromEntries(values.map(account => [account.id, account]));
  result.finalized = true;
  return result;
}

function runStrategySession(strategy, context) {
    const runtime = new SimulationRuntime(context, {
      strategy_name: strategy.name ?? strategy.constructor?.name ?? "Strategy",
      compound: strategy.compound,
      actual_leap_year: strategy.actual_leap_year,
      ait_enabled: strategy.ait_enabled,
      ait_rate: strategy.ait_rate,
      outflow_account_tiebreak: strategy.outflow_account_tiebreak,
      outflow_due_date_sort: strategy.outflow_due_date_sort,
      round_balances: strategy.round_balances,
      opening_trigger_always: strategy.opening_trigger_always
    });
    const session = strategy.createSession(context);
    if (!session || typeof session.nextSignal !== "function") {
      throw new TypeError("Strategy createSession(context) must return a session with nextSignal(view).");
    }

    let waitUntil = null;
    let iterations = 0;
    while (true) {
      if (++iterations > 100000) throw new Error("Strategy session exceeded the simulation progression limit.");
      const eventDate = runtime.nextEventDate();
      let nextDate = eventDate;
      if (waitUntil && (!nextDate || waitUntil < formatISODate(nextDate))) {
        nextDate = parseISODate(waitUntil);
      }
      if (!nextDate) nextDate = new Date(context.end);
      if (nextDate > context.end) nextDate = new Date(context.end);
      if (runtime.currentDate && nextDate <= runtime.currentDate) {
        if (runtime.currentDate < context.end) nextDate = new Date(context.end);
        else break;
      }

      runtime.processDate(nextDate);
      if (!runtime.valid) break;
      const signal = session.nextSignal(runtime.planningView());
      runtime.executeSignal(signal);
      if (signal.signal_type === StrategySignalType.COMPLETE) break;
      waitUntil = signal.signal_type === StrategySignalType.WAIT ? signal.until : null;

      if (runtime.currentDate.getTime() === context.end.getTime() &&
          !runtime.nextEventDate() && signal.signal_type !== StrategySignalType.WAIT) {
        break;
      }
    }

    const result = runtime.buildResult();
    if (session.resultMetadata) Object.assign(result, session.resultMetadata);
    return result;
  }


/** Shared entry point for executing and finalizing any strategy exactly once. */
export class SimulationEngine {

  runUnfinalized(strategy, input) {
    if (!strategy || typeof strategy.createSession !== "function") {
      throw new TypeError("SimulationEngine requires a strategy with createSession(context).");
    }
    return runStrategySession(strategy, createSimulationContext(input));
  }

  run(strategy, input) {
    if (!strategy || typeof strategy.createSession !== "function") {
      throw new TypeError("SimulationEngine requires a strategy with createSession(context).");
    }
    const context = createSimulationContext(input);
    const result = runStrategySession(strategy, context);
    const startEvent = new Event({
      event_type: EventType.SIMULATION_START,
      on_date: context.start,
      amount: 0,
      label: "Simulation starts",
      balance_after: 0,
      total_balance_after: 0
    });
    const timeline = result.timeline ?? {};
    if (timeline instanceof Map) {
      const events = timeline.get(startEvent.date_key) ?? [];
      events.unshift(startEvent);
      timeline.set(startEvent.date_key, events);
    } else {
      (timeline[startEvent.date_key] ??= []).unshift(startEvent);
    }
    result.timeline = timeline;
    return finalizeSimulation(result, {
      fee_config: context.fee_config,
      consolidation_account_id: context.consolidation_account_id
    });
  }
}
