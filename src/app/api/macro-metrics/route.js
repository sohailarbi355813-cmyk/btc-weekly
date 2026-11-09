import { NextResponse } from 'next/server';


export async function GET() {
  try {
    // 1. Fetch Exchange Long/Short Ratios & Reliable Live Spot (Bybit + Binance Vision fallbacks)
    const [pos1hRes, acc1hRes, glob1hRes, bybitSpotRes, visionSpotRes, bybitLsRes] = await Promise.allSettled([
      fetch('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=24', { cache: 'no-store', signal: AbortSignal.timeout(3500) }),
      fetch('https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=5', { cache: 'no-store', signal: AbortSignal.timeout(3500) }),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=5', { cache: 'no-store', signal: AbortSignal.timeout(3500) }),
      fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT', { cache: 'no-store', signal: AbortSignal.timeout(3000) }),
      fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT', { cache: 'no-store', signal: AbortSignal.timeout(3000) }),
      fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=24', { cache: 'no-store', signal: AbortSignal.timeout(3500) })
    ]);

    let whalePositions1h = [];
    if (pos1hRes.status === 'fulfilled' && pos1hRes.value.ok) {
      const parsed = await pos1hRes.value.json();
      if (Array.isArray(parsed)) whalePositions1h = parsed;
    }

    // Fallback to Bybit 1h Account Long/Short Ratio if Binance fapi is geo-blocked
    if (whalePositions1h.length === 0 && bybitLsRes.status === 'fulfilled' && bybitLsRes.value.ok) {
      const bj = await bybitLsRes.value.json();
      const bList = bj?.result?.list;
      if (Array.isArray(bList) && bList.length > 0) {
        whalePositions1h = [...bList].reverse().map((item) => {
          const buy = parseFloat(item.buyRatio || 0.5);
          const sell = parseFloat(item.sellRatio || 0.5);
          return {
            timestamp: parseInt(item.timestamp, 10),
            longAccount: String(buy),
            shortAccount: String(sell),
            longShortRatio: String(sell > 0 ? buy / sell : 1),
          };
        });
      }
    }

    let whaleAccounts = [];
    if (acc1hRes.status === 'fulfilled' && acc1hRes.value.ok) {
      const parsed = await acc1hRes.value.json();
      if (Array.isArray(parsed)) whaleAccounts = parsed;
    }

    let globalAccounts = [];
    if (glob1hRes.status === 'fulfilled' && glob1hRes.value.ok) {
      const parsed = await glob1hRes.value.json();
      if (Array.isArray(parsed)) globalAccounts = parsed;
    }

    let spotPrice = 0;
    if (bybitSpotRes.status === 'fulfilled' && bybitSpotRes.value.ok) {
      const bj = await bybitSpotRes.value.json();
      spotPrice = parseFloat(bj?.result?.list?.[0]?.lastPrice || 0);
    }
    if (!spotPrice && visionSpotRes.status === 'fulfilled' && visionSpotRes.value.ok) {
      const vj = await visionSpotRes.value.json();
      spotPrice = parseFloat(vj?.price || 0);
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

    const whaleLongPosPct = latestWhalePos ? parseFloat(latestWhalePos.longAccount) * 100 : 50;
    const whaleShortPosPct = latestWhalePos ? parseFloat(latestWhalePos.shortAccount) * 100 : 50;
    const whalePosRatio = latestWhalePos ? parseFloat(latestWhalePos.longShortRatio) : 1;

    const whaleLongAccPct = latestWhaleAcc ? parseFloat(latestWhaleAcc.longAccount) * 100 : whaleLongPosPct;
    const whaleShortAccPct = latestWhaleAcc ? parseFloat(latestWhaleAcc.shortAccount) * 100 : whaleShortPosPct;
    const whaleAccRatio = latestWhaleAcc ? parseFloat(latestWhaleAcc.longShortRatio) : whalePosRatio;

    const retailLongAccPct = latestGlobalAcc ? parseFloat(latestGlobalAcc.longAccount) * 100 : 50;
    const retailShortAccPct = latestGlobalAcc ? parseFloat(latestGlobalAcc.shortAccount) * 100 : 50;
    const retailAccRatio = latestGlobalAcc ? parseFloat(latestGlobalAcc.longShortRatio) : 1;

    // Calculate 24h change in whale position ratio
    let whalePosRatio24hChange = 0;
    if (whalePositions1h.length >= 2) {
      const oldest = parseFloat(whalePositions1h[0].longShortRatio);
      whalePosRatio24hChange = whalePosRatio - oldest;
    }

    // Process MVRV
    const latestCM = coinMetricsHistory.length > 0 ? coinMetricsHistory[coinMetricsHistory.length - 1] : null;
    const historicalMVRV = latestCM ? parseFloat(latestCM.CapMVRVCur) : 0;
    const cmPriceUSD = latestCM ? parseFloat(latestCM.PriceUSD) : 0;
    if (!spotPrice) spotPrice = cmPriceUSD || 80000;

    // Realized Price = PriceUSD / MVRV
    const realizedPrice = historicalMVRV > 0 && cmPriceUSD > 0 ? Math.round(cmPriceUSD / historicalMVRV) : 0;

    // Live intraday MVRV based on current spot
    const liveMVRV = realizedPrice > 0 ? parseFloat((spotPrice / realizedPrice).toFixed(3)) : historicalMVRV;

    // Determine Valuation Regime
    let regime = 'Unavailable';
    let regimeColor = 'yellow';
    if (liveMVRV <= 0) {
      regime = 'Unavailable';
      regimeColor = 'white';
    } else if (liveMVRV < 1.0) {
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
        latestDate: latestCM ? latestCM.time.split('T')[0] : '',
        history: coinMetricsHistory.map(item => {
          const mvrvVal = parseFloat(item.CapMVRVCur);
          const priceVal = parseFloat(item.PriceUSD);
          return {
            date: item.time.split('T')[0],
            mvrv: Number.isFinite(mvrvVal) ? parseFloat(mvrvVal.toFixed(3)) : 0,
            price: Number.isFinite(priceVal) ? Math.round(priceVal) : 0,
            realizedPrice: mvrvVal > 0 && Number.isFinite(priceVal) ? Math.round(priceVal / mvrvVal) : 0,
          };
        })
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
