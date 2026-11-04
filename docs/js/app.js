/* Rota de Custos — lógica do site.
   Dados base: js/data.js · contornos: js/geo.js · preços reais: data/prices.json (gerado pelo coletor diário) */
(function(){
'use strict';
const {COUNTRIES, PROF, R, HOL, PRESETS, AP, GW, GW_DEFAULT, PRE, AIRLINES, AIRLINE_INFO, CONFIG} = window.TRIP_DATA;
const GEO = window.TRIP_GEO;
const I18N = window.TRIP_I18N;

/* ---------- idioma ---------- */
const LANGS = I18N.langs.map(l=>l[0]);
function detectLang(){
  try{ const s=localStorage.getItem('rota.lang'); if (LANGS.includes(s)) return s; }catch(e){}
  for (const l of (navigator.languages||[navigator.language||''])){ const k=(l||'').slice(0,2).toLowerCase(); if (LANGS.includes(k)) return k; }
  return 'en';
}
let LANG = detectLang(), LOC = I18N.locale[LANG];
const tx = (k, v={}) => String((I18N.ui[LANG]||{})[k] ?? I18N.ui.pt[k] ?? k).replace(/\{(\w+)\}/g,(_,x)=>v[x]??'');
const nightsW = n => n===1 ? tx('night') : tx('nights');
const regName = id => LANG==='pt' ? R[id][0] : ((I18N.regions[LANG]||{})[id] || R[id][0]);
const city = c => LANG==='pt' ? AP[c][2] : ((I18N.cities[LANG]||{})[c] || AP[c][2]);
const CN = code => ({...COUNTRIES[code], ...((I18N.countries[code]||{})[LANG]||{})});
const n1 = v => new Intl.NumberFormat(LOC,{minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
const makeProj = ([fn, rot, par]) => { let p=d3[fn](); if (rot) p=p.rotate(rot); if (par) p=p.parallels(par); return p; };

/* ---------- preços reais (preenchidos por data/prices.json) ---------- */
let PRICES = null;          // conteúdo do arquivo
let FLIGHTS = null;         // voos reais do aeroporto de saída atual (data/flights/XXX.json)
let CAL = {};               // calibração de hotel por região: {id: {m:{'AAAA-MM':fator}, avg}}
const calF = (id, ym) => { const c=CAL[id]; if (!c) return 1; return c.m[ym] ?? c.avg; };

for (const k in PROF){const m=PROF[k].reduce((a,b)=>a+b)/12; PROF[k]=PROF[k].map(v=>v/m)}

/* ---------- datas ---------- */
const DAY = 864e5;
const toT = s => Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10));
const iso = t => new Date(t).toISOString().slice(0,10);
let MES = [];
function setMonths(){ MES = d3.range(12).map(m=>new Intl.DateTimeFormat(LOC,{month:'short',timeZone:'UTC'}).format(Date.UTC(2021,m,15)).replace('.','')); }
setMonths();
const DOW = ['dom','seg','ter','qua','qui','sex','sáb'];
const fd = (t,y) => { const d=new Date(t), D=d.getUTCDate(), M=d.getUTCMonth(), Y=d.getUTCFullYear();
  if (LANG==='zh') return `${y?Y+'年':''}${M+1}月${D}日`;
  if (LANG==='en') return `${MES[M]} ${D}${y?', '+Y:''}`;
  return `${D} ${MES[M]}${y?' '+Y:''}`; };
const fdw = t => `${DOW[new Date(t).getUTCDay()]}, ${fd(t)}`;

/* ---------- modelo ---------- */
const CC = {BR:'BRA',US:'USA',CA:'CAN',MX:'MEX',CN:'CHN',JP:'JPN'};
function seasAt(p, t){
  const d=new Date(t), P=PROF[p];
  const pos=d.getUTCMonth()+(d.getUTCDate()-15.5)/30.4, i=Math.floor(pos), f=pos-i;
  return P[(i+12)%12]*(1-f)+P[(i+13)%12]*f;
}
function night(id, t, raw){
  const r=R[id], c=CC[id.slice(0,2)], s=iso(t), seas=seasAt(r[4],t);
  let hol=1, hn=null;
  for (const h of HOL) if (h.c===c && s>=h.a && s<=h.b && (!h.only||h.only.includes(id)) && h.m>hol){hol=h.m;hn=h.n}
  const dw=new Date(t).getUTCDay(), we=dw===5||dw===6;
  const hotel=r[1]*seas*hol*(we?(r[5]?0.93:1.08):1)*(raw?1:calF(id,s.slice(0,7)));
  const food=r[2]*(1+0.3*(seas-1))*(hol>1?1.05:1);
  const tr=r[3];
  return {t, hotel, food, tr, total:hotel+food+tr, hn, we};
}
const yearCache = {};
function yearAvg(id, y){
  const k=id+y; if (yearCache[k]) return yearCache[k];
  let s=0,n=0; for (let t=Date.UTC(y,0,1); t<Date.UTC(y+1,0,1); t+=DAY){s+=night(id,t).total;n++}
  return yearCache[k]=s/n;
}
function stay(id){
  const ci=toT(S.ci), co=toT(S.co), nights=[];
  for (let t=ci; t<co; t+=DAY) nights.push(night(id,t));
  const n=nights.length, sum=k=>nights.reduce((a,x)=>a+x[k],0);
  const avg=sum('total')/n, ya=yearAvg(id,new Date(ci).getUTCFullYear());
  return {id, name:regName(id), nights, avg, total:avg*n, delta:avg/ya-1, ya,
          hotel:sum('hotel')/n, food:sum('food')/n, tr:sum('tr')/n};
}

/* ---------- estado ---------- */
const GOALS = {price:[6,2,2], quality:[2,6,2], time:[2,2,6]};
const S = {goal:'price', origin:CONFIG.origin, curMode:'BRL', asc:true, country:'USA', ci:PRESETS[0].a, co:PRESETS[0].b, metric:'avg', sel:null, hov:null, cur:'BRL', rate:CONFIG.defaultUsdBrl};
let DATA = {}, ORDER = [];

/* moedas: R$ ou a moeda local do país escolhido (no Brasil, US$). FX = R$ por 1 unidade */
const CUR_OF = {BRA:'USD', USA:'USD', CAN:'CAD', MEX:'MXN', CHN:'CNY', JPN:'JPY'};
const SYM = {BRL:'R$', USD:'US$', CAD:'C$', MXN:'MX$', CNY:'CN¥', JPY:'JP¥'};
const FX = {BRL:1, USD:5.20, CAD:3.75, MXN:0.28, CNY:0.72, JPY:0.035};   // valores de partida; o site troca pelo câmbio do dia
const toCur = usd => usd*FX.USD/FX[S.cur];
const fmtCur = usd => SYM[S.cur]+'\u00a0'+Math.round(toCur(usd)).toLocaleString(LOC);
const fmtShort = usd => { const v=toCur(usd), p=SYM[S.cur]+' ';
  return v>=10000 ? p+new Intl.NumberFormat(LOC,{notation:'compact',maximumFractionDigits:v>=100000?0:1}).format(v) : p+Math.round(v).toLocaleString(LOC); };
const fmtPct = x => (x>=0?'+':'−')+n1(Math.abs(x*100))+'%';
const mval = (d, m=S.metric) => d[m];
const mfmt = (v, m=S.metric) => m==='delta' ? fmtPct(v) : fmtCur(v);
const nNights = () => Math.round((toT(S.co)-toT(S.ci))/DAY);

/* ---------- mapa ---------- */
const W=800, H=540;
const svg = d3.select('#map');
const gRoot = svg.append('g').attr('id','gRoot');
const gReg = gRoot.append('g'), gDot = gRoot.append('g'), gHl = gRoot.append('g'), gSel = gRoot.append('g');
let path, features, smallIds = new Set(), curK = 1;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function buildMap(){
  const code=S.country, topo=GEO[code];
  features = topojson.feature(topo, topo.objects[code]).features.filter(f=>R[f.properties.id]);
  const proj = makeProj(COUNTRIES[code].proj).fitExtent([[18,18],[W-18,H-18]], {type:'FeatureCollection',features});
  path = d3.geoPath(proj);
  smallIds = new Set(features.filter(f=>path.area(f)<45).map(f=>f.properties.id));
  gReg.selectAll('path').data(features, f=>f.properties.id).join('path')
    .attr('class','reg').attr('d',path).attr('tabindex',-1)
    .on('pointerenter pointermove', (e,f)=>hover(f.properties.id,e))
    .on('pointerleave', ()=>hover(null))
    .on('click', (e,f)=>select(f.properties.id));
  gDot.selectAll('circle').data(features.filter(f=>smallIds.has(f.properties.id)), f=>f.properties.id).join('circle')
    .attr('class','reg').attr('cx',f=>path.centroid(f)[0]).attr('cy',f=>path.centroid(f)[1]).attr('r',5)
    .on('pointerenter pointermove', (e,f)=>hover(f.properties.id,e))
    .on('pointerleave', ()=>hover(null))
    .on('click', (e,f)=>select(f.properties.id));
  gRoot.interrupt('zoom'); view=[W/2,H/2,W]; gRoot.attr('transform',null); curK=1;
  gSel.selectAll('*').remove(); gHl.selectAll('*').remove();
}

// zoom suave (interpolação de van Wijk & Nuij, a mesma do d3-zoom): aproxima e afasta numa curva contínua,
// e um novo clique no meio do movimento parte da posição atual, sem saltos
let view=[W/2,H/2,W];   // [centro x, centro y, largura visível]
function applyView(v){
  const k=W/v[2];
  gRoot.attr('transform',`translate(${W/2-v[0]*k},${H/2-v[1]*k}) scale(${k})`);
  gDot.selectAll('circle').attr('r',5/k);
  curK=k;
}
function zoomTo(id){
  let target=[W/2,H/2,W];
  if (id){
    const f=features.find(x=>x.properties.id===id);
    let [[x0,y0],[x1,y1]] = path.bounds(f);
    if (smallIds.has(id)){const [cx,cy]=path.centroid(f);x0=cx-12;x1=cx+12;y0=cy-12;y1=cy+12}
    const k=Math.min(7, 0.62/Math.max((x1-x0)/W,(y1-y0)/H));
    target=[(x0+x1)/2,(y0+y1)/2,W/k];
  }
  document.getElementById('mapwrap').classList.toggle('zoomed', !!id);
  gRoot.interrupt('zoom');
  if (reduce){ view=target; applyView(view); return; }
  const i=d3.interpolateZoom(view, target);
  gRoot.transition('zoom').duration(Math.min(1300, Math.max(800, i.duration*0.6))).ease(d3.easeCubicInOut)
    .tween('zoom',()=>t=>{ view=i(t); applyView(view); })
    .on('end',()=>{ view=target; applyView(view); });
}

/* ---------- escalas de cor ---------- */
const DELTA_T = [-0.10,-0.03,0.03,0.10,0.20];
let binOf = ()=>0, ticks = [];
function buildScale(){
  const vals = ORDER.map(id=>mval(DATA[id]));
  if (S.metric==='delta'){
    binOf = v => 'd'+d3.bisectRight(DELTA_T, v);
    ticks = DELTA_T.map(fmtPct);
  } else {
    const q = d3.scaleQuantile().domain(vals).range([0,1,2,3,4]);
    binOf = v => 'b'+q(v);
    ticks = q.quantiles().map(fmtShort);
  }
}

/* ---------- render ---------- */
function sortOrder(){ ORDER = Object.keys(DATA).sort((a,b)=>(S.asc?1:-1)*(mval(DATA[a])-mval(DATA[b]))); }
function compute(){
  DATA = {};
  for (const f of features) DATA[f.properties.id] = stay(f.properties.id);
  sortOrder();
}
function countryAgg(){
  const ids=Object.keys(DATA), n=ids.length;
  const nights = DATA[ids[0]].nights.map((x,i)=>({t:x.t, total:d3.mean(ids,id=>DATA[id].nights[i].total),
     hn: ids.some(id=>DATA[id].nights[i].hn) ? DATA[ids.find(id=>DATA[id].nights[i].hn)].nights[i].hn : null}));
  const avg=d3.mean(ids,id=>DATA[id].avg), ya=d3.mean(ids,id=>DATA[id].ya);
  return {name:CN(S.country).name, nights, avg, total:avg*nights.length, delta:avg/ya-1, ya};
}

function render(){
  syncCur();
  const C=CN(S.country), n=nNights();
  document.getElementById('title').textContent=C.title;
  document.getElementById('cname').textContent=C.name;
  document.getElementById('periodSub').textContent=`${fd(toT(S.ci),1)} → ${fd(toT(S.co),1)} · ${n} ${nightsW(n)}`;
  document.getElementById('nights').textContent=`${n} ${nightsW(n)}`;
  buildScale();

  gReg.selectAll('path').attr('class', f=>`reg ${binOf(mval(DATA[f.properties.id]))}${S.sel&&S.sel!==f.properties.id?' dim':''}`);
  gDot.selectAll('circle').attr('class', f=>`reg ${binOf(mval(DATA[f.properties.id]))}${S.sel&&S.sel!==f.properties.id?' dim':''}`);
  gSel.selectAll('path').data(S.sel?features.filter(f=>f.properties.id===S.sel):[]).join('path').attr('class','outline').attr('d',path);

  // KPI
  const focus = S.sel ? DATA[S.sel] : countryAgg();
  const crumb=document.getElementById('crumb'); crumb.innerHTML='';
  if (S.sel){
    const b=document.createElement('button'); b.textContent=C.name; b.onclick=()=>select(null);
    const sp=document.createElement('span'); sp.className='sep'; sp.textContent='/';
    const cu=document.createElement('span'); cu.className='cur'; cu.textContent=focus.name;
    crumb.append(b,sp,cu);
  } else crumb.textContent=C.name;
  setBig(mval(focus));
  document.getElementById('bigLbl').textContent = {avg:tx('big_avg'), total:tx('big_total',{n,nights:nightsW(n)}),
     delta: focus.delta>=0?tx('big_above'):tx('big_below')}[S.metric];

  // legenda
  const nb = S.metric==='delta'?6:5;
  const sw=document.getElementById('sw');
  sw.innerHTML = Array.from({length:nb},(_,i)=>`<i class="${S.metric==='delta'?'d':'b'}${i}" style="background:var(--${S.metric==='delta'?['s3','s1','neutral','w0','w1','w2'][i]:'s'+i})"></i>`).join('');
  document.getElementById('ticks').innerHTML = ticks.map((t,i)=>`<span style="left:${(i+1)/nb*100}%">${t}</span>`).join('');

  // ranking
  document.getElementById('rankCount').textContent = `${ORDER.length} ${C.unit}`;
  document.getElementById('rankMetric').textContent = {avg:tx('tab_avg_l'),total:tx('tab_total_l'),delta:tx('tab_delta_l')}[S.metric] + (S.asc?' ↑':' ↓');
  renderRank();
  renderDays(focus);
  renderFlights();
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c.dataset.a===S.ci && c.dataset.b===S.co));
}

/* ---------- número grande com contagem animada ---------- */
let bigPrev={m:null,v:null};
function setBig(v){
  const el=document.getElementById('bigVal'), m=S.metric;
  d3.select(el).interrupt('big');
  if (!reduce && bigPrev.m===m && bigPrev.v!=null && bigPrev.v!==v){
    const i=d3.interpolateNumber(bigPrev.v, v);
    d3.select(el).transition('big').duration(600).ease(d3.easeCubicOut).tween('t',()=>t=>{el.textContent=mfmt(i(t),m)});
  } else if (!reduce && bigPrev.m!==m && bigPrev.m!=null){
    el.style.opacity=0; setTimeout(()=>{el.textContent=mfmt(v,m); el.style.opacity=1},120);
  } else el.textContent=mfmt(v,m);
  bigPrev={m,v};
}

/* ---------- ranking com reordenação animada (FLIP) ---------- */
const rowEls=new Map(); let rankCountry=null;
function renderRank(){
  const ol=document.getElementById('rank');
  const vals=ORDER.map(id=>mval(DATA[id])), max=d3.max(vals.map(Math.abs))||1;
  let fresh=false;
  if (rankCountry!==S.country){
    ol.innerHTML=''; rowEls.clear(); rankCountry=S.country; fresh=true; ol.scrollTop=0;
    for (const id of ORDER){
      const li=document.createElement('li');
      li.innerHTML=`<button class="rk" data-id="${id}"><span class="i num"></span><span class="n">${DATA[id].name}</span><span class="v num"></span><span class="track"><span class="fill" style="width:0%"></span></span></button>`;
      ol.appendChild(li); rowEls.set(id,li);
    }
    void ol.offsetWidth;
  }
  const first=new Map(); if (!fresh) rowEls.forEach((li,id)=>{ first.set(id,li.getBoundingClientRect().top); li.getAnimations().forEach(x=>x.cancel()); });
  ORDER.forEach((id,i)=>{
    const li=rowEls.get(id), b=li.firstChild, v=mval(DATA[id]);
    b.classList.toggle('on', S.sel===id);
    b.querySelector('.i').textContent=i+1;
    b.querySelector('.v').textContent=mfmt(v);
    const f=b.querySelector('.fill');
    f.className='fill'+(S.metric==='delta'?(v>=0?' pos':' neg'):'');
    f.style.width=Math.max(2,Math.abs(v)/max*100)+'%';
    ol.appendChild(li);
  });
  if (!fresh && !reduce) rowEls.forEach((li,id)=>{
    const dy=first.get(id)-li.getBoundingClientRect().top;
    if (Math.abs(dy)>0.5) li.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:640,easing:'cubic-bezier(.22,1,.36,1)'});
  });
}

/* ---------- gráfico noite a noite ---------- */
let daysFocus=null;
const T = () => d3.transition().duration(reduce?0:520).ease(d3.easeCubicInOut);
function renderDays(focus){
  daysFocus=focus;
  if (!document.getElementById('days')){ renderYear(); return; }   // seção "Noite a noite" removida
  const el=document.getElementById('days'), w=Math.max(260, el.clientWidth||460), h=168, m={t:24,r:4,b:34,l:4};
  el.setAttribute('viewBox',`0 0 ${w} ${h}`); el.setAttribute('width',w);
  const N=focus.nights, n=N.length;
  const x=d3.scaleBand().domain(d3.range(n)).range([m.l,w-m.r]).paddingInner(n>40?0.15:0.25);
  const ymax=d3.max([...N.map(d=>d.total), focus.ya])*1.08;
  const y=d3.scaleLinear().domain([0,ymax]).range([h-m.b,m.t]);
  const s=d3.select(el);
  if (!el.__init){
    s.append('g').attr('class','gbars'); s.append('line').attr('class','avgl');
    s.append('text').attr('class','avgt num').attr('text-anchor','end');
    s.append('g').attr('class','gax'); s.append('g').attr('class','ghit'); el.__init=true;
  }
  const t=T(), bw=x.bandwidth(), rx=Math.min(3,bw/3);
  s.select('.gbars').selectAll('rect').data(N,(d,i)=>i).join(
      en=>en.append('rect').attr('x',(d,i)=>x(i)).attr('width',bw).attr('y',y(0)).attr('height',0),
      up=>up,
      ex=>ex.transition(t).attr('y',y(0)).attr('height',0).style('opacity',0).remove())
    .attr('class',d=>'bar'+(d.hn?' hol':'')).attr('rx',rx)
    .transition(t).attr('x',(d,i)=>x(i)).attr('width',bw).attr('y',d=>y(d.total)).attr('height',d=>y(0)-y(d.total));
  // média do ano
  s.select('.avgl').attr('x1',m.l).attr('x2',w-m.r).transition(t).attr('y1',y(focus.ya)).attr('y2',y(focus.ya));
  s.select('.avgt').text('- - média anual '+fmtShort(focus.ya)).attr('x',w-m.r).attr('y',10);
  // eixo x
  const step = n<=10?1 : n<=21?2 : n<=45?7 : 14;
  const ax=s.select('.gax'); ax.selectAll('*').remove();
  N.forEach((d,i)=>{
    const dt=new Date(d.t), cx=x(i)+x.bandwidth()/2, first=i===0||dt.getUTCDate()===1;
    if (i%step===0 || first){
      ax.append('text').attr('class','num').attr('x',cx).attr('y',h-m.b+14).attr('text-anchor','middle').text(dt.getUTCDate());
      if (n<=14) ax.append('text').attr('class','wk').attr('x',cx).attr('y',h-m.b+27).attr('text-anchor','middle').text(DOW[dt.getUTCDay()].slice(0,3));
      else if (first) ax.append('text').attr('class','wk').attr('x',cx).attr('y',h-m.b+27).attr('text-anchor','middle').text(MES[dt.getUTCMonth()]);
    }
  });
  // área de toque
  ax.style('opacity',0).transition().duration(reduce?0:300).delay(reduce?0:180).style('opacity',1);
  s.select('.ghit').selectAll('rect').data(N).join('rect').attr('class','hit')
    .attr('x',(d,i)=>x(i)-x.step()*x.paddingInner()/2).attr('width',x.step()).attr('y',0).attr('height',h-m.b)
    .on('pointerenter',(e,d)=>{const i=N.indexOf(d); s.selectAll('.bar').classed('act',(_,j)=>j===i); readout(d)})
    .on('pointerleave',()=>{s.selectAll('.bar').classed('act',false); readout(null)});
  const who=document.getElementById('daysWho');
  who.textContent = `Noite a noite · ${S.sel ? focus.name : COUNTRIES[S.country].name}`;
  readout(null);
  renderYear();
}

/* ---------- melhor época: próximos 12 meses ---------- */
const NOW = new Date(); const Y0 = NOW.getUTCFullYear(), M0 = NOW.getUTCMonth();
const monthCache = {};
function monthAvg(id, y, m){
  const k=id+y+'-'+m; if (monthCache[k]) return monthCache[k];
  let s=0,n=0; for (let t=Date.UTC(y,m,1); t<Date.UTC(y,m+1,1); t+=DAY){s+=night(id,t).total;n++}
  return monthCache[k]=s/n;
}
let yearCells=[];
function renderYear(){
  const ids = S.sel ? [S.sel] : Object.keys(DATA);
  yearCells = d3.range(12).map(k=>{
    const y=Y0+Math.floor((M0+k)/12), m=(M0+k)%12;
    return {y, m, v:d3.mean(ids,id=>monthAvg(id,y,m))};
  });
  const q=d3.scaleQuantile().domain(yearCells.map(c=>c.v)).range([0,1,2,3]);
  const lo=d3.least(yearCells,c=>c.v);
  const ci=toT(S.ci), co=toT(S.co);
  const box=document.getElementById('year');
  if (!box.children.length) box.innerHTML = yearCells.map((c,i)=>`<button class="mc" data-i="${i}"><i></i><span></span></button>`).join('');
  yearCells.forEach((c,i)=>{
    const b=box.children[i], inP = Date.UTC(c.y,c.m+1,1)>ci && Date.UTC(c.y,c.m,1)<co;
    b.querySelector('i').style.background=`var(--yr${q(c.v)})`;
    b.querySelector('span').textContent=MES[c.m];
    b.classList.toggle('in', inP); b.classList.toggle('lo', c===lo);
    b.setAttribute('aria-label', `${MES[c.m]} ${c.y}: ${fmtCur(c.v)} ${tx('per_night')}`);
  });
  document.getElementById('yearWho').textContent = tx('best_season');
  document.getElementById('year').title=tx('year_hint');
  yearRead(null);
}
function yearRead(c){
  const el=document.getElementById('yearRead');
  if (c){ el.innerHTML=`${MES[c.m]} ${c.y} · <b>${fmtShort(c.v)}</b> ${tx('per_night')}`; return; }
  const lo=d3.least(yearCells,x=>x.v), hi=d3.greatest(yearCells,x=>x.v);
  el.innerHTML=`<span class="yb">${tx('best')}: <b>${MES[lo.m]}</b> ${fmtShort(lo.v)}</span> <span class="yw">${tx('worst')}: <b>${MES[hi.m]}</b> ${fmtShort(hi.v)}</span>`;
}
document.getElementById('year').addEventListener('pointerover',e=>{const b=e.target.closest('.mc'); if(b) yearRead(yearCells[+b.dataset.i])});
document.getElementById('year').addEventListener('pointerleave',()=>yearRead(null));
document.getElementById('year').addEventListener('click',e=>{
  const b=e.target.closest('.mc'); if(!b) return;
  const c=yearCells[+b.dataset.i], n=nNights();
  let start=Date.UTC(c.y,c.m,1);
  const today=Date.UTC(Y0,M0,NOW.getUTCDate());
  if (start<today) start=today+DAY;
  setDates(iso(start), iso(start+n*DAY));
});

function readout(d){
  const el=document.getElementById('readout'), f=daysFocus;
  if (d){ el.innerHTML=`${fdw(d.t)} · <b>${fmtCur(d.total)}</b>${d.hn?' · '+d.hn:''}`; return; }
  const lo=d3.least(f.nights,x=>x.total), hi=d3.greatest(f.nights,x=>x.total);
  el.innerHTML = f.nights.length>1 ? `↓ <b>${fd(lo.t)} ${fmtShort(lo.total)}</b> &nbsp;↑ <b>${fd(hi.t)} ${fmtShort(hi.total)}</b>` : `<b>${fmtCur(lo.total)}</b>`;
}

/* ---------- voos saindo de Vitória (VIX) ---------- */
function km(a,b){const R=6371,r=Math.PI/180,dl=(b[0]-a[0])*r,dn=(b[1]-a[1])*r;
  const h=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(h));}
// Demanda saindo do Brasil (alta temporada brasileira) + feriado no destino
function brSeason(t){
  const d=new Date(t), m=d.getUTCMonth(), day=d.getUTCDate(), s=iso(t);
  if ((m===11&&day>=15)||m===0) return 1.35;
  const inH = n => HOL.some(h=>h.c==='BRA' && h.n===n && !h.only && s>=h.a && s<=h.b);
  if (inH('Carnaval')) return 1.25;
  if (m===6) return 1.30;
  if (inH('Semana Santa')) return 1.15;
  if (m===1&&day<=5) return 1.15;
  return 0.95;
}
// capitais com voos diretos entre si nas companhias domésticas (aproximação)
const MAJOR = new Set(['GRU','CGH','GIG','BSB','CNF','SSA','REC','FOR','POA','CWB','FLN','VCP','BEL','MAO','NAT','MCZ','GYN','VIX','CGB','CGR','SLZ','JPA','AJU','THE']);
const CAR_KM = 300;   // abaixo disso, a sugestão é ir de carro
const flyH = d => d/780 + 0.7;
function itinerary(al, gwCode, firstNight){
  const O=S.origin, OA=AP[O], G=AP[gwCode];
  if (km(OA,G) < CAR_KM) return null;
  const season = (brSeason(toT(S.ci))+brSeason(toT(S.co)))/2 * (firstNight&&firstNight.hn?1.08:1);
  // companhias domésticas (Brasil): direto entre capitais grandes ou com conexão num hub da companhia
  if (al.hubs){
    const lay=al.lay||1.5, dOG=km(OA,G); let best=null;
    if ((MAJOR.has(O) && MAJOR.has(gwCode)) || al.hubs.includes(O) || al.hubs.includes(gwCode)) best={t:flyH(dOG), route:[O,gwCode], kmTot:dOG};
    for (const h of al.hubs){
      if (h===O || h===gwCode) continue;
      const a=km(OA,AP[h]), b=km(AP[h],G); if (a<40 || b<40) continue;
      const t=flyH(a)+lay+flyH(b);
      if (!best || t<best.t-0.01) best={t, route:[O,h,gwCode], kmTot:a+b};
    }
    if (!best) return null;
    return { al, t:best.t, fare:(al.base+al.km*best.kmTot)*season, stops:best.route.length-2, route:best.route };
  }
  // internacionais: origem → hub brasileiro da companhia (al.pre) → [conexão] → destino
  const lay=al.lay||2.5, preD = al.pre ? km(OA,AP[al.pre]) : 0;
  const feeder = al.pre && preD >= 40;                    // precisa de voo até o hub?
  const preT = feeder ? flyH(preD)+2.5 : 0;
  let best=null;
  for (const [code,h] of Object.entries(al.dest)){
    const D=AP[code], dist=km(D,G); let leg;
    if (dist<40) leg={t:0, kind:'none'};
    else if (dist<250) leg={t:dist/75+0.5, kind:'ground', dist};
    else if (al.dom) leg={t:lay+flyH(dist), kind:'fly', dist};
    else continue;
    const t = preT + (al.via?al.via[1]+al.via[2]:0) + h + leg.t;
    if (!best || t<best.t) best={t, code, leg};
  }
  if (!best) return null;
  const k=al.km!=null?al.km:0.08, fix=al.km!=null?40:70;
  const extra = (feeder ? Math.min(140, 30+preD*0.04) : -40)   // trecho até o hub (ou economia de quem já sai dele)
              + (best.leg.kind==='fly' ? fix+best.leg.dist*k : best.leg.kind==='ground' ? 30 : 0);
  const route = [O, feeder?al.pre:null, al.via?al.via[0]:null, best.code].filter(Boolean);
  if (best.leg.kind==='fly') route.push(gwCode);
  return { al, t:best.t, fare: Math.max(150, al.base*season+extra), stops: route.length-2, route,
           ground: best.leg.kind==='ground' ? tx('by_land_t',{km:Math.round(best.leg.dist),city:city(gwCode)}) : null,
           us: al.via&&al.via[3]==='us', same: al.via&&al.via[3]==='same' };
}
const fmtH = h => { const m=Math.round(h*60); return `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`; };
const flEls = new Map(); let flKey=null, flAll=false;
const FL_SHOW = 4; let flOrder='';
// altura da lista acompanha com transição: as linhas fora do top 4 ficam abaixo, recortadas e com fade
function fitFl(ol){
  const lis=[...ol.children], show=flAll?lis.length:Math.min(FL_SHOW,lis.length);
  ol.style.height = lis.slice(0,show).reduce((h,l)=>h+l.offsetHeight,0)+'px';
}
function liveFlights(gw){
  const f = FLIGHTS && FLIGHTS.origin===S.origin && FLIGHTS.flights && FLIGHTS.flights[AP[gw][3] || gw];   // cidades sem aeroporto usam o aeroporto de referência
  const m = f && f[S.ci.slice(0,7)];
  if (!m || !m.airlines || !Object.keys(m.airlines).length) return null;
  return Object.entries(m.airlines).map(([code,x])=>{
    const info = AIRLINE_INFO[code] || {n:code, q:6.5};
    const stops = x.transfers ?? 1;
    return { al:{n:info.n, q:info.q}, fare:x.price, t:(x.dur? x.dur/60 : null), stops, live:true, link:x.link||null, dep:x.dep||null,
             route:[S.origin, gw], note: stops===0 ? tx('direct') : `${stops} ${stops===1?tx('stop'):tx('stops')}` };
  });
}
function renderFlights(){
  const id = S.sel || GW_DEFAULT[S.country], gw=GW[id];
  const first = DATA[id] ? DATA[id].nights[0] : null;
  const near = km(AP[S.origin],AP[gw]) < CAR_KM;
  const live = near ? null : liveFlights(gw);
  const opts = live || AIRLINES[S.country].map(al=>itinerary(al,gw,first)).filter(Boolean);
  // tempo desconhecido nos dados reais: usa a mediana das opções com tempo
  if (live){ const med=d3.median(opts.filter(o=>o.t),o=>o.t)||12; opts.forEach(o=>{ if(!o.t){o.t=med; o.tGuess=true;} }); }
  const [wp,wq,wt] = GOALS[S.goal];   // peso de preço, qualidade e tempo conforme o que a pessoa busca
  const [a,b,c] = (wp+wq+wt) ? [wp,wq,wt] : [1,1,1];
  if (!opts.length){ document.getElementById('fl').innerHTML=''; flEls.clear(); flKey=null; document.getElementById('flMore').hidden=true; }
  const nrm=(v,lo,hi,inv)=> hi-lo<1e-9 ? 1 : (inv ? (hi-v)/(hi-lo) : (v-lo)/(hi-lo));
  const [fL,fH]=d3.extent(opts,o=>o.fare), [tL,tH]=d3.extent(opts,o=>o.t), [qL,qH]=d3.extent(opts,o=>o.al.q);
  opts.forEach(o=>{ o.score=20+80*(a*nrm(o.fare,fL,fH,1) + b*nrm(o.al.q,qL,qH) + c*nrm(o.t,tL,tH,1))/(a+b+c); });
  opts.sort((x,y)=>y.score-x.score);
  document.querySelector('.fhead').hidden = !opts.length;
  document.getElementById('flWho').textContent = `${tx('flights')} · ${city(S.origin)} → ${city(gw)}`;
  const ym=S.ci.slice(0,7), [yy,mm]=ym.split('-');
  document.getElementById('flSrc').innerHTML = live
    ? `<span class="tag live">${tx('live_tag')}</span> ${tx('live_src',{m:MES[+mm-1]+' '+yy})}`
    : `<span class="tag">${tx('est_tag')}</span> ${tx('est_src')}`;

  const ol=document.getElementById('fl'), key=LANG+S.country+gw+(live?'L':'E')+ym, rebuild = key!==flKey;
  const order=opts.map(o=>o.al.n).join('|'), moved = !rebuild && order!==flOrder; flOrder=order;
  const pos=new Map(); if (moved) flEls.forEach((li,n)=>{ pos.set(n, li.getBoundingClientRect().top); li.getAnimations().forEach(x=>x.cancel()); });
  if (rebuild){ ol.innerHTML=''; flEls.clear(); flKey=key; flAll=false; }
  opts.forEach((o,i)=>{
    let li=flEls.get(o.al.n);
    if (!li){ li=document.createElement('li'); li.innerHTML=`<div class="fr${reduce?'':' enter'}" style="animation-delay:${i*35}ms"><span class="an"><b></b><small></small></span><span class="f"></span><span class="t"></span><span class="pts"></span></div>`; flEls.set(o.al.n,li); }
    const r=li.firstChild;
    r.classList.toggle('best', i===0);
    const nameHtml = o.link ? `<a href="${o.link}" target="_blank" rel="noopener sponsored">${o.al.n} ↗</a>` : o.al.n;
    r.querySelector('.an b').innerHTML = nameHtml + (o.us?`<span class="visa" title="${tx('us_visa_t')}">${tx('us_visa')}</span>`:'');
    const sm=r.querySelector('.an small');
    if (o.live){ sm.textContent = `${o.note}${o.dep?' · '+tx('out_on',{d:fd(toT(o.dep.slice(0,10)))}):''}`; sm.title=tx('live_t'); }
    else { const rt=o.route.map(c=>c[0]==='_'?city(c):c); sm.textContent = rt.join('→') + (o.ground?' '+tx('by_land'):''); sm.title = rt.join(' → ') + (o.same?tx('same_plane'):'') + (o.ground?` · ${o.ground}`:''); }
    const f=r.querySelector('.f'), t=r.querySelector('.t');
    f.textContent=fmtShort(o.fare); f.classList.toggle('hi', o.fare===fL);
    t.textContent=(o.tGuess?'~':'')+fmtH(o.t); t.classList.toggle('hi', !o.tGuess && o.t===tL);
    // nota única de custo-benefício (0–10): combina preço, qualidade e tempo conforme os pesos
    const f1=n1, pe=r.querySelector('.pts'), to=Math.round(o.score)/10, from=pe._v;
    pe.title=tx('score_t',{q:f1(o.al.q)}); pe._v=to;
    if (reduce || !Number.isFinite(from) || Math.abs(from-to)<0.05) pe.textContent=f1(to);
    else d3.select(pe).interrupt('pts').transition('pts').duration(520).ease(d3.easeCubicOut).tween('t',()=>{const ip=d3.interpolateNumber(from,to); return t=>{pe.textContent=f1(ip(t));};});
    li.classList.toggle('cut', !flAll && i>=FL_SHOW);
    ol.appendChild(li);
  });
  if (moved && !reduce) flEls.forEach((li,n)=>{ if(!pos.has(n)) return; const dy=pos.get(n)-li.getBoundingClientRect().top; if (Math.abs(dy)>0.5) li.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:640,easing:'cubic-bezier(.22,1,.36,1)'}); });
  fitFl(ol);
  if (!moved) fitFl(ol);
  const more=document.getElementById('flMore');
  more.hidden = opts.length<=FL_SHOW; more.textContent = flAll ? tx('show_less') : tx('show_all',{n:opts.length});

  const st = DATA[id], bo=opts[0];
  if (!bo){
    const d=Math.round(km(AP[S.origin],AP[gw]));
    const msg = d<40 ? tx('here',{city:city(gw)}) : tx('drive',{to:city(gw),km:d,from:city(S.origin)});
    document.getElementById('flTotal').innerHTML=`${msg} ${tx('stay_pp',{v:fmtCur(st.total)})}`; return;
  }
  document.getElementById('flTotal').innerHTML = tx('trip_total',{v:fmtCur(st.total + bo.fare),al:bo.al.n,n:nNights(),nights:nightsW(nNights())}) + (S.sel?'':tx('example',{r:st.name}));
}
document.getElementById('flMore').addEventListener('click',()=>{ flAll=!flAll; renderFlights(); });
// "O que você busca?": preço, qualidade ou tempo (pill deslizante igual ao das abas)
const goalEl=document.getElementById('goal'), goalInd=goalEl.querySelector('.tab-ind'), goalHov=goalEl.querySelector('.tab-hov');
const goalSel=()=>goalEl.querySelector('.tab[aria-selected="true"]');
function syncGoal(instant){
  if (instant) goalEl.classList.add('no-anim');
  placePill(goalInd, goalSel());
  if (instant){ void goalEl.offsetWidth; goalEl.classList.remove('no-anim'); }
}
goalEl.addEventListener('pointerover',e=>{ const b=e.target.closest('.tab'); if(!b) return;
  if (!goalEl.classList.contains('hovering')){ goalHov.style.transition='none'; placePill(goalHov,b); void goalHov.offsetWidth; goalHov.style.transition=''; }
  placePill(goalHov,b); goalEl.classList.add('hovering'); });
goalEl.addEventListener('pointerleave',()=>goalEl.classList.remove('hovering'));
goalEl.addEventListener('pointerup',e=>{ if(e.pointerType!=='mouse') setTimeout(()=>goalEl.classList.remove('hovering'),350); });
goalEl.addEventListener('click',e=>{
  const b=e.target.closest('.tab'); if(!b || b.dataset.g===S.goal) return;
  S.goal=b.dataset.g;
  goalEl.querySelectorAll('.tab').forEach(x=>{ const on=x===b; x.setAttribute('aria-selected',on); x.setAttribute('aria-checked',on); });
  placePill(goalInd,b); renderFlights();
});
window.addEventListener('resize',()=>syncGoal(true));

/* ---------- interação ---------- */
const tip=document.getElementById('tip'), wrap=document.getElementById('mapwrap');
function hover(id, e){
  S.hov=id;
  gHl.selectAll('path').data(id&&id!==S.sel?features.filter(f=>f.properties.id===id):[]).join('path').attr('class','hl').attr('d',path);
  document.querySelectorAll('.rk').forEach(b=>b.classList.toggle('hov', b.dataset.id===id));
  if (!id || !e){ tip.classList.remove('show'); return; }
  const d=DATA[id], n=nNights(), N=ORDER.length;
  const asc=[...ORDER].sort((p,q)=>mval(DATA[p])-mval(DATA[q])), ra=asc.indexOf(id)+1;
  const rankTxt = ra<=Math.ceil(N/2) ? tx('rank_cheap',{r:ra,n:N}) : tx('rank_exp',{r:N-ra+1,n:N});
  const row=(m,l)=>`<div class="tt-r${S.metric===m?' on':''}"><span>${l}</span><b class="num">${mfmt(d[m],m)}</b></div>`;
  tip.innerHTML = `<div class="tt-h"><b>${d.name}</b><span class="num">${rankTxt}</span></div>`
    + row('avg',tx('tab_avg_l')) + row('total',tx('tt_total',{n,nights:nightsW(n)})) + row('delta',tx('tab_delta_l'))
    + `<div class="tt-hr"></div><div class="tt-l num">${tx('hotel')} <b>${fmtShort(d.hotel)}</b> · ${tx('food')} <b>${fmtShort(d.food)}</b> · ${tx('transp')} <b>${fmtShort(d.tr)}</b>${CAL[id]?` · <span class="tag live">${tx('hotel_real')}</span>`:''}</div>`
    ;
  tip.classList.add('show');
  const r=wrap.getBoundingClientRect(), tw=tip.offsetWidth, th=tip.offsetHeight;
  let x=e.clientX-r.left+16, y=e.clientY-r.top-th/2;
  if (x+tw>r.width-8) x=e.clientX-r.left-tw-16;
  x=Math.max(8,x); y=Math.max(8,Math.min(y,r.height-th-8));
  tip.style.transform=`translate3d(${x}px,${y}px,0)`;
}
function select(id){
  S.sel = (id && S.sel!==id) ? id : null;
  hover(null);
  zoomTo(S.sel); render();
  if (S.sel){ const b=document.querySelector(`.rk[data-id="${S.sel}"]`); if (b) b.scrollIntoView({block:'nearest',behavior:reduce?'auto':'smooth'}); }
}
document.getElementById('rank').addEventListener('click',e=>{const b=e.target.closest('.rk'); if(b) select(b.dataset.id)});
document.getElementById('rank').addEventListener('pointerover',e=>{const b=e.target.closest('.rk'); if(b && b.dataset.id!==S.hov){S.hov=b.dataset.id;
  gHl.selectAll('path').data(b.dataset.id!==S.sel?features.filter(f=>f.properties.id===b.dataset.id):[]).join('path').attr('class','hl').attr('d',path);}});
document.getElementById('rank').addEventListener('pointerleave',()=>{S.hov=null; gHl.selectAll('*').remove()});

document.querySelectorAll('#tabs .tab').forEach(t=>t.addEventListener('click',()=>{
  S.metric=t.dataset.m; document.querySelectorAll('#tabs .tab').forEach(x=>x.setAttribute('aria-selected',x===t));
  sortOrder(); render();
}));

// abas: pill deslizante
const tabsEl=document.getElementById('tabs'), tabInd=tabsEl.querySelector('.tab-ind'), tabHov=tabsEl.querySelector('.tab-hov');
const placePill=(el,btn)=>{ el.style.width=btn.offsetWidth+'px'; el.style.transform=`translateX(${btn.offsetLeft}px)`; };
const selTab=()=>tabsEl.querySelector('.tab[aria-selected="true"]');
function syncTabs(instant){
  if (instant) tabsEl.classList.add('no-anim');
  placePill(tabInd, selTab());
  if (instant){ void tabsEl.offsetWidth; tabsEl.classList.remove('no-anim'); }
}
tabsEl.addEventListener('pointerover',e=>{ const b=e.target.closest('.tab'); if(!b) return;
  if (!tabsEl.classList.contains('hovering')){ tabHov.style.transition='none'; placePill(tabHov,b); void tabHov.offsetWidth; tabHov.style.transition=''; }
  placePill(tabHov,b); tabsEl.classList.add('hovering'); });
tabsEl.addEventListener('pointerleave',()=>tabsEl.classList.remove('hovering'));
tabsEl.addEventListener('pointerup',e=>{ if(e.pointerType!=='mouse') setTimeout(()=>tabsEl.classList.remove('hovering'),350); });
tabsEl.addEventListener('click',e=>{ if(e.target.closest('.tab')) requestAnimationFrame(()=>placePill(tabInd, selTab())); });
window.addEventListener('resize',()=>syncTabs(true));
requestAnimationFrame(()=>{ syncTabs(true); syncGoal(true); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ syncTabs(true); syncGoal(true); });

// países
const cbtn=document.getElementById('cbtn'), cmenu=document.getElementById('cmenu');
function fillMenu(){
  cmenu.innerHTML = Object.entries(COUNTRIES).map(([k,c])=>{
    const cnt = Object.keys(R).filter(id=>CC[id.slice(0,2)]===k).length;
    return `<li><button role="option" data-c="${k}" class="${k===S.country?'on':''}" aria-selected="${k===S.country}"><span class="nm">${CN(k).name}</span><span style="display:flex;gap:8px;align-items:center"><span class="cnt num">${cnt}</span><svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3 3 7-7"/></svg></span></button></li>`}).join('');
}
cbtn.addEventListener('click',e=>{e.stopPropagation(); const open=cmenu.hidden; fillMenu(); cmenu.hidden=!open; cbtn.setAttribute('aria-expanded',open); if(open){ fitMenu(); cmenu.querySelector('.on').focus(); }});
// mantém o menu inteiro dentro da tela, qualquer que seja a posição do botão
function fitMenu(){
  cmenu.style.marginLeft='0px';
  const r=cmenu.getBoundingClientRect(), vw=document.documentElement.clientWidth, pad=12;
  let dx=0; if (r.right>vw-pad) dx=(vw-pad)-r.right; if (r.left+dx<pad) dx=pad-r.left;
  cmenu.style.marginLeft=dx+'px';
}
window.addEventListener('resize',()=>{ if(!cmenu.hidden) fitMenu(); });
cmenu.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; cmenu.hidden=true; cbtn.setAttribute('aria-expanded',false);
  if (b.dataset.c!==S.country) switchCountry(b.dataset.c); cbtn.focus();});
function switchCountry(c){
  const g=document.getElementById('gRoot'); g.classList.add('out'); hover(null);
  setTimeout(()=>{ S.country=c; S.sel=null; document.getElementById('mapwrap').classList.remove('zoomed'); buildMap(); compute(); render();
    requestAnimationFrame(()=>g.classList.remove('out')); }, reduce?0:260);
}
document.getElementById('sort').addEventListener('click',()=>{ S.asc=!S.asc; sortOrder(); render(); });
document.addEventListener('click',e=>{ if(!cmenu.hidden && !e.target.closest('.country')){cmenu.hidden=true; cbtn.setAttribute('aria-expanded',false)} });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!cmenu.hidden){cmenu.hidden=true;cbtn.focus()} else if(S.sel) select(null);} });

// datas
const ciEl=document.getElementById('ci'), coEl=document.getElementById('co'), errEl=document.getElementById('err');
function setDates(a,b){
  const n=(toT(b)-toT(a))/DAY;
  if (!a||!b||isNaN(n)) return;
  if (n<1){ errEl.textContent=tx('err_order'); errEl.hidden=false; return; }
  if (n>90){ errEl.textContent=tx('err_max'); errEl.hidden=false; return; }
  errEl.hidden=true; S.ci=a; S.co=b; ciEl.value=a; coEl.value=b;
  coEl.min = iso(toT(a)+DAY);
  compute(); render();
}
ciEl.addEventListener('change',()=>{ let b=coEl.value; if(ciEl.value && toT(b)<=toT(ciEl.value)) b=iso(toT(ciEl.value)+DAY*nNights()); setDates(ciEl.value,b) });
coEl.addEventListener('change',()=>setDates(ciEl.value,coEl.value));

// moeda
const bBRL=document.getElementById('curBRL'), bLoc=document.getElementById('curLoc'), rateEl=document.getElementById('rate'), rateLbl=document.getElementById('rateLbl');
const locCur=()=>CUR_OF[S.country];
function syncCur(){
  const lc=locCur(); S.cur = S.curMode==='local' ? lc : 'BRL';
  bLoc.textContent=SYM[lc]; bLoc.title=lc;
  bBRL.setAttribute('aria-pressed',S.curMode==='BRL'); bLoc.setAttribute('aria-pressed',S.curMode==='local');
  rateLbl.textContent=`${SYM[lc]} 1 =`;
  if (document.activeElement!==rateEl) rateEl.value=FX[lc].toFixed(FX[lc]<1?3:2);
}
function setCur(mode){ S.curMode=mode; render(); }
bBRL.onclick=()=>setCur('BRL'); bLoc.onclick=()=>setCur('local');
rateEl.addEventListener('input',()=>{const v=parseFloat(rateEl.value.replace(',','.')); if(v>0){FX[locCur()]=v; render();}});

let rt; window.addEventListener('resize',()=>{clearTimeout(rt); rt=setTimeout(()=>daysFocus&&renderDays(daysFocus),120)});

/* ---------- preços reais: carga e aplicação ---------- */
function modelHotelMonth(id, ym){
  const [y,m]=ym.split('-').map(Number); let s=0,n=0;
  for (let t=Date.UTC(y,m-1,1); t<Date.UTC(y,m,1); t+=DAY){ s+=night(id,t,true).hotel; n++; }
  return s/n;
}
function applyPrices(){
  CAL={};
  const hot = (PRICES && PRICES.hotels) || {};
  for (const [id, months] of Object.entries(hot)){
    if (!R[id]) continue;
    const m={};
    for (const [ym,x] of Object.entries(months)){
      if (!x || !(x.nightly>0)) continue;
      m[ym] = Math.min(3, Math.max(0.4, x.nightly / modelHotelMonth(id, ym)));
    }
    const v=Object.values(m); if (v.length) CAL[id]={m, avg:d3.mean(v)};
  }
  if (PRICES && PRICES.usdBrl > 0) FX.USD = PRICES.usdBrl;
  if (PRICES && PRICES.fx) for (const k in PRICES.fx) if (PRICES.fx[k] > 0) FX[k] = PRICES.fx[k];
  for (const k in yearCache) delete yearCache[k];
  for (const k in monthCache) delete monthCache[k];
  const st=document.getElementById('status');
  if (PRICES && PRICES.updatedAt){
    const d=new Date(PRICES.updatedAt), nH=Object.keys(CAL).length;
    const when=d.toLocaleString(LOC,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    st.innerHTML=`<span class="dot"></span>${tx('updated',{d:when})}${nH?tx('hotels_real',{n:nH}):''}`;
  } else st.innerHTML=`<span class="dot off"></span>${tx('estimates')}`;
}
async function loadPrices(){
  try{
    const r = await fetch(CONFIG.pricesUrl + '?v=' + new Date().toISOString().slice(0,13), {cache:'no-cache'});
    if (!r.ok) throw new Error(r.status);
    PRICES = await r.json();
  }catch(e){ PRICES = null; }
  applyPrices(); compute(); render();
}

/* ---------- de onde a pessoa sai: detectado sozinho pela localização aproximada (IP), sem pedir nada ---------- */
function nearestOrigin(lat, lon){
  let best=CONFIG.origin, bd=Infinity;
  for (const c of CONFIG.origins){ const d=km([lat,lon],AP[c]); if (d<bd){ bd=d; best=c; } }
  return best;
}
async function loadFlights(){
  const want=S.origin;
  try{
    const r=await fetch(CONFIG.flightsDir + want + '.json?v=' + new Date().toISOString().slice(0,13), {cache:'no-cache'});
    if (!r.ok) throw new Error(r.status);
    const j=await r.json(); if (S.origin===want) FLIGHTS={...j, origin:want};
  }catch(e){ if (S.origin===want) FLIGHTS=null; }
  if (S.origin===want){ flKey=null; renderFlights(); }
}
function setOrigin(code){
  if (!AP[code]) return;
  if (code!==S.origin){ S.origin=code; FLIGHTS=null; flKey=null; render(); }
  loadFlights();
}
async function detectOrigin(){
  // guarda o resultado só durante a visita, para não repetir a consulta a cada recarga
  try{ const c=sessionStorage.getItem('rota.origin'); if (c && AP[c]) return setOrigin(c); }catch(e){}
  if (CONFIG.ipGeoUrl){
    try{
      const r=await fetch(CONFIG.ipGeoUrl,{cache:'no-store'}); const j=await r.json();
      const lat=parseFloat(j.latitude), lon=parseFloat(j.longitude);
      if (isFinite(lat) && isFinite(lon)){
        const c=nearestOrigin(lat,lon);
        try{ sessionStorage.setItem('rota.origin', c); }catch(e){}
        return setOrigin(c);
      }
    }catch(e){}
  }
  setOrigin(S.origin);   // sem localização: segue com a saída padrão
}

/* ---------- idioma e tema (círculo = claro/escuro, triângulo = idioma) ---------- */
function translateStatic(){
  document.documentElement.lang = LOC;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent=tx(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', tx(el.dataset.i18nAria)); el.title=tx(el.dataset.i18nAria); });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title=tx(el.dataset.i18nTitle); });
}
const langBtn=document.getElementById('langBtn'), langMenu=document.getElementById('langMenu'), themeBtn=document.getElementById('themeBtn');
function fillLangs(){
  langMenu.innerHTML = I18N.langs.map(([k,n])=>`<li><button role="option" data-l="${k}" aria-selected="${k===LANG}" lang="${I18N.locale[k]}">${n}</button></li>`).join('');
}
function setLang(l){
  if (!LANGS.includes(l) || l===LANG) return;
  LANG=l; LOC=I18N.locale[l];
  try{ localStorage.setItem('rota.lang', l); }catch(e){}
  setMonths(); translateStatic(); fillLangs();
  rankCountry=null; flKey=null; bigPrev={m:null,v:null};
  compute(); render(); syncTabs(true); syncGoal(true); applyPrices();
}
langBtn.addEventListener('click',e=>{ e.stopPropagation(); const open=langMenu.hidden; fillLangs(); langMenu.hidden=!open; langBtn.setAttribute('aria-expanded',open); if(open) langMenu.querySelector('[aria-selected="true"]').focus(); });
langMenu.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; langMenu.hidden=true; langBtn.setAttribute('aria-expanded',false); setLang(b.dataset.l); langBtn.focus(); });
document.addEventListener('click',e=>{ if(!langMenu.hidden && !e.target.closest('.langwrap')){ langMenu.hidden=true; langBtn.setAttribute('aria-expanded',false); } });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !langMenu.hidden){ langMenu.hidden=true; langBtn.setAttribute('aria-expanded',false); langBtn.focus(); } });
function setTheme(dark, save=true){
  if (dark) document.documentElement.dataset.theme='dark'; else document.documentElement.dataset.theme='light';
  themeBtn.setAttribute('aria-pressed', dark);
  const m=document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#0e0e10' : '#fcfcfc';
  if (save){ try{ localStorage.setItem('rota.theme', dark?'dark':'light'); }catch(e){} }
}
themeBtn.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme!=='dark'));

/* ---------- início ---------- */
const todayIso = new Date().toISOString().slice(0,10);
ciEl.min = todayIso; coEl.min = iso(toT(S.ci)+DAY);
ciEl.value=S.ci; coEl.value=S.co;
setTheme(document.documentElement.dataset.theme==='dark', false);
translateStatic();
buildMap(); applyPrices(); compute(); render();
loadPrices();
detectOrigin();

})();
