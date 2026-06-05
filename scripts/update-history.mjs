import fs from 'node:fs/promises';

const watchlist = JSON.parse(await fs.readFile('data/watchlist.json','utf8'));
const out = { updatedAt: new Date().toISOString(), source: 'stooq-yahoo', symbols: {} };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function fetchStooq(symbol){
  const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const text = await res.text();
  if(!text.includes('Date,Open,High,Low,Close')) throw new Error('Stooq bez dat');
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines.map(l=>{
    const [date,open,high,low,close,volume]=l.split(',');
    return {date,open:+open,high:+high,low:+low,close:+close,volume:+volume};
  }).filter(x=>x.date && x.close).slice(-365);
}

async function fetchYahoo(symbol){
  const to = Math.floor(Date.now()/1000);
  const from = to - 370*24*60*60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${from}&period2=${to}&interval=1d`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const r = json.chart?.result?.[0];
  if(!r) throw new Error('Yahoo bez dat');
  const q = r.indicators.quote[0];
  return r.timestamp.map((ts,i)=>({
    date:new Date(ts*1000).toISOString().slice(0,10),
    open:q.open?.[i], high:q.high?.[i], low:q.low?.[i], close:q.close?.[i], volume:q.volume?.[i]
  })).filter(x=>x.close).slice(-365);
}

for(const item of watchlist){
  try { out.symbols[item.symbol] = await fetchStooq(item.symbol); }
  catch(e1){
    try { out.symbols[item.symbol] = await fetchYahoo(item.symbol); }
    catch(e2){ console.error(item.symbol, e1.message, e2.message); out.symbols[item.symbol] = []; }
  }
  console.log(item.symbol, out.symbols[item.symbol].length);
  await sleep(400);
}
await fs.writeFile('data/history.json', JSON.stringify(out,null,2));
