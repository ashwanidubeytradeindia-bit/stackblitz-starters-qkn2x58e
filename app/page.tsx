
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Coin = "BTC" | "ETH";
type Timeframe = "5m" | "15m" | "1h" | "4h";
type Signal = "LONG" | "SHORT" | "HOLD";
type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Analysis = {
  coin: Coin; symbol: string; timeframe: Timeframe; price: number; signal: Signal;
  support: number; resistance: number; rsi: number; macd: { line: number; signal: number; histogram: number };
  ema20: number; ema50: number; candles: Candle[];
};
type Snapshot = { timeframe: Timeframe; signal: Signal; rsi: number; price: number };
const FRAMES: Timeframe[] = ["5m", "15m", "1h", "4h"];
const REFRESH_MS = 30000;
const num = (x: unknown) => { if (x === null || x === undefined || x === "") return NaN; const n = Number(x); return Number.isFinite(n) ? n : NaN; };
const fmt = (x: unknown, digits = 2) => Number.isFinite(num(x)) ? num(x).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
const colorOf = (signal: Signal) => signal === "LONG" ? "#4ade80" : signal === "SHORT" ? "#fb7185" : "#facc15";
function parseAnalysis(raw: unknown, coin: Coin, timeframe: Timeframe): Analysis {
  if (!raw || typeof raw !== "object") throw new Error("Invalid API response");
  const obj = raw as Record<string, any>;
  if (obj.error) throw new Error(String(obj.error));
  if (![obj.price, obj.support, obj.resistance].every(x => Number.isFinite(num(x)))) throw new Error("Price/support/resistance missing from API");
  if (!Array.isArray(obj.candles)) throw new Error("Candles array missing from API");
  const candles: Candle[] = obj.candles.map((c: any) => ({
    time: num(c.time), open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume)
  })).filter((c: Candle) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) && c.time > 0 && c.low <= c.high && c.open >= c.low && c.open <= c.high && c.close >= c.low && c.close <= c.high)
    .sort((a: Candle, b: Candle) => a.time - b.time)
    .filter((c: Candle, i: number, a: Candle[]) => i === 0 || c.time !== a[i - 1].time);
  if (candles.length < 2) throw new Error("Not enough valid candles");
  const signal: Signal = ["LONG", "SHORT", "HOLD"].includes(obj.signal) ? obj.signal : "HOLD";
  return { coin, timeframe, symbol: String(obj.symbol || `${coin}USD`), price: num(obj.price), signal,
    support: num(obj.support), resistance: num(obj.resistance), rsi: num(obj.rsi),
    macd: { line: num(obj.macd?.line), signal: num(obj.macd?.signal), histogram: num(obj.macd?.histogram) },
    ema20: num(obj.ema20), ema50: num(obj.ema50), candles };
}
async function getAnalysis(coin: Coin, timeframe: Timeframe, signal: AbortSignal): Promise<Analysis> {
  const url = `/api/analysis?${new URLSearchParams({ coin, timeframe })}`;
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.text();
  let json: unknown;
  try { json = JSON.parse(body); } catch { throw new Error(`API returned non-JSON (HTTP ${response.status}). Check ${url}`); }
  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json ? String((json as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(`${timeframe}: ${message}`);
  }
  return parseAnalysis(json, coin, timeframe);
}
function emaSeries(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let ema = sum / period;
  result[period - 1] = ema;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) { ema = candles[i].close * multiplier + ema * (1 - multiplier); result[i] = ema; }
  return result;
}
function Chart({ data, zoom }: { data: Analysis; zoom: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const series20 = useMemo(() => emaSeries(data.candles, 20), [data.candles]);
  const series50 = useMemo(() => emaSeries(data.candles, 50), [data.candles]);
  const start = Math.max(0, data.candles.length - zoom);
  const candles = data.candles.slice(start);
  const e20 = series20.slice(start);
  const e50 = series50.slice(start);
  const width = Math.max(720, candles.length * 11 + 115);
  const height = 390;
  const left = 18, right = 110, top = 22, bottom = 40;
  const pw = width - left - right, ph = height - top - bottom;
  const priceValues = [...candles.flatMap(c => [c.low, c.high]), data.support, data.resistance, data.price,
    ...e20.filter((v): v is number => v !== null), ...e50.filter((v): v is number => v !== null)];
  const low = Math.min(...priceValues), high = Math.max(...priceValues);
  const pad = Math.max((high - low) * 0.07, high * 0.0001);
  const min = low - pad, max = high + pad;
  const y = (p: number) => top + (max - p) / (max - min) * ph;
  const step = pw / candles.length;
  const linePath = (series: (number | null)[]) => series.map((v, i) => v === null ? "" : `${i === 0 || series[i - 1] === null ? "M" : "L"}${(left + step * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const timeLabel = (timestamp: number) => new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth; }, [data.coin, data.timeframe, zoom]);
  const levels = [
    { name: "SUP", price: data.support, color: "#4ade80", fill: "#166534", dash: "7 5" },
    { name: "RES", price: data.resistance, color: "#fb7185", fill: "#9f1239", dash: "7 5" },
    { name: "PRICE", price: data.price, color: "#60a5fa", fill: "#1d4ed8", dash: "3 4" }
  ];
  return <>
    <div className="chartScroll" ref={scroller}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${data.coin} candlesticks, EMA 20, EMA 50, support, resistance and latest API price`}>
        <rect width={width} height={height} fill="#101b2d" />
        {Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4).map((p, i) => <g key={i}>
          <line x1={left} x2={width - right} y1={y(p)} y2={y(p)} stroke="#293b55" strokeDasharray="3 5" />
          <text x={width - right + 8} y={y(p) + 4} fill="#94a3b8" fontSize="12">{fmt(p)}</text>
        </g>)}
        {candles.map((c, i) => {
          const x = left + step * (i + 0.5), rising = c.close >= c.open;
          const col = rising ? "#22c55e" : "#ef4444";
          return <g key={c.time}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth="1.3" />
            <rect x={x - Math.max(2, step * 0.55) / 2} y={Math.min(y(c.open), y(c.close))} width={Math.max(2, step * 0.55)} height={Math.max(1.3, Math.abs(y(c.open) - y(c.close)))} fill={col} />
          </g>;
        })}
        <path d={linePath(e20)} fill="none" stroke="#fbbf24" strokeWidth="2" />
        <path d={linePath(e50)} fill="none" stroke="#a78bfa" strokeWidth="2" />
        {levels.map(l => <g key={l.name}>
          <line x1={left} x2={width - right} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth="1.8" strokeDasharray={l.dash} />
          <rect x={width - right} y={y(l.price) - 11} width={right - 3} height={22} rx="4" fill={l.fill} />
          <text x={width - right + 5} y={y(l.price) + 4} fontSize="11" fill="#fff">{l.name} {fmt(l.price, data.coin === "BTC" ? 0 : 2)}</text>
        </g>)}
        {candles.map((c, i) => i % Math.max(1, Math.floor(candles.length / 6)) === 0 ? <text key={`t-${c.time}`} x={left + step * (i + 0.5)} y={height - 12} fill="#94a3b8" fontSize="11" textAnchor="middle">{timeLabel(c.time)}</text> : null)}
      </svg>
    </div>
    <div className="legend"><span style={{ color: "#fbbf24" }}>━ EMA 20</span><span style={{ color: "#a78bfa" }}>━ EMA 50</span><span style={{ color: "#4ade80" }}>┄ Support</span><span style={{ color: "#fb7185" }}>┄ Resistance</span><span style={{ color: "#60a5fa" }}>┄ API Price</span></div>
    <p className="hint">Swipe chart horizontally on mobile. EMA lines require at least 20/50 candles.</p>
  </>;
}
function Metric({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return <div className="metric"><span className="muted">{label}</span><strong style={{ color: tint || "#e2e8f0" }}>{value}</strong></div>;
}
export default function Home() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [zoom, setZoom] = useState(60);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [data, setData] = useState<Analysis | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<Timeframe, Snapshot>>>({});
  const [errors, setErrors] = useState<Partial<Record<Timeframe, string>>>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState("");
  const active = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const fetchAll = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const id = ++requestId.current;
    setLoading(true);
    const results = await Promise.allSettled(FRAMES.map(tf => getAnalysis(coin, tf, controller.signal)));
    if (controller.signal.aborted || id !== requestId.current) return;
    const nextSnapshots: Partial<Record<Timeframe, Snapshot>> = {};
    const nextErrors: Partial<Record<Timeframe, string>> = {};
    let selected: Analysis | null = null;
    results.forEach((result, i) => {
      const tf = FRAMES[i];
      if (result.status === "fulfilled") {
        const item = result.value;
        nextSnapshots[tf] = { timeframe: tf, signal: item.signal, rsi: item.rsi, price: item.price };
        if (tf === timeframe) selected = item;
      } else if ((result.reason as Error)?.name !== "AbortError") {
        nextErrors[tf] = result.reason instanceof Error ? result.reason.message : "API unavailable";
      }
    });
    setSnapshots(nextSnapshots);
    setErrors(nextErrors);
    setData(selected);
    setUpdated(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }));
    setLoading(false);
  }, [coin, timeframe]);
  useEffect(() => { fetchAll(); return () => { active.current?.abort(); }; }, [fetchAll]);
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { if (document.visibilityState === "visible") fetchAll(); }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);
  const counts = FRAMES.reduce((acc, tf) => { const s = snapshots[tf]?.signal; if (s === "LONG") acc.long++; if (s === "SHORT") acc.short++; if (s === "HOLD") acc.hold++; return acc; }, { long: 0, short: 0, hold: 0 });
  const available = Object.keys(snapshots).length;
  const consensus: Signal = available === 4 && counts.long >= 3 ? "LONG" : available === 4 && counts.short >= 3 ? "SHORT" : "HOLD";
  const trend = data && Number.isFinite(data.ema20) && Number.isFinite(data.ema50) ? data.ema20 > data.ema50 ? "Bullish" : data.ema20 < data.ema50 ? "Bearish" : "Neutral" : "Unavailable";
  const percent = (n: number) => data && data.price !== 0 ? `${fmt(n / data.price * 100)}%` : "—";
  return <main className="page">
    <header className="header"><div><h1>₿ Crypto Signal Pro</h1><p>Delta Exchange India · Milestone 9</p></div><span className="live">● API Analysis</span></header>
    <section className="panel">
      <div className="controls"><div className="coins">{(["BTC", "ETH"] as Coin[]).map(c => <button key={c} className={coin === c ? "selected" : ""} onClick={() => setCoin(c)}>{c}</button>)}</div>
        <label className="selectLabel">Timeframe <select value={timeframe} onChange={e => setTimeframe(e.target.value as Timeframe)}>{FRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}</select></label></div>
      <div className="priceRow"><div><div className="muted">{data?.symbol || `${coin}USD`} · {timeframe} · API price</div><h2>{data ? `$${fmt(data.price)}` : loading ? "Loading..." : "—"}</h2></div><span className="signal" style={{ color: data ? colorOf(data.signal) : "#94a3b8" }}>{data?.signal || "—"}</span></div>
      <p className="muted small">{loading ? "Updating all 4 timeframes..." : `Last checked ${updated || "—"} IST`}</p>
      <div className="actions"><button onClick={fetchAll} disabled={loading}>{loading ? "Refreshing..." : "↻ Refresh Now"}</button><label><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto refresh (30s)</label></div>
    </section>
    {errors[timeframe] && <section className="panel error"><h3>Selected timeframe API error</h3><p>{errors[timeframe]}</p><p className="small">Check /api/analysis?coin={coin}&amp;timeframe={timeframe}</p></section>}
    <section className="panel"><div className="sectionHead"><h3>Candlestick Chart</h3><label className="selectLabel">Candles <select value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={30}>30</option><option value={60}>60</option><option value={120}>120</option></select></label></div>{data ? <Chart data={data} zoom={zoom} /> : <div className="empty">{loading ? "Loading candles..." : "Chart unavailable"}</div>}</section>
    <section className="metrics"><Metric label="Support" value={data ? `$${fmt(data.support)}` : "—"} tint="#4ade80" /><Metric label="Resistance" value={data ? `$${fmt(data.resistance)}` : "—"} tint="#fb7185" /><Metric label="Price − Support" value={data ? percent(data.price - data.support) : "—"} /><Metric label="Resistance − Price" value={data ? percent(data.resistance - data.price) : "—"} /></section>
    <section className="panel"><div className="sectionHead"><h3>Multi-timeframe confirmation</h3><strong style={{ color: colorOf(consensus) }}>{available}/4 received</strong></div><div className="frameGrid">{FRAMES.map(tf => <div key={tf} className="frame"><strong>{tf}</strong>{snapshots[tf] ? <span style={{ color: colorOf(snapshots[tf]!.signal) }}>{snapshots[tf]!.signal} · RSI {fmt(snapshots[tf]!.rsi)}</span> : <span className="muted">{errors[tf] ? "API error" : "Loading..."}</span>}</div>)}</div><div className="consensus">Confirmation: <strong style={{ color: colorOf(consensus) }}>{consensus}</strong> <span className="muted">({counts.long} LONG · {counts.short} SHORT · {counts.hold} HOLD)</span></div><p className="hint">LONG/SHORT confirmation requires at least 3 matching directional signals out of 4 successful timeframes. Otherwise HOLD.</p></section>
    <section className="panel"><h3>Technical Indicators · {timeframe}</h3><div className="metrics inner"><Metric label="RSI (14)" value={fmt(data?.rsi)} /><Metric label="MACD Line" value={fmt(data?.macd.line, 4)} /><Metric label="MACD Signal" value={fmt(data?.macd.signal, 4)} /><Metric label="MACD Histogram" value={fmt(data?.macd.histogram, 4)} /><Metric label="EMA 20 (API)" value={fmt(data?.ema20)} /><Metric label="EMA 50 (API)" value={fmt(data?.ema50)} /><Metric label="EMA Trend" value={trend} /><Metric label="Selected Signal" value={data?.signal || "—"} tint={data ? colorOf(data.signal) : undefined} /></div></section>
    <section className="panel"><h3>Signal interpretation</h3><p>{data ? `Selected ${timeframe}: ${data.signal}. ${data.signal === "LONG" ? "Bullish setup indicated." : data.signal === "SHORT" ? "Bearish setup indicated." : "No clear directional entry indicated."}` : "Waiting for analysis."}</p><p className="muted small">Price line uses the latest API analysis price, not a streaming ticker. Chart EMA is calculated from returned candle closes; displayed indicator EMA values come from the API.</p></section>
    <footer>Educational technical analysis only. Signals can be wrong. No orders are placed automatically.</footer>
    <style jsx>{`
      *{box-sizing:border-box}.page{min-height:100vh;background:#091325;color:#e2e8f0;padding:18px;font-family:Arial,sans-serif}.header,.panel,.metrics,footer{max-width:1100px;margin-left:auto;margin-right:auto}.header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px}.header h1{font-size:28px;margin:0 0 8px}.header p,.muted,.hint{color:#94a3b8}.live{color:#4ade80;font-size:13px}.panel{background:#17263c;border:1px solid #304560;border-radius:18px;padding:20px;margin-bottom:18px}h2{font-size:36px;margin:10px 0}h3{font-size:19px;margin:0 0 18px}.controls,.priceRow,.sectionHead,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.coins,.actions{display:flex;gap:10px;align-items:center}.priceRow{margin-top:28px}.signal{font-size:21px;font-weight:700;border:1px solid #38516f;border-radius:10px;padding:10px 15px}.selectLabel{display:flex;align-items:center;gap:8px;color:#cbd5e1}button,select{background:#243953;border:1px solid #38516f;color:#fff;padding:11px 15px;border-radius:10px;font-size:15px;cursor:pointer}button.selected{background:#2563eb;border-color:#60a5fa}button:disabled{opacity:.55;cursor:wait}.actions{justify-content:flex-start;flex-wrap:wrap}.actions label{display:flex;align-items:center;gap:7px}.small,.hint{font-size:13px;line-height:1.6}.chartScroll{width:100%;overflow-x:auto;overflow-y:hidden;border-radius:10px;background:#101b2d;touch-action:pan-x pan-y}.chartScroll svg{display:block;max-width:none}.legend{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;font-size:12px;margin-top:12px}.hint{margin:10px 0 0}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.metrics.inner{margin:0}.metric{background:#17263c;border:1px solid #304560;border-radius:13px;padding:15px;min-width:0}.metric strong{display:block;margin-top:12px;font-size:20px;overflow-wrap:anywhere}.frameGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.frame{background:#101b2d;border:1px solid #293b55;border-radius:10px;padding:13px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.consensus{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}.error{border-color:#fb7185;color:#fda4af;overflow-wrap:anywhere}.empty{min-height:240px;display:flex;align-items:center;justify-content:center;color:#94a3b8}footer{text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;padding:10px 0 25px}@media(max-width:700px){.page{padding:12px}.panel{padding:15px}.header h1{font-size:24px}h2{font-size:29px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric strong{font-size:17px}.frameGrid{grid-template-columns:1fr}.selectLabel{font-size:14px}}
    `}</style>
  </main>;
}
