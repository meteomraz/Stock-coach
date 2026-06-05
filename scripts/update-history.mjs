import fs from 'node:fs/promises';

const watchlist = JSON.parse(await fs.readFile('data/watchlist.json','utf8'));
const out = { updatedAt: new Date().toISOString(), source: 'stooq', symbols: {} };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function fetchHistory(symbol){
  const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines.map(l=>{
    const [date,open,high,low,close,volume]=l.split(',');
    return {date,open:+open,high:+high,low:+low,close:+close,volume:+volume};
  }).filter(x=>x.date && x.close).slice(-365);
}

for(const item of watchlist){
  try { out.symbols[item.symbol] = await fetchHistory(item.symbol); console.log(item.symbol, out.symbols[item.symbol].length); }
  catch(e){ console.error(item.symbol, e.message); out.symbols[item.symbol] = []; }
  await sleep(300);
}
await fs.writeFile('data/history.json', JSON.stringify(out,null,2));
