const DEFAULT_STOCKS = [
  {symbol:'NVDA', name:'Nvidia', segment:'AI GPU / datacentra', shares:0, buyPrice:0},
  {symbol:'AVGO', name:'Broadcom', segment:'AI akcelerátory / síťové čipy', shares:0, buyPrice:0},
  {symbol:'AMD', name:'Advanced Micro Devices', segment:'CPU / GPU / AI', shares:0, buyPrice:0},
  {symbol:'TSM', name:'Taiwan Semiconductor Manufacturing', segment:'foundry / výroba čipů', shares:0, buyPrice:0},
  {symbol:'MU', name:'Micron Technology', segment:'paměti DRAM/NAND', shares:0, buyPrice:0},
  {symbol:'INTC', name:'Intel', segment:'CPU / foundry', shares:0, buyPrice:0},
  {symbol:'QCOM', name:'Qualcomm', segment:'mobilní a edge čipy', shares:0, buyPrice:0},
  {symbol:'TXN', name:'Texas Instruments', segment:'analogové čipy', shares:0, buyPrice:0},
  {symbol:'AMAT', name:'Applied Materials', segment:'výrobní zařízení', shares:0, buyPrice:0},
  {symbol:'ARM', name:'Arm Holdings', segment:'IP architektura čipů', shares:0, buyPrice:0},
  {symbol:'ASML', name:'ASML Holding', segment:'EUV litografie', shares:0, buyPrice:0},
  {symbol:'LRCX', name:'Lam Research', segment:'výrobní zařízení', shares:0, buyPrice:0},
  {symbol:'KLAC', name:'KLA Corporation', segment:'kontrola a metrologie', shares:0, buyPrice:0},
  {symbol:'ADI', name:'Analog Devices', segment:'analog / mixed-signal', shares:0, buyPrice:0},
  {symbol:'MRVL', name:'Marvell Technology', segment:'datacentra / networking', shares:0, buyPrice:0},
  {symbol:'NXPI', name:'NXP Semiconductors', segment:'automotive / průmysl', shares:0, buyPrice:0},
  {symbol:'ON', name:'ON Semiconductor', segment:'power / automotive', shares:0, buyPrice:0},
  {symbol:'MCHP', name:'Microchip Technology', segment:'mikrokontroléry', shares:0, buyPrice:0},
  {symbol:'MPWR', name:'Monolithic Power Systems', segment:'power management', shares:0, buyPrice:0},
  {symbol:'GFS', name:'GlobalFoundries', segment:'foundry', shares:0, buyPrice:0}
];

const LS_STOCKS = 'stockCoachPro.stocks';
const LS_KEY = 'stockCoachPro.finnhubKey';
let stocks = loadStocks();
let priceHistory = {};
let selectedSymbol = 'NVDA';
let chart;

const $ = id => document.getElementById(id);
const money = n => Number.isFinite(n) ? n.toLocaleString('cs-CZ',{style:'currency',currency:'USD'}) : '—';
const pct = n => Number.isFinite(n) ? `${n>=0?'+':''}${n.toFixed(2)} %` : '—';

function loadStocks(){
  try { return JSON.parse(localStorage.getItem(LS_STOCKS)) || structuredClone(DEFAULT_STOCKS); }
  catch { return structuredClone(DEFAULT_STOCKS); }
}
function saveStocks(){ localStorage.setItem(LS_STOCKS, JSON.stringify(stocks)); }
function getKey(){ return localStorage.getItem(LS_KEY) || ''; }
function setStatus(text){ $('marketState').textContent = text; }
function setLastUpdate(){ $('lastUpdate').textContent = new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }

async function fetchQuote(symbol){
  const token = getKey();
  if(!token) throw new Error('Chybí Finnhub API key');
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if(!data || !Number.isFinite(data.c) || data.c <= 0) throw new Error(data.error || 'Bez ceny');
  return { price:data.c, change:data.d ?? null, changePct:data.dp ?? null, previousClose:data.pc ?? null, high:data.h ?? null, low:data.l ?? null };
}

async function refreshAll(){
  if(!getKey()) { setStatus('Vlož API klíč'); render(); return; }
  setStatus('Načítám ceny…'); $('loadingText').textContent = 'načítám…';
  let ok = 0, fail = 0;
  for(const stock of stocks){
    try{
      const q = await fetchQuote(stock.symbol);
      Object.assign(stock, q, {error:null, updatedAt:Date.now()});
      ok++;
      if(!priceHistory[stock.symbol]) priceHistory[stock.symbol] = [];
      priceHistory[stock.symbol].push({x:new Date(), y:q.price});
      priceHistory[stock.symbol] = priceHistory[stock.symbol].slice(-120);
    }catch(e){ stock.error = e.message; fail++; }
    render();
    await new Promise(r=>setTimeout(r, 250));
  }
  saveStocks(); setLastUpdate(); setStatus(fail ? `Načteno ${ok}, chyba ${fail}` : 'Aktuální'); $('loadingText').textContent = '';
}

function render(){
  $('stockCount').textContent = stocks.length;
  const body = $('stockTable'); body.innerHTML = '';
  let total = 0, cost = 0, dailyWeighted = 0, priced = 0;
  for(const s of stocks){
    const shares = Number(s.shares)||0, buy = Number(s.buyPrice)||0;
    const value = shares * (s.price||0), spent = shares * buy, pl = value - spent;
    total += value; cost += spent;
    if(Number.isFinite(s.changePct)){ dailyWeighted += s.changePct; priced++; }
    const tr = document.createElement('tr'); tr.onclick = () => { selectedSymbol = s.symbol; renderChart(); };
    tr.innerHTML = `
      <td><span class="symbol">${s.symbol}</span>${s.error?`<span class="sub negative">${s.error}</span>`:''}</td>
      <td>${s.name}<span class="sub">${s.segment||''}</span></td>
      <td contenteditable="true" data-field="shares" data-symbol="${s.symbol}">${shares}</td>
      <td contenteditable="true" data-field="buyPrice" data-symbol="${s.symbol}">${buy||'—'}</td>
      <td><strong>${money(s.price)}</strong><span class="sub">H ${money(s.high)} / L ${money(s.low)}</span></td>
      <td class="${(s.changePct||0)>=0?'positive':'negative'}">${pct(s.changePct)}<span class="sub">${money(s.change)}</span></td>
      <td>${shares ? money(value) : '<span class="pill">watchlist</span>'}</td>
      <td class="${pl>=0?'positive':'negative'}">${shares ? money(pl) : '—'}</td>
      <td><button class="delete" data-delete="${s.symbol}">Smazat</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll('[contenteditable]').forEach(cell=> cell.onblur = e => {
    const s = stocks.find(x=>x.symbol===e.target.dataset.symbol); if(!s) return;
    s[e.target.dataset.field] = Number(String(e.target.textContent).replace(',','.')) || 0; saveStocks(); render();
  });
  body.querySelectorAll('[data-delete]').forEach(btn=> btn.onclick = e => { e.stopPropagation(); stocks = stocks.filter(s=>s.symbol!==btn.dataset.delete); saveStocks(); render(); });
  $('portfolioValue').textContent = money(total);
  const pl = total - cost; $('portfolioPnL').textContent = `${money(pl)} ${cost ? `(${pct(pl/cost*100)})` : ''}`; $('portfolioPnL').className = pl>=0?'positive':'negative';
  $('dayChange').textContent = priced ? pct(dailyWeighted/priced) : '—'; $('dayChange').className = dailyWeighted>=0?'positive':'negative';
  renderSignals(); renderChart();
}

function renderSignals(){
  const priced = stocks.filter(s=>Number.isFinite(s.changePct));
  if(!priced.length){ $('signals').textContent = 'Čekám na data.'; return; }
  const best = [...priced].sort((a,b)=>b.changePct-a.changePct)[0];
  const worst = [...priced].sort((a,b)=>a.changePct-b.changePct)[0];
  $('signals').innerHTML = `<div class="signal-row"><span>Největší růst</span><strong class="positive">${best.symbol} ${pct(best.changePct)}</strong></div><div class="signal-row"><span>Největší propad</span><strong class="negative">${worst.symbol} ${pct(worst.changePct)}</strong></div>`;
}

function renderChart(){
  const s = stocks.find(x=>x.symbol===selectedSymbol) || stocks[0]; if(!s) return;
  $('chartTitle').textContent = `${s.symbol} – ${s.name}`;
  const hist = priceHistory[s.symbol] || (s.price ? [{x:new Date(),y:s.price}] : []);
  const labels = hist.map(p=>p.x.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}));
  const data = hist.map(p=>p.y);
  if(chart) chart.destroy();
  chart = new Chart($('stockChart'), { type:'line', data:{labels, datasets:[{label:s.symbol, data, tension:.35}]}, options:{plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#8fa0b9'}, grid:{color:'rgba(255,255,255,.06)'}}, y:{ticks:{color:'#8fa0b9'}, grid:{color:'rgba(255,255,255,.06)'}}}} });
}

$('apiKey').value = getKey();
$('saveKeyBtn').onclick = () => { localStorage.setItem(LS_KEY, $('apiKey').value.trim()); refreshAll(); };
$('clearKeyBtn').onclick = () => { localStorage.removeItem(LS_KEY); $('apiKey').value=''; render(); setStatus('Klíč smazán'); };
$('refreshBtn').onclick = refreshAll;
$('resetBtn').onclick = () => { stocks = structuredClone(DEFAULT_STOCKS); saveStocks(); render(); refreshAll(); };
$('exportBtn').onclick = () => { const blob = new Blob([JSON.stringify({stocks},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='stock-coach-portfolio.json'; a.click(); URL.revokeObjectURL(a.href); };
$('importInput').onchange = async e => { const file=e.target.files[0]; if(!file)return; const txt=await file.text(); const data=JSON.parse(txt); stocks=data.stocks||data; saveStocks(); render(); refreshAll(); };
$('addForm').onsubmit = e => { e.preventDefault(); const sym=$('symbolInput').value.trim().toUpperCase(); if(!sym)return; stocks.push({symbol:sym,name:$('nameInput').value.trim()||sym,segment:'vlastní titul',shares:Number($('sharesInput').value)||0,buyPrice:Number($('buyInput').value)||0}); saveStocks(); e.target.reset(); render(); refreshAll(); };

render();
if(getKey()) refreshAll();
setInterval(refreshAll, 60000);
