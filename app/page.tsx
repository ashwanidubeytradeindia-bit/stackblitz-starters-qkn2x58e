
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Coin = "BTC" | "ETH";
type Timeframe = "5m" | "15m" | "1h" | "4h";
type Signal = "LONG" | "SHORT" | "HOLD";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type FrameData = {
  price?: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  support?: number;
  resistance?: number;
  direction?: string;
  signal?: string;
};

type Analysis = {
  coin?: string;
  symbol?: string;
  timeframe?: string;
  price?: number;
  signal?: string;
  support?: number;
  resistance?: number;
  rsi?: number;
  macd?: number | {
    line?: number;
    signal?: number;
    histogram?: number;
  };
  ema20?: number;
  ema50?: number;
  ema200?: number;
  candles?: Candle[];
  timeframes?: Record<string, FrameData>;
  confirmation?: string;
  updatedAt?: string;
  lastCandleTime?: string;
  status?: string;
  error?: string;
  plan?: {
    entry?: number;
    stop_loss?: number;
    target?: number;
  } | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h"];

const colors = {
  bg: "#0b1426",
  card: "#16243a",
  border: "#30445f",
  text: "#e6eefb",
  muted: "#9aacc4",
  green: "#22c55e",
  red: "#fb7185",
  blue: "#3b82f6",
  yellow: "#facc15",
};

const money = (value: unknown, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const number = (value: unknown, digits = 2) => {
  if (value === null || value === undefined || value === "")
    return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
};

function normalizeSignal(value: unknown): Signal {
  const s = String(value || "").toUpperCase();
  if (s === "LONG" || s === "BUY" || s === "BULLISH")
    return "LONG";
  if (s === "SHORT" || s === "SELL" || s === "BEARISH")
    return "SHORT";
  return "HOLD";
}

function signalColor(signal: Signal) {
  if (signal === "LONG") return colors.green;
  if (signal === "SHORT") return colors.red;
  return colors.yellow;
}

function normalizeCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];

  const parsed = value
    .map((item: any) => {
      const rawTime = Number(item?.time);
      const time =
        rawTime > 1e12 ? Math.floor(rawTime / 1000) : rawTime;

      return {
        time,
        open: Number(item?.open),
        high: Number(item?.high),
        low: Number(item?.low),
        close: Number(item?.close),
        volume: Number(item?.volume ?? 0),
      };
    })
    .filter(
      (c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        c.open > 0 &&
        c.high >= Math.max(c.open, c.close, c.low) &&
        c.low <= Math.min(c.open, c.close)
    )
    .sort((a, b) => a.time - b.time);

  return parsed.filter(
    (c, i) => i === 0 || c.time !== parsed[i - 1].time
  );
}

const cardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 18,
  padding: 18,
  marginBottom: 16,
};

const buttonStyle = (
  active: boolean
): React.CSSProperties => ({
  padding: "11px 16px",
  borderRadius: 10,
  border: `1px solid ${active ? "#60a5fa" : colors.border}`,
  background: active ? "#2563eb" : "#20314a",
  color: "white",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: active ? 700 : 400,
});

function Metric({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        marginBottom: 0,
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: colors.muted,
          fontSize: 13,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: color || colors.text,
          fontSize: "clamp(17px, 4vw, 25px)",
          fontWeight: 750,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CandleChart({
  candles,
  support,
  resistance,
}: {
  candles: Candle[];
  support?: number;
  resistance?: number;
}) {
  const data = candles.slice(-100);

  if (data.length < 2) {
    return (
      <div
        style={{
          height: 220,
          display: "grid",
          placeItems: "center",
          color: colors.muted,
          textAlign: "center",
          padding: 20,
        }}
      >
        Candlestick data unavailable.
        Check the API candles response.
      </div>
    );
  }

  const width = 900;
  const height = 370;
  const left = 15;
  const right = 112;
  const top = 22;
  const bottom = 36;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const levels = [
    ...data.map((c) => c.high),
    ...data.map((c) => c.low),
  ];

  if (Number.isFinite(support) && Number(support) > 0)
    levels.push(Number(support));

  if (Number.isFinite(resistance) && Number(resistance) > 0)
    levels.push(Number(resistance));

  const rawMin = Math.min(...levels);
  const rawMax = Math.max(...levels);
  const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.0005);

  const min = rawMin - padding;
  const max = rawMax + padding;

  const y = (price: number) =>
    top + ((max - price) / (max - min)) * plotHeight;

  const step = plotWidth / data.length;
  const bodyWidth = Math.max(2, Math.min(9, step * 0.65));

  const latest = data[data.length - 1];
  const latestY = y(latest.close);

  const levelLine = (
    value: number | undefined,
    color: string,
    label: string
  ) => {
    if (
      value === undefined ||
      value === null ||
      !Number.isFinite(Number(value)) ||
      Number(value) <= 0
    )
      return null;

    const py = y(Number(value));

    return (
      <g>
        <line
          x1={left}
          x2={width - right}
          y1={py}
          y2={py}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="8 5"
        />
        <text
          x={width - right + 7}
          y={Math.max(14, py - 6)}
          fill={color}
          fontSize={13}
          fontWeight="bold"
        >
          {label}
        </text>
        <text
          x={width - right + 7}
          y={Math.min(height - 5, py + 13)}
          fill={color}
          fontSize={12}
        >
          {number(value)}
        </text>
      </g>
    );
  };

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label="Candlestick chart with support and resistance"
        style={{ display: "block" }}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const price = min + ((max - min) * i) / 4;
          const py = y(price);

          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={py}
                y2={py}
                stroke="#334761"
                strokeWidth={1}
              />
              <text
                x={width - right + 7}
                y={py + 4}
                fill={colors.muted}
                fontSize={12}
              >
                {number(price)}
              </text>
            </g>
          );
        })}

        {data.map((c, i) => {
          const x = left + step * i + step / 2;
          const rising = c.close >= c.open;
          const color = rising ? "#10b981" : "#f43f5e";
          const bodyTop = Math.min(y(c.open), y(c.close));
          const bodyHeight = Math.max(
            1.5,
            Math.abs(y(c.open) - y(c.close))
          );

          return (
            <g key={c.time}>
              <line
                x1={x}
                x2={x}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth={1.4}
              />
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })}

        {levelLine(support, colors.green, "SUPPORT")}
        {levelLine(resistance, colors.red, "RESISTANCE")}

        <line
          x1={left}
          x2={width - right}
          y1={latestY}
          y2={latestY}
          stroke="#60a5fa"
          strokeWidth={1.4}
          strokeDasharray="3 4"
        />

        <text
          x={width - right + 7}
          y={latestY + 4}
          fill="#93c5fd"
          fontSize={13}
          fontWeight="bold"
        >
          {number(latest.close)}
        </text>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
          const index = Math.min(
            data.length - 1,
            Math.floor((data.length - 1) * fraction)
          );
          const candle = data[index];

          return (
            <text
              key={i}
              x={left + index * step}
              y={height - 10}
              fill={colors.muted}
              fontSize={13}
            >
              {new Date(candle.time * 1000).toLocaleDateString(
                "en-IN",
                { day: "2-digit", month: "short" }
              )}
            </text>
          );
        })}
      </svg>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          fontSize: 12,
          marginTop: 8,
          color: colors.muted,
        }}
      >
        <span style={{ color: colors.green }}>
          ━━ Support
        </span>
        <span style={{ color: colors.red }}>
          ━━ Resistance
        </span>
        <span style={{ color: "#60a5fa" }}>
          ┄┄ Last Close
        </span>
      </div>
    </div>
  );
}

async function fetchJSON(
  url: string,
  signal: AbortSignal
): Promise<any> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `API returned non-JSON response (HTTP ${response.status}). Check API URL and deployment.`
    );
  }

  const json = await response.json();

  if (!response.ok || json?.status === "disconnected") {
    throw new Error(
      json?.error || `API request failed: HTTP ${response.status}`
    );
  }

  return json;
}

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [data, setData] = useState<Analysis | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const requestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const id = ++requestId.current;

    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        coin,
        timeframe,
      });

      const result: Analysis = await fetchJSON(
        `${API_BASE}/api/analyze?${params.toString()}`,
        controller.signal
      );

      if (id !== requestId.current) return;

      setData(result);

      const parsed = normalizeCandles(result.candles);
      setCandles(parsed);

      if (
        result.price !== undefined &&
        Number.isFinite(Number(result.price))
      ) {
        setLivePrice(Number(result.price));
      } else {
        setLivePrice(null);
      }

      setLastUpdated(new Date().toLocaleTimeString("en-IN"));
    } catch (e) {
      if (id !== requestId.current || controller.signal.aborted)
        return;

      setError(
        e instanceof Error ? e.message : "Unable to load market data"
      );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [coin, timeframe]);

  useEffect(() => {
    setData(null);
    setCandles([]);
    setLivePrice(null);
    void load();

    return () => {
      requestId.current++;
      activeController.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      void load();
    }, 30000);

    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const signal = normalizeSignal(data?.signal);
  const signalTone = signalColor(signal);

  const currentPrice =
    livePrice !== null ? livePrice : data?.price;

  const support = data?.support;
  const resistance = data?.resistance;

  const macdLine =
    typeof data?.macd === "number"
      ? data.macd
      : data?.macd?.line;

  const macdSignal =
    typeof data?.macd === "object"
      ? data.macd?.signal
      : undefined;

  const frames = TIMEFRAMES.map((tf) => {
    const frame = data?.timeframes?.[tf];
    return {
      timeframe: tf,
      signal: normalizeSignal(frame?.direction || frame?.signal),
      rsi: frame?.rsi,
      exists: Boolean(frame),
    };
  });

  const directionalFrames = frames.filter(
    (f) => f.exists && f.signal !== "HOLD"
  );

  const longCount = directionalFrames.filter(
    (f) => f.signal === "LONG"
  ).length;

  const shortCount = directionalFrames.filter(
    (f) => f.signal === "SHORT"
  ).length;

  const confirmation =
    data?.confirmation ||
    (directionalFrames.length
      ? `${Math.max(longCount, shortCount)}/4`
      : "—");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: colors.bg,
        color: colors.text,
        padding: "22px 12px 50px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 22 }}>
          <h1
            style={{
              fontSize: "clamp(24px, 5vw, 34px)",
              margin: "0 0 7px",
            }}
          >
            ₿ Crypto Signal Pro
          </h1>
          <div style={{ color: colors.muted }}>
            Delta Exchange India · Technical Analysis
          </div>
          <div
            style={{
              color: colors.muted,
              marginTop: 10,
              fontSize: 13,
            }}
          >
            {lastUpdated
              ? `Analysis updated ${lastUpdated}`
              : "Waiting for analysis"}
          </div>
        </header>

        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {(["BTC", "ETH"] as Coin[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCoin(c)}
                  style={buttonStyle(coin === c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div>
              <label
                htmlFor="timeframe"
                style={{ color: colors.muted, marginRight: 8 }}
              >
                Timeframe
              </label>
              <select
                id="timeframe"
                value={timeframe}
                onChange={(e) =>
                  setTimeframe(e.target.value as Timeframe)
                }
                style={{
                  ...buttonStyle(false),
                  minWidth: 95,
                }}
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              marginTop: 26,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div>
              <div style={{ color: colors.muted }}>
                {coin}USD · Latest completed candle
              </div>
              <div
                style={{
                  fontSize: "clamp(29px, 7vw, 45px)",
                  fontWeight: 800,
                  marginTop: 4,
                }}
              >
                {money(currentPrice)}
              </div>
            </div>

            <div
              style={{
                background: "#334155",
                color: signalTone,
                borderRadius: 9,
                padding: "9px 13px",
                fontWeight: 800,
                fontSize: 19,
              }}
            >
              {data ? signal : "—"}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: colors.muted,
            }}
          >
            {loading ? "Refreshing analysis..." : "Analysis ready"}
          </div>
        </section>

        {error && (
          <section
            role="alert"
            style={{
              ...cardStyle,
              borderColor: colors.red,
              color: "#fda4af",
              overflowWrap: "anywhere",
            }}
          >
            <strong>API Error</strong>
            <div style={{ marginTop: 8 }}>{error}</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Check the Next.js API route, Delta connection,
              and NEXT_PUBLIC_API_BASE_URL.
            </div>
          </section>
        )}

        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 19 }}>
              Candlestick Chart
            </h2>
            <span style={{ color: colors.muted, fontSize: 12 }}>
              Completed candles only
            </span>
          </div>

          <CandleChart
            candles={candles}
            support={support}
            resistance={resistance}
          />
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Metric
            title="Support"
            value={money(support)}
            color={colors.green}
          />
          <Metric
            title="Resistance"
            value={money(resistance)}
            color="#fda4af"
          />
        </div>

        <section style={cardStyle}>
          <h2 style={{ fontSize: 19, marginTop: 0 }}>
            Technical Indicators
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 12,
            }}
          >
            <Metric title="RSI (14)" value={number(data?.rsi)} />
            <Metric title="MACD" value={number(macdLine, 4)} />
            <Metric
              title="MACD Signal"
              value={number(macdSignal, 4)}
            />
            <Metric title="EMA 20" value={money(data?.ema20)} />
            <Metric title="EMA 50" value={money(data?.ema50)} />
            <Metric title="EMA 200" value={money(data?.ema200)} />
          </div>
        </section>

        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 19 }}>
              Multi-Timeframe Confirmation
            </h2>
            <strong style={{ color: colors.yellow }}>
              {confirmation}
            </strong>
          </div>

          {frames.map((frame) => (
            <div
              key={frame.timeframe}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "14px 0",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span>{frame.timeframe}</span>
              <span
                style={{
                  color: frame.exists
                    ? signalColor(frame.signal)
                    : colors.muted,
                  fontWeight: 700,
                }}
              >
                {frame.exists ? frame.signal : "Unavailable"}
                {" · RSI "}
                {number(frame.rsi)}
              </span>
            </div>
          ))}

          {!data?.timeframes && (
            <p style={{ color: colors.muted, fontSize: 12 }}>
              Multi-timeframe details require the backend to
              return the timeframes object.
            </p>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 19 }}>
            Trade Decision
          </h2>

          <div
            style={{
              color: signalTone,
              fontSize: 27,
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            {data ? signal : "WAITING"}
          </div>

          <p style={{ color: colors.muted, lineHeight: 1.6 }}>
            {signal === "LONG"
              ? "Bullish conditions detected by the analysis rules."
              : signal === "SHORT"
              ? "Bearish conditions detected by the analysis rules."
              : "No confirmed directional trade signal. Wait for stronger confirmation."}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
            }}
          >
            <Metric
              title="Entry"
              value={money(data?.plan?.entry)}
            />
            <Metric
              title="Stop Loss"
              value={money(data?.plan?.stop_loss)}
            />
            <Metric
              title="Target"
              value={money(data?.plan?.target)}
            />
          </div>

          <p style={{ fontSize: 12, color: colors.muted }}>
            Trade levels are displayed only when provided by
            the backend. No automatic orders are placed.
          </p>
        </section>

        <section style={cardStyle}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 17,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) =>
                setAutoRefresh(e.target.checked)
              }
              style={{ width: 19, height: 19 }}
            />
            Auto Refresh (30 seconds)
          </label>

          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              ...buttonStyle(true),
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Refreshing..." : "Refresh Analysis"}
          </button>
        </section>

        <footer
          style={{
            textAlign: "center",
            color: colors.muted,
            fontSize: 12,
            lineHeight: 1.7,
            marginTop: 25,
          }}
        >
          Crypto Signal Pro · Delta Exchange India
          <div>
            Educational technical analysis only.
            Signals are not guaranteed.
            Not financial advice.
          </div>
        </footer>
      </div>
    </main>
  );
}
