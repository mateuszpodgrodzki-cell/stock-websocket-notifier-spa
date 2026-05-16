import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT || 4000);
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS || 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const MAX_HISTORY_POINTS_PER_SYMBOL = 3000;

const RANGE_IN_MS = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
  ALL: Infinity
};

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] }
});

const stocks = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technologie", price: 189.52 },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Motoryzacja / EV", price: 172.85 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technologie", price: 415.28 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Półprzewodniki / GPU", price: 875.35 },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "E-commerce / Cloud", price: 181.44 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Internet / Reklama", price: 142.31 },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Social media / VR", price: 492.18 },
  { symbol: "IBM", name: "IBM Corp.", sector: "Enterprise IT", price: 184.64 },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Streaming", price: 611.09 },
  { symbol: "ORCL", name: "Oracle Corp.", sector: "Enterprise IT", price: 121.77 }
].map((stock) => ({
  ...stock,
  previousPrice: stock.price,
  open: stock.price,
  high: stock.price,
  low: stock.price,
  change: 0,
  changePercent: 0,
  volume: Math.floor(Math.random() * 900000 + 100000),
  marketCap: Math.floor(stock.price * (Math.random() * 900 + 100)) * 1000000,
  status: "ACTIVE"
}));

const historyBySymbol = new Map();

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomPercentChange(maxPercent = 1.2) {
  return randomBetween(-maxPercent, maxPercent) / 100;
}

function getStockBySymbol(symbol) {
  return stocks.find((stock) => stock.symbol === symbol.toUpperCase());
}

// Bez tego po starcie aplikacji wykres miałby tylko pojedyncze punkty z live update.
function generateHistoricalData(stock) {
  const now = Date.now();
  const start = now - RANGE_IN_MS["3M"];
  const points = [];
  let price = stock.price * randomBetween(0.82, 1.18);

  for (let timestamp = start; timestamp <= now; timestamp += 60 * 60 * 1000) {
    price = Math.max(1, price * (1 + randomPercentChange(1.8)));
    points.push({ timestamp: new Date(timestamp).toISOString(), price: roundMoney(price) });
  }

  stock.price = points.at(-1).price;
  stock.previousPrice = points.at(-2)?.price || stock.price;

  const todayPoints = points.filter((point) => new Date(point.timestamp).getTime() >= now - RANGE_IN_MS["1D"]);
  stock.open = todayPoints[0]?.price || stock.price;
  stock.high = Math.max(...todayPoints.map((point) => point.price));
  stock.low = Math.min(...todayPoints.map((point) => point.price));
  stock.change = roundMoney(stock.price - stock.previousPrice);
  stock.changePercent = Number(((stock.change / stock.previousPrice) * 100).toFixed(2));
  stock.spread = roundMoney(stock.price * 0.0015);
  stock.bid = roundMoney(stock.price - stock.spread);
  stock.ask = roundMoney(stock.price + stock.spread);

  historyBySymbol.set(stock.symbol, points);
}

for (const stock of stocks) {
  generateHistoricalData(stock);
}

function appendHistoryPoint(symbol, price) {
  const points = historyBySymbol.get(symbol) || [];
  points.push({ timestamp: new Date().toISOString(), price: roundMoney(price) });

  while (points.length > MAX_HISTORY_POINTS_PER_SYMBOL) {
    points.shift();
  }

  historyBySymbol.set(symbol, points);
}

function updatePrices() {
  for (const stock of stocks) {
    const previousPrice = stock.price;
    const nextPrice = Math.max(1, previousPrice * (1 + randomPercentChange(1.1)));

    stock.previousPrice = roundMoney(previousPrice);
    stock.price = roundMoney(nextPrice);
    stock.high = roundMoney(Math.max(stock.high, stock.price));
    stock.low = roundMoney(Math.min(stock.low, stock.price));
    stock.change = roundMoney(stock.price - stock.previousPrice);
    stock.changePercent = Number(((stock.change / stock.previousPrice) * 100).toFixed(2));
    stock.volume += Math.floor(Math.random() * 25000);
    stock.spread = roundMoney(stock.price * 0.0015);
    stock.bid = roundMoney(stock.price - stock.spread);
    stock.ask = roundMoney(stock.price + stock.spread);

    appendHistoryPoint(stock.symbol, stock.price);
  }

  return getMarketPayload();
}

function getMarketStats() {
  const gainers = stocks.filter((stock) => stock.change > 0).length;
  const losers = stocks.filter((stock) => stock.change < 0).length;
  const totalVolume = stocks.reduce((sum, stock) => sum + stock.volume, 0);
  const averageChange = stocks.reduce((sum, stock) => sum + stock.changePercent, 0) / stocks.length;

  return {
    instruments: stocks.length,
    gainers,
    losers,
    totalVolume,
    averageChange: Number(averageChange.toFixed(2))
  };
}

function getMarketPayload() {
  return {
    timestamp: new Date().toISOString(),
    marketState: "SIMULATION_OPEN",
    source: "Symulowany strumień notowań",
    stats: getMarketStats(),
    tickIntervalMs: TICK_INTERVAL_MS,
    stocks
  };
}

function getHistory(symbol, range = "1D") {
  const normalizedRange = RANGE_IN_MS[range] ? range : "1D";
  const points = historyBySymbol.get(symbol.toUpperCase()) || [];

  if (normalizedRange === "ALL") {
    return points;
  }

  const from = Date.now() - RANGE_IN_MS[normalizedRange];
  return points.filter((point) => new Date(point.timestamp).getTime() >= from);
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "stock-websocket-backend",
    websocket: "enabled",
    tickIntervalMs: TICK_INTERVAL_MS,
    history: { enabled: true, period: "ostatnie 3 miesiące", ranges: Object.keys(RANGE_IN_MS) }
  });
});

app.get("/api/stocks", (_req, res) => {
  res.json(getMarketPayload());
});

app.get("/api/history/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const range = String(req.query.range || "1D").toUpperCase();

  if (!getStockBySymbol(symbol)) {
    return res.status(404).json({ error: "Unknown stock symbol", symbol });
  }

  return res.json({
    symbol,
    range: RANGE_IN_MS[range] ? range : "1D",
    timestamp: new Date().toISOString(),
    points: getHistory(symbol, range)
  });
});

io.on("connection", (socket) => {
  socket.emit("prices:update", getMarketPayload());
});

setInterval(() => {
  io.emit("prices:update", updatePrices());
}, TICK_INTERVAL_MS);

httpServer.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
