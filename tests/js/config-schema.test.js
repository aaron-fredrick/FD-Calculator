import test from "node:test";
import assert from "node:assert/strict";
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
