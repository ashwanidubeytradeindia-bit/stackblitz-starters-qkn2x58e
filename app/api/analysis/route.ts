
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = "https://api.india.delta.exchange";

export async function GET(request: NextRequest) {
  const coin = request.nextUrl.searchParams.get("coin") || "BTC";
  const timeframe =
    request.nextUrl.searchParams.get("timeframe") || "15m";

  if (!["BTC", "ETH"].includes(coin)) {
    return NextResponse.json(
      { error: "Invalid coin" },
      { status: 400 }
    );
  }

  if (!["5m", "15m", "1h", "4h"].includes(timeframe)) {
    return NextResponse.json(
      { error: "Invalid timeframe" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${API}/v2/tickers/${coin}USD`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!response.ok) {
      throw new Error(`Delta API HTTP ${response.status}`);
    }

    const json = await response.json();
    const ticker = json.result;

    if (!ticker) {
      throw new Error("Ticker data unavailable");
    }

    const price = Number(
      ticker.mark_price ?? ticker.close
    );

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("Invalid ticker price");
    }

    return NextResponse.json({
      coin,
      symbol: `${coin}USD`,
      timeframe,
      price,
      updatedAt: new Date().toISOString(),
      status: "connected",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Market data unavailable",
      },
      { status: 502 }
    );
  }
}
