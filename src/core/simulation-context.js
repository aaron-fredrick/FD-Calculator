import { Account, FDOption, TransferFeeConfig } from "./models.js";
import { normalizeInflowSchedule } from "./events.js";
import { validateOutflowSchedule } from "./cashflows.js";
import { addPeriod, formatISODate, parseISODate } from "./dates.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Normalize the public simulation input once at the engine boundary.
 * The returned object is a simulation-owned context; strategies should
 * receive read-only planning views rather than this context directly.
 */
export function createSimulationContext(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Simulation input must be an object.");
  }
  const startDate = parseISODate(input.start);
  const simulation = input.simulation ?? { mode: "scoped" };
  if (!simulation || typeof simulation !== "object" || Array.isArray(simulation)) throw new TypeError("Simulation mode must be an object.");
  const mode = simulation.mode ?? "scoped";
  if (!["scoped", "goal"].includes(mode)) throw new RangeError("Unsupported simulation mode: " + mode);
  const endDate = mode === "goal" ? addPeriod(startDate, "30y") : input.end ? parseISODate(input.end) : null;
  if (!endDate) throw new TypeError("Scoped simulations require an end date.");
  let goal = null;
  if (mode === "goal") {
    if (simulation.goal?.metric !== "consolidation_net_interest") throw new RangeError("Goal metric must be consolidation_net_interest.");
    const target = Number(simulation.goal?.target);
    if (!Number.isFinite(target) || target <= 0) throw new RangeError("Goal target must be finite and positive.");
    goal = Object.freeze({ metric: "consolidation_net_interest", target });
  }
  if (startDate > endDate) throw new RangeError("Simulation start must not be after its end.");
  if (mode === "goal" && startDate.getTime() === endDate.getTime()) throw new RangeError("Goal safety horizon must be after the simulation start.");

  const sourceOptions = input.options;
  if (!Array.isArray(sourceOptions) || sourceOptions.length === 0) {
    throw new TypeError("Simulation requires at least one FD option.");
  }
  if (sourceOptions.some(option => !option || typeof option.canInvest !== "function" ||
      typeof option.generateCashFlowsAfterAIT !== "function")) {
    throw new TypeError("Simulation options must be FDOption-compatible instances.");
  }
  const options = sourceOptions.map(option => deepFreeze(new FDOption({
    label: option.label, period_str: option.period_str, annual_rate: option.annual_rate,
    min_amount: option.min_amount, payout_type: option.payout_type,
    payout_period_str: option.payout_period_str, bank_key: option.bank_key,
    bank_id: option.bank_id, is_efd: option.is_efd
  })));

  let sourceAccounts = input.accounts;
  if (!Array.isArray(sourceAccounts) || sourceAccounts.length === 0) {
    const bank = options[0].bank_identity || "commercial";
    sourceAccounts = [new Account({
      id: "default", bank_id: bank, bank_key: bank, label: "Main Account"
    })];
  }
  const ids = new Set();
  const accounts = sourceAccounts.map(account => {
    if (!account || typeof account !== "object") throw new TypeError("Simulation accounts must be account objects.");
    const id = String(account.id ?? "").trim();
    if (!id || ids.has(id)) throw new TypeError("Simulation account ids must be non-empty and unique.");
    ids.add(id);
    return deepFreeze(new Account({
      id, bank_id: account.bank_id, bank_key: account.bank_key,
      label: account.label, balance: account.balance,
      supports_efd: account.supports_efd
    }));
  });

  const inflowAccountId = String(input.inflow_account_id ?? accounts[0].id);
  const consolidationAccountId = String(input.consolidation_account_id ?? inflowAccountId);
  if (!ids.has(inflowAccountId)) throw new RangeError("inflow_account_id does not reference a configured account.");
  if (!ids.has(consolidationAccountId)) throw new RangeError("consolidation_account_id does not reference a configured account.");

  const inflows = normalizeInflowSchedule(input.inflow_schedule ?? {}, inflowAccountId);
  for (const [date, destinations] of Object.entries(inflows)) {
    if (date < formatISODate(startDate) || date > formatISODate(endDate)) {
      throw new RangeError("Inflow date " + date + " is outside the simulation period.");
    }
    for (const accountId of Object.keys(destinations)) {
      if (!ids.has(accountId)) throw new RangeError("Inflow destination account " + accountId + " is not configured.");
    }
  }

  const outflows = deepFreeze(structuredClone(input.outflow_schedule ?? {}));
  validateOutflowSchedule(outflows, formatISODate(startDate), formatISODate(endDate), ids);
  const sourceFeeConfig = input.fee_config ?? new TransferFeeConfig();
  const feeConfig = deepFreeze(new TransferFeeConfig({
    default_inter_bank_fee: sourceFeeConfig.default_inter_bank_fee,
    same_bank_fee: sourceFeeConfig.same_bank_fee,
    custom_fees: structuredClone(sourceFeeConfig.custom_fees ?? {}),
    bank_fees: structuredClone(sourceFeeConfig.bank_fees ?? {})
  }));
  deepFreeze(inflows);

  return Object.freeze({
    start: startDate,
    end: endDate,
    start_iso: formatISODate(startDate),
    end_iso: formatISODate(endDate),
    simulation: Object.freeze({ mode, goal }),
    options: Object.freeze([...options]),
    accounts: Object.freeze(accounts),
    account_ids: Object.freeze([...ids]),
    inflow_account_id: inflowAccountId,
    consolidation_account_id: consolidationAccountId,
    inflows,
    outflows,
    fee_config: feeConfig,
    original_capital: accounts.reduce((total, account) => total + account.balance, 0)
  });
}
