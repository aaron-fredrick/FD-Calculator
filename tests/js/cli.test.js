import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "../../src/io/csv.js";
import { loadBankCatalogue, loadFDOptions } from "../../src/io/data-loader.js";
const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
test("CSV parser preserves quoted commas, escaped quotes and embedded newlines",()=>{
 const rows=parseCSV('name,notes\r\n"Deposit, monthly","said ""hello"""\r\n"Two\nlines",ok\r\n');
 assert.deepEqual(rows,[{name:"Deposit, monthly",notes:'said "hello"'},{name:"Two\nlines",notes:"ok"}]);
});
test("root data catalogues load canonical banks and bank-specific FD products",async()=>{
 const banks=await loadBankCatalogue(join(root,"data/banks/banks.csv"));
 assert.ok(banks.LK_COMMERCIAL_BANK_OF_CEYLON);
 const options=await loadFDOptions(join(root,"data/fd_options/fd_options.csv"),["LK_COMMERCIAL_BANK_OF_CEYLON"]);
 assert.ok(options.length>0);
 assert.ok(options.every(option=>option.bank_id==="LK_COMMERCIAL_BANK_OF_CEYLON"));
});
test("age eligibility research ledger preserves incomplete and verified bank rules",async()=>{
 const rows=parseCSV(await readFile(join(root,"data/fd_options/age_eligibility.csv"),"utf8"));
 const peoplesMinor=rows.find(row=>row.bank_id==="LK_PEOPLES_BANK"&&row.customer_segment==="minor");
 assert.equal(peoplesMinor.max_age,"18");assert.equal(peoplesMinor.max_age_inclusive,"true");assert.equal(peoplesMinor.guardian_required,"true");
 assert.equal(peoplesMinor.min_amount,"");assert.equal(peoplesMinor.research_status,"eligibility_verified_rate_terms_incomplete");
 const sdbMinor=rows.find(row=>row.bank_id==="LK_SANASA_DEVELOPMENT_BANK"&&row.customer_segment==="minor");
 assert.equal(sdbMinor.max_age,"18");assert.equal(sdbMinor.max_age_inclusive,"false");assert.equal(sdbMinor.guardian_required,"true");assert.equal(sdbMinor.research_status,"verified_in_catalogue");
});

test("bank data loader preserves verified age-segment product boundaries",async()=>{
 const index=join(root,"data/fd_options/fd_options.csv");
 const peoples=await loadFDOptions(index,["LK_PEOPLES_BANK"]);
 const sey=await loadFDOptions(index,["LK_SEYLAN_BANK"]);
 const sdb=await loadFDOptions(index,["LK_SANASA_DEVELOPMENT_BANK"]);
 const rdb=await loadFDOptions(index,["LK_PRADESHIYA_SANWARDHANA_BANK"]);
 const ntb=await loadFDOptions(index,["LK_NATIONS_TRUST_BANK"]);
 const parinatha=peoples.filter(option=>option.customer_segment==="senior");
 assert.equal(parinatha.length,12);
 const parinatha55=parinatha.filter(option=>option.label.includes("55-60"));
 const parinatha60=parinatha.filter(option=>option.label.includes("over-60"));
 assert.equal(parinatha55.length,6);assert.ok(parinatha55.every(option=>option.min_age===55&&option.min_age_inclusive===false&&option.max_age===60&&option.max_age_inclusive===true));
 assert.equal(parinatha60.length,6);assert.ok(parinatha60.every(option=>option.min_age===60&&option.min_age_inclusive===false&&option.max_age===null));
 assert.equal(ntb.length,18);assert.ok(ntb.every(option=>option.min_amount===50000));
 assert.equal(rdb.length,28);
 assert.equal(rdb.find(option=>option.label.includes("100d")).min_amount,500000);
 assert.equal(rdb.find(option=>option.label.includes("standard 1m")).min_amount,5000);
 const sdbSenior=sdb.filter(option=>option.customer_segment==="senior");
 assert.equal(sdbSenior.length,17);
 assert.ok(sdbSenior.every(option=>option.min_age===55&&option.min_age_inclusive===false&&option.min_amount===10000));
 const sdbMinorOptions=sdb.filter(option=>option.customer_segment==="minor");
 assert.equal(sdbMinorOptions.length,6);
 assert.ok(sdbMinorOptions.every(option=>option.max_age===18&&option.max_age_inclusive===false&&option.guardian_required===true&&option.min_amount===10000));
 const seylanSenior=sey.filter(option=>option.customer_segment==="senior");
 assert.equal(seylanSenior.length,3);
 assert.ok(seylanSenior.every(option=>option.min_age===60&&option.min_age_inclusive===false&&option.min_amount===100000));
});

test("Greedy CLI executes from JSON config and writes a standalone report",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"fdcal-cli-")),configPath=join(dir,"scenario.json"),reportPath=join(dir,"report.html");
 const config={strategy:"greedy",options_file:join(root,"data/fd_options/fd_options.csv"),investment:{start_date:"2026-01-01",end_date:"2026-04-01"},accounts:{main:{bank_id:"LK_COMMERCIAL_BANK_OF_CEYLON",label:"CLI Test Account",balance:30000,supports_efd:true}},consolidation_account_id:"main",inflows:[],outflows:[],transfer_fees:{default_inter_bank_fee:30,same_bank_fee:0},compound:false,ait_enabled:true,actual_leap_year:true,report_output_file:reportPath,show_timeline:true,show_ledger:true};
 try{
  await writeFile(configPath,JSON.stringify(config,null,2));
  const run=spawnSync(process.execPath,[join(root,"src/cli/fd-cal.js"),"--config",configPath],{cwd:root,encoding:"utf8",timeout:30000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/MULTI-BANK FIXED DEPOSIT INVESTMENT CALCULATOR/);
  assert.match(run.stdout,/Start date:\s+2026-01-01/);
  assert.match(run.stdout,/Net Interest/);
  assert.match(run.stdout,/GRAND SUMMARY/);
  assert.match(run.stdout,/BOOKING LEDGER -- ALL FD CONTRACTS/);
  assert.match(run.stdout,/Report saved:/);
  const html=await readFile(reportPath,"utf8");
  assert.match(html,/Full event ledger/);assert.match(html,/Portfolio outcome/);
  assert.match(html,/class="sidebar"/);assert.match(html,/class="equation-panel"/);
  assert.match(html,/id="account-chart"/);assert.match(html,/id="cashflow-chart"/);
  assert.match(html,/id="maturity-chart"/);assert.match(html,/id="returns-chart"/);
  assert.match(html,/prefers-reduced-motion/);assert.match(html,/event-day-start/);assert.match(html,/<details class="decision"(?:\s|>)/);assert.match(html,/transfer-instruction/);assert.match(html,/booking-instruction/);assert.match(html,/GROSS INTEREST/);assert.match(html,/#55c99a/);assert.match(html,/#ef7777/);assert.match(html,/#e9ad58/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("Absolute+ CLI accepts configured and command-line search settings",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"fdcal-absolute-plus-")),configPath=join(dir,"scenario.json"),reportPath=join(dir,"absolute-plus-report.html");
 const config={strategy:"gaml",gaml_settings:{beam_width:8,max_local_branches:4,max_decisions:20},options_file:join(root,"data/fd_options/fd_options.csv"),investment:{start_date:"2026-01-01",end_date:"2026-02-01"},accounts:{main:{bank_id:"LK_COMMERCIAL_BANK_OF_CEYLON",label:"Absolute+ Test Account",balance:30000,supports_efd:true}},consolidation_account_id:"main",inflows:[],outflows:[],transfer_fees:{default_inter_bank_fee:30,same_bank_fee:0},compound:false,ait_enabled:true,actual_leap_year:true,report_output_file:reportPath,show_timeline:false,show_ledger:false};
 try{
  await writeFile(configPath,JSON.stringify(config,null,2));
  const run=spawnSync(process.execPath,[join(root,"src/cli/fd-cal.js"),"--config",configPath,"--strategy","absolute-r-plus","--beam-width","4","--max-local-branches","2"],{cwd:root,encoding:"utf8",timeout:30000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/SEARCH DIAGNOSTICS/);
  assert.ok(run.stdout.includes("Absolute R+ settings              : beam 4, local width 2, state cap 20"));
  const html=await readFile(reportPath,"utf8");
  assert.match(html,/Portfolio outcome/);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test("GSS CLI runs with configured and command-line recursion thresholds",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"fdcal-gss-")),configPath=join(dir,"scenario.json"),reportPath=join(dir,"gss-report.html");
 const config={strategy:"gss",gss_settings:{small_period_days:30},options_file:join(root,"data/fd_options/fd_options.csv"),investment:{start_date:"2026-01-01",end_date:"2026-04-01"},accounts:{main:{bank_id:"LK_COMMERCIAL_BANK_OF_CEYLON",label:"GSS Test Account",balance:30000,supports_efd:true}},consolidation_account_id:"main",inflows:[],outflows:[],transfer_fees:{default_inter_bank_fee:30,same_bank_fee:0},compound:false,ait_enabled:true,actual_leap_year:true,report_output_file:reportPath,show_timeline:false,show_ledger:false};
 try{
  await writeFile(configPath,JSON.stringify(config,null,2));
  const run=spawnSync(process.execPath,[join(root,"src/cli/fd-cal.js"),"--config",configPath,"--small-period-days","15"],{cwd:root,encoding:"utf8",timeout:30000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/GSS DIAGNOSTICS/);
  assert.match(run.stdout,/Small-period threshold\s+: 15 days/);
  const html=await readFile(reportPath,"utf8");
  assert.match(html,/Portfolio outcome/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
