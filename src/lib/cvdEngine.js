import { ALTS_WHITELIST } from './altsData.js';

// Bitcoin definition to include alongside 55 whitelisted alts
export const BTC_ASSET = {
  symbol: 'BTCUSDT',
  displaySymbol: 'BTCUSDT.P',
  name: 'Bitcoin',
  isBtc: true,
  decimals: 1,
};

// Full list of 56 assets: BTC first, followed by all 55 whitelisted alts
export const CVD_WATCHLIST = [BTC_ASSET, ...ALTS_WHITELIST];

/**
 * Detect Swing Highs (Peaks) and Swing Lows (Troughs)
 */
function findSwings(candles, left = 2, right = 2) {
  const peaks = [];
  const troughs = [];

  for (let i = left; i < candles.length - right; i++) {
    const cur = candles[i];
    let isPeak = true;
    let isTrough = true;

    for (let j = 1; j <= left; j++) {
      if (cur.high < candles[i - j].high) isPeak = false;
      if (cur.low > candles[i - j].low) isTrough = false;
    }
    for (let j = 1; j <= right; j++) {
      if (cur.high < candles[i + j].high) isPeak = false;
      if (cur.low > candles[i + j].low) isTrough = false;
    }

    if (isPeak) {
      peaks.push({
        idx: i,
        price: cur.high,
        cvd: cur.cvd,
        time: cur.time,
        deltaUsd: cur.deltaUsd,
      });
    }
    if (isTrough) {
      troughs.push({
        idx: i,
        price: cur.low,
        cvd: cur.cvd,
        time: cur.time,
        deltaUsd: cur.deltaUsd,
      });
    }
  }

  return { peaks, troughs };
}

/**
 * Detect Price Action (PA) vs Cumulative Volume Delta (CVD) Divergences
 */
export function detectCvdDivergences(candles, left = 2, right = 2) {
  if (!candles || candles.length < 25) {
    return {
      divergences: [],
      currentCvd: 0,
      net24hDelta: 0,
      peaksCount: 0,
      troughsCount: 0,
    };
  }

  const { peaks, troughs } = findSwings(candles, left, right);
  const divergences = [];
  const n = candles.length;

  // 1. Analyze Bearish Divergences between Peaks (Highs)
  for (let i = peaks.length - 1; i >= 1; i--) {
    const p2 = peaks[i];     // More recent peak
    const p1 = peaks[i - 1]; // Older peak

    const span = p2.idx - p1.idx;
    if (span < 2 || span > 25) continue;

    const barsAgo = n - 1 - p2.idx;
    if (barsAgo > 15) continue; // Only consider recent formations

    const priceDiffPcnt = Number((((p2.price - p1.price) / p1.price) * 100).toFixed(2));
    const cvdDiff = p2.cvd - p1.cvd;

    // Regular Bearish CVD Divergence (Buyer Exhaustion)
    // Price makes Higher High (or equal high), but CVD prints Lower High
    if (p2.price >= p1.price && p2.cvd < p1.cvd) {
      divergences.push({
        type: 'REGULAR_BEARISH_CVD',
        direction: 'BEAR',
        category: 'EXHAUSTION',
        label: 'Bearish CVD Exhaustion',
        shortLabel: 'Bear CVD (HH/LH)',
        description: `Price pushed higher (+${priceDiffPcnt}%), but CVD printed a Lower High (-$${(Math.abs(cvdDiff) / 1e6).toFixed(2)}M). Aggressive market buying is drying up.`,
        priceAction: 'Higher High (HH)',
        cvdAction: 'Lower High (LH)',
        price1: p1.price,
        price2: p2.price,
        priceDiffPcnt,
        cvd1: p1.cvd,
        cvd2: p2.cvd,
        cvdDiff,
        barsAgo,
        span,
        isStrong: Math.abs(priceDiffPcnt) >= 1.5 || Math.abs(cvdDiff) >= 5e6,
      });
    }
    // Absorption Bearish CVD Divergence (Passive Limit Seller Absorption / Trapped Longs)
    // CVD makes aggressive Higher High, but Price fails to make Higher High (Lower High or stall)
    else if (p2.price < p1.price && p2.cvd > p1.cvd) {
      divergences.push({
        type: 'ABSORPTION_BEARISH_CVD',
        direction: 'BEAR',
        category: 'ABSORPTION',
        label: 'Bearish CVD Absorption (Trapped Longs)',
        shortLabel: 'Bear Absorption (LH/HH)',
        description: `CVD surged to Higher High (+$${(Math.abs(cvdDiff) / 1e6).toFixed(2)}M), but Price printed Lower High (${priceDiffPcnt}%). Massive aggressive buying absorbed by limit sellers.`,
        priceAction: 'Lower High (LH)',
        cvdAction: 'Higher High (HH)',
        price1: p1.price,
        price2: p2.price,
        priceDiffPcnt,
        cvd1: p1.cvd,
        cvd2: p2.cvd,
        cvdDiff,
        barsAgo,
        span,
        isStrong: true,
      });
    }
  }

  // 2. Analyze Bullish Divergences between Troughs (Lows)
  for (let i = troughs.length - 1; i >= 1; i--) {
    const t2 = troughs[i];     // More recent trough
    const t1 = troughs[i - 1]; // Older trough

    const span = t2.idx - t1.idx;
    if (span < 2 || span > 25) continue;

    const barsAgo = n - 1 - t2.idx;
    if (barsAgo > 15) continue; // Only consider recent formations

    const priceDiffPcnt = Number((((t2.price - t1.price) / t1.price) * 100).toFixed(2));
    const cvdDiff = t2.cvd - t1.cvd;

    // Regular Bullish CVD Divergence (Seller Exhaustion)
    // Price makes Lower Low (or equal low), but CVD prints Higher Low
    if (t2.price <= t1.price && t2.cvd > t1.cvd) {
      divergences.push({
        type: 'REGULAR_BULLISH_CVD',
        direction: 'BULL',
        category: 'EXHAUSTION',
        label: 'Bullish CVD Exhaustion',
        shortLabel: 'Bull CVD (LL/HL)',
        description: `Price broke lower (${priceDiffPcnt}%), but CVD printed a Higher Low (+$${(Math.abs(cvdDiff) / 1e6).toFixed(2)}M). Aggressive selling dried up.`,
        priceAction: 'Lower Low (LL)',
        cvdAction: 'Higher Low (HL)',
        price1: t1.price,
        price2: t2.price,
        priceDiffPcnt,
        cvd1: t1.cvd,
        cvd2: t2.cvd,
        cvdDiff,
        barsAgo,
        span,
        isStrong: Math.abs(priceDiffPcnt) >= 1.5 || Math.abs(cvdDiff) >= 5e6,
      });
    }
    // Absorption Bullish CVD Divergence (Passive Limit Buyer Absorption / Trapped Shorts)
    // CVD plunges to Lower Low, but Price refuses to break lower (Higher Low)
    else if (t2.price > t1.price && t2.cvd < t1.cvd) {
      divergences.push({
        type: 'ABSORPTION_BULLISH_CVD',
        direction: 'BULL',
        category: 'ABSORPTION',
        label: 'Bullish CVD Absorption (Trapped Shorts)',
        shortLabel: 'Bull Absorption (HL/LL)',
        description: `CVD dropped to Lower Low (-$${(Math.abs(cvdDiff) / 1e6).toFixed(2)}M), but Price printed Higher Low (+${priceDiffPcnt}%). Massive market dumping absorbed by limit buyers.`,
        priceAction: 'Higher Low (HL)',
        cvdAction: 'Lower Low (LL)',
        price1: t1.price,
        price2: t2.price,
        priceDiffPcnt,
        cvd1: t1.cvd,
        cvd2: t2.cvd,
        cvdDiff,
        barsAgo,
        span,
        isStrong: true,
      });
    }
  }

  const currentCvd = candles[candles.length - 1].cvd;
  // Net 24h delta: sum of last 24 1h candles or equivalent
  const net24hDelta = candles.slice(-24).reduce((sum, c) => sum + (c.deltaUsd || 0), 0);

  return {
    divergences,
    currentCvd,
    net24hDelta,
    peaksCount: peaks.length,
    troughsCount: troughs.length,
  };
}

// In-Memory Cache Store for 30m, 1h, 2h, 3h, 4h
const cvdCache = {
  '30m': { data: null, timestamp: 0 },
  '1h': { data: null, timestamp: 0 },
  '2h': { data: null, timestamp: 0 },
  '3h': { data: null, timestamp: 0 },
  '4h': { data: null, timestamp: 0 },
};
const CACHE_TTL = 60 * 1000; // 60 seconds memory cache

/**
 * Scan BTC and all 55 whitelisted alts for CVD Divergences
 * @param {'30m' | '1h' | '2h' | '3h' | '4h'} timeframe
 */
export async function scanCvdDivergences(timeframe = '1h') {
  const validTfs = ['30m', '1h', '2h', '3h', '4h'];
  const tf = validTfs.includes(timeframe) ? timeframe : '1h';
  const now = Date.now();

  // Return cached result if fresh
  if (cvdCache[tf]?.data && now - cvdCache[tf].timestamp < CACHE_TTL) {
    return cvdCache[tf].data;
  }

  // Fetch parameters
  // Note: For 3h, we fetch 90 candles on 1h and aggregate into 30 candles of 3h
  const fetchInterval = tf === '3h' ? '1h' : tf;
  const limit = tf === '3h' ? 90 : 60;
  const CHUNK_SIZE = 15;
  const allResults = [];

  for (let i = 0; i < CVD_WATCHLIST.length; i += CHUNK_SIZE) {
    const chunk = CVD_WATCHLIST.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (item) => {
      let rawCandles = null;
      const cleanSym = item.symbol.replace('1000', '');

      // 1. Fetch from Binance Vision (includes exact Taker Buy Base and Quote Volume)
      try {
        const res = await fetch(
          `https://data-api.binance.vision/api/v3/klines?symbol=${cleanSym}&interval=${fetchInterval}&limit=${limit}`,
          {
            headers: { 'User-Agent': 'WolfCvdScanner/1.0' },
            signal: AbortSignal.timeout(3500),
            cache: 'no-store',
          }
        );
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length >= 20) {
            rawCandles = list.map((k) => {
              const totalQuote = parseFloat(k[7]);
              const takerBuyQuote = parseFloat(k[10]);
              const deltaUsd = takerBuyQuote - (totalQuote - takerBuyQuote);
              return {
                time: parseInt(k[0]),
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                totalQuote,
                takerBuyQuote,
                deltaUsd,
              };
            });
          }
        }
      } catch (err) {}

      // 2. Fallback: Bybit Linear Klines for memecoins not listed on Binance Spot
      if (!rawCandles) {
        try {
          const bybitIntervalMap = { '30m': '30', '1h': '60', '2h': '120', '3h': '60', '4h': '240' };
          const bybitInterval = bybitIntervalMap[tf] || '60';
          const bybitLimit = tf === '3h' ? 90 : 60;
          const bRes = await fetch(
            `https://api.bybit.com/v5/market/kline?category=linear&symbol=${item.symbol}&interval=${bybitInterval}&limit=${bybitLimit}`,
            {
              headers: { 'User-Agent': 'WolfCvdScanner/1.0' },
              signal: AbortSignal.timeout(3500),
              cache: 'no-store',
            }
          );
          if (bRes.ok) {
            const bJson = await bRes.json();
            if (bJson.result?.list && bJson.result.list.length >= 20) {
              rawCandles = bJson.result.list
                .slice()
                .reverse()
                .map((k) => {
                  const open = parseFloat(k[1]);
                  const high = parseFloat(k[2]);
                  const low = parseFloat(k[3]);
                  const close = parseFloat(k[4]);
                  const turnover = parseFloat(k[6]) || parseFloat(k[5]) * close;
                  // Intra-candle directional volume delta proxy for un-split tape
                  const range = high - low || 1;
                  const ratio = ((close - low) / range) * 2 - 1; // -1 (max bear) to +1 (max bull)
                  const deltaUsd = turnover * ratio;
                  return {
                    time: parseInt(k[0]),
                    open,
                    high,
                    low,
                    close,
                    totalQuote: turnover,
                    takerBuyQuote: turnover * Math.max(0, ratio),
                    deltaUsd,
                  };
                });
            }
          }
        } catch (err) {}
      }

      // If timeframe is 3h, aggregate 1h candles into 3h chunks
      let candles = rawCandles;
      if (rawCandles && tf === '3h') {
        const aggregated = [];
        const remainder = rawCandles.length % 3;
        const aligned = rawCandles.slice(remainder);
        for (let j = 0; j < aligned.length; j += 3) {
          const cChunk = aligned.slice(j, j + 3);
          const totalQuote = cChunk.reduce((s, c) => s + (c.totalQuote || 0), 0);
          const deltaUsd = cChunk.reduce((s, c) => s + (c.deltaUsd || 0), 0);
          aggregated.push({
            time: cChunk[0].time,
            open: cChunk[0].open,
            high: Math.max(...cChunk.map((c) => c.high)),
            low: Math.min(...cChunk.map((c) => c.low)),
            close: cChunk[cChunk.length - 1].close,
            totalQuote,
            deltaUsd,
          });
        }
        candles = aggregated;
      }

      const shortSymbol = item.symbol.replace('1000', '').replace('USDT', '');

      if (!candles || candles.length < 15) {
        return {
          symbol: shortSymbol,
          fullSymbol: item.displaySymbol || `${item.symbol}.P`,
          name: item.name,
          isBtc: !!item.isBtc,
          price: null,
          currentCvd: 0,
          net24hDelta: 0,
          divergences: [],
          hasBullishDiv: false,
          hasBearishDiv: false,
          primaryDiv: null,
        };
      }

      // Calculate running Cumulative Volume Delta (CVD)
      let runningCvd = 0;
      candles.forEach((c) => {
        runningCvd += c.deltaUsd;
        c.cvd = runningCvd;
      });

      const analysis = detectCvdDivergences(candles);
      const hasBullishDiv = analysis.divergences.some((d) => d.direction === 'BULL');
      const hasBearishDiv = analysis.divergences.some((d) => d.direction === 'BEAR');

      // Sort divergences: closest formation first (lowest barsAgo)
      const sortedDivs = analysis.divergences.sort((a, b) => a.barsAgo - b.barsAgo);

      return {
        symbol: shortSymbol,
        fullSymbol: item.displaySymbol || `${item.symbol}.P`,
        name: item.name,
        isBtc: !!item.isBtc,
        price: candles[candles.length - 1].close,
        currentCvd: analysis.currentCvd,
        net24hDelta: analysis.net24hDelta,
        divergences: sortedDivs,
        hasBullishDiv,
        hasBearishDiv,
        primaryDiv: sortedDivs[0] || null,
      };
    });

    const chunkResults = await Promise.allSettled(promises);
    chunkResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) {
        allResults.push(r.value);
      }
    });
  }

  // Separate BTC and Alts
  const btcItem = allResults.find((c) => c.isBtc) || null;
  const altsItems = allResults.filter((c) => !c.isBtc);

  const bullishCoins = allResults.filter((c) => c.hasBullishDiv);
  const bearishCoins = allResults.filter((c) => c.hasBearishDiv);

  const payload = {
    success: true,
    timeframe: tf,
    timestamp: now,
    totalScanned: allResults.length,
    bullishCount: bullishCoins.length,
    bearishCount: bearishCoins.length,
    btc: btcItem,
    bullishCoins,
    bearishCoins,
    allCoins: allResults,
  };

  cvdCache[tf] = { data: payload, timestamp: now };
  return payload;
}
