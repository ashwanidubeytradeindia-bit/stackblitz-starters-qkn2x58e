
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
  macd: { line: number; signal: number; histogram: number };
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
  priceType: string;
  lastPrice: number | null;
  closePrice: number | null;
  markPrice: number | null;
  spotPrice: number | null;
  sourceAt: number | null;
  receivedAt: number;
  tickerFresh: boolean;
  tradeVerified: boolean;
};

type AlertItem = {
  id: number;
  coin: Coin;
  tf: TF;
  from: Signal;
  to: Signal;
  test: boolean;
  at: number;
};

const TFS: TF[] = ["5m", "15m", "1h", "4h"];
const SECONDS: Record<TF, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
};

const REFRESH_MS = 1000;
const MULTI_MS = 60000;
const MAX_SNAPSHOT_AGE = 120000;

function numeric(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function optionalNumber(v: unknown): number | null {
  const n = numeric(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function money(v: unknown, digits = 2): string {
  const n = numeric(v);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
}

function timestamp(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && !/^\d+(\.\d+)?$/.test(v)) {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  const n = numeric(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e11 ? n * 1000 : n >= 1e14 ? n / 1000 : n;
}

function dateText(v: number | null): string {
  if (v === null) return "Unavailable";
  return new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ageText(v: number | null, now: number): string {
  if (v === null) return "Unavailable";
  const s = Math.floor((now - v) / 1000);
  if (s < -5) return `Clock difference ${Math.abs(s)}s`;
  if (s < 60) return `${Math.max(0, s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function signalColor(s: Signal): string {
  return s === "LONG"
    ? "#22c55e"
    : s === "SHORT"
    ? "#fb7185"
    : "#facc15";
}

function normalizeAnalysis(raw: any, coin: Coin, tf: TF): Analysis {
  if (!raw || raw.error) {
    throw new Error(String(raw?.error || "Invalid analysis response"));
  }

  const candles: Candle[] = (Array.isArray(raw.candles) ? raw.candles : [])
    .map((c: any) => ({
      time: numeric(c.time),
      open: numeric(c.open),
      high: numeric(c.high),
      low: numeric(c.low),
      close: numeric(c.close),
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
    throw new Error("Insufficient candle data");
  }

  const price = numeric(raw.price);
  const support = numeric(raw.support);
  const resistance = numeric(raw.resistance);

  if (
    ![price, support, resistance].every(Number.isFinite) ||
    price <= 0
  ) {
    throw new Error("Invalid analysis price or levels");
  }

  return {
    coin,
    symbol: String(raw.symbol || `${coin}USD`),
    timeframe: tf,
    price,
    signal:
      raw.signal === "LONG" || raw.signal === "SHORT"
        ? raw.signal
        : "HOLD",
    support,
    resistance,
    rsi: numeric(raw.rsi),
    macd: {
      line: numeric(raw.macd?.line),
      signal: numeric(raw.macd?.signal),
      histogram: numeric(raw.macd?.histogram),
    },
    ema20: numeric(raw.ema20),
    ema50: numeric(raw.ema50),
    candles,
    receivedAt: Date.now(),
    sourceAt: timestamp(
      raw.sourceTimestamp ??
      raw.sourceAt ??
      raw.updatedAt ??
      raw.timestamp
    ),
  };
}

function normalizeTicker(raw: any, coin: Coin): Ticker {
  if (!raw || raw.error) {
    throw new Error(String(raw?.error || "Invalid ticker response"));
  }

  const price = numeric(raw.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Ticker price unavailable");
  }

  return {
    coin,
    symbol: String(raw.symbol || `${coin}USD`),
    price,
    priceType: String(raw.priceType || "unknown"),
    lastPrice: optionalNumber(raw.lastPrice),
    closePrice: optionalNumber(raw.closePrice),
    markPrice: optionalNumber(raw.markPrice),
    spotPrice: optionalNumber(raw.spotPrice),
    sourceAt: timestamp(raw.sourceTimestamp),
    receivedAt: Date.now(),
    tickerFresh: raw.tickerFresh === true,
    tradeVerified: raw.isLiveTradeVerified === true,
  };
}

function ema(candles: Candle[], period: number): (number | null)[] {
  const output: (number | null)[] = candles.map(() => null);
  if (candles.length < period) return output;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;

  let previous = sum / period;
  output[period - 1] = previous;

  const k = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    previous = candles[i].close * k + previous * (1 - k);
    output[i] = previous;
  }
  return output;
}

function tradePlan(data: Analysis) {
  if (data.signal === "HOLD") return null;

  const recent = data.candles.slice(-14);
  const avgRange =
    recent.reduce((sum, c) => sum + c.high - c.low, 0) /
    Math.max(1, recent.length);

  const entry = data.price;
  const minimumRisk = Math.max(avgRange * 1.5, entry * 0.002);

  const stop =
    data.signal === "LONG"
      ? Math.min(
          data.support < entry
            ? data.support - avgRange * 0.2
            : entry - minimumRisk,
          entry - minimumRisk
        )
      : Math.max(
          data.resistance > entry
            ? data.resistance + avgRange * 0.2
            : entry + minimumRisk,
          entry + minimumRisk
        );

  const risk = Math.abs(entry - stop);
  const direction = data.signal === "LONG" ? 1 : -1;

  const t1 = entry + direction * risk;
  const t2 = entry + direction * risk * 2;
  const t3 = entry + direction * risk * 3;

  if (
    !Number.isFinite(risk) ||
    risk <= 0 ||
    stop <= 0 ||
    Math.min(t1, t2, t3) <= 0
  ) {
    return null;
  }

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
      <span>{label}</span>
      <strong style={{ color: color || "#e2e8f0" }}>{value}</strong>
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
  plan: ReturnType<typeof tradePlan>;
}) {
  const candles = data.candles.slice(-count);
  const line20 = ema(data.candles, 20).slice(-count);
  const line50 = ema(data.candles, 50).slice(-count);

  const W = 900;
  const H = 400;
  const L = 15;
  const R = 125;
  const T = 20;
  const B = 42;
  const plotW = W - L - R;
  const plotH = H - T - B;

  const levels = [
    { id: "PRICE", value: data.price, color: "#60a5fa" },
    { id: "SUP", value: data.support, color: "#22c55e" },
    { id: "RES", value: data.resistance, color: "#fb7185" },
  ];

  if (plan) {
    levels.push(
      { id: "SL", value: plan.stop, color: "#fb7185" },
      { id: "T1", value: plan.t1, color: "#4ade80" },
      { id: "T2", value: plan.t2, color: "#22c55e" },
      { id: "T3", value: plan.t3, color: "#10b981" }
    );
  }

  const values = [
    ...candles.flatMap((c) => [c.low, c.high]),
    ...line20.filter((v): v is number => v !== null),
    ...line50.filter((v): v is number => v !== null),
    ...levels.map((v) => v.value),
  ];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.08, max * 0.0001);
  const low = min - pad;
  const high = max + pad;

  const y = (v: number) => T + ((high - v) / (high - low)) * plotH;
  const slot = plotW / candles.length;
  const x = (i: number) => L + slot * (i + 0.5);

  function makePath(values: (number | null)[]) {
    let result = "";
    let started = false;
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        started = false;
        return;
      }
      result += `${started ? "L" : "M"}${x(i)},${y(v)} `;
      started = true;
    });
    return result;
  }

  const sorted = levels
    .map((v) => ({ ...v, position: y(v.value) }))
    .sort((a, b) => a.position - b.position);

  const labelPositions: Record<string, number> = {};

  sorted.forEach((v, i) => {
    const previous =
      i === 0 ? T - 15 : labelPositions[sorted[i - 1].id];
    labelPositions[v.id] = Math.max(v.position, previous + 18, T + 8);
  });

  if (sorted.length) {
    const last = sorted[sorted.length - 1];
    const overflow = labelPositions[last.id] - (H - B - 8);
    if (overflow > 0) {
      sorted.forEach((v) => {
        labelPositions[v.id] -= overflow;
      });
    }
  }

  return (
    <div className="chartBox">
      <svg viewBox={`0 0 ${W} ${H}`} className="chartSvg" role="img" aria-label="Candlestick chart">
        <rect width={W} height={H} fill="#101b2d" />

        {Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4).map(
          (v, i) => (
            <g key={i}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                stroke="#29384e"
                strokeDasharray="4 5"
              />
              <text x={W - R + 6} y={y(v) + 4} fill="#94a3b8" fontSize="11">
                {money(v, 1)}
              </text>
            </g>
          )
        )}

        {candles.map((c, i) => {
          const color = c.close >= c.open ? "#22c55e" : "#ef4444";
          const top = Math.min(y(c.open), y(c.close));
          const body = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));
          const bodyWidth = Math.max(2, slot * 0.6);

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
                y={top}
                width={bodyWidth}
                height={body}
                fill={color}
              />
            </g>
          );
        })}

        <path d={makePath(line20)} fill="none" stroke="#fbbf24" strokeWidth="2.2" />
        <path d={makePath(line50)} fill="none" stroke="#a78bfa" strokeWidth="2.2" />

        {levels.map((level) => (
          <g key={level.id}>
            <line
              x1={L}
              x2={W - R}
              y1={y(level.value)}
              y2={y(level.value)}
              stroke={level.color}
              strokeWidth="1.6"
              strokeDasharray="6 5"
            />
            <rect
              x={W - R}
              y={labelPositions[level.id] - 9}
              width={R - 3}
              height={18}
              rx={3}
              fill="#24364f"
            />
            <text
              x={W - R + 5}
              y={labelPositions[level.id] + 4}
              fill={level.color}
              fontSize="11"
              fontWeight="bold"
            >
              {level.id} {money(level.value, 1)}
            </text>
          </g>
        ))}

        {candles.map((c, i) => {
          const step = Math.max(1, Math.ceil(candles.length / 6));
          if (i % step !== 0) return null;
          const at = timestamp(c.time);

          return (
            <text
              key={`time-${i}`}
              x={x(i)}
              y={H - 12}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {at
                ? new Date(at).toLocaleTimeString("en-IN", {
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
  const [multi, setMulti] = useState<Partial<Record<TF, Analysis>>>({});
  const [auto, setAuto] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [zoom, setZoom] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tickerError, setTickerError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [unchanged, setUnchanged] = useState(0);
  const [lastPriceChange, setLastPriceChange] = useState<number | null>(null);
  const [health, setHealth] = useState({
    success: 0,
    failed: 0,
    lastMs: null as number | null,
    lastSuccess: null as number | null,
  });

  const generation = useRef(0);
  const selectedBusy = useRef(false);
  const tickerBusy = useRef(false);
  const multiBusy = useRef(false);
  const selectionRef = useRef({ coin, tf });
  const previousSignal = useRef<Signal | null>(null);
  const previousPrice = useRef<number | null>(null);
  const alertCounter = useRef(0);
  const alertsEnabledRef = useRef(alertsEnabled);

  selectionRef.current = { coin, tf };
  alertsEnabledRef.current = alertsEnabled;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const recordHealth = useCallback((success: boolean, ms: number) => {
    setHealth((old) => ({
      success: old.success + (success ? 1 : 0),
      failed: old.failed + (success ? 0 : 1),
      lastMs: ms,
      lastSuccess: success ? Date.now() : old.lastSuccess,
    }));
  }, []);

  const getAnalysis = useCallback(
    async (c: Coin, t: TF, signal?: AbortSignal) => {
      const start = performance.now();

      try {
        const response = await fetch(
          `/api/analysis?coin=${c}&timeframe=${t}`,
          { cache: "no-store", signal }
        );
        const raw = await response.json();

        if (!response.ok) {
          throw new Error(String(raw?.error || `HTTP ${response.status}`));
        }

        const result = normalizeAnalysis(raw, c, t);
        recordHealth(true, Math.round(performance.now() - start));
        return result;
      } catch (e) {
        if (!signal?.aborted) {
          recordHealth(false, Math.round(performance.now() - start));
        }
        throw e;
      }
    },
    [recordHealth]
  );

  const getTicker = useCallback(
    async (c: Coin, signal?: AbortSignal) => {
      const start = performance.now();

      try {
        const response = await fetch(`/api/ticker?coin=${c}`, {
          cache: "no-store",
          signal,
        });
        const raw = await response.json();

        if (!response.ok) {
          throw new Error(String(raw?.error || `HTTP ${response.status}`));
        }

        const result = normalizeTicker(raw, c);
        recordHealth(true, Math.round(performance.now() - start));
        return result;
      } catch (e) {
        if (!signal?.aborted) {
          recordHealth(false, Math.round(performance.now() - start));
        }
        throw e;
      }
    },
    [recordHealth]
  );

  const addAlert = useCallback(
    (from: Signal, to: Signal, test: boolean, c: Coin, t: TF) => {
      alertCounter.current += 1;

      setAlerts((old) =>
        [
          {
            id: alertCounter.current,
            coin: c,
            tf: t,
            from,
            to,
            test,
            at: Date.now(),
          },
          ...old,
        ].slice(0, 30)
      );
    },
    []
  );

  const applyAnalysis = useCallback(
    (result: Analysis) => {
      const old = previousSignal.current;

      if (old && old !== result.signal && alertsEnabledRef.current) {
        addAlert(old, result.signal, false, result.coin, result.timeframe);
      }
      previousSignal.current = result.signal;

      if (previousPrice.current === result.price) {
        setUnchanged((v) => v + 1);
      } else {
        if (previousPrice.current !== null) {
          setLastPriceChange(Date.now());
        }
        setUnchanged(0);
      }

      previousPrice.current = result.price;
      setData(result);
      setMulti((oldMulti) => ({
        ...oldMulti,
        [result.timeframe]: result,
      }));
      setError("");
    },
    [addAlert]
  );

  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();

    previousSignal.current = null;
    previousPrice.current = null;
    selectedBusy.current = true;
    tickerBusy.current = false;
    multiBusy.current = false;

    setData(null);
    setTicker(null);
    setMulti({});
    setError("");
    setTickerError("");
    setLoading(true);
    setUnchanged(0);
    setLastPriceChange(null);

    async function load() {
      try {
        const result = await getAnalysis(coin, tf, controller.signal);
        if (id === generation.current && !controller.signal.aborted) {
          applyAnalysis(result);
        }
      } catch (e) {
        if (id === generation.current && !controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Analysis unavailable");
        }
      } finally {
        if (id === generation.current) {
          selectedBusy.current = false;
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
      generation.current++;
    };
  }, [coin, tf, getAnalysis, applyAnalysis]);

  const refreshSelected = useCallback(async () => {
    if (selectedBusy.current || document.visibilityState === "hidden") return;

    const id = generation.current;
    const selected = selectionRef.current;
    selectedBusy.current = true;

    try {
      const result = await getAnalysis(selected.coin, selected.tf);
      if (id === generation.current) applyAnalysis(result);
    } catch (e) {
      if (id === generation.current) {
        setError(e instanceof Error ? e.message : "Analysis refresh failed");
      }
    } finally {
      if (id === generation.current) selectedBusy.current = false;
    }
  }, [getAnalysis, applyAnalysis]);

  const refreshTicker = useCallback(async () => {
    if (tickerBusy.current || document.visibilityState === "hidden") return;

    const id = generation.current;
    const selected = selectionRef.current;
    tickerBusy.current = true;

    try {
      const result = await getTicker(selected.coin);
      if (id === generation.current) {
        setTicker(result);
        setTickerError("");
      }
    } catch (e) {
      if (id === generation.current) {
        setTickerError(e instanceof Error ? e.message : "Ticker unavailable");
      }
    } finally {
      if (id === generation.current) tickerBusy.current = false;
    }
  }, [getTicker]);

  const refreshMulti = useCallback(async () => {
    if (multiBusy.current || document.visibilityState === "hidden") return;

    const id = generation.current;
    const selected = selectionRef.current;
    multiBusy.current = true;

    try {
      const others = TFS.filter((t) => t !== selected.tf);
      const results = await Promise.allSettled(
        others.map((t) => getAnalysis(selected.coin, t))
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
  }, [getAnalysis]);

  useEffect(() => {
    if (!auto) return;

    const selectedTimer = window.setInterval(
      () => void refreshSelected(),
      REFRESH_MS
    );
    const tickerTimer = window.setInterval(
      () => void refreshTicker(),
      REFRESH_MS
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

  const plan = useMemo(() => (data ? tradePlan(data) : null), [data]);

  const consensus = useMemo(() => {
    const loaded = TFS.map((t) => multi[t]).filter(
      (v): v is Analysis => Boolean(v)
    );

    const long = loaded.filter((v) => v.signal === "LONG").length;
    const short = loaded.filter((v) => v.signal === "SHORT").length;
    const hold = loaded.filter((v) => v.signal === "HOLD").length;

    const fresh =
      loaded.length === 4 &&
      loaded.every(
        (v) =>
          now - v.receivedAt >= 0 &&
          now - v.receivedAt < MAX_SNAPSHOT_AGE
      );

    let signal: Signal = "HOLD";

    if (fresh) {
      if (long >= 3) signal = "LONG";
      else if (short >= 3) signal = "SHORT";
    }

    return { loaded: loaded.length, long, short, hold, fresh, signal };
  }, [multi, now]);

  const lastCandleAt =
    data && data.candles.length
      ? timestamp(data.candles[data.candles.length - 1].time)
      : null;

  const candleAge =
    lastCandleAt === null ? null : now - lastCandleAt;

  const candleFresh =
    candleAge !== null &&
    candleAge >= -5000 &&
    candleAge < SECONDS[tf] * 2000;

  const tickerReceivedFresh =
    ticker !== null &&
    now >= ticker.receivedAt &&
    now - ticker.receivedAt < 10000;

  const sourceFresh =
    ticker !== null &&
    ticker.sourceAt !== null &&
    now - ticker.sourceAt >= -10000 &&
    now - ticker.sourceAt <= 30000;

  const tickerFresh =
    tickerReceivedFresh &&
    sourceFresh &&
    ticker?.tickerFresh === true;

  const priceDifference =
    data && ticker
      ? (Math.abs(data.price - ticker.price) / ticker.price) * 100
      : null;

  const priceAligned =
    priceDifference !== null && priceDifference <= 0.5;

  const directionMatches =
    data !== null &&
    data.signal !== "HOLD" &&
    data.signal === consensus.signal;

  // This gate confirms only the configured technical rules.
  // It never asserts that an actual exchange trade was verified.
  const confirmed =
    directionMatches &&
    consensus.fresh &&
    candleFresh &&
    tickerFresh &&
    priceAligned;

  const totalRequests = health.success + health.failed;
  const errorRate =
    totalRequests > 0 ? (health.failed / totalRequests) * 100 : 0;

  const latestAlert = alerts[0];

  return (
    <main className="dashboard">
      <div className="container">
        <header className="header">
          <div>
            <h1>Crypto Signal Pro</h1>
            <p className="muted">Milestone 9.4.3 · BTC / ETH Analysis</p>
          </div>
          <span className={`badge ${auto ? "green" : "yellow"}`}>
            {auto ? "● AUTO ON" : "AUTO OFF"}
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
            Alerts appear while this page is open. Test alerts are not
            real trading signals.
          </p>

          {latestAlert && (
            <div className={`alertBox ${latestAlert.test ? "test" : ""}`}>
              <strong>
                {latestAlert.test
                  ? "TEST ALERT — NOT A REAL SIGNAL"
                  : "SIGNAL CHANGE"}
              </strong>
              <p>
                {latestAlert.coin} · {latestAlert.tf}:{" "}
                {latestAlert.from} → {latestAlert.to}
              </p>
              <p className="muted small">{dateText(latestAlert.at)}</p>
              <button
                className="smallButton"
                onClick={() =>
                  setAlerts((old) =>
                    old.filter((v) => v.id !== latestAlert.id)
                  )
                }
              >
                Dismiss
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <h2>{coin} Market Overview</h2>
            {data && (
              <span
                className="badge"
                style={{
                  color: signalColor(data.signal),
                  borderColor: signalColor(data.signal),
                }}
              >
                {data.signal}
              </span>
            )}
          </div>

          {loading && <p className="muted">Loading market analysis...</p>}
          {error && <p className="warning">Analysis: {error}</p>}

          {data && (
            <>
              <div className="price">${money(data.price)}</div>
              <p className="muted">
                {data.symbol} · {tf} · Analysis Price
              </p>
            </>
          )}

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
            Analysis and ticker polling are attempted every second
            while the page is visible. Other timeframes refresh every
            60 seconds. Exchange data may update less frequently.
          </p>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <h2>Live Price Verification</h2>
            <span className={`badge ${tickerFresh ? "green" : "yellow"}`}>
              {tickerFresh ? "FRESH TICKER" : "NOT VERIFIED"}
            </span>
          </div>

          <div className="metricsGrid">
            <Metric
              label="Analysis Price"
              value={data ? `$${money(data.price)}` : "—"}
            />
            <Metric
              label="Independent Ticker Price"
              value={ticker ? `$${money(ticker.price)}` : "Unavailable"}
              color="#60a5fa"
            />
            <Metric
              label="Ticker Price Type"
              value={ticker?.priceType || "Unavailable"}
              color="#facc15"
            />
            <Metric
              label="Price Difference"
              value={
                priceDifference === null
                  ? "—"
                  : `${money(priceDifference, 3)}%`
              }
              color={priceAligned ? "#22c55e" : "#facc15"}
            />
            <Metric
              label="Ticker Received"
              value={ageText(ticker?.receivedAt ?? null, now)}
            />
            <Metric
              label="Ticker Source Time"
              value={dateText(ticker?.sourceAt ?? null)}
            />
            <Metric
              label="Ticker Source Age"
              value={ageText(ticker?.sourceAt ?? null, now)}
            />
            <Metric
              label="Last Traded Price"
              value={
                ticker?.lastPrice
                  ? `$${money(ticker.lastPrice)}`
                  : "Not supplied"
              }
            />
            <Metric
              label="Close Price"
              value={
                ticker?.closePrice
                  ? `$${money(ticker.closePrice)}`
                  : "Not supplied"
              }
            />
            <Metric
              label="Mark Price"
              value={
                ticker?.markPrice
                  ? `$${money(ticker.markPrice)}`
                  : "Not supplied"
              }
            />
            <Metric
              label="Spot Price"
              value={
                ticker?.spotPrice
                  ? `$${money(ticker.spotPrice)}`
                  : "Not supplied"
              }
            />
            <Metric
              label="New Trade Independently Verified"
              value={ticker?.tradeVerified ? "YES" : "NO"}
              color={ticker?.tradeVerified ? "#22c55e" : "#facc15"}
            />
          </div>

          {tickerError && <p className="warning">Ticker API: {tickerError}</p>}

          <p className="muted small">
            Fresh ticker means the exchange-reported ticker timestamp
            is recent. A close price is not proof of a new trade.
            This API does not independently verify executions.
          </p>
        </section>

        <section className="panel">
          <div className="sectionTitle">
            <h2>API Data Freshness</h2>
            <span className={`badge ${candleFresh ? "green" : "yellow"}`}>
              {candleFresh ? "CANDLE AGE OK" : "CHECK CANDLE"}
            </span>
          </div>

          <div className="metricsGrid">
            <Metric
              label="Analysis Response Received"
              value={dateText(data?.receivedAt ?? null)}
            />
            <Metric
              label="Latest Candle Timestamp"
              value={dateText(lastCandleAt)}
            />
            <Metric
              label="Latest Candle Age"
              value={ageText(lastCandleAt, now)}
              color={candleFresh ? "#22c55e" : "#facc15"}
            />
            <Metric
              label="Analysis Source Timestamp"
              value={dateText(data?.sourceAt ?? null)}
            />
            <Metric
              label="Browser Response Age"
              value={ageText(data?.receivedAt ?? null, now)}
            />
            <Metric label="Selected Candle Interval" value={tf} />
          </div>

          <p className="muted small">
            Candle timestamps may indicate candle opening times.
            Browser receipt time is not an exchange trade timestamp.
          </p>
        </section>

        {data && (
          <>
            <section className="panel">
              <h2>Trade Confirmation Gate</h2>

              <div className="gateRow">
                <span className={`badge ${confirmed ? "green" : "yellow"}`}>
                  {confirmed ? "RULES PASSED" : "NOT CONFIRMED"}
                </span>
                <span className="muted">
                  Consensus: {consensus.signal}
                </span>
              </div>

              <div className={`gateBox ${confirmed ? "gateGood" : "gateWarning"}`}>
                <strong>
                  {confirmed
                    ? "RULE-BASED CONFIRMATION PASSED"
                    : "⚠ UNCONFIRMED SETUP"}
                </strong>
                <p>
                  {confirmed
                    ? "The configured directional, candle, ticker timestamp and price-alignment checks passed. This is not independent trade verification."
                    : "Wait for matching directional signals, fresh snapshots, acceptable candle age and fresh ticker data."}
                </p>
              </div>

              <div className="checks">
                <div>4 Timeframes: {consensus.loaded}/4</div>
                <div>Snapshots Fresh: {consensus.fresh ? "YES" : "NO"}</div>
                <div>Consensus: {consensus.signal}</div>
                <div>Candle Age OK: {candleFresh ? "YES" : "NO"}</div>
                <div>Ticker Timestamp Fresh: {tickerFresh ? "YES" : "NO"}</div>
                <div>Price Difference ≤ 0.5%: {priceAligned ? "YES" : "NO"}</div>
                <div>Direction Matches: {directionMatches ? "YES" : "NO"}</div>
                <div>
                  New Trade Verified: {ticker?.tradeVerified ? "YES" : "NO"}
                </div>
              </div>

              {plan ? (
                <>
                  <h3 style={{ color: signalColor(data.signal) }}>
                    {data.signal} — Illustrative Levels
                  </h3>
                  <div className="metricsGrid">
                    <Metric label="Entry Point" value={`$${money(plan.entry)}`} color="#60a5fa" />
                    <Metric label="Stop Loss" value={`$${money(plan.stop)}`} color="#fb7185" />
                    <Metric label="Target 1 · 1:1" value={`$${money(plan.t1)}`} color="#4ade80" />
                    <Metric label="Target 2 · 1:2" value={`$${money(plan.t2)}`} color="#22c55e" />
                    <Metric label="Target 3 · 1:3" value={`$${money(plan.t3)}`} color="#10b981" />
                    <Metric label="Risk per Unit" value={`$${money(plan.risk)}`} />
                  </div>
                  <p className="muted small">
                    Hypothetical levels, not trade instructions. Fees,
                    slippage, funding and liquidation risk are excluded.
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

              <div className="buttonRow">
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
                  className="badge"
                  style={{
                    color: signalColor(consensus.signal),
                    borderColor: signalColor(consensus.signal),
                  }}
                >
                  {consensus.signal}
                </span>
              </div>

              <div className="timeframeGrid">
                {TFS.map((t) => {
                  const item = multi[t];
                  return (
                    <div className="timeframeCard" key={t}>
                      <strong>{t}</strong>
                      <strong
                        style={{
                          color: item
                            ? signalColor(item.signal)
                            : "#94a3b8",
                        }}
                      >
                        {item?.signal || "LOADING"}
                      </strong>
                      <span className="muted">
                        {item ? `$${money(item.price)}` : "Awaiting data"}
                      </span>
                      <span className="muted small">
                        {item
                          ? `Fetched ${ageText(item.receivedAt, now)}`
                          : ""}
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
                Consensus requires all four snapshots, at least three
                matching directional signals and snapshots under two
                minutes old.
              </p>
            </section>

            <section className="panel">
              <h2>Technical Indicators</h2>
              <div className="metricsGrid">
                <Metric label="RSI" value={money(data.rsi)} />
                <Metric label="MACD Line" value={money(data.macd.line, 4)} />
                <Metric label="MACD Signal" value={money(data.macd.signal, 4)} />
                <Metric label="MACD Histogram" value={money(data.macd.histogram, 4)} />
                <Metric label="EMA 20" value={`$${money(data.ema20)}`} color="#fbbf24" />
                <Metric label="EMA 50" value={`$${money(data.ema50)}`} color="#a78bfa" />
                <Metric label="Support" value={`$${money(data.support)}`} color="#22c55e" />
                <Metric label="Resistance" value={`$${money(data.resistance)}`} color="#fb7185" />
              </div>
            </section>
          </>
        )}

        <section className="panel">
          <h2>API Health Monitoring</h2>
          <div className="metricsGrid">
            <Metric label="Successful Requests" value={String(health.success)} color="#22c55e" />
            <Metric label="Failed Requests" value={String(health.failed)} color="#fb7185" />
            <Metric label="Error Rate" value={`${money(errorRate, 1)}%`} />
            <Metric
              label="Last Response Time"
              value={health.lastMs === null ? "—" : `${health.lastMs} ms`}
            />
            <Metric label="Last Successful Response" value={dateText(health.lastSuccess)} />
            <Metric label="Requests Observed" value={String(totalRequests)} />
            <Metric label="Unchanged Analysis Responses" value={String(unchanged)} />
            <Metric label="Last Analysis Price Change" value={dateText(lastPriceChange)} />
          </div>
          <p className="muted small">
            Browser-session request statistics only. They do not
            measure exchange-wide availability.
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
            <p className="muted">No alerts recorded in this session.</p>
          ) : (
            <div className="historyList">
              {alerts.map((a) => (
                <div className="historyItem" key={a.id}>
                  <strong
                    style={{
                      color: a.test ? "#facc15" : signalColor(a.to),
                    }}
                  >
                    {a.test ? "TEST" : "SIGNAL CHANGE"}
                  </strong>
                  <span>
                    {a.coin} · {a.tf}: {a.from} → {a.to}
                  </span>
                  <span className="muted small">{dateText(a.at)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="muted small">
            Alert history is stored only while this page remains open.
            Reloading clears it.
          </p>
        </section>

        <footer className="footer">
          <strong>Crypto Signal Pro · Milestone 9.4.3</strong>
          <p>
            Educational technical analysis only. No profitability
            guarantee. No orders or trades are placed.
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
        .sectionTitle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 15px;
        }
        .sectionTitle h2 { margin: 0; }
        .buttonRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 18px;
        }
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
        .choice.active {
          background: #2563eb;
          border-color: #60a5fa;
        }
        .badge {
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
        .badge.green { color: #22c55e; border-color: #22c55e; }
        .badge.yellow { color: #facc15; border-color: #facc15; }
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
        .checkLabel {
          display: flex;
          align-items: center;
          gap: 9px;
          font-weight: 700;
        }
        .checkLabel input {
          width: 18px;
          height: 18px;
          accent-color: #2563eb;
        }
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
        .metric span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.5;
        }
        .metric strong {
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
        .gateRow {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .gateBox {
          padding: 15px;
          border-radius: 12px;
          margin-bottom: 15px;
        }
        .gateBox strong {
          display: block;
          font-size: 16px;
        }
        .gateBox p { margin-bottom: 0; }
        .gateGood {
          background: #102b23;
          border: 1px solid #22c55e;
          color: #4ade80;
        }
        .gateWarning {
          background: #29230e;
          border: 1px solid #a16207;
          color: #facc15;
        }
        .checks {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          font-size: 12px;
          margin-bottom: 15px;
          color: #cbd5e1;
        }
        .warning {
          color: #facc15;
          font-size: 13px;
          overflow-wrap: anywhere;
        }
        .alertBox {
          background: #17263c;
          border: 1px solid #fb7185;
          padding: 15px;
          border-radius: 12px;
          margin-top: 15px;
        }
        .alertBox.test { border-color: #facc15; }
        .alertBox .smallButton { margin-top: 12px; }
        .historyList {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .historyItem {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 13px;
          background: #101b2d;
          border: 1px solid #304560;
          border-radius: 10px;
          font-size: 13px;
        }
        .footer {
          text-align: center;
          color: #94a3b8;
          padding: 15px 6px;
          font-size: 12px;
        }
        .footer strong { color: #e2e8f0; }
        @media (max-width: 700px) {
          .dashboard { padding: 12px 9px 30px; }
          .panel { padding: 13px; border-radius: 13px; }
          .metricsGrid, .timeframeGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .choice {
            flex: 1;
            text-align: center;
            padding: 11px 8px;
          }
          .metric { padding: 12px; }
          .metric strong { font-size: 15px; }
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
