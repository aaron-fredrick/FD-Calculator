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
test("Greedy CLI executes from JSON config and writes a standalone report",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"fdcal-cli-")),configPath=join(dir,"scenario.json"),reportPath=join(dir,"report.html");
 const config={strategy:"greedy",options_file:join(root,"data/fd_options/fd_options.csv"),investment:{start_date:"2026-01-01",end_date:"2026-04-01"},accounts:{main:{bank_id:"LK_COMMERCIAL_BANK_OF_CEYLON",label:"CLI Test Account",balance:30000,supports_efd:true}},consolidation_account_id:"main",inflows:[],outflows:[],transfer_fees:{default_inter_bank_fee:30,same_bank_fee:0},compound:false,ait_enabled:true,actual_leap_year:true,report_output_file:reportPath};
 try{
  await writeFile(configPath,JSON.stringify(config,null,2));
  const run=spawnSync(process.execPath,[join(root,"cli/fd-cal.js"),"--config",configPath],{cwd:root,encoding:"utf8",timeout:30000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/MULTI-BANK FIXED DEPOSIT INVESTMENT CALCULATOR/);
  assert.match(run.stdout,/Net Interest \(after AIT\):/);\n  assert.match(run.stdout,/GRAND SUMMARY/);\n  assert.match(run.stdout,/BOOKING LEDGER -- ALL FD CONTRACTS/);
  assert.match(run.stdout,/Report saved:/);
  const html=await readFile(reportPath,"utf8");
  assert.match(html,/Full event ledger/);assert.match(html,/Portfolio outcome/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
