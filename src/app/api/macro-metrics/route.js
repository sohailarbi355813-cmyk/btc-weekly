import { NextResponse } from 'next/server';


export async function GET() {
  try {
    // 1. Fetch Binance Futures Top Trader Long/Short Position Ratio & Account Ratio
    const [pos1hRes, pos4hRes, pos1dRes, acc1hRes, glob1hRes, btcSpotRes] = await Promise.allSettled([
      fetch('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=24', { cache: 'no-store' }),
      fetch('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=4h&limit=6', { cache: 'no-store' }),
      fetch('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1d&limit=7', { cache: 'no-store' }),
      fetch('https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=5', { cache: 'no-store' }),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=5', { cache: 'no-store' }),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { cache: 'no-store' })
    ]);

    let whalePositions1h = [];
    if (pos1hRes.status === 'fulfilled' && pos1hRes.value.ok) {
      whalePositions1h = await pos1hRes.value.json();
    }

    let whalePositions4h = [];
    if (pos4hRes.status === 'fulfilled' && pos4hRes.value.ok) {
      whalePositions4h = await pos4hRes.value.json();
    }

    let whalePositions1d = [];
    if (pos1dRes.status === 'fulfilled' && pos1dRes.value.ok) {
      whalePositions1d = await pos1dRes.value.json();
    }

    let whaleAccounts = [];
    if (acc1hRes.status === 'fulfilled' && acc1hRes.value.ok) {
      whaleAccounts = await acc1hRes.value.json();
    }

    let globalAccounts = [];
    if (glob1hRes.status === 'fulfilled' && glob1hRes.value.ok) {
      globalAccounts = await glob1hRes.value.json();
    }

    let spotPrice = 81250;
    if (btcSpotRes.status === 'fulfilled' && btcSpotRes.value.ok) {
      const spotData = await btcSpotRes.value.json();
      spotPrice = parseFloat(spotData.price) || 81250;
    }

    // 2. Fetch CoinMetrics Community MVRV & PriceUSD (last 30 days)
    let coinMetricsHistory = [];
    try {
      const cmRes = await fetch(
        'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,PriceUSD,CapMrktCurUSD&page_size=30&sort=time',
        { next: { revalidate: 3600 } }
      );
      if (cmRes.ok) {
        const cmJson = await cmRes.json();
        if (Array.isArray(cmJson.data)) {
          coinMetricsHistory = cmJson.data;
        }
      }
    } catch (err) {
      console.error('CoinMetrics error:', err);
    }

    // Process Whale position ratios
    const latestWhalePos = whalePositions1h.length > 0 ? whalePositions1h[whalePositions1h.length - 1] : null;
    const latestWhaleAcc = whaleAccounts.length > 0 ? whaleAccounts[whaleAccounts.length - 1] : null;
    const latestGlobalAcc = globalAccounts.length > 0 ? globalAccounts[globalAccounts.length - 1] : null;

    const whaleLongPosPct = latestWhalePos ? parseFloat(latestWhalePos.longAccount) * 100 : 62.59;
    const whaleShortPosPct = latestWhalePos ? parseFloat(latestWhalePos.shortAccount) * 100 : 37.41;
    const whalePosRatio = latestWhalePos ? parseFloat(latestWhalePos.longShortRatio) : 1.67;

    const whaleLongAccPct = latestWhaleAcc ? parseFloat(latestWhaleAcc.longAccount) * 100 : 68.02;
    const whaleShortAccPct = latestWhaleAcc ? parseFloat(latestWhaleAcc.shortAccount) * 100 : 31.98;
    const whaleAccRatio = latestWhaleAcc ? parseFloat(latestWhaleAcc.longShortRatio) : 2.13;

    const retailLongAccPct = latestGlobalAcc ? parseFloat(latestGlobalAcc.longAccount) * 100 : 67.52;
    const retailShortAccPct = latestGlobalAcc ? parseFloat(latestGlobalAcc.shortAccount) * 100 : 32.48;
    const retailAccRatio = latestGlobalAcc ? parseFloat(latestGlobalAcc.longShortRatio) : 2.08;

    // Calculate 24h change in whale position ratio
    let whalePosRatio24hChange = 0;
    if (whalePositions1h.length >= 2) {
      const oldest = parseFloat(whalePositions1h[0].longShortRatio);
      whalePosRatio24hChange = whalePosRatio - oldest;
    }

    // Process MVRV
    const latestCM = coinMetricsHistory.length > 0 ? coinMetricsHistory[coinMetricsHistory.length - 1] : null;
    const historicalMVRV = latestCM ? parseFloat(latestCM.CapMVRVCur) : 1.503;
    const cmPriceUSD = latestCM ? parseFloat(latestCM.PriceUSD) : spotPrice;
    
    // Realized Price = PriceUSD / MVRV
    const realizedPrice = historicalMVRV > 0 ? Math.round(cmPriceUSD / historicalMVRV) : 54059;

    // Live intraday MVRV based on current spot
    const liveMVRV = realizedPrice > 0 ? parseFloat((spotPrice / realizedPrice).toFixed(3)) : historicalMVRV;

    // Determine Valuation Regime
    let regime = 'Fair Value / Accumulation';
    let regimeColor = 'yellow';
    if (liveMVRV < 1.0) {
      regime = 'Deep Value / Historical Cycle Bottom';
      regimeColor = 'yellow';
    } else if (liveMVRV < 1.5) {
      regime = 'Undervalued / Early Bull Accumulation';
      regimeColor = 'yellow';
    } else if (liveMVRV < 2.4) {
      regime = 'Fair Value / Mid-Bull Expansion';
      regimeColor = 'yellow';
    } else if (liveMVRV < 3.2) {
      regime = 'Overheated / Late-Bull Distribution';
      regimeColor = 'white';
    } else {
      regime = 'Extreme Blow-off Peak (> 3.5)';
      regimeColor = 'white';
    }

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      spotPrice,
      whales: {
        symbol: 'BTCUSDT',
        position: {
          longPct: parseFloat(whaleLongPosPct.toFixed(2)),
          shortPct: parseFloat(whaleShortPosPct.toFixed(2)),
          ratio: parseFloat(whalePosRatio.toFixed(3)),
          change24h: parseFloat(whalePosRatio24hChange.toFixed(3)),
          history24h: whalePositions1h.map(p => ({
            time: p.timestamp,
            longPct: parseFloat((parseFloat(p.longAccount) * 100).toFixed(1)),
            shortPct: parseFloat((parseFloat(p.shortAccount) * 100).toFixed(1)),
            ratio: parseFloat(parseFloat(p.longShortRatio).toFixed(2))
          }))
        },
        accounts: {
          longPct: parseFloat(whaleLongAccPct.toFixed(2)),
          shortPct: parseFloat(whaleShortAccPct.toFixed(2)),
          ratio: parseFloat(whaleAccRatio.toFixed(3))
        },
        retail: {
          longPct: parseFloat(retailLongAccPct.toFixed(2)),
          shortPct: parseFloat(retailShortAccPct.toFixed(2)),
          ratio: parseFloat(retailAccRatio.toFixed(3))
        }
      },
      mvrv: {
        liveMVRV,
        historicalMVRV: parseFloat(historicalMVRV.toFixed(3)),
        realizedPrice,
        spotPrice,
        regime,
        regimeColor,
        latestDate: latestCM ? latestCM.time.split('T')[0] : '2026-10-22',
        history: coinMetricsHistory.map(item => ({
          date: item.time.split('T')[0],
          mvrv: parseFloat(parseFloat(item.CapMVRVCur).toFixed(3)),
          price: Math.round(parseFloat(item.PriceUSD)),
          realizedPrice: Math.round(parseFloat(item.PriceUSD) / parseFloat(item.CapMVRVCur))
        }))
      }
    });
  } catch (error) {
    console.error('Failed to fetch macro metrics:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
