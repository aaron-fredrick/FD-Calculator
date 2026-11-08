import { Booking, SimResult } from "../core/results.js";

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => [key, canonicalize(value[key])]));
}

function plain(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(plain);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plain(child)]));
}

/**
 * Fingerprint the effective, validated computation and the exact product
 * catalogue/fee snapshot. This is intentionally content-based rather than
 * dependent on form JSON property insertion order.
 */
export function simulationFingerprint(config) {
  const snapshot = {
    start: config.start,
    end: config.end,
    simulation: config.simulation,
    accounts: config.accounts,
    options: config.options,
    inflow_schedule: config.inflow_schedule,
    outflow_schedule: config.outflow_schedule,
    inflow_summaries: config.inflow_summaries,
    outflow_summaries: config.outflow_summaries,
    fee_config: config.fee_config,
    consolidation_account_id: config.consolidation_account_id,
    strategy: config.strategy,
    gaml_settings: config.gaml_settings,
    greedy_settings: config.greedy_settings,
    gss_settings: config.gss_settings,
    compound: config.compound,
    actual_leap_year: config.actual_leap_year,
    ait_enabled: config.ait_enabled,
    ait_rate: config.ait_rate,
    bank_registry: config.bank_registry
  };
  return JSON.stringify(canonicalize(snapshot));
}

/** SHA-256 fingerprint of the exact bank/product and fee snapshot used. */
export async function catalogueFingerprint(config) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") return null;
  const snapshot = JSON.stringify(canonicalize({
    options: config.options,
    fee_config: config.fee_config,
    bank_registry: config.bank_registry
  }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Convert validated domain objects into a structured-clone-safe payload. */
export function createWorkerPayload(config) {
  return {
    start: new Date(config.start),
    end: new Date(config.end),
    simulation: plain(config.simulation),
    options: config.options.map(option => plain(option)),
    accounts: config.accounts.map(account => plain(account)),
    inflow_schedule: plain(config.inflow_schedule),
    outflow_schedule: plain(config.outflow_schedule),
    fee_config: plain(config.fee_config),
    consolidation_account_id: config.consolidation_account_id,
    strategy: config.strategy,
    gaml_settings: plain(config.gaml_settings),
    greedy_settings: plain(config.greedy_settings),
    gss_settings: plain(config.gss_settings),
    compound: config.compound,
    actual_leap_year: config.actual_leap_year,
    ait_enabled: config.ait_enabled,
    ait_rate: config.ait_rate
  };
}

/** Restore option behaviour needed by the main-thread HTML report generator. */
export function rehydrateSimulationResult(result, FDOption) {
  if (!result || result.valid !== true || !Array.isArray(result.bookings) ||
      !result.end_date || !result.timeline || typeof result.timeline !== "object" ||
      !result.accounts || typeof result.accounts !== "object") {
    throw new Error("The simulation worker returned an invalid result payload.");
  }
  const bookings = result.bookings.map(booking => {
    if (!booking?.option || !Number.isFinite(Number(booking.principal)) || Number(booking.principal) <= 0 ||
        !booking.start || !Array.isArray(booking.cash_flows) || !booking.cash_flows.length) {
      throw new Error("The simulation worker returned an invalid FD booking.");
    }
    return new Booking({
      option: new FDOption(booking.option),
      principal: booking.principal,
      start: booking.start,
      cash_flows: booking.cash_flows,
      account_id: booking.account_id,
      bank_key: booking.bank_key,
      bank_id: booking.bank_id
    });
  });
  // Structured cloning removes SimResult's prototype getters and methods.
  // Reconstruct the domain result, then restore additional engine diagnostics.
  const restored = new SimResult({ ...result, bookings });
  return Object.assign(restored, result, { bookings });
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function defaultWorkerFactory() {
  if (typeof Worker === "undefined") throw new Error("Web Workers are not supported in this browser.");
  return new Worker(new URL("./simulation.worker.js", import.meta.url), { type: "module" });
}

/**
 * Owns one expensive browser computation at a time. Same-fingerprint callers
 * share the active Promise; a changed fingerprint terminates obsolete work.
 */
export class SimulationWorkerRunner {
  constructor({ workerFactory = defaultWorkerFactory } = {}) {
    this.workerFactory = workerFactory;
    this.active = null;
    this.completed = null;
    this.nextId = 1;
  }

  run(payload, fingerprint) {
    if (this.active?.fingerprint === fingerprint) {
      return { promise: this.active.promise, reused: false, deduplicated: true, started: false };
    }
    if (this.completed?.fingerprint === fingerprint) {
      this.cancel("Superseded by a scenario with a reusable completed result.");
      return { promise: Promise.resolve(this.completed.result), reused: true, deduplicated: false, started: false };
    }

    this.cancel("Superseded by a newer scenario.");
    let worker;
    try {
      worker = this.workerFactory();
    } catch (error) {
      return { promise: Promise.reject(error), reused: false, deduplicated: false, started: false };
    }

    const id = this.nextId++;
    let resolveRun, rejectRun;
    const promise = new Promise((resolve, reject) => {
      resolveRun = resolve;
      rejectRun = reject;
    });
    const entry = {
      id, fingerprint, worker, promise, settled: false,
      settle: (handler, value) => {
        if (entry.settled) return;
        entry.settled = true;
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        try { worker.terminate(); } catch { /* termination is best-effort cleanup */ }
        if (this.active === entry) this.active = null;
        handler(value);
      }
    };
    entry.cancel = message => entry.settle(rejectRun, abortError(message));
    this.active = entry;

    worker.onmessage = event => {
      if (this.active !== entry || entry.settled) return;
      const message = event?.data;
      if (!message || message.id !== id) {
        entry.settle(rejectRun, new Error("The simulation worker returned an unexpected response."));
        return;
      }
      if (message.type === "result") {
        const result = message.result;
        if (!result || result.valid !== true || !Array.isArray(result.bookings) ||
            !result.end_date || !result.timeline || typeof result.timeline !== "object" ||
            !result.accounts || typeof result.accounts !== "object") {
          entry.settle(rejectRun, new Error("The simulation worker returned an invalid result payload."));
          return;
        }
        this.completed = { fingerprint, result };
        entry.settle(resolveRun, result);
      } else if (message.type === "error") {
        const error = new Error(message.error?.message || "The simulation worker failed.");
        error.name = message.error?.name || "Error";
        entry.settle(rejectRun, error);
      } else {
        entry.settle(rejectRun, new Error("The simulation worker returned an unsupported response type."));
      }
    };
    worker.onerror = event => {
      event?.preventDefault?.();
      if (this.active !== entry || entry.settled) return;
      entry.settle(rejectRun, new Error(event?.message || "The simulation worker stopped unexpectedly."));
    };
    worker.onmessageerror = () => {
      if (this.active !== entry || entry.settled) return;
      entry.settle(rejectRun, new Error("The simulation worker returned a message that could not be deserialised."));
    };

    try {
      worker.postMessage({ id, type: "simulate", payload });
    } catch (error) {
      entry.settle(rejectRun, error);
    }
    return { promise, reused: false, deduplicated: false, started: true };
  }

  cancel(message = "The simulation was cancelled.") {
    if (!this.active) return false;
    this.active.cancel(message);
    return true;
  }

  clearCompleted() {
    this.completed = null;
  }
}
