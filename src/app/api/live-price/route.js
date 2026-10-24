import { NextResponse } from 'next/server';

let cachedPrice = null;
let lastCacheTime = 0;
const CACHE_MS = 2500; // 2.5s cache for high-frequency polling

export async function GET() {
  const now = Date.now();
  if (cachedPrice && now - lastCacheTime < CACHE_MS) {
    return NextResponse.json({
      success: true,
      ...cachedPrice,
      cached: true,
    });
  }

  let price = 0;
  let high24h = 0;
  let low24h = 0;
  let change24h = 0;
  let source = 'unknown';

  // 1. Primary: Bybit Linear Perpetual Ticker (Zero CORS, ultra-fast 200ms)
  try {
    const res = await fetch(
      'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
      {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const ticker = data.result?.list?.[0];
      if (ticker?.lastPrice) {
        price = parseFloat(ticker.lastPrice);
        high24h = parseFloat(ticker.highPrice24h || 0);
        low24h = parseFloat(ticker.lowPrice24h || 0);
        change24h = parseFloat((parseFloat(ticker.price24hPcnt || 0) * 100).toFixed(2));
        source = 'bybit';
      }
    }
  } catch (err) {
    // Failover
  }

  // 2. Secondary: Binance Vision Mirror
  if (!price) {
    try {
      const res = await fetch(
        'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT',
        {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          signal: AbortSignal.timeout(2500),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.lastPrice) {
          price = parseFloat(data.lastPrice);
          high24h = parseFloat(data.highPrice || 0);
          low24h = parseFloat(data.lowPrice || 0);
          change24h = parseFloat(parseFloat(data.priceChangePercent || 0).toFixed(2));
          source = 'binance_vision';
        }
      }
    } catch (err) {
      // Failover
    }
  }

  // 3. Tertiary: Coinbase Spot
  if (!price) {
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.amount) {
          price = parseFloat(data.data.amount);
          source = 'coinbase';
        }
      }
    } catch (err) {
      // Failover
    }
  }

  if (price > 0) {
    cachedPrice = { price, high24h, low24h, change24h, source, timestamp: now };
    lastCacheTime = now;
    return NextResponse.json({
      success: true,
      price,
      high24h,
      low24h,
      change24h,
      source,
      timestamp: now,
      cached: false,
    });
  }

  if (cachedPrice) {
    return NextResponse.json({
      success: true,
      ...cachedPrice,
      stale: true,
    });
  }

  return NextResponse.json({ success: false, error: 'Failed to retrieve live price' }, { status: 500 });
}
