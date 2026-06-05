const state = { config:null, watchlist:[], quotes:{}, history:{}, chart:null };
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function getJson(url, fallback){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }catch(e){ console.warn(url,e); return fallback; } }
function setStatus(t){ $('status').textContent=t; }
function pct(a,b){ return a&&b ? ((a/b-1)*100) : null; }
function fmt(n, d=2){ return n==null||Number.isNaN(n)?'–':Number(n).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d}); }
function cls(n){ return n>0?'good':n<0?'bad':''; }
function saveHistoryLocal(){ localStorage.setItem('stockHistory', JSON.stringify({updatedAt:new Date().toISOString(), symbols:state.history})); }
function loadHistoryLocal(){ try{ return JSON.parse(localStorage.getItem('stockHistory') || '{}').symbols || {}; }catch{ return {}; } }

async function init(){
  state.config = await getJson('config.json',{finnhubApiKey:'',refreshSeconds:60,historyDays:365});
  state.watchlist = await getJson('data/watchlist.json',[]);
  const histFile = await getJson('data/history.json',{symbols:{}});
  state.history = Object.keys(histFile.symbols||{}).length ? histFile.symbols : loadHistoryLocal();
  const savedKey = localStorage.getItem('finnhubApiKey');
  const cfgKey = state.config.finnhubApiKey && !state.config.finnhubApiKey.includes('SEM_') ? state.config.finnhubApiKey : '';
  $('apiKey').value = savedKey || cfgKey || '';
  render(); renderChartOptions(); analyze();
  await refreshQuotes();
  if(!Object.keys(state.history).length){ setStatus('Historie v data/history.json je prázdná. Klikni na Načíst/obnovit historii.'); }
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

async function fetchHistoryStooq(symbol){
  const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`;
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error('Stooq HTTP '+res.status);
  const text = await res.text();
  if(!text.includes('Date,Open,High,Low,Close')) throw new Error('Stooq bez dat');
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines.map(l=>{
    const [date,open,high,low,close,volume]=l.split(',');
    return {date,open:+open,high:+high,low:+low,close:+close,volume:+volume};
  }).filter(x=>x.date && Number.isFinite(x.close) && x.close>0).slice(-365);
}

async function fetchHistoryYahoo(symbol){
  const to = Math.floor(Date.now()/1000);
  const from = to - 370*24*60*60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`;
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error('Yahoo HTTP '+res.status);
  const data = await res.json();
  const r = data.chart?.result?.[0];
  if(!r) throw new Error('Yahoo bez dat');
  const quote = r.indicators?.quote?.[0] || {};
  return r.timestamp.map((ts,i)=>({
    date:new Date(ts*1000).toISOString().slice(0,10),
    open:quote.open?.[i], high:quote.high?.[i], low:quote.low?.[i], close:quote.close?.[i], volume:quote.volume?.[i]
  })).filter(x=>x.close).slice(-365);
}

async function fetchHistory(symbol){
  try { return await fetchHistoryStooq(symbol); }
  catch(e1){ console.warn(symbol, e1.message); return await fetchHistoryYahoo(symbol); }
}

async function loadHistory(){
  setStatus('Načítám roční historii. Chvíli to potrvá…');
  for(const s of state.watchlist){
    try{
      const h = await fetchHistory(s.symbol);
      state.history[s.symbol]=h;
      setStatus(`${s.symbol}: načteno ${h.length} denních záznamů`);
    }catch(e){ state.history[s.symbol]=state.history[s.symbol] || []; setStatus(`${s.symbol}: historie chyba ${e.message}`); }
    render(); renderChartOptions(); analyze(); saveHistoryLocal();
    await sleep(600);
  }
  setStatus('Historie načtena a uložená do prohlížeče. Pro uložení do repozitáře použij Export historie JSON.');
}

function sma(arr,n){ if(arr.length<n) return null; return arr.slice(-n).reduce((a,b)=>a+b.close,0)/n; }
function rsi(arr,n=14){ if(arr.length<n+1) return null; let gains=0,loss=0; const s=arr.slice(-(n+1)); for(let i=1;i<s.length;i++){ const d=s[i].close-s[i-1].close; if(d>=0) gains+=d; else loss-=d; } if(loss===0) return 100; return 100 - (100/(1+gains/loss)); }
function metrics(symbol){
  const h=state.history[symbol]||[]; const last=h.at(-1)?.close; const q=state.quotes[symbol]; const price=q?.c || last;
  const closes=h.map(x=>x.close); const hi=Math.max(...closes), lo=Math.min(...closes);
  return { price, y1:pct(price,h[0]?.close), m3:pct(price,h.at(-63)?.close), m1:pct(price,h.at(-21)?.close), hi, lo, fromHigh:pct(price,hi), sma50:sma(h,50), sma200:sma(h,200), rsi:rsi(h) };
}
function score(m){ let s=50; if(m.fromHigh!=null && m.fromHigh<-20) s+=18; if(m.fromHigh!=null && m.fromHigh>-5) s-=10; if(m.price && m.sma200 && m.price>m.sma200) s+=12; if(m.price && m.sma50 && m.price>m.sma50) s+=8; if(m.rsi!=null && m.rsi<35) s+=15; if(m.rsi!=null && m.rsi>70) s-=15; if(m.y1!=null && m.y1>30) s+=6; return Math.max(0,Math.min(100,Math.round(s))); }
function render(){
  let total=0, day=0;
  const rows = state.watchlist.map(item=>{
    const q=state.quotes[item.symbol]||{}; const m=metrics(item.symbol); const sc=score(m); const ch=q.dp;
    const hCount=(state.history[item.symbol]||[]).length;
    return `<tr><td><div class="sym">${item.symbol}</div><div class="sub">historie: ${hCount} dní ${q.error?'<br>'+q.error:''}</div></td><td>${item.name}<div class="sub">${item.segment||''}</div></td><td>${fmt(q.c)}</td><td class="${cls(ch)}">${fmt(ch)} %</td><td class="${cls(m.m1)}">${fmt(m.m1)} %</td><td class="${cls(m.m3)}">${fmt(m.m3)} %</td><td class="${cls(m.y1)}">${fmt(m.y1)} %</td><td>${fmt(m.fromHigh)} %</td><td>${fmt(m.rsi,1)}</td><td class="score">${sc}</td><td><button onclick="selectChart('${item.symbol}')">Graf</button></td></tr>`;
  }).join('');
  $('rows').innerHTML=rows; $('totalValue').textContent=fmt(total)+' US$'; $('dailyChange').textContent=fmt(day)+' US$'; $('bestScore').textContent=best()?.symbol || '–';
}
function best(){ return state.watchlist.map(x=>({symbol:x.symbol,score:score(metrics(x.symbol))})).sort((a,b)=>b.score-a.score)[0]; }
function analyze(){
  const sorted=state.watchlist.map(x=>({item:x,m:metrics(x.symbol),s:score(metrics(x.symbol))})).sort((a,b)=>b.s-a.s).slice(0,6);
  $('opportunities').innerHTML=sorted.map(x=>`<div class="opp"><strong>${x.item.symbol} · ${x.s}/100</strong><span>${x.item.name}</span><p>1R: <b class="${cls(x.m.y1)}">${fmt(x.m.y1)} %</b>, od 52W high: <b>${fmt(x.m.fromHigh)} %</b>, RSI: <b>${fmt(x.m.rsi,1)}</b></p></div>`).join('');
}
function renderChartOptions(){ $('chartSymbol').innerHTML = state.watchlist.map(x=>`<option>${x.symbol}</option>`).join(''); drawChart($('chartSymbol').value || state.watchlist[0]?.symbol); }
function selectChart(s){ $('chartSymbol').value=s; drawChart(s); }
function drawChart(symbol){
  const h=state.history[symbol]||[]; const ctx=$('chart'); if(!ctx || !h.length) return;
  if(state.chart) state.chart.destroy();
  state.chart = new Chart(ctx,{type:'line',data:{labels:h.map(x=>x.date),datasets:[{label:symbol,data:h.map(x=>x.close),tension:.25}]},options:{responsive:true,plugins:{legend:{labels:{color:'#eef5ff'}}},scales:{x:{ticks:{color:'#9fb0c8'}},y:{ticks:{color:'#9fb0c8'}}}}});
}
function exportHistory(){
  const blob = new Blob([JSON.stringify({updatedAt:new Date().toISOString(),source:'browser-stooq-yahoo',symbols:state.history},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='history.json'; a.click(); URL.revokeObjectURL(a.href);
}
$('saveKey').onclick=()=>{ localStorage.setItem('finnhubApiKey',$('apiKey').value.trim()); setStatus('API key uložen do prohlížeče.'); };
$('refreshQuotes').onclick=refreshQuotes;
$('loadHistory').onclick=loadHistory;
$('exportHistory').onclick=exportHistory;
$('chartSymbol').onchange=e=>drawChart(e.target.value);
$('addStock').onclick=()=>{ const sym=$('newSymbol').value.trim().toUpperCase().replace('.US',''); if(!sym) return; if(!state.watchlist.some(x=>x.symbol===sym)){ state.watchlist.push({symbol:sym,name:sym,segment:'vlastní akcie'}); render(); renderChartOptions(); } };
init();
