import {parseCSV} from "../io/csv.js";
import {escapeHtml as esc} from "./escape-html.js";
import {FDOption} from "../core/models.js";
import {addPeriod,formatISODate} from "../core/dates.js";
import {validateConfiguration,resolveDate} from "../core/configuration.js?v=age-eligibility-1";
import {validateConfigurationShape} from "../core/config-schema.js?v=age-eligibility-1";
import {SimulationWorkerRunner,simulationFingerprint,catalogueFingerprint,createWorkerPayload,rehydrateSimulationResult} from "./simulation-runner.js";
import {animateRemoval,animateNewRows,animateEntrance,transitionStrategySettings,scrollElementIntoView} from "./motion.js";
import {generateHtmlReport} from "../reporting/html.js";
const DATA_ROOT=new URL(import.meta.url).pathname.includes("/src/web/")?"../../data/":"../data/";
const $=id=>document.getElementById(id),STORAGE_KEY="fd-cal:draft:v1",S={banks:{},index:{},keys:{},cache:new Map(),lastSimulationKey:null,accounts:[],inflows:[],outflows:[],url:null,raw:null,workerRunner:new SimulationWorkerRunner(),activeRunId:0,submissionSequence:0,isPreparing:false,formEditedWhileRunning:false,computeStartedAt:null,computeTimer:null};
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));let fieldErrorSequence=0;
function elapsedLabel(milliseconds){const total=Math.max(0,Math.floor(milliseconds/1000)),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;return hours?[hours,minutes,seconds].map(value=>String(value).padStart(2,"0")).join(":"):[minutes,seconds].map(value=>String(value).padStart(2,"0")).join(":")}
function updateElapsedTimer(){if(S.computeStartedAt===null)return;const timer=$("simulation-elapsed");timer.textContent="Elapsed "+elapsedLabel(performance.now()-S.computeStartedAt)}
function startElapsedTimer(restart=false){if(restart)stopElapsedTimer();if(S.computeTimer!==null)return;S.computeStartedAt=performance.now();$("simulation-elapsed").hidden=false;updateElapsedTimer();S.computeTimer=setInterval(updateElapsedTimer,250)}
function stopElapsedTimer(){const elapsed=S.computeStartedAt===null?0:performance.now()-S.computeStartedAt;if(S.computeTimer!==null)clearInterval(S.computeTimer);S.computeTimer=null;S.computeStartedAt=null;const timer=$("simulation-elapsed");if(timer){timer.hidden=true;timer.textContent=""}return elapsed}
function markFormEdited(){if(!S.isPreparing&&!S.workerRunner.active)return;S.formEditedWhileRunning=true;$("simulation-edit-note").hidden=false}
function syncStrategySettings(strategy=$("strategy-choice").value){
 const greedy=strategy==="greedy";
 const gaml=strategy==="gaml";
 transitionStrategySettings(gaml?"gaml-settings-panel":greedy?"greedy-settings":"gss-settings");
 $("strategy-description").textContent=gaml
  ?"Searches multiple future booking paths. Larger search limits increase runtime; a decision cap may prevent an optimality proof."
  :greedy
   ?"A fast heuristic that selects plans from the current state; it does not guarantee the best full-horizon result."
   :"Evaluates scoped split and consolidation plans while preserving liquidity for scheduled obligations. It does not prove global optimality.";
}
const today=()=>{let d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
function effectiveEndDate(){return $("end-date").value}
function renderSimulationMode(){$("simulation-mode").value="scoped";$("scoped-end-field").hidden=false;$("end-date").required=true;$("period-hint").innerHTML='Goal mode is under development and is not selectable yet. <a href="https://github.com/aaron-fredrick/FD-Calculator/issues/new?template=feature_request.yml" target="_blank" rel="noopener noreferrer">Suggest a goal-planning improvement ↗</a>. Tenors maturing after the scoped end date are excluded.'}
const id=()=>Math.random().toString(36).slice(2,9),err=m=>{$("error").textContent=m;$("error").hidden=!m};
function setCatalogStatus(message,state){for(const status of [$("catalog-status"),$("catalog-status-mobile")]){status.textContent=message;status.classList.remove("is-loading","is-ready","is-error");if(state)status.classList.add("is-"+state)}}
function setCatalogueReady(ready){const form=$("scenario-form");form.setAttribute("aria-busy",String(!ready));form.querySelectorAll("input,select,button").forEach(control=>{control.disabled=!ready});$("import-config").disabled=!ready;$("export-config").disabled=!ready}
function clearFieldErrors(){
 const notes=[...document.querySelectorAll(".field-error")];
 const noteIds=new Set(notes.map(note=>note.id).filter(Boolean));
 document.querySelectorAll("[aria-describedby]").forEach(el=>{
  const remaining=(el.getAttribute("aria-describedby")||"").split(/\s+/).filter(id=>id&&!noteIds.has(id));
  if(remaining.length)el.setAttribute("aria-describedby",remaining.join(" "));
  else el.removeAttribute("aria-describedby");
 });
 notes.forEach(note=>note.remove());
 document.querySelectorAll(".invalid-field").forEach(n=>n.classList.remove("invalid-field"));
 document.querySelectorAll("[aria-invalid=true]").forEach(n=>n.removeAttribute("aria-invalid"));
}
function markField(el,message){
 if(!el)return;
 const label=el.closest("label")||el.parentElement;
 if(!label)return;
 label.classList.add("invalid-field");
 el.setAttribute("aria-invalid","true");
 const note=document.createElement("small");
 note.className="field-error";
 note.id="field-error-"+(++fieldErrorSequence);
 note.textContent=message;
 const describedBy=(el.getAttribute("aria-describedby")||"").split(/\s+/).filter(Boolean);
 if(!describedBy.includes(note.id))describedBy.push(note.id);
 el.setAttribute("aria-describedby",describedBy.join(" "));
 label.append(note);
 el.focus({preventScroll:true});
 scrollElementIntoView(el,{block:"center"});
}
function safeSimulationError(error){
 const message=String(error?.message||error||"");
 if(/^(Complete the dates|Add at least one account|No investable capital|Every account needs|The strategy could not satisfy|Invalid |Unknown |Outflow |Inflow |Account |Investment |No compatible FD products|No FD option|No FD product rows|Unable to load)/i.test(message))return message;
 if(/Web Workers are not supported/i.test(message))return "This browser does not support the background calculations required by FD Cal. Use a modern browser with Web Worker support.";
 console.error("FD Cal calculation failed:",error);
 return "The calculation could not be completed. Check the scenario inputs and try again. If the problem persists, use Get support.";
}
function showError(message,displayMessage=message){clearFieldErrors();err(displayMessage);let target=null,detail=String(message||"");
 const accountMatch=detail.match(/accounts\[([^\]]+)\]\.([a-z_]+)/i);
 if(accountMatch){const row=[...document.querySelectorAll(".account")].find(n=>n.dataset.id===accountMatch[1]);const field=accountMatch[2];target=row?.querySelector(field==="balance"?"[data-balance]":field==="label"?"[data-label]":field==="supports_efd"?"[data-efd]":"[data-bank]")}
 if(!target&&/consolidation_account_id/i.test(detail))target=document.querySelector('input[name="primary"]');
 if(!target&&/investment (start|end) date/i.test(detail))target=$(detail.match(/investment (start|end) date/i)[1].toLowerCase()+"-date");
 if(!target){for(const kind of ["inflow","outflow"]){const item=S[kind+"s"].find(x=>detail.startsWith(kind+" "+x.name+" "));if(item){const row=document.querySelector('.schedule[data-id="'+item.id+'"]');target=row?.querySelector(detail.includes("amount")?"[data-amount]":detail.includes("account")?"[data-account]":detail.includes("interval")?"[data-interval]":detail.includes("payment_policy")?"[data-policy]":item.type==="scheduled"?"[data-date-entry]":"[data-end]");break}}}
 if(!target&&/unknown bank_id|no compatible FD products|no FD option index|no FD product rows/i.test(detail)){const idMatch=detail.match(/Account ([^ ]+)/i);const row=idMatch&&[...document.querySelectorAll(".account")].find(n=>n.dataset.id===idMatch[1]);target=row?.querySelector("[data-bank]")}
 if(!target&&/investment|date/i.test(detail))target=$("end-date");
 if(target)markField(target,detail);else scrollElementIntoView($("error"),{block:"center"})
}
async function csv(path){let r=await fetch(path);if(!r.ok)throw Error("Unable to load "+path+" ("+r.status+")");return parseCSV(await r.text(),path)}
async function init(){setCatalogueReady(false);setCatalogStatus("Loading bank catalogue…","loading");try{
 $("start-date").value=today();let end=new Date();end.setFullYear(end.getFullYear()+1);$("end-date").value=[end.getFullYear(),String(end.getMonth()+1).padStart(2,"0"),String(end.getDate()).padStart(2,"0")].join("-");renderSimulationMode();
 const [banks,index]=await Promise.all([csv(DATA_ROOT+"banks/banks.csv"),csv(DATA_ROOT+"fd_options/fd_options.csv")]);
 banks.forEach(b=>S.banks[b.id]=b);index.forEach(x=>{S.index[x.bank_id]=x;S.keys[x.bank_id]=x.bank_key});
 setCatalogStatus(Object.keys(S.banks).length+" Sri Lankan banks loaded","ready");
 setCatalogueReady(true);wire();if(!restoreDraft())addAccount();
 }catch(e){setCatalogueReady(false);setCatalogStatus("Catalogue unavailable","error");err("The bank catalogue could not be loaded. Check your connection and reload the page. "+(e.message||String(e)))}}
function bankDisclosure(bankId){
 const entry=S.index[bankId]||{};
 const labels={populated_direct:"Direct bank source",populated_secondary:"Secondary source",no_public_rate_verified:"No public rate verified"};
 const status=labels[entry.research_status]||entry.research_status||"Source status not recorded";
 return esc(status)+" · "+esc(entry.dataset_reviewed_at||"Review date not recorded");
}
function bankOptions(selected){return Object.entries(S.banks).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([k,b])=>{let ok=S.index[k]?.research_status!=="no_public_rate_verified";return '<option value="'+esc(k)+'" '+(k===selected?"selected":"")+' '+(!ok?"disabled":"")+'>'+esc(b.name)+(ok?"":" — no rate data")+'</option>'}).join("")}
function accountOptions(selected){return S.accounts.map(a=>'<option value="'+esc(a.id)+'" '+(a.id===selected?"selected":"")+'>'+esc(a.label||a.id)+'</option>').join("")}
function renderAccounts(){const existingIds=new Set([...$("accounts-list").querySelectorAll(".account")].map(card=>card.dataset.id)); $("accounts-list").innerHTML=S.accounts.map((a,i)=>'<article class="account '+(a.primary?"is-consolidation":"")+'" data-id="'+esc(a.id)+'"><div class="item-head"><b>Account '+(i+1)+'</b><label class="primary-radio"><input type="radio" name="primary" value="'+esc(a.id)+'" '+(a.primary?"checked":"")+'> Consolidation account</label><button class="remove-icon" data-remove-account="'+esc(a.id)+'" type="button" aria-label="Remove account" title="Remove account"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="trash-lid" d="M4 6.5h16M9 6.5V4h6v2.5"/><path d="M6.5 7.5 7.5 20h9l1-12.5M10 10.5v6M14 10.5v6"/></svg></button></div><div class="account-fields"><label>Bank<select data-bank>'+bankOptions(a.bank_id)+'</select><small class="bank-source-disclosure" data-bank-source>'+bankDisclosure(a.bank_id)+'</small></label><label>Account label<input data-label value="'+esc(a.label)+'" placeholder="Main savings"></label><label>Starting balance (LKR)<input data-balance type="number" min="0" step=".01" value="'+a.balance+'"></label><label class="efd"><input data-efd type="checkbox" '+(a.efd?"checked":"")+'> eFD eligible</label></div></article>').join("");animateNewRows($("accounts-list"),".account",existingIds);}
function syncAccounts(){document.querySelectorAll(".account").forEach(c=>{let a=S.accounts.find(x=>x.id===c.dataset.id);if(a){a.bank_id=c.querySelector("[data-bank]").value;a.label=c.querySelector("[data-label]").value.trim();a.balance=c.querySelector("[data-balance]").value;a.efd=c.querySelector("[data-efd]").checked}})}
function addAccount(bank=Object.keys(S.banks).find(k=>S.index[k]?.research_status!=="no_public_rate_verified")){if(!bank)return;S.accounts.push({id:"account_"+id(),bank_id:bank,label:S.banks[bank].name+" account",balance:0,efd:false,primary:!S.accounts.length});renderAccounts();renderSchedules()}
function scheduleDates(value){return (Array.isArray(value)?value:String(value??"").split(",")).map(v=>String(v).trim()).filter(Boolean)}
function renderOne(kind){const container=$(kind+"s-list"),existingIds=new Set([...container.querySelectorAll(".schedule")].map(card=>card.dataset.id));let list=S[kind+"s"];container.innerHTML=list.map((x,i)=>'<article class="schedule" data-kind="'+kind+'" data-id="'+x.id+'"><div class="item-head"><b>'+(kind==="inflow"?"Inflow ":"Outflow ")+(i+1)+'</b><button class="remove-icon" data-remove="'+x.id+'" type="button" aria-label="Remove '+(kind==="inflow"?"inflow":"outflow")+'" title="Remove '+(kind==="inflow"?"inflow":"outflow")+'" ><svg viewBox="0 0 24 24" aria-hidden="true"><path class="trash-lid" d="M4 6.5h16M9 6.5V4h6v2.5"/><path d="M6.5 7.5 7.5 20h9l1-12.5M10 10.5v6M14 10.5v6"/></svg></button></div><div class="schedule-fields"><label>Name<input data-name value="'+esc(x.name)+'"></label><label>Amount (LKR)<input data-amount type="number" min=".01" step=".01" value="'+esc(x.amount)+'"></label><label>Account<select data-account>'+accountOptions(x.account_id)+'</select></label><label>Schedule<select data-type><option value="recurring" '+(x.type==="recurring"?"selected":"")+'>Recurring</option><option value="scheduled" '+(x.type==="scheduled"?"selected":"")+'>Specific dates</option></select></label><label data-recurring '+(x.type!=="recurring"?"hidden":"")+'><span>Interval</span><select data-interval>'+["1m","2m","3m","6m","1y"].map((v,j)=>'<option value="'+v+'" '+(x.interval===v?"selected":"")+'>'+["Monthly","Every 2 months","Quarterly","Every 6 months","Yearly"][j]+'</option>').join("")+'</select></label><label data-recurring '+(x.type!=="recurring"?"hidden":"")+'><span>First date</span><input data-start type="date" value="'+esc(x.start_date)+'"></label><label data-recurring '+(x.type!=="recurring"?"hidden":"")+'><span>Last date</span><input data-end type="date" value="'+esc(x.end_date)+'"></label><label class="wide" data-scheduled '+(x.type!=="scheduled"?"hidden":"")+'><span>Specific dates</span><div class="date-entry-row"><input data-date-entry type="date" min="'+esc($("start-date").value)+'" max="'+esc(effectiveEndDate())+'" aria-label="Choose a cash-flow date"><button class="secondary small" type="button" data-add-date>Add date</button></div><input data-dates type="hidden" value="'+esc(x.dates||"")+'"><div class="date-chip-list" data-date-chips>'+(scheduleDates(x.dates).map(date=>'<span class="date-chip '+(date<$("start-date").value||date>effectiveEndDate()?"is-outside":"")+'">'+esc(date)+'<button type="button" data-remove-date="'+esc(date)+'" aria-label="Remove date '+esc(date)+'">×</button></span>').join("")||'<span class="muted date-empty">No dates added</span>')+'</div><small>Add one or more dates with the date picker. Dates must be within the simulation period.</small></label>'+(kind==="outflow"?'<label><span class="field-label">Payment policy<button class="help-tip" type="button" aria-label="Help: Strict: fail if the account cannot pay the full amount. Defer: carry the full unpaid amount forward. Best effort: pay what is available and carry any remainder forward." aria-expanded="false" data-tooltip="Strict: fail if the account cannot pay the full amount. Defer: carry the full unpaid amount forward. Best effort: pay what is available and carry any remainder forward.">?</button></span><select data-policy>'+["strict","defer","best_effort"].map(v=>'<option value="'+v+'" '+(x.policy===v?"selected":"")+'>'+({strict:"Strict",defer:"Defer",best_effort:"Best effort"}[v])+'</option>').join("")+'</select></label>':"")+'</div></article>').join("");animateNewRows(container,".schedule",existingIds)}
function renderSchedules(){renderOne("inflow");renderOne("outflow")}
function updateDateEntryBounds(){const start=$("start-date").value,end=effectiveEndDate();document.querySelectorAll("[data-date-entry]").forEach(input=>{input.min=start;input.max=end});document.querySelectorAll(".schedule[data-kind]").forEach(card=>{card.querySelectorAll("[data-date-chips] .date-chip").forEach(chip=>{const date=chip.firstChild?.textContent?.trim();chip.classList.toggle("is-outside",!!date&&(date<start||date>end))})})}
function syncSchedules(){for(let kind of ["inflow","outflow"])document.querySelectorAll('.schedule[data-kind="'+kind+'"]').forEach(c=>{let x=S[kind+"s"].find(v=>v.id===c.dataset.id);if(!x)return;let v=s=>c.querySelector(s)?.value;Object.assign(x,{name:v("[data-name]"),amount:v("[data-amount]"),account_id:v("[data-account]"),type:v("[data-type]"),interval:v("[data-interval]"),start_date:v("[data-start]"),end_date:v("[data-end]"),dates:v("[data-dates]"),policy:v("[data-policy]")||"strict"})})}
function addPlan(kind){if(!S.accounts.length){err("Add a bank account before creating cash-flow plans.");return}S[kind+"s"].push({id:id(),name:"",amount:"",account_id:S.accounts[0].id,type:"recurring",interval:"1m",start_date:$("start-date").value,end_date:effectiveEndDate(),dates:"",policy:"strict"});renderSchedules()}
function raw(){syncAccounts();syncSchedules();let accounts={};S.accounts.forEach(a=>accounts[a.id]={bank_id:a.bank_id,label:a.label,balance:Number(a.balance),supports_efd:a.efd});
 const start=$("start-date").value,end=effectiveEndDate();
 const simulation={mode:"scoped"};const investment={start_date:start,end_date:end};
 let schedule=(arr,kind)=>arr.map(x=>({name:x.name,amount:Number(x.amount),account_id:x.account_id,type:x.type,...(x.type==="recurring"?{interval:x.interval,start_date:x.start_date||start,...(x.end_date||end?{end_date:x.end_date||end}:{})}:{dates:String(x.dates).split(",").map(s=>s.trim()).filter(Boolean)}),...(kind==="outflow"?{payment_policy:x.policy}:{})}));
 return {fd_eligibility:{include_senior:$("include-senior-fds").checked,include_minor:$("include-minor-fds").checked},strategy:$("strategy-choice").value,simulation,investment,accounts,consolidation_account_id:(S.accounts.find(a=>a.primary)||S.accounts[0])?.id,inflows:schedule(S.inflows,"inflow"),outflows:schedule(S.outflows,"outflow"),transfer_fees:{default_inter_bank_fee:$("inter-fee").value.trim()===""?null:Number($("inter-fee").value),same_bank_fee:$("same-fee").value.trim()===""?null:Number($("same-fee").value),custom_fees:[]},compound:$("compound").checked,ait_enabled:$("ait").checked,actual_leap_year:$("leap-year").checked,gaml_settings:{beam_width:Number($("beam-width").value),max_local_branches:$("local-branches").value===""?null:Number($("local-branches").value),max_decisions:$("unlimited-decision-cap").checked?null:Number($("decision-cap").value),time_limit_ms:Number($("time-limit-seconds").value)*1000},greedy_settings:{tenor_tiebreaker:$("tenor-tiebreaker").value,plan_tenor_tiebreaker:$("plan-tenor-tiebreaker").value},gss_settings:{small_period_days:Number($("small-period-days").value||30)}}
}
async function getOptions(ids){let out=[];for(let bank of [...new Set(ids)]){if(!S.cache.has(bank)){let row=S.index[bank];if(!row)throw Error("No FD option index entry for "+bank);let rows=await csv(DATA_ROOT+"fd_options/"+row.options_file),key=String(row.bank_key).toLowerCase(),fallback=({commercial:25000,dfcc:10000})[key]??25000;let opts=rows.map(r=>new FDOption({label:r.name,period_str:r.period,annual_rate:Number(r.annual_rate),min_amount:r.min_amount?Number(r.min_amount):fallback,payout_type:r.payout_type||"cumulative",payout_period_str:r.payout_period||"",bank_key:key,bank_id:bank,is_efd:String(r.eFD).toLowerCase()==="true",customer_segment:r.customer_segment||"general",min_age:r.min_age===""?null:r.min_age,max_age:r.max_age===""?null:r.max_age,min_age_inclusive:r.min_age_inclusive===""||r.min_age_inclusive==null?true:String(r.min_age_inclusive).toLowerCase()==="true",max_age_inclusive:r.max_age_inclusive===""||r.max_age_inclusive==null?true:String(r.max_age_inclusive).toLowerCase()==="true",guardian_required:r.guardian_required===""||r.guardian_required==null?null:String(r.guardian_required).toLowerCase()==="true",source_url:r.source_url||"",source_effective_date:r.source_effective_date||"",source_type:r.source_type||"",source_notes:r.notes||""}));S.cache.set(bank,opts)}let opts=S.cache.get(bank);if(!opts.length)throw Error((S.banks[bank]?.name||bank)+" has no FD product rows in the current dataset. Choose a bank with configured rates.");out.push(...opts)}return out}
function applyConfig(x){if(!x||typeof x!=="object"||!x.investment||!x.accounts)throw Error("Invalid scenario configuration.");x.gaml_settings=x.gaml_settings??x.gaml??x.strategy_settings?.gaml??{};x.greedy_settings=x.greedy_settings??x.greedy??x.strategy_settings?.greedy??{};x.gss_settings=x.gss_settings??x.gss??x.strategy_settings?.gss??{};
 if(x.simulation?.mode==="goal")throw Error("Goal-based mode is under development and is not available in the browser yet. Use a scoped date range.");
 const startDate=x.investment.start_date==="today"?today():x.investment.start_date,legacyTimeBased=x.simulation?.mode==="time_based",mode="scoped",endDate=legacyTimeBased?formatISODate(addPeriod(startDate,x.simulation.duration)):x.investment.end_date;
 const dateInput=(value,fallback)=>{if(value===null||value===undefined||!String(value).trim())return fallback;const token=String(value).trim().toLowerCase();if(["end","investment_end"].includes(token))return endDate;if(["start","investment_start"].includes(token))return startDate;if(token==="today")return today();return /^\d{4}-\d{2}-\d{2}$/.test(String(value))?String(value):fallback};
 $("start-date").value=startDate;$("end-date").value=endDate||today();$("simulation-mode").value=mode;renderSimulationMode();
 S.accounts=Object.entries(x.accounts||{}).map(([k,a])=>({id:k,bank_id:a.bank_id,label:a.label||k,balance:a.balance??0,efd:a.supports_efd??true,primary:k===x.consolidation_account_id}));
 const datesText=v=>Array.isArray(v)?v.join(","):String(v??"");
 S.inflows=(x.inflows||[]).map(a=>({id:id(),...a,start_date:dateInput(a.start_date,startDate),end_date:dateInput(a.end_date,endDate),dates:datesText(a.dates)}));
 S.outflows=(x.outflows||[]).map(a=>({id:id(),...a,start_date:dateInput(a.start_date,startDate),end_date:dateInput(a.end_date,endDate),dates:datesText(a.dates),policy:a.payment_policy||"strict"}));
 $("include-senior-fds").checked=x.fd_eligibility?.include_senior===true;$("include-minor-fds").checked=x.fd_eligibility?.include_minor===true;$("strategy-choice").value=["greedy","gaml","gss"].includes(x.strategy)?x.strategy:"gaml";syncStrategySettings();$("inter-fee").value=x.transfer_fees?.default_inter_bank_fee??30;$("same-fee").value=x.transfer_fees?.same_bank_fee??0;$("compound").checked=!!x.compound;$("ait").checked=x.ait_enabled??true;$("leap-year").checked=x.actual_leap_year??true;$("beam-width").value=x.gaml_settings?.beam_width??256;$("local-branches").value=x.gaml_settings?.max_local_branches??128;const hasCap=Object.prototype.hasOwnProperty.call(x.gaml_settings,"max_decisions")||Object.prototype.hasOwnProperty.call(x.gaml_settings,"state_cap");const configuredCap=Object.prototype.hasOwnProperty.call(x.gaml_settings,"max_decisions")?x.gaml_settings.max_decisions:x.gaml_settings.state_cap??10000;$("unlimited-decision-cap").checked=hasCap&&configuredCap===null;$("decision-cap").disabled=hasCap&&configuredCap===null;$("decision-cap").value=configuredCap===null?10000:configuredCap;$("time-limit-seconds").value=(x.gaml_settings?.time_limit_ms??30000)/1000;$("tenor-tiebreaker").value=x.greedy_settings?.tenor_tiebreaker??"shortest";$("plan-tenor-tiebreaker").value=x.greedy_settings?.plan_tenor_tiebreaker??"shortest";$("small-period-days").value=x.gss_settings?.small_period_days??30;renderAccounts();renderSchedules();clearFieldErrors();err("")}
function saveDraft(){try{const draft=raw();localStorage.setItem(STORAGE_KEY,JSON.stringify(draft));S.raw=draft}catch(e){console.warn("FD Cal draft could not be saved:",e)}}
function restoreDraft(){try{const saved=localStorage.getItem(STORAGE_KEY);if(!saved)return false;applyConfig(JSON.parse(saved));return true}catch(e){console.warn("FD Cal saved draft could not be restored:",e);try{localStorage.removeItem(STORAGE_KEY)}catch{}return false}}
function clearSavedDraft(event){
 event.stopPropagation();
 if(!window.confirm("Clear the saved FD Cal draft from this browser? Current inputs will remain in this tab."))return;
 try{
  localStorage.removeItem(STORAGE_KEY);
  S.raw=null;
  $("draft-storage-status").textContent="Saved draft cleared from this browser. Current inputs remain in this tab; editing them will save a new draft.";
 }catch(error){
  console.warn("FD Cal saved draft could not be cleared:",error);
  $("draft-storage-status").textContent="The saved draft could not be cleared. Check this browser’s site-storage permissions.";
 }
}
function download(blob,name){let u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function exportRaw(){download(new Blob([JSON.stringify(raw(),null,2)],{type:"application/json"}),"fd-cal-config.json")}
function results(r,c,html){
 if(S.url)URL.revokeObjectURL(S.url);
 S.url=URL.createObjectURL(new Blob([html],{type:"text/html"}));
 const goal=r.goal_outcome??null;
 const start=c.start.toISOString().slice(0,10),end=r.end_date.toISOString().slice(0,10);
 $("result-period").textContent=goal
  ? start+" — "+end+" · goal · "+r.strategy_name+" · "+(goal.achieved?(goal.stopping_reason==="goal_achieved_on_final_consolidation"?"reached only on final sweep ":"achieved ")+goal.achievement_date+" ("+goal.elapsed_days+" days)":"not reached · "+goal.stopping_reason)
  : start+" — "+end+" · scoped · "+r.strategy_name;
 const moneyValue=value=>"LKR "+Number(value??0).toLocaleString("en-LK",{minimumFractionDigits:2,maximumFractionDigits:2});
 const vals=goal?[
  ["Goal target",goal.target,"money"],
  ["Credited net interest",goal.actual,"money"],
  ["Time to goal",goal.elapsed_days,"days"],
  ["Achievement date",goal.achievement_date,"date"],
  [goal.achieved?"Overshoot":"Remaining shortfall",goal.achieved?goal.overshoot:goal.shortfall,"money"],
  ["Portfolio net interest (all accounts)",r.net_interest_after_ait,"money"],
  ["Transfer fees",r.total_transfer_fees,"money"],
  ["Capital invested",r.total_principal,"money"]
 ]:[
  ["Gross interest",r.total_interest,"money"],["AIT withheld",r.ait_withheld,"money"],
  ["Transfer fees",r.total_transfer_fees,"money"],["Net interest",r.net_interest_after_ait,"money"],
  ["Pre-withdrawal value",r.pre_withdrawal_value,"money"],["Outflows paid",r.total_outflows_paid,"money"],["Outstanding liabilities",r.outstanding_liabilities,"money"],["Closing net worth",r.closing_net_worth,"money"],["Capital invested",r.contributed_capital,"money"]
 ];
 $("metrics").innerHTML=vals.map((x,i)=>{
  const value=x[2]==="money"?moneyValue(x[1]):x[2]==="days"?(x[1]===null||x[1]===undefined?"—":Number(x[1]).toLocaleString("en-LK")+" days"):(x[1]??"Not achieved");
  return '<div class="metric '+(goal?i<2?"primary":"":i===3||i===4?"primary":"")+'"><small>'+x[0]+'</small><strong>'+value+'</strong></div>';
 }).join("");
 $("download-report").onclick=()=>download(new Blob([html],{type:"text/html"}),"fd-cal-report.html");
 $("open-report").onclick=()=>window.open(S.url,"_blank","noopener");
 $("download-result-config").onclick=exportRaw;
 $("results").hidden=false;animateEntrance($("results"));
 scrollElementIntoView($("results"));
}
function wire(){
 $("clear-draft").addEventListener("click",clearSavedDraft);
 document.addEventListener("click",event=>{
  const tip=event.target.closest?.(".help-tip")||null;
  document.querySelectorAll('.help-tip[aria-expanded="true"]').forEach(openTip=>{
   if(openTip!==tip)openTip.setAttribute("aria-expanded","false");
  });
  if(tip)tip.setAttribute("aria-expanded",String(tip.getAttribute("aria-expanded")!=="true"));
 });
 document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;
  const tip=document.querySelector('.help-tip[aria-expanded="true"]');
  if(tip){tip.setAttribute("aria-expanded","false");tip.focus();}
 });
 $("scenario-form").addEventListener("input",()=>{clearFieldErrors();err("");if(["start-date","simulation-mode"].includes(document.activeElement?.id))renderSimulationMode();updateDateEntryBounds();markFormEdited();saveDraft()});$("scenario-form").addEventListener("change",()=>{clearFieldErrors();err("");renderSimulationMode();updateDateEntryBounds();markFormEdited();saveDraft()});$("scenario-form").addEventListener("click",saveDraft);
 $("add-account").onclick=()=>{syncAccounts();syncSchedules();addAccount()};$("accounts-list").onchange=e=>{if(e.target.name==="primary"){S.accounts.forEach(a=>a.primary=a.id===e.target.value);document.querySelectorAll(".account").forEach(card=>card.classList.toggle("is-consolidation",card.dataset.id===e.target.value))}if(e.target.matches("[data-bank]")){syncAccounts();syncSchedules();let a=S.accounts.find(x=>x.id===e.target.closest(".account").dataset.id);a.bank_id=e.target.value;a.label=S.banks[a.bank_id].name+" account";renderAccounts();renderSchedules()}};
 $("accounts-list").onclick=e=>{let button=e.target.closest("button[data-remove-account]");if(!button)return;let key=button.dataset.removeAccount,card=button.closest(".account");if(!card||card.classList.contains("is-removing"))return;syncAccounts();syncSchedules();animateRemoval(button,card,()=>{S.accounts=S.accounts.filter(a=>a.id!==key);S.inflows=S.inflows.filter(x=>x.account_id!==key);S.outflows=S.outflows.filter(x=>x.account_id!==key);if(S.accounts.length&&!S.accounts.some(a=>a.primary))S.accounts[0].primary=true;renderAccounts();renderSchedules();saveDraft()})};
 $("add-inflow").onclick=()=>{syncSchedules();addPlan("inflow")};$("add-outflow").onclick=()=>{syncSchedules();addPlan("outflow")};
 for(let kind of ["inflow","outflow"]){let list=$(kind+"s-list");list.onchange=e=>{if(e.target.matches("[data-type]")){let card=e.target.closest(".schedule");card.querySelectorAll("[data-recurring]").forEach(n=>n.hidden=e.target.value!=="recurring");card.querySelector("[data-scheduled]").hidden=e.target.value!=="scheduled"}};list.onclick=e=>{const addDate=e.target.closest("button[data-add-date]");if(addDate){syncSchedules();const card=addDate.closest(".schedule"),item=S[kind+"s"].find(x=>x.id===card?.dataset.id),picker=card?.querySelector("[data-date-entry]"),value=picker?.value,start=$("start-date").value,end=effectiveEndDate();if(!item||!value){err("Choose a date first.");return}if(value<start||value>end){err("Choose a date within the simulation period.");return}const dates=scheduleDates(item.dates);if(dates.includes(value)){err("That date has already been added.");return}dates.push(value);dates.sort();item.dates=dates.join(",");renderOne(kind);saveDraft();return}const removeDate=e.target.closest("button[data-remove-date]");if(removeDate){syncSchedules();const card=removeDate.closest(".schedule"),item=S[kind+"s"].find(x=>x.id===card?.dataset.id);if(!item)return;item.dates=scheduleDates(item.dates).filter(v=>v!==removeDate.dataset.removeDate).join(",");renderOne(kind);saveDraft();return}let button=e.target.closest("button[data-remove]");if(!button)return;let key=button.dataset.remove,card=button.closest(".schedule");if(!card||card.classList.contains("is-removing"))return;syncSchedules();animateRemoval(button,card,()=>{S[kind+"s"]=S[kind+"s"].filter(x=>x.id!==key);renderOne(kind);saveDraft()})}}
$("strategy-choice").addEventListener("change",()=>syncStrategySettings());$("simulation-mode").addEventListener("change",renderSimulationMode);$("unlimited-decision-cap").addEventListener("change",()=>{$("decision-cap").disabled=$("unlimited-decision-cap").checked;saveDraft()});syncStrategySettings();renderSimulationMode();
 $("scenario-form").onsubmit=async e=>{
  e.preventDefault();clearFieldErrors();err("");
  const status=$("simulation-status"),button=$("run"),cancelButton=$("cancel-run"),submissionId=++S.submissionSequence;cancelButton.hidden=true;
  console.info("[FD Cal][main] Simulation submitted", {submissionId, at:new Date().toISOString()});
  let requestId=null,computeStarted=false,elapsedMs=0;
  S.isPreparing=true;
  status.classList.remove("is-complete","is-success");status.hidden=false;
  try{
    const x=raw();
    if(!x.investment.start_date||(x.simulation.mode==="scoped"&&!x.investment.end_date))throw Error("Complete the dates required by the selected simulation mode.");
    if(!S.accounts.length)throw Error("Add at least one account.");
    const startingCapital=Object.values(x.accounts).reduce((sum,account)=>sum+Number(account.balance||0),0);
    const plannedInflows=(x.inflows||[]).reduce((sum,inflow)=>sum+Number(inflow.amount||0),0);
    if(startingCapital+plannedInflows<=0)throw Error("No investable capital: enter a positive starting balance or add at least one inflow before running the simulation.");
    if(S.accounts.some(a=>!a.label))throw Error("Every account needs a label.");
    S.raw=x;
    button.classList.add("is-loading");button.textContent="Preparing simulation…";
    status.textContent=S.workerRunner.active
      ?"Preparing the updated scenario; the current computation continues until the new scenario is ready…"
      :"Loading bank rates and preparing the simulation…";
    await nextPaint();
    const options=await getOptions(S.accounts.map(a=>a.bank_id));
    if(submissionId!==S.submissionSequence)return;
    const c=validateConfiguration(x,{bankRegistry:S.banks,bankKeyById:S.keys,options,today:today()});
    c.bank_registry=S.banks;c.bank_dataset_registry=S.index;c.options_path="data/fd_options/fd_options.csv";
    const fingerprint=simulationFingerprint(c);
    requestId=++S.activeRunId;
    S.formEditedWhileRunning=false;$("simulation-edit-note").hidden=true;
    console.info("[FD Cal][main] Dispatching validated scenario to worker", {requestId,strategy:c.strategy,mode:c.simulation?.mode,accountCount:c.accounts?.length,optionCount:c.options?.length,fingerprintLength:fingerprint.length});
    const run=S.workerRunner.run(createWorkerPayload(c),fingerprint);
    console.info("[FD Cal][main] Worker runner response", {requestId,started:run.started,reused:run.reused,deduplicated:run.deduplicated,workerActive:!!S.workerRunner.active});
    S.isPreparing=false;
    cancelButton.hidden=!S.workerRunner.active;
    const strategyName=({gaml:"Absolute R+ search",greedy:"Greedy optimisation",gss:"GSS scoped planning"}[c.strategy]||c.strategy);
    if(run.reused){
      status.textContent="Using the completed result — scenario and bank-product data are unchanged.";
      elapsedMs=stopElapsedTimer();
    }else{
      status.textContent=run.deduplicated
        ?"This scenario is already being computed. Reusing the active run…"
        :"Computing "+strategyName+" in the background…";
      if(run.started){startElapsedTimer(true);computeStarted=true}
      else if(run.deduplicated)computeStarted=true;
      else stopElapsedTimer();
    }
    button.textContent=S.workerRunner.active?"Run updated scenario":"▶ Run simulation";
    await nextPaint();
    console.info("[FD Cal][main] Awaiting worker result", {requestId,workerActive:!!S.workerRunner.active});
    const rawResult=await run.promise;
    console.info("[FD Cal][main] Worker promise resolved", {requestId,elapsedMs:Math.round(elapsedMs),valid:rawResult?.valid,bookingCount:rawResult?.bookings?.length});
    if(requestId!==S.activeRunId)return;
    elapsedMs=stopElapsedTimer()||elapsedMs;
    const result=rehydrateSimulationResult(rawResult,FDOption);
    const html=generateHtmlReport(result,c);
    results(result,c,html);
    S.lastSimulationKey=fingerprint;
    status.textContent=run.reused
      ?"Completed result reused; no new computation was required."
      :"Simulation complete in "+elapsedLabel(elapsedMs)+".";
    status.classList.add("is-complete","is-success");
    $("simulation-edit-note").hidden=!S.formEditedWhileRunning;
  }catch(ex){
    console.error("[FD Cal][main] Simulation submission failed", {submissionId,requestId,workerActive:!!S.workerRunner.active,errorName:ex?.name,errorMessage:ex?.message},ex);
    if(ex?.name==="AbortError"){status.textContent="Simulation cancelled.";status.classList.add("is-complete");cancelButton.hidden=true;return;}
    if(submissionId!==S.submissionSequence)return;
    if(requestId!==null&&requestId!==S.activeRunId)return;
    if(computeStarted)elapsedMs=stopElapsedTimer()||elapsedMs;
    status.textContent=computeStarted
      ?"Simulation failed after "+elapsedLabel(elapsedMs)+". Review the error below and try again."
      :"The scenario could not be prepared. Review the error below and try again.";
    status.classList.add("is-complete");
    $("simulation-edit-note").hidden=true;
    showError(ex.message||String(ex),safeSimulationError(ex));
  }finally{
    if(submissionId===S.submissionSequence){
      S.isPreparing=false;
      cancelButton.hidden=true;button.disabled=false;button.classList.remove("is-loading");
      button.textContent=S.workerRunner.active?"Run updated scenario":"▶ Run simulation";
    }
  }
 };
 $("cancel-run").onclick=()=>{if(S.workerRunner.cancel("Cancelled by user."))$("simulation-status").textContent="Cancelling simulation…"};
 window.addEventListener("pagehide",()=>{S.workerRunner.cancel("Page is closing.");stopElapsedTimer()},{once:true});
 $("export-config").onclick=()=>{try{exportRaw()}catch(e){err(e.message)}};$("import-config").onclick=()=>$("config-file").click();$("config-file").onchange=async e=>{let f=e.target.files?.[0];if(!f)return;try{let x=validateConfigurationShape(JSON.parse(await f.text()));if((x.strategy??"absolute")==="absolute")throw Error("Absolute R is CLI-only. Select Greedy or Absolute R+ in the CLI configuration before importing into the browser.");const ids=Object.values(x.accounts).map(a=>a.bank_id);const options=await getOptions(ids);validateConfiguration(x,{bankRegistry:S.banks,bankKeyById:S.keys,options,today:today()});applyConfig(x);saveDraft()}catch(ex){showError(ex.message||String(ex),"Import failed: "+(ex.message||String(ex)))}e.target.value=""};
}
init();