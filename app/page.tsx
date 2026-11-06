
"use client";

import { useState } from "react";

export default function Home() {
  const [coin, setCoin] = useState("BTC");
  const [timeframe, setTimeframe] = useState("15m");

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-cyan-400">
          Crypto Signal Pro
        </h1>
        <p className="text-sm text-slate-400">
          BTC / ETH Technical Analysis
        </p>
      </header>

      <div className="mb-4 flex gap-3">
        {["BTC", "ETH"].map((item) => (
          <button
            key={item}
            onClick={() => setCoin(item)}
            className={`rounded-lg px-6 py-3 ${
              coin === item ? "bg-cyan-600" : "bg-slate-800"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="rounded-xl bg-slate-900 p-5">
        <p className="text-sm text-slate-400">
          Selected Market
        </p>
        <h2 className="mt-2 text-3xl font-bold">
          {coin}/USD
        </h2>
        <p className="mt-2 text-yellow-400">
          Live price: Not connected
        </p>
      </section>

      <div className="my-5 flex flex-wrap gap-2">
        {["5m", "15m", "1h", "4h"].map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`rounded-lg px-4 py-2 ${
              timeframe === tf ? "bg-blue-600" : "bg-slate-800"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <section className="rounded-xl bg-slate-900 p-5">
        <h3 className="text-lg font-semibold">
          AI Trading Signal
        </h3>
        <p className="mt-4 text-2xl font-bold text-yellow-400">
          WAIT
        </p>
        <p className="mt-2 text-sm text-slate-400">
          {coin} | {timeframe}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Market analysis is not connected yet.
        </p>
      </section>

      <section className="mt-5 rounded-xl bg-slate-900 p-5">
        <h3 className="font-semibold">Technical Levels</h3>
        <div className="mt-3 space-y-3 text-sm">
          <p>Support: Pending live data</p>
          <p>Resistance: Pending live data</p>
          <p>Stop Loss: Not calculated</p>
          <p>Target: Not calculated</p>
          <p>RSI / MACD / EMA: Pending</p>
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-500">
        Analysis dashboard only. No automatic trades.
      </p>
    </main>
  );
}
