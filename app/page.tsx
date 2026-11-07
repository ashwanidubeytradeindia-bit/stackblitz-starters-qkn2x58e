
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
const REFRESH_MS = 30000;

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "")
    return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const fmt = (v: unknown, digits = 2): string => {
  const n = num(v);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
};

const colorOf = (s: Signal) =>
  s === "LONG"
    ? "#22c55e"
    : s === "SHORT"
    ? "#fb7185"
    : "#facc15";

function parseAnalysis(
  raw: any,
  coin: Coin,
  timeframe: TF
): Analysis {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid API response");

  if (raw.error)
    throw new Error(String(raw.error));

  const price = num(raw.price);
  const support = num(raw.support);
  const resistance = num(raw.resistance);

  if (![price, support, resistance].every(Number.isFinite))
    throw new Error("Price or support/resistance missing");

  if (!Array.isArray(raw.candles))
    throw new Error("Candlestick data missing");

  const candles: Candle[] = raw.candles
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
    .filter(
      (c: Candle, i: number, a: Candle[]) =>
        i === 0 || c.time !== a[i - 1].time
    );

  if (candles.length < 2)
    throw new Error("Not enough valid candles");

  const signal: Signal =
    raw.signal === "LONG" ||
    raw.signal === "SHORT" ||
    raw.signal === "HOLD"
      ? raw.signal
      : "HOLD";

  return {
    coin,
    symbol: String(raw.symbol || `${coin}USD`),
    timeframe,
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

async function getAnalysis(
  coin: Coin,
  timeframe: TF,
  signal?: AbortSignal
): Promise<Analysis> {
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
      `API returned non-JSON (HTTP ${response.status})`
    );
  }

  if (!response.ok)
    throw new Error(
      String(json.error || `HTTP ${response.status}`)
    );

  return parseAnalysis(json, coin, timeframe);
}

function calculateEMA(
  candles: Candle[],
  period: number
): (number | null)[] {
  const result: (number | null)[] = Array(
    candles.length
  ).fill(null);

  if (candles.length < period) return result;

  let sum = 0;

  for (let i = 0; i < period; i++)
    sum += candles[i].close;

  let ema = sum / period;
  result[period - 1] = ema;

  const k = 2 / (period + 1);

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result[i] = ema;
  }

  return result;
}

function Chart({
  data,
  zoom,
}: {
  data: Analysis;
  zoom: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const candles = useMemo(
    () => data.candles.slice(-180),
    [data.candles]
  );

  const ema20 = useMemo(
    () => calculateEMA(candles, 20),
    [candles]
  );

  const ema50 = useMemo(
    () => calculateEMA(candles, 50),
    [candles]
  );

  const slot = 8 * zoom;
  const left = 12;
  const right = 108;
  const top = 24;
  const bottom = 42;
  const height = 390;

  const plotWidth = candles.length * slot;
  const width = left + plotWidth + right;
  const plotHeight = height - top - bottom;

  const bounds = useMemo(() => {
    const prices = candles.flatMap((c) => [
      c.low,
      c.high,
    ]);

    prices.push(
      data.support,
      data.resistance,
      data.price
    );

    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const padding = Math.max(
      (hi - lo) * 0.08,
      hi * 0.0001
    );

    return {
      min: lo - padding,
      max: hi + padding,
    };
  }, [candles, data]);

  const y = (price: number) =>
    top +
    ((bounds.max - price) /
      (bounds.max - bounds.min)) *
      plotHeight;

  const x = (i: number) =>
    left + slot * (i + 0.5);

  const makePath = (values: (number | null)[]) => {
    let path = "";
    let started = false;

    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        started = false;
        return;
      }

      path += `${started ? "L" : "M"}${x(i)},${y(v)} `;
      started = true;
    });

    return path;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [data.coin, data.timeframe, zoom]);

  const lines = [
    {
      label: "PRICE",
      price: data.price,
      color: "#3b82f6",
      dash: "3 4",
    },
    {
      label: "SUP",
      price: data.support,
      color: "#22c55e",
      dash: "7 5",
    },
    {
      label: "RES",
      price: data.resistance,
      color: "#fb7185",
      dash: "7 5",
    },
  ];

  const labelPositions = lines
    .map((l) => ({ ...l, originalY: y(l.price) }))
    .sort((a, b) => a.originalY - b.originalY);

  const placed: Record<string, number> = {};
  const gap = 23;

  labelPositions.forEach((l, i) => {
    const minimum = i === 0
      ? top + 11
      : placed[labelPositions[i - 1].label] + gap;

    placed[l.label] = Math.max(
      minimum,
      l.originalY
    );
  });

  const overflow =
    placed[labelPositions[labelPositions.length - 1].label] -
    (height - bottom - 10);

  if (overflow > 0) {
    labelPositions.forEach((l) => {
      placed[l.label] -= overflow;
    });
  }

  return (
    <div className="chartOuter">
      <div
        className="chartScroll"
        ref={scrollRef}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Candlestick chart with EMA, support, resistance and price"
          style={{ display: "block" }}
        >
          <rect
            width={width}
            height={height}
            fill="#101b2d"
          />

          {Array.from({ length: 5 }, (_, i) => {
            const p =
              bounds.min +
              ((bounds.max - bounds.min) * i) / 4;

            return (
              <g key={i}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(p)}
                  y2={y(p)}
                  stroke="#29384e"
                  strokeDasharray="4 5"
                />
                <text
                  x={width - right + 6}
                  y={y(p) + 4}
                  fill="#94a3b8"
                  fontSize="11"
                >
                  {fmt(p)}
                </text>
              </g>
            );
          })}

          {candles.map((c, i) => {
            const up = c.close >= c.open;
            const color = up
              ? "#22c55e"
              : "#ef4444";

            const bodyTop = Math.min(
              y(c.open),
              y(c.close)
            );

            const bodyHeight = Math.max(
              1.5,
              Math.abs(y(c.open) - y(c.close))
            );

            return (
              <g key={c.time}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={color}
                  strokeWidth="1.3"
                />
                <rect
                  x={x(i) - slot * 0.3}
                  y={bodyTop}
                  width={slot * 0.6}
                  height={bodyHeight}
                  fill={color}
                  rx="0.7"
                />
              </g>
            );
          })}

          <path
            d={makePath(ema20)}
            stroke="#fbbf24"
            fill="none"
            strokeWidth="2"
          />

          <path
            d={makePath(ema50)}
            stroke="#a78bfa"
            fill="none"
            strokeWidth="2"
          />

          {lines.map((l) => (
            <g key={l.label}>
              <line
                x1={left}
                x2={width - right}
                y1={l.originalY ?? y(l.price)}
                y2={l.originalY ?? y(l.price)}
                stroke={l.color}
                strokeDasharray={l.dash}
                strokeWidth="1.6"
              />

              <rect
                x={width - right}
                y={placed[l.label] - 10}
                width={right - 3}
                height={20}
                rx="4"
                fill={l.color}
              />

              <text
                x={width - right + 5}
                y={placed[l.label] + 4}
                fontSize="11"
                fill="#ffffff"
                fontWeight="bold"
              >
                {l.label} {fmt(l.price)}
              </text>
            </g>
          ))}

          {candles.map((c, i) => {
            const every = Math.max(
              1,
              Math.ceil(85 / slot)
            );

            if (i % every !== 0) return null;

            const ms =
              c.time < 1e12
                ? c.time * 1000
                : c.time;

            const date = new Date(ms);

            return (
              <text
                key={`time-${c.time}`}
                x={x(i)}
                y={height - 13}
                fill="#94a3b8"
                fontSize="11"
                textAnchor="middle"
              >
                {date.toLocaleString("en-IN", {
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                })}
              </text>
            );
          })}
        </svg>
      </div>

      <div className="legend">
        <span style={{ color: "#fbbf24" }}>
          ━ EMA 20
        </span>
        <span style={{ color: "#a78bfa" }}>
          ━ EMA 50
        </span>
        <span style={{ color: "#22c55e" }}>
          ━ Support
        </span>
        <span style={{ color: "#fb7185" }}>
          ━ Resistance
        </span>
        <span style={{ color: "#60a5fa" }}>
          ━ Price
        </span>
      </div>

      <p className="hint">
        Swipe horizontally to view older candles.
        Zoom changes candle spacing.
      </p>
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
      <div className="metricLabel">{label}</div>
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
    useState<TF>("15m");

  const [data, setData] =
    useState<Analysis | null>(null);

  const [allTF, setAllTF] =
    useState<Partial<Record<TF, Analysis>>>({});

  const [tfErrors, setTfErrors] =
    useState<Partial<Record<TF, string>>>({});

  const [zoom, setZoom] = useState(1.5);
  const [autoRefresh, setAutoRefresh] =
    useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");

  const controllerRef =
    useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError("");

    const results = await Promise.allSettled(
      TFS.map((tf) =>
        getAnalysis(coin, tf, controller.signal)
      )
    );

    if (controller.signal.aborted) return;

    const next: Partial<Record<TF, Analysis>> = {};
    const failures: Partial<Record<TF, string>> = {};

    results.forEach((r, i) => {
      const tf = TFS[i];

      if (r.status === "fulfilled") {
        next[tf] = r.value;
      } else {
        failures[tf] =
          r.reason?.message || "API unavailable";
      }
    });

    setAllTF(next);
    setTfErrors(failures);

    const selected = next[timeframe];

    if (selected) {
      setData(selected);
      setUpdated(
        new Date().toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
        })
      );
    } else {
      setData(null);
      setError(
        failures[timeframe] ||
          "Selected timeframe unavailable"
      );
    }

    setLoading(false);
  }, [coin, timeframe]);

  useEffect(() => {
    load();

    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        load();
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [load, autoRefresh]);

  const counts = useMemo(() => {
    const values = Object.values(allTF);

    return {
      long: values.filter(
        (v) => v.signal === "LONG"
      ).length,
      short: values.filter(
        (v) => v.signal === "SHORT"
      ).length,
      hold: values.filter(
        (v) => v.signal === "HOLD"
      ).length,
      received: values.length,
    };
  }, [allTF]);

  const confirmation: Signal =
    counts.received === 4 && counts.long >= 3
      ? "LONG"
      : counts.received === 4 && counts.short >= 3
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

  const supportDistance =
    data && data.price !== 0
      ? ((data.price - data.support) /
          data.price) *
        100
      : NaN;

  const resistanceDistance =
    data && data.price !== 0
      ? ((data.resistance - data.price) /
          data.price) *
        100
      : NaN;

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div>
            <h1>₿ Crypto Signal Pro</h1>
            <p>
              Delta Exchange India · Milestone 9.1
            </p>
          </div>
          <div className="online">
            ● API Technical Analysis
          </div>
        </header>

        <section className="panel">
          <div className="controls">
            <div className="coinButtons">
              {(["BTC", "ETH"] as Coin[]).map(
                (c) => (
                  <button
                    key={c}
                    className={
                      coin === c ? "active" : ""
                    }
                    onClick={() => setCoin(c)}
                  >
                    {c}
                  </button>
                )
              )}
            </div>

            <select
              value={timeframe}
              onChange={(e) =>
                setTimeframe(e.target.value as TF)
              }
            >
              <option value="5m">5 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="1h">1 Hour</option>
              <option value="4h">4 Hours</option>
            </select>
          </div>

          <div className="priceRow">
            <div className="priceBox">
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
                color: data
                  ? colorOf(data.signal)
                  : "#94a3b8",
                borderColor: data
                  ? colorOf(data.signal)
                  : "#475569",
              }}
            >
              {data?.signal || "—"}
            </div>
          </div>

          <div className="muted status">
            {loading
              ? "Refreshing analysis..."
              : error
              ? "API issue"
              : "Analysis updated"}

            {updated && ` · ${updated} IST`}
          </div>

          <div className="actions">
            <button
              onClick={load}
              disabled={loading}
            >
              {loading
                ? "Loading..."
                : "↻ Refresh Now"}
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
              Check <code>/api/analysis</code>
            </p>
          </section>
        )}

        <section className="panel chartPanel">
          <div className="sectionHeading">
            <h3>Candlestick Chart</h3>
            <div className="zoomControls">
              <button
                onClick={() =>
                  setZoom((z) =>
                    Math.max(0.75, z - 0.25)
                  )
                }
                disabled={zoom <= 0.75}
              >
                −
              </button>

              <span>{Math.round(zoom * 100)}%</span>

              <button
                onClick={() =>
                  setZoom((z) =>
                    Math.min(4, z + 0.25)
                  )
                }
                disabled={zoom >= 4}
              >
                +
              </button>

              <button onClick={() => setZoom(1.5)}>
                Reset
              </button>
            </div>
          </div>

          {data ? (
            <Chart data={data} zoom={zoom} />
          ) : (
            <div className="empty">
              {loading
                ? "Loading chart..."
                : "Chart unavailable"}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Support & Resistance</h3>

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
              label="Price − Support"
              value={
                Number.isFinite(supportDistance)
                  ? `${fmt(supportDistance)}%`
                  : "—"
              }
            />

            <Metric
              label="Resistance − Price"
              value={
                Number.isFinite(resistanceDistance)
                  ? `${fmt(resistanceDistance)}%`
                  : "—"
              }
            />
          </div>
        </section>

        <section className="panel">
          <div className="sectionHeading">
            <h3>Multi-Timeframe Confirmation</h3>
            <strong className="muted">
              {counts.received}/4 received
            </strong>
          </div>

          <div className="tfList">
            {TFS.map((tf) => {
              const item = allTF[tf];

              return (
                <div className="tfRow" key={tf}>
                  <strong>{tf}</strong>

                  {item ? (
                    <span
                      style={{
                        color: colorOf(item.signal),
                      }}
                    >
                      {item.signal} · RSI{" "}
                      {fmt(item.rsi)}
                    </span>
                  ) : (
                    <span className="muted">
                      {tfErrors[tf] ||
                        "Waiting..."}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="confirmation">
            Confirmation:{" "}
            <strong
              style={{
                color: colorOf(confirmation),
              }}
            >
              {confirmation}
            </strong>
          </div>

          <p className="muted">
            {counts.long} LONG · {counts.short} SHORT
            · {counts.hold} HOLD
          </p>

          <p className="hint">
            Directional confirmation requires
            at least 3 matching signals from
            all 4 available timeframes.
            Otherwise HOLD is displayed.
          </p>
        </section>

        <section className="panel">
          <h3>
            Technical Indicators · {timeframe}
          </h3>

          <div className="metrics">
            <Metric
              label="RSI (14)"
              value={fmt(data?.rsi)}
            />
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
              label="Selected Signal"
              value={data?.signal || "—"}
              color={
                data
                  ? colorOf(data.signal)
                  : undefined
              }
            />
          </div>
        </section>

        <section className="panel">
          <h3>Signal Interpretation</h3>

          {data ? (
            <>
              <p>
                Selected {timeframe}:{" "}
                <strong
                  style={{
                    color: colorOf(data.signal),
                  }}
                >
                  {data.signal}
                </strong>
              </p>

              <p>
                EMA Trend: <strong>{trend}</strong>
              </p>

              <p>
                Multi-timeframe confirmation:{" "}
                <strong
                  style={{
                    color: colorOf(confirmation),
                  }}
                >
                  {confirmation}
                </strong>
              </p>

              <p className="muted">
                {confirmation === "HOLD"
                  ? "No strong directional agreement across all timeframes."
                  : "Multiple timeframes show the same directional signal. This is not a guaranteed entry."}
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
          analysis only. Market signals involve
          risk. No automatic trades are placed.
        </footer>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          background: #091325;
          color: #e2e8f0;
          min-height: 100vh;
          padding: 16px;
          font-family: Arial, sans-serif;
          overflow-x: hidden;
        }

        .container {
          max-width: 1100px;
          margin: auto;
          min-width: 0;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }

        h1 {
          font-size: 27px;
          margin: 0 0 10px;
        }

        h2 {
          font-size: clamp(25px, 6vw, 38px);
          margin: 12px 0;
          overflow-wrap: anywhere;
        }

        h3 {
          font-size: 19px;
          margin: 0 0 18px;
        }

        p {
          line-height: 1.6;
        }

        .muted,
        .header p,
        .hint {
          color: #94a3b8;
        }

        .online {
          color: #22c55e;
          font-size: 13px;
        }

        .panel {
          background: #17263c;
          border: 1px solid #304560;
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 20px;
          min-width: 0;
          overflow: hidden;
        }

        .controls,
        .priceRow,
        .sectionHeading,
        .actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .coinButtons {
          display: flex;
          gap: 8px;
        }

        button,
        select {
          background: #233650;
          border: 1px solid #38516f;
          color: #ffffff;
          padding: 11px 15px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
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
          margin-top: 24px;
        }

        .priceBox {
          min-width: 0;
        }

        .signal {
          padding: 12px 17px;
          border: 1px solid;
          border-radius: 12px;
          font-size: 21px;
          font-weight: bold;
        }

        .status {
          margin: 12px 0 18px;
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

        .sectionHeading {
          margin-bottom: 15px;
        }

        .sectionHeading h3 {
          margin: 0;
        }

        .zoomControls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .zoomControls button {
          padding: 8px 12px;
        }

        .zoomControls span {
          font-size: 12px;
          min-width: 40px;
          text-align: center;
        }

        .chartOuter {
          width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .chartScroll {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          border-radius: 10px;
          background: #101b2d;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
        }

        .legend {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          padding: 14px 0 4px;
          font-size: 12px;
        }

        .hint {
          font-size: 12px;
          line-height: 1.6;
        }

        .metrics {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .metric {
          min-width: 0;
          padding: 15px;
          background: #101b2d;
          border: 1px solid #29384e;
          border-radius: 12px;
        }

        .metricLabel {
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.4;
        }

        .metricValue {
          font-size: 19px;
          font-weight: bold;
          margin-top: 10px;
          overflow-wrap: anywhere;
          line-height: 1.35;
        }

        .tfList {
          display: grid;
          gap: 9px;
        }

        .tfRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #101b2d;
          border: 1px solid #29384e;
          border-radius: 10px;
          padding: 14px;
          font-size: 14px;
          overflow-wrap: anywhere;
        }

        .tfRow span {
          text-align: right;
        }

        .confirmation {
          margin-top: 18px;
        }

        .error {
          border-color: #ef4444;
          color: #fda4af;
          overflow-wrap: anywhere;
        }

        .empty {
          min-height: 250px;
          display: flex;
          justify-content: center;
          align-items: center;
          text-align: center;
          color: #94a3b8;
        }

        footer {
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.7;
          padding: 16px;
        }

        @media (max-width: 700px) {
          .page {
            padding: 10px;
          }

          .panel {
            padding: 14px;
            border-radius: 15px;
          }

          h1 {
            font-size: 23px;
          }

          .metrics {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .metric {
            padding: 12px;
          }

          .metricValue {
            font-size: 16px;
          }

          .metricLabel {
            font-size: 12px;
          }

          .controls {
            align-items: stretch;
          }

          .controls select {
            max-width: 100%;
          }

          .chartPanel {
            padding: 10px;
          }

          .sectionHeading {
            align-items: flex-start;
          }

          .tfRow {
            padding: 12px;
            font-size: 13px;
          }

          .priceRow {
            align-items: center;
          }
        }
      `}</style>
    </main>
  );
}
