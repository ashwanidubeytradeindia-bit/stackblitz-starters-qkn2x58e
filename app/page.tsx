
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
  sourceAt: number | null;
};

type Ticker = {
  coin: Coin;
  symbol: string;
  price: number;
  sourceAt: number | null;
  receivedAt: number;
};

type AlertEvent = {
  id: number;
  coin: Coin;
  tf: TF;
  from: Signal;
  to: Signal;
  test: boolean;
  at: number;
};

type Health = {
  success: number;
  failed: number;
  lastMs: number | null;
  lastSuccess: number | null;
};

type TradePlan = {
  entry: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  risk: number;
};

const TFS: TF[] = ["5m", "15m", "1h", "4h"];
const TF_SECONDS: Record<TF, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
};

const SELECTED_MS = 1000;
const MULTI_MS = 60000;
const TICKER_MS = 1000;
const SNAPSHOT_MAX_AGE = 120000;

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function fmt(value: unknown, digits = 2): string {
  const n = numberValue(value);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
}

function parseTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const n = numberValue(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e11 ? n * 1000 : n;
}

function timeLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not supplied";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ageLabel(timestamp: number | null, now: number): string {
  if (timestamp === null) return "Unavailable";
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < -5) return `Clock difference ${Math.abs(seconds)}s`;
  if (seconds < 0) return "0s ago";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function colorOf(signal: Signal): string {
  return signal === "LONG"
    ? "#22c55e"
    : signal === "SHORT"
    ? "#fb7185"
    : "#facc15";
}

function normalizeAnalysis(raw: any, coin: Coin, tf: TF): Analysis {
  if (!raw || typeof raw !== "object" || raw.error) {
    throw new Error(String(raw?.error || "Invalid analysis response"));
  }

  const candles: Candle[] = (Array.isArray(raw.candles) ? raw.candles : [])
    .map((c: any) => ({
      time: numberValue(c.time),
      open: numberValue(c.open),
      high: numberValue(c.high),
      low: numberValue(c.low),
      close: numberValue(c.close),
    }))
    .filter(
      (c: Candle) =>
        [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) &&
        c.time > 0 &&
        c.low > 0 &&
        c.low <= c.high &&
        c.open >= c.low &&
        c.open <= c.high &&
        c.close >= c.low &&
        c.close <= c.high
    )
    .sort((a: Candle, b: Candle) => a.time - b.time);

  if (candles.length < 2) {
    throw new Error("Analysis API returned insufficient candles");
  }

  const price = numberValue(raw.price);
  const support = numberValue(raw.support);
  const resistance = numberValue(raw.resistance);

  if (![price, support, resistance].every(Number.isFinite) || price <= 0) {
    throw new Error("Invalid price, support or resistance");
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
    rsi: numberValue(raw.rsi),
    macd: {
      line: numberValue(raw.macd?.line),
      signal: numberValue(raw.macd?.signal),
      histogram: numberValue(raw.macd?.histogram),
    },
    ema20: numberValue(raw.ema20),
    ema50: numberValue(raw.ema50),
    candles,
    receivedAt: Date.now(),
    sourceAt: parseTimestamp(
      raw.sourceTimestamp ??
      raw.sourceAt ??
      raw.updatedAt ??
      raw.timestamp
    ),
  };
}

function ema(candles: Candle[], period: number): (number | null)[] {
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

function calculatePlan(data: Analysis): TradePlan | null {
  if (data.signal === "HOLD") return null;

  const entry = data.price;
  const recent = data.candles.slice(-14);

  // Approximate average candle range, not formal ATR.
  const avgRange =
    recent.reduce((sum, c) => sum + (c.high - c.low), 0) /
    Math.max(1, recent.length);

  const minRisk = Math.max(avgRange * 1.5, entry * 0.002);
  const stop =
    data.signal === "LONG"
      ? Math.min(
          data.support < entry ? data.support - avgRange * 0.2 : entry - minRisk,
          entry - minRisk
        )
      : Math.max(
          data.resistance > entry
            ? data.resistance + avgRange * 0.2
            : entry + minRisk,
          entry + minRisk
        );

  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0 || stop <= 0) return null;

  const direction = data.signal === "LONG" ? 1 : -1;
  const t1 = entry + direction * risk;
  const t2 = entry + direction * risk * 2;
  const t3 = entry + direction * risk * 3;

  if ([t1, t2, t3].some((n) => n <= 0)) return null;

  return { entry, stop, t1, t2, t3, risk };
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
      <strong className="metricValue" style={{ color: color || "#e2e8f0" }}>
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
  const candles = data.candles.slice(-count);
  const ema20 = ema(data.candles, 20).slice(-count);
  const ema50 = ema(data.candles, 50).slice(-count);

  const width = 900;
  const height = 400;
  const left = 15;
  const right = 125;
  const top = 20;
  const bottom = 42;
  const pw = width - left - right;
  const ph = height - top - bottom;

  const levels = [
    { name: "PRICE", value: data.price, color: "#60a5fa" },
    { name: "SUP", value: data.support, color: "#22c55e" },
    { name: "RES", value: data.resistance, color: "#fb7185" },
  ];

  if (plan) {
    levels.push(
      { name: "SL", value: plan.stop, color: "#fb7185" },
      { name: "T1", value: plan.t1, color: "#4ade80" },
      { name: "T2", value: plan.t2, color: "#22c55e" },
      { name: "T3", value: plan.t3, color: "#10b981" }
    );
  }

  const values = [
    ...candles.flatMap((c) => [c.low, c.high]),
    ...ema20.filter((v): v is number => v !== null),
    ...ema50.filter((v): v is number => v !== null),
    ...levels.map((l) => l.value),
  ];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.08, max * 0.0001);
  const lo = min - pad;
  const hi = max + pad;

  const y = (v: number) => top + ((hi - v) / (hi - lo)) * ph;
  const slot = pw / candles.length;
  const x = (i: number) => left + slot * (i + 0.5);

  function path(series: (number | null)[]): string {
    let output = "";
    let started = false;
    series.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        started = false;
        return;
      }
      output += `${started ? "L" : "M"}${x(i)},${y(v)} `;
      started = true;
    });
    return output;
  }

  const sorted = [...levels]
    .map((l) => ({ ...l, actualY: y(l.value) }))
    .sort((a, b) => a.actualY - b.actualY);

  const labels: Record<string, number> = {};
  sorted.forEach((l, i) => {
    const prev = i ? labels[sorted[i - 1].name] : top - 15;
    labels[l.name] = Math.max(l.actualY, prev + 18, top + 8);
  });

  if (sorted.length) {
    const last = sorted[sorted.length - 1];
    const overflow = labels[last.name] - (height - bottom - 8);
    if (overflow > 0) {
      sorted.forEach((l) => {
        labels[l.name] -= overflow;
      });
    }
  }

  return (
    <div className="chartBox">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chartSvg"
        role="img"
        aria-label="BTC or ETH candlestick chart with EMA and trading levels"
      >
        <rect width={width} height={height} fill="#101b2d" />

        {Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4).map(
          (value, i) => (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                stroke="#29384e"
                strokeDasharray="4 5"
              />
              <text
                x={width - right + 6}
                y={y(value) + 4}
                fill="#94a3b8"
                fontSize="11"
              >
                {fmt(value, 1)}
              </text>
            </g>
          )
        )}

        {candles.map((c, i) => {
          const green = c.close >= c.open;
          const color = green ? "#22c55e" : "#ef4444";
          const bodyTop = Math.min(y(c.open), y(c.close));
          const bodyHeight = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));

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
                x={x(i) - Math.max(2, slot * 0.6) / 2}
                y={bodyTop}
                width={Math.max(2, slot * 0.6)}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })}

        <path d={path(ema20)} fill="none" stroke="#fbbf24" strokeWidth="2.2" />
        <path d={path(ema50)} fill="none" stroke="#a78bfa" strokeWidth="2.2" />

        {levels.map((level) => (
          <g key={level.name}>
            <line
              x1={left}
              x2={width - right}
              y1={y(level.value)}
              y2={y(level.value)}
              stroke={level.color}
              strokeWidth="1.6"
              strokeDasharray="6 5"
            />
            <rect
              x={width - right}
              y={labels[level.name] - 9}
              width={right - 3}
              height={18}
              rx={3}
              fill="#24364f"
            />
            <text
              x={width - right + 5}
              y={labels[level.name] + 4}
              fill={level.color}
              fontSize="11"
              fontWeight="bold"
            >
              {level.name} {fmt(level.value, 1)}
            </text>
          </g>
        ))}

        {candles.map((c, i) => {
          const step = Math.max(1, Math.ceil(candles.length / 6));
          if (i % step !== 0) return null;
          const timestamp = parseTimestamp(c.time);
          return (
            <text
              key={`time-${i}`}
              x={x(i)}
              y={height - 12}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {timestamp
                ? new Date(timestamp).toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </text>
          );
        })}
      </svg>

      <div className="legend">
        <span style={{ color: "#fbbf24" }}>━ EMA 20</span>
        <span style={{ color: "#a78bfa" }}>━ EMA 50</span>
        <span style={{ color: "#22c55e" }}>━ Support</span>
        <span style={{ color: "#fb7185" }}>━ Resistance / SL</span>
        <span style={{ color: "#60a5fa" }}>━ Price</span>
        {plan && <span style={{ color: "#4ade80" }}>━ Targets</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [tf, setTf] = useState<TF>("15m");
  const [data, setData] = useState<Analysis | null>(null);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [tickerError, setTickerError] = useState("");
  const [multi, setMulti] = useState<Partial<Record<TF, Analysis>>>({});
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [zoom, setZoom] = useState(60);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [health, setHealth] = useState<Health>({
    success: 0,
    failed: 0,
    lastMs: null,
    lastSuccess: null,
  });
  const [unchanged, setUnchanged] = useState(0);
  const [lastPriceChange, setLastPriceChange] = useState<number | null>(null);

  const generation = useRef(0);
  const selectedBusy = useRef(false);
  const multiBusy = useRef(false);
  const tickerBusy = useRef(false);
  const previousSignal = useRef<Signal | null>(null);
  const previousPrice = useRef<number | null>(null);
  const currentSelection = useRef({ coin, tf });
  const alertId = useRef(0);

  currentSelection.current = { coin, tf };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const recordHealth = useCallback((ok: boolean, elapsed: number) => {
    setHealth((old) => ({
      success: old.success + (ok ? 1 : 0),
      failed: old.failed + (ok ? 0 : 1),
      lastMs: elapsed,
      lastSuccess: ok ? Date.now() : old.lastSuccess,
    }));
  }, []);

  const fetchAnalysis = useCallback(
    async (c: Coin, t: TF, signal?: AbortSignal) => {
      const started = performance.now();
      let recorded = false;
      try {
        const response = await fetch(
          `/api/analysis?coin=${c}&timeframe=${t}`,
          { cache: "no-store", signal }
        );
        const raw = await response.json();
        if (!response.ok) {
          throw new Error(String(raw?.error || `Analysis HTTP ${response.status}`));
        }
        const result = normalizeAnalysis(raw, c, t);
        recordHealth(true, Math.round(performance.now() - started));
        recorded = true;
        return result;
      } catch (err) {
        if (!recorded && !signal?.aborted) {
          recordHealth(false, Math.round(performance.now() - started));
        }
        throw err;
      }
    },
    [recordHealth]
  );

  const fetchTicker = useCallback(
    async (c: Coin, signal?: AbortSignal): Promise<Ticker> => {
      const started = performance.now();
      try {
        const response = await fetch(`/api/ticker?coin=${c}`, {
          cache: "no-store",
          signal,
        });
        const raw = await response.json();
        if (!response.ok) {
          throw new Error(String(raw?.error || `Ticker HTTP ${response.status}`));
        }
        const price = numberValue(raw.price);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error("Ticker returned invalid price");
        }
        recordHealth(true, Math.round(performance.now() - started));
        return {
          coin: c,
          symbol: String(raw.symbol || `${c}USD`),
          price,
          sourceAt: parseTimestamp(raw.sourceTimestamp),
          receivedAt: Date.now(),
        };
      } catch (err) {
        if (!signal?.aborted) {
          recordHealth(false, Math.round(performance.now() - started));
        }
        throw err;
      }
    },
    [recordHealth]
  );

  const addAlert = useCallback(
    (from: Signal, to: Signal, test: boolean, c: Coin, t: TF) => {
      alertId.current += 1;
      const item: AlertEvent = {
        id: alertId.current,
        coin: c,
        tf: t,
        from,
        to,
        test,
        at: Date.now(),
      };
      setAlerts((old) => [item, ...old].slice(0, 30));
    },
    []
  );

  const applySelected = useCallback(
    (result: Analysis) => {
      const previous = previousSignal.current;

      if (previous && previous !== result.signal && alertsEnabled) {
        addAlert(previous, result.signal, false, result.coin, result.timeframe);
      }
      previousSignal.current = result.signal;

      if (previousPrice.current === result.price) {
        setUnchanged((old) => old + 1);
      } else {
        if (previousPrice.current !== null) setLastPriceChange(Date.now());
        setUnchanged(0);
      }
      previousPrice.current = result.price;

      setData(result);
      setMulti((old) => ({ ...old, [result.timeframe]: result }));
      setError("");
    },
    [alertsEnabled, addAlert]
  );

  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();

    selectedBusy.current = true;
    multiBusy.current = false;
    tickerBusy.current = false;
    previousSignal.current = null;
    previousPrice.current = null;

    setData(null);
    setTicker(null);
    setMulti({});
    setError("");
    setTickerError("");
    setLoading(true);
    setUnchanged(0);
    setLastPriceChange(null);

    const load = async () => {
      try {
        const result = await fetchAnalysis(coin, tf, controller.signal);
        if (id !== generation.current || controller.signal.aborted) return;
        applySelected(result);
      } catch (err) {
        if (id === generation.current && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Analysis unavailable");
        }
      } finally {
        if (id === generation.current) {
          selectedBusy.current = false;
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      generation.current++;
    };
    // applySelected intentionally omitted to avoid reloading on alert toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin, tf, fetchAnalysis]);

  const refreshSelected = useCallback(async () => {
    if (selectedBusy.current || document.visibilityState === "hidden") return;

    const id = generation.current;
    const selected = currentSelection.current;
    selectedBusy.current = true;

    try {
      const result = await fetchAnalysis(selected.coin, selected.tf);
      if (id === generation.current) applySelected(result);
    } catch (err) {
      if (id === generation.current) {
        setError(err instanceof Error ? err.message : "Analysis refresh failed");
      }
    } finally {
      if (id === generation.current) selectedBusy.current = false;
    }
  }, [fetchAnalysis, applySelected]);

  const refreshTicker = useCallback(async () => {
    if (tickerBusy.current || document.visibilityState === "hidden") return;

    const id = generation.current;
    const selected = currentSelection.current;
    tickerBusy.current = true;

    try {
      const result = await fetchTicker(selected.coin);
      if (id === generation.current) {
        setTicker(result);
        setTickerError("");
      }
    } catch (err) {
      if (id === generation.current) {
        setTickerError(err instanceof Error ? err.message : "Ticker unavailable");
      }
    } finally {
      if (id === generation.current) tickerBusy.current = false;
    }
  }, [fetchTicker]);

  const refreshMulti = useCallback(async () => {
    if (multiBusy.current || document.visibilityState === "hidden") return;

    const id = generation.current;
    const selected = currentSelection.current;
    multiBusy.current = true;

    try {
      const others = TFS.filter((t) => t !== selected.tf);
      const results = await Promise.allSettled(
        others.map((t) => fetchAnalysis(selected.coin, t))
      );

      if (id !== generation.current) return;

      const next: Partial<Record<TF, Analysis>> = {};
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          next[others[i]] = result.value;
        }
      });
      setMulti((old) => ({ ...old, ...next }));
    } finally {
      if (id === generation.current) multiBusy.current = false;
    }
  }, [fetchAnalysis]);

  useEffect(() => {
    if (!auto) return;

    const selectedTimer = window.setInterval(
      () => void refreshSelected(),
      SELECTED_MS
    );
    const tickerTimer = window.setInterval(
      () => void refreshTicker(),
      TICKER_MS
    );
    const multiTimer = window.setInterval(
      () => void refreshMulti(),
      MULTI_MS
    );
    const initialTicker = window.setTimeout(
      () => void refreshTicker(),
      300
    );
    const initialMulti = window.setTimeout(
      () => void refreshMulti(),
      2000
    );

    return () => {
      window.clearInterval(selectedTimer);
      window.clearInterval(tickerTimer);
      window.clearInterval(multiTimer);
      window.clearTimeout(initialTicker);
      window.clearTimeout(initialMulti);
    };
  }, [auto, coin, tf, refreshSelected, refreshTicker, refreshMulti]);

  const plan = useMemo(() => (data ? calculatePlan(data) : null), [data]);

  const consensus = useMemo(() => {
    const loaded = TFS.map((t) => multi[t]).filter(
      (v): v is Analysis => Boolean(v)
    );
    const long = loaded.filter((v) => v.signal === "LONG").length;
    const short = loaded.filter((v) => v.signal === "SHORT").length;
    const hold = loaded.filter((v) => v.signal === "HOLD").length;
    const fresh = loaded.every(
      (v) => now - v.receivedAt >= 0 && now - v.receivedAt < SNAPSHOT_MAX_AGE
    );

    let signal: Signal = "HOLD";
    if (loaded.length === 4 && fresh) {
      if (long >= 3) signal = "LONG";
      else if (short >= 3) signal = "SHORT";
    }
    return { loaded: loaded.length, long, short, hold, fresh, signal };
  }, [multi, now]);

  const lastCandleAt = data?.candles.length
    ? parseTimestamp(data.candles[data.candles.length - 1].time)
    : null;

  const candleAge = lastCandleAt === null ? null : now - lastCandleAt;
  const candleWindow = TF_SECONDS[tf] * 1000;
  const candleFresh =
    candleAge !== null &&
    candleAge >= -5000 &&
    candleAge < candleWindow * 2;

  const tickerFresh =
    ticker !== null &&
    now - ticker.receivedAt >= 0 &&
    now - ticker.receivedAt < 10000 &&
    (ticker.sourceAt === null ||
      Math.abs(now - ticker.sourceAt) < 30000);

  const priceDifference =
    data && ticker
      ? Math.abs(data.price - ticker.price) / ticker.price * 100
      : null;

  const priceAligned =
    priceDifference !== null && priceDifference <= 0.5;

  const confirmed =
    Boolean(data) &&
    data!.signal !== "HOLD" &&
    data!.signal === consensus.signal &&
    consensus.fresh &&
    candleFresh &&
    tickerFresh &&
    priceAligned;

  const totalRequests = health.success + health.failed;
  const errorRate = totalRequests
    ? (health.failed / totalRequests) * 100
    : 0;

  return (
    <main className="dashboard">
      <div className="container">
        <header className="header">
          <div>
            <h1>Crypto Signal Pro</h1>
            <p className="muted">Milestone 9.4.1 · BTC / ETH Analysis</p>
          </div>
          <span className="statusBadge green">
            ● {auto ? "AUTO ON" : "AUTO OFF"}
          </span>
        </header>

        <section className="panel">
          <h2>Select Cryptocurrency</h2>
          <div className="buttonRow">
            {(["BTC", "ETH"] as Coin[]).map((c) => (
              <button
                key={c}
                className={`choice ${coin === c ? "active" : ""}`}
                onClick={() => setCoin(c)}
              >
                {c === "BTC" ? "₿ Bitcoin" : "Ξ Ethereum"}
              </button>
            ))}
          </div>

          <h2>Select Timeframe</h2>
          <div className="buttonRow">
            {TFS.map((t) => (
              <button
                key={t}
                className={`choice ${tf === t ? "active" : ""}`}
                onClick={() => setTf(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <h2>Signal Alerts</h2>
            <span className="muted">
              {alertsEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="controlRow">
            <label className="checkLabel">
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(e) => setAlertsEnabled(e.target.checked)}
              />
              Signal Change Alert
            </label>
            <button
              className="smallButton"
              onClick={() =>
                addAlert("HOLD", "SHORT", true, coin, tf)
              }
            >
              Test Alert
            </button>
          </div>
          <p className="muted small">
            Alerts appear on screen while this page is open.
            Test Alert does not change real signals or place orders.
          </p>
          {alerts[0] && (
            <div className={`alertBox ${alerts[0].test ? "test" : ""}`}>
              <strong>
                {alerts[0].test
                  ? "TEST ALERT — NOT A REAL SIGNAL"
                  : "SIGNAL CHANGED"}
              </strong>
              <p>
                {alerts[0].coin} · {alerts[0].tf}:{" "}
                {alerts[0].from} → {alerts[0].to}
              </p>
              <span className="muted small">{timeLabel(alerts[0].at)}</span>
              <div>
                <button
                  className="smallButton"
                  onClick={() =>
                    setAlerts((old) =>
                      old.filter((item) => item.id !== alerts[0].id)
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>

        {loading && <div className="panel">Loading analysis...</div>}
        {error && (
          <div className="panel errorBox" role="alert">
            <strong>Analysis API Error</strong>
            <p>{error}</p>
            <button className="smallButton" onClick={() => void refreshSelected()}>
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <section className="panel">
              <div className="sectionTitle">
                <h2>{coin} Market Overview</h2>
                <span
                  className="statusBadge"
                  style={{
                    color: colorOf(data.signal),
                    borderColor: colorOf(data.signal),
                  }}
                >
                  {data.signal}
                </span>
              </div>
              <div className="price">${fmt(data.price)}</div>
              <p className="muted">{data.symbol} · {tf} · Analysis Price</p>
              <div className="controlRow">
                <label className="checkLabel">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                  />
                  Auto Refresh (1 sec)
                </label>
                <button
                  className="smallButton"
                  onClick={() => {
                    void refreshSelected();
                    void refreshTicker();
                    void refreshMulti();
                  }}
                >
                  Refresh Now
                </button>
              </div>
              <p className="muted small">
                Analysis and ticker polling attempt every second while visible.
                Other timeframes refresh every 60 seconds. Exchange updates
                may arrive less frequently.
              </p>
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>Live Price Verification</h2>
                <span className={`statusBadge ${tickerFresh ? "green" : "yellow"}`}>
                  {tickerFresh ? "TICKER RECEIVED" : "NOT VERIFIED"}
                </span>
              </div>
              <div className="metricsGrid">
                <Metric label="Analysis Price" value={`$${fmt(data.price)}`} />
                <Metric
                  label="Independent Ticker Price"
                  value={ticker ? `$${fmt(ticker.price)}` : "Unavailable"}
                  color="#60a5fa"
                />
                <Metric
                  label="Price Difference"
                  value={priceDifference === null ? "—" : `${fmt(priceDifference, 3)}%`}
                  color={priceAligned ? "#22c55e" : "#facc15"}
                />
                <Metric
                  label="Ticker Received"
                  value={ticker ? ageLabel(ticker.receivedAt, now) : "—"}
                />
                <Metric
                  label="Ticker Source Time"
                  value={ticker ? timeLabel(ticker.sourceAt) : "—"}
                />
                <Metric
                  label="Unchanged Analysis Responses"
                  value={String(unchanged)}
                />
                <Metric
                  label="Last Analysis Price Change"
                  value={ageLabel(lastPriceChange, now)}
                />
                <Metric
                  label="Ticker Symbol"
                  value={ticker?.symbol || "—"}
                />
              </div>
              {tickerError && (
                <p className="warning">
                  Ticker API: {tickerError}
                </p>
              )}
              <p className="muted small">
                The ticker is fetched independently from Delta Exchange India.
                A successful response does not prove a new trade occurred.
                Missing source timestamps cannot independently verify
                exchange-side freshness.
              </p>
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>API Data Freshness</h2>
                <span className={`statusBadge ${candleFresh ? "green" : "yellow"}`}>
                  {candleFresh ? "CANDLE AGE OK" : "CHECK CANDLE AGE"}
                </span>
              </div>
              <div className="metricsGrid">
                <Metric
                  label="Analysis Response Received"
                  value={timeLabel(data.receivedAt)}
                />
                <Metric
                  label="Latest Candle Timestamp"
                  value={timeLabel(lastCandleAt)}
                />
                <Metric
                  label="Latest Candle Age"
                  value={ageLabel(lastCandleAt, now)}
                  color={candleFresh ? "#22c55e" : "#facc15"}
                />
                <Metric
                  label="Analysis Source Timestamp"
                  value={timeLabel(data.sourceAt)}
                />
                <Metric
                  label="Browser Response Age"
                  value={ageLabel(data.receivedAt, now)}
                />
                <Metric
                  label="Selected Candle Interval"
                  value={tf}
                />
              </div>
              <p className="muted small">
                Candle timestamps often indicate candle opening time.
                Browser receipt time is not an exchange timestamp.
                Candle freshness is an approximate check, not proof
                of tick-by-tick price freshness.
              </p>
            </section>

            <section className="panel">
              <h2>Trade Confirmation Gate</h2>
              <div className="gateRow">
                <span className={`statusBadge ${confirmed ? "green" : "yellow"}`}>
                  {confirmed ? "RULES PASSED" : "NOT CONFIRMED"}
                </span>
                <span className="muted">Consensus: {consensus.signal}</span>
              </div>

              <div className={`gateBox ${confirmed ? "gateGood" : "gateWarning"}`}>
                <strong>
                  {confirmed
                    ? "RULE-BASED CONFIRMATION PASSED"
                    : "⚠ UNCONFIRMED SETUP"}
                </strong>
                <p>
                  {confirmed
                    ? "Selected signal matches multi-timeframe consensus and the configured freshness and price-alignment checks."
                    : "Wait for matching timeframe signals, acceptable candle age, and independently received ticker data."}
                </p>
              </div>

              <div className="checks">
                <div>4 timeframe snapshots: {consensus.loaded}/4</div>
                <div>Snapshots fresh: {consensus.fresh ? "YES" : "NO"}</div>
                <div>Consensus: {consensus.signal}</div>
                <div>Candle age acceptable: {candleFresh ? "YES" : "NO"}</div>
                <div>Ticker freshness check: {tickerFresh ? "YES" : "NO"}</div>
                <div>Price difference ≤ 0.5%: {priceAligned ? "YES" : "NO"}</div>
              </div>

              {plan ? (
                <>
                  <h3 style={{ color: colorOf(data.signal) }}>
                    {data.signal} — Illustrative Levels
                  </h3>
                  <div className="metricsGrid">
                    <Metric label="Entry Point" value={`$${fmt(plan.entry)}`} color="#60a5fa" />
                    <Metric label="Stop Loss" value={`$${fmt(plan.stop)}`} color="#fb7185" />
                    <Metric label="Target 1 · 1:1" value={`$${fmt(plan.t1)}`} color="#4ade80" />
                    <Metric label="Target 2 · 1:2" value={`$${fmt(plan.t2)}`} color="#22c55e" />
                    <Metric label="Target 3 · 1:3" value={`$${fmt(plan.t3)}`} color="#10b981" />
                    <Metric label="Risk per Unit" value={`$${fmt(plan.risk)}`} />
                  </div>
                  <p className="muted small">
                    Hypothetical risk/reward levels only. Fees, slippage,
                    funding and liquidation risk are excluded.
                  </p>
                </>
              ) : (
                <p className="warning">
                  HOLD signal — no new entry or targets suggested.
                </p>
              )}
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>Candlestick Chart</h2>
                <span className="muted">{zoom} candles</span>
              </div>
              <div className="buttonRow chartButtons">
                <button
                  className="smallButton"
                  onClick={() => setZoom((v) => Math.max(15, v - 15))}
                >
                  + Zoom In
                </button>
                <button
                  className="smallButton"
                  onClick={() => setZoom((v) => Math.min(150, v + 15))}
                >
                  − Zoom Out
                </button>
              </div>
              <Chart data={data} count={zoom} plan={plan} />
            </section>

            <section className="panel">
              <div className="sectionTitle">
                <h2>Multi-Timeframe Confirmation</h2>
                <span
                  className="statusBadge"
                  style={{
                    color: colorOf(consensus.signal),
                    borderColor: colorOf(consensus.signal),
                  }}
                >
                  {consensus.signal}
                </span>
              </div>
              <div className="timeframeGrid">
                {TFS.map((t) => {
                  const result = multi[t];
                  return (
                    <div className="timeframeCard" key={t}>
                      <strong>{t}</strong>
                      <strong style={{ color: result ? colorOf(result.signal) : "#94a3b8" }}>
                        {result?.signal || "LOADING"}
                      </strong>
                      <span className="muted">
                        {result ? `$${fmt(result.price)}` : "Awaiting data"}
                      </span>
                      <span className="muted small">
                        {result ? `Fetched ${ageLabel(result.receivedAt, now)}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="metricsGrid">
                <Metric label="LONG" value={String(consensus.long)} color="#22c55e" />
                <Metric label="SHORT" value={String(consensus.short)} color="#fb7185" />
                <Metric label="HOLD" value={String(consensus.hold)} color="#facc15" />
                <Metric label="Loaded" value={`${consensus.loaded}/4`} />
              </div>
              <p className="muted small">
                Consensus requires all four timeframes, three matching
                directional signals and browser snapshots under two minutes old.
              </p>
            </section>

            <section className="panel">
              <h2>Technical Indicators</h2>
              <div className="metricsGrid">
                <Metric label="RSI" value={fmt(data.rsi)} />
                <Metric label="MACD Line" value={fmt(data.macd.line, 4)} />
                <Metric label="MACD Signal" value={fmt(data.macd.signal, 4)} />
                <Metric label="MACD Histogram" value={fmt(data.macd.histogram, 4)} />
                <Metric label="EMA 20" value={`$${fmt(data.ema20)}`} color="#fbbf24" />
                <Metric label="EMA 50" value={`$${fmt(data.ema50)}`} color="#a78bfa" />
                <Metric label="Support" value={`$${fmt(data.support)}`} color="#22c55e" />
                <Metric label="Resistance" value={`$${fmt(data.resistance)}`} color="#fb7185" />
              </div>
            </section>
          </>
        )}

        <section className="panel">
          <h2>API Health Monitoring</h2>
          <div className="metricsGrid">
            <Metric label="Successful Requests" value={String(health.success)} color="#22c55e" />
            <Metric label="Failed Requests" value={String(health.failed)} color="#fb7185" />
            <Metric label="Error Rate" value={`${fmt(errorRate, 1)}%`} />
            <Metric label="Last Response Time" value={health.lastMs === null ? "—" : `${health.lastMs} ms`} />
            <Metric label="Last Successful Response" value={timeLabel(health.lastSuccess)} />
            <Metric label="Requests Observed" value={String(totalRequests)} />
          </div>
          <p className="muted small">
            Counts cover analysis and ticker requests observed in this
            browser session. They do not measure exchange-wide uptime.
          </p>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <h2>Signal Alert History</h2>
            <button className="smallButton" onClick={() => setAlerts([])}>
              Clear History
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="muted">
              No alerts recorded in this session. Use Test Alert to check.
            </p>
          ) : (
            <div className="historyList">
              {alerts.map((a) => (
                <div className="historyItem" key={a.id}>
                  <strong style={{ color: a.test ? "#facc15" : colorOf(a.to) }}>
                    {a.test ? "TEST" : "LIVE SIGNAL CHANGE"}
                  </strong>
                  <span>{a.coin} · {a.tf}: {a.from} → {a.to}</span>
                  <span className="muted small">{timeLabel(a.at)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="muted small">
            History is kept in memory while this page is open.
            Reloading the page clears it.
          </p>
        </section>

        <footer className="footer">
          <strong>Crypto Signal Pro · Milestone 9.4.1</strong>
          <p>
            Educational technical analysis only. Rule-based confirmation
            does not guarantee profitability. No trades or orders are placed.
          </p>
        </footer>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #07111f; }
        button { font-family: inherit; }
        .dashboard {
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
          background: #07111f;
          color: #e2e8f0;
          padding: 16px 10px 35px;
          font-family: Arial, Helvetica, sans-serif;
        }
        .container { max-width: 1100px; margin: auto; }
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }
        h1 { font-size: clamp(23px, 5vw, 34px); margin: 0 0 8px; }
        h2 { font-size: 18px; margin: 0 0 18px; }
        h3 { font-size: 17px; margin: 22px 0 15px; }
        p { line-height: 1.6; }
        .muted { color: #94a3b8; }
        .small { font-size: 12px; }
        .panel {
          width: 100%;
          min-width: 0;
          background: #0d1a2b;
          border: 1px solid #26384f;
          border-radius: 16px;
          padding: 17px;
          margin-bottom: 16px;
        }
        .panel > h2:not(:first-child) { margin-top: 22px; }
        .sectionTitle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 15px;
        }
        .sectionTitle h2 { margin: 0; }
        .buttonRow { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .choice, .smallButton {
          border: 1px solid #36506e;
          background: #14243a;
          color: #e2e8f0;
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .choice.active { background: #2563eb; border-color: #60a5fa; }
        .statusBadge {
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border: 1px solid #facc15;
          border-radius: 999px;
          color: #facc15;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }
        .statusBadge.green { color: #22c55e; border-color: #22c55e; }
        .statusBadge.yellow { color: #facc15; border-color: #facc15; }
        .price {
          font-size: clamp(30px, 8vw, 46px);
          font-weight: 800;
          overflow-wrap: anywhere;
          margin: 10px 0;
        }
        .controlRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 15px;
        }
        .checkLabel { display: flex; align-items: center; gap: 9px; font-weight: 700; }
        .checkLabel input { width: 18px; height: 18px; accent-color: #2563eb; }
        .metricsGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .metric {
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 12px;
          padding: 14px;
          min-width: 0;
        }
        .metricLabel { color: #94a3b8; font-size: 12px; line-height: 1.5; }
        .metricValue {
          display: block;
          margin-top: 10px;
          font-size: 17px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }
        .timeframeGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        .timeframeCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          padding: 14px;
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 12px;
        }
        .timeframeCard span { overflow-wrap: anywhere; }
        .chartBox { width: 100%; max-width: 100%; overflow: hidden; background: #101b2d; border-radius: 12px; }
        .chartSvg { display: block; width: 100%; height: auto; }
        .legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; font-size: 12px; }
        .chartButtons { margin-bottom: 15px; }
        .gateRow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .gateBox { padding: 15px; border-radius: 12px; margin-bottom: 15px; }
        .gateBox strong { display: block; font-size: 16px; }
        .gateBox p { margin-bottom: 0; }
        .gateGood { background: #102b23; border: 1px solid #22c55e; color: #4ade80; }
        .gateWarning { background: #29230e; border: 1px solid #a16207; color: #facc15; }
        .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: 12px; margin-bottom: 15px; color: #cbd5e1; }
        .warning { color: #facc15; font-size: 13px; overflow-wrap: anywhere; }
        .errorBox { border-color: #fb7185; color: #fb7185; }
        .alertBox { background: #17263c; border: 1px solid #fb7185; padding: 15px; border-radius: 12px; margin-top: 15px; }
        .alertBox.test { border-color: #facc15; }
        .alertBox .smallButton { margin-top: 12px; }
        .historyList { display: flex; flex-direction: column; gap: 9px; }
        .historyItem { display: flex; flex-direction: column; gap: 6px; padding: 13px; background: #101b2d; border: 1px solid #304560; border-radius: 10px; font-size: 13px; }
        .footer { text-align: center; color: #94a3b8; padding: 15px 6px; font-size: 12px; }
        .footer strong { color: #e2e8f0; }
        @media (max-width: 700px) {
          .dashboard { padding: 12px 9px 30px; }
          .panel { padding: 13px; border-radius: 13px; }
          .metricsGrid, .timeframeGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .choice { flex: 1; text-align: center; padding: 11px 8px; }
          .metric { padding: 12px; }
          .metricValue { font-size: 15px; }
        }
        @media (max-width: 380px) {
          .header { flex-direction: column; }
          .panel { padding: 11px; }
          .checks { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
