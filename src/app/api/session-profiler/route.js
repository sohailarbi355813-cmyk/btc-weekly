import { NextResponse } from 'next/server';
import { analyzeSessions } from '@/lib/sessionProfilerEngine';

export async function GET() {
  try {
    let hourlyCandles = [];

    // 1. Primary: Binance 1h klines (1000 candles = ~41.6 days of historical data)
    try {
      const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000', {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        next: { revalidate: 300 }, // 5 min cache
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          hourlyCandles = data.map(c => [
            c[0], // open time ms
            c[1], // open
            c[2], // high
            c[3], // low
            c[4], // close
            c[5], // volume
          ]);
        }
      }
    } catch (binanceErr) {
      console.warn('Binance 1h fetch failed:', binanceErr.message);
    }

    // 2. Fallback: Bybit linear 60m kline
    if (hourlyCandles.length === 0) {
      try {
        const bRes = await fetch('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&limit=1000', {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          next: { revalidate: 300 },
        });
        if (bRes.ok) {
          const bJson = await bRes.json();
          if (bJson.result?.list && bJson.result.list.length > 0) {
            // Bybit returns newest first, so reverse to chronological
            hourlyCandles = bJson.result.list.reverse().map(c => [
              parseInt(c[0], 10), // startTime
              c[1], // open
              c[2], // high
              c[3], // low
              c[4], // close
              c[5], // volume
            ]);
          }
        }
      } catch (bybitErr) {
        console.error('Bybit 1h fallback failed:', bybitErr.message);
      }
    }

    if (hourlyCandles.length === 0) {
      throw new Error('Failed to retrieve 1h candle telemetry from both Binance and Bybit.');
    }

    const sessionData = analyzeSessions(hourlyCandles);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      data: sessionData,
    });
  } catch (err) {
    console.error('Session Profiler Route Error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
