
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Coin = "BTC" | "ETH";
type Timeframe = "5m" | "15m" | "1h" | "4h";
type Signal = "LONG" | "SHORT" | "HOLD";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type Analysis = {
  coin: Coin;
  symbol?: string;
  timeframe?: string;
  price: number;
  signal: Signal;
  support: number;
  resistance: number;
  rsi?: number;
  macd?: {
    line?: number;
    signal?: number;
    histogram?: number;
  };
  ema20?: number;
  ema50?: number;
  candles: Candle[];
};

const REFRESH_MS = 30000;

const number = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

const fmt = (value: unknown, digits = 2) => {
  const n = number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

function validateData(raw: any, coin: Coin): Analysis {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid API response");
  }

  if (raw.error) {
    throw new Error(String(raw.error));
  }

  const price = number(raw.price);
  const support = number(raw.support);
  const resistance = number(raw.resistance);

  if (![price, support, resistance].every(Number.isFinite)) {
    throw new Error("API price/support/resistance missing");
  }

  if (!Array.isArray(raw.candles)) {
    throw new Error("API candles array missing");
  }

  const candles: Candle[] = raw.candles
    .map((c: any) => ({
      time: number(c.time),
      open: number(c.open),
      high: number(c.high),
      low: number(c.low),
      close: number(c.close),
      volume: number(c.volume),
    }))
    .filter(
      (c: Candle) =>
        [c.time, c.open, c.high, c.low, c.close].every(
          Number.isFinite
        ) &&
        c.time > 0 &&
        c.low <= c.high &&
        c.open >= c.low &&
        c.open <= c.high &&
        c.close >= c.low &&
        c.close <= c.high
    )
    .sort((a: Candle, b: Candle) => a.time - b.time);

  if (candles.length < 2) {
    throw new Error("Not enough valid candle data");
  }

  const signal: Signal =
    raw.signal === "LONG" ||
    raw.signal === "SHORT" ||
    raw.signal === "HOLD"
      ? raw.signal
      : "HOLD";

  return {
    coin,
    symbol: String(raw.symbol || `${coin}USD`),
    timeframe: raw.timeframe,
    price,
    signal,
    support,
    resistance,
    rsi: number(raw.rsi),
    macd: {
      line: number(raw.macd?.line),
      signal: number(raw.macd?.signal),
      histogram: number(raw.macd?.histogram),
    },
    ema20: number(raw.ema20),
    ema50: number(raw.ema50),
    candles,
  };
}

function CandlestickChart({
  data,
}: {
  data: Analysis;
}) {
  const candles = useMemo(
    () => data.candles.slice(-60),
    [data.candles]
  );

  const width = 900;
  const height = 400;
  const left = 16;
  const right = 94;
  const top = 24;
  const bottom = 40;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const { minPrice, maxPrice } = useMemo(() => {
    const values = candles.flatMap((c) => [
      c.low,
      c.high,
    ]);

    values.push(data.support, data.resistance);

    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const padding = Math.max((hi - lo) * 0.08, hi * 0.0001);

    return {
      minPrice: lo - padding,
      maxPrice: hi + padding,
    };
  }, [candles, data.support, data.resistance]);

  const y = (price: number) =>
    top +
    ((maxPrice - price) / (maxPrice - minPrice)) *
      plotHeight;

  const slot = plotWidth / candles.length;
  const bodyWidth = Math.max(2, slot * 0.6);

  const gridPrices = Array.from(
    { length: 5 },
    (_, i) =>
      minPrice + ((maxPrice - minPrice) * i) / 4
  );

  const supportY = y(data.support);
  const resistanceY = y(data.resistance);

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          minWidth: 340,
          display: "block",
        }}
        role="img"
        aria-label="Candlestick chart with support and resistance lines"
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="#101b2d"
        />

        {gridPrices.map((price, i) => (
          <g key={i}>
            <line
              x1={left}
              x2={width - right}
              y1={y(price)}
              y2={y(price)}
              stroke="#29384e"
              strokeDasharray="4 5"
            />
            <text
              x={width - right + 9}
              y={y(price) + 4}
              fill="#91a4c0"
              fontSize="12"
            >
              {fmt(price)}
            </text>
          </g>
        ))}

        {candles.map((c, i) => {
          const x = left + slot * (i + 0.5);
          const up = c.close >= c.open;
          const color = up ? "#22c55e" : "#ef4444";

          const bodyTop = Math.min(
            y(c.open),
            y(c.close)
          );

          const bodyHeight = Math.max(
            1.5,
            Math.abs(y(c.open) - y(c.close))
          );

          return (
            <g key={`${c.time}-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1.4"
              />
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
                rx="1"
              />
            </g>
          );
        })}

        <line
          x1={left}
          x2={width - right}
          y1={supportY}
          y2={supportY}
          stroke="#22c55e"
          strokeWidth="2"
          strokeDasharray="8 5"
        />

        <rect
          x={width - right}
          y={supportY - 12}
          width={right}
          height="24"
          fill="#166534"
          rx="4"
        />

        <text
          x={width - right + 5}
          y={supportY + 4}
          fontSize="11"
          fill="white"
        >
          S {fmt(data.support)}
        </text>

        <line
          x1={left}
          x2={width - right}
          y1={resistanceY}
          y2={resistanceY}
          stroke="#fb7185"
          strokeWidth="2"
          strokeDasharray="8 5"
        />

        <rect
          x={width - right}
          y={resistanceY - 12}
          width={right}
          height="24"
          fill="#9f1239"
          rx="4"
        />

        <text
          x={width - right + 5}
          y={resistanceY + 4}
          fontSize="11"
          fill="white"
        >
          R {fmt(data.resistance)}
        </text>

        {candles
          .filter((_, i) => i % 10 === 0)
          .map((c) => {
            const index = candles.indexOf(c);
            const date = new Date(
              c.time < 1e12
                ? c.time * 1000
                : c.time
            );

            return (
              <text
                key={c.time}
                x={left + slot * (index + 0.5)}
                y={height - 13}
                textAnchor="middle"
                fill="#91a4c0"
                fontSize="11"
              >
                {date.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                })}
              </text>
            );
          })}
      </svg>

      <div className="legend">
        <span style={{ color: "#22c55e" }}>
          ━ Support
        </span>
        <span style={{ color: "#fb7185" }}>
          ━ Resistance
        </span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="metric">
      <div className="muted">{label}</div>
      <div
        className="metricValue"
        style={{ color: color || "#e2e8f0" }}
      >
        {value}
      </div>
    </div>
  );
}

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [timeframe, setTimeframe] =
    useState<Timeframe>("15m");

  const [data, setData] = useState<Analysis | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAnalysis = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          coin,
          timeframe,
        });

        const response = await fetch(
          `/api/analysis?${params.toString()}`,
          {
            cache: "no-store",
            signal,
          }
        );

        const text = await response.text();

        let json: any;

        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(
            `API returned non-JSON response (HTTP ${response.status}). Check /api/analysis deployment.`
          );
        }

        if (!response.ok) {
          throw new Error(
            json.error ||
              `API request failed: HTTP ${response.status}`
          );
        }

        const parsed = validateData(json, coin);

        if (!signal?.aborted) {
          setData(parsed);
          setLastUpdated(
            new Date().toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
            })
          );
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;

        if (!signal?.aborted) {
          setError(
            err?.message || "Unable to load market data"
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [coin, timeframe]
  );

  useEffect(() => {
    const controller = new AbortController();

    setData(null);
    fetchAnalysis(controller.signal);

    return () => controller.abort();
  }, [fetchAnalysis]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchAnalysis();
      }
    }, REFRESH_MS);

    return () => clearInterval(interval);
  }, [fetchAnalysis, autoRefresh]);

  const signalColor =
    data?.signal === "LONG"
      ? "#22c55e"
      : data?.signal === "SHORT"
      ? "#fb7185"
      : "#facc15";

  const trend =
    data &&
    Number.isFinite(data.ema20) &&
    Number.isFinite(data.ema50)
      ? (data.ema20 as number) >
        (data.ema50 as number)
        ? "Bullish"
        : (data.ema20 as number) <
          (data.ema50 as number)
        ? "Bearish"
        : "Neutral"
      : "Unknown";

  const distanceSupport =
    data && data.price !== 0
      ? ((data.price - data.support) / data.price) *
        100
      : NaN;

  const distanceResistance =
    data && data.price !== 0
      ? ((data.resistance - data.price) /
          data.price) *
        100
      : NaN;

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>₿ Crypto Signal Pro</h1>
          <p>
            Delta Exchange India · Milestone 8
          </p>
        </div>
        <div className="live">
          ● API Technical Analysis
        </div>
      </header>

      <section className="panel">
        <div className="controls">
          <div className="coinButtons">
            {(["BTC", "ETH"] as Coin[]).map((c) => (
              <button
                key={c}
                className={
                  coin === c ? "active" : "button"
                }
                onClick={() => setCoin(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            value={timeframe}
            onChange={(e) =>
              setTimeframe(
                e.target.value as Timeframe
              )
            }
          >
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="4h">4 Hours</option>
          </select>
        </div>

        <div className="priceRow">
          <div>
            <div className="muted">
              {data?.symbol || `${coin}USD`} ·{" "}
              {timeframe}
            </div>
            <h2>
              {data
                ? `$${fmt(data.price)}`
                : loading
                ? "Loading..."
                : "—"}
            </h2>
          </div>

          <div
            className="signal"
            style={{
              color: signalColor,
              borderColor: signalColor,
            }}
          >
            {data?.signal || "—"}
          </div>
        </div>

        <div className="status">
          {loading
            ? "Refreshing market analysis..."
            : error
            ? "API connection issue"
            : "Analysis updated"}

          {lastUpdated && (
            <span> · {lastUpdated} IST</span>
          )}
        </div>

        <div className="actions">
          <button
            onClick={() => fetchAnalysis()}
            disabled={loading}
          >
            {loading ? "Loading..." : "↻ Refresh Now"}
          </button>

          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) =>
                setAutoRefresh(e.target.checked)
              }
            />
            Auto Refresh (30s)
          </label>
        </div>
      </section>

      {error && (
        <section className="panel error">
          <h3>API Error</h3>
          <p>{error}</p>
          <p>
            Verify the Next.js API route:
            <br />
            <code>/api/analysis</code>
          </p>
          <p>
            Expected parameters: coin=BTC and
            timeframe=15m
          </p>
        </section>
      )}

      <section className="panel">
        <div className="sectionHeading">
          <h3>Candlestick Chart</h3>
          <span className="muted">
            Support & Resistance
          </span>
        </div>

        {data ? (
          <CandlestickChart data={data} />
        ) : (
          <div className="empty">
            {loading
              ? "Loading candles..."
              : "Candlestick data unavailable"}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Support & Resistance Levels</h3>

        <div className="metrics">
          <Metric
            label="Support"
            value={
              data ? `$${fmt(data.support)}` : "—"
            }
            color="#22c55e"
          />

          <Metric
            label="Resistance"
            value={
              data
                ? `$${fmt(data.resistance)}`
                : "—"
            }
            color="#fb7185"
          />

          <Metric
            label="Distance from Support"
            value={
              Number.isFinite(distanceSupport)
                ? `${fmt(distanceSupport)}%`
                : "—"
            }
          />

          <Metric
            label="Distance to Resistance"
            value={
              Number.isFinite(distanceResistance)
                ? `${fmt(distanceResistance)}%`
                : "—"
            }
          />
        </div>
      </section>

      <section className="panel">
        <h3>Technical Indicators</h3>

        <div className="metrics">
          <Metric
            label="RSI (14)"
            value={fmt(data?.rsi)}
          />

          <Metric
            label="MACD Line"
            value={fmt(data?.macd?.line, 4)}
          />

          <Metric
            label="MACD Signal"
            value={fmt(data?.macd?.signal, 4)}
          />

          <Metric
            label="MACD Histogram"
            value={fmt(data?.macd?.histogram, 4)}
          />

          <Metric
            label="EMA 20"
            value={fmt(data?.ema20)}
          />

          <Metric
            label="EMA 50"
            value={fmt(data?.ema50)}
          />

          <Metric
            label="EMA Trend"
            value={trend}
          />

          <Metric
            label="Trading Signal"
            value={data?.signal || "—"}
            color={signalColor}
          />
        </div>
      </section>

      <section className="panel">
        <h3>Signal Interpretation</h3>

        {data ? (
          <>
            <p>
              Current Signal:{" "}
              <strong style={{ color: signalColor }}>
                {data.signal}
              </strong>
            </p>

            {data.signal === "LONG" && (
              <p>
                The API indicates a bullish setup.
                Review trend confirmation and risk
                before considering a position.
              </p>
            )}

            {data.signal === "SHORT" && (
              <p>
                The API indicates a bearish setup.
                Review trend confirmation and risk
                before considering a position.
              </p>
            )}

            {data.signal === "HOLD" && (
              <p>
                No clear directional entry is
                indicated by the current API signal.
              </p>
            )}

            <p className="muted">
              Support: ${fmt(data.support)}
              <br />
              Resistance: ${fmt(data.resistance)}
              <br />
              EMA Trend: {trend}
            </p>
          </>
        ) : (
          <p className="muted">
            Waiting for analysis...
          </p>
        )}
      </section>

      <footer>
        Crypto Signal Pro · Educational technical
        analysis only. Signals are not guaranteed.
        No automatic trades are placed.
      </footer>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background: #091325;
          color: #e2e8f0;
          padding: 18px;
          font-family: Arial, sans-serif;
        }

        .header {
          max-width: 1100px;
          margin: 0 auto 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        h1 {
          font-size: 28px;
          margin: 0 0 8px;
        }

        h2 {
          font-size: 34px;
          margin: 12px 0;
        }

        h3 {
          font-size: 20px;
          margin: 0 0 20px;
        }

        p {
          line-height: 1.6;
        }

        .header p,
        .muted {
          color: #94a3b8;
        }

        .live {
          color: #22c55e;
          font-size: 13px;
        }

        .panel {
          max-width: 1100px;
          margin: 0 auto 20px;
          padding: 22px;
          background: #17263c;
          border: 1px solid #304560;
          border-radius: 18px;
        }

        .controls,
        .priceRow,
        .sectionHeading,
        .actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .coinButtons {
          display: flex;
          gap: 10px;
        }

        button,
        select {
          background: #233650;
          color: white;
          border: 1px solid #38516f;
          border-radius: 10px;
          padding: 12px 18px;
          font-size: 15px;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        button.active {
          background: #2563eb;
          border-color: #60a5fa;
        }

        .priceRow {
          margin-top: 28px;
        }

        .signal {
          border: 1px solid;
          border-radius: 12px;
          padding: 14px 20px;
          font-size: 22px;
          font-weight: bold;
        }

        .status {
          color: #94a3b8;
          font-size: 13px;
          margin: 12px 0 20px;
        }

        .actions {
          justify-content: flex-start;
        }

        .actions label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #cbd5e1;
          font-size: 14px;
        }

        .metrics {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .metric {
          padding: 16px;
          border-radius: 12px;
          background: #101b2d;
          border: 1px solid #29384e;
          min-width: 0;
        }

        .metricValue {
          font-size: 21px;
          font-weight: bold;
          margin-top: 10px;
          overflow-wrap: anywhere;
        }

        .error {
          border-color: #ef4444;
          color: #fda4af;
        }

        .error code {
          overflow-wrap: anywhere;
        }

        .empty {
          min-height: 250px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          text-align: center;
        }

        .legend {
          display: flex;
          justify-content: center;
          gap: 22px;
          font-size: 13px;
          padding: 12px;
        }

        footer {
          max-width: 1100px;
          margin: 25px auto;
          color: #94a3b8;
          text-align: center;
          font-size: 12px;
          line-height: 1.6;
        }

        @media (max-width: 700px) {
          .page {
            padding: 12px;
          }

          .panel {
            padding: 16px;
          }

          h1 {
            font-size: 24px;
          }

          h2 {
            font-size: 28px;
          }

          .metrics {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .metricValue {
            font-size: 17px;
          }

          .controls {
            align-items: stretch;
          }

          select {
            max-width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
