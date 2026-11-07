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
  macd: { line: number; signal: number; histogram: number };
  ema20: number;
  ema50: number;
  candles: Candle[];
};

const TFS: TF[] = ["5m", "15m", "1h", "4h"];
const POLL_MS = 1000;
const MULTI_MS = 60000;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const fmt = (v: unknown, d = 2) => {
  const n = num(v);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })
    : "—";
};

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
    throw new Error("Price/support/resistance missing");
  }

  const signal: Signal =
    raw.signal === "LONG" || raw.signal === "SHORT"
      ? raw.signal
      : "HOLD";

  return {
    coin,
    symbol: String(raw.symbol || coin + "USD"),
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
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }

  let previous = sum / period;
  result[period - 1] = previous;
  const k = 2 / (period + 1);

  for (let i = period; i < candles.length; i++) {
    previous = candles[i].close * k + previous * (1 - k);
    result[i] = previous;
  }

  return result;
}

/* =========================================
   MILESTONE 9.2 — PART 2
   Chart + Trading Levels + Alerts
   Paste directly after Part 1
========================================= */

type TradePlan = {
  direction: Signal;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  risk: number;
  valid: boolean;
};

function signalColor(signal: Signal): string {
  if (signal === "LONG") return "#22c55e";
  if (signal === "SHORT") return "#fb7185";
  return "#facc15";
}

/* =========================================
   ENTRY, STOP LOSS, TARGET CALCULATION
========================================= */

function calculateTradePlan(
  data: Analysis
): TradePlan | null {
  if (data.signal === "HOLD") return null;

  const entry = data.price;

  if (!Number.isFinite(entry) || entry <= 0) {
    return null;
  }

  const support = data.support;
  const resistance = data.resistance;

  const candles = data.candles.slice(-14);

  const ranges = candles.map(
    (c) => c.high - c.low
  );

  const averageRange =
    ranges.length > 0
      ? ranges.reduce((a, b) => a + b, 0) /
        ranges.length
      : 0;

  const minimumRisk = Math.max(
    averageRange * 1.5,
    entry * 0.002
  );

  if (
    !Number.isFinite(minimumRisk) ||
    minimumRisk <= 0
  ) {
    return null;
  }

  let stopLoss: number;

  if (data.signal === "LONG") {
    stopLoss =
      support < entry
        ? Math.min(
            support - averageRange * 0.2,
            entry - minimumRisk
          )
        : entry - minimumRisk;
  } else {
    stopLoss =
      resistance > entry
        ? Math.max(
            resistance + averageRange * 0.2,
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

  const multiplier =
    data.signal === "LONG" ? 1 : -1;

  const target1 = entry + multiplier * risk;
  const target2 = entry + multiplier * risk * 2;
  const target3 = entry + multiplier * risk * 3;

  return {
    direction: data.signal,
    entry,
    stopLoss,
    target1,
    target2,
    target3,
    risk,
    valid: true,
  };
}

/* =========================================
   EMA + CANDLESTICK CHART
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
    () =>
      calculateEMA(data.candles, 20).slice(-count),
    [data.candles, count]
  );

  const ema50 = useMemo(
    () =>
      calculateEMA(data.candles, 50).slice(-count),
    [data.candles, count]
  );

  const width = 900;
  const height = 420;

  const left = 16;
  const right = 125;
  const top = 25;
  const bottom = 45;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const values = [
    ...candles.flatMap((c) => [
      c.low,
      c.high,
    ]),
    ...ema20.filter(
      (v): v is number => v !== null
    ),
    ...ema50.filter(
      (v): v is number => v !== null
    ),
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
    ((maxPrice - price) /
      (maxPrice - minPrice)) *
      plotHeight;

  const slot = plotWidth / candles.length;

  const x = (index: number) =>
    left + slot * (index + 0.5);

  const bodyWidth = Math.max(
    2,
    slot * 0.6
  );

  function makePath(
    series: (number | null)[]
  ): string {
    let path = "";
    let started = false;

    series.forEach((value, index) => {
      if (
        value === null ||
        !Number.isFinite(value)
      ) {
        started = false;
        return;
      }

      path += `${
        started ? "L" : "M"
      }${x(index)},${y(value)} `;

      started = true;
    });

    return path;
  }

  const levels: {
    label: string;
    price: number;
    color: string;
    dash: string;
  }[] = [
    {
      label: "PRICE",
      price: data.price,
      color: "#60a5fa",
      dash: "4 4",
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

  // Keep labels from overlapping vertically.
  const sortedLevels = levels
    .map((level) => ({
      ...level,
      actualY: y(level.price),
    }))
    .sort((a, b) => a.actualY - b.actualY);

  const labelY: Record<string, number> = {};
  const labelGap = 19;
  const labelTop = top + 10;
  const labelBottom = height - bottom - 10;

  sortedLevels.forEach((level, index) => {
    const previous =
      index > 0
        ? labelY[sortedLevels[index - 1].label]
        : labelTop - labelGap;

    labelY[level.label] = Math.max(
      level.actualY,
      previous + labelGap,
      labelTop
    );
  });

  if (sortedLevels.length > 0) {
    const last =
      sortedLevels[sortedLevels.length - 1];

    const overflow =
      labelY[last.label] - labelBottom;

    if (overflow > 0) {
      sortedLevels.forEach((level) => {
        labelY[level.label] -= overflow;
      });
    }
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        borderRadius: 12,
        background: "#101b2d",
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
        role="img"
        aria-label="Candlestick chart with EMA, support, resistance and trading levels"
      >
        <rect
          width={width}
          height={height}
          fill="#101b2d"
        />

        {/* Horizontal grid */}
        {Array.from(
          { length: 5 },
          (_, i) =>
            minPrice +
            ((maxPrice - minPrice) * i) / 4
        ).map((price, i) => (
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
        ))}

        {/* Candlesticks */}
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
            Math.abs(
              y(c.open) - y(c.close)
            )
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

        {/* EMA 20 */}
        <path
          d={makePath(ema20)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.3"
        />

        {/* EMA 50 */}
        <path
          d={makePath(ema50)}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2.3"
        />

        {/* Support, resistance, entry, SL, targets */}
        {levels.map((level) => (
          <g key={level.label}>
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
              y={labelY[level.label] - 9}
              width={right - 3}
              height={18}
              rx="3"
              fill="#24364f"
            />

            <text
              x={width - right + 5}
              y={labelY[level.label] + 4}
              fill={level.color}
              fontSize="11"
              fontWeight="bold"
            >
              {level.label} {fmt(level.price, 1)}
            </text>
          </g>
        ))}

        {/* Time labels */}
        {candles.map((c, i) => {
          const step = Math.max(
            1,
            Math.ceil(candles.length / 6)
          );

          if (i % step !== 0) return null;

          const ms =
            c.time < 1e12
              ? c.time * 1000
              : c.time;

          return (
            <text
              key={`time-${c.time}`}
              x={x(i)}
              y={height - 13}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {new Date(ms).toLocaleTimeString(
                "en-IN",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                }
              )}
            </text>
          );
        })}
      </svg>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          padding: 12,
          fontSize: 12,
        }}
      >
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
          ━ API Price
        </span>

        {plan && (
          <>
            <span style={{ color: "#ef4444" }}>
              ━ Stop Loss
            </span>

            <span style={{ color: "#4ade80" }}>
              ━ Targets
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================
   TRADING LEVEL CARDS
========================================= */

function TradingLevels({
  data,
  plan,
}: {
  data: Analysis;
  plan: TradePlan | null;
}) {
  if (!plan) {
    return (
      <div
        style={{
          padding: 16,
          background: "#101b2d",
          borderRadius: 12,
          color: "#facc15",
        }}
      >
        <strong>WAIT FOR CONFIRMATION</strong>
        <p style={{ color: "#94a3b8" }}>
          Current signal is HOLD. No new
          entry, stop loss or target is
          suggested.
        </p>
      </div>
    );
  }

  const items = [
    {
      label: "Entry Point",
      value: plan.entry,
      color: "#60a5fa",
    },
    {
      label: "Stop Loss",
      value: plan.stopLoss,
      color: "#fb7185",
    },
    {
      label: "Target 1 · 1:1",
      value: plan.target1,
      color: "#4ade80",
    },
    {
      label: "Target 2 · 1:2",
      value: plan.target2,
      color: "#22c55e",
    },
    {
      label: "Target 3 · 1:3",
      value: plan.target3,
      color: "#10b981",
    },
  ];

  return (
    <div>
      <p
        style={{
          color: signalColor(plan.direction),
          fontWeight: "bold",
        }}
      >
        {plan.direction} SETUP
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              background: "#101b2d",
              border: "1px solid #304560",
              padding: 14,
              borderRadius: 12,
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
              }}
            >
              {item.label}
            </div>

            <strong
              style={{
                display: "block",
                marginTop: 10,
                color: item.color,
                fontSize: 17,
                overflowWrap: "anywhere",
              }}
            >
              ${fmt(item.value)}
            </strong>
          </div>
        ))}
      </div>

      <p
        style={{
          color: "#94a3b8",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        Risk per unit: ${fmt(plan.risk)}.
        Entry uses the latest API analysis
        price, not a guaranteed execution
        price. Targets are hypothetical
        risk-reward levels and do not
        include fees or slippage.
      </p>
    </div>
  );
}

/* =========================================
   SIGNAL CHANGE ALERT
========================================= */

function SignalAlert({
  previous,
  current,
  coin,
  timeframe,
}: {
  previous: Signal | null;
  current: Signal;
  coin: Coin;
  timeframe: TF;
}) {
  if (!previous || previous === current) {
    return null;
  }

  return (
    <div
      role="status"
      style={{
        background: "#17263c",
        border: `1px solid ${signalColor(current)}`,
        borderRadius: 12,
        padding: 15,
        marginBottom: 16,
      }}
    >
      <strong
        style={{
          color: signalColor(current),
        }}
      >
        SIGNAL CHANGED
      </strong>

      <p>
        {coin} · {timeframe}:{" "}
        <strong>{previous}</strong>
        {" → "}
        <strong
          style={{
            color: signalColor(current),
          }}
        >
          {current}
        </strong>
      </p>

      <p
        style={{
          fontSize: 12,
          color: "#94a3b8",
        }}
      >
        The technical signal changed.
        Review market conditions before
        making any trading decision.
      </p>
    </div>
  );
}

/* =========================================
   METRIC CARD
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
    <div
      className="metric"
      style={{
        minWidth: 0,
        background: "#101b2d",
        border: "1px solid #304560",
        borderRadius: 12,
        padding: 13,
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: 12,
        }}
      >
        {label}
      </div>

      <strong
        style={{
          display: "block",
          marginTop: 10,
          color: color || "#e2e8f0",
          fontSize: 17,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

/* END OF PART 2 */

/* =========================================
   MILESTONE 9.2 — PART 3
   Dashboard + Auto Refresh + Mobile CSS
   Paste directly after Part 2
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
  const [updated, setUpdated] = useState<Date | null>(null);

  const [failures, setFailures] = useState(0);

  const [alertInfo, setAlertInfo] = useState<{
    previous: Signal;
    current: Signal;
    coin: Coin;
    timeframe: TF;
  } | null>(null);

  const generationRef = useRef(0);
  const selectedBusyRef = useRef(false);
  const multiBusyRef = useRef(false);
  const previousSignalRef = useRef<Signal | null>(null);
  const latestDataRef = useRef<Analysis | null>(null);

  const selectedRef = useRef({ coin, tf });

  selectedRef.current = { coin, tf };

  const fetchOne = useCallback(
    async (
      selectedCoin: Coin,
      selectedTf: TF,
      signal?: AbortSignal
    ): Promise<Analysis> => {
      const url =
        `/api/analysis?coin=${selectedCoin}` +
        `&timeframe=${selectedTf}`;

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

      return normalize(raw, selectedCoin, selectedTf);
    },
    []
  );

  /* =====================================
     INITIAL LOAD + COIN/TF SWITCH
  ===================================== */

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();

    selectedBusyRef.current = false;
    multiBusyRef.current = false;
    previousSignalRef.current = null;
    latestDataRef.current = null;

    setData(null);
    setMulti({});
    setError("");
    setFailures(0);
    setAlertInfo(null);
    setUpdated(null);
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

        latestDataRef.current = result;
        previousSignalRef.current = result.signal;

        setData(result);
        setMulti({ [tf]: result });
        setUpdated(new Date());
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
            : "Unable to load market analysis"
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
  }, [coin, tf, fetchOne]);

  /* =====================================
     SELECTED TIMEFRAME AUTO REFRESH
     Attempts every 1 second
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
        previous !== result.signal
      ) {
        setAlertInfo({
          previous,
          current: result.signal,
          coin: selected.coin,
          timeframe: selected.tf,
        });
      }

      previousSignalRef.current = result.signal;
      latestDataRef.current = result;

      setData(result);

      setMulti((old) => ({
        ...old,
        [selected.tf]: result,
      }));

      setUpdated(new Date());
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
  }, [fetchOne]);

  useEffect(() => {
    if (!auto) return;

    // On failures, slow down requests.
    const delay = Math.min(
      POLL_MS * Math.pow(2, failures),
      30000
    );

    const timer = window.setInterval(() => {
      void refreshSelected();
    }, delay);

    return () => window.clearInterval(timer);
  }, [auto, failures, refreshSelected]);

  /* =====================================
     MULTI TIMEFRAME AUTO REFRESH
     Every 60 seconds
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
        (timeframe) => timeframe !== selected.tf
      );

      const results = await Promise.allSettled(
        otherTimeframes.map((timeframe) =>
          fetchOne(selected.coin, timeframe)
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

    // Load remaining timeframes shortly
    // after the selected timeframe.
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
     CALCULATED TRADING LEVELS
  ===================================== */

  const plan = useMemo(() => {
    return data ? calculateTradePlan(data) : null;
  }, [data]);

  /* =====================================
     MULTI TIMEFRAME CONFIRMATION
  ===================================== */

  const confirmation = useMemo(() => {
    const available = TFS.map(
      (timeframe) => multi[timeframe]
    ).filter(
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

    let overall: Signal = "HOLD";

    // Requires all four timeframes and
    // at least three matching signals.
    if (available.length === 4) {
      if (longCount >= 3) overall = "LONG";
      if (shortCount >= 3) overall = "SHORT";
    }

    return {
      longCount,
      shortCount,
      holdCount,
      available: available.length,
      overall,
    };
  }, [multi]);

  const isSelectedConfirmed =
    data !== null &&
    data.signal !== "HOLD" &&
    data.signal === confirmation.overall;

  /* =====================================
     DASHBOARD RENDER
  ===================================== */

  return (
    <main className="dashboard">
      <div className="container">
        <header className="header">
          <div>
            <h1>Crypto Signal Pro</h1>
            <p>
              Milestone 9.2 · BTC / ETH Technical
              Analysis
            </p>
          </div>

          <span className="liveBadge">
            <span className="liveDot" />
            {auto ? "AUTO ON" : "AUTO OFF"}
          </span>
        </header>

        {/* Coin selection */}
        <section className="panel">
          <div className="sectionTitle">
            <h2>Select Cryptocurrency</h2>
          </div>

          <div className="buttonRow">
            {(["BTC", "ETH"] as Coin[]).map(
              (item) => (
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
              )
            )}
          </div>

          <div className="sectionTitle">
            <h2>Select Timeframe</h2>
          </div>

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

        {/* Status and errors */}
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

        {/* Signal alert */}
        {alertInfo && (
          <div>
            <SignalAlert
              previous={alertInfo.previous}
              current={alertInfo.current}
              coin={alertInfo.coin}
              timeframe={alertInfo.timeframe}
            />

            <button
              type="button"
              className="smallButton"
              onClick={() => setAlertInfo(null)}
            >
              Dismiss Alert
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Live price */}
            <section className="panel">
              <div className="sectionTitle">
                <h2>
                  {coin} Market Overview
                </h2>

                <span
                  className="signalBadge"
                  style={{
                    color: signalColor(data.signal),
                    borderColor: signalColor(
                      data.signal
                    ),
                  }}
                >
                  {data.signal}
                </span>
              </div>

              <div className="price">
                ${fmt(data.price)}
              </div>

              <p className="muted">
                {data.symbol} · {tf} · API
                Analysis Price
              </p>

              <div className="statusRow">
                <span>
                  {refreshing
                    ? "Refreshing..."
                    : "Last successful update:"}
                </span>

                <strong>
                  {updated
                    ? updated.toLocaleTimeString(
                        "en-IN",
                        {
                          timeZone:
                            "Asia/Kolkata",
                        }
                      )
                    : "—"}
                </strong>
              </div>

              <div className="controlRow">
                <label className="autoLabel">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(event) =>
                      setAuto(
                        event.target.checked
                      )
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
                  Refresh Now
                </button>
              </div>

              <p className="muted smallText">
                Selected timeframe is polled
                approximately every second
                while this page is visible.
                Other timeframes refresh every
                60 seconds. API and server
                delays may slow updates.
              </p>
            </section>

            {/* Trading levels */}
            <section className="panel">
              <div className="sectionTitle">
                <h2>
                  Entry · Stop Loss · Targets
                </h2>
              </div>

              <TradingLevels
                data={data}
                plan={plan}
              />

              {plan && (
                <p
                  className={
                    isSelectedConfirmed
                      ? "confirmed"
                      : "warning"
                  }
                >
                  {isSelectedConfirmed
                    ? "Multi-timeframe direction matches the selected signal."
                    : "Selected signal is not yet confirmed by the multi-timeframe consensus."}
                </p>
              )}
            </section>

            {/* Candlestick chart */}
            <section className="panel">
              <div className="sectionTitle">
                <h2>
                  Candlestick Chart
                </h2>

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

              <p className="muted smallText">
                EMA 20/50, support,
                resistance, entry, stop loss
                and targets are displayed
                when available.
              </p>
            </section>

            {/* Multi-timeframe confirmation */}
            <section className="panel">
              <div className="sectionTitle">
                <h2>
                  Multi-Timeframe Confirmation
                </h2>

                <span
                  className="signalBadge"
                  style={{
                    color: signalColor(
                      confirmation.overall
                    ),
                    borderColor: signalColor(
                      confirmation.overall
                    ),
                  }}
                >
                  {confirmation.overall}
                </span>
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
                            ? signalColor(
                                result.signal
                              )
                            : "#94a3b8",
                          fontWeight: 700,
                        }}
                      >
                        {result
                          ? result.signal
                          : "LOADING"}
                      </span>

                      <small>
                        {result
                          ? `$${fmt(
                              result.price
                            )}`
                          : "Awaiting data"}
                      </small>
                    </div>
                  );
                })}
              </div>

              <div className="summaryGrid">
                <Metric
                  label="LONG"
                  value={String(
                    confirmation.longCount
                  )}
                  color="#22c55e"
                />

                <Metric
                  label="SHORT"
                  value={String(
                    confirmation.shortCount
                  )}
                  color="#fb7185"
                />

                <Metric
                  label="HOLD"
                  value={String(
                    confirmation.holdCount
                  )}
                  color="#facc15"
                />

                <Metric
                  label="Timeframes Loaded"
                  value={`${
                    confirmation.available
                  } / 4`}
                />
              </div>

              <p className="muted smallText">
                Consensus requires all four
                timeframes and at least three
                matching LONG or SHORT
                signals. HOLD also indicates
                insufficient confirmation.
              </p>
            </section>

            {/* Technical indicators */}
            <section className="panel">
              <div className="sectionTitle">
                <h2>
                  Technical Indicators
                </h2>
              </div>

              <div className="metricsGrid">
                <Metric
                  label="RSI"
                  value={fmt(data.rsi)}
                  color={
                    data.rsi >= 70
                      ? "#fb7185"
                      : data.rsi <= 30
                      ? "#22c55e"
                      : "#e2e8f0"
                  }
                />

                <Metric
                  label="MACD Line"
                  value={fmt(
                    data.macd.line,
                    4
                  )}
                />

                <Metric
                  label="MACD Signal"
                  value={fmt(
                    data.macd.signal,
                    4
                  )}
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
                  value={`$${fmt(
                    data.ema20
                  )}`}
                  color="#fbbf24"
                />

                <Metric
                  label="EMA 50"
                  value={`$${fmt(
                    data.ema50
                  )}`}
                  color="#a78bfa"
                />

                <Metric
                  label="Support"
                  value={`$${fmt(
                    data.support
                  )}`}
                  color="#22c55e"
                />

                <Metric
                  label="Resistance"
                  value={`$${fmt(
                    data.resistance
                  )}`}
                  color="#fb7185"
                />
              </div>
            </section>
          </>
        )}

        <footer className="footer">
          <strong>
            Crypto Signal Pro · Milestone 9.2
          </strong>

          <p>
            Educational technical analysis
            only. Trading cryptocurrencies
            involves substantial risk.
            Signals, entry levels, stop
            losses and targets are not
            guarantees. Consider fees,
            slippage, volatility and your
            own risk tolerance.
          </p>
        </footer>
      </div>

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
          font-family:
            Arial, Helvetica, sans-serif;
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
          margin: 0;
        }

        p {
          line-height: 1.6;
        }

        .header p {
          margin: 0;
          font-size: 13px;
          color: #94a3b8;
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

        .sectionTitle:not(:first-child) {
          margin-top: 18px;
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

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .signalBadge {
          display: inline-flex;
          align-items: center;
          border: 1px solid;
          border-radius: 999px;
          padding: 7px 12px;
          font-weight: 800;
          font-size: 12px;
        }

        .price {
          font-size: clamp(
            28px,
            8vw,
            46px
          );
          font-weight: 800;
          color: #f8fafc;
          overflow-wrap: anywhere;
        }

        .muted {
          color: #94a3b8;
        }

        .smallText {
          font-size: 12px;
        }

        .statusRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin: 18px 0;
          font-size: 13px;
        }

        .controlRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
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
          margin-bottom: 15px;
        }

        .errorBox p {
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

        .timeframeGrid {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
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

        .summaryGrid {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 10px;
        }

        .metricsGrid {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 10px;
        }

        .confirmed {
          color: #4ade80;
          font-size: 13px;
          font-weight: 700;
        }

        .warning {
          color: #facc15;
          font-size: 13px;
          font-weight: 700;
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

          .timeframeGrid,
          .summaryGrid,
          .metricsGrid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .header {
            align-items: flex-start;
          }

          .liveBadge {
            padding: 7px 8px;
            font-size: 10px;
          }

          .choice {
            flex: 1;
            text-align: center;
            padding: 11px 10px;
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

          .timeframeCard {
            padding: 10px;
          }
        }
      `}</style>
    </main>
  );
}

/* =========================================
   END OF MILESTONE 9.2
========================================= */
