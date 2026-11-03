(() => {
"use strict";
const dataNode=document.getElementById("fd-report-data");
if(!dataNode)return;
let data={};try{data=JSON.parse(dataNode.textContent||"{}")}catch(error){return}
const palette=["#56b4e9","#e69f00","#009e73","#cc79a7","#bd93f9","#d55e00","#8be9fd","#f0e442"];
const money=value=>new Intl.NumberFormat("en-LK",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const parseDay=value=>new Date(value+"T00:00:00");
function setupCanvas(canvas){const rect=canvas.getBoundingClientRect(),ratio=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(rect.width*ratio));canvas.height=Math.max(1,Math.floor((rect.height||280)*ratio));const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);return{ctx,w:rect.width,h:rect.height||280}}
function frame(ctx,w,h,pad={l:62,r:18,t:18,b:42}){ctx.clearRect(0,0,w,h);ctx.font="10px system-ui";ctx.fillStyle="#9ba8b8";ctx.strokeStyle="#293445";ctx.lineWidth=1;return{...pad,pw:w-pad.l-pad.r,ph:h-pad.t-pad.b}}
function axes(ctx,g,min,max,labels){for(let i=0;i<=4;i++){const y=g.t+g.ph*i/4;ctx.beginPath();ctx.moveTo(g.l,y);ctx.lineTo(g.l+g.pw,y);ctx.stroke();ctx.fillText(money(max-(max-min)*i/4),4,y+3)}labels.forEach((label,i)=>{const x=g.l+g.pw*(labels.length<2?0:i/(labels.length-1));ctx.fillText(label,x-24,g.t+g.ph+20)})}
function clearChartExtras(canvas){canvas.parentElement.querySelectorAll(".chart-toolbar,.chart-tooltip").forEach(node=>node.remove())}
function lineChart(canvas,series){clearChartExtras(canvas);const activeSeries=series.filter(s=>!s._fdHidden);const {ctx,w,h}=setupCanvas(canvas),g=frame(ctx,w,h);const points=activeSeries.flatMap(s=>s.points||[]);if(!points.length){ctx.fillStyle="#9ba8b8";ctx.fillText("No account balance events available",g.l,g.t+30);return}
const labels=[...new Set(points.map(p=>p.x))].sort(),values=points.map(p=>p.y),min=Math.min(0,...values),max=Math.max(1,...values);axes(ctx,g,min,max,labels.filter((_,i)=>i===0||i===labels.length-1||i===Math.floor(labels.length/2)));
activeSeries.forEach((s,index)=>{const list=s.points||[];if(!list.length)return;ctx.strokeStyle=palette[(s.colorIndex??index)%palette.length];ctx.lineWidth=s.lineStyle==="solid"?2.8:2;ctx.setLineDash(s.lineStyle==="dashed"?[8,5]:s.lineStyle==="dotted"?[2,5]:[]);ctx.beginPath();list.forEach((p,i)=>{const x=g.l+g.pw*(labels.indexOf(p.x)/Math.max(labels.length-1,1)),y=g.t+g.ph-(p.y-min)/(max-min)*g.ph;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()});
const legend=document.createElement("div");legend.className="chart-toolbar";series.forEach((s,i)=>{const b=document.createElement("button");b.type="button";b.textContent=s.name;b.setAttribute("aria-pressed",s._fdHidden?"false":"true");b.onclick=()=>{if(!s._fdHidden&&series.filter(x=>!x._fdHidden).length===1)return;s._fdHidden=!s._fdHidden;lineChart(canvas,series)};legend.appendChild(b)});canvas.parentElement.insertBefore(legend,canvas.nextSibling);
canvas.onmousemove=event=>{const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,idx=Math.min(labels.length-1,Math.max(0,Math.round(x*(labels.length-1))));const day=labels[idx];const details=activeSeries.map(s=>{const p=(s.points||[]).find(v=>v.x===day);return p?s.name+": "+money(p.y):null}).filter(Boolean);let tip=canvas.parentElement.querySelector(".chart-tooltip");if(!tip){tip=document.createElement("div");tip.className="chart-tooltip";canvas.after(tip)}tip.textContent=day+" · "+details.join(" · ")};
}
function barChart(canvas,series){clearChartExtras(canvas);const activeSeries=series.filter(s=>!s._fdHidden);const {ctx,w,h}=setupCanvas(canvas),g=frame(ctx,w,h,{l:58,r:14,t:16,b:50});const dates=[...new Set(activeSeries.flatMap(s=>(s.points||[]).map(p=>p.x)))].sort();const values=activeSeries.flatMap(s=>s.points||[]).map(p=>p.y);if(!values.length){ctx.fillStyle="#9ba8b8";ctx.fillText("No cash movements available",g.l,g.t+30);return}const min=Math.min(0,...values),max=Math.max(1,...values);axes(ctx,g,min,max,dates.filter((_,i)=>i===0||i===dates.length-1||i===Math.floor(dates.length/2)));const group=Math.max(1,activeSeries.length),slot=g.pw/Math.max(1,dates.length),bw=Math.max(2,Math.min(15,slot/group*.72));activeSeries.forEach((s,si)=>{s.points.forEach(p=>{const di=dates.indexOf(p.x),x=g.l+di*slot+slot/2+(si-(group-1)/2)*bw,y0=g.t+g.ph-(0-min)/(max-min)*g.ph,y=g.t+g.ph-(p.y-min)/(max-min)*g.ph;ctx.fillStyle=palette[si%palette.length];ctx.fillRect(x-bw/2,Math.min(y,y0),bw,Math.max(1,Math.abs(y0-y)))} )});const legend=document.createElement("div");legend.className="chart-toolbar";series.forEach((s,i)=>{const b=document.createElement("button");b.type="button";b.textContent=s.name;b.setAttribute("aria-pressed",s._fdHidden?"false":"true");b.onclick=()=>{if(!s._fdHidden&&series.filter(x=>!x._fdHidden).length===1)return;s._fdHidden=!s._fdHidden;barChart(canvas,series)};legend.appendChild(b)});canvas.parentElement.insertBefore(legend,canvas.nextSibling);canvas.onmousemove=e=>{const r=canvas.getBoundingClientRect(),idx=Math.min(dates.length-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*dates.length)));const day=dates[idx];let tip=canvas.parentElement.querySelector(".chart-tooltip");if(!tip){tip=document.createElement("div");tip.className="chart-tooltip";canvas.after(tip)}tip.textContent=day+" · "+activeSeries.map(s=>{const p=s.points.find(v=>v.x===day);return p?s.name+": "+money(p.y):null}).filter(Boolean).join(" · ")};}
function timeline(canvas,items){clearChartExtras(canvas);const {ctx,w,h}=setupCanvas(canvas),g=frame(ctx,w,h,{l:12,r:14,t:18,b:34});if(!items.length){ctx.fillStyle="#9ba8b8";ctx.fillText("No fixed deposits booked",g.l,g.t+25);return}const min=Math.min(...items.map(x=>parseDay(x.start).getTime())),max=Math.max(...items.map(x=>parseDay(x.end).getTime())),span=Math.max(1,max-min);const row=Math.max(24,g.ph/items.length);items.forEach((item,i)=>{const y=g.t+i*row+5,x=g.l+(parseDay(item.start).getTime()-min)/span*g.pw,width=Math.max(3,(parseDay(item.end).getTime()-parseDay(item.start).getTime())/span*g.pw);ctx.fillStyle=palette[i%palette.length];ctx.globalAlpha=.82;ctx.fillRect(x,y,width,Math.min(15,row-7));ctx.globalAlpha=1;ctx.fillStyle="#cbd5e1";ctx.fillText(item.name.slice(0,34)+" · "+money(item.principal),g.l,y+27)});ctx.fillStyle="#9ba8b8";ctx.fillText(items[0].start,g.l,g.t+g.ph+20);ctx.fillText(items[items.length-1].end,Math.max(g.l,g.l+g.pw-76),g.t+g.ph+20);canvas.onmousemove=e=>{const r=canvas.getBoundingClientRect(),i=Math.min(items.length-1,Math.max(0,Math.floor((e.clientY-r.top-g.t)/row))),v=items[i];let tip=canvas.parentElement.querySelector(".chart-tooltip");if(!tip){tip=document.createElement("div");tip.className="chart-tooltip";canvas.after(tip)}tip.textContent=v.name+" · "+v.start+" → "+v.end+" · Principal "+money(v.principal)+" · Interest "+money(v.interest)+" · "+v.rate.toFixed(3)+"% p.a."};}
function returnsChart(canvas,items){const {ctx,w,h}=setupCanvas(canvas),g=frame(ctx,w,h,{l:12,r:12,t:18,b:22});const total=items.reduce((n,x)=>n+Math.max(0,x.value),0);if(!total){ctx.fillStyle="#9ba8b8";ctx.fillText("No return data available",g.l,g.t+25);return}let x=g.l;items.forEach((item,i)=>{const width=g.pw*Math.max(0,item.value)/total;ctx.fillStyle=palette[i%palette.length];ctx.fillRect(x,g.t+35,width,32);x+=width});items.forEach((item,i)=>{ctx.fillStyle=palette[i%palette.length];ctx.fillRect(g.l,g.t+92+i*31,9,9);ctx.fillStyle="#cbd5e1";ctx.fillText(item.name+" · "+money(item.value),g.l+16,g.t+101+i*31)})}
function drawAll(){document.querySelectorAll(".chart-toolbar").forEach(x=>x.remove());document.querySelectorAll(".chart-tooltip").forEach(x=>x.remove());const a=document.getElementById("account-chart"),c=document.getElementById("cashflow-chart"),m=document.getElementById("maturity-chart"),r=document.getElementById("returns-chart");if(a)lineChart(a,data.accounts||[]);if(c)barChart(c,data.cashflows||[]);if(m)timeline(m,data.maturities||[]);if(r)returnsChart(r,data.returns||[])}
let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawAll,120)});drawAll();
const links=[...document.querySelectorAll(".section-nav a")],sections=links.map(a=>document.querySelector(a.getAttribute("href"))).filter(Boolean);if("IntersectionObserver"in window){const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;links.forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+visible.target.id))},{rootMargin:"-15% 0px -70% 0px",threshold:[0,.15,.4,.7]});sections.forEach(s=>observer.observe(s))}else if(links.length)links[0].classList.add("active");
})();

/* Rich hover focus layer: highlights the selected datum without changing chart layout. */
(() => {
  "use strict";
  const node=document.getElementById("fd-report-data");
  if(!node)return;
  let data={};try{data=JSON.parse(node.textContent||"{}")}catch(e){return}
  const fmt=v=>new Intl.NumberFormat("en-LK",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
  const dayDate=s=>new Date(s+"T00:00:00").getTime();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function init(canvas){
    if(canvas.dataset.hoverLayer==="ready")return;
    canvas.dataset.hoverLayer="ready";
    const panel=canvas.parentElement;
    const layer=document.createElement("canvas");
    layer.className="chart-focus-layer";
    const card=document.createElement("div");
    card.className="chart-hover-card";card.hidden=true;card.setAttribute("role","status");
    panel.append(layer,card);
    function size(){
      const rect=canvas.getBoundingClientRect(),pr=panel.getBoundingClientRect(),ratio=Math.max(1,devicePixelRatio||1);
      layer.style.left=(rect.left-pr.left+panel.scrollLeft)+"px";
      layer.style.top=(rect.top-pr.top+panel.scrollTop)+"px";
      layer.style.width=rect.width+"px";layer.style.height=rect.height+"px";
      layer.width=Math.max(1,Math.floor(rect.width*ratio));layer.height=Math.max(1,Math.floor(rect.height*ratio));
      const ctx=layer.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);
    }
    function draw(x,y,r=7){
      const ctx=layer.getContext("2d"),w=layer.clientWidth,h=layer.clientHeight;
      ctx.clearRect(0,0,w,h);ctx.save();ctx.strokeStyle="rgba(220,232,245,.45)";
      ctx.setLineDash([3,4]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,8);ctx.lineTo(x,h-34);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(x,y,r+5,0,Math.PI*2);ctx.fillStyle="rgba(220,232,245,.16)";ctx.fill();
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle="#f4f7fb";ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle="#172334";ctx.stroke();ctx.restore();
      layer.style.opacity="0";requestAnimationFrame(()=>layer.style.opacity="1");
    }
    function drawBar(x,y,width,height,color){
      const ctx=layer.getContext("2d"),w=layer.clientWidth,h=layer.clientHeight;
      ctx.clearRect(0,0,w,h);ctx.fillStyle="rgba(4,8,14,.48)";ctx.fillRect(0,0,w,h);
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=15;ctx.fillStyle=color;
      ctx.fillRect(x,y,width,height);ctx.shadowBlur=0;ctx.lineWidth=2;
      ctx.strokeStyle="rgba(255,255,255,.95)";ctx.strokeRect(x+.5,y+.5,Math.max(0,width-1),Math.max(0,height-1));
      ctx.restore();layer.style.opacity="0";requestAnimationFrame(()=>layer.style.opacity="1");
    }
    function show(e,title,lines){
      card.replaceChildren();const h=document.createElement("strong");h.textContent=title;card.appendChild(h);
      lines.forEach(t=>{const line=document.createElement("span");line.textContent=t;card.appendChild(line)});
      card.hidden=false;
      const pr=panel.getBoundingClientRect(),x=e.clientX-pr.left+14,y=e.clientY-pr.top+14;
      const maxX=Math.max(8,panel.clientWidth-card.offsetWidth-10),maxY=Math.max(8,panel.clientHeight-card.offsetHeight-10);
      card.style.left=clamp(x,8,maxX)+"px";card.style.top=clamp(y,8,maxY)+"px";
    }
    function hide(){layer.getContext("2d").clearRect(0,0,layer.clientWidth,layer.clientHeight);card.hidden=true}
    function move(e){
      size();
      const rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
      const id=canvas.id;
      if(id==="account-chart"){
        const series=(data.accounts||[]),visible=[...panel.querySelectorAll(".chart-toolbar button")].filter(b=>b.getAttribute("aria-pressed")==="true").map(b=>b.textContent);
        const active=series.filter(s=>!visible.length||visible.includes(s.name)),pts=active.flatMap(s=>(s.points||[]).map(p=>({s,p})));
        const labels=[...new Set(pts.map(v=>v.p.x))].sort(),g={l:62,r:18,t:18,b:42};
        if(!labels.length)return hide();
        const day=labels[clamp(Math.round((mx-g.l)/(rect.width-g.l-g.r)*(labels.length-1)),0,labels.length-1)];
        const candidates=pts.filter(v=>v.p.x===day).map(v=>({ ...v,x:g.l+(rect.width-g.l-g.r)*labels.indexOf(day)/Math.max(1,labels.length-1),y:g.t+(rect.height-g.t-g.b)-(v.p.y-Math.min(0,...pts.map(z=>z.p.y)))/(Math.max(1,...pts.map(z=>z.p.y))-Math.min(0,...pts.map(z=>z.p.y)))*(rect.height-g.t-g.b)}));
        const hit=candidates.sort((a,b)=>Math.hypot(a.x-mx,a.y-my)-Math.hypot(b.x-mx,b.y-my))[0];
        if(!hit||Math.hypot(hit.x-mx,hit.y-my)>38)return hide();
        draw(hit.x,hit.y,8);show(e,day,active.map(s=>{const p=(s.points||[]).find(v=>v.x===day);return p?s.name+": LKR "+fmt(p.y):null}).filter(Boolean));
      }else if(id==="cashflow-chart"){
        const series=(data.cashflows||[]),visible=[...panel.querySelectorAll(".chart-toolbar button")].filter(b=>b.getAttribute("aria-pressed")==="true").map(b=>b.textContent);
        const active=series.filter(s=>!visible.length||visible.includes(s.name)),dates=[...new Set(active.flatMap(s=>(s.points||[]).map(p=>p.x)))].sort();
        if(!dates.length)return hide();
        const g={l:58,r:14,t:16,b:50},slot=(rect.width-g.l-g.r)/dates.length,min=Math.min(0,...active.flatMap(s=>s.points.map(p=>p.y))),max=Math.max(1,...active.flatMap(s=>s.points.map(p=>p.y))),range=max-min||1;
        let hit=null;
        active.forEach((s,si)=>s.points.forEach(p=>{const di=dates.indexOf(p.x),bw=Math.max(2,Math.min(15,slot/Math.max(1,active.length)*.72)),x=g.l+di*slot+slot/2+(si-(active.length-1)/2)*bw,y=g.t+(rect.height-g.t-g.b)-(p.y-min)/range*(rect.height-g.t-g.b),zero=g.t+(rect.height-g.t-g.b)-(0-min)/range*(rect.height-g.t-g.b);if(mx>=x-bw&&mx<=x+bw&&my>=Math.min(y,zero)-4&&my<=Math.max(y,zero)+4)hit={s,p,x,y}}));
        if(!hit)return hide();const zeroY=g.t+(rect.height-g.t-g.b)-(0-min)/range*(rect.height-g.t-g.b),barTop=Math.min(hit.y,zeroY),barHeight=Math.max(2,Math.abs(zeroY-hit.y));drawBar(hit.x-bw/2,barTop,bw,barHeight,palette[(hit.s.colorIndex??series.indexOf(hit.s))%8]);show(e,hit.p.x,[hit.s.name+": "+(hit.p.y<0?"−":"+")+"LKR "+fmt(Math.abs(hit.p.y))]);
      }else if(id==="maturity-chart"){
        const items=data.maturities||[];if(!items.length)return hide();
        const g={l:12,r:14,t:18,b:34},row=Math.max(24,(rect.height-g.t-g.b)/items.length),min=Math.min(...items.map(v=>dayDate(v.start))),max=Math.max(...items.map(v=>dayDate(v.end))),span=Math.max(1,max-min);
        const i=Math.floor((my-g.t-5)/row);if(i<0||i>=items.length)return hide();
        const v=items[i],x=g.l+(dayDate(v.start)-min)/span*(rect.width-g.l-g.r),width=Math.max(3,(dayDate(v.end)-dayDate(v.start))/span*(rect.width-g.l-g.r));
        if(mx<x-5||mx>x+width+5)return hide();drawBar(x,g.t+i*row+5,width,Math.min(15,row-7),palette[i%8]);
        show(e,v.name,[v.start+" → "+v.end,"Principal: LKR "+fmt(v.principal),"Expected interest: LKR "+fmt(v.interest),v.rate.toFixed(3)+"% p.a."]);
      }else if(id==="returns-chart"){
        const items=data.returns||[],total=items.reduce((n,v)=>n+Math.max(0,v.value),0);if(!total)return hide();
        const g={l:12,r:12,t:18},barY=g.t+35,barH=32;let x=g.l,hit=null;
        items.forEach((v,i)=>{const width=(rect.width-g.l-g.r)*Math.max(0,v.value)/total;if(my>=barY-6&&my<=barY+barH+6&&mx>=x&&mx<=x+width)hit={v,i,x:x+width/2,y:barY+barH/2};x+=width});
        if(!hit)return hide();const segWidth=(rect.width-g.l-g.r)*Math.max(0,hit.v.value)/total;drawBar(hit.x-segWidth/2,barY,segWidth,barH,palette[hit.i%8]);show(e,hit.v.name,["LKR "+fmt(hit.v.value),(hit.v.value/total*100).toFixed(2)+"% of displayed components"]);
      }
    }
    canvas.addEventListener("mousemove",move);
    canvas.addEventListener("mouseleave",hide);
    window.addEventListener("resize",size);size();
  }
  function scan(){document.querySelectorAll(".chart-panel canvas[id]").forEach(init)}
  scan();
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  window.addEventListener("resize",()=>requestAnimationFrame(scan));
})();