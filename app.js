const DEFAULT_STOCKS = [
  ['NVDA','Nvidia','AI GPU / datacentra'],['AVGO','Broadcom','AI akcelerátory / síťové čipy'],['AMD','Advanced Micro Devices','CPU / GPU / AI'],['TSM','Taiwan Semiconductor','foundry / výroba čipů'],['MU','Micron Technology','paměti DRAM/NAND'],['INTC','Intel','CPU / foundry'],['QCOM','Qualcomm','mobilní a edge čipy'],['TXN','Texas Instruments','analogové čipy'],['AMAT','Applied Materials','výrobní zařízení'],['ARM','Arm Holdings','IP architektura čipů'],['ASML','ASML Holding','EUV litografie'],['LRCX','Lam Research','výrobní zařízení'],['KLAC','KLA Corporation','kontrola a metrologie'],['ADI','Analog Devices','analog / mixed-signal'],['MRVL','Marvell Technology','datacentra / networking'],['NXPI','NXP Semiconductors','automotive / průmysl'],['ON','ON Semiconductor','power / automotive'],['MCHP','Microchip Technology','mikrokontroléry'],['MPWR','Monolithic Power','power management'],['GFS','GlobalFoundries','foundry']
].map(([symbol,name,segment])=>({symbol,name,segment,shares:0,buyPrice:0,quote:null,history:[],metrics:null,status:'waiting'}));

let stocks = JSON.parse(localStorage.getItem('stockCoachStocks') || 'null') || DEFAULT_STOCKS;
let apiKey = localStorage.getItem('finnhubApiKey') || '';
let selected = stocks[0]?.symbol || null;
let chart;

const $ = id => document.getElementById(id);
$('apiKey').value = apiKey;

function save(){localStorage.setItem('stockCoachStocks', JSON.stringify(stocks));}
function fmt(n,d=2){return Number.isFinite(n)?n.toLocaleString('cs-CZ',{minimumFractionDigits:d,maximumFractionDigits:d}):'–'}
function cls(n){return n>0?'green':n<0?'red':''}
function daysAgoUnix(days){return Math.floor((Date.now()-days*86400000)/1000)}
function nowUnix(){return Math.floor(Date.now()/1000)}

async function finnhub(path){
  if(!apiKey) throw new Error('Chybí Finnhub API key');
  const url = `https://finnhub.io/api/v1/${path}${path.includes('?')?'&':'?'}token=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function loadQuote(stock){
  stock.status = 'loading quote'; renderTable();
  const q = await finnhub(`quote?symbol=${encodeURIComponent(stock.symbol)}`);
  if(!q || !q.c) throw new Error('Bez ceny');
  stock.quote = q; stock.status='ok';
}

async function loadHistory(stock){
  stock.status = 'loading history'; renderTable();
  const data = await finnhub(`stock/candle?symbol=${encodeURIComponent(stock.symbol)}&resolution=D&from=${daysAgoUnix(370)}&to=${nowUnix()}`);
  if(data.s !== 'ok') throw new Error(data.s || 'Historie není dostupná');
  stock.history = data.t.map((t,i)=>({t, open:data.o[i], high:data.h[i], low:data.l[i], close:data.c[i], volume:data.v[i]}));
  stock.metrics = calcMetrics(stock.history);
  stock.status='ok';
}

async function refreshQuotes(){
  if(!apiKey) return alert('Nejdřív vlož Finnhub API key.');
  for(const s of stocks){try{await loadQuote(s)}catch(e){s.status=e.message}}
  $('lastUpdate').textContent = new Date().toLocaleTimeString('cs-CZ');
  save(); renderAll();
}

async function refreshHistory(){
  if(!apiKey) return alert('Nejdřív vlož Finnhub API key.');
  for(const s of stocks){try{await loadHistory(s)}catch(e){s.status=e.message}}
  save(); renderAll();
}

function calcMetrics(h){
  if(!h || h.length<30) return null;
  const closes = h.map(x=>x.close), last=closes.at(-1);
  const ret = n => closes.length>n ? (last/closes.at(-1-n)-1)*100 : null;
  const sma = n => closes.length>=n ? closes.slice(-n).reduce((a,b)=>a+b,0)/n : null;
  const high52 = Math.max(...h.map(x=>x.high));
  const low52 = Math.min(...h.map(x=>x.low));
  const rets = closes.slice(1).map((c,i)=>Math.log(c/closes[i]));
  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
  const vol = Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/(rets.length-1))*Math.sqrt(252)*100;
  const sma50=sma(50), sma200=sma(200), ytd=ret(252), m1=ret(21), m3=ret(63);
  const dd = (last/high52-1)*100;
  let signal='Neutrální'; let score=0;
  if(sma50 && sma200 && sma50>sma200){score+=2; signal='Uptrend'}
  if(m1!==null && m1<-8 && dd<-15){score+=2; signal='Dip ve sledování'}
  if(m3!==null && m3>10 && dd>-10){score+=2; signal='Silné momentum'}
  if(sma50 && last<sma50 && sma200 && last>sma200){score+=1; signal='Pullback k trendu'}
  if(sma200 && last<sma200){score-=2; signal='Pod SMA200 / riziko'}
  return {last, high52, low52, ret1m:m1, ret3m:m3, ret1y:ytd, drawdown:dd, sma50, sma200, vol, signal, score};
}

function renderStats(){
  let value=0, daily=0, year=[];
  stocks.forEach(s=>{ if(s.quote){value += (s.shares||0)*s.quote.c; daily += (s.shares||0)*(s.quote.d||0);} if(s.metrics?.ret1y!=null) year.push(s.metrics.ret1y); });
  $('portfolioValue').textContent = value?`${fmt(value)} US$`:'–';
  $('dailyPL').textContent = daily?`${fmt(daily)} US$`: '–'; $('dailyPL').className = cls(daily);
  $('avgYearReturn').textContent = year.length?`${fmt(year.reduce((a,b)=>a+b,0)/year.length)} %`:'–';
}

function renderTable(){
  $('stockTable').innerHTML = stocks.map(s=>{
    const q=s.quote, m=s.metrics;
    return `<tr onclick="selectStock('${s.symbol}')"><td><b>${s.symbol}</b><small>${s.status||''}</small></td><td>${s.name||''}<small>${s.segment||''}</small></td><td>${q?fmt(q.c):'–'}</td><td class="${cls(q?.dp)}">${q?fmt(q.dp)+' %':'–'}</td><td class="${cls(m?.ret1m)}">${m?.ret1m!=null?fmt(m.ret1m)+' %':'–'}</td><td class="${cls(m?.ret3m)}">${m?.ret3m!=null?fmt(m.ret3m)+' %':'–'}</td><td class="${cls(m?.ret1y)}">${m?.ret1y!=null?fmt(m.ret1y)+' %':'–'}</td><td class="${cls(m?.drawdown)}">${m?.drawdown!=null?fmt(m.drawdown)+' %':'–'}</td><td>${m?.sma50&&m?.sma200?fmt(m.sma50)+' / '+fmt(m.sma200):'–'}</td><td><span class="pill">${m?.signal||'–'}</span></td><td><button class="ghost" onclick="event.stopPropagation(); loadOneHistory('${s.symbol}')">1R</button> <button class="danger" onclick="event.stopPropagation(); removeStock('${s.symbol}')">Smazat</button></td></tr>`
  }).join('');
}

function renderChart(){
  const s=stocks.find(x=>x.symbol===selected); $('selectedSymbol').textContent=s?.symbol||'–';
  if(!s?.history?.length) return;
  const labels=s.history.map(x=>new Date(x.t*1000).toLocaleDateString('cs-CZ')); const data=s.history.map(x=>x.close);
  if(chart) chart.destroy();
  chart = new Chart($('priceChart'), {type:'line', data:{labels,datasets:[{label:s.symbol,data,tension:.25,pointRadius:0}]}, options:{responsive:true,plugins:{legend:{labels:{color:'#eef5ff'}}},scales:{x:{ticks:{color:'#91a3ba',maxTicksLimit:8},grid:{color:'rgba(145,163,186,.12)'}},y:{ticks:{color:'#91a3ba'},grid:{color:'rgba(145,163,186,.12)'}}}}});
}

function renderOpps(){
  const ranked = stocks.filter(s=>s.metrics).sort((a,b)=>(b.metrics.score-a.metrics.score)||((b.metrics.ret3m||0)-(a.metrics.ret3m||0))).slice(0,6);
  $('opportunities').innerHTML = ranked.length ? ranked.map(s=>{
    const m=s.metrics; let txt='';
    if(m.signal==='Dip ve sledování') txt='Silná akcie je níže od 52W maxima. Může dávat smysl sledovat potvrzení obratu, objemy a zprávy.';
    else if(m.signal==='Pullback k trendu') txt='Cena je pod kratším průměrem, ale nad SMA200. To často značí korekci v delším trendu.';
    else if(m.signal==='Silné momentum') txt='Výrazné 3M momentum a malý odstup od maxima. Spíš kandidát na trendové držení než levný nákup.';
    else if(m.signal==='Uptrend') txt='SMA50 je nad SMA200. Trend je technicky zdravější, ale sleduj valuaci a výsledky.';
    else txt='Bez jasné technické výhody. Počkej na lepší cenu nebo fundamentální impuls.';
    return `<div class="opp"><strong>${s.symbol} <span class="tag">${m.signal}</span></strong><p>1M ${fmt(m.ret1m)} %, 3M ${fmt(m.ret3m)} %, 1R ${fmt(m.ret1y)} %, od 52W high ${fmt(m.drawdown)} %.</p><p>${txt}</p></div>`
  }).join('') : '<p class="muted">Nejdřív načti denní data za 1 rok.</p>';
}

function renderAll(){renderStats();renderTable();renderChart();renderOpps();}
window.selectStock=sym=>{selected=sym;renderChart();};
window.removeStock=sym=>{stocks=stocks.filter(s=>s.symbol!==sym); if(selected===sym) selected=stocks[0]?.symbol; save(); renderAll();};
window.loadOneHistory=async sym=>{const s=stocks.find(x=>x.symbol===sym); try{await loadHistory(s); save(); renderAll();}catch(e){s.status=e.message;renderAll();}};

$('saveApiKey').onclick=()=>{apiKey=$('apiKey').value.trim();localStorage.setItem('finnhubApiKey',apiKey);alert('API key uložen.');};
$('loadDefault').onclick=()=>{stocks=DEFAULT_STOCKS; selected='NVDA'; save(); renderAll();};
$('refreshNow').onclick=refreshQuotes;
$('loadHistory').onclick=refreshHistory;
$('addStockForm').onsubmit=async e=>{e.preventDefault(); const symbol=$('newSymbol').value.trim().toUpperCase(); if(!symbol)return; if(stocks.some(s=>s.symbol===symbol)) return alert('Ticker už existuje.'); const s={symbol,name:$('newName').value.trim()||symbol,segment:'vlastní akcie',shares:+$('newShares').value||0,buyPrice:+$('newBuyPrice').value||0,quote:null,history:[],metrics:null,status:'new'}; stocks.unshift(s); selected=symbol; save(); renderAll(); if(apiKey){try{await loadQuote(s); await loadHistory(s);}catch(err){s.status=err.message;} save(); renderAll();} e.target.reset();};
$('exportJson').onclick=()=>{const blob=new Blob([JSON.stringify(stocks,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='stock-coach-data.json'; a.click();};
$('importJson').onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{stocks=JSON.parse(r.result); selected=stocks[0]?.symbol; save(); renderAll();}; r.readAsText(f);};
setInterval(refreshQuotes,60000);
renderAll();
