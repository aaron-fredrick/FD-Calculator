import { Account, TransferFeeConfig } from "./models.js";
import { normalizeInflowSchedule } from "./events.js";
import { validateOutflowSchedule } from "./cashflows.js";
import { formatISODate, parseISODate } from "./dates.js";

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
  const endDate = parseISODate(input.end);
  if (startDate > endDate) throw new RangeError("Simulation start must not be after its end.");

  const options = input.options;
  if (!Array.isArray(options) || options.length === 0) {
    throw new TypeError("Simulation requires at least one FD option.");
  }
  if (options.some(option => !option || typeof option.canInvest !== "function" ||
      typeof option.generateCashFlowsAfterAIT !== "function")) {
    throw new TypeError("Simulation options must be FDOption-compatible instances.");
  }

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
    return new Account({
      id, bank_id: account.bank_id, bank_key: account.bank_key,
      label: account.label, balance: account.balance,
      supports_efd: account.supports_efd
    });
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

  const outflows = input.outflow_schedule ?? {};
  validateOutflowSchedule(outflows, formatISODate(startDate), formatISODate(endDate), ids);
  const feeConfig = input.fee_config ?? new TransferFeeConfig();

  return Object.freeze({
    start: startDate,
    end: endDate,
    start_iso: formatISODate(startDate),
    end_iso: formatISODate(endDate),
    options: Object.freeze([...options]),
    accounts: Object.freeze(accounts),
    account_ids: Object.freeze([...ids]),
    inflow_account_id: inflowAccountId,
    consolidation_account_id: consolidationAccountId,
    inflows: Object.freeze(inflows),
    outflows,
    fee_config: feeConfig,
    original_capital: accounts.reduce((total, account) => total + account.balance, 0)
  });
}
