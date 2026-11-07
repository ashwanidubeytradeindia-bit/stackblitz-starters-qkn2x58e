
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Coin = "BTC" | "ETH";
type Timeframe = "5m" | "15m" | "1h" | "4h";
type Signal = "LONG" | "SHORT" | "HOLD";

type Analysis = {
  coin: Coin;
  symbol: string;
  timeframe: Timeframe;
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
  ema200: number;
  candleCount: number;
  lastCandleTime?: string;
  updatedAt: string;
  status: "connected";
  priceSource?: string;
  analysisType?: string;
};

const COINS: Coin[] = ["BTC", "ETH"];
const TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h"];
const REFRESH_MS = 30_000;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function parseAnalysis(value: unknown): Analysis {
  if (!isRecord(value)) {
    throw new Error("Invalid API response");
  }

  if (value.status !== "connected") {
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : "API disconnected"
    );
  }

  if (!isRecord(value.macd)) {
    throw new Error("MACD data missing");
  }

  const required = [
    "price",
    "support",
    "resistance",
    "rsi",
    "ema20",
    "ema50",
    "ema200",
    "candleCount",
  ];

  if (
    !required.every((key) => isNumber(value[key])) ||
    !["line", "signal", "histogram"].every(
      (key) => isNumber(value.macd[key])
    ) ||
    !COINS.includes(value.coin as Coin) ||
    !TIMEFRAMES.includes(value.timeframe as Timeframe) ||
    !["LONG", "SHORT", "HOLD"].includes(
      String(value.signal)
    ) ||
    typeof value.symbol !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error(
      "Incomplete or invalid indicator data"
    );
  }

  return value as Analysis;
}

function formatNumber(
  value: number,
  digits = 2
): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatTime(value?: string): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "medium",
      });
}

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");

  const [timeframe, setTimeframe] =
    useState<Timeframe>("15m");

  const [data, setData] =
    useState<Analysis | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [autoRefresh, setAutoRefresh] =
    useState(true);

  const requestId = useRef(0);

  const controller =
    useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const id = ++requestId.current;

    controller.current?.abort();

    const abort = new AbortController();
    controller.current = abort;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/analysis?coin=${coin}&timeframe=${timeframe}`,
        {
          cache: "no-store",
          signal: abort.signal,
        }
      );

      const payload: unknown =
        await response.json();

      if (!response.ok) {
        const message =
          isRecord(payload) &&
          typeof payload.error === "string"
            ? payload.error
            : `API HTTP ${response.status}`;

        throw new Error(message);
      }

      const result = parseAnalysis(payload);

      if (
        result.coin !== coin ||
        result.timeframe !== timeframe
      ) {
        throw new Error(
          "API returned a different market or timeframe"
        );
      }

      if (id === requestId.current) {
        setData(result);
      }
    } catch (err) {
      if (
        id !== requestId.current ||
        abort.signal.aborted
      ) {
        return;
      }

      setData(null);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load analysis"
      );
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [coin, timeframe]);

  useEffect(() => {
    setData(null);
    void load();

    return () => {
      controller.current?.abort();
      requestId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !loading
      ) {
        void load();
      }
    }, REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [autoRefresh, load, loading]);

  const signal = data?.signal ?? "HOLD";

  const signalColor =
    signal === "LONG"
      ? "#34d399"
      : signal === "SHORT"
      ? "#fb7185"
      : "#fbbf24";

  return (
    <main className="min-h-screen bg-[#080d19] px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Crypto Signal Pro
            </p>

            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Market Analysis Dashboard
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Delta Exchange India · Completed-candle indicators
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              error
                ? "border-red-700 text-red-300"
                : data
                ? "border-emerald-700 text-emerald-300"
                : "border-slate-600 text-slate-300"
            }`}
          >
            {error
              ? "● Disconnected"
              : data
              ? "● Connected"
              : "● Connecting"}
          </span>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-[#111a2c] p-4 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">

            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">
                Market
              </p>

              <div className="flex gap-2">
                {COINS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={coin === item}
                    onClick={() => setCoin(item)}
                    className={`flex-1 rounded-xl px-4 py-3 font-semibold transition ${
                      coin === item
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">
                Timeframe
              </p>

              <div className="grid grid-cols-4 gap-2">
                {TIMEFRAMES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={timeframe === item}
                    onClick={() => setTimeframe(item)}
                    className={`rounded-xl px-2 py-3 text-sm font-semibold transition ${
                      timeframe === item
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) =>
                  setAutoRefresh(event.target.checked)
                }
                className="h-4 w-4 accent-cyan-500"
              />
              Auto refresh (30 seconds)
            </label>

            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Refreshing…"
                : "↻ Refresh now"}
            </button>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-200"
          >
            <strong>Analysis unavailable:</strong>{" "}
            {error}

            <p className="mt-1 text-red-300/80">
              Check Render deployment, the analysis API
              and Delta candle availability. No trading
              signal is shown while disconnected.
            </p>
          </div>
        )}

        {loading && (
          <p
            role="status"
            className="text-sm text-cyan-300"
          >
            Loading {coin}/{timeframe} analysis…
          </p>
        )}

        {data && !error && (
          <>
            <section className="grid gap-4 sm:grid-cols-2">

              <div className="rounded-2xl border border-slate-800 bg-[#111a2c] p-5">
                <p className="text-sm text-slate-400">
                  {data.symbol} · Last completed candle close
                </p>

                <p className="mt-3 break-all text-3xl font-bold tabular-nums sm:text-4xl">
                  ${formatNumber(data.price)}
                </p>

                <p className="mt-3 text-xs text-slate-400">
                  Not a live executable order price
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#111a2c] p-5">
                <p className="text-sm text-slate-400">
                  Rule-based signal
                </p>

                <p
                  className="mt-3 text-4xl font-extrabold"
                  style={{ color: signalColor }}
                >
                  {signal}
                </p>

                <p className="mt-3 text-xs text-slate-400">
                  Technical indication only · Not a
                  guaranteed trade
                </p>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">

              <div className="rounded-2xl border border-slate-800 bg-[#111a2c] p-5">
                <h2 className="mb-4 text-lg font-semibold">
                  Key price levels
                </h2>

                <Metric
                  label="Support (20 candles)"
                  value={`$${formatNumber(data.support)}`}
                  color="text-emerald-300"
                />

                <Metric
                  label="Resistance (20 candles)"
                  value={`$${formatNumber(data.resistance)}`}
                  color="text-rose-300"
                />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#111a2c] p-5">
                <h2 className="mb-4 text-lg font-semibold">
                  Momentum
                </h2>

                <Metric
                  label="RSI (14)"
                  value={formatNumber(data.rsi)}
                />

                <Metric
                  label="MACD line"
                  value={formatNumber(data.macd.line, 4)}
                />

                <Metric
                  label="MACD signal"
                  value={formatNumber(data.macd.signal, 4)}
                />

                <Metric
                  label="MACD histogram"
                  value={formatNumber(
                    data.macd.histogram,
                    4
                  )}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#111a2c] p-5">
              <h2 className="mb-4 text-lg font-semibold">
                Exponential Moving Averages
              </h2>

              <div className="grid gap-4 sm:grid-cols-3">

                <div className="rounded-xl bg-slate-800/70 p-4">
                  <p className="text-sm text-slate-400">
                    EMA 20
                  </p>

                  <p className="mt-2 text-xl font-bold tabular-nums">
                    ${formatNumber(data.ema20)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800/70 p-4">
                  <p className="text-sm text-slate-400">
                    EMA 50
                  </p>

                  <p className="mt-2 text-xl font-bold tabular-nums">
                    ${formatNumber(data.ema50)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800/70 p-4">
                  <p className="text-sm text-slate-400">
                    EMA 200
                  </p>

                  <p className="mt-2 text-xl font-bold tabular-nums">
                    ${formatNumber(data.ema200)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#111a2c] p-5 text-sm text-slate-300">
              <h2 className="mb-3 text-lg font-semibold text-slate-100">
                Data details
              </h2>

              <Metric
                label="Completed candles"
                value={String(data.candleCount)}
              />

              <Metric
                label="Last candle opened"
                value={formatTime(
                  data.lastCandleTime
                )}
              />

              <Metric
                label="API updated"
                value={formatTime(data.updatedAt)}
              />

              <Metric
                label="Analysis method"
                value={
                  data.analysisType ??
                  "rule_based"
                }
              />
            </section>
          </>
        )}

        <footer className="pb-4 text-center text-xs leading-relaxed text-slate-500">
          Market data may be delayed or unavailable.
          Signals are rule-based, not financial advice.
          Confirm exchange prices and manage risk
          before trading.
        </footer>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  color = "text-slate-100",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-3 last:border-0">
      <span className="text-sm text-slate-400">
        {label}
      </span>

      <span
        className={`break-all text-right font-semibold tabular-nums ${color}`}
      >
        {value}
      </span>
    </div>
  );
}
