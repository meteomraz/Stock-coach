const STORAGE_KEY = 'stockCoachPortfolio.v1';
const HISTORY_KEY = 'stockCoachHistory.v1';
const REFRESH_MS = 60_000;

const $ = (id) => document.getElementById(id);
let portfolio = load(STORAGE_KEY, seedPortfolio());
let history = load(HISTORY_KEY, []);

function seedPortfolio(){
  return [
    { id: crypto.randomUUID(), symbol:'AAPL.US', name:'Apple', quantity:2, buyPrice:180, currency:'USD', lastPrice:null, lastTime:null },
    { id: crypto.randomUUID(), symbol:'NVDA.US', name:'Nvidia', quantity:1, buyPrice:120, currency:'USD', lastPrice:null, lastTime:null }
  ];
}
function load(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-100))); }
function money(value, currency='USD'){ return new Intl.NumberFormat('cs-CZ',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value)||0); }
function pct(value){ return `${Number(value||0).toFixed(2)} %`; }
function setStatus(text){ $('marketStatus').textContent = text; $('lastUpdate').textContent = new Date().toLocaleTimeString('cs-CZ'); }

async function fetchQuote(symbol){
  const clean = symbol.trim().toLowerCase();
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(clean)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, { cache:'no-store' });
  if(!res.ok) throw new Error('Nelze načíst data');
  const csv = await res.text();
  const [headerLine, dataLine] = csv.trim().split(/\r?\n/);
  if(!dataLine) throw new Error('Prázdná odpověď');
  const headers = headerLine.split(',');
  const values = dataLine.split(',');
  const row = Object.fromEntries(headers.map((h,i)=>[h.toLowerCase(), values[i]]));
  const close = Number(row.close);
  if(!Number.isFinite(close) || close <= 0) throw new Error(`Symbol ${symbol} nemá cenu`);
  return { price: close, time: `${row.date || ''} ${row.time || ''}`.trim() };
}

async function refreshQuotes(){
  setStatus('Aktualizuji ceny...');
  await Promise.all(portfolio.map(async item => {
    try {
      const q = await fetchQuote(item.symbol);
      item.lastPrice = q.price;
      item.lastTime = q.time;
      item.error = null;
    } catch(e) {
      item.error = e.message;
      // demo fallback, aby UI fungovalo i při CORS/API limitu
      if(!item.lastPrice) item.lastPrice = item.buyPrice * (0.92 + Math.random() * 0.22);
      item.lastTime = 'demo/fallback';
    }
  }));
  const total = portfolio.reduce((sum,i)=>sum + (Number(i.lastPrice)||0) * Number(i.quantity),0);
  if(total > 0) history.push({ t: Date.now(), v: total });
  save();
  render();
  const hasError = portfolio.some(i=>i.error);
  setStatus(hasError ? 'Aktualizováno s fallbackem' : 'Aktualizováno');
}

function render(){
  const body = $('portfolioBody');
  body.innerHTML = '';
  if(!portfolio.length){ body.innerHTML = '<tr><td class="empty" colspan="8">Zatím nemáš přidané žádné akcie.</td></tr>'; }
  let total=0, invested=0;
  portfolio.forEach(item=>{
    const price = Number(item.lastPrice)||0;
    const qty = Number(item.quantity)||0;
    const buy = Number(item.buyPrice)||0;
    const value = price*qty;
    const cost = buy*qty;
    const profit = value-cost;
    const profitPct = cost ? profit/cost*100 : 0;
    total += value; invested += cost;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b>${item.symbol}</b><br><small>${item.lastTime || '—'}${item.error ? ' · ' + item.error : ''}</small></td>
      <td>${item.name || '—'}</td><td>${qty}</td><td>${money(buy,item.currency)}</td><td>${money(price,item.currency)}</td>
      <td>${money(value,item.currency)}</td><td class="${profit>=0?'good':'bad'}"><b>${money(profit,item.currency)}</b><br><small>${pct(profitPct)}</small></td>
      <td><button class="secondary delete" onclick="removeItem('${item.id}')">Smazat</button></td>`;
    body.appendChild(tr);
  });
  const profit = total-invested;
  $('portfolioValue').textContent = money(total,'USD');
  $('investedValue').textContent = money(invested,'USD');
  $('profitValue').textContent = `${money(profit,'USD')} (${pct(invested ? profit/invested*100 : 0)})`;
  $('profitValue').className = profit >= 0 ? 'good' : 'bad';
  drawChart();
}

function removeItem(id){ portfolio = portfolio.filter(i=>i.id!==id); save(); render(); }
window.removeItem = removeItem;

$('stockForm').addEventListener('submit', e=>{
  e.preventDefault();
  portfolio.push({ id: crypto.randomUUID(), symbol:$('symbol').value.trim().toUpperCase(), name:$('name').value.trim(), quantity:Number($('quantity').value), buyPrice:Number($('buyPrice').value), currency:$('currency').value, lastPrice:null, lastTime:null });
  e.target.reset(); save(); render(); refreshQuotes();
});
$('refreshBtn').addEventListener('click', refreshQuotes);
$('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(portfolio,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock-coach-portfolio.json'; a.click(); URL.revokeObjectURL(a.href);
});
$('importInput').addEventListener('change', async e=>{
  const file = e.target.files[0]; if(!file) return;
  portfolio = JSON.parse(await file.text()); save(); render(); refreshQuotes();
});

function drawChart(){
  const canvas = $('portfolioChart');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = 140 * devicePixelRatio;
  ctx.clearRect(0,0,w,h);
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.font = `${12*devicePixelRatio}px Arial`;
  ctx.fillStyle = '#91a4bf';
  if(history.length < 2){ ctx.fillText('Historie se začne kreslit po dalších aktualizacích.', 18*devicePixelRatio, 72*devicePixelRatio); return; }
  const vals = history.map(x=>x.v), min=Math.min(...vals), max=Math.max(...vals), pad=18*devicePixelRatio;
  ctx.beginPath();
  history.forEach((p,i)=>{
    const x = pad + i*(w-pad*2)/(history.length-1);
    const y = h-pad - ((p.v-min)/(max-min || 1))*(h-pad*2);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = '#4da3ff'; ctx.stroke();
  ctx.fillText(`Min ${Math.round(min)} · Max ${Math.round(max)}`, pad, pad);
}

render();
refreshQuotes();
setInterval(refreshQuotes, REFRESH_MS);
