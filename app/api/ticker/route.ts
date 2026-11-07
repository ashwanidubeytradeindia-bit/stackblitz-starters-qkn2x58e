
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DELTA_API = "https://api.india.delta.exchange";

type Coin = "BTC" | "ETH";

function validNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sourceTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  const ms = n < 1e11 ? n * 1000 : n;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("coin")?.toUpperCase();

  if (requested !== "BTC" && requested !== "ETH") {
    return NextResponse.json(
      { error: "coin must be BTC or ETH" },
      { status: 400 }
    );
  }

  const coin: Coin = requested;
  const symbol = coin === "BTC" ? "BTCUSD" : "ETHUSD";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;

    try {
      response = await fetch(
        `${DELTA_API}/v2/tickers/${encodeURIComponent(symbol)}`,
        {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Delta ticker HTTP ${response.status}`,
          symbol,
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const payload = await response.json();
    const ticker = payload?.result;

    if (!ticker || typeof ticker !== "object") {
      throw new Error("Delta ticker result is missing");
    }

    // Prefer actual last traded price. Do not silently
    // substitute mark price or an analysis candle close.
    const price = validNumber(ticker.last_price);

    if (price === null) {
      throw new Error("Delta ticker last_price is unavailable");
    }

    const timestamp = sourceTime(
      ticker.timestamp ??
      ticker.updated_at ??
      ticker.last_trade_time ??
      null
    );

    return NextResponse.json(
      {
        coin,
        symbol: String(ticker.symbol || symbol),
        price,
        priceType: "last_price",
        source: "Delta Exchange India",
        sourceTimestamp: timestamp,
        serverReceivedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ticker error";

    return NextResponse.json(
      {
        error: message,
        coin,
        symbol,
        source: "Delta Exchange India",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
