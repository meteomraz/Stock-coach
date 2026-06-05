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

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchStooq(symbol) {
  const stooqSymbol = symbol.toLowerCase() + ".us";
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Stooq HTTP ${response.status}`);
  }

  const text = await response.text();

  if (!text || !text.includes("Date")) {
    throw new Error("Stooq returned invalid CSV");
  }

  const rows = text.trim().split("\n").slice(1);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const data = rows
    .map(row => {
      const [date, open, high, low, close, volume] = row.split(",");

      return {
        date,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume)
      };
    })
    .filter(item => new Date(item.date) >= oneYearAgo)
    .filter(item => Number.isFinite(item.close));

  return data;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const result = {
    generatedAt: new Date().toISOString(),
    source: "stooq",
    period: "1y",
    symbols: {}
  };

  for (const symbol of symbols) {
    try {
      console.log(`Downloading ${symbol}...`);
      result.symbols[symbol] = await fetchStooq(symbol);
      console.log(`${symbol}: ${result.symbols[symbol].length} records`);
    } catch (error) {
      console.error(`${symbol}: ${error.message}`);
      result.symbols[symbol] = [];
    }

    await sleep(500);
  }

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

  console.log(`Saved to ${outputFile}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
