
'use client';

import { useEffect, useState } from 'react';

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Analysis = {
  signal: 'LONG' | 'SHORT' | 'HOLD';
  support: number;
  resistance: number;
  rsi: number;
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
  };
  ema20: number;
  ema50: number;
  ema200: number;
  plan: null | {
    entry: number;
    stopLoss: number;
    target1: number;
    target2: number;
    riskReward1: number;
    riskReward2: number;
  };
};

type Result = {
  coin: string;
  symbol: string;
  timeframe: string;
  price: number;
  updatedAt: string;
  lastCandleAt: number;
  candles: Candle[];
  analysis: Analysis;
};

const fmt = (n: number | null | undefined) =>
  n == null
    ? '—'
    : n.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      });

function CandleChart({ candles }: { candles: Candle[] }) {
  const data = candles.slice(-55);

  if (!data.length) return null;

  const min = Math.min(...data.map(c => c.low));
  const max = Math.max(...data.map(c => c.high));
  const span = Math.max(max - min, 0.0001);
  const y = (price: number) =>
    230 - ((price - min) / span) * 210;

  const width = 780;
  const step = width / data.length;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 800 270"
        role="img"
        aria-label="Historical completed candlestick chart"
        className="w-full min-w-[300px]"
      >
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <line
              x1="8"
              x2="790"
              y1={20 + i * 52.5}
              y2={20 + i * 52.5}
              stroke="#334155"
            />
            <text
              x="8"
              y={15 + i * 52.5}
              fill="#94a3b8"
              fontSize="11"
            >
              {fmt(max - span * i / 4)}
            </text>
          </g>
        ))}

        {data.map((c, i) => {
          const x = 10 + (i + 0.5) * step;
          const color =
            c.close >= c.open ? '#22c55e' : '#fb7185';
          const top = Math.min(y(c.open), y(c.close));

          return (
            <g key={c.time}>
              <line
                x1={x}
                x2={x}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1.4"
              />
              <rect
                x={x - Math.max(2, step * 0.32)}
                y={top}
                width={Math.max(4, step * 0.64)}
                height={Math.max(
                  1.5,
                  Math.abs(y(c.open) - y(c.close))
                )}
                fill={color}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Home() {
  const [coin, setCoin] = useState('BTC');
  const [timeframe, setTimeframe] = useState('15m');
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setData(null);
    setError('');
    setLoading(true);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/analysis?coin=${coin}&timeframe=${timeframe}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const body = await response.json();

        if (!response.ok) {
          throw new Error(
            body.error || `HTTP ${response.status}`
          );
        }

        if (active) {
          setData(body as Result);
          setError('');
        }
      } catch (e) {
        if (active && !controller.signal.aborted) {
          setError(
            e instanceof Error ? e.message : 'Connection failed'
          );
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    const timer = setInterval(() => {
      if (active) void load();
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }, [coin, timeframe]);

  const a = data?.analysis;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-cyan-400">
            ₿ Crypto Signal Pro
          </h1>
          <p className="text-sm text-slate-400">
            Delta Exchange India · Public market-data analysis
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {['BTC', 'ETH'].map(v => (
            <button
              key={v}
              onClick={() => setCoin(v)}
              className={`rounded-lg px-5 py-3 ${
                coin === v ? 'bg-cyan-600' : 'bg-slate-800'
              }`}
            >
              {v}
            </button>
          ))}

          <span className="ml-auto text-sm text-slate-400">
            Timeframe
          </span>

          <select
            aria-label="Timeframe"
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="rounded-lg bg-slate-800 p-3"
          >
            {['5m', '15m', '1h', '4h'].map(tf => (
              <option key={tf}>{tf}</option>
            ))}
          </select>
        </div>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            {coin}USD · Latest ticker snapshot
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <strong className="text-3xl">
              {data ? `$${fmt(data.price)}` : '—'}
            </strong>

            <span
              className={`rounded-lg px-3 py-2 font-semibold ${
                a?.signal === 'LONG'
                  ? 'bg-green-800'
                  : a?.signal === 'SHORT'
                  ? 'bg-red-800'
                  : 'bg-slate-700 text-yellow-300'
              }`}
            >
              {a?.signal ?? 'NO DATA'}
            </span>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {loading && !data
              ? 'Connecting to market data…'
              : data
              ? `Received ${new Date(
                  data.updatedAt
                ).toLocaleTimeString()} · Auto-refresh every 15 seconds`
              : 'Disconnected'}
          </p>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-red-950 p-3 text-sm text-red-200"
            >
              Data unavailable: {error}. No signal is being issued.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="font-semibold">
            Candlestick chart · Completed candles only
          </h2>

          {data ? (
            <CandleChart candles={data.candles} />
          ) : (
            <p className="py-12 text-center text-slate-400">
              Waiting for valid historical candles
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-slate-400">Support</p>
            <p className="mt-3 text-xl font-bold text-green-400">
              {a ? `$${fmt(a.support)}` : '—'}
            </p>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-slate-400">Resistance</p>
            <p className="mt-3 text-xl font-bold text-rose-400">
              {a ? `$${fmt(a.resistance)}` : '—'}
            </p>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="mb-3 font-semibold">
            Technical indicators
          </h2>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['RSI (14)', a?.rsi],
              ['MACD line', a?.macd.line],
              ['MACD signal', a?.macd.signal],
              ['MACD histogram', a?.macd.histogram],
              ['EMA 20', a?.ema20],
              ['EMA 50', a?.ema50],
              ['EMA 200', a?.ema200],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg bg-slate-800 p-3"
              >
                <p className="text-slate-400">{label}</p>
                <strong>
                  {fmt(value as number | null | undefined)}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="font-semibold">
            Hypothetical trade levels
          </h2>

          {a?.plan ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {[
                ['Entry', a.plan.entry],
                ['Stop loss', a.plan.stopLoss],
                ['Target 1 (1.5R)', a.plan.target1],
                ['Target 2 (2R)', a.plan.target2],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-slate-400">{label}</p>
                  <strong>${fmt(value as number)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-yellow-300">
              No setup: HOLD or market data unavailable.
            </p>
          )}
        </section>

        <p className="text-xs text-slate-400">
          Informational analysis only. Not financial advice.
          Polling is not a tick-by-tick stream; prices may be
          delayed. Signals are unvalidated heuristics.
          No automatic trading.
        </p>
      </div>
    </main>
  );
}
