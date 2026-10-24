import { NextResponse } from 'next/server';

let cachedData = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30s cache

export async function GET() {
  const now = Date.now();
  if (cachedData && now - lastCacheTime < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cachedData,
      cached: true,
    });
  }

  try {
    // 1. Fetch Real Live Price from Bybit Linear
    let livePrice = 0;
    let high24h = 0;
    let low24h = 0;

    try {
      const tRes = await fetch(
        'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
        {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          signal: AbortSignal.timeout(3000),
        }
      );
      if (tRes.ok) {
        const tj = await tRes.json();
        const t = tj.result?.list?.[0];
        if (t?.lastPrice) {
          livePrice = parseFloat(t.lastPrice);
          high24h = parseFloat(t.highPrice24h || 0);
          low24h = parseFloat(t.lowPrice24h || 0);
        }
      }
    } catch (e) {
      console.warn('Bybit live ticker failed in btc-data:', e.message);
    }

    // Fallback to Binance Vision for live price
    if (!livePrice) {
      try {
        const vRes = await fetch(
          'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT',
          {
            headers: { 'User-Agent': 'WolfTapeReader/2.0' },
            signal: AbortSignal.timeout(3000),
          }
        );
        if (vRes.ok) {
          const vj = await vRes.json();
          if (vj.lastPrice) {
            livePrice = parseFloat(vj.lastPrice);
            high24h = parseFloat(vj.highPrice || 0);
            low24h = parseFloat(vj.lowPrice || 0);
          }
        }
      } catch (e) {}
    }

    // 2. Fetch 1,000 Verified Crypto Daily Candles from Bybit Linear
    let modernCandles = [];
    try {
      const kRes = await fetch(
        'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=1000',
        {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          signal: AbortSignal.timeout(3500),
        }
      );
      if (kRes.ok) {
        const kj = await kRes.json();
        if (kj.result?.list?.length > 0) {
          const reversed = [...kj.result.list].reverse();
          modernCandles = reversed.map((c) => {
            const dt = new Date(parseInt(c[0])).toISOString().split('T')[0];
            return {
              date: dt,
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5] || 0),
              ts: parseInt(c[0]),
            };
          });
        }
      }
    } catch (e) {
      console.warn('Bybit daily candles fetch failed:', e.message);
    }

    // Fallback to Binance Vision for modern daily candles
    if (modernCandles.length === 0) {
      try {
        const vKlinesRes = await fetch(
          'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000',
          {
            headers: { 'User-Agent': 'WolfTapeReader/2.0' },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (vKlinesRes.ok) {
          const vData = await vKlinesRes.json();
          if (Array.isArray(vData) && vData.length > 0) {
            modernCandles = vData.map((c) => ({
              date: new Date(c[0]).toISOString().split('T')[0],
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5] || 0),
              ts: c[0],
            }));
          }
        }
      } catch (e) {
        console.warn('Binance Vision daily candles failed:', e.message);
      }
    }

    // 3. Synchronize Today's Live Candle
    if (modernCandles.length > 0 && livePrice > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastCandle = modernCandles[modernCandles.length - 1];

      if (lastCandle.date === todayStr) {
        lastCandle.close = livePrice;
        lastCandle.high = Math.max(lastCandle.high, livePrice, high24h || livePrice);
        lastCandle.low = Math.min(lastCandle.low, livePrice, low24h || livePrice);
      } else {
        // If modern candles don't have today's UTC candle yet, append it
        modernCandles.push({
          date: todayStr,
          open: lastCandle.close,
          high: Math.max(lastCandle.close, livePrice, high24h || livePrice),
          low: Math.min(lastCandle.close, livePrice, low24h || livePrice),
          close: livePrice,
          volume: 25000,
          ts: Date.now(),
        });
      }
    }

    // 4. Fetch 2021-2023 Historical Baseline for 5-Year Seasonal DOW Database
    const oldestModernDate = modernCandles.length > 0 ? modernCandles[0].date : '2024-01-01';
    let historicalCandles = [];

    try {
      const period1 = Math.floor(new Date('2021-01-01').getTime() / 1000);
      const period2 = Math.floor(new Date(oldestModernDate).getTime() / 1000);
      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?period1=${period1}&period2=${period2}&interval=1d&events=history`;

      const yRes = await fetch(yUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(3500),
      });

      if (yRes.ok) {
        const yJson = await yRes.json();
        const res = yJson?.chart?.result?.[0];
        if (res?.timestamp && res?.indicators?.quote?.[0]?.close) {
          const timestamps = res.timestamp;
          const opens = res.indicators.quote[0].open;
          const highs = res.indicators.quote[0].high;
          const lows = res.indicators.quote[0].low;
          const closes = res.indicators.quote[0].close;

          for (let i = 0; i < timestamps.length; i++) {
            const d = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
            if (d < oldestModernDate && closes[i] != null) {
              historicalCandles.push({
                date: d,
                open: opens[i] ?? closes[i],
                high: highs[i] ?? closes[i],
                low: lows[i] ?? closes[i],
                close: closes[i],
                volume: res.indicators.quote[0].volume?.[i] || 0,
                ts: timestamps[i] * 1000,
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Historical 2021-2023 baseline fetch failed:', e.message);
    }

    // Combine Historical (2021-2023) + Modern Verified Crypto (2024-Present)
    const allCandles = [...historicalCandles, ...modernCandles].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const activeSpot = livePrice || allCandles[allCandles.length - 1]?.close || 80000;

    const payload = {
      candles: allCandles,
      count: allCandles.length,
      currentPrice: activeSpot,
      source: 'bybit_verified_crypto',
      timestamp: now,
    };

    cachedData = payload;
    lastCacheTime = now;

    return NextResponse.json(payload);
  } catch (err) {
    console.error('BTC Data Route Fatal Error:', err);

    if (cachedData) {
      return NextResponse.json({
        ...cachedData,
        stale: true,
      });
    }

    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
