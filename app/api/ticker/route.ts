
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DELTA_API = "https://api.india.delta.exchange";

type Coin = "BTC" | "ETH";
type TickerData = Record<string, unknown>;

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSourceTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (
    typeof value === "string" &&
    !/^\d+(\.\d+)?$/.test(value)
  ) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toISOString();
  }

  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  const milliseconds =
    n < 1e11 ? n * 1000 : n >= 1e14 ? n / 1000 : n;

  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function respond(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams
    .get("coin")
    ?.toUpperCase();

  if (requested !== "BTC" && requested !== "ETH") {
    return respond(
      { error: "coin must be BTC or ETH" },
      400
    );
  }

  const coin: Coin = requested;
  const symbol = `${coin}USD`;

  try {
    const response = await fetch(
      `${DELTA_API}/v2/tickers/${symbol}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Delta ticker HTTP ${response.status}`
      );
    }

    const payload = await response.json();

    if (
      payload?.success === false ||
      !payload?.result ||
      typeof payload.result !== "object" ||
      Array.isArray(payload.result)
    ) {
      throw new Error("Invalid Delta ticker response");
    }

    const ticker = payload.result as TickerData;

    const lastPrice = positiveNumber(ticker.last_price);
    const closePrice = positiveNumber(ticker.close);
    const markPrice = positiveNumber(ticker.mark_price);
    const spotPrice = positiveNumber(ticker.spot_price);

    // Never substitute mark or spot for a traded price.
    const price = lastPrice ?? closePrice;

    const priceType =
      lastPrice !== null
        ? "last_price"
        : closePrice !== null
        ? "close"
        : null;

    if (price === null) {
      throw new Error(
        "Neither last_price nor close is available"
      );
    }

    // This is the ticker timestamp, not necessarily
    // the timestamp of the last executed trade.
    const sourceTimestamp = parseSourceTime(
      ticker.timestamp ??
      ticker.updated_at ??
      ticker.last_trade_time ??
      null
    );

    const serverReceivedAt = new Date().toISOString();

    const sourceMs = sourceTimestamp
      ? Date.parse(sourceTimestamp)
      : null;

    const ageMs =
      sourceMs !== null && Number.isFinite(sourceMs)
        ? Date.now() - sourceMs
        : null;

    // Approximate ticker-data freshness.
    // This does NOT prove a new trade occurred.
    const tickerFresh =
      ageMs !== null &&
      ageMs >= -10000 &&
      ageMs <= 30000;

    return respond({
      coin,
      symbol: String(ticker.symbol || symbol),

      // Backward-compatible dashboard fields.
      price,
      priceType,
      source: "Delta Exchange India",
      sourceTimestamp,
      serverReceivedAt,

      // Explicit market-price fields.
      lastPrice,
      closePrice,
      markPrice,
      spotPrice,

      // Additional verification diagnostics.
      tickerFresh,
      sourceAgeMs: ageMs,
      timestampAvailable: sourceTimestamp !== null,
      isLiveTradeVerified: false,

      // Important distinction:
      // close is not guaranteed to be the latest trade.
      priceDescription:
        priceType === "last_price"
          ? "Exchange-reported last_price"
          : "Exchange-reported close price",

      freshnessDescription:
        sourceTimestamp === null
          ? "Exchange source timestamp unavailable"
          : tickerFresh
          ? "Ticker timestamp is within 30 seconds"
          : "Ticker timestamp is outside freshness window",

      tradeVerificationDescription:
        "A fresh ticker response does not independently verify a new trade.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError" ||
          error.name === "AbortError"
          ? "Delta ticker request timed out"
          : error.message
        : "Unknown ticker error";

    return respond(
      {
        error: message,
        coin,
        symbol,
        source: "Delta Exchange India",
      },
      502
    );
  }
}
