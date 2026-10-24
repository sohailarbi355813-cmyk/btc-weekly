import { ALTS_WHITELIST } from './altsData';

/**
 * Calculate Wilder's Smoothed RSI (standard TradingView formula)
 */
export function calculateRSI(closes, period = 14) {
  if (!closes || closes.length <= period) return [];
  const rsi = new Array(closes.length).fill(null);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

/**
 * Detect Regular and Hidden Bullish/Bearish Divergences between Price and RSI
 */
export function detectDivergences(candles, left = 2, right = 2) {
  if (!candles || candles.length < 35) {
    return { divergences: [], currentRsi: null, peaks: [], troughs: [] };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const rsi = calculateRSI(closes, 14);

  const peaks = [];
  const troughs = [];

  // Identify local swing peaks & troughs
  for (let i = left; i < candles.length - right; i++) {
    if (!rsi[i]) continue;

    // Swing Peak (High)
    let isPeak = true;
    for (let j = 1; j <= left; j++) {
      if (highs[i] < highs[i - j]) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) {
      for (let j = 1; j <= right; j++) {
        if (highs[i] < highs[i + j]) {
          isPeak = false;
          break;
        }
      }
    }
    if (isPeak) {
      peaks.push({
        idx: i,
        price: highs[i],
        rsi: rsi[i],
        time: candles[i].time,
      });
    }

    // Swing Trough (Low)
    let isTrough = true;
    for (let j = 1; j <= left; j++) {
      if (lows[i] > lows[i - j]) {
        isTrough = false;
        break;
      }
    }
    if (isTrough) {
      for (let j = 1; j <= right; j++) {
        if (lows[i] > lows[i + j]) {
          isTrough = false;
          break;
        }
      }
    }
    if (isTrough) {
      troughs.push({
        idx: i,
        price: lows[i],
        rsi: rsi[i],
        time: candles[i].time,
      });
    }
  }

  const currentIdx = candles.length - 1;
  const divergences = [];

  // 1. Bearish Divergence Detection (Comparing recent peaks)
  if (peaks.length >= 2) {
    const p2 = peaks[peaks.length - 1]; // Most recent peak
    const p1 = peaks[peaks.length - 2]; // Previous peak
    const barsAgo = currentIdx - p2.idx;
    const span = p2.idx - p1.idx;

    // Actionable if formed recently (within last 15 bars) and well spaced (3-40 bars)
    if (barsAgo <= 15 && span >= 3 && span <= 40) {
      const priceDiff = p2.price - p1.price;
      const priceDiffPcnt = Number(((priceDiff / p1.price) * 100).toFixed(2));
      const rsiDiff = Number((p2.rsi - p1.rsi).toFixed(1));

      // Regular Bearish Divergence: Price Higher High (HH), RSI Lower High (LH)
      if (p2.price > p1.price && p2.rsi < p1.rsi) {
        divergences.push({
          type: 'REGULAR_BEARISH',
          direction: 'BEAR',
          label: 'Regular Bearish Divergence',
          shortLabel: 'Bear Div (HH/LH)',
          description: `Price printed Higher High (+${priceDiffPcnt}%) while RSI printed Lower High (${rsiDiff} pts)`,
          priceAction: 'Higher High (HH)',
          rsiAction: 'Lower High (LH)',
          price1: p1.price,
          price2: p2.price,
          priceDiffPcnt,
          rsi1: Number(p1.rsi.toFixed(1)),
          rsi2: Number(p2.rsi.toFixed(1)),
          rsiDiff,
          barsAgo,
          span,
          isStrong: Math.abs(rsiDiff) >= 4.0 || priceDiffPcnt >= 2.0,
        });
      }
      // Hidden Bearish Divergence: Price Lower High (LH), RSI Higher High (HH)
      else if (p2.price < p1.price && p2.rsi > p1.rsi) {
        divergences.push({
          type: 'HIDDEN_BEARISH',
          direction: 'BEAR',
          label: 'Hidden Bearish Divergence',
          shortLabel: 'Hidden Bear Div',
          description: `Price printed Lower High (${priceDiffPcnt}%) while RSI printed Higher High (+${rsiDiff} pts)`,
          priceAction: 'Lower High (LH)',
          rsiAction: 'Higher High (HH)',
          price1: p1.price,
          price2: p2.price,
          priceDiffPcnt,
          rsi1: Number(p1.rsi.toFixed(1)),
          rsi2: Number(p2.rsi.toFixed(1)),
          rsiDiff,
          barsAgo,
          span,
          isStrong: Math.abs(rsiDiff) >= 4.0,
        });
      }
    }
  }

  // 2. Bullish Divergence Detection (Comparing recent troughs)
  if (troughs.length >= 2) {
    const t2 = troughs[troughs.length - 1]; // Most recent trough
    const t1 = troughs[troughs.length - 2]; // Previous trough
    const barsAgo = currentIdx - t2.idx;
    const span = t2.idx - t1.idx;

    if (barsAgo <= 15 && span >= 3 && span <= 40) {
      const priceDiff = t2.price - t1.price;
      const priceDiffPcnt = Number(((priceDiff / t1.price) * 100).toFixed(2));
      const rsiDiff = Number((t2.rsi - t1.rsi).toFixed(1));

      // Regular Bullish Divergence: Price Lower Low (LL), RSI Higher Low (HL)
      if (t2.price < t1.price && t2.rsi > t1.rsi) {
        divergences.push({
          type: 'REGULAR_BULLISH',
          direction: 'BULL',
          label: 'Regular Bullish Divergence',
          shortLabel: 'Bull Div (LL/HL)',
          description: `Price printed Lower Low (${priceDiffPcnt}%) while RSI printed Higher Low (+${rsiDiff} pts)`,
          priceAction: 'Lower Low (LL)',
          rsiAction: 'Higher Low (HL)',
          price1: t1.price,
          price2: t2.price,
          priceDiffPcnt,
          rsi1: Number(t1.rsi.toFixed(1)),
          rsi2: Number(t2.rsi.toFixed(1)),
          rsiDiff,
          barsAgo,
          span,
          isStrong: Math.abs(rsiDiff) >= 4.0 || Math.abs(priceDiffPcnt) >= 2.0,
        });
      }
      // Hidden Bullish Divergence: Price Higher Low (HL), RSI Lower Low (LL)
      else if (t2.price > t1.price && t2.rsi < t1.rsi) {
        divergences.push({
          type: 'HIDDEN_BULLISH',
          direction: 'BULL',
          label: 'Hidden Bullish Divergence',
          shortLabel: 'Hidden Bull Div',
          description: `Price printed Higher Low (+${priceDiffPcnt}%) while RSI printed Lower Low (${rsiDiff} pts)`,
          priceAction: 'Higher Low (HL)',
          rsiAction: 'Lower Low (LL)',
          price1: t1.price,
          price2: t2.price,
          priceDiffPcnt,
          rsi1: Number(t1.rsi.toFixed(1)),
          rsi2: Number(t2.rsi.toFixed(1)),
          rsiDiff,
          barsAgo,
          span,
          isStrong: Math.abs(rsiDiff) >= 4.0,
        });
      }
    }
  }

  const currentRsi = rsi[rsi.length - 1] ? Number(rsi[rsi.length - 1].toFixed(1)) : null;

  return {
    divergences,
    currentRsi,
    peaksCount: peaks.length,
    troughsCount: troughs.length,
  };
}

// In-Memory Cache Store for 1H and 4H
const divergenceCache = {
  '4h': { data: null, timestamp: 0 },
  '1h': { data: null, timestamp: 0 },
};
const CACHE_TTL = 90 * 1000; // 90 seconds cache

/**
 * Scan all 55 whitelisted alts for RSI Divergences on specified timeframe
 */
export async function scanAltsDivergences(timeframe = '4h') {
  const tf = timeframe === '1h' ? '1h' : '4h';
  const now = Date.now();

  if (divergenceCache[tf].data && now - divergenceCache[tf].timestamp < CACHE_TTL) {
    return divergenceCache[tf].data;
  }

  const interval = tf === '1h' ? '60' : '240';
  const limit = tf === '1h' ? '80' : '100';
  const CHUNK_SIZE = 15;
  const allResults = [];

  for (let i = 0; i < ALTS_WHITELIST.length; i += CHUNK_SIZE) {
    const chunk = ALTS_WHITELIST.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (item) => {
      let candles = null;

      // 1. Bybit Linear Kline
      try {
        const res = await fetch(
          `https://api.bybit.com/v5/market/kline?category=linear&symbol=${item.symbol}&interval=${interval}&limit=${limit}`,
          {
            headers: { 'User-Agent': 'WolfDivergenceScanner/1.0' },
            signal: AbortSignal.timeout(4000),
            cache: 'no-store',
          }
        );
        if (res.ok) {
          const json = await res.json();
          if (json.result?.list && json.result.list.length >= 35) {
            candles = json.result.list.slice().reverse().map((k) => ({
              time: parseInt(k[0]),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              vol: parseFloat(k[5]),
            }));
          }
        }
      } catch (err) {}

      // 2. Fallback: Binance Vision
      if (!candles) {
        try {
          const bTf = tf === '1h' ? '1h' : '4h';
          const bRes = await fetch(
            `https://data-api.binance.vision/api/v3/klines?symbol=${item.symbol}&interval=${bTf}&limit=${limit}`,
            {
              headers: { 'User-Agent': 'WolfDivergenceScanner/1.0' },
              signal: AbortSignal.timeout(3500),
              cache: 'no-store',
            }
          );
          if (bRes.ok) {
            const bList = await bRes.json();
            if (Array.isArray(bList) && bList.length >= 35) {
              candles = bList.map((k) => ({
                time: parseInt(k[0]),
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                vol: parseFloat(k[5]),
              }));
            }
          }
        } catch (err) {}
      }

      const shortSymbol = item.symbol.replace('1000', '').replace('USDT', '');
      if (!candles) {
        return {
          symbol: shortSymbol,
          fullSymbol: item.displaySymbol,
          name: item.name,
          spot: item.yo,
          currentRsi: null,
          divergences: [],
          hasBullishDiv: false,
          hasBearishDiv: false,
          primaryDiv: null,
        };
      }

      const analysis = detectDivergences(candles);
      const hasBullishDiv = analysis.divergences.some((d) => d.direction === 'BULL');
      const hasBearishDiv = analysis.divergences.some((d) => d.direction === 'BEAR');

      return {
        symbol: shortSymbol,
        fullSymbol: item.displaySymbol,
        name: item.name,
        spot: candles[candles.length - 1].close,
        currentRsi: analysis.currentRsi,
        divergences: analysis.divergences,
        hasBullishDiv,
        hasBearishDiv,
        primaryDiv: analysis.divergences[0] || null,
      };
    });

    const chunkResults = await Promise.allSettled(promises);
    chunkResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) {
        allResults.push(r.value);
      }
    });
  }

  const bullishCoins = allResults.filter((c) => c.hasBullishDiv);
  const bearishCoins = allResults.filter((c) => c.hasBearishDiv);

  const payload = {
    success: true,
    timeframe: tf,
    timestamp: now,
    totalScanned: allResults.length,
    bullishCount: bullishCoins.length,
    bearishCount: bearishCoins.length,
    bullishCoins,
    bearishCoins,
    allCoins: allResults,
  };

  divergenceCache[tf] = { data: payload, timestamp: now };
  return payload;
}
