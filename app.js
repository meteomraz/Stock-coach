const state = { config:null, watchlist:[], quotes:{}, history:{}, chart:null };
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function getJson(url, fallback){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }catch(e){ console.warn(url,e); return fallback; } }
function setStatus(t){ $('status').textContent=t; }
function pct(a,b){ return a&&b ? ((a/b-1)*100) : null; }
function fmt(n, d=2){ return n==null||Number.isNaN(n)?'–':Number(n).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d}); }
function cls(n){ return n>0?'good':n<0?'bad':''; }

async function init(){
  state.config = await getJson('config.json',{finnhubApiKey:'',refreshSeconds:60,historyDays:365});
  state.watchlist = await getJson('data/watchlist.json',[]);
  const histFile = await getJson('data/history.json',{symbols:{}});
  state.history = histFile.symbols || {};
  const savedKey = localStorage.getItem('finnhubApiKey');
  const cfgKey = state.config.finnhubApiKey && !state.config.finnhubApiKey.includes('SEM_') ? state.config.finnhubApiKey : '';
  $('apiKey').value = savedKey || cfgKey || '';
  render(); renderChartOptions(); analyze();
  await refreshQuotes();
  setInterval(refreshQuotes, (state.config.refreshSeconds||60)*1000);
}

async function refreshQuotes(){
  const key = $('apiKey').value.trim();
  if(!key){ setStatus('Chybí Finnhub API key. Ceny nepůjdou načíst.'); return; }
  setStatus('Načítám aktuální ceny…');
  for(const s of state.watchlist){
    try{
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s.symbol)}&token=${encodeURIComponent(key)}`);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const q = await r.json();
      state.quotes[s.symbol]=q;
    }catch(e){ state.quotes[s.symbol]={error:e.message}; }
    await sleep(150);
  }
  setStatus('Ceny aktualizovány: '+new Date().toLocaleTimeString('cs-CZ'));
  render();
}

function stooqSymbol(symbol){ return symbol.toLowerCase()+'.us'; }
async function fetchStooqHistory(symbol){
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol(symbol)}&i=d`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Stooq HTTP '+r.status);
  const text = await r.text();
  if(!text.startsWith('Date,')) throw new Error('Stooq bez dat');
  const lines = text.trim().split(/\r?\n/).slice(1);
  const rows = lines.map(l=>{ const [date,open,high,low,close,volume]=l.split(','); return {date,open:+open,high:+high,low:+low,close:+close,volume:+volume}; }).filter(x=>x.date && x.close);
  return rows.slice(-(state.config.historyDays||365));
}

async function loadHistory(){
  setStatus('Načítám roční historii ze Stooq…');
  for(const s of state.watchlist){
    try{ state.history[s.symbol] = await fetchStooqHistory(s.symbol); }
    catch(e){ state.history[s.symbol] = state.history[s.symbol] || []; state.history[s.symbol].error=e.message; }
    render(); analyze(); updateChart();
    await sleep(350);
  }
  localStorage.setItem('historyCache', JSON.stringify({updatedAt:new Date().toISOString(), symbols:state.history}));
  setStatus('Historie načtena a uložena do cache prohlížeče. Pro soubor použij Export historie JSON.');
}

function metrics(symbol){
  const h = state.history[symbol] || [];
  if(!h.length) return {};
  const last = h[h.length-1].close;
  const max = Math.max(...h.map(x=>x.high||x.close));
  const min = Math.min(...h.map(x=>x.low||x.close));
  const sma = n => h.length>=n ? h.slice(-n).reduce((a,x)=>a+x.close,0)/n : null;
  const p1m = h.length>22 ? pct(last,h[h.length-22].close) : null;
  const p3m = h.length>66 ? pct(last,h[h.length-66].close) : null;
  const p1y = h.length>250 ? pct(last,h[0].close) : null;
  const dip = pct(last,max);
  const sma50=sma(50), sma200=sma(200);
  let score=50;
  if(p1y!=null) score += Math.max(-20, Math.min(25, p1y/3));
  if(p3m!=null) score += Math.max(-15, Math.min(15, p3m/2));
  if(dip!=null && dip< -10 && dip > -35) score += 12;
  if(sma50&&sma200&&sma50>sma200) score += 12;
  if(dip!=null && dip>-3) score -= 8;
  score=Math.round(Math.max(0,Math.min(100,score)));
  return {last,max,min,sma50,sma200,p1m,p3m,p1y,dip,score};
}

function render(){
  $('mCount').textContent=state.watchlist.length;
  const tbody=$('rows'); tbody.innerHTML='';
  for(const s of state.watchlist){
    const q=state.quotes[s.symbol]||{}; const m=metrics(s.symbol);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><div class="sym">${s.symbol}</div><div class="sub">${state.history[s.symbol]?.length?state.history[s.symbol].length+' dnů':'historie nenačtena'}</div></td>
      <td>${s.name||s.symbol}<div class="sub">${s.segment||''}</div></td>
      <td>${q.c?fmt(q.c):q.error||'–'}</td><td class="${cls(q.dp)}">${q.dp?fmt(q.dp)+' %':'–'}</td>
      <td class="${cls(m.p1m)}">${m.p1m!=null?fmt(m.p1m)+' %':'–'}</td><td class="${cls(m.p3m)}">${m.p3m!=null?fmt(m.p3m)+' %':'–'}</td><td class="${cls(m.p1y)}">${m.p1y!=null?fmt(m.p1y)+' %':'–'}</td>
      <td class="${cls(m.dip)}">${m.dip!=null?fmt(m.dip)+' %':'–'}</td><td>${m.sma50?fmt(m.sma50)+' / '+fmt(m.sma200):'–'}</td><td class="score">${m.score??'–'}</td>
      <td><button onclick="removeStock('${s.symbol}')">Smazat</button></td>`;
    tbody.appendChild(tr);
  }
}

function analyze(){
  const items=state.watchlist.map(s=>({ ...s, ...metrics(s.symbol)})).filter(x=>x.score!=null);
  const dip=[...items].sort((a,b)=>a.dip-b.dip)[0];
  const mom=[...items].sort((a,b)=>(b.p1y??-999)-(a.p1y??-999))[0];
  $('mDip').textContent=dip?`${dip.symbol} ${fmt(dip.dip)} %`:'–'; $('mMomentum').textContent=mom?`${mom.symbol} ${fmt(mom.p1y)} %`:'–';
  const top=[...items].sort((a,b)=>b.score-a.score).slice(0,6);
  $('opportunities').innerHTML = top.length ? top.map(x=>`<div class="opp"><strong>${x.symbol} · skóre ${x.score}</strong><span>${x.name}</span><p class="small">1R ${fmt(x.p1y)} %, 3M ${fmt(x.p3m)} %, od 52W high ${fmt(x.dip)} %. ${x.sma50>x.sma200?'Trend nad SMA200.':'Pozor na slabší trend vůči SMA200.'}</p></div>`).join('') : 'Načti historii.';
}
function renderChartOptions(){ const sel=$('chartSymbol'); sel.innerHTML=state.watchlist.map(s=>`<option>${s.symbol}</option>`).join(''); sel.onchange=updateChart; }
function updateChart(){ const sym=$('chartSymbol').value; const h=state.history[sym]||[]; const data=h.map(x=>x.close); const labels=h.map(x=>x.date); if(state.chart) state.chart.destroy(); state.chart=new Chart($('chart'),{type:'line',data:{labels,datasets:[{label:sym,data,tension:.2,pointRadius:0}]},options:{plugins:{legend:{labels:{color:'#eef5ff'}}},scales:{x:{ticks:{color:'#9fb0c8',maxTicksLimit:8},grid:{color:'#273a56'}},y:{ticks:{color:'#9fb0c8'},grid:{color:'#273a56'}}}}}); }
function addStock(){ const symbol=$('newSymbol').value.trim().toUpperCase().replace(/\.US$/,''); if(!symbol) return; if(!state.watchlist.some(x=>x.symbol===symbol)) state.watchlist.push({symbol,name:symbol,segment:'vlastní akcie'}); $('newSymbol').value=''; renderChartOptions(); render(); }
function removeStock(symbol){ state.watchlist=state.watchlist.filter(x=>x.symbol!==symbol); renderChartOptions(); render(); analyze(); }
function exportHistory(){ const blob=new Blob([JSON.stringify({updatedAt:new Date().toISOString(),source:'stooq',symbols:state.history},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='history.json'; a.click(); }
$('saveKey').onclick=()=>{ localStorage.setItem('finnhubApiKey',$('apiKey').value.trim()); setStatus('API key uložen do prohlížeče.'); };
$('addStock').onclick=addStock; $('refreshQuotes').onclick=refreshQuotes; $('loadHistory').onclick=loadHistory; $('exportHistory').onclick=exportHistory;
init();
