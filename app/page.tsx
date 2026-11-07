
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
  fetchedAt: number;
  latestCandleAt: number;
  sourceUpdatedAt: number | null;
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

type AlertInfo = {
  previous: Signal;
  current: Signal;
  coin: Coin;
  timeframe: TF;
  test: boolean;
  time: number;
};

const TFS: TF[] = ["5m", "15m", "1h", "4h"];
const POLL_MS = 1000;
const MULTI_MS = 60000;

const colors = {
  bg: "#07111f",
  panel: "#0d1a2b",
  card: "#101b2d",
  border: "#304560",
  text: "#e2e8f0",
  muted: "#94a3b8",
  green: "#22c55e",
  red: "#fb7185",
  yellow: "#facc15",
  blue: "#60a5fa",
  purple: "#a78bfa",
};

function num(value: unknown): number {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return NaN;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function fmt(value: unknown, digits = 2): string {
  const n = num(value);
  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signalColor(signal: Signal): string {
  if (signal === "LONG") return colors.green;
  if (signal === "SHORT") return colors.red;
  return colors.yellow;
}

function parseTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && isNaN(Number(value))) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const n = num(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  return n < 1e12 ? n * 1000 : n;
}

function timeIST(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "—";

  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function ageText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
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
            c.low > 0 &&
            c.high >= c.low &&
            c.open >= c.low &&
            c.open <= c.high &&
            c.close >= c.low &&
            c.close <= c.high
        )
        .sort((a: Candle, b: Candle) => a.time - b.time)
    : [];

  if (candles.length < 2) {
    throw new Error("Not enough valid candles from API");
  }

  const price = num(raw.price);
  const support = num(raw.support);
  const resistance = num(raw.resistance);

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(support) ||
    !Number.isFinite(resistance) ||
    price <= 0 ||
    support <= 0 ||
    resistance <= 0
  ) {
    throw new Error("Invalid price/support/resistance");
  }

  const signal: Signal =
    raw.signal === "LONG" || raw.signal === "SHORT"
      ? raw.signal
      : "HOLD";

  const last = candles[candles.length - 1];

  const latestCandleAt = parseTimestamp(last.time);

  if (!latestCandleAt) {
    throw new Error("Invalid candle timestamp");
  }

  // Optional backend timestamp. If the API does not
  // provide one, the dashboard clearly shows N/A.
  const sourceUpdatedAt =
    parseTimestamp(raw.marketTimestamp) ??
    parseTimestamp(raw.sourceUpdatedAt) ??
    parseTimestamp(raw.updatedAt) ??
    null;

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
    fetchedAt: Date.now(),
    latestCandleAt,
    sourceUpdatedAt,
  };
}

function calculateEMA(
  candles: Candle[],
  period: number
): (number | null)[] {
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

function calculateTradePlan(data: Analysis): TradePlan | null {
  if (data.signal === "HOLD") return null;

  const entry = data.price;
  const candles = data.candles.slice(-14);

  const ranges = candles.map((c) => c.high - c.low);
  const averageRange =
    ranges.reduce((sum, value) => sum + value, 0) /
    ranges.length;

  const minimumRisk = Math.max(
    averageRange * 1.5,
    entry * 0.002
  );

  if (!Number.isFinite(minimumRisk) || minimumRisk <= 0) {
    return null;
  }

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
  const direction = data.signal === "LONG" ? 1 : -1;

  const target1 = entry + direction * risk;
  const target2 = entry + direction * risk * 2;
  const target3 = entry + direction * risk * 3;

  if (
    !Number.isFinite(risk) ||
    risk <= 0 ||
    stopLoss <= 0 ||
    target1 <= 0 ||
    target2 <= 0 ||
    target3 <= 0
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
      <span>{label}</span>
      <strong style={{ color: color || colors.text }}>
        {value}
      </strong>
    </div>
  );
}

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
  const height = 430;
  const left = 15;
  const right = 145;
  const top = 25;
  const bottom = 45;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const levels: {
    label: string;
    price: number;
    color: string;
  }[] = [
    {
      label: "PRICE / ENTRY",
      price: data.price,
      color: colors.blue,
    },
    {
      label: "SUP",
      price: data.support,
      color: colors.green,
    },
    {
      label: "RES",
      price: data.resistance,
      color: colors.red,
    },
  ];

  if (plan) {
    levels.push(
      { label: "SL", price: plan.stopLoss, color: colors.red },
      { label: "T1", price: plan.target1, color: "#4ade80" },
      { label: "T2", price: plan.target2, color: "#16a34a" },
      { label: "T3", price: plan.target3, color: "#10b981" }
    );
  }

  const values = [
    ...candles.flatMap((c) => [c.high, c.low]),
    ...ema20.filter((v): v is number => v !== null),
    ...ema50.filter((v): v is number => v !== null),
    ...levels.map((level) => level.price),
  ];

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  const padding = Math.max(
    (rawMax - rawMin) * 0.08,
    data.price * 0.0001
  );

  const minPrice = rawMin - padding;
  const maxPrice = rawMax + padding;

  const y = (price: number) =>
    top +
    ((maxPrice - price) / (maxPrice - minPrice)) *
      plotHeight;

  const slot = plotWidth / candles.length;
  const x = (index: number) =>
    left + slot * (index + 0.5);

  const bodyWidth = Math.max(2, slot * 0.6);

  function linePath(series: (number | null)[]) {
    let result = "";
    let active = false;

    series.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        active = false;
        return;
      }

      result += `${active ? "L" : "M"}${x(index)},${y(value)} `;
      active = true;
    });

    return result;
  }

  // Distribute right-side price labels to avoid overlap.
  const sorted = levels
    .map((level) => ({
      ...level,
      actualY: y(level.price),
    }))
    .sort((a, b) => a.actualY - b.actualY);

  const labelY: Record<string, number> = {};
  const labelGap = 20;

  sorted.forEach((level, index) => {
    const previous =
      index === 0
        ? top - labelGap
        : labelY[sorted[index - 1].label];

    labelY[level.label] = Math.max(
      level.actualY,
      previous + labelGap,
      top + 10
    );
  });

  const last = sorted[sorted.length - 1];

  if (last && labelY[last.label] > height - bottom - 10) {
    const overflow =
      labelY[last.label] - (height - bottom - 10);

    sorted.forEach((level) => {
      labelY[level.label] -= overflow;
    });
  }

  return (
    <div className="chartBox">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chartSvg"
        role="img"
        aria-label="BTC or ETH candlestick chart with EMA and price levels"
      >
        <rect width={width} height={height} fill="#101b2d" />

        {Array.from({ length: 5 }, (_, index) => {
          const price =
            minPrice +
            ((maxPrice - minPrice) * index) / 4;

          return (
            <g key={index}>
              <line
                x1={left}
                x2={width - right}
                y1={y(price)}
                y2={y(price)}
                stroke="#29384e"
                strokeDasharray="4 5"
              />
              <text
                x={width - right + 5}
                y={y(price) + 4}
                fill="#94a3b8"
                fontSize="12"
              >
                {fmt(price)}
              </text>
            </g>
          );
        })}

        {candles.map((c, index) => {
          const rising = c.close >= c.open;
          const color = rising ? "#22c55e" : "#ef4444";

          const bodyTop = Math.min(y(c.open), y(c.close));
          const bodyHeight = Math.max(
            1.5,
            Math.abs(y(c.open) - y(c.close))
          );

          return (
            <g key={`${c.time}-${index}`}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1.5"
              />
              <rect
                x={x(index) - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })}

        <path
          d={linePath(ema20)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.4"
        />

        <path
          d={linePath(ema50)}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2.4"
        />

        {levels.map((level) => (
          <g key={level.label}>
            <line
              x1={left}
              x2={width - right}
              y1={y(level.price)}
              y2={y(level.price)}
              stroke={level.color}
              strokeDasharray="6 5"
              strokeWidth="1.8"
            />
            <rect
              x={width - right}
              y={labelY[level.label] - 9}
              width={right - 3}
              height={18}
              rx={3}
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

        {candles.map((c, index) => {
          const step = Math.max(
            1,
            Math.ceil(candles.length / 6)
          );

          if (index % step !== 0) return null;

          const ms = parseTimestamp(c.time);

          return (
            <text
              key={`time-${index}`}
              x={x(index)}
              y={height - 12}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
            >
              {ms
                ? new Date(ms).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })
                : "—"}
            </text>
          );
        })}
      </svg>

      <div className="legend">
        <span style={{ color: "#fbbf24" }}>━ EMA 20</span>
        <span style={{ color: "#a78bfa" }}>━ EMA 50</span>
        <span style={{ color: colors.green }}>━ Support</span>
        <span style={{ color: colors.red }}>━ Resistance / SL</span>
        <span style={{ color: colors.blue }}>━ Price / Entry</span>
        <span style={{ color: "#4ade80" }}>━ Targets</span>
      </div>
    </div>
  );
}

function TradingLevels({
  plan,
  confirmed,
  pending,
}: {
  plan: TradePlan | null;
  confirmed: boolean;
  pending: boolean;
}) {
  if (!plan) {
    return (
      <div className="gate holdGate">
        <strong>WAIT — NO VALID TRADE SETUP</strong>
        <p>
          The selected signal is HOLD or valid trading levels
          could not be calculated.
        </p>
      </div>
    );
  }

  const items = [
    { label: "Entry Point", value: plan.entry, color: colors.blue },
    { label: "Stop Loss", value: plan.stopLoss, color: colors.red },
    { label: "Target 1 · 1:1", value: plan.target1, color: colors.green },
    { label: "Target 2 · 1:2", value: plan.target2, color: colors.green },
    { label: "Target 3 · 1:3", value: plan.target3, color: colors.green },
  ];

  return (
    <div>
      <div
        className={
          confirmed ? "gate confirmedGate" : "gate holdGate"
        }
      >
        <strong>
          {confirmed
            ? "✓ CONFIRMED SETUP"
            : pending
            ? "WAIT — CHECKING ALL TIMEFRAMES"
            : "⚠ UNCONFIRMED SETUP"}
        </strong>
        <p>
          {confirmed
            ? "At least 3 of 4 timeframes match the selected direction. This is technical confirmation, not a guarantee."
            : "Do not treat these calculated levels as a confirmed trade entry. Wait for multi-timeframe agreement."}
        </p>
      </div>

      <h3 style={{ color: signalColor(plan.direction) }}>
        {plan.direction} — Illustrative Levels
      </h3>

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
        Risk per unit: ${fmt(plan.risk)}. Targets use
        hypothetical 1:1, 1:2 and 1:3 risk-reward ratios.
        Fees, slippage and liquidation risk are excluded.
      </p>
    </div>
  );
}

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

  const [alertInfo, setAlertInfo] =
    useState<AlertInfo | null>(null);

  const [alertEnabled, setAlertEnabled] = useState(true);
  const [multiLoading, setMultiLoading] = useState(false);

  const generationRef = useRef(0);
  const selectedBusyRef = useRef(false);
  const multiBusyRef = useRef(false);
  const previousSignalRef = useRef<Signal | null>(null);
  const selectedRef = useRef({ coin, tf });
  const controllerRef = useRef<AbortController | null>(null);

  selectedRef.current = { coin, tf };

  useEffect(() => {
    setNow(Date.now());

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const fetchOne = useCallback(
    async (
      selectedCoin: Coin,
      selectedTf: TF,
      signal?: AbortSignal
    ): Promise<Analysis> => {
      const response = await fetch(
        `/api/analysis?coin=${selectedCoin}&timeframe=${selectedTf}`,
        {
          cache: "no-store",
          signal,
          headers: { Accept: "application/json" },
        }
      );

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

  // Abort old requests when changing coin or timeframe.
  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();

    controllerRef.current?.abort();
    controllerRef.current = controller;

    selectedBusyRef.current = false;
    multiBusyRef.current = false;
    previousSignalRef.current = null;

    setData(null);
    setMulti({});
    setError("");
    setFailures(0);
    setAlertInfo(null);
    setLoading(true);
    setMultiLoading(true);

    async function initialLoad() {
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
        setError("");
      } catch (err) {
        if (
          !controller.signal.aborted &&
          generation === generationRef.current
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Initial analysis failed"
          );
        }
      } finally {
        if (generation === generationRef.current) {
          selectedBusyRef.current = false;
          setLoading(false);
        }
      }
    }

    void initialLoad();

    return () => {
      controller.abort();
      generationRef.current++;
    };
  }, [coin, tf, fetchOne]);

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
        selected.tf,
        controllerRef.current?.signal
      );

      if (generation !== generationRef.current) return;

      const previous = previousSignalRef.current;

      if (
        previous !== null &&
        previous !== result.signal &&
        alertEnabled
      ) {
        setAlertInfo({
          previous,
          current: result.signal,
          coin: selected.coin,
          timeframe: selected.tf,
          test: false,
          time: Date.now(),
        });
      }

      previousSignalRef.current = result.signal;

      setData(result);
      setMulti((old) => ({
        ...old,
        [selected.tf]: result,
      }));

      setError("");
      setFailures(0);
    } catch (err) {
      if (generation !== generationRef.current) return;

      setFailures((old) => Math.min(old + 1, 6));
      setError(
        err instanceof Error
          ? err.message
          : "Refresh failed"
      );
    } finally {
      if (generation === generationRef.current) {
        selectedBusyRef.current = false;
        setRefreshing(false);
      }
    }
  }, [fetchOne, alertEnabled]);

  useEffect(() => {
    if (!auto) return;

    const delay = Math.min(
      POLL_MS * Math.pow(2, failures),
      30000
    );

    const timer = window.setInterval(() => {
      void refreshSelected();
    }, delay);

    return () => window.clearInterval(timer);
  }, [auto, failures, refreshSelected]);

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
    setMultiLoading(true);

    try {
      const other = TFS.filter((item) => item !== selected.tf);

      const results = await Promise.allSettled(
        other.map((item) =>
          fetchOne(
            selected.coin,
            item,
            controllerRef.current?.signal
          )
        )
      );

      if (generation !== generationRef.current) return;

      const next: Partial<Record<TF, Analysis>> = {};

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[other[index]] = result.value;
        }
      });

      setMulti((old) => ({ ...old, ...next }));
    } catch (err) {
      console.error("Multi-timeframe refresh:", err);
    } finally {
      if (generation === generationRef.current) {
        multiBusyRef.current = false;
        setMultiLoading(false);
      }
    }
  }, [fetchOne]);

  useEffect(() => {
    if (!auto) return;

    const first = window.setTimeout(() => {
      void refreshMulti();
    }, 2000);

    const interval = window.setInterval(() => {
      void refreshMulti();
    }, MULTI_MS);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [auto, coin, tf, refreshMulti]);

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

    let overall: Signal = "HOLD";

    if (available.length === 4) {
      if (longCount >= 3) overall = "LONG";
      if (shortCount >= 3) overall = "SHORT";
    }

    return {
      overall,
      longCount,
      shortCount,
      holdCount,
      loaded: available.length,
    };
  }, [multi]);

  const plan = useMemo(
    () => (data ? calculateTradePlan(data) : null),
    [data]
  );

  // Reject old consensus snapshots after 2 minutes.
  const multiFresh =
    confirmation.loaded === 4 &&
    TFS.every((item) => {
      const result = multi[item];
      return (
        result &&
        now - result.fetchedAt < 120000
      );
    });

  const confirmed =
    Boolean(data) &&
    Boolean(plan) &&
    multiFresh &&
    data?.signal === confirmation.overall;

  const latestAge = data
    ? Math.max(0, now - data.latestCandleAt)
    : 0;

  const timeframeSeconds: Record<TF, number> = {
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
  };

  // Candle time may be candle-open time.
  // Therefore this is a heuristic, not exchange verification.
  const stale =
    Boolean(data) &&
    latestAge > timeframeSeconds[tf] * 2000;

  const testAlert = () => {
    setAlertInfo({
      previous: "HOLD",
      current: "SHORT",
      coin,
      timeframe: tf,
      test: true,
      time: Date.now(),
    });
  };

  return (
    <main className="dashboard">
      <div className="container">
        <header className="header">
          <div>
            <h1>Crypto Signal Pro</h1>
            <p>Milestone 9.3 · BTC / ETH Analysis</p>
          </div>
          <span className="liveBadge">
            ● {auto ? "AUTO ON" : "AUTO OFF"}
          </span>
        </header>

        <section className="panel">
          <h2>Select Cryptocurrency</h2>
          <div className="buttonRow">
            {(["BTC", "ETH"] as Coin[]).map((item) => (
              <button
                key={item}
                type="button"
                className={
                  coin === item ? "choice active" : "choice"
                }
                onClick={() => setCoin(item)}
              >
                {item === "BTC" ? "₿ Bitcoin" : "Ξ Ethereum"}
              </button>
            ))}
          </div>

          <h2>Select Timeframe</h2>
          <div className="buttonRow">
            {TFS.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  tf === item ? "choice active" : "choice"
                }
                onClick={() => setTf(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

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

        <section className="panel">
          <div className="sectionTitle">
            <h2>Signal Alerts</h2>
            <span className="muted small">
              {alertEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <div className="controlRow">
            <label className="autoLabel">
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(event) =>
                  setAlertEnabled(event.target.checked)
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
            <div className="alertBox" role="status">
              <strong>
                {alertInfo.test
                  ? "TEST ALERT — NOT A REAL SIGNAL"
                  : "SIGNAL CHANGED"}
              </strong>

              <p>
                {alertInfo.coin} · {alertInfo.timeframe}:{" "}
                {alertInfo.previous} → {alertInfo.current}
              </p>

              <p className="muted small">
                {timeIST(alertInfo.time)}
              </p>

              <button
                type="button"
                className="smallButton"
                onClick={() => setAlertInfo(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <p className="muted small">
            Test Alert only checks the on-screen notification.
            It does not change live trading signals or send
            orders. Alerts work while this page is running.
          </p>
        </section>

        {data && (
          <>
            <section className="panel">
              <div className="sectionTitle">
                <h2>{coin} Market Overview</h2>
                <span
                  className="signalBadge"
                  style={{
                    color: signalColor(data.signal),
                    borderColor: signalColor(data.signal),
                  }}
                >
                  {data.signal}
                </span>
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
                  {refreshing ? "Refreshing..." : "Refresh Now"}
                </button>
              </div>

              <p className="muted small">
                Selected timeframe refresh attempts every
                second. Actual data updates depend on the API.
              </p>
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>API Data Freshness</h2>
                <span
                  className="signalBadge"
                  style={{
                    color: stale ? colors.red : colors.green,
                    borderColor: stale
                      ? colors.red
                      : colors.green,
                  }}
                >
                  {stale ? "OLD CANDLE" : "CANDLE AGE OK"}
                </span>
              </div>

              <div className="metricsGrid">
                <Metric
                  label="API Response Received"
                  value={timeIST(data.fetchedAt)}
                />
                <Metric
                  label="Latest Candle Timestamp"
                  value={timeIST(data.latestCandleAt)}
                />
                <Metric
                  label="Latest Candle Age"
                  value={ageText(latestAge)}
                  color={stale ? colors.red : colors.green}
                />
                <Metric
                  label="Source Update Timestamp"
                  value={timeIST(data.sourceUpdatedAt)}
                />
              </div>

              <p className="muted small">
                API Response Received shows when the browser
                received the analysis. It does not prove a new
                exchange price. Latest candle timestamp may
                represent candle opening time. Source timestamp
                appears only if supplied by the backend.
              </p>
            </section>

            <section className="panel">
              <h2>Trade Confirmation Gate</h2>

              <div className="gateSummary">
                <span
                  className="signalBadge"
                  style={{
                    color: confirmed
                      ? colors.green
                      : colors.yellow,
                    borderColor: confirmed
                      ? colors.green
                      : colors.yellow,
                  }}
                >
                  {confirmed
                    ? "CONFIRMED"
                    : "NOT CONFIRMED"}
                </span>

                <span className="muted small">
                  Consensus: {confirmation.overall}
                </span>
              </div>

              <TradingLevels
                plan={plan}
                confirmed={confirmed}
                pending={
                  confirmation.loaded < 4 ||
                  !multiFresh
                }
              />
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>Candlestick Chart</h2>
                <span className="muted">
                  {Math.min(zoom, data.candles.length)} candles
                </span>
              </div>

              <div className="buttonRow">
                <button
                  type="button"
                  className="smallButton"
                  onClick={() =>
                    setZoom((old) => Math.max(15, old - 15))
                  }
                >
                  + Zoom In
                </button>
                <button
                  type="button"
                  className="smallButton"
                  onClick={() =>
                    setZoom((old) => Math.min(150, old + 15))
                  }
                >
                  − Zoom Out
                </button>
              </div>

              <Chart
                data={data}
                count={zoom}
                plan={plan}
              />
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>Multi-Timeframe Confirmation</h2>
                <span
                  className="signalBadge"
                  style={{
                    color: signalColor(confirmation.overall),
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
                    <div className="timeframeCard" key={item}>
                      <strong>{item}</strong>
                      <strong
                        style={{
                          color: result
                            ? signalColor(result.signal)
                            : colors.muted,
                        }}
                      >
                        {result?.signal || "LOADING"}
                      </strong>
                      <small>
                        {result
                          ? `$${fmt(result.price)}`
                          : "Awaiting data"}
                      </small>
                      <small>
                        {result
                          ? `Fetched ${ageText(
                              Math.max(0, now - result.fetchedAt)
                            )}`
                          : "—"}
                      </small>
                    </div>
                  );
                })}
              </div>

              <div className="metricsGrid">
                <Metric
                  label="LONG"
                  value={String(confirmation.longCount)}
                  color={colors.green}
                />
                <Metric
                  label="SHORT"
                  value={String(confirmation.shortCount)}
                  color={colors.red}
                />
                <Metric
                  label="HOLD"
                  value={String(confirmation.holdCount)}
                  color={colors.yellow}
                />
                <Metric
                  label="Loaded"
                  value={`${confirmation.loaded}/4`}
                />
              </div>

              <p className="muted small">
                {multiLoading
                  ? "Updating timeframe snapshots..."
                  : "Timeframe snapshots refresh approximately every 60 seconds."}
                Confirmation requires 3 matching LONG or SHORT
                signals, all 4 loaded, and snapshots younger
                than 2 minutes.
              </p>
            </section>

            <section className="panel">
              <h2>Technical Indicators</h2>

              <div className="metricsGrid">
                <Metric
                  label="RSI"
                  value={fmt(data.rsi)}
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
                  value={fmt(data.macd.histogram, 4)}
                />
                <Metric
                  label="EMA 20"
                  value={`$${fmt(data.ema20)}`}
                  color="#fbbf24"
                />
                <Metric
                  label="EMA 50"
                  value={`$${fmt(data.ema50)}`}
                  color={colors.purple}
                />
                <Metric
                  label="Support"
                  value={`$${fmt(data.support)}`}
                  color={colors.green}
                />
                <Metric
                  label="Resistance"
                  value={`$${fmt(data.resistance)}`}
                  color={colors.red}
                />
              </div>
            </section>
          </>
        )}

        <footer>
          <strong>Crypto Signal Pro · Milestone 9.3</strong>
          <p>
            Educational technical analysis only. Confirmation
            is rule-based, not a prediction of profitability.
            Cryptocurrency trading carries substantial risk.
            No orders are placed by this dashboard.
          </p>
        </footer>
      </div>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          max-width: 100%;
          overflow-x: hidden;
        }

        body {
          background: #07111f;
        }

        .dashboard {
          min-height: 100vh;
          width: 100%;
          max-width: 100vw;
          overflow-x: hidden;
          background: #07111f;
          color: #e2e8f0;
          font-family: Arial, Helvetica, sans-serif;
          padding: 18px 12px 40px;
        }

        .container {
          width: 100%;
          max-width: 1100px;
          margin: auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
        }

        h1 {
          font-size: clamp(24px, 5vw, 35px);
          margin: 0 0 10px;
          color: #f8fafc;
        }

        h2 {
          font-size: 18px;
          margin: 0 0 16px;
        }

        h3 {
          font-size: 16px;
          margin: 16px 0;
        }

        p {
          line-height: 1.6;
        }

        .header p {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
        }

        .panel {
          background: #0d1a2b;
          border: 1px solid #26384f;
          border-radius: 16px;
          padding: 17px;
          margin-bottom: 16px;
          min-width: 0;
        }

        .panel h2:not(:first-child) {
          margin-top: 20px;
        }

        .sectionTitle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 15px;
        }

        .sectionTitle h2 {
          margin: 0;
        }

        .buttonRow,
        .controlRow {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 14px;
        }

        .controlRow {
          justify-content: space-between;
        }

        button {
          cursor: pointer;
          font-family: inherit;
        }

        .choice,
        .smallButton {
          background: #14243a;
          color: #e2e8f0;
          border: 1px solid #36506e;
          border-radius: 10px;
          padding: 12px 15px;
          font-size: 13px;
          font-weight: 700;
        }

        .choice.active {
          background: #2563eb;
          border-color: #60a5fa;
          color: #fff;
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .liveBadge,
        .signalBadge {
          display: inline-flex;
          align-items: center;
          padding: 8px 11px;
          border: 1px solid #22c55e;
          border-radius: 999px;
          color: #4ade80;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .price {
          font-size: clamp(30px, 8vw, 48px);
          font-weight: 800;
          color: #f8fafc;
          overflow-wrap: anywhere;
          margin: 14px 0;
        }

        .muted {
          color: #94a3b8;
        }

        .small {
          font-size: 12px;
        }

        .autoLabel {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
        }

        .autoLabel input {
          width: 18px;
          height: 18px;
          accent-color: #2563eb;
        }

        .metricsGrid,
        .timeframeGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 14px 0;
        }

        .metric,
        .timeframeCard {
          min-width: 0;
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 12px;
          padding: 14px;
        }

        .metric span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          margin-bottom: 12px;
        }

        .metric strong {
          display: block;
          font-size: 17px;
          overflow-wrap: anywhere;
        }

        .timeframeCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .timeframeCard small {
          color: #94a3b8;
          overflow-wrap: anywhere;
        }

        .gate {
          border: 1px solid;
          border-radius: 12px;
          padding: 14px;
          margin: 15px 0;
        }

        .gate p {
          font-size: 13px;
          margin-bottom: 0;
        }

        .confirmedGate {
          color: #4ade80;
          border-color: #22c55e;
          background: #10271e;
        }

        .holdGate {
          color: #facc15;
          border-color: #a16207;
          background: #28220f;
        }

        .gateSummary {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 10px;
        }

        .chartBox {
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          background: #101b2d;
          border-radius: 12px;
        }

        .chartSvg {
          display: block;
          width: 100%;
          height: auto;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 12px;
          font-size: 12px;
        }

        .notice,
        .errorBox,
        .alertBox {
          padding: 15px;
          border-radius: 12px;
          margin-bottom: 15px;
        }

        .notice {
          background: #14243a;
        }

        .errorBox {
          background: #351c2a;
          border: 1px solid #fb7185;
        }

        .alertBox {
          margin-top: 15px;
          background: #17263c;
          border: 1px solid #facc15;
        }

        footer {
          text-align: center;
          padding: 18px 5px;
          font-size: 12px;
          color: #94a3b8;
        }

        footer strong {
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
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .choice {
            flex: 1;
            text-align: center;
            padding: 11px 9px;
          }

          .metric,
          .timeframeCard {
            padding: 12px;
          }

          .metric strong {
            font-size: 16px;
          }

          .header {
            gap: 8px;
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
        }
      `}</style>
    </main>
  );
}
