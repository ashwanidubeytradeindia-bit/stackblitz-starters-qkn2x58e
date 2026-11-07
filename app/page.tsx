
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Coin = "BTC" | "ETH";
type TF = "5m" | "15m" | "1h" | "4h";
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
  symbol: string;
  timeframe: TF;
  price: number;
  signal: Signal;
  support: number;
  resistance: number;
  rsi: number;
  macd: {
    line: number;
    signal: number;
    histogram: number;
  };
  ema20: number;
  ema50: number;
  candles: Candle[];
};

const TFS: TF[] = ["5m", "15m", "1h", "4h"];
const REFRESH_MS = 1000;
const MAX_RETRY_MS = 30000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fmt(v: unknown, d = 2): string {
  const n = num(v);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })
    : "—";
}

function normalize(raw: any, coin: Coin, tf: TF): Analysis {
  if (!raw || typeof raw !== "object" || raw.error) {
    throw new Error(String(raw?.error || "Invalid API response"));
  }

  const candles: Candle[] = Array.isArray(raw.candles)
    ? raw.candles
        .map((c: any) => ({
          time: num(c.time),
          open: num(c.open),
          high: num(c.high),
          low: num(c.low),
          close: num(c.close),
          volume: num(c.volume),
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
        .sort((a: Candle, b: Candle) => a.time - b.time)
    : [];

  if (candles.length < 2) {
    throw new Error("Insufficient valid candles");
  }

  const price = num(raw.price);
  const support = num(raw.support);
  const resistance = num(raw.resistance);

  if (![price, support, resistance].every(Number.isFinite)) {
    throw new Error("Price or support/resistance missing");
  }

  const signal: Signal =
    raw.signal === "LONG" || raw.signal === "SHORT"
      ? raw.signal
      : "HOLD";

  return {
    coin,
    symbol: String(raw.symbol || `${coin}USD`),
    timeframe: tf,
    price,
    signal,
    support,
    resistance,
    rsi: num(raw.rsi),
    macd: {
      line: num(raw.macd?.line),
      signal: num(raw.macd?.signal),
      histogram: num(raw.macd?.histogram),
    },
    ema20: num(raw.ema20),
    ema50: num(raw.ema50),
    candles,
  };
}

function calculateEMA(candles: Candle[], period: number) {
  const result: (number | null)[] = candles.map(() => null);
  if (candles.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;

  let previous = sum / period;
  result[period - 1] = previous;
  const k = 2 / (period + 1);

  for (let i = period; i < candles.length; i++) {
    previous = candles[i].close * k + previous * (1 - k);
    result[i] = previous;
  }

  return result;
}

function Chart({
  data,
  count,
}: {
  data: Analysis;
  count: number;
}) {
  const all = data.candles;
  const candles = useMemo(
    () => all.slice(-count),
    [all, count]
  );

  const ema20 = useMemo(
    () => calculateEMA(all, 20).slice(-count),
    [all, count]
  );
  const ema50 = useMemo(
    () => calculateEMA(all, 50).slice(-count),
    [all, count]
  );

  const width = 900;
  const height = 390;
  const left = 12;
  const right = 120;
  const top = 22;
  const bottom = 42;
  const pw = width - left - right;
  const ph = height - top - bottom;

  const values = [
    ...candles.flatMap((c) => [c.low, c.high]),
    ...ema20.filter((v): v is number => v !== null),
    ...ema50.filter((v): v is number => v !== null),
    data.price,
    data.support,
    data.resistance,
  ].filter(Number.isFinite);

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, hi * 0.0001);
  const min = lo - pad;
  const max = hi + pad;

  const y = (v: number) =>
    top + ((max - v) / (max - min)) * ph;

  const slot = pw / candles.length;
  const body = Math.max(2, slot * 0.58);

  function linePath(arr: (number | null)[]) {
    let path = "";
    arr.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      const x = left + slot * (i + 0.5);
      path += `${path ? " L" : "M"}${x},${y(v)}`;
    });
    return path;
  }

  const levels = [
    { name: "SUP", value: data.support, color: "#22c55e" },
    { name: "RES", value: data.resistance, color: "#fb7185" },
    { name: "PRICE", value: data.price, color: "#60a5fa" },
  ];

  return (
    <div className="chartViewport">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chartSvg"
        role="img"
        aria-label="BTC or ETH candlestick chart with EMA and price levels"
      >
        <rect width={width} height={height} fill="#101b2d" />

        {Array.from({ length: 5 }, (_, i) => {
          const p = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(p)}
                y2={y(p)}
                stroke="#293b55"
                strokeDasharray="4 5"
              />
              <text
                x={width - right + 8}
                y={y(p) + 4}
                fill="#94a3b8"
                fontSize="12"
              >
                {fmt(p)}
              </text>
            </g>
          );
        })}

        {candles.map((c, i) => {
          const x = left + slot * (i + 0.5);
          const green = c.close >= c.open;
          const color = green ? "#22c55e" : "#ef4444";

          return (
            <g key={`${c.time}-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1.5"
              />
              <rect
                x={x - body / 2}
                y={Math.min(y(c.open), y(c.close))}
                width={body}
                height={Math.max(
                  1.5,
                  Math.abs(y(c.open) - y(c.close))
                )}
                fill={color}
              />
            </g>
          );
        })}

        <path
          d={linePath(ema20)}
          stroke="#fbbf24"
          strokeWidth="2.5"
          fill="none"
        />
        <path
          d={linePath(ema50)}
          stroke="#a78bfa"
          strokeWidth="2.5"
          fill="none"
        />

        {levels.map((level) => (
          <g key={level.name}>
            <line
              x1={left}
              x2={width - right}
              y1={y(level.value)}
              y2={y(level.value)}
              stroke={level.color}
              strokeDasharray="6 5"
              strokeWidth="1.8"
            />
            <rect
              x={width - right}
              y={y(level.value) - 11}
              width={right - 4}
              height="22"
              fill="#24364f"
              rx="4"
            />
            <text
              x={width - right + 5}
              y={y(level.value) + 4}
              fill={level.color}
              fontSize="12"
              fontWeight="bold"
            >
              {level.name} {fmt(level.value)}
            </text>
          </g>
        ))}

        {candles.map((c, i) => {
          const step = Math.max(1, Math.ceil(candles.length / 6));
          if (i % step !== 0) return null;

          const date = new Date(
            c.time < 1e12 ? c.time * 1000 : c.time
          );

          return (
            <text
              key={c.time}
              x={left + slot * (i + 0.5)}
              y={height - 13}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
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
      <span className="muted">{label}</span>
      <strong style={{ color: color || "#e2e8f0" }}>
        {value}
      </strong>
    </div>
  );
}

function signalColor(signal: Signal) {
  return signal === "LONG"
    ? "#22c55e"
    : signal === "SHORT"
    ? "#fb7185"
    : "#facc15";
}

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [tf, setTf] = useState<TF>("15m");
  const [data, setData] = useState<Analysis | null>(null);
  const [multi, setMulti] = useState<
    Partial<Record<TF, Analysis>>
  >({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [zoom, setZoom] = useState(60);
  const [updated, setUpdated] = useState("");
  const [failures, setFailures] = useState(0);

  const selectedRef = useRef({ coin, tf });
  const dataRef = useRef<Partial<Record<TF, Analysis>>>({});
  const busyRef = useRef(false);
  const failureRef = useRef(0);
  const requestRef = useRef(0);

  const fetchOne = useCallback(
    async (
      c: Coin,
      t: TF,
      signal?: AbortSignal
    ): Promise<Analysis> => {
      const query = new URLSearchParams({
        coin: c,
        timeframe: t,
      });

      const response = await fetch(
        `/api/analysis?${query.toString()}`,
        { cache: "no-store", signal }
      );

      const text = await response.text();
      let json: any;

      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Non-JSON API response (HTTP ${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          String(json.error || `HTTP ${response.status}`)
        );
      }

      return normalize(json, c, t);
    },
    []
  );

  useEffect(() => {
    selectedRef.current = { coin, tf };
    dataRef.current = {};
    setData(null);
    setMulti({});
    setError("");
    setLoading(true);
    failureRef.current = 0;
    setFailures(0);

    const controller = new AbortController();
    let active = true;
    const generation = ++requestRef.current;

    async function initialLoad() {
      busyRef.current = true;

      try {
        const results = await Promise.allSettled(
          TFS.map((t) => fetchOne(coin, t, controller.signal))
        );

        if (!active || generation !== requestRef.current) return;

        const next: Partial<Record<TF, Analysis>> = {};
        results.forEach((result, i) => {
          if (result.status === "fulfilled") {
            next[TFS[i]] = result.value;
          }
        });

        dataRef.current = next;
        setMulti(next);
        setData(next[tf] || null);

        if (!next[tf]) {
          const failed = results[TFS.indexOf(tf)];
          setError(
            failed.status === "rejected"
              ? String(failed.reason?.message || failed.reason)
              : "Selected timeframe unavailable"
          );
          failureRef.current = 1;
          setFailures(1);
        } else {
          setUpdated(
            new Date().toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
            })
          );
        }
      } finally {
        if (active && generation === requestRef.current) {
          busyRef.current = false;
          setLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      active = false;
      controller.abort();
      requestRef.current++;
      busyRef.current = false;
    };
  }, [coin, tf, fetchOne]);

  const refresh = useCallback(async () => {
    if (busyRef.current || document.visibilityState !== "visible") {
      return;
    }

    busyRef.current = true;
    const generation = requestRef.current;
    const { coin: currentCoin, tf: currentTf } = selectedRef.current;

    try {
      const result = await fetchOne(currentCoin, currentTf);

      if (generation !== requestRef.current) return;

      dataRef.current = {
        ...dataRef.current,
        [currentTf]: result,
      };

      setData(result);
      setMulti({ ...dataRef.current });
      setError("");
      failureRef.current = 0;
      setFailures(0);
      setUpdated(
        new Date().toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
        })
      );
    } catch (e: any) {
      if (generation !== requestRef.current) return;
      failureRef.current += 1;
      setFailures(failureRef.current);
      setError(e?.message || "Refresh failed");
    } finally {
      busyRef.current = false;
    }
  }, [fetchOne]);

  useEffect(() => {
    if (!auto) return;

    const delay = Math.min(
      REFRESH_MS * Math.pow(2, Math.min(failures, 5)),
      MAX_RETRY_MS
    );

    const timer = setInterval(refresh, delay);
    return () => clearInterval(timer);
  }, [auto, refresh, failures]);

  const manualRefresh = () => {
    refresh();
  };

  const confirmations = TFS.map((t) => ({
    tf: t,
    data: multi[t],
  }));

  const received = confirmations.filter((x) => x.data).length;
  const longs = confirmations.filter(
    (x) => x.data?.signal === "LONG"
  ).length;
  const shorts = confirmations.filter(
    (x) => x.data?.signal === "SHORT"
  ).length;
  const holds = confirmations.filter(
    (x) => x.data?.signal === "HOLD"
  ).length;

  const overall: Signal =
    received === 4 && longs >= 3
      ? "LONG"
      : received === 4 && shorts >= 3
      ? "SHORT"
      : "HOLD";

  const trend =
    data &&
    Number.isFinite(data.ema20) &&
    Number.isFinite(data.ema50)
      ? data.ema20 > data.ema50
        ? "Bullish"
        : data.ema20 < data.ema50
        ? "Bearish"
        : "Neutral"
      : "Unknown";

  const supportDistance = data
    ? ((data.price - data.support) / data.price) * 100
    : NaN;
  const resistanceDistance = data
    ? ((data.resistance - data.price) / data.price) * 100
    : NaN;

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div>
            <h1>₿ Crypto Signal Pro</h1>
            <p className="muted">
              Delta Exchange India · Milestone 9.1
            </p>
          </div>
          <span className="apiStatus">● API Analysis</span>
        </header>

        <section className="panel">
          <div className="controls">
            <div className="coinButtons">
              {(["BTC", "ETH"] as Coin[]).map((c) => (
                <button
                  key={c}
                  className={coin === c ? "active" : ""}
                  onClick={() => setCoin(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <select
              value={tf}
              onChange={(e) => setTf(e.target.value as TF)}
            >
              {TFS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="priceRow">
            <div>
              <span className="muted">
                {data?.symbol || `${coin}USD`} · {tf}
              </span>
              <h2>{data ? `$${fmt(data.price)}` : "—"}</h2>
            </div>
            <div
              className="signal"
              style={{
                color: data ? signalColor(data.signal) : "#94a3b8",
              }}
            >
              {data?.signal || "—"}
            </div>
          </div>

          <p className="muted status">
            {loading ? "Loading analysis..." : "Last checked"}
            {updated ? ` · ${updated} IST` : ""}
          </p>

          <div className="actions">
            <button onClick={manualRefresh} disabled={loading}>
              ↻ Refresh Now
            </button>
            <label>
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              Auto Refresh (1 sec)
            </label>
          </div>

          <p className="hint">
            Refreshes the selected timeframe every second while the
            page is visible. Candles update when the API supplies
            new completed candles.
          </p>
        </section>

        {error && (
          <section className="panel error">
            <strong>API Error</strong>
            <p>{error}</p>
            <p>Retry delay increases after repeated failures.</p>
          </section>
        )}

        <section className="panel">
          <div className="sectionHeading">
            <h3>Candlestick Chart</h3>
            <div className="zoomControls">
              <button
                onClick={() => setZoom((v) => Math.max(20, v - 20))}
                disabled={zoom <= 20}
              >
                +
              </button>
              <span>{zoom} candles</span>
              <button
                onClick={() => setZoom((v) => Math.min(120, v + 20))}
                disabled={zoom >= 120}
              >
                −
              </button>
            </div>
          </div>

          {data ? (
            <>
              <Chart data={data} count={zoom} />
              <div className="legend">
                <span style={{ color: "#fbbf24" }}>━ EMA 20</span>
                <span style={{ color: "#a78bfa" }}>━ EMA 50</span>
                <span style={{ color: "#22c55e" }}>━ Support</span>
                <span style={{ color: "#fb7185" }}>━ Resistance</span>
                <span style={{ color: "#60a5fa" }}>━ API Price</span>
              </div>
              <p className="hint">
                Use + and − to zoom. The chart stays inside the
                mobile screen.
              </p>
            </>
          ) : (
            <div className="empty">Waiting for candles...</div>
          )}
        </section>

        <section className="metricsGrid">
          <Metric
            label="Support"
            value={data ? `$${fmt(data.support)}` : "—"}
            color="#22c55e"
          />
          <Metric
            label="Resistance"
            value={data ? `$${fmt(data.resistance)}` : "—"}
            color="#fb7185"
          />
          <Metric
            label="Price − Support"
            value={fmt(supportDistance) + "%"}
          />
          <Metric
            label="Resistance − Price"
            value={fmt(resistanceDistance) + "%"}
          />
        </section>

        <section className="panel">
          <div className="sectionHeading">
            <h3>Multi-Timeframe Confirmation</h3>
            <span className="muted">{received}/4 received</span>
          </div>

          <div className="tfGrid">
            {confirmations.map((item) => (
              <div className="tfRow" key={item.tf}>
                <strong>{item.tf}</strong>
                <span
                  style={{
                    color: item.data
                      ? signalColor(item.data.signal)
                      : "#94a3b8",
                  }}
                >
                  {item.data
                    ? `${item.data.signal} · RSI ${fmt(item.data.rsi)}`
                    : "Unavailable"}
                </span>
              </div>
            ))}
          </div>

          <p>
            Confirmation:{" "}
            <strong style={{ color: signalColor(overall) }}>
              {overall}
            </strong>
          </p>
          <p className="muted">
            {longs} LONG · {shorts} SHORT · {holds} HOLD
          </p>
          <p className="hint">
            Other timeframes are snapshots loaded when the coin or
            timeframe changes. They are not refreshed every second.
            A directional confirmation requires at least 3 matching
            signals and all 4 timeframes available.
          </p>
        </section>

        <section className="panel">
          <h3>Technical Indicators · {tf}</h3>
          <div className="metricsGrid inner">
            <Metric label="RSI (14)" value={fmt(data?.rsi)} />
            <Metric
              label="MACD Line"
              value={fmt(data?.macd.line, 4)}
            />
            <Metric
              label="MACD Signal"
              value={fmt(data?.macd.signal, 4)}
            />
            <Metric
              label="MACD Histogram"
              value={fmt(data?.macd.histogram, 4)}
            />
            <Metric label="EMA 20" value={fmt(data?.ema20)} />
            <Metric label="EMA 50" value={fmt(data?.ema50)} />
            <Metric label="EMA Trend" value={trend} />
            <Metric
              label="Selected Signal"
              value={data?.signal || "—"}
              color={data ? signalColor(data.signal) : undefined}
            />
          </div>
        </section>

        <section className="panel">
          <h3>Signal Interpretation</h3>
          {data ? (
            <p>
              Selected {tf}: <strong>{data.signal}</strong>.{" "}
              {data.signal === "LONG"
                ? "The API indicates a bullish setup."
                : data.signal === "SHORT"
                ? "The API indicates a bearish setup."
                : "No clear directional entry is indicated."}
            </p>
          ) : (
            <p className="muted">Waiting for analysis...</p>
          )}
          <p className="hint">
            Confirm price action and manage risk before making
            trading decisions.
          </p>
        </section>

        <footer>
          Educational technical analysis only. No guaranteed
          signals and no automatic order placement.
        </footer>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }
        .page {
          width: 100%;
          max-width: 100%;
          min-height: 100vh;
          overflow-x: clip;
          background: #091325;
          color: #e2e8f0;
          font-family: Arial, sans-serif;
          padding: 14px;
        }
        .container {
          width: 100%;
          max-width: 1100px;
          min-width: 0;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        h1 {
          font-size: clamp(22px, 5vw, 30px);
          margin: 0 0 8px;
        }
        h2 {
          font-size: clamp(25px, 6vw, 38px);
          margin: 12px 0;
          overflow-wrap: anywhere;
        }
        h3 {
          font-size: 19px;
          margin: 0;
        }
        p {
          line-height: 1.6;
        }
        .muted,
        .hint {
          color: #94a3b8;
        }
        .hint {
          font-size: 12px;
          line-height: 1.6;
        }
        .apiStatus {
          color: #22c55e;
          font-size: 13px;
        }
        .panel {
          background: #17263c;
          border: 1px solid #304560;
          border-radius: 18px;
          padding: 18px;
          margin-bottom: 18px;
          width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .controls,
        .priceRow,
        .sectionHeading,
        .actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .coinButtons,
        .zoomControls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        button,
        select {
          background: #243852;
          border: 1px solid #38516f;
          border-radius: 10px;
          padding: 11px 14px;
          color: #e2e8f0;
          font-size: 14px;
          cursor: pointer;
        }
        button.active {
          background: #2563eb;
          border-color: #60a5fa;
        }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .priceRow {
          margin-top: 22px;
        }
        .signal {
          padding: 12px 16px;
          border: 1px solid #38516f;
          border-radius: 12px;
          font-size: 21px;
          font-weight: bold;
        }
        .status {
          font-size: 13px;
        }
        .actions {
          justify-content: flex-start;
        }
        .actions label {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
        }
        .zoomControls button {
          padding: 7px 12px;
          font-size: 18px;
        }
        .zoomControls span {
          font-size: 12px;
          color: #94a3b8;
        }
        .chartViewport {
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          margin-top: 16px;
          border-radius: 10px;
          background: #101b2d;
        }
        .chartSvg {
          display: block;
          width: 100%;
          height: auto;
          max-width: 100%;
        }
        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
          font-size: 12px;
        }
        .metricsGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .metricsGrid.inner {
          margin: 18px 0 0;
        }
        .metric {
          min-width: 0;
          background: #17263c;
          border: 1px solid #304560;
          border-radius: 12px;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .metric strong {
          font-size: 18px;
          overflow-wrap: anywhere;
        }
        .tfGrid {
          display: grid;
          gap: 9px;
          margin: 18px 0;
        }
        .tfRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          background: #101b2d;
          border: 1px solid #293b55;
          border-radius: 10px;
          padding: 13px;
          font-size: 14px;
        }
        .error {
          border-color: #ef4444;
          color: #fda4af;
        }
        .empty {
          min-height: 220px;
          display: flex;
          justify-content: center;
          align-items: center;
          color: #94a3b8;
        }
        footer {
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
          padding: 15px;
        }
        @media (min-width: 800px) {
          .metricsGrid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (max-width: 480px) {
          .page {
            padding: 10px;
          }
          .panel {
            padding: 13px;
          }
          .metric {
            padding: 12px;
          }
          .metric strong {
            font-size: 15px;
          }
          .tfRow {
            font-size: 12px;
          }
        }
      `}</style>
    </main>
  );
}
