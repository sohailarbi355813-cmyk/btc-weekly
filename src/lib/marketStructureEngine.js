import { ALTS_WHITELIST } from './altsData.js';

export const STRUCTURE_TIMEFRAMES = [
  { id: '1h',  label: '1H',  interval: '60',  weight: 0.15 },
  { id: '4h',  label: '4H',  interval: '240', weight: 0.30 },
  { id: '1d',  label: '1D',  interval: 'D',   weight: 0.35 },
  { id: '1w',  label: '1W',  interval: 'W',   weight: 0.20 },
];

/**
 * Detect Swing Points (Pivots) and Market Structure with 2-Candle Confirmation
 * 
 * Strict 2-Candle Confirmation Rule:
 * - Candle 1 (Breakout): Closes strictly beyond previous swing point (close > prevHigh or close < prevLow).
 * - Candle 2 (Confirmation): Must close beyond Candle 1's extreme (close > candle1.high or close < candle1.low).
 * - If Candle 2 fails to exceed Candle 1: Classified as SFP (Swing Failure Pattern / Fakeout), NOT confirmed BOS/MSS.
 */
export function analyzeCandleStructure(candles, swingSize = 3) {
  if (!candles || candles.length < swingSize * 2 + 5) {
    return {
      trend: 'neutral',
      label: 'Neutral',
      score: 50,
      lastEvent: 'Insufficient Data',
      lastClose: candles && candles.length > 0 ? candles[candles.length - 1].close : null,
      swings: { hh: 0, hl: 0, lh: 0, ll: 0 },
      prevHigh: null,
      prevLow: null,
    };
  }

  // 1. Identify Pivot Highs and Lows
  const pivots = [];
  for (let i = swingSize; i < candles.length - swingSize; i++) {
    const curH = candles[i].high;
    const curL = candles[i].low;

    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= swingSize; j++) {
      if (candles[i - j].high >= curH || candles[i + j].high > curH) isHigh = false;
      if (candles[i - j].low <= curL || candles[i + j].low < curL) isLow = false;
    }

    if (isHigh) pivots.push({ type: 'HIGH', price: curH, idx: i, time: candles[i].time });
    if (isLow) pivots.push({ type: 'LOW', price: curL, idx: i, time: candles[i].time });
  }

  // 2. Track Swings and Breakouts bar by bar
  let prevHigh = null;
  let prevLow = null;
  let highActive = false;
  let lowActive = false;
  let lastStructureHigh = null; // 'HH' or 'LH'
  let lastStructureLow = null;  // 'HL' or 'LL'
  let currentTrend = 'neutral';
  let lastEvent = 'Consolidation';
  let prevBreakoutDir = 0; // 1 = bull, -1 = bear

  const swingCounts = { hh: 0, hl: 0, lh: 0, ll: 0 };

  let pendingBullish = null; // { candle1High, level, idx }
  let pendingBearish = null; // { candle1Low, level, idx }

  for (let i = swingSize * 2; i < candles.length; i++) {
    const c = candles[i];

    // Check newly confirmed pivots at this bar
    const newPivot = pivots.find((p) => p.idx === i - swingSize);
    if (newPivot) {
      if (newPivot.type === 'HIGH') {
        if (prevHigh !== null) {
          if (newPivot.price >= prevHigh) {
            lastStructureHigh = 'HH';
            swingCounts.hh++;
          } else {
            lastStructureHigh = 'LH';
            swingCounts.lh++;
          }
        }
        prevHigh = newPivot.price;
        highActive = true;
      } else {
        if (prevLow !== null) {
          if (newPivot.price >= prevLow) {
            lastStructureLow = 'HL';
            swingCounts.hl++;
          } else {
            lastStructureLow = 'LL';
            swingCounts.ll++;
          }
        }
        prevLow = newPivot.price;
        lowActive = true;
      }
    }

    // 2-Candle Confirmation check on immediate next candle (Candle 2)
    if (pendingBullish) {
      if (i === pendingBullish.idx + 1) {
        if (c.close > pendingBullish.candle1High) {
          // Confirmed Valid Bullish Breakout! (Next candle closed strictly above Candle 1 high)
          const isMSS = prevBreakoutDir === -1;
          currentTrend = 'bullish';
          lastEvent = isMSS ? 'Bullish MSS / MSB' : 'Bullish BOS';
          prevBreakoutDir = 1;
          highActive = false;
        } else {
          // Invalid Breakout! (Next candle failed to close above Candle 1 high - SFP / Fakeout)
          lastEvent = 'Bullish SFP (Invalid Breakout)';
          highActive = false;
        }
        pendingBullish = null;
      }
    }

    if (pendingBearish) {
      if (i === pendingBearish.idx + 1) {
        if (c.close < pendingBearish.candle1Low) {
          // Confirmed Valid Bearish Breakout! (Next candle closed strictly below Candle 1 low)
          const isMSS = prevBreakoutDir === 1;
          currentTrend = 'bearish';
          lastEvent = isMSS ? 'Bearish MSS / MSB' : 'Bearish BOS';
          prevBreakoutDir = -1;
          lowActive = false;
        } else {
          // Invalid Breakout! (Next candle failed to close below Candle 1 low - see user diagram)
          lastEvent = 'Bearish SFP (Invalid Breakout)';
          lowActive = false;
        }
        pendingBearish = null;
      }
    }

    // Candle 1 Breakout Detection (Candle closes beyond active swing point)
    if (highActive && prevHigh !== null && c.close > prevHigh && !pendingBullish) {
      pendingBullish = { candle1High: c.high, level: prevHigh, idx: i };
    }
    if (lowActive && prevLow !== null && c.close < prevLow && !pendingBearish) {
      pendingBearish = { candle1Low: c.low, level: prevLow, idx: i };
    }
  }

  // Structure Baseline Fallback
  if (currentTrend === 'neutral') {
    if (lastStructureHigh === 'HH' && lastStructureLow === 'HL') {
      currentTrend = 'bullish';
      lastEvent = 'Higher Highs & Higher Lows';
    } else if (lastStructureHigh === 'LH' && lastStructureLow === 'LL') {
      currentTrend = 'bearish';
      lastEvent = 'Lower Highs & Lower Lows';
    } else if (lastStructureLow === 'HL' && lastStructureHigh !== 'LH') {
      currentTrend = 'bullish';
      lastEvent = 'Higher Low Defense';
    } else if (lastStructureHigh === 'LH' && lastStructureLow !== 'HL') {
      currentTrend = 'bearish';
      lastEvent = 'Lower High Rejection';
    } else {
      currentTrend = 'neutral';
      lastEvent = 'Range Compression / Inside Bar';
    }
  }

  return {
    trend: currentTrend,
    label: currentTrend === 'bullish' ? 'Bullish' : currentTrend === 'bearish' ? 'Bearish' : 'Neutral',
    score: currentTrend === 'bullish' ? 100 : currentTrend === 'bearish' ? 0 : 50,
    lastClose: candles && candles.length > 0 ? candles[candles.length - 1].close : null,
    lastEvent,
    lastStructureHigh,
    lastStructureLow,
    swings: swingCounts,
    prevHigh: prevHigh ? Number(prevHigh.toFixed(5)) : null,
    prevLow: prevLow ? Number(prevLow.toFixed(5)) : null,
  };
}

/**
 * Fetch candles for a coin and interval from Bybit with Binance Vision fallback
 */
async function fetchCandlesForTf(symbol, interval, limit = 50) {
  // 1. Bybit Linear
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfMarketStructure/1.0' },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (res.ok) {
      const json = await res.json();
      if (json.result?.list && json.result.list.length >= 15) {
        return json.result.list.slice().reverse().map((k) => ({
          time: parseInt(k[0]),
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
    const bInterval = interval === '15' ? '15m' : interval === '60' ? '1h' : interval === '240' ? '4h' : interval === 'D' ? '1d' : '1w';
    const bRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfMarketStructure/1.0' },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList) && bList.length >= 15) {
        return bList.map((k) => ({
          time: parseInt(k[0]),
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

// In-Memory Cache for Structure Scan
let cachedStructureData = null;
let lastStructureScanTime = 0;
const STRUCTURE_CACHE_TTL = 45 * 1000; // 45s cache

/**
 * Scan all 55 Altcoins across 15M, 1H, 4H, 1D, 1W and compute Market Structure Trend Matrix
 */
export async function scanAltsMarketStructure() {
  const now = Date.now();
  if (cachedStructureData && now - lastStructureScanTime < STRUCTURE_CACHE_TTL) {
    return cachedStructureData;
  }

  // 1. Fetch live 24h ticker prices from Bybit Linear
  const livePriceMap = new Map();
  try {
    const tRes = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      headers: { 'User-Agent': 'WolfMarketStructure/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (tRes.ok) {
      const tj = await tRes.json();
      if (tj.result?.list) {
        tj.result.list.forEach((t) => {
          livePriceMap.set(t.symbol, {
            price: parseFloat(t.lastPrice),
            change24h: parseFloat(t.price24hPcnt || 0) * 100,
          });
        });
      }
    }
  } catch (e) {}

  // 2. Fallback / Supplement from Binance Vision 24hr Tickers
  try {
    const bRes = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr', {
      headers: { 'User-Agent': 'WolfMarketStructure/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList)) {
        bList.forEach((t) => {
          if (!livePriceMap.has(t.symbol)) {
            livePriceMap.set(t.symbol, {
              price: parseFloat(t.lastPrice),
              change24h: parseFloat(t.priceChangePercent || 0),
            });
          }
        });
      }
    }
  } catch (e) {}

  const results = [];
  const CHUNK_SIZE = 10;

  for (let i = 0; i < ALTS_WHITELIST.length; i += CHUNK_SIZE) {
    const chunk = ALTS_WHITELIST.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (coin) => {
      const ticker = livePriceMap.get(coin.symbol) ||
                     livePriceMap.get(coin.symbol.replace('1000', ''));
      let spotPrice = ticker?.price;
      const change24h = ticker?.change24h || 0;

      // Analyze each timeframe
      const tfResults = {};
      let weightedScoreSum = 0;
      let totalWeight = 0;

      for (const tf of STRUCTURE_TIMEFRAMES) {
        const candles = await fetchCandlesForTf(coin.symbol, tf.interval, 50);
        const swingSize = tf.id === '1w' ? 3 : 4;
        const analysis = analyzeCandleStructure(candles, swingSize);
        tfResults[tf.id] = analysis;

        weightedScoreSum += analysis.score * tf.weight;
        totalWeight += tf.weight;
      }

      // If spotPrice is still missing from tickers, extract latest real candle close
      if (!spotPrice || spotPrice <= 0) {
        const fallbackClose = tfResults['1h']?.lastClose ||
                              tfResults['4h']?.lastClose ||
                              tfResults['1d']?.lastClose ||
                              tfResults['1w']?.lastClose;
        spotPrice = fallbackClose || coin.yo;
      }

      const compositeScore = totalWeight > 0 ? Math.round(weightedScoreSum / totalWeight) : 50;

      // HTF-Dominant Rating: 4H (30%), 1D (35%), 1W (20%) dictate the trend
      const htf4h = tfResults['4h']?.trend;
      const htf1d = tfResults['1d']?.trend;
      const htf1w = tfResults['1w']?.trend;

      let overallTrend = 'neutral';
      if (compositeScore >= 58) {
        overallTrend = 'bullish';
      } else if (compositeScore <= 42) {
        overallTrend = 'bearish';
      }

      // Strict HTF Dominance: Macro 1D and 1W anchor the rating
      if (htf1d === 'bearish' && htf1w === 'bearish') {
        if (overallTrend === 'bullish') overallTrend = 'neutral';
        if (htf4h === 'bearish') overallTrend = 'bearish';
      } else if (htf1d === 'bullish' && htf1w === 'bullish') {
        if (overallTrend === 'bearish') overallTrend = 'neutral';
        if (htf4h === 'bullish') overallTrend = 'bullish';
      }

      const shortSymbol = coin.symbol.replace('1000', '').replace('USDT', '');
      const sectorTag = getSectorForSymbol(shortSymbol);

      return {
        symbol: shortSymbol,
        fullSymbol: coin.symbol,
        displaySymbol: coin.displaySymbol,
        name: coin.name,
        sector: sectorTag,
        price: spotPrice,
        change24h: Number(change24h.toFixed(2)),
        timeframes: tfResults,
        score: compositeScore,
        overallTrend,
        overallLabel: overallTrend === 'bullish' ? 'Bullish' : overallTrend === 'bearish' ? 'Bearish' : 'Neutral',
      };
    });

    const chunkResults = await Promise.allSettled(promises);
    chunkResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
      }
    });
  }

  // Sort by Score descending (highest Bullish first)
  results.sort((a, b) => b.score - a.score);

  const bullishCount = results.filter((c) => c.overallTrend === 'bullish').length;
  const bearishCount = results.filter((c) => c.overallTrend === 'bearish').length;
  const neutralCount = results.filter((c) => c.overallTrend === 'neutral').length;

  const payload = {
    success: true,
    timestamp: now,
    totalCoins: results.length,
    bullishCount,
    bearishCount,
    neutralCount,
    timeframes: STRUCTURE_TIMEFRAMES.map((t) => t.label),
    coins: results,
  };

  cachedStructureData = payload;
  lastStructureScanTime = now;
  return payload;
}

function getSectorForSymbol(sym) {
  const map = {
    ASTER: 'BNB Chain · DEFI',
    AAVE: 'Ethereum · DEFI',
    SOL: 'Solana · L1',
    ETH: 'Ethereum · L1',
    BTC: 'Bitcoin · Store of Value',
    BNB: 'BNB Chain · L1',
    DOGE: 'Meme · PoW',
    BONK: 'Solana · Meme',
    SUI: 'Sui · L1',
    APT: 'Aptos · L1',
    NEAR: 'NEAR · AI / L1',
    AVAX: 'Avalanche · L1',
    LINK: 'Oracle · Infra',
    TRX: 'TRON · L1',
    XPL: 'XPLA · Gaming',
    HYPE: 'Hyperliquid · Perp DEX',
    TIA: 'Celestia · Modular',
    RENDER: 'AI · DePIN',
    TAO: 'Bittensor · AI',
    PENDLE: 'Arbitrum · Yield',
    ENA: 'Ethena · Stablecoin',
  };
  return map[sym] || 'Altcoin · Perpetual';
}

