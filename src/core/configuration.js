import { Account, FDOption, TransferFeeConfig } from "./models.js";
import { addPeriod, formatISODate, parseISODate, parsePeriod } from "./dates.js";
import { validateConfigurationShape } from "./config-schema.js?v=gss-settings-2";

function finiteNonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${field} must be finite and non-negative.`);
  return number;
}

export function resolveDate(value, { investmentStart = null, investmentEnd = null, today = null } = {}) {
  if (value === null || value === undefined || !String(value).trim()) throw new TypeError("Date value is required.");
  const token = String(value).trim().toLowerCase();
  if (token === "today") {
    if (!today) throw new TypeError("A deterministic today value must be supplied when using the 'today' token.");
    return parseISODate(today);
  }
  if (["investment_start", "start"].includes(token)) {
    if (!investmentStart) throw new TypeError("'investment_start' requires a resolved investment start date.");
    return parseISODate(investmentStart);
  }
  if (["investment_end", "end"].includes(token)) {
    if (!investmentEnd) throw new TypeError("'investment_end' requires a resolved investment end date.");
    return parseISODate(investmentEnd);
  }
  if (token.startsWith("investment_start+") && investmentStart) {
    return addPeriod(investmentStart, token.slice("investment_start+".length));
  }
  return parseISODate(token);
}

export function buildCashSchedule(rawEvents = [], kind, { start, end, accountIds, today = null } = {}) {
  if (!["inflow", "outflow"].includes(kind)) throw new RangeError("Schedule kind must be inflow or outflow.");
  if (!Array.isArray(rawEvents)) throw new TypeError(`'${kind}s' must be an array.`);
  const startDate = parseISODate(start), endDate = parseISODate(end);
  const schedule = {};
  const summaries = [];

  rawEvents.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`${kind}s[${index}] must be an object.`);
    const name = String(entry.name || `${kind[0].toUpperCase() + kind.slice(1)} ${index + 1}`).trim();
    const accountId = String(entry.account_id ?? "").trim();
    if (!accountIds.has(accountId)) throw new RangeError(`${kind} ${name} targets unknown account ${accountId}.`);
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError(`${kind} ${name} amount must be finite and greater than zero.`);
    const eventType = String(entry.type ?? "recurring").trim().toLowerCase();
    if (!["recurring", "scheduled"].includes(eventType)) throw new RangeError(`${kind} ${name} type must be recurring or scheduled.`);
    let dates = [];
    let interval = "";

    if (eventType === "scheduled") {
      if (!Array.isArray(entry.dates) || entry.dates.length === 0) throw new TypeError(`${kind} ${name} requires a non-empty dates array.`);
      dates = entry.dates.map(value => resolveDate(value, { investmentStart: startDate, investmentEnd: endDate, today }));
      const unique = new Set(dates.map(formatISODate));
      if (unique.size !== dates.length) throw new RangeError(`${kind} ${name} contains duplicate scheduled dates.`);
    } else {
      interval = String(entry.interval ?? "").trim().toLowerCase();
      const { amount: intervalAmount } = parsePeriod(interval);
      if (intervalAmount <= 0) throw new RangeError(`${kind} ${name} interval must be positive.`);
      const first = entry.start_date == null ? addPeriod(startDate, interval) : resolveDate(entry.start_date, { investmentStart: startDate, investmentEnd: endDate, today });
      const last = resolveDate(entry.end_date ?? "end", { investmentStart: startDate, investmentEnd: endDate, today });
      if (first < startDate || last > endDate || first > last) throw new RangeError(`${kind} ${name} dates must fall within the investment period.`);
      for (let step = 0; ; step++) {
        const date = addPeriod(first, interval, step);
        if (date > last) break;
        dates.push(date);
      }
    }

    if (dates.some(date => date < startDate || date > endDate)) throw new RangeError(`${kind} ${name} has a date outside the investment period.`);
    const policy = kind === "outflow" ? String(entry.payment_policy ?? "strict").trim().toLowerCase() : "";
    if (kind === "outflow" && !["strict", "defer", "best_effort"].includes(policy)) throw new RangeError(`Outflow ${name} has invalid payment_policy ${policy}.`);

    for (const date of dates) {
      const key = formatISODate(date);
      if (kind === "inflow") {
        schedule[key] ??= {};
        schedule[key][accountId] = (schedule[key][accountId] ?? 0) + amount;
      } else {
        schedule[key] ??= [];
        schedule[key].push({ name, amount, account_id: accountId, payment_policy: policy, type: eventType });
      }
    }
    summaries.push({
      name, amount, type: eventType, account_id: accountId,
      dates: dates.map(formatISODate), occurrences: dates.length, total: amount * dates.length,
      ...(kind === "outflow" ? { payment_policy: policy } : {}),
      ...(eventType === "recurring" && dates.length ? { interval, start_date: formatISODate(dates[0]), end_date: formatISODate(dates.at(-1)) } : {})
    });
  });
  return { schedule, summaries };
}

/**
 * Runtime-neutral configuration validation. The caller supplies bank catalogue,
 * FD index mapping and already-loaded products; file access stays in Node/browser adapters.
 */
export function validateConfiguration(raw, { bankRegistry, bankKeyById, options, today = null } = {}) {
  validateConfigurationShape(raw);
  const investment = raw.investment;
  if (!investment || typeof investment !== "object") throw new TypeError("Configuration requires an investment object.");
  const simulation = raw.simulation ?? { mode: "scoped" };
  const simulationMode = simulation.mode ?? "scoped";
  const start = resolveDate(investment.start_date, { today });
  let end;
  let goal = null;
  if (simulationMode === "time_based") {
    end = addPeriod(start, simulation.duration);
  } else if (simulationMode === "goal") {
    goal = {
      metric: simulation.goal.metric,
      target: simulation.goal.target,
      maximum_end_date: formatISODate(resolveDate(simulation.goal.maximum_end_date, { investmentStart: start, today }))
    };
    end = parseISODate(goal.maximum_end_date);
  } else {
    end = resolveDate(investment.end_date, { investmentStart: start, today });
  }
  if (end < start) throw new RangeError("Investment end date is before investment start date.");
  if (!raw.accounts || typeof raw.accounts !== "object" || Array.isArray(raw.accounts) || !Object.keys(raw.accounts).length) throw new TypeError("accounts must be a non-empty object keyed by account ID.");

  const accounts = [];
  const accountIds = new Set();
  const bankIds = [];
  for (const [idRaw, entry] of Object.entries(raw.accounts)) {
    const id = idRaw.trim();
    if (!id) throw new TypeError("Account IDs must not be empty.");
    if (accountIds.has(id)) throw new TypeError(`Duplicate account ID after trimming: ${id}.`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`accounts[${id}] must be an object.`);
    const bankId = String(entry.bank_id ?? "").trim();
    if (!bankId) throw new TypeError(`accounts[${id}].bank_id must not be empty.`);
    if (!bankRegistry?.[bankId]) throw new RangeError(`Account ${id} references unknown bank_id ${bankId}.`);
    const bankKey = bankKeyById?.[bankId];
    if (!bankKey) throw new RangeError(`Bank ${bankId} has no FD-options index entry.`);
    const supportsEfd = entry.supports_efd ?? true;
    if (typeof supportsEfd !== "boolean") throw new TypeError(`accounts[${id}].supports_efd must be boolean.`);
    const account = new Account({ id, bank_id: bankId, bank_key: bankKey, label: String(entry.label ?? "").trim(), balance: finiteNonNegative(entry.balance ?? 0, `accounts[${id}].balance`), supports_efd: supportsEfd });
    accounts.push(account); accountIds.add(id);
    if (!bankIds.includes(bankId)) bankIds.push(bankId);
  }

  const consolidationAccountId = String(raw.consolidation_account_id ?? accounts[0].id).trim();
  if (!accountIds.has(consolidationAccountId)) throw new RangeError("consolidation_account_id must reference a configured account.");
  if (!Array.isArray(options) || options.length === 0) throw new TypeError("At least one FD option must be loaded.");
  for (const account of accounts) {
    const eligible = options.some(option => (!option.bank_identity || option.bank_identity === account.bank_identity) && account.canUseOption(option));
    if (!eligible) throw new RangeError(`Account ${account.id} has no compatible FD products.`);
  }

  const inflows = buildCashSchedule(raw.inflows ?? [], "inflow", { start, end, accountIds, today });
  const outflows = buildCashSchedule(raw.outflows ?? [], "outflow", { start, end, accountIds, today });
  const fees = raw.transfer_fees ?? {};
  if (!Array.isArray(fees.custom_fees ?? [])) throw new TypeError("transfer_fees.custom_fees must be an array.");
  if (typeof fees !== "object" || Array.isArray(fees)) throw new TypeError("transfer_fees must be an object.");
  const customFees = {};
  for (const [index, item] of (fees.custom_fees ?? []).entries()) {
    if (!bankRegistry[item.from_bank_id] || !bankRegistry[item.to_bank_id]) throw new RangeError(`Custom transfer fee ${index} references an unknown bank.`);
    const feeKey = JSON.stringify([item.from_bank_id.toUpperCase(), item.to_bank_id.toUpperCase()]);
    if (Object.prototype.hasOwnProperty.call(customFees, feeKey)) throw new RangeError(`Duplicate custom transfer fee for ${item.from_bank_id} to ${item.to_bank_id}.`);
    customFees[feeKey] = finiteNonNegative(item.amount, `custom_fees[${index}].amount`);
  }
  const bankFees = {};
  for (const bankId of bankIds) {
    const row = bankRegistry[bankId];
    bankFees[bankId.toUpperCase()] = [
      finiteNonNegative(row.intra_bank_transfer_fee ?? fees.same_bank_fee ?? 0, `${bankId}.intra_bank_transfer_fee`),
      finiteNonNegative(row.domestic_inter_bank_transfer_fee ?? fees.default_inter_bank_fee ?? 30, `${bankId}.domestic_inter_bank_transfer_fee`)
    ];
  }
  const feeConfig = new TransferFeeConfig({
    default_inter_bank_fee: finiteNonNegative(fees.default_inter_bank_fee ?? 30, "default_inter_bank_fee"),
    same_bank_fee: finiteNonNegative(fees.same_bank_fee ?? 0, "same_bank_fee"),
    custom_fees: customFees, bank_fees: bankFees
  });
  const compound = raw.compound ?? false;
  if (typeof compound !== "boolean") throw new TypeError("compound must be boolean.");
  const actualLeapYear = raw.actual_leap_year ?? true;
  if (typeof actualLeapYear !== "boolean") throw new TypeError("actual_leap_year must be boolean.");
  const aitEnabled = raw.ait_enabled ?? true;
  if (typeof aitEnabled !== "boolean") throw new TypeError("ait_enabled must be boolean.");
  const strategy = String(raw.strategy ?? "absolute").trim().toLowerCase();
  if (!["absolute", "greedy", "gaml", "gss"].includes(strategy)) throw new RangeError(`Unsupported strategy ${strategy}.`);
  const gamlRaw = raw.gaml_settings ?? raw.gaml ?? raw.strategy_settings?.gaml ?? {};
  if (!gamlRaw || typeof gamlRaw !== "object" || Array.isArray(gamlRaw)) throw new TypeError("gaml_settings must be an object.");
  const positiveInteger = (value, field, fallback, allowNull = false) => {
    if (value === undefined) return fallback;
    if (value === null && allowNull) return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) throw new RangeError(field + " must be a positive integer" + (allowNull ? " or null." : "."));
    return number;
  };
  const gamlSettings = {
    beam_width: positiveInteger(gamlRaw.beam_width, "gaml_settings.beam_width", 256),
    max_local_branches: positiveInteger(gamlRaw.max_local_branches, "gaml_settings.max_local_branches", 128, true),
    max_decisions: positiveInteger(gamlRaw.max_decisions ?? gamlRaw.state_cap, "gaml_settings.max_decisions", null, true)
  };
  const greedyRaw = raw.greedy_settings ?? raw.greedy ?? raw.strategy_settings?.greedy ?? {};
  const greedySettings = {
    tenor_tiebreaker: greedyRaw.tenor_tiebreaker ?? "shortest",
    plan_tenor_tiebreaker: greedyRaw.plan_tenor_tiebreaker ?? "shortest"
  };
  const gssRaw = raw.gss_settings ?? raw.gss ?? raw.strategy_settings?.gss ?? {};
  const gssSettings = {
    small_period_days: positiveInteger(gssRaw.small_period_days, "gss_settings.small_period_days", 30)
  };
  return {
    start, end, simulation: { mode: simulationMode, goal }, accounts, accountIds, bankIds, options, consolidation_account_id: consolidationAccountId,
    inflow_schedule: inflows.schedule, inflow_summaries: inflows.summaries,
    outflow_schedule: outflows.schedule, outflow_summaries: outflows.summaries,
    fee_config: feeConfig, strategy, gaml_settings: gamlSettings, greedy_settings: greedySettings, gss_settings: gssSettings, compound,
    actual_leap_year: actualLeapYear, ait_enabled: aitEnabled, ait_rate: 0.10,
    report_output_file: String(raw.report_output_file ?? "fd_cal_report.html").trim()
  };
}
