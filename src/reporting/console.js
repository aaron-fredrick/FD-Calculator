const W=132;
const RESET="\x1b[0m",BOLD="\x1b[1m",DIM="\x1b[2m";
const C={date:"\x1b[36m",desc:"\x1b[90m",sep:"\x1b[90m",inflow:"\x1b[94m",outflow:"\x1b[91m",transfer:"\x1b[96m",carry:"\x1b[93m",booking:"\x1b[95m",maturity:"\x1b[32m",cash:"\x1b[92m",idle:"\x1b[90m",orange:"\x1b[38;5;208m",purple:"\x1b[38;5;183m"};
const labels={inflow:"INFLOW",outflow:"OUTFLOW",transfer:"TRANSFER",booking:"BOOK",cash_flow:"CASH FLOW",maturity:"MATURITY",carry_forward:"CARRY FORWARD",idle:"IDLE",simulation_start:"SIMULATION START"};
const colors={inflow:C.inflow,outflow:C.outflow,transfer:C.transfer,booking:C.booking,cash_flow:C.cash,maturity:C.maturity,carry_forward:C.carry,idle:C.idle,simulation_start:C.desc};
const money=n=>Number(n??0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const date=d=>{if(d instanceof Date)return d.toISOString().slice(0,10);const s=String(d??"");return /^\d{8}$/.test(s)?s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6):s.slice(0,10)};
const pad=(v,n)=>String(v??"").slice(0,n).padEnd(n);
const line=(char="-")=>char.repeat(W);
const color=(s,c,on)=>on?c+s+RESET:s;
const summaryLine=(label,value,c,on)=>"  "+color(pad(label,34),c,on)+" : "+color(BOLD+value, BOLD,on);
function xirr(result){
 const events=Object.values(result.timeline).flat(),contrib=new Map(),withdrawals=new Map();
 for(const e of events){const d=date(e.on_date);if(e.event_type==="inflow"&&e.amount>0)contrib.set(d,(contrib.get(d)||0)+e.amount);if(e.event_type==="outflow"&&e.amount<0)withdrawals.set(d,(withdrawals.get(d)||0)-e.amount);}
 const opening=Math.max(0,result.total_principal-[...contrib.values()].reduce((a,b)=>a+b,0)),first=events.map(e=>date(e.on_date)).sort()[0];
 const flows=[];if(opening>0)flows.push([first,-opening]);for(const [d,v] of contrib)if(v>0)flows.push([d,-v]);for(const [d,v] of withdrawals)if(v>0)flows.push([d,v]);
 const liabilities=(result.outstanding_outflows||[]).reduce((a,x)=>a+Number(x.remaining||0),0),terminal=Number(result.final_value_after_ait??result.final_value)-Number(result.total_outflows_paid||0)-liabilities;
 flows.push([date(result.end_date),terminal]);if(!flows.some(x=>x[1]<0))return null;
 const origin=Math.min(...flows.map(x=>Date.parse(x[0]+"T00:00:00"))),dated=flows.map(([d,v])=>[(Date.parse(d+"T00:00:00")-origin)/86400000/365,v]);
 const npv=r=>dated.reduce((s,[t,v])=>s+v/Math.pow(1+r,t),0);let lo=-.999999,hi=1,lv=npv(lo),hv=npv(hi);while(lv*hv>0&&hi<1e6){hi=hi*2+1;hv=npv(hi);}if(lv*hv>0)return null;
 for(let i=0;i<200;i++){const mid=(lo+hi)/2,mv=npv(mid);if(Math.abs(mv)<1e-8)return mid*100;if(lv*mv<=0){hi=mid;hv=mv}else{lo=mid;lv=mv}}return (lo+hi)/2*100;
}
function timelineText(result,on){
 const out=[],typeWidth=20,sep="  "+"-".repeat(12)+" "+"-".repeat(12)+" "+"-".repeat(typeWidth)+" "+"-".repeat(14)+" "+"-".repeat(14)+"   "+"-".repeat(55);
 out.push("",line("="),"  EVENT TIMELINE  ["+result.strategy_name+" strategy]",line("="));
 out.push(color("  "+pad("Date",12)+" "+pad("Account",12)+" "+pad("Type",typeWidth)+" "+ "Amount".padStart(14)+" "+"Balance".padStart(14)+"   Description",BOLD,on));
 out.push(color(sep,C.sep,on));
 const refs=new Map((result.bookings||[]).map((b,i)=>["FD-"+String(i+1).padStart(4,"0"),b]));
 const gross=new Map();for(const [ref,b] of refs)for(const f of b.cash_flows||[])gross.set(ref+"|"+date(f.date),f.amount);
 const keys=result.sorted_dates();keys.forEach((key,di)=>{const events=result.timeline[key]||[],rows=[];
  for(const e of events){if(e.event_type==="inflow"&&e.amount===0&&e.label==="Opening balance trigger")continue;
   if(e.event_type==="transfer"){const ch=e.transfer_channel==="intra_bank"?"INTRA-BANK":"INTER-BANK";if(e.label.toLowerCase().includes("to ")){rows.push([e,ch+" TO",-(e.amount-e.fee),C.orange,e.label]);if(e.fee>0)rows.push([e,ch+" TF",-e.fee,C.outflow,"Transfer fee for "+e.label]);}else rows.push([e,ch+" TI",e.amount,C.transfer,e.label]);continue;}
   const b=refs.get(e.booking_ref),g=gross.get(e.booking_ref+"|"+date(e.on_date))??e.amount;
   if(e.event_type==="cash_flow"&&b){const ait=Math.max(0,g-e.amount);let lbl="INSTALLMENT";if(b.payout_type==="periodic_interest"){const p=(b.option.payout_period_str||"").toLowerCase();lbl=p.startsWith("y")?"YEAR INTEREST":p.startsWith("m")?"MONTH INTEREST":p.toUpperCase()+" INTEREST";}rows.push([e,lbl,g,C.cash,e.label]);if(ait>.001)rows.push([e,"AIT WITHHELD",-ait,C.outflow,"AIT deducted from this interest payout"]);continue;}
   if(e.event_type==="maturity"&&b){const aitGross=g-b.principal,netInterest=e.amount-b.principal,ait=Math.max(0,aitGross-netInterest);if(["cumulative","periodic_interest"].includes(b.payout_type)){rows.push([e,"MATURE PRINCIPAL",b.principal,C.purple,"Principal returned ["+e.booking_ref+"]"]);if(netInterest>0)rows.push([e,"MATURE INTEREST",aitGross,C.cash,"Interest paid at maturity ["+e.booking_ref+"]"]);if(ait>.001)rows.push([e,"AIT WITHHELD",-ait,C.outflow,"AIT deducted from maturity interest"]);}else{rows.push([e,"MATURE CASH FLOW",g,C.maturity,e.label]);if(ait>.001)rows.push([e,"AIT WITHHELD",-ait,C.outflow,"AIT deducted from maturity payout"]);}continue;}
   rows.push([e,labels[e.event_type]||"UNKNOWN",e.amount,colors[e.event_type]||"",e.label]);
  }
  rows.forEach(([e,lbl,amount,col,desc],ri)=>{const acc=result.accounts[e.account_id]?.label||e.account_id||"",amountValue=["booking","outflow"].includes(e.event_type)?-Math.abs(amount):amount;let bal=Number(e.balance_after??0);
   if(e.event_type==="transfer"&&lbl.endsWith(" TO"))bal+=e.fee;
   else if(["cash_flow","maturity"].includes(e.event_type)){const b=refs.get(e.booking_ref),g=gross.get(e.booking_ref+"|"+date(e.on_date))??e.amount,ait=Math.max(0,g-e.amount);if(lbl==="MATURE PRINCIPAL"&&b)bal-=Math.max(0,e.amount-b.principal);else if(lbl!=="AIT WITHHELD"&&ait>.001)bal+=ait;}
   const balance=bal>=0?money(bal).padStart(14):"--".padStart(14);
   const sign=["carry_forward","idle"].includes(e.event_type)?"":amountValue>0?"+":amountValue<0?"-":"";
   const amountText=sign?sign+money(Math.abs(amountValue)).padStart(13):money(Math.abs(amountValue)).padStart(14);
   const row="  "+color(pad(ri===0?date(e.on_date):"",12),C.date,on)+" "+pad(acc,12)+" "+color(pad(lbl,typeWidth),col,on)+" "+color(amountText,col,on)+" "+balance+"   "+color(desc,C.desc,on);out.push(row);
  });if(di<keys.length-1)out.push(color(sep,C.sep,on));
 });out.push(line("="));return out.join("\n");
}
function bookingText(result){
 const out=[];if(!result.bookings?.length)return "  (no FD contracts were booked)";
 out.push("",line("-"),"  BOOKING LEDGER -- ALL FD CONTRACTS",line("-"));
 out.push("  "+pad("Ref",9)+" "+pad("Bank",12)+" "+pad("FD Type",9)+" "+pad("Option",23)+" "+pad("Payout",18)+" "+pad("Open",11)+" "+pad("Maturity",11)+" "+ "Principal".padStart(12)+" "+ "Interest".padStart(10)+" "+ "Total".padStart(12));
 out.push("  "+["-".repeat(9),"-".repeat(12),"-".repeat(9),"-".repeat(23),"-".repeat(18),"-".repeat(11),"-".repeat(11),"-".repeat(12),"-".repeat(10),"-".repeat(12)].join(" "));
 const abbr={cumulative:"Cumulative",periodic_interest:"Periodic",installment:"Installment"};
 result.bookings.forEach((b,i)=>{const ref="FD-"+String(i+1).padStart(4,"0"),bank=b.bank_id||b.bank_key||"-",type=b.option.is_efd?"eFD":"Standard",p=abbr[b.payout_type]||b.payout_type;
  if(b.payout_type==="cumulative")out.push("  "+pad(ref,9)+" "+pad(bank,12)+" "+pad(type,9)+" "+pad(b.option.label,23)+" "+pad(p,18)+" "+pad(date(b.start),11)+" "+pad(date(b.end),11)+" "+money(b.principal).padStart(12)+" "+money(b.total_interest).padStart(10)+" "+money(b.total_received).padStart(12));
  else{out.push("  "+pad(ref,9)+" "+pad(bank,12)+" "+pad(type,9)+" "+pad(b.option.label,23)+" "+pad(p,18)+" "+pad(date(b.start),11)+" "+pad(date(b.end),11)+" "+money(b.principal).padStart(12)+" "+" ".repeat(10)+" "+" ".repeat(12));(b.cash_flows||[]).forEach((f,j)=>{const last=j===b.cash_flows.length-1,lbl=last&&b.payout_type==="periodic_interest"?"capital+interest":last?"last instalment":"payment "+(j+1);out.push("  "+" ".repeat(9)+"   * "+pad(lbl,22)+" ".repeat(18)+" ".repeat(11)+" "+pad(date(f.date),11)+" ".repeat(12)+" ".repeat(10)+" "+money(f.amount).padStart(12));});}
 });out.push(line("-"));return out.join("\n");
}
export function formatSimulation(result,config,configPath,optionsPath,{color:useColor=Boolean(process.stdout?.isTTY&&!process.env.NO_COLOR),showEventTimeline=true,showBookingLedger=true}={}){
 const out=["",line("="),"  MULTI-BANK FIXED DEPOSIT INVESTMENT CALCULATOR",line("="),"  Config: "+configPath,"  FD options: "+optionsPath];
 const actualEnd=result.end_date??config.end;
 const days=Math.round((new Date(actualEnd)-new Date(config.start))/86400000)+1;
 out.push("  Window: "+date(config.start)+" -> "+date(actualEnd)+" ("+days+" days) | Method: "+(config.compound?"Compound":"Simple interest")+" ("+(config.actual_leap_year?"366d leap":"365d")+")","  Start date: "+date(config.start),"  Accounts:");
 for(const a of config.accounts)out.push("    - "+a.id+": "+a.label+" ["+a.bank_id+"] starting funds "+money(a.balance)+" LKR | eFD "+(a.supports_efd?"enabled":"disabled"));
 out.push("  AIT withholding: "+(config.ait_enabled?"enabled ("+(Number(config.ait_rate??.1)*100).toFixed(1)+"% of interest)":"disabled"),"  Transfer fees: inter-bank "+money(config.fee_config.default_inter_bank_fee)+" LKR | same-bank "+money(config.fee_config.same_bank_fee)+" LKR","  New-money inflows:");
 if(!config.inflow_summaries?.length)out.push("    - None");for(const x of config.inflow_summaries||[])out.push("    - "+x.name+": "+money(x.amount)+" LKR "+(x.type==="recurring"?"every "+x.interval+" from "+date(x.start_date)+" to "+date(x.end_date):"on "+(x.dates||[]).map(date).join(", "))+", account "+x.account_id+" | "+x.occurrences+" payments, "+money(x.total)+" LKR total");
 out.push("  Planned outflows:");if(!config.outflow_summaries?.length)out.push("    - None");for(const x of config.outflow_summaries||[])out.push("    - "+x.name+": "+money(x.amount)+" LKR x "+x.occurrences+" ("+x.payment_policy+") on "+(x.dates||[]).map(date).join(", "));
 const start=config.accounts.reduce((s,a)=>s+a.balance,0),inflows=(config.inflow_summaries||[]).reduce((s,x)=>s+x.total,0);
 out.push("  Starting funds: "+money(start)+" LKR | Scheduled new money: "+money(inflows)+" LKR | Total planned capital: "+money(start+inflows)+" LKR");
 if(showEventTimeline)out.push(timelineText(result,useColor));
 if(result.decision_log?.length){} // The legacy decision log is opt-in; CLI disables it by default.
 if(result.goal_outcome){
  const g=result.goal_outcome;
  out.push("",line("="),"  GOAL OUTCOME  [consolidation net interest]",line("-"));
  out.push(summaryLine("Goal Target",money(g.target)+" LKR",C.booking,useColor));
  out.push(summaryLine("Credited Net Interest",money(g.actual)+" LKR",g.achieved?C.cash:C.outflow,useColor));
  out.push(summaryLine("Status",g.achieved?"ACHIEVED":"NOT ACHIEVED",g.achieved?C.cash:C.outflow,useColor));
  out.push(summaryLine("Achievement Date",g.achievement_date??"—",C.date,useColor));
  out.push(summaryLine("Elapsed Days",g.elapsed_days===null?"—":String(g.elapsed_days),C.date,useColor));
  out.push(summaryLine(g.achieved?"Overshoot":"Remaining Shortfall",money(g.achieved?g.overshoot:g.shortfall)+" LKR",C.transfer,useColor));
  out.push("  Goal accounting counts first-time net interest credited to the consolidation account; principal is excluded.");
  if(result.search_diagnostics?.goal_candidates_evaluated!==undefined){
    out.push(summaryLine("Goal Candidates Evaluated",String(result.search_diagnostics.goal_candidates_evaluated),C.date,useColor));
    out.push(summaryLine("Invalid Goal Candidates",String(result.search_diagnostics.goal_invalid_candidates??0),C.outflow,useColor));
    out.push(summaryLine("Search Optimality",result.search_diagnostics.optimality_proven?"PROVEN":"NOT PROVEN (bounded search)",result.search_diagnostics.optimality_proven?C.cash:C.outflow,useColor));
  }
 }
  out.push("",line("="),"  GRAND SUMMARY  ["+result.strategy_name+"]",line("-"));
 const totalRet=result.total_principal>0?result.total_interest/result.total_principal*100:0,netRet=result.total_principal>0?result.net_interest_after_ait/result.total_principal*100:0,annual=xirr(result);
 out.push(summaryLine("Total Capital",money(result.total_principal)+" LKR",C.inflow,useColor),summaryLine("Gross Interest",money(result.total_interest)+" LKR",C.maturity,useColor),summaryLine("Transfer Fees","-"+money(result.total_transfer_fees)+" LKR",C.transfer,useColor),summaryLine(result.ait_enabled?"AIT ("+(result.ait_rate*100).toFixed(0)+"% of interest)":"AIT (disabled)","-"+money(result.ait_withheld)+" LKR",C.outflow,useColor));
 if(result.total_outflows_due){out.push(summaryLine("Total Outflows",money(result.total_outflows_due)+" LKR",C.outflow,useColor),summaryLine("Outflows Paid",money(result.total_outflows_paid)+" LKR",C.outflow,useColor));if(result.outstanding_outflows?.length){const n=result.outstanding_outflows.reduce((s,x)=>s+Number(x.remaining||0),0);out.push(summaryLine("Outstanding",money(n)+" LKR",C.outflow,useColor));for(const x of result.outstanding_outflows)out.push("    - "+(x.name||"Outflow")+" ["+(x.account_id||"")+"]: "+money(x.remaining)+" LKR ("+(x.payment_policy||"")+")");}}
 out.push(summaryLine(result.ait_enabled?"Net Interest (after AIT)":"Net Interest",money(result.net_interest_after_ait)+" LKR",C.cash,useColor),summaryLine(result.ait_enabled?"Net Yield (after AIT)":"Net Yield",netRet.toFixed(3)+"%",C.booking,useColor),summaryLine("Annualised Return",annual===null?"N/A":annual.toFixed(3)+"% p.a. (XIRR"+(result.ait_enabled?", after AIT":"")+")",C.maturity,useColor),summaryLine(result.ait_enabled?"Final Balance (after AIT)":"Final Balance",money(result.final_value_after_ait)+" LKR",C.idle,useColor));
 out.push("  "+(result.ait_enabled?"AIT withholding is applied to interest payouts before cash is reused.":"AIT is disabled; interest payouts are modelled gross."));
 if(result.total_outflows_due){out.push(summaryLine("Cash Retained",money(result.cash_retained)+" LKR",C.idle,useColor),summaryLine("Cash-Flow Net Worth",money(result.cash_flow_net_worth)+" LKR",C.outflow,useColor));}
 out.push("  "+color(pad("Valuation Date",34),C.desc,useColor)+" : "+date(result.end_date));
 if(result.total_decisions_evaluated!==null&&result.total_decisions_evaluated!==undefined)out.push("  "+color(pad("Decisions Evaluated",34),C.desc,useColor)+" : "+String(result.total_decisions_evaluated).padStart(14));
 if(result.alternative_leaf_net_interests?.length){const unique=[...new Set(result.alternative_leaf_net_interests)].sort((a,b)=>b-a);out.push("", "  Alternative Leaf Net Interests ("+result.alternative_leaf_net_interests.length.toLocaleString()+" non-best completed paths evaluated, "+unique.length.toLocaleString()+" distinct outcomes):");unique.slice(0,10).forEach((n,i)=>out.push("    - Leaf #"+String(i+1).padStart(2,"0")+" Net Interest : "+money(n).padStart(14)+" LKR  (diff vs best: "+((n-result.net_interest)>=0?"+":"")+money(n-result.net_interest)+")"));if(unique.length>10)out.push("      ... and "+(unique.length-10)+" more distinct leaf outcomes down to "+money(Math.min(...unique))+" LKR");}
 if(Object.keys(result.accounts||{}).length){out.push("","  Ending Balances by Account:");for(const a of Object.values(result.accounts))out.push("    - "+pad(a.label,20)+" ("+a.bank_key+"): "+money(a.balance).padStart(12));}
 out.push(line("="));if(showBookingLedger)out.push("",bookingText(result));
 return out.join("\n");
}
