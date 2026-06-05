const fs = require("fs");
const path = require("path");

const symbols = [
  "NVDA", "AVGO", "AMD", "TSM", "MU",
  "INTC", "QCOM", "TXN", "AMAT", "ARM",
  "ASML", "LRCX", "KLAC", "ADI", "MRVL",
  "NXPI", "ON", "MCHP", "MPWR", "GFS"
];

const outputDir = path.join(__dirname, "..", "data");
const outputFile = path.join(outputDir, "history.json");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchYahoo(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
    `?range=1y&interval=1d&includeAdjustedClose=true&events=div%2Csplits`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo HTTP ${response.status}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];

  if (!result) {
    throw new Error("Yahoo returned no chart result");
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];

  return timestamps.map((ts, index) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    open: quote.open?.[index] ?? null,
    high: quote.high?.[index] ?? null,
    low: quote.low?.[index] ?? null,
    close: quote.close?.[index] ?? null,
    adjClose: adjclose[index] ?? quote.close?.[index] ?? null,
    volume: quote.volume?.[index] ?? null
  })).filter(item => item.close !== null);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const result = {
    generatedAt: new Date().toISOString(),
    source: "yahoo-finance-chart",
    period: "1y",
    symbols: {}
  };

  for (const symbol of symbols) {
    try {
      console.log(`Downloading ${symbol}...`);
      result.symbols[symbol] = await fetchYahoo(symbol);
      console.log(`${symbol}: ${result.symbols[symbol].length} records`);
    } catch (error) {
      console.error(`${symbol}: ${error.message}`);
      result.symbols[symbol] = [];
    }

    await sleep(800);
  }

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`Saved to ${outputFile}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
