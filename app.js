const DEFAULTS = [
  ['NVDA','Nvidia','AI GPU / datacentra'],['AVGO','Broadcom','AI akcelerátory / síťové čipy'],['AMD','Advanced Micro Devices','CPU / GPU / AI'],['TSM','Taiwan Semiconductor Manufacturing','foundry / výroba čipů'],['MU','Micron Technology','paměti DRAM/NAND'],['INTC','Intel','CPU / foundry'],['QCOM','Qualcomm','mobilní a edge čipy'],['TXN','Texas Instruments','analogové čipy'],['AMAT','Applied Materials','výrobní zařízení'],['ARM','Arm Holdings','IP architektura čipů'],['ASML','ASML Holding','EUV litografie'],['LRCX','Lam Research','výrobní zařízení'],['KLAC','KLA Corporation','kontrola a metrologie'],['ADI','Analog Devices','analog / mixed-signal'],['MRVL','Marvell Technology','datacentra / networking'],['NXPI','NXP Semiconductors','automotive / průmysl'],['ON','ON Semiconductor','power / automotive'],['MCHP','Microchip Technology','mikrokontroléry'],['MPWR','Monolithic Power Systems','power management'],['GFS','GlobalFoundries','foundry']
].map(([symbol,name,segment])=>({symbol,name,segment,qty:0,buy:0,quote:null,history:[],metrics:null,error:''}));

let stocks = JSON.parse(localStorage.getItem('stocksV3') || 'null') || DEFAULTS;
let apiKey = localStorage.getItem('finnhubKey') || '';
let chart;

const $ = id => document.getElementById(id);
$('apiKey').value = apiKey;

function normalizeSymbol(s){ return (s||'').trim().toUpperCase().replace(/\.US$/,''); }
function save(){ localStorage.setItem('stocksV3', JSON.stringify(stocks)); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function fmt(n,d=2){ return Number.isFinite(n) ? n.toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d}) : '–'; }
function pct(n){ return Number.isFinite(n) ? `${n>=0?'+':''}${fmt(n)} %` : '–'; }
function cls(n){ return n>0?'pos':n<0?'neg':''; }
function setStatus(t){ $('status').textContent=t; }

async function finnhub(path){
  if(!apiKey) throw new Error('Chybí Finnhub API key');
  const url = `https://finnhub.io/api/v1/${path}${path.includes('?')?'&':'?'}token=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadQuote(stock){
  try{
    const data = await finnhub(`quote?symbol=${encodeURIComponent(stock.symbol)}`);
    if(!data || !data.c) throw new Error('Prázdná quote odpověď');
    stock.quote = { price:data.c, change:data.d, changePct:data.dp, prevClose:data.pc, time:data.t };
    stock.error='';
  }catch(e){ stock.error = `Quote: ${e.message}`; }
}

async function loadHistory(stock){
  try{
    const to = Math.floor(Date.now()/1000);
    const from = to - 370*24*60*60; // sekundy, ne milisekundy
    const data = await finnhub(`stock/candle?symbol=${encodeURIComponent(stock.symbol)}&resolution=D&from=${from}&to=${to}`);
    if(!data || data.s !== 'ok' || !Array.isArray(data.c) || data.c.length < 30){
      throw new Error(`Candle status: ${data?.s || 'neznámý'}`);
    }
    stock.history = data.t.map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10), close:data.c[i], open:data.o[i], high:data.h[i], low:data.l[i], volume:data.v[i]}));
    stock.metrics = calcMetrics(stock.history);
    stock.error='';
  }catch(e){ stock.error = `Historie: ${e.message}`; }
}

function calcMetrics(h){
  const c = h.map(x=>x.close).filter(Number.isFinite);
  const last = c.at(-1); if(!last) return null;
  const ret = days => c.length>days ? ((last/c[c.length-1-days])-1)*100 : null;
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const sma50 = avg(c.slice(-50)), sma200 = avg(c.slice(-200));
  const high52 = Math.max(...c), low52 = Math.min(...c);
  const offHigh = ((last/high52)-1)*100;
  const rsi = calcRsi(c,14);
  let score = 50;
  if(offHigh < -15 && offHigh > -45) score += 15;
  if(ret(63) > 0) score += 12;
  if(ret(21) < 0 && ret(252) > 0) score += 10;
  if(sma50 && sma200 && sma50 > sma200) score += 15;
  if(rsi && rsi < 35) score += 12;
  if(rsi && rsi > 75) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {last,ret1m:ret(21),ret3m:ret(63),ret1y:ret(Math.min(252,c.length-1)),sma50,sma200,high52,low52,offHigh,rsi,score};
}
function calcRsi(c,period){
  if(c.length <= period) return null;
  let gains=0, losses=0;
  for(let i=c.length-period;i<c.length;i++){ const diff=c[i]-c[i-1]; if(diff>=0) gains+=diff; else losses-=diff; }
  if(losses===0) return 100;
  const rs = gains/losses;
  return 100 - (100/(1+rs));
}

async function refreshQuotes(){
  setStatus('Načítám aktuální ceny…');
  for(const s of stocks){ s.symbol = normalizeSymbol(s.symbol); await loadQuote(s); await sleep(120); }
  save(); render(); setStatus('Ceny obnoveny'); $('lastRefresh').textContent = new Date().toLocaleTimeString('cs-CZ');
}
async function refreshAllHistory(){
  setStatus('Načítám roční historii postupně…');
  for(let i=0;i<stocks.length;i++){
    setStatus(`Historie ${i+1}/${stocks.length}: ${stocks[i].symbol}`);
    stocks[i].symbol = normalizeSymbol(stocks[i].symbol);
    await loadHistory(stocks[i]);
    save(); render();
    await sleep(900); // ochrana proti rate limitu free tarifu
  }
  setStatus('Roční historie načtena');
}

function render(){
  $('count').textContent = stocks.length;
  const tbody = $('tbody'); tbody.innerHTML='';
  stocks.forEach((s,i)=>{
    const m=s.metrics, q=s.quote;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td><strong>${s.symbol}</strong><small>${s.error || (s.history?.length ? s.history.length+' denních svíček' : 'bez historie')}</small></td>
      <td>${s.name||'–'}<small>${s.segment||''}</small></td>
      <td>${q?fmt(q.price)+' US$':'–'}</td>
      <td class="${cls(q?.changePct)}">${q?pct(q.changePct):'–'}</td>
      <td class="${cls(m?.ret1m)}">${pct(m?.ret1m)}</td>
      <td class="${cls(m?.ret3m)}">${pct(m?.ret3m)}</td>
      <td class="${cls(m?.ret1y)}">${pct(m?.ret1y)}</td>
      <td class="${cls(m?.offHigh)}">${pct(m?.offHigh)}</td>
      <td>${m?`${fmt(m.sma50)} / ${fmt(m.sma200)}`:'–'}</td>
      <td class="score">${m?m.score:'–'}</td>
      <td><button onclick="showChart(${i})">Graf</button> <button onclick="loadOneHistory(${i})">Historie</button> <button class="danger" onclick="removeStock(${i})">Smazat</button></td>`;
    tbody.appendChild(tr);
  });
  renderOpps();
}
function renderOpps(){
  const withM = stocks.filter(s=>s.metrics).sort((a,b)=>b.metrics.score-a.metrics.score);
  $('topPick').textContent = withM[0]?.symbol || '–';
  $('opportunities').innerHTML = withM.slice(0,6).map(s=>`<div class="opp"><strong>${s.symbol} · skóre ${s.metrics.score}</strong><div>${s.name}</div><p class="muted">1M ${pct(s.metrics.ret1m)}, 3M ${pct(s.metrics.ret3m)}, 1R ${pct(s.metrics.ret1y)}, od 52W high ${pct(s.metrics.offHigh)}, RSI ${fmt(s.metrics.rsi,1)}.</p></div>`).join('') || '<p class="muted">Nejdřív načti roční historii.</p>';
}
window.showChart = function(i){
  const s=stocks[i]; if(!s.history?.length){ setStatus('Nejdřív načti historii pro '+s.symbol); return; }
  $('chartTitle').textContent = `${s.symbol} – denní close za poslední rok`;
  const ctx=$('chart');
  if(chart) chart.destroy();
  chart = new Chart(ctx,{type:'line',data:{labels:s.history.map(x=>x.date),datasets:[{label:s.symbol,data:s.history.map(x=>x.close),tension:.25,pointRadius:0}]},options:{responsive:true,plugins:{legend:{labels:{color:'#edf5ff'}}},scales:{x:{ticks:{color:'#9fb0c6',maxTicksLimit:8},grid:{color:'#26364d'}},y:{ticks:{color:'#9fb0c6'},grid:{color:'#26364d'}}}}});
}
window.loadOneHistory = async function(i){ setStatus('Načítám historii '+stocks[i].symbol); await loadHistory(stocks[i]); save(); render(); showChart(i); setStatus('Hotovo'); }
window.removeStock = function(i){ stocks.splice(i,1); save(); render(); }

$('saveKey').onclick=()=>{ apiKey=$('apiKey').value.trim(); localStorage.setItem('finnhubKey',apiKey); setStatus('API key uložen'); };
$('loadDefault').onclick=()=>{ stocks=DEFAULTS.map(x=>({...x})); save(); render(); refreshQuotes(); };
$('refreshQuotes').onclick=refreshQuotes;
$('loadAllHistory').onclick=refreshAllHistory;
$('addStock').onclick=()=>{ const symbol=normalizeSymbol($('newSymbol').value); if(!symbol) return; stocks.push({symbol,name:$('newName').value||symbol,segment:'vlastní',qty:Number($('newQty').value||0),buy:Number($('newBuy').value||0),quote:null,history:[],metrics:null,error:''}); save(); render(); $('newSymbol').value=''; $('newName').value=''; };
$('exportJson').onclick=()=>{ const blob=new Blob([JSON.stringify(stocks,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='stock-coach-export.json'; a.click(); };

render();
if(apiKey) refreshQuotes();
setInterval(()=>{ if(apiKey) refreshQuotes(); }, 60_000);
