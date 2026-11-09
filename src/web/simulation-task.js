import { Account, FDOption, TransferFeeConfig } from "../core/models.js";
import { Booking } from "../core/results.js";
import { GreedyStrategy } from "../strategies/greedy.js";
import { AbsolutePlusStrategy } from "../strategies/absolute-plus.js";
import { GSSStrategy } from "../strategies/gss.js";
import { SimulationEngine } from "../core/simulation.js";

/** Execute the existing shared engine with worker-rehydrated domain objects. */
export function runSimulationTask(payload) {
  const config = {
    ...payload,
    options: payload.options.map(option => new FDOption(option)),
    accounts: payload.accounts.map(account => new Account(account)),
    fee_config: new TransferFeeConfig(payload.fee_config)
  };
  const input = {
    options: config.options,
    start: config.start,
    end: config.end,
    simulation: config.simulation,
    inflow_schedule: config.inflow_schedule,
    accounts: config.accounts,
    inflow_account_id: config.accounts[0].id,
    fee_config: config.fee_config,
    consolidation_account_id: config.consolidation_account_id,
    outflow_schedule: config.outflow_schedule
  };
  const settings = {
    compound: config.compound,
    actual_leap_year: config.actual_leap_year,
    ait_enabled: config.ait_enabled,
    ait_rate: config.ait_rate
  };
  const strategy = config.strategy === "greedy"
    ? new GreedyStrategy({ ...settings, ...config.greedy_settings })
    : config.strategy === "gss"
      ? new GSSStrategy({ ...settings, ...config.gss_settings })
      : new AbsolutePlusStrategy({ ...settings, ...config.gaml_settings });
  const result = new SimulationEngine().run(strategy, input);
  if (!result.valid) {
    throw new Error("The strategy could not satisfy one or more strict outflows. Review amounts, dates and payment policies.");
  }

  // The engine's normalized option contract intentionally remains unchanged.
  // Restore bank catalogue metadata only on the returned report-facing booking
  // snapshots, after all strategy decisions and calculations have completed.
  const optionKey = option => JSON.stringify([
    option.bank_id || option.bank_key, option.label, option.period_str,
    option.annual_rate, option.min_amount, option.payout_type,
    option.payout_period_str, Boolean(option.is_efd)
  ]);
  const catalogueMetadata = new Map(config.options.map(option => [optionKey(option), {
    customer_segment: option.customer_segment,
    min_age: option.min_age, max_age: option.max_age,
    min_age_inclusive: option.min_age_inclusive,
    max_age_inclusive: option.max_age_inclusive,
    guardian_required: option.guardian_required,
    source_url: option.source_url,
    source_effective_date: option.source_effective_date,
    source_type: option.source_type,
    source_notes: option.source_notes
  }]));
  result.bookings = (result.bookings ?? []).map(booking => new Booking({
    option: new FDOption({
      ...booking.option,
      ...(catalogueMetadata.get(optionKey(booking.option)) ?? {})
    }),
    principal: booking.principal,
    start: booking.start,
    cash_flows: booking.cash_flows,
    account_id: booking.account_id,
    bank_key: booking.bank_key,
    bank_id: booking.bank_id
  }));
  return result;
}
