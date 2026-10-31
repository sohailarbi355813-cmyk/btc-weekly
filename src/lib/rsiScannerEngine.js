import { ALTS_WHITELIST } from './altsData.js';

// Allowed timeframes strictly as requested: 30m, 45m, 1h, 2h, 3h
export const SCAN_TIMEFRAMES = [
  { id: '30m', label: '30 Minutes', interval: '30', native: true },
  { id: '45m', label: '45 Minutes', interval: '15', native: false, aggregateFrom: 15, aggregateCount: 3 },
  { id: '1h',  label: '1 Hour',      interval: '60', native: true },
  { id: '2h',  label: '2 Hours',     interval: '120', native: true },
  { id: '3h',  label: '3 Hours',     interval: '180', native: true },
];

export const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1566011421865803948/z_9fRtjvfsl2QPDFgOOxZHr3HlMgozMQPjeAm8B5pY7biqRXp7am7i4AMjL2PbQnS_xO';

export const RSI_OVERBOUGHT_THRESHOLD = 70.0;
export const RSI_OVERSOLD_THRESHOLD = 30.0;

// Alert Cooldown Map: prevent spamming the same alert every 5 minutes
// key: `${symbol}:${timeframe}:${territory}` => timestamp of last alert
const alertCooldownMap = new Map();
const COOLDOWN_DURATION_MS = 45 * 60 * 1000; // 45 minutes cooldown per coin-timeframe-territory

/**
 * Wilder's Smoothed RSI (Standard TradingView 14-period formula)
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
 * Calculate Rolling Standard Deviation (Sigma), Z-Score, and Gaussian Boundary %
 */
export function calculateZScore(closes, period = 20) {
  if (!closes || closes.length < period) {
    return {
      mean: closes && closes.length ? closes[closes.length - 1] : 0,
      stdDev: 0,
      zScore: 0,
      zScoreText: '+0.00σ',
      absZ: 0,
      gaussianPct: 0,
      pctFromMean: 0,
      reversalProb: 'MODERATE',
      reversalLabel: 'Normal Distribution (<1.8σ)',
      isExtremeGaussian: false,
    };
  }

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const curPrice = closes[closes.length - 1];
  const zScore = stdDev > 0 ? (curPrice - mean) / stdDev : 0;
  const absZ = Math.abs(zScore);

  // Accurate Gaussian Cumulative Probability using Horner's form (Abramowitz & Stegun)
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const t = 1.0 / (1.0 + p * (absZ / Math.SQRT2));
  const erfVal = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-Math.pow(absZ / Math.SQRT2, 2));
  const gaussianPct = Math.min(Math.max(Math.round(erfVal * 1000) / 10, 0), 99.9);
  const pctFromMean = mean > 0 ? ((curPrice - mean) / mean) * 100 : 0;

  let reversalProb = 'MODERATE';
  let reversalLabel = 'Within Normal Range (<1.8σ)';
  let isExtremeGaussian = false;

  if (absZ >= 2.5) {
    reversalProb = 'MAXIMUM';
    reversalLabel = `Climax Exhaustion (${absZ.toFixed(2)}σ • >98.8% Gaussian Boundary)`;
    isExtremeGaussian = true;
  } else if (absZ >= 2.0) {
    reversalProb = 'HIGH';
    reversalLabel = `Statistical Boundary (${absZ.toFixed(2)}σ • >95.4% Gaussian Boundary)`;
    isExtremeGaussian = true;
  } else if (absZ >= 1.6) {
    reversalProb = 'DEVELOPING';
    reversalLabel = `Extension Zone (${absZ.toFixed(2)}σ • >89% Gaussian Boundary)`;
  }

  return {
    mean: Number(mean.toFixed(6)),
    stdDev: Number(stdDev.toFixed(6)),
    zScore: Number(zScore.toFixed(2)),
    zScoreText: `${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ`,
    absZ: Number(absZ.toFixed(2)),
    gaussianPct,
    pctFromMean: Number(pctFromMean.toFixed(2)),
    reversalProb,
    reversalLabel,
    isExtremeGaussian, // >= 2.0σ
  };
}

/**
 * Aggregates 15m candles into 45m candles (each 3 consecutive bars)
 */
function aggregate45mCandles(candles15m) {
  if (!candles15m || candles15m.length < 3) return [];
  const result = [];
  
  // Align to 3-bar chunks from latest backwards to keep the most recent bar accurate
  const remainder = candles15m.length % 3;
  const aligned = remainder === 0 ? candles15m : candles15m.slice(remainder);

  for (let i = 0; i < aligned.length; i += 3) {
    const b1 = aligned[i];
    const b2 = aligned[i + 1];
    const b3 = aligned[i + 2];
    if (!b1 || !b2 || !b3) continue;

    result.push({
      time: b1.time,
      open: b1.open,
      high: Math.max(b1.high, b2.high, b3.high),
      low: Math.min(b1.low, b2.low, b3.low),
      close: b3.close,
      vol: b1.vol + b2.vol + b3.vol,
    });
  }
  return result;
}

/**
 * Check for RSI Divergence on top of Overbought / Oversold
 */
export function checkRsiDivergence(candles, rsiValues) {
  if (!candles || candles.length < 15 || !rsiValues || rsiValues.length < 15) return null;
  const currentIdx = candles.length - 1;
  const curPrice = candles[currentIdx].close;
  const curRsi = rsiValues[currentIdx];

  // Look back up to 15 bars for local peak or trough
  let prevPeakIdx = -1;
  let prevTroughIdx = -1;

  for (let i = currentIdx - 3; i >= Math.max(0, currentIdx - 15); i--) {
    if (candles[i].high > candles[i - 1]?.high && candles[i].high > candles[i + 1]?.high) {
      if (prevPeakIdx === -1) prevPeakIdx = i;
    }
    if (candles[i].low < candles[i - 1]?.low && candles[i].low < candles[i + 1]?.low) {
      if (prevTroughIdx === -1) prevTroughIdx = i;
    }
  }

  // Bearish Divergence: Price Higher High, RSI Lower High (on Overbought)
  if (curRsi >= 65 && prevPeakIdx !== -1) {
    const prevPrice = candles[prevPeakIdx].high;
    const prevRsi = rsiValues[prevPeakIdx];
    if (curPrice > prevPrice && curRsi < prevRsi) {
      return {
        type: 'BEARISH_DIVERGENCE',
        label: 'Bearish Divergence (HH Price / LH RSI)',
        barsAgo: currentIdx - prevPeakIdx,
      };
    }
  }

  // Bullish Divergence: Price Lower Low, RSI Higher Low (on Oversold)
  if (curRsi <= 35 && prevTroughIdx !== -1) {
    const prevPrice = candles[prevTroughIdx].low;
    const prevRsi = rsiValues[prevTroughIdx];
    if (curPrice < prevPrice && curRsi > prevRsi) {
      return {
        type: 'BULLISH_DIVERGENCE',
        label: 'Bullish Divergence (LL Price / HL RSI)',
        barsAgo: currentIdx - prevTroughIdx,
      };
    }
  }

  return null;
}

/**
 * Fetch candles for a coin and timeframe from Bybit (with Binance fallback)
 */
async function fetchCandles(symbol, tfConfig) {
  const is45m = tfConfig.id === '45m';
  const queryInterval = is45m ? '15' : tfConfig.interval;
  const limit = is45m ? '90' : '45';

  // 1. Bybit Linear
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${queryInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfRSIScanner/2.0' },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (res.ok) {
      const json = await res.json();
      if (json.result?.list && json.result.list.length >= 20) {
        const raw = json.result.list.slice().reverse().map((k) => ({
          time: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          vol: parseFloat(k[5]),
        }));

        if (is45m) {
          return aggregate45mCandles(raw);
        }
        return raw;
      }
    }
  } catch (err) {}

  // 2. Binance Vision Fallback
  try {
    const bInterval = is45m ? '15m' : tfConfig.id === '30m' ? '30m' : tfConfig.id === '1h' ? '1h' : tfConfig.id === '2h' ? '2h' : '1h';
    const bRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfRSIScanner/2.0' },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList) && bList.length >= 20) {
        const raw = bList.map((k) => ({
          time: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          vol: parseFloat(k[5]),
        }));

        if (is45m) {
          return aggregate45mCandles(raw);
        }
        return raw;
      }
    }
  } catch (err) {}

  return null;
}

/**
 * Scan all 55 whitelisted alts across 30m, 45m, 1h, 2h, 3h
 */
export async function scanAllAltsRSI() {
  const scanTime = Date.now();
  const overboughtCoins = [];
  const oversoldCoins = [];
  const allScanned = [];

  const BATCH_SIZE = 12;

  for (const tf of SCAN_TIMEFRAMES) {
    for (let i = 0; i < ALTS_WHITELIST.length; i += BATCH_SIZE) {
      const batch = ALTS_WHITELIST.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (coin) => {
        const candles = await fetchCandles(coin.symbol, tf);
        if (!candles || candles.length < 16) return null;

        const closes = candles.map((c) => c.close);
        const rsiSeries = calculateRSI(closes, 14);
        const curRsi = rsiSeries[rsiSeries.length - 1];
        if (curRsi === null || curRsi === undefined) return null;

        const roundedRsi = Number(curRsi.toFixed(1));
        const lastCandle = candles[candles.length - 1];
        const divergence = checkRsiDivergence(candles, rsiSeries);
        const sigmaMetrics = calculateZScore(closes, 20);

        const isOverbought = roundedRsi >= RSI_OVERBOUGHT_THRESHOLD;
        const isOversold = roundedRsi <= RSI_OVERSOLD_THRESHOLD;
        const isHighProbabilityReversal = (isOverbought && sigmaMetrics.zScore >= 1.8) || (isOversold && sigmaMetrics.zScore <= -1.8);

        const resultItem = {
          symbol: coin.symbol,
          displaySymbol: coin.displaySymbol,
          name: coin.name,
          timeframe: tf.id,
          timeframeLabel: tf.label,
          price: lastCandle.close,
          rsi: roundedRsi,
          timestamp: lastCandle.time,
          divergence,
          sigmaMetrics,
          isHighProbabilityReversal,
          isOverbought,
          isOversold,
        };

        if (resultItem.isOverbought) {
          overboughtCoins.push({
            ...resultItem,
            territory: 'OVERBOUGHT',
            severity: roundedRsi >= 80 ? 'EXTREME' : roundedRsi >= 75 ? 'HIGH' : 'ELEVATED',
          });
        } else if (resultItem.isOversold) {
          oversoldCoins.push({
            ...resultItem,
            territory: 'OVERSOLD',
            severity: roundedRsi <= 20 ? 'EXTREME' : roundedRsi <= 25 ? 'HIGH' : 'ELEVATED',
          });
        }

        return resultItem;
      });

      const batchResults = await Promise.allSettled(promises);
      batchResults.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          allScanned.push(r.value);
        }
      });
    }
  }

  // Sort by RSI intensity (highest RSI first for OB, lowest RSI first for OS)
  overboughtCoins.sort((a, b) => b.rsi - a.rsi);
  oversoldCoins.sort((a, b) => a.rsi - b.rsi);

  return {
    scanTime,
    totalScanned: allScanned.length,
    totalCoins: ALTS_WHITELIST.length,
    monitoredTimeframes: SCAN_TIMEFRAMES.map((t) => t.id),
    overboughtCount: overboughtCoins.length,
    oversoldCount: oversoldCoins.length,
    overboughtCoins,
    oversoldCoins,
  };
}

/**
 * Filter alerts through cooldown de-duplication to prevent Discord spam
 */
export function filterCooldownAlerts(items) {
  const now = Date.now();
  const alertable = [];

  for (const item of items) {
    const key = `${item.symbol}:${item.timeframe}:${item.territory}`;
    const lastAlertTime = alertCooldownMap.get(key) || 0;

    if (now - lastAlertTime > COOLDOWN_DURATION_MS) {
      alertCooldownMap.set(key, now);
      alertable.push(item);
    }
  }

  return alertable;
}

/**
 * Clean stale entries from alertCooldownMap
 */
export function purgeOldCooldowns() {
  const now = Date.now();
  for (const [key, timestamp] of alertCooldownMap.entries()) {
    if (now - timestamp > COOLDOWN_DURATION_MS * 2) {
      alertCooldownMap.delete(key);
    }
  }
}
