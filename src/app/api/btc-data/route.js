/**
 * Server-side API route to fetch BTC historical daily price data.
 * Primary source: CoinGecko public API
 * Fallback: Yahoo Finance BTC-USD CSV
 * Returns daily candles from Jan 2021 to today.
 */

export async function GET() {
  // Try Yahoo Finance first as it provides complete, high-fidelity OHLC without auth limits
  try {
    const candles = await fetchFromYahooFinance();
    return Response.json({ candles, count: candles.length, source: 'yahoo' });
  } catch (yahooErr) {
    console.warn('Yahoo Finance failed, trying CoinGecko fallback:', yahooErr.message);
    try {
      const candles = await fetchFromCoinGecko();
      return Response.json({ candles, count: candles.length, source: 'coingecko' });
    } catch (fallbackErr) {
      console.error('All data sources failed:', fallbackErr.message);
      return Response.json(
        { error: `Yahoo: ${yahooErr.message} | CoinGecko: ${fallbackErr.message}` },
        { status: 500 }
      );
    }
  }
}

// ─── CoinGecko ────────────────────────────────────────────────────────────────
async function fetchFromCoinGecko() {
  const fromTs = Math.floor(new Date('2021-01-01').getTime() / 1000);
  const toTs = Math.floor(Date.now() / 1000);

  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${fromTs}&to=${toTs}&precision=2`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 BTC-Bias-Helper/1.0',
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.prices || data.prices.length === 0) {
    throw new Error('CoinGecko returned empty price data');
  }

  return buildCandles(data.prices);
}

// ─── Yahoo Finance Fallback ────────────────────────────────────────────────────
async function fetchFromYahooFinance() {
  const period1 = Math.floor(new Date('2021-01-01').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance HTTP ${response.status}`);
  }

  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo Finance: empty result');

  const timestamps = result.timestamp;
  const opens = result.indicators?.quote?.[0]?.open;
  const closes = result.indicators?.quote?.[0]?.close;
  const highs = result.indicators?.quote?.[0]?.high;
  const lows = result.indicators?.quote?.[0]?.low;

  if (!timestamps || !closes) throw new Error('Yahoo Finance: missing OHLC data');

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
    candles.push({
      date,
      open: opens[i] ?? closes[i],
      high: highs[i] ?? closes[i],
      low: lows[i] ?? closes[i],
      close: closes[i],
      ts: timestamps[i] * 1000,
    });
  }

  return candles.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Build daily candles from [[timestamp, price], ...] ──────────────────────
function buildCandles(prices) {
  const dailyMap = new Map();

  for (const [ts, price] of prices) {
    const date = new Date(ts).toISOString().split('T')[0];

    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, open: price, high: price, low: price, close: price, ts });
    } else {
      const candle = dailyMap.get(date);
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
    }
  }

  const candles = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Re-assign open = previous candle's close for accuracy
  for (let i = 1; i < candles.length; i++) {
    candles[i].open = candles[i - 1].close;
  }

  return candles;
}
