/**
 * Contracts shared by the simulation executor and strategy planners.
 *
 * Strategies receive frozen value views and return revision-bound signals.
 * The authoritative SimulationState is retained by the execution layer.
 */
export const StrategySignalType = Object.freeze({
  DECISION: "decision",
  WAIT: "wait",
  COMPLETE: "complete"
});

export const StrategyDecisionType = Object.freeze({
  SPLIT: "SPLIT",
  CONSOLIDATE: "CONSOLIDATE",
  CARRY: "CARRY"
});

function freezeValue(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeValue(item);
  } else {
    for (const item of Object.values(value)) freezeValue(item);
  }
  return Object.freeze(value);
}

function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("Strategy signal revision must be a non-negative safe integer.");
  }
}

function requireISODate(value, name) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new RangeError(name + " must be a valid YYYY-MM-DD date.");
  }
  return date;
}

export function createPlanningView({
  revision, date, end_date, accounts, pending_outflows = [], scheduled_dates = []
}) {
  requireRevision(revision);
  date = requireISODate(date, "Planning view date");
  end_date = requireISODate(end_date, "Planning view end date");
  if (date > end_date) throw new RangeError("Planning view date cannot be after its end date.");
  if (!Array.isArray(accounts)) throw new TypeError("Planning view accounts must be an array.");
  const ids = new Set();
  const accountViews = accounts.map(account => {
    const id = String(account.id ?? "");
    if (!id || ids.has(id)) throw new TypeError("Planning view account ids must be non-empty and unique.");
    ids.add(id);
    if (!Number.isFinite(account.balance) || account.balance < 0) {
      throw new RangeError("Planning view account balances must be finite and non-negative.");
    }
    return {
      id, bank_id: String(account.bank_id ?? ""), bank_key: String(account.bank_key ?? ""),
      label: String(account.label ?? ""), balance: account.balance,
      supports_efd: Boolean(account.supports_efd)
    };
  });
  if (!Array.isArray(pending_outflows)) throw new TypeError("Planning view pending_outflows must be an array.");
  const pendingViews = pending_outflows.map(item => {
    const account_id = String(item.account_id ?? "");
    const remaining = Number(item.remaining);
    const payment_policy = String(item.payment_policy ?? "strict").toLowerCase();
    if (!ids.has(account_id)) throw new RangeError("Pending outflow targets unknown account " + account_id + ".");
    if (!Number.isFinite(remaining) || remaining <= 0) throw new RangeError("Pending outflow remaining amount must be finite and positive.");
    if (!["strict", "defer", "best_effort"].includes(payment_policy)) throw new RangeError("Unknown pending outflow policy " + payment_policy + ".");
    return {
      name: String(item.name ?? "Outflow"), account_id, remaining, payment_policy,
      due_date: requireISODate(item.due_date ?? date, "Pending outflow due date")
    };
  });
  if (!Array.isArray(scheduled_dates)) throw new TypeError("Planning view scheduled_dates must be an array.");
  const dates = scheduled_dates.map(value => requireISODate(value, "Scheduled event date"));
  return freezeValue({
    revision, date, end_date,
    accounts: accountViews,
    pending_outflows: pendingViews,
    scheduled_dates: [...new Set(dates)].sort()
  });
}

export function createStrategyDecision({ revision, date, action, plan }) {
  requireRevision(revision);
  if (!Object.values(StrategyDecisionType).includes(action)) {
    throw new RangeError("Unknown strategy decision action: " + action);
  }
  date = requireISODate(date, "Strategy decision date");
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("A strategy decision requires a structured plan.");
  }
  return freezeValue({
    signal_type: StrategySignalType.DECISION,
    revision, date, action, plan: structuredClone(plan)
  });
}

export function createStrategyWait({ revision, until }) {
  requireRevision(revision);
  until = requireISODate(until, "Strategy wait boundary");
  return Object.freeze({
    signal_type: StrategySignalType.WAIT, revision, until
  });
}

export function createStrategyComplete({ revision }) {
  requireRevision(revision);
  return Object.freeze({ signal_type: StrategySignalType.COMPLETE, revision });
}

/**
 * Validate a strategy response before the executor performs any mutation.
 * The caller supplies the current authoritative revision and date.
 */
export function validateStrategySignal(signal, {
  revision, current_date, end_date
}) {
  requireRevision(revision);
  current_date = requireISODate(current_date, "Current simulation date");
  end_date = requireISODate(end_date, "Simulation end date");
  if (current_date > end_date) throw new RangeError("Current simulation date cannot be after the simulation end.");
  if (!signal || typeof signal !== "object") throw new TypeError("Strategy must return a structured signal.");
  if (signal.revision !== revision) throw new Error("Stale strategy signal: simulation state has changed.");
  if (signal.signal_type === StrategySignalType.DECISION) {
    if (!Object.values(StrategyDecisionType).includes(signal.action)) throw new RangeError("Invalid strategy decision action.");
    if (signal.date !== current_date) throw new Error("Strategy decision date does not match the current simulation date.");
    if (!signal.plan || typeof signal.plan !== "object" || Array.isArray(signal.plan)) {
      throw new TypeError("Strategy decision plan must be an object.");
    }
    return signal;
  }
  if (signal.signal_type === StrategySignalType.WAIT) {
    if (signal.until <= current_date || signal.until > end_date) {
      throw new RangeError("Strategy wait boundary must be after the current date and no later than the simulation end.");
    }
    return signal;
  }
  if (signal.signal_type === StrategySignalType.COMPLETE) return signal;
  throw new RangeError("Unknown strategy signal type: " + signal.signal_type);
}

/**
 * Minimal authoritative account state. Only the simulation executor should
 * retain this object; planners receive createPlanningView() values instead.
 */
export class SimulationState {
  #accounts;
  #revision = 0;

  constructor(accounts) {
    if (!Array.isArray(accounts) || !accounts.length) throw new TypeError("SimulationState requires accounts.");
    this.#accounts = new Map();
    for (const account of accounts) {
      const id = String(account.id ?? "");
      if (!id || this.#accounts.has(id)) throw new TypeError("SimulationState account ids must be non-empty and unique.");
      if (!Number.isFinite(account.balance) || account.balance < 0) throw new RangeError("SimulationState balances must be finite and non-negative.");
      this.#accounts.set(id, {
        id, bank_id: String(account.bank_id ?? ""), bank_key: String(account.bank_key ?? ""),
        label: String(account.label ?? ""), balance: account.balance,
        supports_efd: Boolean(account.supports_efd)
      });
    }
  }

  get revision() { return this.#revision; }

  planningView({ date, end_date, pending_outflows = [], scheduled_dates = [] }) {
    return createPlanningView({
      revision: this.#revision, date, end_date,
      accounts: [...this.#accounts.values()], pending_outflows, scheduled_dates
    });
  }

  applyBalanceUpdates(updates, expectedRevision) {
    if (expectedRevision !== this.#revision) throw new Error("Stale state update: simulation state has changed.");
    if (!Array.isArray(updates)) throw new TypeError("Balance updates must be an array.");
    const next = new Map();
    for (const update of updates) {
      const id = String(update.account_id ?? "");
      if (!this.#accounts.has(id)) throw new RangeError("Balance update targets unknown account " + id + ".");
      if (next.has(id)) throw new TypeError("Balance updates contain duplicate account " + id + ".");
      if (!Number.isFinite(update.balance) || update.balance < 0) throw new RangeError("Updated balances must be finite and non-negative.");
      next.set(id, update.balance);
    }
    for (const [id, balance] of next) this.#accounts.get(id).balance = balance;
    if (next.size) this.#revision++;
    return this.#revision;
  }
}
