import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateConfigurationShape } from "../../src/core/config-schema.js";

const valid = () => ({
  strategy:"gaml",
  investment:{start_date:"today",end_date:"2027-12-31"},
  accounts:{main:{bank_id:"BANK_A",balance:1000,supports_efd:false}},
  consolidation_account_id:"main",
  inflows:[{account_id:"main",amount:500,type:"recurring",interval:"1m",start_date:"investment_start+1m",end_date:"end"}],
  outflows:[{account_id:"main",amount:100,type:"scheduled",dates:["2027-01-01"],payment_policy:"defer"}],
  transfer_fees:{default_inter_bank_fee:null,same_bank_fee:0,custom_fees:[]},
  compound:false,ait_enabled:true,actual_leap_year:true,
  gaml_settings:{beam_width:256,max_local_branches:null,max_decisions:null}
});

test("accepts complete current schema, nullable fallback values and date keywords",()=>{
  assert.equal(validateConfigurationShape(valid()).strategy,"gaml");
});
test("requires investment dates and at least one account",()=>{
  const a=valid();delete a.investment.start_date;
  assert.throws(()=>validateConfigurationShape(a),/investment.start_date: required/);
  const b=valid();b.accounts={};
  assert.throws(()=>validateConfigurationShape(b),/non-empty object/);
});
test("validates conditional recurring versus scheduled event fields",()=>{
  const a=valid();a.inflows[0].dates=["2027-01-01"];
  assert.throws(()=>validateConfigurationShape(a),/not valid for recurring inflows/);
  const b=valid();b.outflows[0].dates=[];
  assert.throws(()=>validateConfigurationShape(b),/non-empty array/);
});
test("rejects malformed date strings, impossible dates and unsupported tokens",()=>{
  for(const value of ["01/02/2027","2027-02-30","tomorrow","investment_end+1m"]){
    const a=valid();a.investment.start_date=value;
    assert.throws(()=>validateConfigurationShape(a),/investment.start_date/);
  }
});
test("rejects invalid types, unknown fields and invalid conditional groups",()=>{
  const a=valid();a.compound="false";
  assert.throws(()=>validateConfigurationShape(a),/compound: must be boolean/);
  const b=valid();b.accounts.main.extra=true;
  assert.throws(()=>validateConfigurationShape(b),/accounts.main.extra: unknown property/);
  const c=valid();c.outflows[0].payment_policy="maybe";
  assert.throws(()=>validateConfigurationShape(c),/payment_policy/);
  const d=valid();d.gaml_settings.beam_width=null;
  assert.throws(()=>validateConfigurationShape(d),/beam_width/);
});

test("accepts and validates independent Greedy tenor settings",()=>{
  const a=valid();a.strategy="greedy";a.greedy_settings={tenor_tiebreaker:"longest",plan_tenor_tiebreaker:"shortest"};
  assert.equal(validateConfigurationShape(a).greedy_settings.tenor_tiebreaker,"longest");
  const b=valid();b.greedy_settings={tenor_tiebreaker:"middle"};
  assert.throws(()=>validateConfigurationShape(b),/must be shortest or longest/);
  const d=valid();d.strategy_settings={greedy:{plan_tenor_tiebreaker:"longest"}};
  assert.equal(validateConfigurationShape(d).strategy_settings.greedy.plan_tenor_tiebreaker,"longest");
});


test("configuration schema accepts GSS and validates its recursion threshold", () => {
  assert.doesNotThrow(() => validateConfigurationShape({
    strategy: "gss",
    investment: { start_date: "2026-01-01", end_date: "2026-12-31" },
    accounts: { main: { bank_id: "BANK_A" } },
    gss_settings: { small_period_days: 30 }
  }));
  assert.throws(() => validateConfigurationShape({
    strategy: "gss",
    investment: { start_date: "2026-01-01", end_date: "2026-12-31" },
    accounts: { main: { bank_id: "BANK_A" } },
    gss_settings: { small_period_days: 0 }
  }), /small_period_days/);
});

test("accepts GSS settings through supported configuration aliases", () => {
  const base = {
    strategy: "gss",
    investment: { start_date: "2026-01-01", end_date: "2026-12-31" },
    accounts: { main: { bank_id: "BANK_A" } }
  };
  assert.equal(validateConfigurationShape({ ...base, gss: { small_period_days: 14 } }).gss.small_period_days, 14);
  assert.equal(validateConfigurationShape({ ...base, strategy_settings: { gss: { small_period_days: 21 } } }).strategy_settings.gss.small_period_days, 21);
  assert.throws(() => validateConfigurationShape({ ...base, strategy_settings: { gss: { unknown: true } } }), /unknown setting/);
});

test("published JSON schema declares GSS and all strategy settings", () => {
  const schema = JSON.parse(readFileSync(new URL("../../schema/config.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(schema.properties.strategy.enum, ["absolute", "greedy", "gaml", "gss"]);
  for (const key of ["gss_settings", "gss", "greedy_settings", "greedy"]) {
    assert.ok(schema.properties[key], `missing schema property: ${key}`);
  }
  assert.ok(schema.properties.strategy_settings.properties.gss);
  assert.equal(schema.$defs.gssSettings.properties.small_period_days.minimum, 1);
  assert.equal(schema.$defs.gssSettings.properties.small_period_days.default, 30);
  assert.deepEqual(schema.$defs.simulation.properties.mode.enum, ["scoped", "goal"]);
  assert.deepEqual(schema.$defs.goal.required, ["metric", "target"]);
});

test("validates scoped and date-independent goal simulation mode shapes", () => {
  const scoped = valid(); scoped.simulation = { mode: "scoped" };
  assert.doesNotThrow(() => validateConfigurationShape(scoped));
  const goal = valid(); goal.simulation = { mode: "goal", goal: { metric: "consolidation_net_interest", target: 50000 } };
  delete goal.investment.end_date;
  assert.doesNotThrow(() => validateConfigurationShape(goal));
});

test("rejects unsupported time-based mode and invalid goal settings", () => {
  const time = valid(); time.simulation = { mode: "time_based", duration: "6m" };
  assert.throws(() => validateConfigurationShape(time), /simulation.duration: unknown property/);
  const goal = valid(); goal.simulation = { mode: "goal", goal: { metric: "portfolio_value", target: 0 } };
  delete goal.investment.end_date;
  assert.throws(() => validateConfigurationShape(goal), /simulation.goal.metric/);
  const datedGoal = valid(); datedGoal.simulation = { mode: "goal", goal: { metric: "consolidation_net_interest", target: 1 } };
  assert.throws(() => validateConfigurationShape(datedGoal), /omit when simulation.mode is goal/);
});
