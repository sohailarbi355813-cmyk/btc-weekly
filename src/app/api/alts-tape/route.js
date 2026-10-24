import { NextResponse } from 'next/server';
import { ALTS_WHITELIST } from '@/lib/altsData';
import pivotsData from '@/lib/pivotsData.json';

let cachedSmaMap = new Map();
let lastSmaFetchTimestamp = 0;
const SMA_CACHE_TTL = 5 * 60 * 1000; // 5-minute cache

async function get4H200SmaMap() {
  const now = Date.now();
  if (now - lastSmaFetchTimestamp < SMA_CACHE_TTL && cachedSmaMap.size > 0) {
    return cachedSmaMap;
  }

  const symbols = ALTS_WHITELIST.map((a) => a.symbol);
  const CHUNK_SIZE = 15;
  const newMap = new Map();

  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (sym) => {
      // 1. Bybit Linear 4H Kline
      try {
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=240&limit=200`, {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          signal: AbortSignal.timeout(4000),
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.result?.list && json.result.list.length >= 20) {
            const list = json.result.list;
            const closes = list.map((k) => parseFloat(k[4])).filter((n) => !isNaN(n));
            const count = Math.min(closes.length, 200);
            const sma = closes.slice(0, count).reduce((a, b) => a + b, 0) / count;
            newMap.set(sym, { sma: Number(sma.toFixed(6)), count });
            return;
          }
        }
      } catch (err) {}

      // 2. Fallback: Binance Vision 4H Kline
      try {
        const bRes = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=4h&limit=200`, {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          signal: AbortSignal.timeout(3500),
          cache: 'no-store',
        });
        if (bRes.ok) {
          const bList = await bRes.json();
          if (Array.isArray(bList) && bList.length >= 20) {
            const closes = bList.map((k) => parseFloat(k[4])).filter((n) => !isNaN(n));
            const count = Math.min(closes.length, 200);
            const sma = closes.slice(0, count).reduce((a, b) => a + b, 0) / count;
            newMap.set(sym, { sma: Number(sma.toFixed(6)), count });
          }
        }
      } catch (err) {}
    });

    await Promise.allSettled(promises);
  }

  if (newMap.size > 0) {
    cachedSmaMap = newMap;
    lastSmaFetchTimestamp = now;
  }
  return cachedSmaMap;
}

export async function GET() {
  try {
    // 1. Fetch live 24h ticker tape from Bybit Linear
    let bybitMap = new Map();
    try {
      const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result?.list) {
          json.result.list.forEach((t) => bybitMap.set(t.symbol, t));
        }
      }
    } catch (e) {
      console.warn('Bybit linear tickers fetch failed:', e.message);
    }

    // Fallback: If Bybit had an issue, fetch from Binance Vision 24hr tickers
    if (bybitMap.size === 0) {
      try {
        const bRes = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr', {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          signal: AbortSignal.timeout(3500),
          cache: 'no-store',
        });
        if (bRes.ok) {
          const bList = await bRes.json();
          bList.forEach((t) => {
            bybitMap.set(t.symbol, {
              symbol: t.symbol,
              lastPrice: t.lastPrice,
              price24hPcnt: (parseFloat(t.priceChangePercent) / 100).toString(),
              turnover24h: t.quoteVolume || t.volume || '0',
              highPrice24h: t.highPrice,
              lowPrice24h: t.lowPrice,
            });
          });
        }
      } catch (e) {
        console.error('Binance fallback failed:', e.message);
      }
    }

    // Fetch or read cached 4H 200 SMA map
    const sma200Map = await get4H200SmaMap();

    // Distance formatter: positive formatted with yellow, negative in white
    function formatDist(spot, pivotLevel, label) {
      if (!pivotLevel || !spot) {
        return { dist: 0, text: '--', isPos: true, isClose: false, level: 0, label };
      }
      const d = ((spot - pivotLevel) / pivotLevel) * 100;
      const isPos = d >= 0;
      const absD = Math.abs(d);
      const isClose = absD <= 1.2;

      let text;
      if (absD < 1.0) {
        text = d.toFixed(1);
        if (text === '0.0' || text === '-0.0') text = '0.1';
      } else if (absD < 10) {
        text = (d >= 0 ? '+' : '') + d.toFixed(1);
      } else {
        text = (d >= 0 ? '+' : '') + Math.round(d);
      }

      return {
        dist: Number(d.toFixed(2)),
        text,
        isPos,
        isClose,
        level: Number(pivotLevel.toFixed(4)),
        label,
      };
    }

    const bullishList = [];
    const bearishList = [];
    const allCoinsList = [];

    ALTS_WHITELIST.forEach((item) => {
      const ticker = bybitMap.get(item.symbol);
      let spot = ticker ? parseFloat(ticker.lastPrice) : item.yo;

      const p = pivotsData[item.symbol];
      if (!p) return;

      const shortSymbol = item.symbol.replace('1000', '').replace('USDT', '');

      // Ticker Metrics
      const change24h = ticker ? parseFloat((parseFloat(ticker.price24hPcnt) * 100).toFixed(2)) : 0;
      const turnover24h = ticker ? Math.round(parseFloat(ticker.turnover24h || 0)) : 0;
      const fundingRate = ticker ? parseFloat((parseFloat(ticker.fundingRate || 0) * 100).toFixed(4)) : 0;
      const high24h = ticker ? parseFloat(ticker.highPrice24h || spot) : spot;
      const low24h = ticker ? parseFloat(ticker.lowPrice24h || spot) : spot;
      const prevPrice1h = ticker?.prevPrice1h ? parseFloat(ticker.prevPrice1h) : null;
      const change1h = prevPrice1h ? parseFloat((((spot - prevPrice1h) / prevPrice1h) * 100).toFixed(2)) : 0;

      // 4H 200 SMA Calculation
      const smaData = sma200Map.get(item.symbol);
      const sma200_4h = smaData ? smaData.sma : null;
      let distSma200_4h = null;
      let distSma200Text = '--';
      let isNear4HSma200 = false;
      let isAt4HSma200 = false;

      if (sma200_4h && spot) {
        distSma200_4h = Number((((spot - sma200_4h) / sma200_4h) * 100).toFixed(2));
        distSma200Text = (distSma200_4h >= 0 ? '+' : '') + distSma200_4h.toFixed(1) + '%';
        const absDist = Math.abs(distSma200_4h);
        isNear4HSma200 = absDist >= 1.0 && absDist <= 3.0;
        isAt4HSma200 = absDist <= 3.0;
      }

      // ─── 1. Bullish State Calculation ───
      // Rule: Must be ABOVE all VALs (small dip wick >= -1.5% is allowed, e.g. -0.1%, but NOT -33%).
      // And must be currently testing at least one VAL as support (between -1.5% and +3.5%).
      const pY_val = formatDist(spot, p.py.val, 'pY VAL');
      const Y_val = formatDist(spot, p.y.val, 'Y VAL');
      const pQ_val = formatDist(spot, p.pq.val, 'pQ VAL');
      const Q_val = formatDist(spot, p.q.val, 'Q VAL');
      const pM_val = formatDist(spot, p.pm.val, 'pM VAL');
      const M_val = formatDist(spot, p.m.val, 'M VAL');
      const pW_val = formatDist(spot, p.pw.val, 'pW VAL');
      const W_val = formatDist(spot, p.w.val, 'W VAL');

      const valArr = [pY_val, Y_val, pQ_val, Q_val, pM_val, M_val, pW_val, W_val];
      const allAboveVAL = valArr.every((x) => x.dist >= -1.5);
      const isTestingValSupport = valArr.some((x) => x.dist >= -1.5 && x.dist <= 3.5);

      if (allAboveVAL && isTestingValSupport) {
        const closestVal = valArr.reduce((prev, curr) => (Math.abs(curr.dist) < Math.abs(prev.dist) ? curr : prev), valArr[0]);
        
        // Timeframe classification of closest support
        let tfType = 'macro';
        if (closestVal.label.includes('W')) tfType = 'weekly';
        else if (closestVal.label.includes('M')) tfType = 'monthly';

        // Confluence & Bleed classification
        let grade = 'CONFIRMED_BULL';
        let gradeLabel = 'Confirmed Bull';
        let isBleeding = change24h < 0;

        if (change24h < -1.0) {
          grade = 'BLEED_TRAP';
          gradeLabel = 'Bleed Warning ⚠️';
        } else if (Math.abs(closestVal.dist) <= 1.5 && change24h >= 0) {
          grade = 'SWEET_SPOT';
          gradeLabel = 'Sweet Spot Entry';
        } else if (change24h >= 3.0) {
          grade = 'MOMENTUM_LEADER';
          gradeLabel = 'Momentum Leader';
        }

        bullishList.push({
          symbol: shortSymbol,
          fullSymbol: item.displaySymbol,
          name: item.name,
          spot: spot,
          pY: pY_val,
          Y: Y_val,
          pQ: pQ_val,
          Q: Q_val,
          pM: pM_val,
          M: M_val,
          pW: pW_val,
          W: W_val,
          state: 'BULL',
          minAbsDist: Math.abs(closestVal.dist),
          closest: closestVal,
          change24h,
          change1h,
          turnover24h,
          fundingRate,
          high24h,
          low24h,
          tfType,
          grade,
          gradeLabel,
          isBleeding,
          sma200_4h,
          distSma200_4h,
          distSma200Text,
          isNear4HSma200,
          isAt4HSma200,
        });
      }

      // ─── 2. Bearish State Calculation ───
      // Rule: Must be BELOW all VAHs (small wick <= +1.5% allowed).
      // And must be currently testing at least one VAH as resistance (between -3.5% and +1.5%).
      const pY_vah = formatDist(spot, p.py.vah, 'pY VAH');
      const Y_vah = formatDist(spot, p.y.vah, 'Y VAH');
      const pQ_vah = formatDist(spot, p.pq.vah, 'pQ VAH');
      const Q_vah = formatDist(spot, p.q.vah, 'Q VAH');
      const pM_vah = formatDist(spot, p.pm.vah, 'pM VAH');
      const M_vah = formatDist(spot, p.m.vah, 'M VAH');
      const pW_vah = formatDist(spot, p.pw.vah, 'pW VAH');
      const W_vah = formatDist(spot, p.w.vah, 'W VAH');

      const vahArr = [pY_vah, Y_vah, pQ_vah, Q_vah, pM_vah, M_vah, pW_vah, W_vah];
      const allBelowVAH = vahArr.every((x) => x.dist <= 1.5);
      const isTestingVahResistance = vahArr.some((x) => x.dist >= -3.5 && x.dist <= 1.5);

      if (allBelowVAH && isTestingVahResistance) {
        const closestVah = vahArr.reduce((prev, curr) => (Math.abs(curr.dist) < Math.abs(prev.dist) ? curr : prev), vahArr[0]);
        
        let tfType = 'macro';
        if (closestVah.label.includes('W')) tfType = 'weekly';
        else if (closestVah.label.includes('M')) tfType = 'monthly';

        let grade = 'CONFIRMED_BEAR';
        let gradeLabel = 'Confirmed Bear';
        let isPumping = change24h > 1.5;

        if (change24h > 1.5) {
          grade = 'SQUEEZE_TRAP';
          gradeLabel = 'Squeeze Trap ⚠️';
        } else if (Math.abs(closestVah.dist) <= 1.5 && change24h <= 0) {
          grade = 'SWEET_SPOT_SHORT';
          gradeLabel = 'Sweet Spot Short';
        } else if (change24h <= -3.0) {
          grade = 'HEAVY_BREAKDOWN';
          gradeLabel = 'Heavy Breakdown';
        }

        bearishList.push({
          symbol: shortSymbol,
          fullSymbol: item.displaySymbol,
          name: item.name,
          spot: spot,
          pY: pY_vah,
          Y: Y_vah,
          pQ: pQ_vah,
          Q: Q_vah,
          pM: pM_vah,
          M: M_vah,
          pW: pW_vah,
          W: W_vah,
          state: 'BEAR',
          minAbsDist: Math.abs(closestVah.dist),
          closest: closestVah,
          change24h,
          change1h,
          turnover24h,
          fundingRate,
          high24h,
          low24h,
          tfType,
          grade,
          gradeLabel,
          isPumping,
          sma200_4h,
          distSma200_4h,
          distSma200Text,
          isNear4HSma200,
          isAt4HSma200,
        });
      }

      // ─── 3. Global All-Coins Registry (Full Scan Support) ───
      const allPivots = [...valArr, ...vahArr];
      const nearestAnyPivot = allPivots.reduce((prev, curr) => (Math.abs(curr.dist) < Math.abs(prev.dist) ? curr : prev), allPivots[0]);

      let generalState = 'ROTATION';
      let generalGrade = 'INSIDE_VA';
      let generalGradeLabel = 'Inside Value Area';

      if (allAboveVAL) {
        generalState = 'BULL';
        if (change24h < -1.0) {
          generalGrade = 'BLEED_TRAP';
          generalGradeLabel = 'Bleed Warning ⚠️';
        } else if (change24h >= 3.0) {
          generalGrade = 'MOMENTUM_RUNNER';
          generalGradeLabel = 'Momentum Bull';
        } else {
          generalGrade = 'CONFIRMED_BULL';
          generalGradeLabel = 'Confirmed Bull';
        }
      } else if (allBelowVAH) {
        generalState = 'BEAR';
        if (change24h > 1.5) {
          generalGrade = 'SQUEEZE_TRAP';
          generalGradeLabel = 'Squeeze Trap ⚠️';
        } else if (change24h <= -3.0) {
          generalGrade = 'HEAVY_BREAKDOWN';
          generalGradeLabel = 'Heavy Breakdown';
        } else {
          generalGrade = 'CONFIRMED_BEAR';
          generalGradeLabel = 'Confirmed Bear';
        }
      }

      allCoinsList.push({
        symbol: shortSymbol,
        fullSymbol: item.displaySymbol,
        name: item.name,
        spot: spot,
        pY: pY_val,
        Y: Y_val,
        pQ: pQ_val,
        Q: Q_val,
        pM: pM_val,
        M: M_val,
        pW: pW_val,
        W: W_val,
        state: generalState,
        minAbsDist: Math.abs(nearestAnyPivot.dist),
        closest: nearestAnyPivot,
        change24h,
        change1h,
        turnover24h,
        fundingRate,
        high24h,
        low24h,
        grade: generalGrade,
        gradeLabel: generalGradeLabel,
        isBleeding: change24h < 0,
        sma200_4h,
        distSma200_4h,
        distSma200Text,
        isNear4HSma200,
        isAt4HSma200,
      });
    });

    // Sort by proximity to nearest pivot (coins testing support / resistance closest at top)
    bullishList.sort((a, b) => a.minAbsDist - b.minAbsDist);
    bearishList.sort((a, b) => a.minAbsDist - b.minAbsDist);
    allCoinsList.sort((a, b) => a.minAbsDist - b.minAbsDist);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      bullishStates: bullishList,
      bearishStates: bearishList,
      allCoins: allCoinsList,
      totalCount: ALTS_WHITELIST.length,
    });
  } catch (error) {
    console.error('Value Area API error:', error);
    return NextResponse.json(
      { success: false, error: error.message, bullishStates: [], bearishStates: [], allCoins: [] },
      { status: 500 }
    );
  }
}
