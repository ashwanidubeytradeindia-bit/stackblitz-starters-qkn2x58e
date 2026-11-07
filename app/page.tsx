
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* =========================================
   CRYPTO SIGNAL PRO — MILESTONE 9.4
   COMPLETE INTEGRATED app/page.tsx
========================================= */

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
  receivedAt: number;
  sourceTimestamp: number | null;
};

type TradePlan = {
  direction: Signal;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  risk: number;
};

type PriceEvent = {
  price: number;
  time: number;
};

type ApiHealth = {
  success: number;
  failed: number;
  lastLatency: number | null;
  lastSuccess: number | null;
  lastError: string;
};

type SignalHistoryEvent = {
  id: number;
  coin: Coin;
  timeframe: TF;
  previous: Signal;
  current: Signal;
  time: number;
  test: boolean;
};

type AlertInfo = SignalHistoryEvent;

const TFS: TF[] = ["5m", "15m", "1h", "4h"];

const POLL_MS = 1000;
const MULTI_MS = 60000;
const MAX_RETRY_MS = 30000;
const SNAPSHOT_MAX_AGE_MS = 120000;

const TF_SECONDS: Record<TF, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
};

const COLORS = {
  bg: "#07111f",
  panel: "#0d1a2b",
  card: "#101b2d",
  border: "#304560",
  text: "#e2e8f0",
  muted: "#94a3b8",
  blue: "#60a5fa",
  green: "#22c55e",
  red: "#fb7185",
  yellow: "#facc15",
  purple: "#a78bfa",
};

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }

  const result = Number(value);
  return Number.isFinite(result) ? result : NaN;
}

function fmt(value: unknown, digits = 2): string {
  const valueNumber = num(value);

  return Number.isFinite(valueNumber)
    ? valueNumber.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
}

function signalColor(signal: Signal): string {
  if (signal === "LONG") return COLORS.green;
  if (signal === "SHORT") return COLORS.red;
  return COLORS.yellow;
}

function toMilliseconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const n = num(value);

  if (!Number.isFinite(n) || n <= 0) return null;

  return n < 1e12 ? n * 1000 : n;
}

function formatTime(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return "—";
  }

  return new Date(timestamp).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function formatAge(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "—";

  if (milliseconds < 0) {
    return `Clock difference ${Math.ceil(
      Math.abs(milliseconds) / 1000
    )}s`;
  }

  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  return `${hours}h ${minutes % 60}m ago`;
}

function normalize(
  raw: any,
  coin: Coin,
  timeframe: TF,
  receivedAt: number
): Analysis {
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

  if (
    ![price, support, resistance].every(Number.isFinite) ||
    price <= 0
  ) {
    throw new Error("Price/support/resistance missing");
  }

  const signal: Signal =
    raw.signal === "LONG" || raw.signal === "SHORT"
      ? raw.signal
      : "HOLD";

  // Only explicit source timestamps are accepted.
  // Browser response time is tracked separately.
  const sourceTimestamp = toMilliseconds(
    raw.sourceTimestamp ??
      raw.source_timestamp ??
      raw.exchangeTimestamp ??
      raw.exchange_timestamp ??
      raw.updatedAt ??
      null
  );

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
    receivedAt,
    sourceTimestamp,
  };
}

function calculateEMA(
  candles: Candle[],
  period: number
): (number | null)[] {
  const output: (number | null)[] = candles.map(() => null);

  if (candles.length < period) return output;

  let total = 0;

  for (let i = 0; i < period; i++) {
    total += candles[i].close;
  }

  let previous = total / period;
  output[period - 1] = previous;

  const k = 2 / (period + 1);

  for (let i = period; i < candles.length; i++) {
    previous = candles[i].close * k + previous * (1 - k);
    output[i] = previous;
  }

  return output;
}

function calculateTradePlan(
  data: Analysis
): TradePlan | null {
  if (data.signal === "HOLD") return null;

  const entry = data.price;
  const candles = data.candles.slice(-14);

  if (!Number.isFinite(entry) || entry <= 0) {
    return null;
  }

  const averageRange =
    candles.length > 0
      ? candles.reduce(
          (sum, c) => sum + (c.high - c.low),
          0
        ) / candles.length
      : 0;

  const minimumRisk = Math.max(
    averageRange * 1.5,
    entry * 0.002
  );

  let stopLoss: number;

  if (data.signal === "LONG") {
    stopLoss =
      data.support < entry
        ? Math.min(
            data.support - averageRange * 0.2,
            entry - minimumRisk
          )
        : entry - minimumRisk;
  } else {
    stopLoss =
      data.resistance > entry
        ? Math.max(
            data.resistance + averageRange * 0.2,
            entry + minimumRisk
          )
        : entry + minimumRisk;
  }

  const risk = Math.abs(entry - stopLoss);

  if (
    !Number.isFinite(risk) ||
    risk <= 0 ||
    stopLoss <= 0
  ) {
    return null;
  }

  const multiplier = data.signal === "LONG" ? 1 : -1;

  const target1 = entry + multiplier * risk;
  const target2 = entry + multiplier * risk * 2;
  const target3 = entry + multiplier * risk * 3;

  if (
    [target1, target2, target3].some(
      (value) => !Number.isFinite(value) || value <= 0
    )
  ) {
    return null;
  }

  return {
    direction: data.signal,
    entry,
    stopLoss,
    target1,
    target2,
    target3,
    risk,
  };
}

/* =========================================
   REUSABLE COMPONENTS
========================================= */

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

      <strong
        className="metricValue"
        style={{ color: color || COLORS.text }}
      >
        {value}
      </strong>
    </div>
  );
}

function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span
      className="signalBadge"
      style={{
        color: signalColor(signal),
        borderColor: signalColor(signal),
      }}
    >
      {signal}
    </span>
  );
}

/* =========================================
   CANDLESTICK CHART
========================================= */

function Chart({
  data,
  count,
  plan,
}: {
  data: Analysis;
  count: number;
  plan: TradePlan | null;
}) {
  const candles = useMemo(
    () => data.candles.slice(-count),
    [data.candles, count]
  );

  const ema20 = useMemo(
    () => calculateEMA(data.candles, 20).slice(-count),
    [data.candles, count]
  );

  const ema50 = useMemo(
    () => calculateEMA(data.candles, 50).slice(-count),
    [data.candles, count]
  );

  const width = 900;
  const height = 420;

  const left = 16;
  const right = 140;
  const top = 25;
  const bottom = 45;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const values = [
    ...candles.flatMap((c) => [c.low, c.high]),
    ...ema20.filter((v): v is number => v !== null),
    ...ema50.filter((v): v is number => v !== null),
    data.price,
    data.support,
    data.resistance,
  ];

  if (plan) {
    values.push(
      plan.entry,
      plan.stopLoss,
      plan.target1,
      plan.target2,
      plan.target3
    );
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const padding = Math.max(
    (maxValue - minValue) * 0.08,
    maxValue * 0.0001
  );

  const minPrice = minValue - padding;
  const maxPrice = maxValue + padding;

  const y = (price: number) =>
    top +
    ((maxPrice - price) / (maxPrice - minPrice)) *
      plotHeight;

  const slot = plotWidth / Math.max(candles.length, 1);

  const x = (index: number) =>
    left + slot * (index + 0.5);

  const bodyWidth = Math.max(2, slot * 0.6);

  function makePath(series: (number | null)[]): string {
    let path = "";
    let started = false;

    series.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        started = false;
        return;
      }

      path += `${started ? "L" : "M"}${x(index)},${y(
        value
      )} `;

      started = true;
    });

    return path;
  }

  type Level = {
    label: string;
    price: number;
    color: string;
    dash: string;
  };

  const levels: Level[] = [
    {
      label: "PRICE",
      price: data.price,
      color: COLORS.blue,
      dash: "4 4",
    },
    {
      label: "SUP",
      price: data.support,
      color: COLORS.green,
      dash: "7 5",
    },
    {
      label: "RES",
      price: data.resistance,
      color: COLORS.red,
      dash: "7 5",
    },
  ];

  if (plan) {
    levels.push(
      {
        label: "ENTRY",
        price: plan.entry,
        color: "#38bdf8",
        dash: "5 4",
      },
      {
        label: "SL",
        price: plan.stopLoss,
        color: "#ef4444",
        dash: "6 4",
      },
      {
        label: "T1",
        price: plan.target1,
        color: "#4ade80",
        dash: "3 5",
      },
      {
        label: "T2",
        price: plan.target2,
        color: "#16a34a",
        dash: "3 5",
      },
      {
        label: "T3",
        price: plan.target3,
        color: "#10b981",
        dash: "3 5",
      }
    );
  }

  // Combine identical or near-identical levels
  // to avoid duplicate labels.
  const uniqueLevels: Level[] = [];

  for (const level of levels) {
    const existing = uniqueLevels.find(
      (item) =>
        Math.abs(item.price - level.price) <
        Math.max(data.price * 0.00001, 0.01)
    );

    if (existing) {
      existing.label += ` / ${level.label}`;
    } else {
      uniqueLevels.push({ ...level });
    }
  }

  const sortedLevels = uniqueLevels
    .map((level) => ({
      ...level,
      actualY: y(level.price),
    }))
    .sort((a, b) => a.actualY - b.actualY);

  const labelPositions: number[] = [];
  const labelGap = 19;
  const labelTop = top + 10;
  const labelBottom = height - bottom - 10;

  sortedLevels.forEach((level, index) => {
    const previous =
      index > 0
        ? labelPositions[index - 1]
        : labelTop - labelGap;

    labelPositions[index] = Math.max(
      level.actualY,
      previous + labelGap,
      labelTop
    );
  });

  if (labelPositions.length > 0) {
    const overflow =
      labelPositions[labelPositions.length - 1] -
      labelBottom;

    if (overflow > 0) {
      for (let i = 0; i < labelPositions.length; i++) {
        labelPositions[i] -= overflow;
      }
    }
  }

  return (
    <div className="chartInner">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chartSvg"
        role="img"
        aria-label="Candlestick chart with EMA, support, resistance and hypothetical trade levels"
      >
        <rect width={width} height={height} fill="#101b2d" />

        {Array.from({ length: 5 }, (_, i) => {
          const price =
            minPrice + ((maxPrice - minPrice) * i) / 4;

          return (
            <g key={`grid-${i}`}>
              <line
                x1={left}
                x2={width - right}
                y1={y(price)}
                y2={y(price)}
                stroke="#29384e"
                strokeDasharray="4 5"
              />

              <text
                x={width - right + 7}
                y={y(price) + 4}
                fill="#94a3b8"
                fontSize="12"
              >
                {fmt(price)}
              </text>
            </g>
          );
        })}

        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const color = up ? "#22c55e" : "#ef4444";

          const bodyTop = Math.min(y(c.open), y(c.close));

          const bodyHeight = Math.max(
            1.5,
            Math.abs(y(c.open) - y(c.close))
          );

          return (
            <g key={`${c.time}-${i}`}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1.4"
              />

              <rect
                x={x(i) - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })}

        <path
          d={makePath(ema20)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.3"
        />

        <path
          d={makePath(ema50)}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2.3"
        />

        {sortedLevels.map((level, index) => (
          <g key={`${level.label}-${index}`}>
            <line
              x1={left}
              x2={width - right}
              y1={y(level.price)}
              y2={y(level.price)}
              stroke={level.color}
              strokeDasharray={level.dash}
              strokeWidth="1.8"
            />

            <rect
              x={width - right}
              y={labelPositions[index] - 9}
              width={right - 3}
              height={18}
              rx="3"
              fill="#24364f"
            />

            <text
              x={width - right + 5}
              y={labelPositions[index] + 4}
              fill={level.color}
              fontSize="10.5"
              fontWeight="bold"
            >
              {level.label} {fmt(level.price, 1)}
            </text>
          </g>
        ))}

        {candles.map((c, i) => {
          const step = Math.max(
            1,
            Math.ceil(candles.length / 6)
          );

          if (i % step !== 0) return null;

          const ms = toMilliseconds(c.time);

          return (
            <text
              key={`time-${c.time}-${i}`}
              x={x(i)}
              y={height - 13}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {ms
                ? new Date(ms).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })
                : ""}
            </text>
          );
        })}
      </svg>

      <div className="chartLegend">
        <span style={{ color: "#fbbf24" }}>━ EMA 20</span>
        <span style={{ color: "#a78bfa" }}>━ EMA 50</span>
        <span style={{ color: "#22c55e" }}>━ Support</span>
        <span style={{ color: "#fb7185" }}>
          ━ Resistance
        </span>
        <span style={{ color: "#60a5fa" }}>━ API Price</span>

        {plan && (
          <>
            <span style={{ color: "#ef4444" }}>
              ━ Stop Loss
            </span>
            <span style={{ color: "#4ade80" }}>━ Targets</span>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================
   TRADING LEVELS + CONFIRMATION GATE
========================================= */

function TradingLevels({
  data,
  plan,
  confirmed,
  consensus,
  sourceFresh,
}: {
  data: Analysis;
  plan: TradePlan | null;
  confirmed: boolean;
  consensus: Signal;
  sourceFresh: boolean;
}) {
  const gateOpen = confirmed && sourceFresh;

  const items = plan
    ? [
        {
          label: "Entry Point",
          value: plan.entry,
          color: COLORS.blue,
        },
        {
          label: "Stop Loss",
          value: plan.stopLoss,
          color: COLORS.red,
        },
        {
          label: "Target 1 · 1:1",
          value: plan.target1,
          color: "#4ade80",
        },
        {
          label: "Target 2 · 1:2",
          value: plan.target2,
          color: COLORS.green,
        },
        {
          label: "Target 3 · 1:3",
          value: plan.target3,
          color: "#10b981",
        },
      ]
    : [];

  return (
    <section className="panel">
      <h2>Trade Confirmation Gate</h2>

      <div className="gateRow">
        <span
          className="signalBadge"
          style={{
            color: gateOpen ? COLORS.green : COLORS.yellow,
            borderColor: gateOpen
              ? COLORS.green
              : COLORS.yellow,
          }}
        >
          {gateOpen ? "RULES CONFIRMED" : "NOT CONFIRMED"}
        </span>

        <span className="muted">
          Consensus: {consensus}
        </span>
      </div>

      {!gateOpen && (
        <div className="warningBox">
          <strong>⚠ UNCONFIRMED SETUP</strong>

          <p>
            Do not treat calculated levels as a confirmed
            trade entry. Wait for multi-timeframe agreement
            and acceptable data freshness.
          </p>
        </div>
      )}

      {gateOpen && (
        <div className="successBox">
          <strong>Rule-based confirmation passed</strong>

          <p>
            Selected signal matches the multi-timeframe
            consensus. This does not guarantee a profitable
            trade or execution price.
          </p>
        </div>
      )}

      {!plan ? (
        <p className="muted">
          Current selected signal is HOLD. No hypothetical
          entry, stop loss or targets are shown.
        </p>
      ) : (
        <>
          <p
            style={{
              color: signalColor(data.signal),
              fontWeight: 700,
              marginTop: 20,
            }}
          >
            {data.signal} —{" "}
            {gateOpen
              ? "Rule-confirmed illustrative levels"
              : "Illustrative levels only"}
          </p>

          <div className="metricsGrid">
            {items.map((item) => (
              <Metric
                key={item.label}
                label={item.label}
                value={`$${fmt(item.value)}`}
                color={item.color}
              />
            ))}
          </div>

          <p className="muted small">
            Risk per unit: ${fmt(plan.risk)}.
            Targets use hypothetical 1:1, 1:2 and 1:3
            risk-reward ratios. Fees, slippage, funding
            and liquidation risk are excluded.
          </p>
        </>
      )}
    </section>
  );
}

/* =========================================
   LIVE PRICE VERIFICATION
========================================= */

function LivePriceMonitor({
  events,
  unchanged,
  latestPrice,
}: {
  events: PriceEvent[];
  unchanged: number;
  latestPrice: number;
}) {
  const latestChange = events.length >= 2
    ? events[0].price - events[1].price
    : null;

  const latestEvent = events[0];

  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>Live Price Verification</h2>
        <span className="muted small">
          API observations
        </span>
      </div>

      <div className="metricsGrid">
        <Metric
          label="Latest Analysis Price"
          value={`$${fmt(latestPrice)}`}
          color={COLORS.blue}
        />

        <Metric
          label="Last Observed Price Change"
          value={
            latestChange === null
              ? "Waiting"
              : `${latestChange >= 0 ? "+" : ""}$${fmt(
                  latestChange
                )}`
          }
          color={
            latestChange === null
              ? COLORS.muted
              : latestChange > 0
              ? COLORS.green
              : latestChange < 0
              ? COLORS.red
              : COLORS.yellow
          }
        />

        <Metric
          label="Consecutive Unchanged Responses"
          value={String(unchanged)}
        />

        <Metric
          label="Last Observed Price Change"
          value={
            latestEvent
              ? formatTime(latestEvent.time)
              : "Waiting"
          }
        />
      </div>

      <p className="muted small">
        This verifies changes in the existing analysis API
        price, not tick-by-tick exchange trades. Repeated
        successful API responses can contain the same
        market price.
      </p>
    </section>
  );
}

/* =========================================
   API DATA FRESHNESS
========================================= */

function FreshnessPanel({
  data,
  now,
}: {
  data: Analysis;
  now: number;
}) {
  const lastCandle = data.candles[data.candles.length - 1];

  const candleTimestamp = lastCandle
    ? toMilliseconds(lastCandle.time)
    : null;

  const candleAge = candleTimestamp
    ? now - candleTimestamp
    : NaN;

  const candleWindowMs =
    TF_SECONDS[data.timeframe] * 1000;

  // Opening timestamps are expected to be older
  // than the current time within the candle window.
  const candleFresh =
    Number.isFinite(candleAge) &&
    candleAge >= -30000 &&
    candleAge <= candleWindowMs + 120000;

  const sourceAge =
    data.sourceTimestamp !== null
      ? now - data.sourceTimestamp
      : null;

  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>API Data Freshness</h2>

        <span
          className="signalBadge"
          style={{
            color: candleFresh
              ? COLORS.green
              : COLORS.yellow,
            borderColor: candleFresh
              ? COLORS.green
              : COLORS.yellow,
          }}
        >
          {candleFresh
            ? "CANDLE AGE OK"
            : "CHECK CANDLE AGE"}
        </span>
      </div>

      <div className="metricsGrid">
        <Metric
          label="API Response Received"
          value={formatTime(data.receivedAt)}
        />

        <Metric
          label="Latest Candle Timestamp"
          value={formatTime(candleTimestamp)}
        />

        <Metric
          label="Latest Candle Age"
          value={
            candleTimestamp
              ? formatAge(candleAge)
              : "Unknown"
          }
          color={
            candleFresh ? COLORS.green : COLORS.yellow
          }
        />

        <Metric
          label="Source Timestamp"
          value={formatTime(data.sourceTimestamp)}
        />

        <Metric
          label="Source Age"
          value={
            sourceAge === null
              ? "Not provided"
              : formatAge(sourceAge)
          }
        />

        <Metric
          label="Browser Response Age"
          value={formatAge(now - data.receivedAt)}
        />
      </div>

      <p className="muted small">
        API response received time is recorded by the
        browser. The latest candle timestamp may be its
        opening time. Candle age alone does not verify
        a new exchange price. Source timestamp is shown
        only when supplied by the backend.
      </p>
    </section>
  );
}

/* =========================================
   API HEALTH MONITOR
========================================= */

function ApiHealthMonitor({
  health,
}: {
  health: ApiHealth;
}) {
  const total = health.success + health.failed;

  const errorRate =
    total > 0
      ? (health.failed / total) * 100
      : 0;

  return (
    <section className="panel">
      <h2>API Health Monitoring</h2>

      <div className="metricsGrid">
        <Metric
          label="Successful Requests"
          value={String(health.success)}
          color={COLORS.green}
        />

        <Metric
          label="Failed Requests"
          value={String(health.failed)}
          color={COLORS.red}
        />

        <Metric
          label="Error Rate"
          value={`${fmt(errorRate, 1)}%`}
          color={
            errorRate > 10
              ? COLORS.red
              : COLORS.green
          }
        />

        <Metric
          label="Last Response Time"
          value={
            health.lastLatency === null
              ? "—"
              : `${fmt(health.lastLatency, 0)} ms`
          }
        />

        <Metric
          label="Last Successful Response"
          value={formatTime(health.lastSuccess)}
        />

        <Metric
          label="Requests Observed"
          value={String(total)}
        />
      </div>

      {health.lastError && (
        <div className="errorBox">
          <strong>Last API Error</strong>
          <p>{health.lastError}</p>
        </div>
      )}

      <p className="muted small">
        Monitoring covers this browser session only.
        These metrics do not represent exchange uptime
        or server-wide availability.
      </p>
    </section>
  );
}

/* =========================================
   SIGNAL ALERT HISTORY
========================================= */

function SignalHistory({
  history,
  onClear,
}: {
  history: SignalHistoryEvent[];
  onClear: () => void;
}) {
  return (
    <section className="panel">
      <div className="sectionTitle">
        <h2>Signal Alert History</h2>

        <button
          type="button"
          className="smallButton"
          disabled={history.length === 0}
          onClick={onClear}
        >
          Clear History
        </button>
      </div>

      {history.length === 0 ? (
        <p className="muted">
          No signal changes recorded in this session.
          Use Test Alert to verify the notification system.
        </p>
      ) : (
        <div className="historyList">
          {history.map((event) => (
            <div className="historyItem" key={event.id}>
              <div className="historyHeading">
                <strong>
                  {event.test
                    ? "TEST ALERT"
                    : "SIGNAL CHANGE"}
                </strong>

                <span className="muted small">
                  {event.coin} · {event.timeframe}
                </span>
              </div>

              <p>
                {event.previous} →{" "}
                <strong
                  style={{
                    color: signalColor(event.current),
                  }}
                >
                  {event.current}
                </strong>
              </p>

              <small className="muted">
                {formatTime(event.time)}
              </small>
            </div>
          ))}
        </div>
      )}

      <p className="muted small">
        History is kept in memory while this dashboard
        is open. Refreshing or closing the page clears
        it. Test events are clearly marked.
      </p>
    </section>
  );
}

/* =========================================
   MAIN DASHBOARD
========================================= */

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [tf, setTf] = useState<TF>("15m");

  const [data, setData] = useState<Analysis | null>(null);

  const [multi, setMulti] = useState<
    Partial<Record<TF, Analysis>>
  >({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [auto, setAuto] = useState(true);
  const [zoom, setZoom] = useState(60);

  const [error, setError] = useState("");
  const [failures, setFailures] = useState(0);

  const [now, setNow] = useState(0);

  const [alertsEnabled, setAlertsEnabled] =
    useState(true);

  const [alertInfo, setAlertInfo] =
    useState<AlertInfo | null>(null);

  const [signalHistory, setSignalHistory] =
    useState<SignalHistoryEvent[]>([]);

  const [priceEvents, setPriceEvents] =
    useState<PriceEvent[]>([]);

  const [unchanged, setUnchanged] = useState(0);

  const [apiHealth, setApiHealth] = useState<ApiHealth>({
    success: 0,
    failed: 0,
    lastLatency: null,
    lastSuccess: null,
    lastError: "",
  });

  const generationRef = useRef(0);
  const selectedBusyRef = useRef(false);
  const multiBusyRef = useRef(false);

  const selectedRef = useRef({ coin, tf });
  const previousSignalRef = useRef<Signal | null>(null);
  const lastObservedPriceRef = useRef<number | null>(null);
  const unchangedRef = useRef(0);
  const historyIdRef = useRef(0);
  const alertsEnabledRef = useRef(alertsEnabled);

  selectedRef.current = { coin, tf };
  alertsEnabledRef.current = alertsEnabled;

  /* =====================================
     CLIENT CLOCK
  ===================================== */

  useEffect(() => {
    setNow(Date.now());

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  /* =====================================
     ALERT HISTORY
  ===================================== */

  const addAlert = useCallback(
    (
      previous: Signal,
      current: Signal,
      selectedCoin: Coin,
      selectedTf: TF,
      test: boolean
    ) => {
      const event: SignalHistoryEvent = {
        id: ++historyIdRef.current,
        coin: selectedCoin,
        timeframe: selectedTf,
        previous,
        current,
        time: Date.now(),
        test,
      };

      setSignalHistory((old) =>
        [event, ...old].slice(0, 50)
      );

      setAlertInfo(event);
    },
    []
  );

  const testAlert = useCallback(() => {
    const selected = selectedRef.current;

    addAlert(
      "HOLD",
      "SHORT",
      selected.coin,
      selected.tf,
      true
    );
  }, [addAlert]);

  /* =====================================
     PRICE OBSERVATION
  ===================================== */

  const recordPrice = useCallback((price: number) => {
    if (!Number.isFinite(price)) return;

    const previous = lastObservedPriceRef.current;

    if (previous === price) {
      unchangedRef.current += 1;
      setUnchanged(unchangedRef.current);
      return;
    }

    lastObservedPriceRef.current = price;
    unchangedRef.current = 0;
    setUnchanged(0);

    setPriceEvents((old) =>
      [{ price, time: Date.now() }, ...old].slice(
        0,
        100
      )
    );
  }, []);

  /* =====================================
     API FETCH WITH HEALTH MONITORING
  ===================================== */

  const fetchOne = useCallback(
    async (
      selectedCoin: Coin,
      selectedTf: TF,
      signal?: AbortSignal
    ): Promise<Analysis> => {
      const url =
        `/api/analysis?coin=${selectedCoin}` +
        `&timeframe=${selectedTf}`;

      const started = performance.now();

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal,
          headers: {
            Accept: "application/json",
          },
        });

        const raw = await response.json().catch(() => {
          throw new Error("API returned invalid JSON");
        });

        if (!response.ok) {
          throw new Error(
            String(
              raw?.error ||
                raw?.message ||
                `HTTP ${response.status}`
            )
          );
        }

        const receivedAt = Date.now();

        const result = normalize(
          raw,
          selectedCoin,
          selectedTf,
          receivedAt
        );

        if (!signal?.aborted) {
          setApiHealth((old) => ({
            ...old,
            success: old.success + 1,
            lastLatency: performance.now() - started,
            lastSuccess: receivedAt,
            lastError: "",
          }));
        }

        return result;
      } catch (err) {
        if (signal?.aborted) throw err;

        const message =
          err instanceof Error
            ? err.message
            : "Unknown API error";

        setApiHealth((old) => ({
          ...old,
          failed: old.failed + 1,
          lastLatency: performance.now() - started,
          lastError: message,
        }));

        throw err;
      }
    },
    []
  );

  /* =====================================
     INITIAL LOAD / SELECTION CHANGE
  ===================================== */

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();

    selectedBusyRef.current = false;
    multiBusyRef.current = false;

    previousSignalRef.current = null;
    lastObservedPriceRef.current = null;
    unchangedRef.current = 0;

    setData(null);
    setMulti({});
    setError("");
    setFailures(0);
    setPriceEvents([]);
    setUnchanged(0);
    setAlertInfo(null);
    setLoading(true);
    setRefreshing(false);

    const load = async () => {
      selectedBusyRef.current = true;

      try {
        const result = await fetchOne(
          coin,
          tf,
          controller.signal
        );

        if (
          controller.signal.aborted ||
          generation !== generationRef.current
        ) {
          return;
        }

        previousSignalRef.current = result.signal;

        setData(result);
        setMulti({ [tf]: result });

        recordPrice(result.price);
        setError("");
      } catch (err) {
        if (
          controller.signal.aborted ||
          generation !== generationRef.current
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load analysis"
        );
      } finally {
        if (generation === generationRef.current) {
          selectedBusyRef.current = false;
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      generationRef.current++;
    };
  }, [coin, tf, fetchOne, recordPrice]);

  /* =====================================
     SELECTED TIMEFRAME REFRESH
  ===================================== */

  const refreshSelected = useCallback(async () => {
    if (
      selectedBusyRef.current ||
      (typeof document !== "undefined" &&
        document.visibilityState === "hidden")
    ) {
      return;
    }

    const generation = generationRef.current;
    const selected = selectedRef.current;

    selectedBusyRef.current = true;
    setRefreshing(true);

    try {
      const result = await fetchOne(
        selected.coin,
        selected.tf
      );

      if (generation !== generationRef.current) {
        return;
      }

      const previous = previousSignalRef.current;

      if (
        previous !== null &&
        previous !== result.signal &&
        alertsEnabledRef.current
      ) {
        addAlert(
          previous,
          result.signal,
          selected.coin,
          selected.tf,
          false
        );
      }

      previousSignalRef.current = result.signal;

      setData(result);

      setMulti((old) => ({
        ...old,
        [selected.tf]: result,
      }));

      recordPrice(result.price);

      setError("");
      setFailures(0);
    } catch (err) {
      if (generation !== generationRef.current) {
        return;
      }

      setFailures((old) => Math.min(old + 1, 6));

      setError(
        err instanceof Error
          ? err.message
          : "Auto refresh failed"
      );
    } finally {
      if (generation === generationRef.current) {
        selectedBusyRef.current = false;
        setRefreshing(false);
      }
    }
  }, [fetchOne, addAlert, recordPrice]);

  /* =====================================
     1-SECOND POLLING WITH BACKOFF
  ===================================== */

  useEffect(() => {
    if (!auto) return;

    const delay = Math.min(
      POLL_MS * Math.pow(2, failures),
      MAX_RETRY_MS
    );

    const timer = window.setInterval(() => {
      void refreshSelected();
    }, delay);

    return () => window.clearInterval(timer);
  }, [auto, failures, refreshSelected]);

  /* =====================================
     MULTI-TIMEFRAME REFRESH
  ===================================== */

  const refreshMulti = useCallback(async () => {
    if (
      multiBusyRef.current ||
      (typeof document !== "undefined" &&
        document.visibilityState === "hidden")
    ) {
      return;
    }

    const generation = generationRef.current;
    const selected = selectedRef.current;

    multiBusyRef.current = true;

    try {
      const otherTimeframes = TFS.filter(
        (item) => item !== selected.tf
      );

      const results = await Promise.allSettled(
        otherTimeframes.map((item) =>
          fetchOne(selected.coin, item)
        )
      );

      if (generation !== generationRef.current) {
        return;
      }

      const next: Partial<Record<TF, Analysis>> = {};

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[otherTimeframes[index]] = result.value;
        }
      });

      setMulti((old) => ({
        ...old,
        ...next,
      }));
    } finally {
      if (generation === generationRef.current) {
        multiBusyRef.current = false;
      }
    }
  }, [fetchOne]);

  useEffect(() => {
    if (!auto) return;

    const initialTimer = window.setTimeout(() => {
      void refreshMulti();
    }, 2000);

    const interval = window.setInterval(() => {
      void refreshMulti();
    }, MULTI_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [auto, coin, tf, refreshMulti]);

  /* =====================================
     TRADE PLAN
  ===================================== */

  const plan = useMemo(
    () => (data ? calculateTradePlan(data) : null),
    [data]
  );

  /* =====================================
     MULTI-TIMEFRAME CONSENSUS
  ===================================== */

  const confirmation = useMemo(() => {
    const available = TFS.map((item) => multi[item]).filter(
      (item): item is Analysis => Boolean(item)
    );

    const longCount = available.filter(
      (item) => item.signal === "LONG"
    ).length;

    const shortCount = available.filter(
      (item) => item.signal === "SHORT"
    ).length;

    const holdCount = available.filter(
      (item) => item.signal === "HOLD"
    ).length;

    const allSnapshotsFresh =
      available.length === 4 &&
      available.every(
        (item) =>
          now > 0 &&
          now - item.receivedAt >= 0 &&
          now - item.receivedAt <= SNAPSHOT_MAX_AGE_MS
      );

    let overall: Signal = "HOLD";

    if (allSnapshotsFresh) {
      if (longCount >= 3) overall = "LONG";
      if (shortCount >= 3) overall = "SHORT";
    }

    return {
      available: available.length,
      longCount,
      shortCount,
      holdCount,
      overall,
      allSnapshotsFresh,
    };
  }, [multi, now]);

  /* =====================================
     DATA FRESHNESS GATE
  ===================================== */

  const sourceFresh = useMemo(() => {
    if (!data || now <= 0) return false;

    const lastCandle = data.candles[data.candles.length - 1];
    const candleMs = lastCandle
      ? toMilliseconds(lastCandle.time)
      : null;

    if (candleMs === null) return false;

    const candleAge = now - candleMs;
    const candleWindowMs = TF_SECONDS[tf] * 1000;

    const candleOK =
      candleAge >= -30000 &&
      candleAge <= candleWindowMs + 120000;

    const responseOK =
      now - data.receivedAt >= 0 &&
      now - data.receivedAt <= 30000;

    const sourceOK =
      data.sourceTimestamp === null ||
      (now - data.sourceTimestamp >= -30000 &&
        now - data.sourceTimestamp <= 120000);

    return candleOK && responseOK && sourceOK;
  }, [data, now, tf]);

  const isConfirmed =
    data !== null &&
    data.signal !== "HOLD" &&
    data.signal === confirmation.overall &&
    confirmation.allSnapshotsFresh;

  /* =====================================
     RENDER
  ===================================== */

  return (
    <main className="dashboard">
      <div className="container">
        <header className="header">
          <div>
            <h1>Crypto Signal Pro</h1>

            <p>
              Milestone 9.4 · BTC / ETH Technical
              Analysis
            </p>
          </div>

          <span className="liveBadge">
            <span className="liveDot" />
            {auto ? "AUTO ON" : "AUTO OFF"}
          </span>
        </header>

        {/* COIN + TIMEFRAME */}

        <section className="panel">
          <h2>Select Cryptocurrency</h2>

          <div className="buttonRow">
            {(["BTC", "ETH"] as Coin[]).map((item) => (
              <button
                key={item}
                type="button"
                className={
                  coin === item
                    ? "choice active"
                    : "choice"
                }
                onClick={() => setCoin(item)}
              >
                {item === "BTC"
                  ? "₿ Bitcoin"
                  : "Ξ Ethereum"}
              </button>
            ))}
          </div>

          <h2 className="spacedTitle">
            Select Timeframe
          </h2>

          <div className="buttonRow">
            {TFS.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  tf === item
                    ? "choice active"
                    : "choice"
                }
                onClick={() => setTf(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {/* ALERT CONTROLS */}

        <section className="panel">
          <div className="sectionTitle">
            <h2>Signal Alerts</h2>

            <span className="muted small">
              {alertsEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <div className="controlRow">
            <label className="autoLabel">
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(event) =>
                  setAlertsEnabled(event.target.checked)
                }
              />

              Signal Change Alert
            </label>

            <button
              type="button"
              className="smallButton"
              onClick={testAlert}
            >
              Test Alert
            </button>
          </div>

          {alertInfo && (
            <div
              className="alertBox"
              role="status"
              style={{
                borderColor: alertInfo.test
                  ? COLORS.yellow
                  : signalColor(alertInfo.current),
              }}
            >
              <strong>
                {alertInfo.test
                  ? "TEST ALERT — NOT A REAL SIGNAL"
                  : "SIGNAL CHANGED"}
              </strong>

              <p>
                {alertInfo.coin} · {alertInfo.timeframe}:{" "}
                {alertInfo.previous} →{" "}
                <strong
                  style={{
                    color: signalColor(alertInfo.current),
                  }}
                >
                  {alertInfo.current}
                </strong>
              </p>

              <small className="muted">
                {formatTime(alertInfo.time)}
              </small>

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="smallButton"
                  onClick={() => setAlertInfo(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <p className="muted small">
            Test Alert checks only the on-screen alert.
            It does not change market signals or place
            orders. Alerts work while this page is running.
          </p>
        </section>

        {/* LOADING + ERROR */}

        {loading && (
          <div className="notice">
            Loading {coin} {tf} analysis...
          </div>
        )}

        {error && (
          <div className="errorBox" role="alert">
            <strong>API Error</strong>

            <p>{error}</p>

            <button
              type="button"
              className="smallButton"
              onClick={() => {
                void refreshSelected();
                void refreshMulti();
              }}
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* MARKET OVERVIEW */}

            <section className="panel">
              <div className="sectionTitle">
                <h2>{coin} Market Overview</h2>

                <SignalBadge signal={data.signal} />
              </div>

              <div className="price">
                ${fmt(data.price)}
              </div>

              <p className="muted">
                {data.symbol} · {tf} · API Analysis Price
              </p>

              <div className="controlRow">
                <label className="autoLabel">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(event) =>
                      setAuto(event.target.checked)
                    }
                  />

                  Auto Refresh (1 sec)
                </label>

                <button
                  type="button"
                  className="smallButton"
                  disabled={refreshing}
                  onClick={() => {
                    void refreshSelected();
                    void refreshMulti();
                  }}
                >
                  {refreshing
                    ? "Refreshing..."
                    : "Refresh Now"}
                </button>
              </div>

              <p className="muted small">
                Selected timeframe refresh attempts every
                second while the page is visible. Actual
                data updates depend on the API and server.
                Other timeframes refresh approximately
                every 60 seconds.
              </p>
            </section>

            {/* LIVE PRICE VERIFICATION */}

            <LivePriceMonitor
              events={priceEvents}
              unchanged={unchanged}
              latestPrice={data.price}
            />

            {/* API DATA FRESHNESS */}

            <FreshnessPanel data={data} now={now} />

            {/* TRADE CONFIRMATION GATE */}

            <TradingLevels
              data={data}
              plan={plan}
              confirmed={isConfirmed}
              consensus={confirmation.overall}
              sourceFresh={sourceFresh}
            />

            {/* CANDLESTICK CHART */}

            <section className="panel">
              <div className="sectionTitle">
                <h2>Candlestick Chart</h2>

                <span className="muted">
                  {zoom} candles
                </span>
              </div>

              <div className="chartControls">
                <button
                  type="button"
                  className="smallButton"
                  onClick={() =>
                    setZoom((old) =>
                      Math.max(15, old - 15)
                    )
                  }
                >
                  + Zoom In
                </button>

                <button
                  type="button"
                  className="smallButton"
                  onClick={() =>
                    setZoom((old) =>
                      Math.min(150, old + 15)
                    )
                  }
                >
                  − Zoom Out
                </button>
              </div>

              <div className="chartViewport">
                <Chart
                  data={data}
                  count={zoom}
                  plan={plan}
                />
              </div>
            </section>

            {/* MULTI-TIMEFRAME CONFIRMATION */}

            <section className="panel">
              <div className="sectionTitle">
                <h2>Multi-Timeframe Confirmation</h2>

                <SignalBadge
                  signal={confirmation.overall}
                />
              </div>

              <div className="timeframeGrid">
                {TFS.map((item) => {
                  const result = multi[item];

                  return (
                    <div
                      key={item}
                      className="timeframeCard"
                    >
                      <strong>{item}</strong>

                      <span
                        style={{
                          color: result
                            ? signalColor(result.signal)
                            : COLORS.muted,
                          fontWeight: 700,
                        }}
                      >
                        {result
                          ? result.signal
                          : "LOADING"}
                      </span>

                      <small>
                        {result
                          ? `$${fmt(result.price)}`
                          : "Awaiting data"}
                      </small>

                      <small>
                        {result && now > 0
                          ? `Fetched ${formatAge(
                              now - result.receivedAt
                            )}`
                          : ""}
                      </small>
                    </div>
                  );
                })}
              </div>

              <div className="metricsGrid">
                <Metric
                  label="LONG"
                  value={String(
                    confirmation.longCount
                  )}
                  color={COLORS.green}
                />

                <Metric
                  label="SHORT"
                  value={String(
                    confirmation.shortCount
                  )}
                  color={COLORS.red}
                />

                <Metric
                  label="HOLD"
                  value={String(
                    confirmation.holdCount
                  )}
                  color={COLORS.yellow}
                />

                <Metric
                  label="Timeframes Loaded"
                  value={`${confirmation.available}/4`}
                />
              </div>

              <p className="muted small">
                Confirmation requires all four timeframes,
                at least three matching LONG or SHORT
                signals, and browser snapshots younger
                than two minutes.
              </p>
            </section>

            {/* TECHNICAL INDICATORS */}

            <section className="panel">
              <h2>Technical Indicators</h2>

              <div className="metricsGrid">
                <Metric
                  label="RSI"
                  value={fmt(data.rsi)}
                  color={
                    data.rsi >= 70
                      ? COLORS.red
                      : data.rsi <= 30
                      ? COLORS.green
                      : COLORS.text
                  }
                />

                <Metric
                  label="MACD Line"
                  value={fmt(data.macd.line, 4)}
                />

                <Metric
                  label="MACD Signal"
                  value={fmt(data.macd.signal, 4)}
                />

                <Metric
                  label="MACD Histogram"
                  value={fmt(
                    data.macd.histogram,
                    4
                  )}
                />

                <Metric
                  label="EMA 20"
                  value={`$${fmt(data.ema20)}`}
                  color="#fbbf24"
                />

                <Metric
                  label="EMA 50"
                  value={`$${fmt(data.ema50)}`}
                  color={COLORS.purple}
                />

                <Metric
                  label="Support"
                  value={`$${fmt(data.support)}`}
                  color={COLORS.green}
                />

                <Metric
                  label="Resistance"
                  value={`$${fmt(data.resistance)}`}
                  color={COLORS.red}
                />
              </div>
            </section>
          </>
        )}

        {/* API HEALTH ALWAYS VISIBLE */}

        <ApiHealthMonitor health={apiHealth} />

        {/* SIGNAL ALERT HISTORY */}

        <SignalHistory
          history={signalHistory}
          onClear={() => setSignalHistory([])}
        />

        <footer className="footer">
          <strong>
            Crypto Signal Pro · Milestone 9.4
          </strong>

          <p>
            Educational technical analysis only.
            Confirmation is rule-based, not a prediction
            of profitability. Crypto trading carries
            substantial risk. No orders are placed by
            this dashboard.
          </p>
        </footer>
      </div>

      {/* =====================================
          RESPONSIVE MOBILE CSS
      ===================================== */}

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .dashboard {
          min-height: 100vh;
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
          background: #07111f;
          color: #e2e8f0;
          padding: 18px 12px 40px;
          font-family: Arial, Helvetica, sans-serif;
        }

        .container {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
        }

        h1 {
          font-size: clamp(23px, 5vw, 34px);
          margin: 0 0 8px;
          color: #f8fafc;
        }

        h2 {
          font-size: 17px;
          margin: 0 0 16px;
        }

        p {
          line-height: 1.6;
        }

        .header p {
          margin: 0;
          font-size: 13px;
          color: #94a3b8;
        }

        .panel {
          width: 100%;
          min-width: 0;
          background: #0d1a2b;
          border: 1px solid #26384f;
          border-radius: 16px;
          padding: 17px;
          margin-bottom: 16px;
        }

        .sectionTitle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 15px;
        }

        .sectionTitle h2 {
          margin: 0;
        }

        .spacedTitle {
          margin-top: 22px;
        }

        .buttonRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .choice,
        .smallButton {
          border: 1px solid #36506e;
          background: #14243a;
          color: #e2e8f0;
          border-radius: 10px;
          padding: 11px 15px;
          font-weight: 700;
          cursor: pointer;
          font-size: 13px;
        }

        .choice.active {
          background: #2563eb;
          border-color: #60a5fa;
          color: white;
        }

        .choice {
          flex: 1;
          text-align: center;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .liveBadge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid #1e9f75;
          color: #4ade80;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .liveDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
        }

        .signalBadge {
          display: inline-flex;
          align-items: center;
          border: 1px solid;
          border-radius: 999px;
          padding: 7px 12px;
          font-weight: 800;
          font-size: 12px;
          white-space: nowrap;
        }

        .price {
          font-size: clamp(28px, 8vw, 46px);
          font-weight: 800;
          color: #f8fafc;
          overflow-wrap: anywhere;
        }

        .muted {
          color: #94a3b8;
        }

        .small {
          font-size: 12px;
        }

        .controlRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin: 15px 0;
        }

        .autoLabel {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13px;
          font-weight: 700;
        }

        .autoLabel input {
          width: 18px;
          height: 18px;
          accent-color: #2563eb;
        }

        .notice {
          padding: 15px;
          margin-bottom: 15px;
          background: #14243a;
          border-radius: 12px;
        }

        .errorBox {
          background: #351c2a;
          border: 1px solid #fb7185;
          padding: 15px;
          border-radius: 12px;
          margin: 15px 0;
          overflow-wrap: anywhere;
        }

        .alertBox {
          background: #17263c;
          border: 1px solid;
          border-radius: 12px;
          padding: 15px;
          margin-top: 16px;
        }

        .warningBox {
          background: #302611;
          border: 1px solid #b87900;
          color: #facc15;
          padding: 15px;
          border-radius: 12px;
          margin: 18px 0;
        }

        .successBox {
          background: #10291f;
          border: 1px solid #16a34a;
          color: #4ade80;
          padding: 15px;
          border-radius: 12px;
          margin: 18px 0;
        }

        .gateRow {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 15px;
        }

        .metricsGrid {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 16px 0;
        }

        .metric {
          min-width: 0;
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 12px;
          padding: 13px;
        }

        .metricLabel {
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.5;
        }

        .metricValue {
          display: block;
          margin-top: 10px;
          font-size: 17px;
          overflow-wrap: anywhere;
        }

        .chartControls {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 14px;
        }

        .chartViewport {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .chartInner {
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          border-radius: 12px;
          background: #101b2d;
        }

        .chartSvg {
          width: 100%;
          height: auto;
          display: block;
        }

        .chartLegend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 12px;
          font-size: 12px;
        }

        .timeframeGrid {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 9px;
          margin-bottom: 18px;
        }

        .timeframeCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 12px;
          padding: 13px;
        }

        .timeframeCard small {
          color: #94a3b8;
          overflow-wrap: anywhere;
        }

        .historyList {
          display: grid;
          gap: 10px;
        }

        .historyItem {
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 12px;
          padding: 13px;
        }

        .historyHeading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .footer {
          text-align: center;
          color: #94a3b8;
          padding: 15px 5px;
          font-size: 12px;
        }

        .footer strong {
          color: #e2e8f0;
        }

        @media (max-width: 700px) {
          .dashboard {
            padding: 12px 9px 30px;
          }

          .panel {
            padding: 13px;
            border-radius: 13px;
          }

          .metricsGrid,
          .timeframeGrid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .choice {
            padding: 11px 10px;
          }

          .liveBadge {
            padding: 7px 8px;
            font-size: 10px;
          }
        }

        @media (max-width: 380px) {
          .header {
            flex-direction: column;
          }

          .price {
            font-size: 29px;
          }

          .panel {
            padding: 11px;
          }

          .timeframeCard,
          .metric {
            padding: 10px;
          }
        }
      `}</style>
    </main>
  );
}

/* =========================================
   END — CRYPTO SIGNAL PRO MILESTONE 9.4
========================================= */
