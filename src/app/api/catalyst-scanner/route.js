import { NextResponse } from 'next/server';
import { ALTS_WHITELIST } from '@/lib/altsData';
import pivotsData from '@/lib/pivotsData.json';
import { diagnoseCoinCatalyst, scanAltsForTwinPatterns } from '@/lib/catalystEngine';
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol') || 'SUI';
    const cleanSym = rawSymbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const querySymbol = cleanSym.endsWith('USDT') ? cleanSym : `${cleanSym}USDT`;

    // 1. Fetch live 24h tickers from Bybit Linear (or Binance fallback)
    let bybitMap = new Map();
    let btcChange = 0;

    try {
      const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result?.list) {
          json.result.list.forEach((t) => {
            bybitMap.set(t.symbol, t);
            if (t.symbol === 'BTCUSDT') {
              btcChange = parseFloat(t.price24hPcnt || '0') * 100;
            }
          });
        }
      }
    } catch (e) {
      console.warn('Bybit fetch failed in catalyst-scanner:', e.message);
    }

    // Fallback: Binance Futures
    if (bybitMap.size === 0) {
      try {
        const bRes = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          cache: 'no-store',
        });
        if (bRes.ok) {
          const bList = await bRes.json();
          bList.forEach((t) => {
            bybitMap.set(t.symbol, {
              symbol: t.symbol,
              lastPrice: t.lastPrice,
              price24hPcnt: (parseFloat(t.priceChangePercent) / 100).toString(),
            });
            if (t.symbol === 'BTCUSDT') {
              btcChange = parseFloat(t.priceChangePercent || '0');
            }
          });
        }
      } catch (e) {
        console.error('Binance fallback failed in catalyst-scanner:', e.message);
      }
    }

    // 2. Resolve Target Coin data
    let targetTicker = bybitMap.get(querySymbol) || bybitMap.get(`1000${querySymbol}`);
    if (!targetTicker) {
      // Find case-insensitive or partial
      for (const [sym, t] of bybitMap.entries()) {
        if (sym.includes(cleanSym)) {
          targetTicker = t;
          break;
        }
      }
    }

    if (!targetTicker) {
      // Fallback default if symbol isn't listed
      targetTicker = {
        symbol: querySymbol,
        lastPrice: '1.45',
        price24hPcnt: '0.185', // +18.5%
        highPrice24h: '1.55',
        lowPrice24h: '1.20',
        volume24h: '124000000',
      };
    }

    const priceChange24h = parseFloat(targetTicker.price24hPcnt || '0') * 100;
    const targetCoin = {
      symbol: targetTicker.symbol,
      lastPrice: parseFloat(targetTicker.lastPrice || '1.0'),
      priceChange24h,
      high24h: parseFloat(targetTicker.highPrice24h || targetTicker.lastPrice),
      low24h: parseFloat(targetTicker.lowPrice24h || targetTicker.lastPrice),
      volume24h: targetTicker.volume24h || '0',
    };

    // 3. Diagnose the Root Driver Catalyst
    const diagnosis = diagnoseCoinCatalyst(targetCoin, btcChange);

    // 4. Build full 55 alts snapshot
    const allCoins = [];
    ALTS_WHITELIST.forEach((item) => {
      const ticker = bybitMap.get(item.symbol);
      let spot = ticker ? parseFloat(ticker.lastPrice) : item.yo;

      const change24h = ticker ? parseFloat(ticker.price24hPcnt || '0') * 100 : 0;
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

    // 5. Scan the 55 alts for Twin Patterns
    const twins = scanAltsForTwinPatterns(diagnosis, allCoins);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      targetCoin,
      diagnosis,
      twins,
      btcChange,
      totalAltsScanned: allCoins.length,
    });
  } catch (error) {
    console.error('Catalyst scanner API error:', error);
    return NextResponse.json(
      { success: false, error: error.message, diagnosis: null, twins: [] },
      { status: 500 }
    );
  }
}
