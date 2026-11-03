#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfigurationFromFile } from "../src/io/data-loader.js";
import { validateConfiguration } from "../src/core/configuration.js";
import { GreedyStrategy } from "../src/core/strategies/greedy.js";
import { formatSimulation } from "../src/reporting/console.js";
import { generateHtmlReport } from "../src/reporting/html.js";
function parseArgs(argv){const out={config:"config.json",strategy:null,help:false};for(let i=0;i<argv.length;i++){const a=argv[i];if(a==="--help"||a==="-h")out.help=true;else if(a==="--config"||a==="-c")out.config=argv[++i];else if(a==="--strategy"||a==="-s")out.strategy=argv[++i];else throw new Error("Unknown argument: "+a);}return out;}
function todayLocal(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
async function main(){const cli=parseArgs(process.argv.slice(2));if(cli.help){console.log("Usage: npm run cli -- [--config config.json] [--strategy greedy|gaml|absolute]\\nJavaScript CLI currently runs Greedy; GAML and Absolute ports are pending.");return;}
 const loaded=await loadConfigurationFromFile(cli.config),selected=String(cli.strategy||loaded.raw.strategy||"absolute").trim().toLowerCase();
 if(!["greedy","gaml","absolute"].includes(selected))throw new Error("Unsupported strategy "+selected+"; use greedy, gaml or absolute.");
 if(selected!=="greedy")throw new Error(selected.toUpperCase()+" is not yet ported to JavaScript. Use --strategy greedy or the archived Python CLI.");
 const config=validateConfiguration(loaded.raw,{bankRegistry:loaded.bankRegistry,bankKeyById:loaded.bankKeyById,options:loaded.options,today:todayLocal()});config.options_path=loaded.optionsPath;config.source_path=loaded.resolvedConfig;
 const result=new GreedyStrategy({compound:config.compound,actual_leap_year:config.actual_leap_year,ait_enabled:config.ait_enabled,ait_rate:config.ait_rate}).simulate({options:config.options,start:config.start,end:config.end,inflow_schedule:config.inflow_schedule,accounts:config.accounts,inflow_account_id:config.accounts[0].id,fee_config:config.fee_config,consolidation_account_id:config.consolidation_account_id,outflow_schedule:config.outflow_schedule});
 if(!result.valid)throw new Error("The selected strategy cannot satisfy one or more strict outflows.");
 console.log(formatSimulation(result,config,loaded.resolvedConfig,loaded.optionsPath));
 const output=resolve(dirname(loaded.resolvedConfig),config.report_output_file);await mkdir(dirname(output),{recursive:true});await writeFile(output,generateHtmlReport(result,config),"utf8");console.log("Report saved: "+output);
}
main().catch(e=>{console.error("FD Calculator error: "+e.message);process.exitCode=1;});
