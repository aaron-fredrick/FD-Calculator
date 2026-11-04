import { Event, EventType } from "./events.js";
import { TransferFeeConfig } from "./models.js";

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

/** Shared entry point for executing and finalizing any strategy exactly once. */
export class SimulationEngine {
  run(strategy, input) {
    if (!strategy || typeof strategy.simulate !== "function") {
      throw new TypeError("SimulationEngine requires a strategy with a simulate(input) method.");
    }
    const result = strategy.simulate(input);

    // The simulation engine owns lifecycle boundaries. Keep the start marker
    // out of strategy decision-making so every strategy reports the same
    // simulation start, including runs with no opening cash or start-day flows.
    const startEvent = new Event({
      event_type: EventType.SIMULATION_START,
      on_date: input.start,
      amount: 0,
      label: "Simulation starts"
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

    const defaultAccountId = input?.consolidation_account_id ??
      input?.inflow_account_id ??
      input?.accounts?.[0]?.id ??
      Object.keys(result.accounts ?? {})[0];
    return finalizeSimulation(result, {
      fee_config: input?.fee_config ?? new TransferFeeConfig(),
      consolidation_account_id: defaultAccountId
    });
  }
}
