import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_WS_URL || "http://localhost:4000";
const WATCHLIST_STORAGE_KEY = "stock-dashboard-watchlist";
const ALERTS_STORAGE_KEY = "stock-dashboard-alerts";
const ranges = ["1D", "1W", "1M", "3M", "ALL"];
const tabs = [
  { id: "dashboard", label: "Pulpit" },
  { id: "quotes", label: "Notowania" },
  { id: "alerts", label: "Alerty" }
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeReadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function formatPrice(value) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "USD" }).format(value || 0);
}

function formatCompact(value) {
  return new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 2 }).format(value || 0);
}

function formatTime(value) {
  return value ? new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "brak danych";
}

function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "-";
}

function getDirection(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <p>{hint}</p>}
    </article>
  );
}

function LargeChart({ points, stock, range }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const chart = useMemo(() => {
    const width = 920;
    const height = 400;
    const paddingLeft = 76;
    const paddingRight = 86;
    const paddingTop = 28;
    const paddingBottom = 54;
    const usableWidth = width - paddingLeft - paddingRight;
    const usableHeight = height - paddingTop - paddingBottom;

    if (!points || points.length < 2) {
      return { segments: [], min: 0, max: 0, first: null, last: null, change: 0, changePercent: 0, scaledPoints: [], yTicks: [], xTicks: [], currentPoint: null, width, height, paddingTop, paddingBottom, paddingLeft, paddingRight };
    }

    const prices = points.map((point) => point.price);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const paddingValue = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.01);
    const min = rawMin - paddingValue;
    const max = rawMax + paddingValue;
    const rangeValue = max - min || 1;
    const scaleX = (index) => paddingLeft + (index / (points.length - 1)) * usableWidth;
    const scaleY = (price) => paddingTop + (1 - (price - min) / rangeValue) * usableHeight;
    const scaledPoints = points.map((point, index) => ({ ...point, x: scaleX(index), y: scaleY(point.price) }));
    // Dzielę linię na odcinki, żeby wzrosty i spadki mogły mieć osobne kolory.
    const segments = scaledPoints.slice(1).map((point, index) => {
      const previousPoint = scaledPoints[index];
      const direction = point.price > previousPoint.price ? "positive" : point.price < previousPoint.price ? "negative" : "neutral";

      return {
        id: `${previousPoint.timestamp}-${point.timestamp}`,
        direction,
        path: `M ${previousPoint.x.toFixed(2)} ${previousPoint.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      };
    });
    const first = points[0];
    const last = points[points.length - 1];
    const change = Number((last.price - first.price).toFixed(2));
    const changePercent = Number(((change / first.price) * 100).toFixed(2));
    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const value = min + ((max - min) / 4) * index;
      return { value, y: scaleY(value) };
    }).reverse();
    const xTickIndexes = [0, 0.25, 0.5, 0.75, 1].map((position) => Math.round((points.length - 1) * position));
    const xTicks = [...new Set(xTickIndexes)].map((index) => ({ index, timestamp: points[index].timestamp, x: scaleX(index) }));

    return { segments, min: rawMin, max: rawMax, first, last, change, changePercent, scaledPoints, yTicks, xTicks, currentPoint: scaledPoints.at(-1), width, height, paddingTop, paddingBottom, paddingLeft, paddingRight };
  }, [points]);

  function formatAxisPrice(value) {
    return `$${Number(value || 0).toFixed(2)}`;
  }

  function formatAxisDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (range === "1D") {
      return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(date);
    }
    return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(date);
  }

  function handleChartMouseMove(event) {
    if (!chart.scaledPoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * chart.width;
    let nearestPoint = chart.scaledPoints[0];

    for (const point of chart.scaledPoints) {
      if (Math.abs(point.x - mouseX) < Math.abs(nearestPoint.x - mouseX)) {
        nearestPoint = point;
      }
    }

    setHoveredPoint({ ...nearestPoint, xPercent: (nearestPoint.x / chart.width) * 100, yPercent: (nearestPoint.y / chart.height) * 100 });
  }

  const direction = getDirection(chart.change);
  const chartClass = direction === "negative" ? "chart-negative" : "chart-positive";

  return (
    <article className={`panel chart-panel ${chartClass}`}>
      <div className="chart-header">
        <div>
          <p className="eyebrow">Wykres historyczny</p>
          <h2>{stock?.symbol || "-"} — {stock?.name || "wybierz spółkę"}</h2>
          <p className="chart-price">{formatPrice(stock?.price)}</p>
          <p className={direction}>
            Zakres {range}: {chart.change > 0 ? "+" : ""}{formatPrice(chart.change)} / {chart.changePercent > 0 ? "+" : ""}{chart.changePercent.toFixed(2)}%
          </p>
        </div>
        <div className="chart-stats">
          <span>Min: {formatPrice(chart.min)}</span>
          <span>Max: {formatPrice(chart.max)}</span>
          <span>Punktów: {points.length}</span>
        </div>
      </div>

      <div className="chart-legend" aria-label="Legenda wykresu">
        <span><i className="legend-line legend-up" /> Wzrost względem poprzedniego punktu</span>
        <span><i className="legend-line legend-down" /> Spadek względem poprzedniego punktu</span>
        <span><i className="legend-line legend-flat" /> Bez zmiany ceny</span>
      </div>

      <div className="chart-wrapper">
        <svg className="large-chart" viewBox="0 0 920 400" onMouseMove={handleChartMouseMove} onMouseLeave={() => setHoveredPoint(null)}>
          {chart.yTicks.map((tick) => (
            <g key={tick.value}>
              <line className="grid-line" x1={chart.paddingLeft} y1={tick.y} x2={chart.width - chart.paddingRight} y2={tick.y} />
              <text className="axis-label y-axis-label" x={chart.paddingLeft - 12} y={tick.y + 4} textAnchor="end">{formatAxisPrice(tick.value)}</text>
            </g>
          ))}
          {chart.xTicks.map((tick) => (
            <g key={`${tick.index}-${tick.timestamp}`}>
              <line className="vertical-grid-line" x1={tick.x} y1={chart.paddingTop} x2={tick.x} y2={chart.height - chart.paddingBottom} />
              <text className="axis-label x-axis-label" x={tick.x} y={chart.height - 18} textAnchor="middle">{formatAxisDate(tick.timestamp)}</text>
            </g>
          ))}
          {hoveredPoint && <line className="hover-line" x1={hoveredPoint.x} y1={chart.paddingTop} x2={hoveredPoint.x} y2={chart.height - chart.paddingBottom} />}
          {chart.segments.map((segment) => <path key={segment.id} className={`chart-segment segment-${segment.direction}`} d={segment.path} />)}
          {chart.currentPoint && (
            <>
              <circle className="current-dot" cx={chart.currentPoint.x} cy={chart.currentPoint.y} r="6" />
              <rect className="current-price-bg" x={chart.width - chart.paddingRight + 10} y={chart.currentPoint.y - 15} width="70" height="30" rx="8" />
              <text className="current-price-label" x={chart.width - chart.paddingRight + 45} y={chart.currentPoint.y + 5} textAnchor="middle">{formatAxisPrice(chart.currentPoint.price)}</text>
            </>
          )}
          {hoveredPoint && <circle className="hover-dot" cx={hoveredPoint.x} cy={hoveredPoint.y} r="7" />}
        </svg>
        {hoveredPoint && (
          <div className="chart-tooltip" style={{ left: `${hoveredPoint.xPercent}%`, top: `${hoveredPoint.yPercent}%` }}>
            <strong>{formatPrice(hoveredPoint.price)}</strong>
            <span>{formatDateTime(hoveredPoint.timestamp)}</span>
          </div>
        )}
      </div>

      <div className="chart-footer">
        <span>{formatDateTime(chart.first?.timestamp)}</span>
        <span>{formatDateTime(chart.last?.timestamp)}</span>
      </div>
    </article>
  );
}

function Watchlist({ stocks, watchlistSymbols, selectedSymbol, onSelect, onToggle }) {
  const watchlistStocks = stocks.filter((stock) => watchlistSymbols.includes(stock.symbol));

  return (
    <article className="panel watchlist-panel">
      <div className="panel-header compact">
        <h2>Watchlista</h2>
        <span>{watchlistStocks.length} spółek</span>
      </div>
      {watchlistStocks.length === 0 && (
        <div className="empty-watchlist">
          <p>Watchlista jest pusta.</p>
          <p>Wybierz spółkę i kliknij „Dodaj do watchlisty”.</p>
        </div>
      )}
      <div className="watchlist">
        {watchlistStocks.map((stock) => (
          <div key={stock.symbol} className={selectedSymbol === stock.symbol ? "watchlist-row active" : "watchlist-row"}>
            <button onClick={() => onSelect(stock.symbol)}>
              <span>
                <strong>{stock.symbol}</strong>
                <small>{stock.name}</small>
              </span>
              <span className="watchlist-price">
                {formatPrice(stock.price)}
                <small className={getDirection(stock.changePercent)}>{stock.changePercent > 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%</small>
              </span>
            </button>
            <button className="icon-button" onClick={() => onToggle(stock.symbol)}>×</button>
          </div>
        ))}
      </div>
    </article>
  );
}

function OhlcCards({ stock }) {
  if (!stock) return null;

  return (
    <section className="ohlc-grid">
      <MetricCard label="Open" value={formatPrice(stock.open)} hint="Cena otwarcia" />
      <MetricCard label="High" value={formatPrice(stock.high)} hint="Najwyższa cena" />
      <MetricCard label="Low" value={formatPrice(stock.low)} hint="Najniższa cena" />
      <MetricCard label="Current" value={formatPrice(stock.price)} hint="Aktualna cena" />
      <MetricCard label="Bid" value={formatPrice(stock.bid)} hint="Cena kupna" />
      <MetricCard label="Ask" value={formatPrice(stock.ask)} hint="Cena sprzedaży" />
      <MetricCard label="Volume" value={formatCompact(stock.volume)} hint="Symulowany wolumen" />
      <MetricCard label="Market Cap" value={formatCompact(stock.marketCap)} hint="Symulowana kapitalizacja" />
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [connected, setConnected] = useState(false);
  const [stocks, setStocks] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedRange, setSelectedRange] = useState("1D");
  const [chartPoints, setChartPoints] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("symbol");
  const [sortDirection, setSortDirection] = useState("asc");
  const [alertSymbol, setAlertSymbol] = useState("");
  const [alertOperator, setAlertOperator] = useState(">");
  const [alertPrice, setAlertPrice] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState(() => safeReadJson(WATCHLIST_STORAGE_KEY, ["AAPL", "MSFT", "NVDA"]));
  const [alerts, setAlerts] = useState(() => safeReadJson(ALERTS_STORAGE_KEY, []));
  const selectedSymbolRef = useRef("");

  useEffect(() => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  useEffect(() => {
    fetch(`${API_URL}/api/stocks`)
      .then((response) => response.json())
      .then((payload) => {
        setStocks(payload.stocks || []);
        setLastUpdate(payload.timestamp);
        if (payload.stocks?.length) {
          setSelectedSymbol(payload.stocks[0].symbol);
          setAlertSymbol(payload.stocks[0].symbol);
        }
      })
      .catch(() => {
        setEventLog((current) => [{ id: makeId(), time: new Date().toISOString(), message: "Nie udało się pobrać listy spółek" }, ...current].slice(0, 8));
      });
  }, []);

  useEffect(() => {
    if (!selectedSymbol) return;
    fetch(`${API_URL}/api/history/${selectedSymbol}?range=${selectedRange}`)
      .then((response) => response.json())
      .then((payload) => setChartPoints(payload.points || []))
      .catch(() => {
        setEventLog((current) => [{ id: makeId(), time: new Date().toISOString(), message: `Nie udało się pobrać historii dla ${selectedSymbol}` }, ...current].slice(0, 8));
      });
  }, [selectedSymbol, selectedRange]);

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      setConnected(true);
      setEventLog((current) => [{ id: makeId(), time: new Date().toISOString(), message: "Połączono z serwerem WebSocket" }, ...current].slice(0, 8));
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setEventLog((current) => [{ id: makeId(), time: new Date().toISOString(), message: "Utracono połączenie z serwerem WebSocket" }, ...current].slice(0, 8));
    });

    socket.on("prices:update", (payload) => {
      setStocks(payload.stocks || []);
      setLastUpdate(payload.timestamp);

      const currentSelected = payload.stocks?.find((stock) => stock.symbol === selectedSymbolRef.current);
      if (currentSelected) {
        setChartPoints((current) => [...current, { timestamp: payload.timestamp, price: currentSelected.price }]);
      }

      setAlerts((currentAlerts) =>
        currentAlerts.map((alert) => {
          if (alert.triggered) return alert;
          const stock = payload.stocks?.find((item) => item.symbol === alert.symbol);
          if (!stock) return alert;
          const target = Number(alert.price);
          const triggered = alert.operator === ">" ? stock.price >= target : stock.price <= target;
          if (triggered) {
            setEventLog((current) => [{ id: makeId(), time: payload.timestamp, message: `Alert: ${alert.symbol} ${alert.operator} ${formatPrice(target)} został spełniony` }, ...current].slice(0, 8));
          }
          return { ...alert, triggered, lastPrice: stock.price };
        })
      );

      setEventLog((current) => [{ id: makeId(), time: payload.timestamp, message: `Aktualizacja live: ${payload.stocks?.length || 0} instrumentów` }, ...current].slice(0, 8));
    });

    return () => socket.disconnect();
  }, []);

  const sectors = useMemo(() => ["ALL", ...new Set(stocks.map((stock) => stock.sector))], [stocks]);

  const sortedStocks = useMemo(() => {
    return stocks
      .filter((stock) => {
        const matchesSearch = stock.symbol.toLowerCase().includes(search.toLowerCase()) || stock.name.toLowerCase().includes(search.toLowerCase());
        const matchesSector = sectorFilter === "ALL" || stock.sector === sectorFilter;
        return matchesSearch && matchesSector;
      })
      .sort((a, b) => {
        const aValue = a[sortKey];
        const bValue = b[sortKey];
        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }
        return sortDirection === "asc" ? String(aValue).localeCompare(String(bValue)) : String(bValue).localeCompare(String(aValue));
      });
  }, [stocks, search, sectorFilter, sortKey, sortDirection]);

  const selectedStock = useMemo(() => stocks.find((stock) => stock.symbol === selectedSymbol) || stocks[0], [stocks, selectedSymbol]);

  const summary = useMemo(() => {
    return {
      gainers: stocks.filter((stock) => stock.change > 0).length,
      losers: stocks.filter((stock) => stock.change < 0).length,
      totalVolume: stocks.reduce((sum, stock) => sum + stock.volume, 0),
      best: [...stocks].sort((a, b) => b.changePercent - a.changePercent)[0],
      worst: [...stocks].sort((a, b) => a.changePercent - b.changePercent)[0]
    };
  }, [stocks]);

  const isSelectedInWatchlist = selectedStock ? watchlistSymbols.includes(selectedStock.symbol) : false;

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  }

  function openStock(symbol) {
    setSelectedSymbol(symbol);
    setActiveTab("dashboard");
  }

  function toggleWatchlist(symbol) {
    setWatchlistSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]);
  }

  function addAlert() {
    const price = Number(alertPrice);
    if (!alertSymbol || !price || price <= 0) return;
    const stock = stocks.find((item) => item.symbol === alertSymbol);
    setAlerts((current) => [{ id: makeId(), symbol: alertSymbol, operator: alertOperator, price, triggered: false, lastPrice: stock?.price || 0, createdAt: new Date().toISOString() }, ...current]);
    setAlertPrice("");
  }

  function removeAlert(id) {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }

  function resetAlert(id) {
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, triggered: false } : alert));
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">WebSockets / dashboard giełdowy / live update</p>
          <h1>System powiadomień giełdowych</h1>
        </div>
        <div className="status-card">
          <span className={`status-dot ${connected ? "online" : "offline"}`} />
          <div>
            <strong>{connected ? "Połączono" : "Brak połączenia"}</strong>
            <p>Ostatnia aktualizacja: {formatTime(lastUpdate)}</p>
          </div>
        </div>
      </section>

      <nav className="tabs">
        {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>

      {activeTab === "dashboard" && (
        <section className="stack">
          <div className="metrics-grid">
            <MetricCard label="Instrumenty" value={stocks.length} hint="Liczba spółek" />
            <MetricCard label="Rosnące" value={summary.gainers} hint="Dodatnia zmiana" />
            <MetricCard label="Spadające" value={summary.losers} hint="Ujemna zmiana" />
            <MetricCard label="Wolumen" value={formatCompact(summary.totalVolume)} hint="Łącznie" />
          </div>

          <section className="market-layout">
            <div className="main-market-column">
              <section className="control-panel">
                <div className="field">
                  <label>Spółka</label>
                  <select value={selectedStock?.symbol || ""} onChange={(event) => setSelectedSymbol(event.target.value)}>
                    {stocks.map((stock) => <option key={stock.symbol} value={stock.symbol}>{stock.symbol} — {stock.name}</option>)}
                  </select>
                </div>
                <button className={isSelectedInWatchlist ? "watchlist-toggle active" : "watchlist-toggle"} onClick={() => selectedStock && toggleWatchlist(selectedStock.symbol)}>
                  {isSelectedInWatchlist ? "Usuń z watchlisty" : "Dodaj do watchlisty"}
                </button>
                <div className="range-buttons">
                  {ranges.map((range) => <button key={range} className={selectedRange === range ? "active" : ""} onClick={() => setSelectedRange(range)}>{range}</button>)}
                </div>
              </section>
              <LargeChart points={chartPoints} stock={selectedStock} range={selectedRange} />
              <OhlcCards stock={selectedStock} />
            </div>
            <Watchlist stocks={stocks} watchlistSymbols={watchlistSymbols} selectedSymbol={selectedSymbol} onSelect={openStock} onToggle={toggleWatchlist} />
          </section>

          <section className="dashboard-grid">
            <article className="panel">
              <div className="panel-header"><h2>Najmocniejsze ruchy</h2><span>Live</span></div>
              <div className="highlight-grid">
                <div><p>Największy wzrost</p><strong>{summary.best?.symbol || "-"}</strong><span className={getDirection(summary.best?.changePercent || 0)}>{summary.best?.changePercent > 0 ? "+" : ""}{(summary.best?.changePercent || 0).toFixed(2)}%</span></div>
                <div><p>Największy spadek</p><strong>{summary.worst?.symbol || "-"}</strong><span className={getDirection(summary.worst?.changePercent || 0)}>{summary.worst?.changePercent > 0 ? "+" : ""}{(summary.worst?.changePercent || 0).toFixed(2)}%</span></div>
              </div>
            </article>
            <article className="panel">
              <div className="panel-header"><h2>Zdarzenia</h2><span>WebSocket</span></div>
              <div className="event-log">
                {eventLog.map((event) => <article key={event.id} className="event-item"><span>{formatTime(event.time)}</span><p>{event.message}</p></article>)}
              </div>
            </article>
          </section>
        </section>
      )}

      {activeTab === "quotes" && (
        <section className="stack">
          <section className="filters-panel">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj po symbolu albo nazwie..." />
            <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)}>
              {sectors.map((sector) => <option key={sector} value={sector}>{sector === "ALL" ? "Wszystkie sektory" : sector}</option>)}
            </select>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Notowania live</h2><span>Aktualizacja co 5 sekund</span></div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleSort("symbol")}>Symbol</th>
                    <th onClick={() => handleSort("name")}>Nazwa</th>
                    <th onClick={() => handleSort("sector")}>Sektor</th>
                    <th onClick={() => handleSort("price")}>Cena</th>
                    <th onClick={() => handleSort("change")}>Zmiana</th>
                    <th onClick={() => handleSort("changePercent")}>Zmiana %</th>
                    <th>Bid</th>
                    <th>Ask</th>
                    <th onClick={() => handleSort("volume")}>Wolumen</th>
                    <th>Watchlista</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStocks.map((stock) => {
                    const direction = getDirection(stock.change);
                    const inWatchlist = watchlistSymbols.includes(stock.symbol);

                    return (
                      <tr key={stock.symbol}>
                        <td onClick={() => openStock(stock.symbol)}><strong>{stock.symbol}</strong></td>
                        <td onClick={() => openStock(stock.symbol)}>{stock.name}</td>
                        <td onClick={() => openStock(stock.symbol)}>{stock.sector}</td>
                        <td onClick={() => openStock(stock.symbol)}>{formatPrice(stock.price)}</td>
                        <td onClick={() => openStock(stock.symbol)} className={direction}>{stock.change > 0 ? "+" : ""}{formatPrice(stock.change)}</td>
                        <td onClick={() => openStock(stock.symbol)} className={direction}>{stock.changePercent > 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%</td>
                        <td onClick={() => openStock(stock.symbol)}>{formatPrice(stock.bid)}</td>
                        <td onClick={() => openStock(stock.symbol)}>{formatPrice(stock.ask)}</td>
                        <td onClick={() => openStock(stock.symbol)}>{formatCompact(stock.volume)}</td>
                        <td><button className="table-action" onClick={() => toggleWatchlist(stock.symbol)}>{inWatchlist ? "Usuń" : "Dodaj"}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}

      {activeTab === "alerts" && (
        <section className="panel">
          <div className="panel-header"><h2>Alerty cenowe</h2><span>Zapisują się po odświeżeniu</span></div>
          <div className="alert-form">
            <select value={alertSymbol} onChange={(event) => setAlertSymbol(event.target.value)}>
              {stocks.map((stock) => <option key={stock.symbol} value={stock.symbol}>{stock.symbol}</option>)}
            </select>
            <select value={alertOperator} onChange={(event) => setAlertOperator(event.target.value)}>
              <option value=">">powyżej lub równo</option>
              <option value="<">poniżej lub równo</option>
            </select>
            <input value={alertPrice} onChange={(event) => setAlertPrice(event.target.value)} placeholder="Cena, np. 200" type="number" />
            <button onClick={addAlert}>Dodaj alert</button>
          </div>
          <div className="alerts-list">
            {alerts.length === 0 && <p className="empty-state">Brak alertów. Dodaj pierwszy alert cenowy.</p>}
            {alerts.map((alert) => (
              <article key={alert.id} className={alert.triggered ? "alert-card triggered" : "alert-card"}>
                <button className="alert-main" onClick={() => openStock(alert.symbol)}>
                  <strong>{alert.symbol}</strong>
                  <p>Warunek: cena {alert.operator} {formatPrice(alert.price)}</p>
                  <p>Ostatnia cena: {formatPrice(alert.lastPrice)}</p>
                  <p className="alert-hint">Kliknij, aby przejść do wykresu {alert.symbol}</p>
                </button>
                <div className="alert-actions">
                  <span>{alert.triggered ? "Spełniony" : "Oczekuje"}</span>
                  {alert.triggered && <button onClick={() => resetAlert(alert.id)}>Reset</button>}
                  <button onClick={() => removeAlert(alert.id)}>Usuń</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
