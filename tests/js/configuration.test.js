import test from "node:test";
import assert from "node:assert/strict";
import { buildCashSchedule, resolveDate, validateConfiguration } from "../../src/core/configuration.js";
import { FDOption } from "../../src/core/models.js";

const start = "2026-01-31", end = "2026-06-30";
const accountIds = new Set(["main", "secondary"]);

test("date tokens resolve deterministically and reject implicit today", () => {
  assert.equal(resolveDate("investment_start+1m", { investmentStart: start }).toISOString().slice(0, 10), "2026-02-28");
  assert.throws(() => resolveDate("today"), /today value must be supplied/);
  assert.equal(resolveDate("today", { today: "2026-03-01" }).toISOString().slice(0, 10), "2026-03-01");
});

test("recurring and scheduled cash events aggregate by date and account", () => {
  const inflows = buildCashSchedule([
    { name: "salary", account_id: "main", amount: 1000, interval: "1m", start_date: "2026-02-01", end_date: "2026-04-01" },
    { name: "bonus", account_id: "main", amount: 250, type: "scheduled", dates: ["2026-02-01", "2026-04-01"] }
  ], "inflow", { start, end, accountIds });
  assert.deepEqual(inflows.schedule["2026-02-01"], { main: 1250 });
  assert.equal(inflows.summaries[0].occurrences, 3);
  const outflows = buildCashSchedule([
    { name: "rent", account_id: "secondary", amount: 500, interval: "1m", payment_policy: "defer", start_date: "2026-02-01", end_date: "2026-03-01" }
  ], "outflow", { start, end, accountIds });
  assert.equal(outflows.schedule["2026-03-01"][0].payment_policy, "defer");
});

test("configuration validates bank identity, eFD account capability and transfer fees", () => {
  const options = [
    new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, bank_id: "BANK_A", is_efd: false }),
    new FDOption({ label: "efd", period_str: "1m", annual_rate: 8, bank_id: "BANK_A", is_efd: true })
  ];
  const config = validateConfiguration({
    investment: { start_date: start, end_date: end },
    accounts: { main: { bank_id: "BANK_A", balance: 50000, supports_efd: false } },
    inflows: [{ account_id: "main", amount: 1000, interval: "1m" }],
    transfer_fees: { default_inter_bank_fee: 30 }
  }, {
    bankRegistry: { BANK_A: { name: "Bank A", intra_bank_transfer_fee: 0, domestic_inter_bank_transfer_fee: 25 } },
    bankKeyById: { BANK_A: "bank_a" }, options
  });
  assert.equal(config.accounts[0].canUseOption(options[1]), false);
  assert.equal(config.fee_config.getFee("BANK_A", "BANK_B"), 25);
  assert.equal(config.inflow_summaries[0].occurrences, 5);
  assert.equal(config.ait_enabled, true);
});

test("invalid event references and payment policies fail validation", () => {
  assert.throws(() => buildCashSchedule([{ account_id: "missing", amount: 1, interval: "1m" }], "inflow", { start, end, accountIds }), /unknown account/);
  assert.throws(() => buildCashSchedule([{ account_id: "main", amount: 1, interval: "1m", payment_policy: "maybe" }], "outflow", { start, end, accountIds }), /invalid payment_policy/);
});

test("configuration exposes validated Python-compatible GAML settings", () => {
  const options = [new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, bank_id: "BANK_A" })];
  const base = {
    investment: { start_date: start, end_date: end },
    accounts: { main: { bank_id: "BANK_A", balance: 50000 } },
    strategy: "gaml",
    gaml_settings: { beam_width: 512, max_local_branches: 64, max_decisions: null }
  };
  const config = validateConfiguration(base, {
    bankRegistry: { BANK_A: { name: "Bank A" } },
    bankKeyById: { BANK_A: "bank_a" }, options
  });
  assert.deepEqual(config.gaml_settings, {
    beam_width: 512, max_local_branches: 64, max_decisions: null, time_limit_ms: 0
  });
  assert.throws(() => validateConfiguration({
    ...base, gaml_settings: { beam_width: 0 }
  }, {
    bankRegistry: { BANK_A: { name: "Bank A" } },
    bankKeyById: { BANK_A: "bank_a" }, options
  }), /beam_width/);
});

test("runtime rejects inverted investment dates, unknown accounts and invalid financial flags", () => {
  const options = [new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, bank_id: "BANK_A" })];
  const context = { bankRegistry: { BANK_A: { name: "Bank A" } }, bankKeyById: { BANK_A: "bank_a" }, options, today: "2026-01-01" };
  const base = { investment: { start_date: start, end_date: end }, accounts: { main: { bank_id: "BANK_A", balance: 1000 } } };
  assert.throws(() => validateConfiguration({ ...base, investment: { start_date: end, end_date: start } }, context), /end date is before/);
  assert.throws(() => validateConfiguration({ ...base, inflows: [{ account_id: "missing", amount: 10, interval: "1m" }] }, context), /unknown account/);
  assert.throws(() => validateConfiguration({ ...base, compound: "false" }, context), /compound: must be boolean/);
  assert.throws(() => validateConfiguration({ ...base, actual_leap_year: 1 }, context), /actual_leap_year: must be boolean/);
});

test("runtime rejects duplicate custom transfer fee routes", () => {
  const options = [new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, bank_id: "BANK_A" })];
  const base = { investment: { start_date: start, end_date: end }, accounts: { main: { bank_id: "BANK_A", balance: 1000 } }, transfer_fees: { custom_fees: [
    { from_bank_id: "BANK_A", to_bank_id: "BANK_A", amount: 0 },
    { from_bank_id: "BANK_A", to_bank_id: "BANK_A", amount: 5 }
  ] } };
  assert.throws(() => validateConfiguration(base, {
    bankRegistry: { BANK_A: { name: "Bank A" } }, bankKeyById: { BANK_A: "bank_a" }, options
  }), /Duplicate custom transfer fee/);
});

test("configuration exposes default and configured Greedy tenor policies",()=>{
  const options=[new FDOption({label:"standard",period_str:"1m",annual_rate:8,bank_id:"BANK_A"})];
  const base={investment:{start_date:start,end_date:end},accounts:{main:{bank_id:"BANK_A",balance:50000}},strategy:"greedy"};
  const context={bankRegistry:{BANK_A:{name:"Bank A"}},bankKeyById:{BANK_A:"bank_a"},options};
  assert.deepEqual(validateConfiguration(base,context).greedy_settings,{tenor_tiebreaker:"shortest",plan_tenor_tiebreaker:"shortest"});
  assert.deepEqual(validateConfiguration({...base,greedy_settings:{tenor_tiebreaker:"longest",plan_tenor_tiebreaker:"shortest"}},context).greedy_settings,{tenor_tiebreaker:"longest",plan_tenor_tiebreaker:"shortest"});
});

test("goal mode is blocked by the public configuration validator while under development", () => {
  const options = [new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, bank_id: "BANK_A" })];
  assert.throws(() => validateConfiguration({ simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target: 25000 } }, investment: { start_date: "2026-01-31" }, accounts: { main: { bank_id: "BANK_A", balance: 50000 } } }, {
    bankRegistry: { BANK_A: { name: "Bank A" } }, bankKeyById: { BANK_A: "bank_a" }, options
  }), /goal mode is under development/);
});

test("legacy configuration normalizes as scoped and retains explicit dates", () => {
  const options = [new FDOption({ label: "standard", period_str: "1m", annual_rate: 8, bank_id: "BANK_A" })];
  const config = validateConfiguration({
    investment: { start_date: "2026-01-31", end_date: "2026-06-30" },
    accounts: { main: { bank_id: "BANK_A", balance: 50000 } }
  }, {
    bankRegistry: { BANK_A: { name: "Bank A" } }, bankKeyById: { BANK_A: "bank_a" }, options
  });
  assert.equal(config.start.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(config.end.toISOString().slice(0, 10), "2026-06-30");
  assert.deepEqual(config.simulation, { mode: "scoped", goal: null });
});


test("age-based FD product filters retain general products and opt into only selected segments", () => {
  const options = [
    new FDOption({ label: "general", period_str: "1m", annual_rate: 8, bank_id: "BANK_A" }),
    new FDOption({ label: "senior", period_str: "1m", annual_rate: 9, bank_id: "BANK_A", customer_segment: "senior", min_age: 60, min_age_inclusive: false }),
    new FDOption({ label: "minor", period_str: "1m", annual_rate: 9.5, bank_id: "BANK_A", customer_segment: "minor", max_age: 18, guardian_required: true })
  ];
  const base = { investment: { start_date: start, end_date: end }, accounts: { main: { bank_id: "BANK_A", balance: 50000 } } };
  const context = { bankRegistry: { BANK_A: { name: "Bank A" } }, bankKeyById: { BANK_A: "bank_a" }, options };
  assert.deepEqual(validateConfiguration(base, context).options.map(option => option.label), ["general"]);
  assert.deepEqual(validateConfiguration({ ...base, fd_eligibility: { include_senior: true } }, context).options.map(option => option.label).sort(), ["general", "senior"]);
  assert.deepEqual(validateConfiguration({ ...base, fd_eligibility: { include_senior: true, include_minor: true } }, context).options.map(option => option.label).sort(), ["general", "minor", "senior"]);
  assert.equal(options[1].min_age_inclusive, false);
  assert.equal(options[2].guardian_required, true);
});
