import { ALTS_WHITELIST, MAJOR_SYMBOLS, WHITELIST_MAP } from './altsData.js';
import { aggregateCandlesByMinutes } from './rsiScannerEngine.js';

export const CONFLUENCE_ENGINE_VERSION = 1;
export const CONFLUENCE_TIMEFRAMES = ['1h', '2h', '3h', '4h'];
export const VWAP_ANCHORS = ['week', 'month', 'quarter', 'year'];
export const VWAP_LABELS = {
  week: 'Weekly VWAP',
  month: 'Monthly VWAP',
  quarter: 'Quarterly VWAP',
  year: 'Yearly VWAP',
};
export const VWAP_SHORT_LABELS = {
  week: 'W-VWAP',
  month: 'M-VWAP',
  quarter: 'Q-VWAP',
  year: 'Y-VWAP',
};

export const TARGET_SCAN_COINS = 100;
export const MAX_STORED_SPREAD_PCT = 3.0; // Store alignments up to 3.0% so UI filters cleanly down to 0.5%

const EXCLUDED_STABLE_SYMBOLS = new Set([
  'USDCUSDT',
  'FDUSDUSDT',
  'TUSDUSDT',
  'USDEUSDT',
  'USD1USDT',
  'BUSDUSDT',
  'DAIUSDT',
  'EURCUSDT',
  'PYUSDUSDT',
  'USDDUSDT',
  'RLUSDUSDT',
]);

function inferDecimals(price, fallback = 4) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n >= 1000) return 1;
  if (n >= 100) return 2;
  if (n >= 1) return 3;
  if (n >= 0.05) return 4;
  if (n >= 0.005) return 5;
  return 6;
}

function formatDisplaySymbol(symbol) {
  if (symbol.startsWith('1000') && symbol.endsWith('USDT')) {
    return `${symbol.slice(4)}.P`;
  }
  return `${symbol}.P`;
}

/**
 * Fetch top ~100 USDT perpetuals by 24h turnover from Bybit Linear (with Binance Vision fallback),
 * always preserving all curated ALTS_WHITELIST coins (BTC, ETH, SOL + watchlist).
 */
export async function fetchTopLinearCoins(targetCount = TARGET_SCAN_COINS) {
  const tickerList = [];

  // 1. Bybit Linear Tickers (ranked by 24h USD turnover)
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      headers: { 'User-Agent': 'WolfConfluenceScanner/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.result?.list)) {
        for (const t of json.result.list) {
          const sym = (t.symbol || '').toUpperCase();
          if (!/^[A-Z0-9]+USDT$/.test(sym) || EXCLUDED_STABLE_SYMBOLS.has(sym)) continue;
          const lastPrice = parseFloat(t.lastPrice);
          const turnover24h = parseFloat(t.turnover24h || 0);
          if (!Number.isFinite(lastPrice) || lastPrice <= 0 || turnover24h <= 0) continue;
          tickerList.push({ symbol: sym, lastPrice, turnover24h });
        }
      }
    }
  } catch (e) {}

  // 2. Binance Vision Fallback if Bybit tickers unavailable
  if (tickerList.length < 30) {
    try {
      const bRes = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr', {
        headers: { 'User-Agent': 'WolfConfluenceScanner/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (bRes.ok) {
        const bList = await bRes.json();
        if (Array.isArray(bList)) {
          for (const t of bList) {
            const sym = (t.symbol || '').toUpperCase();
            if (!/^[A-Z0-9]+USDT$/.test(sym) || EXCLUDED_STABLE_SYMBOLS.has(sym)) continue;
            const lastPrice = parseFloat(t.lastPrice);
            const turnover24h = parseFloat(t.quoteVolume || 0);
            if (!Number.isFinite(lastPrice) || lastPrice <= 0 || turnover24h <= 0) continue;
            tickerList.push({ symbol: sym, lastPrice, turnover24h });
          }
        }
      }
    } catch (e) {}
  }

  tickerList.sort((a, b) => b.turnover24h - a.turnover24h);
  const tickerInfoMap = new Map();
  tickerList.forEach((t, idx) => {
    if (!tickerInfoMap.has(t.symbol)) {
      tickerInfoMap.set(t.symbol, { ...t, volumeRank: idx + 1 });
    }
  });

  const merged = new Map();

  // Guarantee Majors + full ALTS_WHITELIST first
  for (const coin of ALTS_WHITELIST) {
    const tk = tickerInfoMap.get(coin.symbol);
    merged.set(coin.symbol, {
      symbol: coin.symbol,
      displaySymbol: coin.displaySymbol,
      name: coin.name,
      decimals: coin.decimals ?? inferDecimals(tk?.lastPrice || coin.yo, 4),
      lastPrice: tk?.lastPrice || null,
      turnover24h: tk?.turnover24h || 0,
      volumeRank: tk?.volumeRank || null,
      isMajor: MAJOR_SYMBOLS.includes(coin.symbol),
      isWatchlist: true,
    });
  }

  // Expand cleanly up to targetCount with top-volume linear USDT perpetuals
  for (const t of tickerList) {
    if (merged.size >= targetCount) break;
    if (merged.has(t.symbol)) continue;
    const wl = WHITELIST_MAP.get(t.symbol);
    merged.set(t.symbol, {
      symbol: t.symbol,
      displaySymbol: wl?.displaySymbol || formatDisplaySymbol(t.symbol),
      name: wl?.name || t.symbol.replace(/^1000/, '').replace(/USDT$/, ''),
      decimals: wl?.decimals ?? inferDecimals(t.lastPrice, 4),
      lastPrice: t.lastPrice,
      turnover24h: t.turnover24h,
      volumeRank: tickerInfoMap.get(t.symbol)?.volumeRank || null,
      isMajor: MAJOR_SYMBOLS.includes(t.symbol),
      isWatchlist: Boolean(wl),
    });
  }

  return Array.from(merged.values());
}

/**
 * Fetch klines from Bybit Linear v5 with Binance Vision fallback
 */
async function fetchKlineSeries(symbol, interval, limit) {
  // 1. Bybit Linear Perpetuals
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfConfluenceScanner/1.0' },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.result?.list) && json.result.list.length > 0) {
        return json.result.list
          .slice()
          .reverse()
          .map((k) => ({
            time: parseInt(k[0], 10),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            vol: parseFloat(k[5] || 0),
          }));
      }
    }
  } catch (e) {}

  // 2. Binance Vision Fallback
  try {
    const bIntervalMap = { '60': '1h', '240': '4h', '720': '12h', D: '1d' };
    const bInterval = bIntervalMap[interval] || '1h';
    const bRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfConfluenceScanner/1.0' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList) && bList.length > 0) {
        return bList.map((k) => ({
          time: parseInt(k[0], 10),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          vol: parseFloat(k[5] || 0),
        }));
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Exact TradingView SMA-seeded Exponential Moving Average
 */
export function calculateEMASeries(closes, period = 200) {
  if (!closes || closes.length < period) return null;
  const out = new Array(closes.length).fill(null);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;
  out[period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Compute EMA 200 and 200-MAR lead ribbon bias (ma05 vs ma200 + slope)
 */
export function calculateEMA200AndRibbon(candles) {
  if (!candles || candles.length < 200) return null;
  const closes = candles.map((c) => c.close);
  const ema200Series = calculateEMASeries(closes, 200);
  const ema05Series = calculateEMASeries(closes, 5);
  if (!ema200Series || !ema05Series) return null;

  const lastIdx = candles.length - 1;
  const ema200 = ema200Series[lastIdx];
  const prevEma200 = ema200Series[lastIdx - 1];
  const ema05 = ema05Series[lastIdx];
  const prevEma05 = ema05Series[lastIdx - 1];
  if (!Number.isFinite(ema200) || ema200 <= 0) return null;

  // Match TradingView leadMAColor from user's 200-EMA Ribbon Pine Script
  const ma05Change = prevEma05 !== null ? ema05 - prevEma05 : 0;
  let ribbonColor = 'gray';
  let ribbonLabel = 'Neutral';
  if (ma05Change >= 0 && ema05 > ema200) {
    ribbonColor = 'lime';
    ribbonLabel = 'Bull Expansion (Lime)';
  } else if (ma05Change < 0 && ema05 > ema200) {
    ribbonColor = 'maroon';
    ribbonLabel = 'Bull Pullback (Maroon)';
  } else if (ma05Change <= 0 && ema05 < ema200) {
    ribbonColor = 'red';
    ribbonLabel = 'Bear Expansion (Red)';
  } else if (ma05Change >= 0 && ema05 < ema200) {
    ribbonColor = 'green';
    ribbonLabel = 'Bear Bounce (Green)';
  }

  return {
    ema200,
    prevEma200,
    ema05,
    ribbonColor,
    ribbonLabel,
    emaSlopePct:
      prevEma200 > 0 ? Number((((ema200 - prevEma200) / prevEma200) * 100).toFixed(3)) : 0,
  };
}

/**
 * Compute UTC calendar anchor boundaries (Week, Month, Quarter, Year) matching TradingView Crypto VWAP
 */
export function getVwapAnchorTimestamps(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const utcDow = d.getUTCDay();
  const daysSinceMon = utcDow === 0 ? 6 : utcDow - 1;

  return {
    week: Date.UTC(y, m, day - daysSinceMon, 0, 0, 0, 0),
    month: Date.UTC(y, m, 1, 0, 0, 0, 0),
    quarter: Date.UTC(y, Math.floor(m / 3) * 3, 1, 0, 0, 0, 0),
    year: Date.UTC(y, 0, 1, 0, 0, 0, 0),
  };
}

/**
 * Calculate TradingView-compatible Anchored VWAP (src = hlc3 = (H + L + C) / 3)
 * Disjointly seeds earlier period history from 12h / 4h bars if anchorStart precedes candlesTf[0].
 */
function computeAnchoredVwap(anchorStart, candlesTf, candles4h, candles12h) {
  if (!candlesTf || candlesTf.length === 0) return null;

  let cumPV = 0;
  let cumVol = 0;
  const tfStart = candlesTf[0].time;

  if (anchorStart < tfStart) {
    const start4h = candles4h && candles4h.length > 0 ? candles4h[0].time : tfStart;
    if (anchorStart < start4h && candles12h && candles12h.length > 0) {
      const upper12h = Math.min(start4h, tfStart);
      for (const b of candles12h) {
        if (b.time >= anchorStart && b.time < upper12h && b.vol > 0) {
          const hlc3 = (b.high + b.low + b.close) / 3;
          cumPV += hlc3 * b.vol;
          cumVol += b.vol;
        }
      }
    }

    if (candles4h && candles4h.length > 0 && tfStart > candles4h[0].time) {
      for (const b of candles4h) {
        if (b.time >= anchorStart && b.time < tfStart && b.vol > 0) {
          const hlc3 = (b.high + b.low + b.close) / 3;
          cumPV += hlc3 * b.vol;
          cumVol += b.vol;
        }
      }
    }
  }

  for (const b of candlesTf) {
    if (b.time >= anchorStart && b.vol > 0) {
      const hlc3 = (b.high + b.low + b.close) / 3;
      cumPV += hlc3 * b.vol;
      cumVol += b.vol;
    }
  }

  return cumVol > 0 ? cumPV / cumVol : null;
}

/**
 * Analyze a single coin across 1h, 2h, 3h, 4h for EMA 200 x Anchored VWAP confluence
 */
export function analyzeCoinConfluence(
  coin,
  candles1h,
  candles4h,
  candles12h,
  nowMs = Date.now()
) {
  if (!candles1h || candles1h.length < 200) {
    return null;
  }

  const candles2h = aggregateCandlesByMinutes(candles1h, 120, 2);
  const candles3h = aggregateCandlesByMinutes(candles1h, 180, 3);
  const candles4hFinal =
    candles4h && candles4h.length >= 200
      ? candles4h
      : aggregateCandlesByMinutes(candles1h, 240, 4);

  const tfSeriesMap = {
    '1h': candles1h,
    '2h': candles2h,
    '3h': candles3h,
    '4h': candles4hFinal,
  };

  const spot =
    candles1h[candles1h.length - 1]?.close ||
    candles4hFinal[candles4hFinal.length - 1]?.close ||
    coin.lastPrice;
  if (!Number.isFinite(spot) || spot <= 0) return null;

  const decimals = coin.decimals ?? inferDecimals(spot, 4);
  const anchors = getVwapAnchorTimestamps(nowMs);

  const timeframes = {};
  const alignedTimeframes = [];

  for (const tfId of CONFLUENCE_TIMEFRAMES) {
    const tfCandles = tfSeriesMap[tfId];
    if (!tfCandles || tfCandles.length < 200) continue;

    const emaInfo = calculateEMA200AndRibbon(tfCandles);
    if (!emaInfo) continue;

    const vwaps = {};
    const alignedVwaps = [];

    for (const anchorKey of VWAP_ANCHORS) {
      const vwapVal = computeAnchoredVwap(
        anchors[anchorKey],
        tfCandles,
        candles4hFinal,
        candles12h
      );
      vwaps[anchorKey] = vwapVal;

      if (Number.isFinite(vwapVal) && vwapVal > 0) {
        const spreadPct = Number(
          ((Math.abs(emaInfo.ema200 - vwapVal) / emaInfo.ema200) * 100).toFixed(2)
        );
        if (spreadPct <= MAX_STORED_SPREAD_PCT) {
          alignedVwaps.push({
            anchor: anchorKey,
            label: VWAP_LABELS[anchorKey],
            shortLabel: VWAP_SHORT_LABELS[anchorKey],
            price: vwapVal,
            spreadPct,
          });
        }
      }
    }

    alignedVwaps.sort((a, b) => a.spreadPct - b.spreadPct);

    const tightestSpreadPct = alignedVwaps.length > 0 ? alignedVwaps[0].spreadPct : null;
    const clusterPrices = [emaInfo.ema200, ...alignedVwaps.map((v) => v.price)];
    const clusterLow = Math.min(...clusterPrices);
    const clusterHigh = Math.max(...clusterPrices);
    const clusterMid = (clusterLow + clusterHigh) / 2;
    const distFromSpotPct = Number((((clusterMid - spot) / spot) * 100).toFixed(2));
    const absSpotDistPct = Number(Math.abs(distFromSpotPct).toFixed(2));

    const zoneRole =
      absSpotDistPct <= 1.5
        ? 'TESTING'
        : distFromSpotPct > 0
        ? 'RESISTANCE'
        : 'SUPPORT';

    const tfEntry = {
      timeframe: tfId,
      ema200: emaInfo.ema200,
      ema05: emaInfo.ema05,
      ribbonColor: emaInfo.ribbonColor,
      ribbonLabel: emaInfo.ribbonLabel,
      emaSlopePct: emaInfo.emaSlopePct,
      vwaps,
      alignedVwaps,
      alignedCount: alignedVwaps.length, // how many VWAPs align with EMA 200
      alignedIndicatorCount: alignedVwaps.length > 0 ? 1 + alignedVwaps.length : 0, // out of 5 indicators
      tightestSpreadPct,
      clusterLow,
      clusterHigh,
      clusterMid,
      distFromSpotPct,
      absSpotDistPct,
      zoneRole,
    };

    timeframes[tfId] = tfEntry;

    if (alignedVwaps.length > 0) {
      alignedTimeframes.push(tfEntry);
    }
  }

  // Pick strongest timeframe match (highest aligned indicator count, then tightest spread)
  alignedTimeframes.sort((a, b) => {
    if (b.alignedIndicatorCount !== a.alignedIndicatorCount) {
      return b.alignedIndicatorCount - a.alignedIndicatorCount;
    }
    return (a.tightestSpreadPct ?? 99) - (b.tightestSpreadPct ?? 99);
  });

  const bestMatch = alignedTimeframes[0] || null;
  const maxIndicatorStack = bestMatch ? bestMatch.alignedIndicatorCount : 0;
  const minSpreadPct =
    alignedTimeframes.length > 0
      ? Math.min(...alignedTimeframes.map((m) => m.tightestSpreadPct ?? 99))
      : null;

  // Compute nearest EMA-VWAP spread even if >3% so BTC/ETH/SOL context cards stay informative
  let nearestContext = null;
  if (!bestMatch) {
    const prefOrder = ['4h', '1h', '2h', '3h'];
    for (const tfId of prefOrder) {
      const tf = timeframes[tfId];
      if (!tf) continue;
      let bestAnchor = null;
      let bestPct = Infinity;
      for (const anchorKey of VWAP_ANCHORS) {
        const vv = tf.vwaps?.[anchorKey];
        if (!Number.isFinite(vv) || vv <= 0) continue;
        const pct = Math.abs((tf.ema200 - vv) / tf.ema200) * 100;
        if (pct < bestPct) {
          bestPct = pct;
          bestAnchor = { anchor: anchorKey, shortLabel: VWAP_SHORT_LABELS[anchorKey], price: vv };
        }
      }
      if (bestAnchor) {
        nearestContext = {
          timeframe: tfId,
          ema200: tf.ema200,
          vwapLabel: bestAnchor.shortLabel,
          vwapPrice: bestAnchor.price,
          spreadPct: Number(bestPct.toFixed(2)),
        };
        break;
      }
    }
  }

  // Ranking score
  let score = 0;
  if (bestMatch) {
    score += maxIndicatorStack * 100;
    score += Math.max(0, 40 - (minSpreadPct || 0) * 12);
    if (bestMatch.absSpotDistPct <= 1.5) score += 25; // actively testing zone
    else if (bestMatch.absSpotDistPct <= 5.0) score += 10;
    if (coin.isMajor) score += 8;
  }

  return {
    symbol: coin.symbol,
    displaySymbol: coin.displaySymbol,
    name: coin.name,
    decimals,
    isMajor: coin.isMajor,
    isWatchlist: coin.isWatchlist,
    volumeRank: coin.volumeRank,
    turnover24h: coin.turnover24h,
    price: spot,
    hasConfluence: alignedTimeframes.length > 0,
    matchingTimeframes: alignedTimeframes.map((m) => m.timeframe),
    bestMatch,
    alignedMatches: alignedTimeframes,
    maxIndicatorStack,
    minSpreadPct,
    nearestContext,
    timeframes,
    score: Number(score.toFixed(1)),
  };
}

/**
 * Scan top ~100 linear perpetuals (including BTC, ETH, SOL & watchlist) across 1h, 2h, 3h, 4h
 */
export async function scanAllEmaVwapConfluence() {
  const scanTime = Date.now();
  const universe = await fetchTopLinearCoins(TARGET_SCAN_COINS);
  const allCoins = [];

  const BATCH_SIZE = 10;
  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (coin) => {
      const [candles1h, candles4h, candles12h] = await Promise.all([
        fetchKlineSeries(coin.symbol, '60', 1000),
        fetchKlineSeries(coin.symbol, '240', 600),
        fetchKlineSeries(coin.symbol, '720', 750),
      ]);
      return analyzeCoinConfluence(coin, candles1h, candles4h, candles12h, scanTime);
    });

    const settled = await Promise.allSettled(promises);
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        allCoins.push(r.value);
      }
    }
  }

  allCoins.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.volumeRank || 999) - (b.volumeRank || 999);
  });

  const alignedCoins = allCoins.filter((c) => c.hasConfluence);
  const majorsContext = MAJOR_SYMBOLS.map((sym) =>
    allCoins.find((c) => c.symbol === sym)
  ).filter(Boolean);

  return {
    engineVersion: CONFLUENCE_ENGINE_VERSION,
    scanTime,
    totalUniverse: universe.length,
    totalScanned: allCoins.length,
    alignedCount: alignedCoins.length,
    tightCount: alignedCoins.filter((c) => (c.minSpreadPct ?? 99) <= 1.0).length,
    stackedCount: alignedCoins.filter((c) => c.maxIndicatorStack >= 3).length,
    maxStoredSpreadPct: MAX_STORED_SPREAD_PCT,
    monitoredTimeframes: CONFLUENCE_TIMEFRAMES,
    vwapAnchors: VWAP_ANCHORS,
    majorsContext,
    alignedCoins,
    allCoinsCount: allCoins.length,
  };
}
