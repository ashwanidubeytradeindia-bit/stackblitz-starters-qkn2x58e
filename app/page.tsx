
"use client";

import { useCallback, useEffect, useState } from "react";

type Coin = "BTC" | "ETH";
type Timeframe = "5m" | "15m" | "1h" | "4h";

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
  atr14?: number;
  adx14?: number;
};

type Analysis = {
  symbol: string;
  signal: string;
  confirmation: string;
  timeframes: Partial<Record<Timeframe, FrameData>>;
  entry?: number | null;
  stop_loss?: number | null;
  target1?: number | null;
  target2?: number | null;
  target3?: number | null;
  confidence?: string;
  method?: string;
};

const FRAMES: Timeframe[] = ["5m", "15m", "1h", "4h"];

function format(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 100000);

      let response: Response;
      try {
        response = await fetch(
          `/api/analyze?coin=${coin}&t=${Date.now()}`,
          { cache: "no-store", signal: controller.signal }
        );
      } finally {
        clearTimeout(timeout);
      }

      const json: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof json === "object" &&
          json !== null &&
          "error" in json
            ? String(json.error)
            : "API request failed";
        throw new Error(message);
      }

      if (
        typeof json !== "object" ||
        json === null ||
        !("timeframes" in json) ||
        !("signal" in json)
      ) {
        throw new Error("Invalid API response");
      }

      setData(json as Analysis);
      setUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Connection error"
      );
    } finally {
      setLoading(false);
    }
  }, [coin]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load, autoRefresh]);

  const frame = data?.timeframes?.[timeframe];
  const signal = data?.signal?.toUpperCase() || "HOLD";

  const signalColor =
    signal === "LONG"
      ? "#22c55e"
      : signal === "SHORT"
      ? "#ef4444"
      : "#f59e0b";

  const card: React.CSSProperties = {
    background: "#151f32",
    border: "1px solid #293750",
    borderRadius: 16,
    padding: 18,
  };

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    padding: "11px 16px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: active ? "#2563eb" : "#1e293b",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080f1d",
        color: "#f8fafc",
        padding: "20px 14px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 29, marginBottom: 6 }}>
            Crypto Signal Pro
          </h1>
          <p style={{ color: "#94a3b8", margin: 0 }}>
            Delta Exchange India • Technical Analysis
          </p>
        </header>

        <section style={card}>
          <h3>Select Cryptocurrency</h3>
          <div style={{ display: "flex", gap: 10 }}>
            {(["BTC", "ETH"] as Coin[]).map((item) => (
              <button
                key={item}
                style={buttonStyle(coin === item)}
                onClick={() => setCoin(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: 24 }}>Timeframe</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {FRAMES.map((item) => (
              <button
                key={item}
                style={buttonStyle(timeframe === item)}
                onClick={() => setTimeframe(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <div style={{ height: 16 }} />

        {loading && (
          <div style={card}>Loading market analysis...</div>
        )}

        {error && (
          <div
            style={{
              ...card,
              borderColor: "#ef4444",
              color: "#fca5a5",
            }}
          >
            API Error: {error}
          </div>
        )}

        {data && (
          <>
            <section style={{ ...card, marginTop: 16 }}>
              <p style={{ color: "#94a3b8" }}>
                {data.symbol} • {timeframe}
              </p>

              <h2 style={{ fontSize: 36, margin: "10px 0" }}>
                ${format(frame?.price)}
              </h2>

              <div
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: signalColor,
                  color: "#08111f",
                  fontWeight: 900,
                  fontSize: 22,
                }}
              >
                {signal}
              </div>

              <p>Multi-Timeframe Confirmation: {data.confirmation}</p>
              <p style={{ color: "#94a3b8" }}>
                Last Updated: {updated}
              </p>
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(145px, 1fr))",
                gap: 12,
                marginTop: 16,
              }}
            >
              {[
                ["RSI (14)", format(frame?.rsi)],
                ["MACD", format(frame?.macd, 4)],
                ["MACD Signal", format(frame?.macd_signal, 4)],
                ["EMA 20", format(frame?.ema20)],
                ["EMA 50", format(frame?.ema50)],
                ["EMA 200", format(frame?.ema200)],
                ["ATR (14)", format(frame?.atr14)],
                ["ADX (14)", format(frame?.adx14)],
              ].map(([label, value]) => (
                <div key={label} style={card}>
                  <p style={{ color: "#94a3b8", fontSize: 13 }}>
                    {label}
                  </p>
                  <h3>{value}</h3>
                </div>
              ))}
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginTop: 16,
              }}
            >
              <div style={card}>
                <p>Support</p>
                <h2 style={{ color: "#22c55e" }}>
                  ${format(frame?.support)}
                </h2>
              </div>

              <div style={card}>
                <p>Resistance</p>
                <h2 style={{ color: "#ef4444" }}>
                  ${format(frame?.resistance)}
                </h2>
              </div>
            </section>

            <section style={{ ...card, marginTop: 16 }}>
              <h3>Multi-Timeframe Analysis</h3>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr>
                      {["TF", "RSI", "Price", "Direction"].map((h) => (
                        <th key={h} style={{ padding: 10 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FRAMES.map((tf) => {
                      const item = data.timeframes?.[tf];
                      return (
                        <tr key={tf}>
                          <td style={{ padding: 10 }}>{tf}</td>
                          <td>{format(item?.rsi)}</td>
                          <td>${format(item?.price)}</td>
                          <td>{item?.direction || "--"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...card, marginTop: 16 }}>
              <h3>Trade Levels</h3>
              <p>Entry: ${format(data.entry)}</p>
              <p>Stop Loss: ${format(data.stop_loss)}</p>
              <p>Target 1: ${format(data.target1)}</p>
              <p>Target 2: ${format(data.target2)}</p>
              <p>Target 3: ${format(data.target3)}</p>
              <p style={{ color: "#94a3b8" }}>
                {data.confidence || "No confidence data"}
              </p>
            </section>
          </>
        )}

        <section style={{ ...card, marginTop: 16 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh (30 seconds)
          </label>

          <button
            style={{ ...buttonStyle(true), marginTop: 14 }}
            onClick={() => void load()}
          >
            Refresh Analysis
          </button>
        </section>

        <footer
          style={{
            textAlign: "center",
            color: "#94a3b8",
            marginTop: 28,
            fontSize: 12,
          }}
        >
          Educational technical analysis only. Not financial advice.
          Signals are not guaranteed.
        </footer>
      </div>
    </main>
  );
}
