import { NextResponse } from 'next/server';
import { ALTS_WHITELIST } from '@/lib/altsData';
import pivotsData from '@/lib/pivotsData.json';
import { diagnoseCoinCatalyst, scanAltsForTwinPatterns } from '@/lib/catalystEngine';

// In-memory 4-second ticker cache to avoid rate limits and keep response time < 15ms
let cachedTickerMap = null;
let cachedBtcChange = 0;
let lastCacheTime = 0;
const CACHE_TTL_MS = 4000;

async function getLiveTickers() {
  const now = Date.now();
  if (cachedTickerMap && now - lastCacheTime < CACHE_TTL_MS) {
    return { tickerMap: cachedTickerMap, btcChange: cachedBtcChange };
  }

  const tickerMap = new Map();
  let btcChange = 0;

  // 1. Primary: Bybit Linear Perpetuals
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      headers: { 'User-Agent': 'WolfTapeReader/2.0' },
      signal: AbortSignal.timeout(3500),
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json();
      if (json.result?.list) {
        json.result.list.forEach((t) => {
          tickerMap.set(t.symbol, {
            symbol: t.symbol,
            lastPrice: parseFloat(t.lastPrice || '0'),
            priceChange24h: parseFloat(t.price24hPcnt || '0') * 100,
            high24h: parseFloat(t.highPrice24h || t.lastPrice || '0'),
            low24h: parseFloat(t.lowPrice24h || t.lastPrice || '0'),
            volume24h: t.volume24h || '0',
          });
          if (t.symbol === 'BTCUSDT') {
            btcChange = parseFloat(t.price24hPcnt || '0') * 100;
          }
        });
      }
    }
  } catch (e) {
    console.warn('Bybit linear tickers fetch failed in catalyst scanner:', e.message);
  }

  // 2. Fallback: Binance Vision 24hr Tickers
  if (tickerMap.size === 0) {
    try {
      const res = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr', {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });
      if (res.ok) {
        const list = await res.json();
        list.forEach((t) => {
          const change = parseFloat(t.priceChangePercent || '0');
          tickerMap.set(t.symbol, {
            symbol: t.symbol,
            lastPrice: parseFloat(t.lastPrice || '0'),
            priceChange24h: change,
            high24h: parseFloat(t.highPrice || t.lastPrice || '0'),
            low24h: parseFloat(t.lowPrice || t.lastPrice || '0'),
            volume24h: t.volume || '0',
          });
          if (t.symbol === 'BTCUSDT') {
            btcChange = change;
          }
        });
      }
    } catch (e) {
      console.warn('Binance Vision fallback failed in catalyst scanner:', e.message);
    }
  }

  if (tickerMap.size > 0) {
    cachedTickerMap = tickerMap;
    cachedBtcChange = btcChange;
    lastCacheTime = now;
  }

  return { tickerMap: cachedTickerMap || tickerMap, btcChange: cachedBtcChange || btcChange };
}

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol') || 'NEAR';
    const cleanSym = rawSymbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const querySymbol = cleanSym.endsWith('USDT') ? cleanSym : `${cleanSym}USDT`;

    const { tickerMap, btcChange } = await getLiveTickers();

    // 1. Resolve Target Coin data
    let targetTicker = tickerMap.get(querySymbol) || tickerMap.get(`1000${querySymbol}`);
    if (!targetTicker) {
      // Direct base symbol lookup (e.g. cleanSym === 'NEAR')
      for (const [sym, t] of tickerMap.entries()) {
        if (sym === `${cleanSym}USDT` || sym === `1000${cleanSym}USDT` || sym.startsWith(cleanSym)) {
          targetTicker = t;
          break;
        }
      }
    }

    // If still not found, try direct single ticker query to Bybit Spot
    if (!targetTicker) {
      try {
        const spotRes = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${cleanSym}USDT`, {
          signal: AbortSignal.timeout(2000),
        });
        if (spotRes.ok) {
          const sJson = await spotRes.json();
          const item = sJson.result?.list?.[0];
          if (item) {
            targetTicker = {
              symbol: item.symbol,
              lastPrice: parseFloat(item.lastPrice || '0'),
              priceChange24h: parseFloat(item.price24hPcnt || '0') * 100,
              high24h: parseFloat(item.highPrice24h || item.lastPrice || '0'),
              low24h: parseFloat(item.lowPrice24h || item.lastPrice || '0'),
              volume24h: item.volume24h || '0',
            };
          }
        }
      } catch (err) {
        // ignore
      }
    }

    if (!targetTicker || targetTicker.lastPrice <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Could not fetch live market price for "${cleanSym}". Please check symbol (e.g. NEAR, SUI, DOGE, TAO, SOL).`,
          diagnosis: null,
          twins: [],
        },
        { status: 404 }
      );
    }

    const targetCoin = {
      symbol: targetTicker.symbol.replace('1000', ''),
      rawSymbol: targetTicker.symbol,
      cleanSymbol: cleanSym.replace('USDT', ''),
      lastPrice: targetTicker.lastPrice,
      priceChange24h: targetTicker.priceChange24h,
      high24h: targetTicker.high24h,
      low24h: targetTicker.low24h,
      volume24h: targetTicker.volume24h,
    };

    // 2. Diagnose Root Catalyst Reason
    const diagnosis = diagnoseCoinCatalyst(targetCoin, btcChange);

    // 3. Build live 55 alts snapshot
    const allCoins = [];
    ALTS_WHITELIST.forEach((item) => {
      const ticker = tickerMap.get(item.symbol);
      const spot = ticker ? ticker.lastPrice : item.yo;
      const change24h = ticker ? ticker.priceChange24h : 0;
      const shortSymbol = item.symbol.replace('1000', '').replace('USDT', '');

      allCoins.push({
        symbol: shortSymbol,
        fullSymbol: item.displaySymbol,
        rawSymbol: item.symbol,
        name: item.name,
        spot,
        change24h,
        yo: item.yo,
      });
    });

    // 4. Scan the 55 alts for Twin Patterns
    const twins = scanAltsForTwinPatterns(diagnosis, allCoins);

    // 5. Compute real live Quick Runners (top gainers and top losers)
    const sortedByChange = [...allCoins].sort((a, b) => b.change24h - a.change24h);
    const topGainers = sortedByChange.slice(0, 4).map((c) => ({
      symbol: c.symbol,
      change: `${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(1)}%`,
      dir: c.change24h >= 0 ? 'pump' : 'dump',
      price: c.spot,
    }));
    const topLosers = sortedByChange.slice(-4).reverse().map((c) => ({
      symbol: c.symbol,
      change: `${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(1)}%`,
      dir: 'dump',
      price: c.spot,
    }));

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      targetCoin,
      diagnosis,
      twins,
      btcChange,
      totalAltsScanned: allCoins.length,
      quickRunners: [...topGainers, ...topLosers],
    });
  } catch (error) {
    console.error('Catalyst scanner API error:', error);
    return NextResponse.json(
      { success: false, error: error.message, diagnosis: null, twins: [] },
      { status: 500 }
    );
  }
}
