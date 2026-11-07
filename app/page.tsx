
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

type MACD = {
  line?: number;
  signal?: number;
  histogram?: number;
};

type Analysis = {
  coin?: string;
  symbol?: string;
  timeframe?: string;
  price?: number;
  signal?: Signal;
  support?: number;
  resistance?: number;
  rsi?: number;
  macd?: MACD;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  candleCount?: number;
  candles?: Candle[];
  updatedAt?: string;
  lastCandleTime?: string;
  status?: string;
  error?: string;
};

const API_PATH = "/api/analysis";
const REFRESH_MS = 30000;

const COLORS = {
  background: "#081120",
  card: "#142238",
  border: "#2c405d",
  text: "#e8eef9",
  muted: "#9aacc6",
  green: "#25d889",
  red: "#ff6575",
  yellow: "#ffd33d",
  blue: "#2876ed",
  grid: "#2b3c55",
};

function money(value?: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }

  return "$" + value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function number(value?: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

function timeText(value?: string) {
  if (!value) return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function signalColor(signal?: string) {
  if (signal === "LONG") return COLORS.green;
  if (signal === "SHORT") return COLORS.red;
  return COLORS.yellow;
}

function normalizeCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];

  const candles: Candle[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const c = item as Record<string, unknown>;

    const candle: Candle = {
      time: Number(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    };

    if (
      Object.values(candle).every(Number.isFinite) &&
      candle.open > 0 &&
      candle.high > 0 &&
      candle.low > 0 &&
      candle.close > 0 &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close)
    ) {
      candles.push(candle);
    }
  }

  return candles
    .sort((a, b) => a.time - b.time)
    .filter(
      (c, i, arr) =>
        i === 0 || c.time !== arr[i - 1].time
    )
    .slice(-120);
}

function CandlestickChart({
  candles,
  support,
  resistance,
  price,
}: {
  candles: Candle[];
  support?: number;
  resistance?: number;
  price?: number;
}) {
  const width = 900;
  const height = 430;

  const left = 12;
  const right = 105;
  const top = 25;
  const bottom = 48;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const chart = useMemo(() => {
    if (!candles.length) return null;

    const visible = candles.slice(-100);

    const lows = visible.map((c) => c.low);
    const highs = visible.map((c) => c.high);

    const levels = [
      ...lows,
      ...highs,
      ...(Number.isFinite(support) ? [support!] : []),
      ...(Number.isFinite(resistance)
        ? [resistance!]
        : []),
      ...(Number.isFinite(price) ? [price!] : []),
    ];

    const minimum = Math.min(...levels);
    const maximum = Math.max(...levels);

    const padding = Math.max(
      (maximum - minimum) * 0.08,
      maximum * 0.0005
    );

    const min = minimum - padding;
    const max = maximum + padding;
    const range = max - min;

    const y = (value: number) =>
      top + ((max - value) / range) * plotHeight;

    const step = plotWidth / visible.length;
    const candleWidth = Math.max(
      2,
      Math.min(10, step * 0.65)
    );

    return {
      visible,
      min,
      max,
      y,
      step,
      candleWidth,
    };
  }, [candles, support, resistance, price]);

  if (!chart) {
    return (
      <div className="empty">
        Waiting for completed candlestick data...
      </div>
    );
  }

  const {
    visible,
    min,
    max,
    y,
    step,
    candleWidth,
  } = chart;

  const x = (index: number) =>
    left + index * step + step / 2;

  const horizontalLevels = Array.from(
    { length: 6 },
    (_, i) => max - ((max - min) * i) / 5
  );

  const labels = [
    0,
    Math.floor((visible.length - 1) / 3),
    Math.floor(((visible.length - 1) * 2) / 3),
    visible.length - 1,
  ];

  const levelLine = (
    value: number | undefined,
    color: string,
    label: string,
    dash: string
  ) => {
    if (
      value == null ||
      !Number.isFinite(value)
    ) {
      return null;
    }

    const position = y(value);

    return (
      <g>
        <line
          x1={left}
          x2={left + plotWidth}
          y1={position}
          y2={position}
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dash}
        />
        <rect
          x={left + plotWidth + 3}
          y={position - 13}
          width="99"
          height="26"
          rx="4"
          fill={color}
        />
        <text
          x={left + plotWidth + 8}
          y={position + 5}
          fill="#ffffff"
          fontSize="12"
          fontWeight="bold"
        >
          {label} {number(value, value >= 10000 ? 0 : 1)}
        </text>
      </g>
    );
  };

  return (
    <div className="chartScroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart"
        role="img"
        aria-label="Candlestick chart with support and resistance levels"
      >
        <rect
          width={width}
          height={height}
          fill={COLORS.card}
        />

        {horizontalLevels.map((level, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={left}
              x2={left + plotWidth}
              y1={y(level)}
              y2={y(level)}
              stroke={COLORS.grid}
              strokeWidth="1"
            />
            <text
              x={left + plotWidth + 10}
              y={y(level) + 4}
              fill={COLORS.muted}
              fontSize="13"
            >
              {number(level, level >= 10000 ? 0 : 2)}
            </text>
          </g>
        ))}

        {visible.map((c, i) => {
          const rising = c.close >= c.open;
          const color = rising
            ? COLORS.green
            : COLORS.red;

          const center = x(i);

          const bodyTop = y(
            Math.max(c.open, c.close)
          );

          const bodyBottom = y(
            Math.min(c.open, c.close)
          );

          const bodyHeight = Math.max(
            1.5,
            bodyBottom - bodyTop
          );

          return (
            <g key={c.time}>
              <line
                x1={center}
                x2={center}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1.3"
              />
              <rect
                x={center - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })}

        {levelLine(
          support,
          COLORS.green,
          "S",
          "7 4"
        )}

        {levelLine(
          resistance,
          COLORS.red,
          "R",
          "7 4"
        )}

        {levelLine(
          price,
          COLORS.blue,
          "P",
          "3 5"
        )}

        {labels.map((index, i) => {
          const candle = visible[index];

          if (!candle) return null;

          const label = new Date(
            candle.time * 1000
          ).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <text
              key={`time-${i}`}
              x={x(index)}
              y={height - 13}
              fill={COLORS.muted}
              fontSize="13"
              textAnchor={
                i === 0
                  ? "start"
                  : i === labels.length - 1
                  ? "end"
                  : "middle"
              }
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

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
    <div className="metric">
      <div className="metricTitle">{title}</div>
      <div
        className="metricValue"
        style={{ color: color || COLORS.text }}
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

  const [data, setData] =
    useState<Analysis | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] =
    useState(true);

  const requestId = useRef(0);

  const loadAnalysis = useCallback(
    async (initial = false) => {
      const currentRequest = ++requestId.current;

      if (initial) {
        setLoading(true);
        setData(null);
      } else {
        setRefreshing(true);
      }

      setError("");

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        20000
      );

      try {
        const params = new URLSearchParams({
          coin,
          timeframe,
        });

        const response = await fetch(
          `${API_PATH}?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          }
        );

        const contentType =
          response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          throw new Error(
            `API returned non-JSON response (HTTP ${response.status}). Check API route.`
          );
        }

        const result = (await response.json()) as Analysis;

        if (!response.ok) {
          throw new Error(
            result.error ||
              `API error HTTP ${response.status}`
          );
        }

        if (
          result.status === "disconnected" ||
          !Number.isFinite(result.price) ||
          !Array.isArray(result.candles)
        ) {
          throw new Error(
            result.error ||
              "Incomplete market analysis received."
          );
        }

        if (currentRequest !== requestId.current) {
          return;
        }

        setData({
          ...result,
          candles: normalizeCandles(result.candles),
        });
      } catch (err) {
        if (currentRequest !== requestId.current) {
          return;
        }

        setError(
          err instanceof Error
            ? err.name === "AbortError"
              ? "Request timed out. Please refresh."
              : err.message
            : "Unable to fetch analysis."
        );
      } finally {
        clearTimeout(timeout);

        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [coin, timeframe]
  );

  useEffect(() => {
    loadAnalysis(true);

    return () => {
      requestId.current++;
    };
  }, [loadAnalysis]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAnalysis(false);
      }
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [autoRefresh, loadAnalysis]);

  const candles = data?.candles || [];
  const signal = data?.signal || "HOLD";

  const support = data?.support;
  const resistance = data?.resistance;
  const price = data?.price;

  const distanceSupport =
    price != null &&
    support != null &&
    Number.isFinite(price) &&
    Number.isFinite(support) &&
    price > 0
      ? ((price - support) / price) * 100
      : null;

  const distanceResistance =
    price != null &&
    resistance != null &&
    Number.isFinite(price) &&
    Number.isFinite(resistance) &&
    price > 0
      ? ((resistance - price) / price) * 100
      : null;

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <h1>₿ Crypto Signal Pro</h1>
          <p>
            Delta Exchange India · Technical Analysis
          </p>
          <p className="small">
            Analysis updated:{" "}
            {timeText(data?.updatedAt)}
          </p>
        </header>

        <section className="card">
          <div className="controlRow">
            <div className="coinButtons">
              {(["BTC", "ETH"] as Coin[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    className={
                      coin === item
                        ? "activeButton"
                        : "normalButton"
                    }
                    onClick={() => setCoin(item)}
                  >
                    {item}
                  </button>
                )
              )}
            </div>

            <div className="timeframeControl">
              <label htmlFor="timeframe">
                Timeframe
              </label>
              <select
                id="timeframe"
                value={timeframe}
                onChange={(e) =>
                  setTimeframe(
                    e.target.value as Timeframe
                  )
                }
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
              </select>
            </div>
          </div>

          <div className="priceRow">
            <div>
              <div className="muted">
                {coin}USD · Completed candle price
              </div>
              <div className="bigPrice">
                {money(price)}
              </div>
              <div className="small">
                Last candle:{" "}
                {timeText(data?.lastCandleTime)}
              </div>
            </div>

            <div
              className="signalBadge"
              style={{
                color: signalColor(signal),
              }}
            >
              {loading ? "..." : signal}
            </div>
          </div>

          <div className="refreshRow">
            <label className="checkLabel">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) =>
                  setAutoRefresh(e.target.checked)
                }
              />
              Auto Refresh (30 sec)
            </label>

            <button
              type="button"
              className="refreshButton"
              disabled={loading || refreshing}
              onClick={() => loadAnalysis(false)}
            >
              {loading || refreshing
                ? "Refreshing..."
                : "Refresh Analysis"}
            </button>
          </div>
        </section>

        {error && (
          <div className="errorBox">
            <strong>API Error</strong>
            <div>{error}</div>
            <div className="small">
              Last successful data may still be
              displayed. Do not treat stale signals
              as current.
            </div>
          </div>
        )}

        <section className="card">
          <div className="sectionHeader">
            <h2>Candlestick Chart</h2>
            <span className="small">
              Completed candles only
            </span>
          </div>

          {loading ? (
            <div className="empty">
              Loading BTC/ETH market data...
            </div>
          ) : (
            <CandlestickChart
              candles={candles}
              support={support}
              resistance={resistance}
              price={price}
            />
          )}

          <div className="legend">
            <span>
              <i
                style={{
                  background: COLORS.green,
                }}
              />
              Support
            </span>

            <span>
              <i
                style={{
                  background: COLORS.red,
                }}
              />
              Resistance
            </span>

            <span>
              <i
                style={{
                  background: COLORS.blue,
                }}
              />
              Candle Close
            </span>
          </div>
        </section>

        <div className="metricGrid">
          <Metric
            title="Support"
            value={money(support)}
            color={COLORS.green}
          />
          <Metric
            title="Resistance"
            value={money(resistance)}
            color={COLORS.red}
          />
          <Metric
            title="RSI (14)"
            value={number(data?.rsi)}
          />
          <Metric
            title="EMA 20"
            value={money(data?.ema20)}
          />
          <Metric
            title="EMA 50"
            value={money(data?.ema50)}
          />
          <Metric
            title="EMA 200"
            value={money(data?.ema200)}
          />
        </div>

        <section className="card">
          <h2>MACD Indicator</h2>

          <div className="metricGrid innerGrid">
            <Metric
              title="MACD Line"
              value={number(data?.macd?.line, 4)}
            />
            <Metric
              title="Signal Line"
              value={number(data?.macd?.signal, 4)}
            />
            <Metric
              title="Histogram"
              value={number(
                data?.macd?.histogram,
                4
              )}
              color={
                (data?.macd?.histogram || 0) >= 0
                  ? COLORS.green
                  : COLORS.red
              }
            />
          </div>
        </section>

        <section className="card">
          <h2>Support & Resistance Analysis</h2>

          <div className="analysisRow">
            <span>Support Level</span>
            <strong style={{ color: COLORS.green }}>
              {money(support)}
            </strong>
          </div>

          <div className="analysisRow">
            <span>Resistance Level</span>
            <strong style={{ color: COLORS.red }}>
              {money(resistance)}
            </strong>
          </div>

          <div className="analysisRow">
            <span>Distance from Support</span>
            <strong>
              {distanceSupport == null
                ? "--"
                : `${number(distanceSupport)}%`}
            </strong>
          </div>

          <div className="analysisRow">
            <span>Distance to Resistance</span>
            <strong>
              {distanceResistance == null
                ? "--"
                : `${number(distanceResistance)}%`}
            </strong>
          </div>
        </section>

        <section className="card">
          <h2>Technical Signal</h2>

          <div
            className="signalLarge"
            style={{
              color: signalColor(signal),
            }}
          >
            {signal}
          </div>

          <p className="muted">
            {signal === "LONG"
              ? "Bullish technical conditions detected."
              : signal === "SHORT"
              ? "Bearish technical conditions detected."
              : "No confirmed directional signal."}
          </p>

          <div className="analysisRow">
            <span>Selected Market</span>
            <strong>{coin}USD</strong>
          </div>

          <div className="analysisRow">
            <span>Timeframe</span>
            <strong>{timeframe}</strong>
          </div>

          <div className="analysisRow">
            <span>Completed Candles</span>
            <strong>
              {data?.candleCount ??
                candles.length}
            </strong>
          </div>

          <div className="analysisRow">
            <span>API Connection</span>
            <strong
              style={{
                color: error
                  ? COLORS.red
                  : data
                  ? COLORS.green
                  : COLORS.yellow,
              }}
            >
              {error
                ? "ERROR"
                : data
                ? "CONNECTED"
                : "CONNECTING"}
            </strong>
          </div>
        </section>

        <footer>
          <p>
            Educational technical analysis only.
            Not financial advice.
          </p>
          <p>
            Signals are rule-based and not
            guaranteed. No automatic trade
            execution.
          </p>
          <p>
            Delta Exchange India public market
            data · Crypto Signal Pro
          </p>
        </footer>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background: ${COLORS.background};
          color: ${COLORS.text};
          padding: 18px 12px 40px;
          font-family: Arial, Helvetica, sans-serif;
        }

        .container {
          max-width: 1100px;
          margin: 0 auto;
        }

        .header {
          margin-bottom: 22px;
        }

        h1 {
          font-size: clamp(25px, 5vw, 34px);
          margin: 0 0 14px;
        }

        h2 {
          font-size: 20px;
          margin: 0 0 18px;
        }

        p {
          line-height: 1.6;
        }

        .header p {
          color: ${COLORS.muted};
          margin: 6px 0;
        }

        .small {
          color: ${COLORS.muted};
          font-size: 13px;
        }

        .muted {
          color: ${COLORS.muted};
        }

        .card {
          background: ${COLORS.card};
          border: 1px solid ${COLORS.border};
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 18px;
          overflow: hidden;
        }

        .controlRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 15px;
        }

        .coinButtons {
          display: flex;
          gap: 8px;
        }

        button,
        select {
          font: inherit;
        }

        .normalButton,
        .activeButton {
          border-radius: 11px;
          border: 1px solid #415977;
          padding: 12px 17px;
          color: white;
          cursor: pointer;
        }

        .normalButton {
          background: #20334e;
        }

        .activeButton {
          background: ${COLORS.blue};
          border-color: #65b5ff;
        }

        .timeframeControl {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .timeframeControl label {
          color: ${COLORS.text};
        }

        select {
          background: #20334e;
          color: white;
          border: 1px solid #415977;
          border-radius: 10px;
          padding: 12px;
        }

        .priceRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 30px;
        }

        .bigPrice {
          font-size: clamp(29px, 7vw, 46px);
          font-weight: 800;
          margin: 6px 0;
          overflow-wrap: anywhere;
        }

        .signalBadge {
          background: #34445e;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 19px;
          font-weight: bold;
        }

        .refreshRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 15px;
          margin-top: 25px;
        }

        .checkLabel {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: ${COLORS.blue};
        }

        .refreshButton {
          background: ${COLORS.blue};
          color: white;
          border: none;
          border-radius: 10px;
          padding: 12px 16px;
          cursor: pointer;
          font-weight: bold;
        }

        .refreshButton:disabled {
          opacity: 0.65;
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chartScroll {
          width: 100%;
          overflow-x: auto;
        }

        .chart {
          display: block;
          width: 100%;
          min-width: 580px;
          height: auto;
        }

        .empty {
          padding: 60px 10px;
          text-align: center;
          color: ${COLORS.muted};
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 15px;
          font-size: 13px;
          color: ${COLORS.muted};
        }

        .legend span {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .legend i {
          display: inline-block;
          width: 18px;
          height: 3px;
        }

        .metricGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .metric {
          background: ${COLORS.card};
          border: 1px solid ${COLORS.border};
          border-radius: 16px;
          padding: 18px;
          min-width: 0;
        }

        .metricTitle {
          color: ${COLORS.muted};
          font-size: 14px;
          margin-bottom: 12px;
        }

        .metricValue {
          font-size: clamp(17px, 4.3vw, 27px);
          font-weight: bold;
          overflow-wrap: anywhere;
        }

        .innerGrid {
          margin-bottom: 0;
        }

        .analysisRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid ${COLORS.border};
          font-size: 14px;
        }

        .analysisRow:last-child {
          border-bottom: none;
        }

        .analysisRow strong {
          text-align: right;
          overflow-wrap: anywhere;
        }

        .signalLarge {
          font-size: 34px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .errorBox {
          background: #351d2a;
          color: #ffb3bb;
          border: 1px solid ${COLORS.red};
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 18px;
          overflow-wrap: anywhere;
        }

        .errorBox strong {
          display: block;
          margin-bottom: 8px;
        }

        footer {
          text-align: center;
          color: ${COLORS.muted};
          font-size: 12px;
          margin-top: 28px;
        }

        @media (max-width: 500px) {
          .page {
            padding: 14px 10px 35px;
          }

          .card {
            padding: 15px;
          }

          .metric {
            padding: 14px;
          }

          .priceRow {
            align-items: center;
          }

          .signalBadge {
            font-size: 16px;
          }

          .timeframeControl {
            font-size: 14px;
          }

          .chart {
            min-width: 580px;
          }
        }

        @media (min-width: 800px) {
          .metricGrid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
