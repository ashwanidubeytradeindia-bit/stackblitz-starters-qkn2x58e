
import { NextRequest, NextResponse } from "next/server";
import {
  analyzeCandles,
  type Candle,
} from "../../lib/indicators";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API = "https://api.india.delta.exchange";

const INTERVALS: Record<string, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
};

type DeltaCandle = {
  time: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
};

export async function GET(request: NextRequest) {
  const coin = (
    request.nextUrl.searchParams.get("coin") || "BTC"
  ).toUpperCase();

  const timeframe =
    request.nextUrl.searchParams.get("timeframe") || "15m";

  if (!["BTC", "ETH"].includes(coin)) {
    return NextResponse.json(
      { error: "Invalid coin" },
      { status: 400 }
    );
  }

  const interval = INTERVALS[timeframe];

  if (!interval) {
    return NextResponse.json(
      { error: "Invalid timeframe" },
      { status: 400 }
    );
  }

  try {
    const symbol = `${coin}USD`;

    // Use only candles whose interval has ended.
    const now = Math.floor(Date.now() / 1000);
    const lastClosedEnd =
      Math.floor(now / interval) * interval;

    // Request 350 historical candle intervals.
    const start = lastClosedEnd - 350 * interval;

    const params = new URLSearchParams({
      symbol,
      resolution: timeframe,
      start: String(start),
      end: String(lastClosedEnd),
    });

    const response = await fetch(
      `${API}/v2/history/candles?${params.toString()}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Delta candle API HTTP ${response.status}`
      );
    }

    const json = await response.json();

    if (json.success === false ||
        !Array.isArray(json.result)) {
      throw new Error("Invalid Delta candle response");
    }

    const raw = json.result as DeltaCandle[];

    const candles: Candle[] = raw
      .map((c) => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      }))
      .filter((c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        Number.isFinite(c.volume) &&
        c.open > 0 &&
        c.high > 0 &&
        c.low > 0 &&
        c.close > 0 &&
        c.volume >= 0 &&
        c.high >= Math.max(c.open, c.close, c.low) &&
        c.low <= Math.min(c.open, c.close) &&
        c.time >= start &&
        c.time + interval <= lastClosedEnd
      )
      .sort((a, b) => a.time - b.time)
      .filter((c, index, arr) =>
        index === 0 || c.time !== arr[index - 1].time
      );

    if (candles.length < 200) {
      throw new Error(
        `Insufficient completed candles: ${candles.length}`
      );
    }

    // Reject gaps to avoid distorted indicators.
    for (
      let i = Math.max(1, candles.length - 200);
      i < candles.length;
      i++
    ) {
      if (
        candles[i].time - candles[i - 1].time !==
        interval
      ) {
        throw new Error("Historical candle gap detected");
      }
    }

    const analysis = analyzeCandles(candles);
    const latest = candles[candles.length - 1];

    // Keep the previous API's price/status fields.
    return NextResponse.json({
      coin,
      symbol,
      timeframe,
      price: analysis.price,
      signal: analysis.signal,
      support: analysis.support,
      resistance: analysis.resistance,
      rsi: analysis.rsi,
      macd: analysis.macd,
      ema20: analysis.ema20,
      ema50: analysis.ema50,
      ema200: analysis.ema200,
      candleCount: analysis.candleCount,
      plan: null,
      lastCandleTime: new Date(
        latest.time * 1000
      ).toISOString(),
      updatedAt: new Date().toISOString(),
      status: "connected",
      priceSource: "last_completed_candle",
      analysisType: "rule_based",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "disconnected",
        signal: "HOLD",
        error:
          error instanceof Error
            ? error.message
            : "Market data unavailable",
      },
      { status: 502 }
    );
  }
}
