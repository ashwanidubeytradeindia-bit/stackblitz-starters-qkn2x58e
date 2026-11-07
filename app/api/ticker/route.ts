
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DELTA_API = "https://api.india.delta.exchange";

type Coin = "BTC" | "ETH";

type TickerData = Record<string, unknown>;

function validNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

function sourceTime(value: unknown): string | null {
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

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  let milliseconds = number;

  if (number < 1e11) {
    milliseconds = number * 1000;
  } else if (number >= 1e14) {
    milliseconds = number / 1000;
  }

  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams
    .get("coin")
    ?.toUpperCase();

  if (requested !== "BTC" && requested !== "ETH") {
    return jsonResponse(
      {
        error: "coin must be BTC or ETH",
      },
      400
    );
  }

  const coin: Coin = requested;

  const symbol =
    coin === "BTC" ? "BTCUSD" : "ETHUSD";

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 8000);

    let response: Response;

    try {
      response = await fetch(
        `${DELTA_API}/v2/tickers/${symbol}`,
        {
          method: "GET",
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
      return jsonResponse(
        {
          error: `Delta ticker HTTP ${response.status}`,
          coin,
          symbol,
          source: "Delta Exchange India",
        },
        502
      );
    }

    const payload = await response.json();

    if (
      payload?.success === false ||
      !payload?.result ||
      typeof payload.result !== "object" ||
      Array.isArray(payload.result)
    ) {
      return jsonResponse(
        {
          error: "Invalid Delta ticker response",
          coin,
          symbol,
        },
        502
      );
    }

    const ticker = payload.result as TickerData;

    const lastPrice = validNumber(ticker.last_price);
    const closePrice = validNumber(ticker.close);
    const markPrice = validNumber(ticker.mark_price);
    const spotPrice = validNumber(ticker.spot_price);

    // Only actual traded-price fields are eligible
    // for the primary ticker price.
    let price: number | null = null;
    let priceType: string | null = null;

    if (lastPrice !== null) {
      price = lastPrice;
      priceType = "last_price";
    } else if (closePrice !== null) {
      price = closePrice;
      priceType = "close";
    }

    if (price === null) {
      return jsonResponse(
        {
          error:
            "No valid traded-price field in Delta ticker",
          coin,
          symbol,
          availableFields: Object.keys(ticker),
          markPrice,
          spotPrice,
          source: "Delta Exchange India",
        },
        502
      );
    }

    const timestamp = sourceTime(
      ticker.timestamp ??
        ticker.updated_at ??
        ticker.last_trade_time ??
        null
    );

    const serverReceivedAt = new Date().toISOString();

    return jsonResponse(
      {
        coin,
        symbol: String(ticker.symbol || symbol),

        // Existing dashboard-compatible fields
        price,
        priceType,
        source: "Delta Exchange India",
        sourceTimestamp: timestamp,
        serverReceivedAt,

        // Additional diagnostic fields
        lastPrice,
        closePrice,
        markPrice,
        spotPrice,

        // Receiving a ticker does not prove
        // a new trade happened this second.
        isLiveTradeVerified: false,
        timestampAvailable: timestamp !== null,
      },
      200
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Delta ticker request timed out"
          : error.message
        : "Unknown ticker error";

    return jsonResponse(
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
