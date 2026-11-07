
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function calculateEMA(
  prices: number[],
  period: number
): number {
  if (prices.length < period) return NaN;

  const multiplier = 2 / (period + 1);
  let ema =
    prices.slice(0, period).reduce((a, b) => a + b, 0) /
    period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

export function calculateRSI(
  prices: number[],
  period = 14
): number {
  if (prices.length <= period) return NaN;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    gain += Math.max(diff, 0);
    loss += Math.max(-diff, 0);
  }

  gain /= period;
  loss /= period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (loss === 0 && gain === 0) return 50;
  if (loss === 0) return 100;

  return 100 - 100 / (1 + gain / loss);
}

function emaSeries(prices: number[], period: number): number[] {
  const result: number[] = [];
  if (prices.length < period) return result;

  let ema =
    prices.slice(0, period).reduce((a, b) => a + b, 0) /
    period;
  result.push(ema);

  const k = 2 / (period + 1);

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result.push(ema);
  }

  return result;
}

export function calculateMACD(prices: number[]) {
  const fast = emaSeries(prices, 12);
  const slow = emaSeries(prices, 26);

  if (slow.length < 9) {
    return { line: NaN, signal: NaN, histogram: NaN };
  }

  const offset = fast.length - slow.length;
  const macdSeries = slow.map(
    (value, i) => fast[i + offset] - value
  );

  const signalSeries = emaSeries(macdSeries, 9);
  const line = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];

  return {
    line,
    signal,
    histogram: line - signal
  };
}

export function analyzeCandles(candles: Candle[]) {
  if (candles.length < 200) {
    throw new Error("At least 200 completed candles required");
  }

  const prices = candles.map(c => c.close);
  const latest = candles[candles.length - 1];
  const recent = candles.slice(-20);

  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const ema200 = calculateEMA(prices, 200);
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);

  const support = Math.min(...recent.map(c => c.low));
  const resistance = Math.max(...recent.map(c => c.high));

  let signal: "LONG" | "SHORT" | "HOLD" = "HOLD";

  if (
    latest.close > ema20 &&
    ema20 > ema50 &&
    ema50 > ema200 &&
    rsi > 50 &&
    rsi < 70 &&
    macd.histogram > 0
  ) {
    signal = "LONG";
  } else if (
    latest.close < ema20 &&
    ema20 < ema50 &&
    ema50 < ema200 &&
    rsi < 50 &&
    rsi > 30 &&
    macd.histogram < 0
  ) {
    signal = "SHORT";
  }

  return {
    signal,
    price: latest.close,
    support,
    resistance,
    rsi,
    macd,
    ema20,
    ema50,
    ema200,
    candleCount: candles.length
  };
}
