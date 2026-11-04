import { REPORT_TEMPLATE, REPORT_CSS, REPORT_JS } from "./template.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[ch]));
const amount = value => Number(value ?? 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const money = value => "LKR " + amount(value);
const iso = value => {
  if (value instanceof Date) return value.toISOString().slice(0,10);
  const text = String(value ?? "");
  if (/^\d{8}$/.test(text)) return text.slice(0,4)+"-"+text.slice(4,6)+"-"+text.slice(6,8);
  return text.slice(0,10);
};
const dayCount = (a,b) => Math.round((Date.parse(iso(b)+"T00:00:00")-Date.parse(iso(a)+"T00:00:00"))/86400000);
const identity = value => String(value ?? "").trim().toUpperCase();
const payoutName = value => ({cumulative:"Cumulative",periodic_interest:"Periodic interest",installment:"Installment"}[value] || String(value ?? "—"));
const scheduleText = item => item.type === "recurring"
  ? "Every "+(item.interval || "—")+" · "+iso(item.start_date)+" to "+iso(item.end_date)
  : (item.dates || []).map(iso).join(", ");
const table = (title, columns, rows) => {
  const head = columns.map(([,label])=>"<th>"+esc(label)+"</th>").join("");
  const body = rows.length ? rows.map(row=>"<tr>"+columns.map(([key])=>"<td>"+esc(row[key] ?? "—")+"</td>").join("")+"</tr>").join("")
    : '<tr><td colspan="'+columns.length+'" class="empty">None configured</td></tr>';
  return '<details class="collapsible-table"><summary>'+esc(title)+' <span>'+rows.length+' rows · click to expand</span></summary><div class="table-wrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div></details>';
};
function xirr(result) {
  const flows = [];
  const byDate = new Map();
  for (const events of Object.values(result.timeline || {})) for (const event of events) {
    const d=iso(event.on_date);
    if (event.event_type==="inflow" && event.amount>0) byDate.set(d,(byDate.get(d)||0)-event.amount);
    if (event.event_type==="outflow" && event.amount<0) byDate.set(d,(byDate.get(d)||0)-event.amount);
  }
  const opening = Math.max(0, Number(result.total_principal||0)-[...byDate.values()].reduce((s,v)=>s+Math.max(0,-v),0));
  const dates=[...byDate.keys()].sort();
  if(opening>0 && dates.length) byDate.set(dates[0],(byDate.get(dates[0])||0)-opening);
  for(const [d,v] of byDate) if(v) flows.push([d,v]);
  const terminal=Number(result.final_value??0)-Number(result.total_outflows_paid||0)-
    (result.outstanding_outflows||[]).reduce((s,x)=>s+Number(x.remaining||0),0);
  flows.push([iso(result.end_date),terminal]);
  if(!flows.some(([,v])=>v<0)) return null;
  const origin=Math.min(...flows.map(([d])=>Date.parse(d+"T00:00:00")));
  const dated=flows.map(([d,v])=>[(Date.parse(d+"T00:00:00")-origin)/86400000/365,v]);
  const npv=r=>dated.reduce((s,[t,v])=>s+v/Math.pow(1+r,t),0);
  let lo=-.999999,hi=1,lv=npv(lo),hv=npv(hi);
  while(lv*hv>0&&hi<1e6){hi=hi*2+1;hv=npv(hi);}
  if(lv*hv>0)return null;
  for(let i=0;i<160;i++){const mid=(lo+hi)/2,mv=npv(mid);if(Math.abs(mv)<1e-8)return mid*100;if(lv*mv<=0){hi=mid;hv=mv;}else{lo=mid;lv=mv;}}
  return (lo+hi)/2*100;
}
function bankNamesFromConfig(config) {
  const source=config.bank_registry||config.bankRegistry||{};
  return Object.fromEntries(Object.entries(source).map(([id,row])=>[id,typeof row==="string"?row:row?.name||id]));
}
export function buildAccountChart(result,config,start,end,openingBalances) {
  const accounts=Object.values(result.accounts||{});
  const names=bankNamesFromConfig(config);
  const bankLabel=id=>names[id]||String(id||"").replace(/^LK_/,"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  const consolidation=config.consolidation_account_id||"";
  const main=result.accounts?.[consolidation];
  const mainBank=identity(main?.bank_id||main?.bank_key);
  const compareCasefold=(a,b)=>String(a??"").localeCompare(String(b??""),"en",{sensitivity:"base"})||String(a??"").localeCompare(String(b??""));
  const banks=[...new Set(accounts.map(a=>identity(a.bank_id||a.bank_key)).filter(Boolean))]
    .sort((a,b)=>compareCasefold(bankLabel(a),bankLabel(b)));
  if(mainBank&&banks.includes(mainBank)){banks.splice(banks.indexOf(mainBank),1);banks.unshift(mainBank);}
  const bankOrder=new Map(banks.map((b,i)=>[b,i]));
  accounts.sort((a,b)=>(a.id===consolidation?-1:b.id===consolidation?1:0)||
    (bankOrder.get(identity(a.bank_id||a.bank_key))??999)-(bankOrder.get(identity(b.bank_id||b.bank_key))??999)||
    compareCasefold(a.label||"",b.label||"")||
    String(a.id??"").localeCompare(String(b.id??"")));
  const hsv=(h,s,v)=>{h=((h%1)+1)%1*6;const i=Math.floor(h),f=h-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),rgb=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];return "#"+rgb.map(x=>Math.round(x*255).toString(16).padStart(2,"0")).join("");};
  const accountSeries=[],fdSeries=[],firstHue=new Map(),fdColor=new Map();
  accounts.forEach((a,i)=>{
    const bank=identity(a.bank_id||a.bank_key),hue=(220-185*i/Math.max(1,accounts.length-1))/360;
    const brightness=a.id===consolidation?1:0.8;
    accountSeries.push({name:a.label||a.id,seriesType:"account",accountId:a.id,bankId:bank,points:[],
      color:hsv(hue,1,brightness),lineStyle:a.id===consolidation?"solid":bank===mainBank?"dashed":"dotted"});
    if(bank&&!firstHue.has(bank)){firstHue.set(bank,hue);fdColor.set(bank,hsv(hue,0.5,0.5));}
  });
  const bookedBanks=[...new Set((result.bookings||[]).map(b=>identity(b.bank_id||b.option?.bank_identity||b.bank_key)).filter(Boolean))]
    .sort((a,b)=>(bankOrder.get(a)??999)-(bankOrder.get(b)??999));
  for(const bank of bookedBanks)fdSeries.push({name:bankLabel(bank)+" · FD principal",seriesType:"fd_principal",bankId:bank,points:[],color:fdColor.get(bank)||"#808080",lineStyle:bank===mainBank?"solid":"dotted"});
  const cash=Object.fromEntries(accounts.map(a=>[a.id,Number(openingBalances[a.id]??a.balance??0)]));
  const fd=Object.fromEntries(banks.map(b=>[b,0]));
  for(const booking of result.bookings||[]){const bank=identity(booking.bank_id||booking.option?.bank_identity||booking.bank_key);if(bank&&iso(booking.start)<iso(start)&&iso(booking.end)>=iso(start))fd[bank]=(fd[bank]||0)+booking.principal;}
  const bookingEvents=Object.values(result.timeline||{}).flat().filter(e=>e.event_type==="booking");
  const bookingByRef=new Map((result.bookings||[]).map((b,i)=>["FD-"+String(i+1).padStart(4,"0"),b]));
  const stages=[];let seq=0;
  const append=(date,stage,event)=>{seq++;const point={x:seq,date,stage:"S"+stage,event};stages.push(point);
    for(const s of accountSeries)s.points.push({...point,y:Math.round((cash[s.accountId]||0)*100)/100});
    for(const s of fdSeries)s.points.push({...point,y:Math.round((fd[s.bankId]||0)*100)/100});};
  const keys=typeof result.sorted_dates==="function"?result.sorted_dates():Object.keys(result.timeline||{}).sort();
  for(const key of keys){
    const events=result.timeline[key]||[],date=events.length?iso(events[0].on_date):String(key);
    if(date<iso(start)||date>iso(end))continue;
    let stage=0;
    for(const e of events){
      const id=e.account_id,amt=Number(e.amount||0),label=e.label||e.event_type;
      if(e.event_type==="inflow"){cash[id]=(cash[id]||0)+amt;append(date,++stage,label);}
      else if(e.event_type==="outflow"&&amt<0){cash[id]=(cash[id]||0)+amt;append(date,++stage,label);}
      else if(e.event_type==="booking"){
        cash[id]=(cash[id]||0)-Math.abs(amt);const bank=identity(e.bank_id||e.bank_key||bookingByRef.get(e.booking_ref)?.bank_id);
        if(bank)fd[bank]=(fd[bank]||0)+Math.abs(amt);append(date,++stage,label);
      } else if(e.event_type==="cash_flow"||e.event_type==="maturity"){
        cash[id]=(cash[id]||0)+amt;
        if(e.event_type==="maturity"){const b=bookingByRef.get(e.booking_ref),bank=identity(b?.bank_id||b?.option?.bank_identity||b?.bank_key||e.bank_id||e.bank_key);if(bank&&b)fd[bank]=Math.max(0,(fd[bank]||0)-b.principal);}
        append(date,++stage,label);
      } else if(e.event_type==="transfer"){
        if(label.startsWith("Transfer to ")||label.startsWith("Final sweep to ")){
          cash[id]=(cash[id]||0)-Math.abs(amt);const channel=e.transfer_channel==="intra_bank"?"INTRA-BANK":"INTER-BANK";
          append(date,++stage,channel+" TO");if(e.fee>0){cash[id]=(cash[id]||0)-e.fee;append(date,++stage,channel+" TF");}
        }else if(label.startsWith("Transfer received")||label.startsWith("Final sweep received")){
          cash[id]=(cash[id]||0)+amt;append(date,++stage,e.transfer_channel==="intra_bank"?"INTRA-BANK TI":"INTER-BANK TI");
        }
      }
    }
  }
  return {accounts:accountSeries,fd_principal:fdSeries,stages};
}
function buildLedger(result) {
  const bookingByRef=new Map((result.bookings||[]).map((b,i)=>["FD-"+String(i+1).padStart(4,"0"),b]));
  const grossByRefDate=new Map();
  for(const [ref,b] of bookingByRef)for(const f of b.cash_flows||[])grossByRefDate.set(ref+"|"+iso(f.date),f.amount);
  const rows=[];let lastDay=null,lastGroup=null;
  const append=(event,label,value,description,balance,kind,group)=>{
    const date=iso(event.on_date),newDay=date!==lastDay;
    const cls=lastDay===null?"":newDay?"event-day-start":group!==lastGroup?"event-subgroup-start":"event-item-start";
    const signed=value>0?"+"+amount(value):amount(value);
    rows.push('<tr'+(cls?' class="'+cls+'"':'')+'><td class="event-date">'+(newDay?date:"")+'</td><td>'+esc(result.accounts?.[event.account_id]?.label||event.account_id||"—")+'</td><td><span class="event-pill '+kind+'">'+esc(label)+'</span></td><td class="num event-amount '+kind+'">'+signed+'</td><td>'+esc(description)+'</td><td class="num">'+money(balance)+'</td></tr>');
    lastDay=date;lastGroup=group;
  };
  const keys=typeof result.sorted_dates==="function"?result.sorted_dates():Object.keys(result.timeline||{}).sort();
  for(const key of keys)for(const e of result.timeline[key]||[]){
    if(e.event_type==="inflow"&&e.amount===0&&e.label==="Opening balance trigger")continue;
    const b=bookingByRef.get(e.booking_ref),gross=grossByRefDate.get(e.booking_ref+"|"+iso(e.on_date))??e.amount;
    if(e.event_type==="booking"){append(e,"BOOK",-Math.abs(e.amount),e.label,e.balance_after,"booking","FD BOOKINGS");continue;}
    if(e.event_type==="transfer"){
      const channel=e.transfer_channel==="intra_bank"?"INTRA-BANK":"INTER-BANK";
      const outgoing=e.label.startsWith("Transfer to ")||e.label.startsWith("Final sweep to ");
      if(outgoing){append(e,channel+" TO",-(e.amount-e.fee),e.label,Number(e.balance_after)+Number(e.fee),"transfer-to",channel+" TRANSFERS");
        if(e.fee>0)append(e,channel+" TF",-e.fee,"Transfer fee for "+e.label,e.balance_after,"outflow",channel+" TRANSFERS");}
      else append(e,channel+" TI",e.amount,e.label,e.balance_after,"transfer",channel+" TRANSFERS");
      continue;
    }
    if(b&&(e.event_type==="cash_flow"||e.event_type==="maturity")){
      const ait=result.ait_enabled?Math.max(0,gross-e.amount):0;
      if(e.event_type==="cash_flow"){
        const label=b.payout_type==="periodic_interest"?(String(b.option.payout_period_str||"").toLowerCase().startsWith("y")?"YEAR INTEREST":"MONTH INTEREST"):"INSTALLMENT";
        const group=(b.payout_type==="periodic_interest"?"PERIODIC INTEREST PAYOUT":"INSTALLMENT PAYOUT")+(ait>.005?" · AIT":"");
        append(e,label,gross,e.label,Number(e.balance_after)+ait,"cash_flow",group);
      }else if(["cumulative","periodic_interest"].includes(b.payout_type)){
        const netInterest=e.amount-b.principal,grossInterest=gross-b.principal,group="FD MATURITY · PRINCIPAL · INTEREST · AIT";
        append(e,"MATURE PRINCIPAL",b.principal,"Principal returned "+e.booking_ref,Number(e.balance_after)-Math.max(0,netInterest),"mature-principal",group);
        if(grossInterest>0)append(e,"MATURE INTEREST",grossInterest,"Interest paid at maturity "+e.booking_ref,Number(e.balance_after)+ait,"cash_flow",group);
      }else append(e,"MATURE CASH FLOW",gross,e.label,Number(e.balance_after)+ait,"maturity","FD MATURITY · CASH FLOW · AIT");
      if(ait>.005)append(e,"AIT WITHHELD",-ait,"AIT deducted from interest payout",e.balance_after,"ait","FD MATURITY · PRINCIPAL · INTEREST · AIT");
      continue;
    }
    const labels={inflow:"INFLOW",outflow:"OUTFLOW",carry_forward:"CARRY FORWARD",idle:"IDLE"};
    const groups={inflow:"AVAILABLE CAPITAL · INFLOWS",outflow:"CASH REQUIREMENTS · OUTFLOWS",carry_forward:"RETAINED CASH · NO TRANSACTION",idle:"IDLE / UNALLOCATED CASH"};
    append(e,labels[e.event_type]||e.event_type.toUpperCase(),e.amount,e.label,e.balance_after,e.event_type,groups[e.event_type]||"OTHER LEDGER EVENTS");
  }
  return rows;
}
function buildExecution(result,accountDisplay) {
  const events=Object.values(result.timeline||{}).flat(),bookingEvents=events.filter(e=>e.event_type==="booking");
  const byDay=new Map();
  for(const e of events){const d=iso(e.on_date);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(e);}
  const cards=[],investmentRows=[];
  for(const [date,dayEvents] of [...byDay].sort((a,b)=>a[0].localeCompare(b[0]))){
    const dayBookings=bookingEvents.filter(e=>iso(e.on_date)===date);
    const transfers=dayEvents.filter(e=>e.event_type==="transfer"&&(e.label.startsWith("Transfer to ")));
    const unique=[],seen=new Set();
    for(const t of transfers){const k=[t.account_id,t.label,t.amount,t.fee].join("|");if(!seen.has(k)){seen.add(k);unique.push(t);}}
    const carries=dayEvents.filter(e=>e.event_type==="carry_forward");
    const actionParts=[];
    unique.forEach((t,i)=>{
      const source=accountDisplay[t.account_id]||t.account_id;
      const destLabel=t.label.slice("Transfer to ".length).split(" (Amt:")[0];
      const dest=Object.values(accountDisplay).find(v=>v.startsWith(destLabel+" · "))||destLabel;
      const channel=t.transfer_channel==="intra_bank"?"Same-bank transfer":"Inter-bank CEFT";
      actionParts.push('<div class="instruction transfer-instruction"><div class="instruction-title"><span>STEP '+(i+1)+'</span> Transfer funds</div><div class="route"><div><small>FROM · SOURCE ACCOUNT</small><b>'+esc(source)+'</b></div><span class="route-arrow">→</span><div><small>TO · DESTINATION ACCOUNT</small><b>'+esc(dest)+'</b></div></div><div class="instruction-meta"><span><small>Transfer amount</small><b>'+money(t.amount-t.fee)+'</b></span><span><small>Estimated fee</small><b class="negative">'+money(t.fee)+'</b></span><span><small>Transfer method</small><b>'+esc(channel)+'</b></span></div></div>');
    });
    dayBookings.forEach((e,i)=>{
      const ref=e.booking_ref,b=result.bookings.find((x,j)=>"FD-"+String(j+1).padStart(4,"0")===ref);
      if(!b)return;
      const account=result.accounts[b.account_id],accountName=account?.label||b.account_id;
      const start=iso(b.start),maturity=iso(b.end),product=b.option.label,fdType=b.option.is_efd?"eFD":"Standard FD";
      const gross=b.total_interest,netFlows=b.option.applyAITToCashFlows(b.principal,b.cash_flows,result.ait_enabled?result.ait_rate:0);
      const netInterest=netFlows.reduce((s,f)=>s+f.amount,0)-b.principal,ait=gross-netInterest;
      const step=unique.length+i+1;
      actionParts.push('<div class="instruction booking-instruction"><div class="instruction-title"><span>STEP '+step+'</span> Open the fixed deposit</div><div class="detail-grid"><div><small>Account</small><b>'+esc(accountName)+'</b></div><div><small>Product</small><b>'+esc(product)+' · '+fdType+'</b></div><div><small>Investment amount</small><b>'+money(b.principal)+'</b></div><div><small>Rate / term</small><b>'+Number(b.option.annual_rate).toFixed(3)+'% p.a. · '+esc(b.option.period_str)+'</b></div><div><small>Booking → maturity</small><b>'+start+' → '+maturity+'</b></div><div><small>Payout</small><b>'+esc(payoutName(b.payout_type))+'</b></div></div></div>');
      investmentRows.push({account:accountName,product:product+" · "+fdType,principal:amount(b.principal),rate:Number(b.option.annual_rate).toFixed(3)+"%",term:b.option.period_str,booking:start,maturity,gross:amount(gross),ait:amount(ait),net:amount(netInterest)});
      const context=bookingEvents.find(x=>x.booking_ref===ref)?.decision_context||{};
    });
    const title=dayBookings.length?(unique.length?(dayBookings.length>1?"Transfer funds and open multiple FDs":"Transfer funds and open an FD"):(dayBookings.length>1?"Open multiple FDs across accounts":"Open an FD using available funds")):(unique.length?"Transfer funds between accounts":"Keep funds available");
    const reasons=[];
    if(dayBookings.length)reasons.push("Selected as part of the highest-value feasible "+result.strategy_name+" path.");
    if(carries.length)reasons.push("Liquidity was retained because no suitable booking was selected at this decision point.");
    if(unique.length)reasons.push("Transfers account for the applicable same-bank or inter-bank fees.");
    const retained=carries.map(e=>result.accounts?.[e.account_id]?.label||e.account_id);
    const carryHtml=carries.length&&!dayBookings.length?'<div class="retained-note"><b>No FD booking required.</b> Keep available cash in '+esc([...new Set(retained)].join(", "))+' until the next liquidity checkpoint.</div>':"";
    const bookingHtml=actionParts.slice(unique.length).join("");
    const expected=dayBookings.map(e=>{
      const b=result.bookings.find((x,j)=>"FD-"+String(j+1).padStart(4,"0")===e.booking_ref);if(!b)return "";
      const net=b.option.applyAITToCashFlows(b.principal,b.cash_flows,result.ait_enabled?result.ait_rate:0).reduce((s,f)=>s+f.amount,0)-b.principal;
      return '<div class="expected"><b>'+esc(e.booking_ref)+' expected outcome</b><span>Gross interest '+money(b.total_interest)+'</span><span>AIT <b class="negative">'+money(b.total_interest-net)+'</b></span><span>Net interest <b class="positive">'+money(net)+'</b></span><span>Maturity <b>'+iso(b.end)+'</b></span></div>';
    }).join("");
    const balances=dayBookings[0]?.decision_context?.balances_before||carries[0]?.decision_context?.balances_before||{};
    const chips=Object.entries(balances).map(([id,v])=>'<span class="chip">'+esc(result.accounts?.[id]?.label||id)+': '+money(v)+'</span>').join("");
    const checkpoint=dayEvents.find(e=>e.event_type==="maturity"||e.event_type==="cash_flow"||e.event_type==="inflow"||e.event_type==="outflow");
    cards.push('<details class="decision"><summary class="decision-head"><span class="step">DECISION '+String(cards.length+1).padStart(2,"0")+'</span><span class="date">'+date+'</span><h3>'+esc(title)+'</h3><span class="decision-toggle" aria-hidden="true"></span></summary><div class="decision-body"><h4>Action required</h4>'+(!dayBookings.length&&carries.length?'<p class="muted">Strategy classification: Carry cash forward.</p>':"")+(actionParts.join("")||carryHtml||'<p class="muted">No external bank action is required at this point.</p>')+(reasons.length?'<h4>Why this decision</h4><ul class="compact">'+reasons.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":"")+expected+(chips?'<h4>Balances before decision</h4><div class="chips">'+chips+'</div>':"")+'<p class="checkpoint"><b>Next checkpoint:</b> '+esc(checkpoint?iso(checkpoint.on_date)+" · "+checkpoint.label:"Investment horizon ends "+iso(result.end_date))+'</p></div></details>');
  }
  return {html:cards.join("")||'<div class="panel">No FD bookings or actionable transfers were selected.</div>',investmentRows};
}
export function generateHtmlReport(result,config) {
  const start=iso(config.start),end=iso(config.end),days=dayCount(start,end)+1;
  const accountDisplay={};
  for(const a of Object.values(result.accounts||{})){
    const bankId=a.bank_id||a.bank_key||"Bank";
    const bank=bankNamesFromConfig(config)[bankId]||String(bankId).replace(/^LK_/,"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
    accountDisplay[a.id]=(a.label||a.id)+" · "+bank;
  }
  const configured=Array.isArray(config.accounts)?config.accounts:Object.values(config.accounts||{});
  const openingBalances=Object.fromEntries(configured.map(a=>[a.id,Number(a.balance||0)]));
  const bankNames=bankNamesFromConfig(config);
  const accountRows=Object.values(result.accounts||{}).map(a=>({label:a.label||a.id,id:a.id,bank:bankNames[a.bank_id||a.bank_key]||String(a.bank_id||a.bank_key||"").replace(/^LK_/,"").replaceAll("_"," "),balance:amount(openingBalances[a.id]??a.balance),efd:a.supports_efd?"Enabled":"Standard FD only",role:a.id===config.consolidation_account_id?"Consolidation account":"Investment account"}));
  const inflows=(config.inflow_summaries||[]).map(x=>({name:x.name,amount:amount(x.amount),schedule:scheduleText(x),account:result.accounts?.[x.account_id]?.label||x.account_id,occurrences:x.occurrences,total:amount(x.total)}));
  const outflows=(config.outflow_summaries||[]).map(x=>({name:x.name,amount:amount(x.amount),schedule:scheduleText(x),account:result.accounts?.[x.account_id]?.label||x.account_id,occurrences:x.occurrences,total:amount(x.total),policy:x.payment_policy||"—"}));
  const accountTable=table("Accounts",[["label","Account"],["id","Account ID"],["bank","Bank"],["balance","Opening balance (LKR)"],["efd","eFD capability"],["role","Role"]],accountRows);
  const inflowTable=table("Planned inflows",[["name","Inflow"],["amount","Per occurrence (LKR)"],["schedule","Schedule"],["account","Credit account"],["occurrences","Count"],["total","Total (LKR)"]],inflows);
  const outflowTable=table("Planned outflows",[["name","Outflow"],["amount","Per occurrence (LKR)"],["schedule","Schedule"],["account","Debit account"],["occurrences","Count"],["total","Total (LKR)"],["policy","Payment policy"]],outflows);
  const execution=buildExecution(result,accountDisplay);
  const investmentTable=table("Selected fixed deposits",[["account","Account"],["product","FD product"],["principal","Principal (LKR)"],["rate","Rate"],["term","Term"],["booking","Booking date"],["maturity","Maturity"],["gross","Gross interest (LKR)"],["ait","AIT (LKR)"],["net","Net interest (LKR)"]],execution.investmentRows);
  const capitalRows=[];
  for(const events of Object.values(result.timeline||{}))for(const e of events){
    const label=result.accounts?.[e.account_id]?.label||e.account_id||"—";
    if(e.event_type==="transfer"&&e.label.startsWith("Transfer to "))capitalRows.push({date:iso(e.on_date),movement:"Account transfer",source:label,destination:e.label.slice(12).split(" (Amt:")[0],amount:amount(e.amount),fee:amount(e.fee)});
    else if(e.event_type==="booking")capitalRows.push({date:iso(e.on_date),movement:"FD booking",source:label,destination:e.label,amount:amount(Math.abs(e.amount)),fee:"—"});
  }
  const capitalTable=table("Movement records",[["date","Date"],["movement","Movement"],["source","From / account"],["destination","To / product"],["amount","Amount (LKR)"],["fee","Fee (LKR)"]],capitalRows);
  const ledgerRows=buildLedger(result);
  const fee=config.fee_config||{};
  const xirrValue=xirr(result),gross=Number(result.total_interest||0),ait=Number(result.ait_withheld||0),fees=Number(result.total_transfer_fees||0),net=Number(result.net_interest??result.net_interest_after_ait??gross-ait-fees);
  const totalCapital=Number(result.total_principal||0),yieldPct=totalCapital?net/totalCapital*100:0;
  const overview='<div class="overview-grid">'+
    '<article class="panel"><small>Simulation window</small><strong>'+start+' → '+end+'</strong><p>'+days+' calendar days</p></article>'+
    '<article class="panel"><small>Strategy</small><strong>'+esc(result.strategy_name)+'</strong><p>Selected simulation path</p></article>'+
    '<article class="panel"><small>Interest calculation</small><strong>'+(config.compound?"Compound":"Simple")+'</strong><p>'+(config.actual_leap_year?"Actual leap-year basis":"365-day basis")+'</p></article>'+
    '<article class="panel"><small>Tax treatment</small><strong>'+(result.ait_enabled?"AIT · "+(result.ait_rate*100).toFixed(1)+"%":"AIT disabled")+'</strong><p>Applied to interest payouts</p></article>'+
    '<article class="panel"><small>Consolidation account</small><strong>'+esc(accountDisplay[config.consolidation_account_id]||config.consolidation_account_id||"—")+'</strong><p>Terminal cash destination</p></article>'+
    '<article class="panel"><small>Default transfer fees</small><strong>'+money(fee.default_inter_bank_fee||0)+'</strong><p>Inter-bank · Same-bank '+money(fee.same_bank_fee||0)+'</p></article></div>';
  const warning=result.outstanding_outflows?.length?'<p class="warning">Outstanding outflows remain: '+esc(result.outstanding_outflows.map(x=>x.name+" "+amount(x.remaining)).join("; "))+'</p>':"";
  const outcome='<div class="equation-panel"><b>Net interest reconciliation</b><div class="equation">'+
    '<div><small>Gross interest (LKR)</small><strong class="positive">'+amount(gross)+'</strong></div><span>−</span>'+
    '<div><small>AIT withheld (LKR)</small><strong class="negative">'+amount(ait)+'</strong></div><span>−</span>'+
    '<div><small>Transfer fees (LKR)</small><strong class="negative">'+amount(fees)+'</strong></div><span>=</span>'+
    '<div class="equation-result"><small>Net interest (LKR)</small><strong>'+amount(net)+'</strong></div></div>'+
    '<p class="muted">Net interest = gross interest − AIT − transfer fees. AIT is withheld from interest; transfer fees are deducted from cash.</p></div>'+
    '<div class="outcome-grid"><div class="outcome-metric"><small>Total capital contributed (LKR)</small><strong>'+amount(totalCapital)+'</strong><p>Opening funds plus scheduled deposits.</p></div>'+
    '<div class="outcome-metric"><small>Final simulated portfolio value (LKR)</small><strong>'+amount(result.final_value??0)+'</strong><p>Cash and investment value at the end of the simulation.</p></div>'+
    '<div class="outcome-metric"><small>Net return on contributed capital</small><strong>'+yieldPct.toFixed(3)+'%</strong><p>Net interest divided by total contributed capital.</p></div>'+
    '<div class="outcome-metric"><small>Annualised money-weighted return</small><strong>'+(xirrValue===null?"N/A":xirrValue.toFixed(3)+"% p.a.")+'</strong><p>XIRR accounts for the timing of deposits and withdrawals.</p></div></div>'+warning;
  const flowTotals=new Map();
  const flowStyles={
    "Inflow (Deposits)":"#82aaff",
    "Transfer Out (TF)":"#ef7777",
    "Transfer In (TI)":"#56d8e8",
    "FD Maturity (Principal)":"#f08ab5",
    "FD Booking":"#d78bfa",
    "FD Interest":"#55c99a",
    "FD Installment":"#55c99a",
    "AIT":"#d55e00",
    "Outflows":"#ef7777",
    "Transfer Fees":"#c84b31"
  };
  const bookingByRef=new Map((result.bookings||[]).map((b,i)=>["FD-"+String(i+1).padStart(4,"0"),b]));
  const grossByRefDate=new Map();
  for(const [ref,b] of bookingByRef)for(const f of b.cash_flows||[])grossByRefDate.set(ref+"|"+iso(f.date),Number(f.amount||0));
  const addFlow=(category,date,value)=>{
    if(!category||Math.abs(value)<.005)return;
    if(!flowTotals.has(category))flowTotals.set(category,new Map());
    const values=flowTotals.get(category),d=iso(date);
    values.set(d,(values.get(d)||0)+value);
  };
  for(const events of Object.values(result.timeline||{}))for(const e of events){
    const date=iso(e.on_date),value=Number(e.amount||0),booking=bookingByRef.get(e.booking_ref);
    if(e.event_type==="inflow")addFlow("Inflow (Deposits)",date,value);
    else if(e.event_type==="outflow"&&value<0)addFlow("Outflows",date,value);
    else if(e.event_type==="booking")addFlow("FD Booking",date,-Math.abs(value));
    else if(e.event_type==="transfer"){
      const outgoing=e.label.startsWith("Transfer to ")||e.label.startsWith("Final sweep to ");
      if(outgoing){
        addFlow("Transfer Out (TF)",date,-Math.max(0,Math.abs(value)-Number(e.fee||0)));
        if(Number(e.fee||0)>0)addFlow("Transfer Fees",date,-Number(e.fee));
      }else addFlow("Transfer In (TI)",date,value);
    }else if(booking&&(e.event_type==="cash_flow"||e.event_type==="maturity")){
      const gross=grossByRefDate.get(e.booking_ref+"|"+date)??value;
      const ait=result.ait_enabled?Math.max(0,gross-value):0;
      if(booking.payout_type==="installment")addFlow("FD Installment",date,gross);
      else if(e.event_type==="maturity"){
        addFlow("FD Maturity (Principal)",date,booking.principal);
        addFlow("FD Interest",date,Math.max(0,gross-Number(booking.principal||0)));
      }else addFlow("FD Interest",date,gross);
      if(ait>.005)addFlow("AIT",date,-ait);
    }else if(e.event_type==="cash_flow")addFlow("FD Interest",date,value);
    else if(e.event_type==="maturity")addFlow("FD Maturity (Principal)",date,value);
  }
  const cashflows=[...flowTotals].map(([name,values])=>({name,color:flowStyles[name]||"#9ba8b8",points:[...values].sort((a,b)=>a[0].localeCompare(b[0])).map(([x,y])=>({x,y}))}));
  const maturities=(result.bookings||[]).map(b=>({name:b.option.label+" · "+b.account_id,start:iso(b.start),end:iso(b.end),principal:b.principal,interest:b.total_interest,rate:b.option.annual_rate}));
  const accountChart=buildAccountChart(result,config,start,end,openingBalances);
  const chartData={...accountChart,cashflows,maturities,grossInterest:gross,returns:[{name:"Net interest",value:net,color:"#55c99a"},{name:"Transfer fees",value:fees,color:"#ef7777"},{name:"AIT withheld",value:ait,color:"#e9ad58"}]};
  const chartJson=JSON.stringify(chartData).replace(/<\//g,"<\\/");
  const ledger='<details class="collapsible-table"><summary>Ledger entries <span>'+ledgerRows.length+' rows · expand</span></summary><div class="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Event</th><th class="num">Amount (LKR)</th><th>Description</th><th class="num">Balance after (LKR)</th></tr></thead><tbody>'+(ledgerRows.join("")||'<tr><td colspan="6" class="empty">No events</td></tr>')+'</tbody></table></div></details>';
  const replacements={
    "{{REPORT_TITLE}}":"FD Cal · Simulation Report",
    "{{REPORT_PERIOD}}":start+" — "+end+" · "+days+" calendar days · "+result.strategy_name+" strategy",
    "{{OVERVIEW_CONTENT}}":overview,
    "{{OUTCOME_CONTENT}}":outcome,
    "{{EXECUTION_CONTENT}}":execution.html,
    "{{PORTFOLIO_CONTENT}}":accountTable+investmentTable,
    "{{CASHFLOW_CONTENT}}":'<div class="grid2"><div>'+inflowTable+'</div><div>'+outflowTable+'</div></div>',
    "{{ANALYTICS_CONTENT}}":'<div class="chart-grid"><article class="chart-panel"><h3>Account cash and bank FD principal</h3><canvas id="account-chart" aria-label="Intra-day account cash and bank fixed deposit principal by event stage"></canvas><p class="muted">Each plotted stage is the state immediately after a ledger event. Account lines show liquid cash; bank FD lines aggregate outstanding principal only. Interest is excluded from FD principal.</p></article><article class="chart-panel"><h3>Cash movement timeline</h3><canvas id="cashflow-chart" aria-label="Cash movement timeline"></canvas><p class="muted">Positive values are receipts; negative values are uses of cash. Shift + wheel scales vertically; Alt + wheel scales horizontally around the cursor. Use Reset view to restore the full timeline.</p></article><article class="chart-panel"><h3>FD maturity schedule</h3><canvas id="maturity-chart" aria-label="FD booking and maturity schedule"></canvas><p class="muted">Bars span each contract booking date to maturity.</p></article><article class="chart-panel"><h3>Return composition</h3><canvas id="returns-chart" aria-label="Net return composition"></canvas><p class="muted">Gross interest is split into net interest retained, transfer fees and AIT withheld.</p></article></div>',
    "{{PORTFOLIO_AUDIT_CONTENT}}":capitalTable,
    "{{LEDGER_CONTENT}}":ledger,
    "{{CHART_DATA}}":chartJson
  };
  let html=REPORT_TEMPLATE.replace("{{REPORT_CSS}}",REPORT_CSS).replace("{{REPORT_JS}}",REPORT_JS);
  for(const [token,value] of Object.entries(replacements))html=html.replaceAll(token,value);
  return html;
}
