import fs from 'fs';
import path from 'path';
import { ALTS_WHITELIST, MAJOR_SYMBOLS } from './altsData.js';

// Allowed timeframes strictly as requested: 30m, 45m, 1h, 2h, 3h
export const SCAN_TIMEFRAMES = [
  { id: '30m', label: '30 Minutes', interval: '30', native: true },
  { id: '45m', label: '45 Minutes', interval: '15', native: false, aggregateMinutes: 45 },
  { id: '1h',  label: '1 Hour',      interval: '60', native: true },
  { id: '2h',  label: '2 Hours',     interval: '120', native: true },
  { id: '3h',  label: '3 Hours',     interval: '60', native: false, aggregateMinutes: 180 },
];

export const RSI_SCANNER_ENGINE_VERSION = 2;

export function getDiscordWebhookUrl() {
  const raw = process.env.DISCORD_WEBHOOK_URL || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export const DISCORD_WEBHOOK_URL = getDiscordWebhookUrl();

export const RSI_OVERBOUGHT_THRESHOLD = 70.0;
export const RSI_OVERSOLD_THRESHOLD = 30.0;

// Alert Cooldown Map: prevent spamming the same alert every 5 minutes
// key: `${symbol}:${timeframe}:${territory}` => timestamp & rsi of last alert
const COOLDOWN_DIR = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) ? '/tmp' : process.cwd();
const COOLDOWN_FILE = path.join(COOLDOWN_DIR, '.rsi-scanner-cooldowns.json');
const alertCooldownMap = new Map();
const COOLDOWN_DURATION_MS = 15 * 60 * 1000; // 15 minutes cooldown per coin-timeframe-territory
let cooldownLoaded = false;

function loadCooldownsFromDisk() {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf-8'));
      const now = Date.now();
      for (const [k, v] of Object.entries(parsed || {})) {
        if (v && typeof v.timestamp === 'number' && (now - v.timestamp) < COOLDOWN_DURATION_MS * 2) {
          alertCooldownMap.set(k, v);
        }
      }
    }
  } catch (e) {}
}

function saveCooldownsToDisk() {
  try {
    const obj = Object.fromEntries(alertCooldownMap.entries());
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(obj), 'utf-8');
  } catch (e) {}
}

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
 * Aggregates lower-timeframe candles into exact UTC-aligned higher-timeframe bars
 * (e.g. 15m -> 45m aligned to 00:00/00:45/01:30 UTC; 1h -> 3h aligned to 00:00/03:00/06:00 UTC)
 */
export function aggregateCandlesByMinutes(candles, targetMinutes = 45, minLeadingBars = 3) {
  if (!candles || candles.length < minLeadingBars) return [];
  const bucketMs = targetMinutes * 60 * 1000;
  const buckets = new Map();

  for (const c of candles) {
    const bucketStart = Math.floor(c.time / bucketMs) * bucketMs;
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart).push(c);
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const chunk = buckets.get(k).sort((a, b) => a.time - b.time);
    const isPartialLeadingEdge = i === 0 && chunk.length < minLeadingBars;
    if (isPartialLeadingEdge) continue;

    result.push({
      time: k,
      open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: chunk[chunk.length - 1].close,
      vol: chunk.reduce((sum, b) => sum + (b.vol || 0), 0),
    });
  }
  return result;
}

/**
 * Check for confirmed, extreme-anchored RSI Divergence
 * - Requires genuine 2-left / 2-right swing pivots (no 1-bar micro-wick noise)
 * - Bearish Divergence requires Pivot 1 RSI >= 70 (Overbought anchor) + Price HH (>= +0.2%) + RSI LH (<= -2.5 pts)
 * - Bullish Divergence requires Pivot 1 RSI <= 30 (Oversold anchor) + Price LL (<= -0.2%) + RSI HL (>= +2.5 pts)
 */
export function checkRsiDivergence(candles, rsiValues, isMajor = false) {
  if (!candles || candles.length < 40 || !rsiValues || rsiValues.length < 40) return null;
  const currentIdx = candles.length - 1;
  const curRsi = rsiValues[currentIdx];
  if (curRsi === null || curRsi === undefined) return null;

  const peaks = [];
  const troughs = [];

  // Identify genuine confirmed local swing pivots (left = 2, right = 2), skipping RSI warmup
  for (let i = Math.max(20, currentIdx - 60); i <= currentIdx - 2; i++) {
    if (rsiValues[i] === null || rsiValues[i] === undefined) continue;
    const h = candles[i].high;
    const l = candles[i].low;

    const isPeak =
      h >= candles[i - 1].high &&
      h >= candles[i - 2].high &&
      h >= candles[i + 1].high &&
      h >= candles[i + 2].high &&
      (h > candles[i - 1].high || h > candles[i - 2].high) &&
      (h > candles[i + 1].high || h > candles[i + 2].high);

    if (isPeak) {
      peaks.push({ idx: i, price: h, rsi: rsiValues[i] });
    }

    const isTrough =
      l <= candles[i - 1].low &&
      l <= candles[i - 2].low &&
      l <= candles[i + 1].low &&
      l <= candles[i + 2].low &&
      (l < candles[i - 1].low || l < candles[i - 2].low) &&
      (l < candles[i + 1].low || l < candles[i + 2].low);

    if (isTrough) {
      troughs.push({ idx: i, price: l, rsi: rsiValues[i] });
    }
  }

  // Bearish Divergence: P1 -> P2 (P2 must be highest high since P1, P1 >= 70 OB)
  if (peaks.length >= 2 && curRsi >= 50.0) {
    const p2 = peaks[peaks.length - 1];
    const barsAgo = currentIdx - p2.idx;
    if (barsAgo >= 2 && barsAgo <= 10) {
      for (let k = peaks.length - 2; k >= Math.max(0, peaks.length - 4); k--) {
        const p1 = peaks[k];
        const span = p2.idx - p1.idx;
        if (span < 3 || span > 35) continue;

        const hasHigherBarSinceP1 = candles
          .slice(p1.idx + 1)
          .some((c, off) => (p1.idx + 1 + off !== p2.idx) && c.high > p2.price * 1.001);

        if (
          !hasHigherBarSinceP1 &&
          p1.rsi >= RSI_OVERBOUGHT_THRESHOLD &&
          p2.price >= p1.price * 1.002 &&
          (p1.rsi - p2.rsi) >= 2.5
        ) {
          return {
            type: 'BEARISH_DIVERGENCE',
            direction: 'BEAR',
            label: 'Bearish Divergence (HH Price / LH RSI)',
            barsAgo,
            curRsi: Number(p2.rsi.toFixed(1)),
            liveRsi: Number(curRsi.toFixed(1)),
            prevRsi: Number(p1.rsi.toFixed(1)),
            curPrice: p2.price,
            prevPrice: p1.price,
            isMajor,
          };
        }
      }
    }
  }

  // Bullish Divergence: T1 -> T2 (T2 must be lowest low since T1, T1 <= 30 OS)
  if (troughs.length >= 2 && curRsi <= 50.0) {
    const t2 = troughs[troughs.length - 1];
    const barsAgo = currentIdx - t2.idx;
    if (barsAgo >= 2 && barsAgo <= 10) {
      for (let k = troughs.length - 2; k >= Math.max(0, troughs.length - 4); k--) {
        const t1 = troughs[k];
        const span = t2.idx - t1.idx;
        if (span < 3 || span > 35) continue;

        const hasLowerBarSinceT1 = candles
          .slice(t1.idx + 1)
          .some((c, off) => (t1.idx + 1 + off !== t2.idx) && c.low < t2.price * 0.999);

        if (
          !hasLowerBarSinceT1 &&
          t1.rsi <= RSI_OVERSOLD_THRESHOLD &&
          t2.price <= t1.price * 0.998 &&
          (t2.rsi - t1.rsi) >= 2.5
        ) {
          return {
            type: 'BULLISH_DIVERGENCE',
            direction: 'BULL',
            label: 'Bullish Divergence (LL Price / HL RSI)',
            barsAgo,
            curRsi: Number(t2.rsi.toFixed(1)),
            liveRsi: Number(curRsi.toFixed(1)),
            prevRsi: Number(t1.rsi.toFixed(1)),
            curPrice: t2.price,
            prevPrice: t1.price,
            isMajor,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Fetch ~200 perpetual candles for a coin and timeframe from Bybit Linear (with Binance Vision fallback)
 */
async function fetchCandles(symbol, tfConfig) {
  const isAggregated = !tfConfig.native && tfConfig.aggregateMinutes > 0;
  const queryInterval = tfConfig.interval;
  const limit = isAggregated ? '600' : '200';

  // 1. Bybit Linear Perpetuals
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${queryInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfRSIScanner/2.0' },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (res.ok) {
      const json = await res.json();
      if (json.result?.list && json.result.list.length >= 40) {
        const raw = json.result.list.slice().reverse().map((k) => ({
          time: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          vol: parseFloat(k[5]),
        }));

        if (isAggregated) {
          return aggregateCandlesByMinutes(raw, tfConfig.aggregateMinutes);
        }
        return raw;
      }
    }
  } catch (err) {}

  // 2. Binance Vision Fallback
  try {
    const bIntervalMap = { '15': '15m', '30': '30m', '60': '1h', '120': '2h' };
    const bInterval = bIntervalMap[queryInterval] || '1h';
    const bRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfRSIScanner/2.0' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList) && bList.length >= 40) {
        const raw = bList.map((k) => ({
          time: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          vol: parseFloat(k[5]),
        }));

        if (isAggregated) {
          return aggregateCandlesByMinutes(raw, tfConfig.aggregateMinutes);
        }
        return raw;
      }
    }
  } catch (err) {}

  return null;
}

/**
 * Scan all whitelisted coins (including BTC, ETH, SOL) across 30m, 45m, 1h, 2h, 3h
 */
export async function scanAllAltsRSI() {
  const scanTime = Date.now();
  const overboughtCoins = [];
  const oversoldCoins = [];
  const divergenceCoins = [];
  const majorsTelemetry = [];
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
        const isMajor = MAJOR_SYMBOLS.includes(coin.symbol);
        const divergence = checkRsiDivergence(candles, rsiSeries, isMajor);
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
          isMajor,
        };

        const obSeverity = roundedRsi >= 80 ? 'EXTREME' : roundedRsi >= 75 ? 'HIGH' : 'ELEVATED';
        const osSeverity = roundedRsi <= 20 ? 'EXTREME' : roundedRsi <= 25 ? 'HIGH' : 'ELEVATED';

        if (resultItem.isOverbought) {
          overboughtCoins.push({
            ...resultItem,
            territory: 'OVERBOUGHT',
            severity: obSeverity,
            isDivergence: Boolean(divergence),
          });
        } else if (resultItem.isOversold) {
          oversoldCoins.push({
            ...resultItem,
            territory: 'OVERSOLD',
            severity: osSeverity,
            isDivergence: Boolean(divergence),
          });
        }

        if (divergence) {
          const isBearDiv = divergence.type === 'BEARISH_DIVERGENCE';
          const divTerritory = resultItem.isOverbought
            ? 'OVERBOUGHT'
            : resultItem.isOversold
            ? 'OVERSOLD'
            : (isBearDiv ? 'BEARISH_DIV' : 'BULLISH_DIV');

          divergenceCoins.push({
            ...resultItem,
            territory: divTerritory,
            severity: resultItem.isOverbought
              ? obSeverity
              : resultItem.isOversold
              ? osSeverity
              : (isMajor ? 'MAJOR_DIVERGENCE' : 'DIVERGENCE'),
            isDivergence: true,
          });
        }

        if (isMajor) {
          majorsTelemetry.push({
            symbol: coin.symbol,
            displaySymbol: coin.displaySymbol,
            name: coin.name,
            timeframe: tf.id,
            timeframeLabel: tf.label,
            price: lastCandle.close,
            rsi: roundedRsi,
            divergence,
            sigmaMetrics,
            isOverbought,
            isOversold,
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
    engineVersion: RSI_SCANNER_ENGINE_VERSION,
    scanTime,
    totalScanned: allScanned.length,
    totalCoins: ALTS_WHITELIST.length,
    monitoredTimeframes: SCAN_TIMEFRAMES.map((t) => t.id),
    overboughtCount: overboughtCoins.length,
    oversoldCount: oversoldCoins.length,
    divergenceCount: divergenceCoins.length,
    divergenceCoins,
    majorsTelemetry,
    overboughtCoins,
    oversoldCoins,
    allCoins: allScanned,
  };
}

/**
 * Filter alerts through cooldown de-duplication to prevent Discord spam
 * Allows re-alerting if RSI escalates deeper into extreme or prints a new divergence
 */
export function filterCooldownAlerts(items) {
  loadCooldownsFromDisk();
  const now = Date.now();
  const alertable = [];
  let changed = false;

  for (const item of items) {
    const key = `${item.symbol}:${item.timeframe}:${item.territory}${item.isDivergence ? ':div' : ''}`;
    const record = alertCooldownMap.get(key);

    if (!record || (now - record.timestamp > COOLDOWN_DURATION_MS)) {
      alertCooldownMap.set(key, { timestamp: now, rsi: item.rsi });
      alertable.push(item);
      changed = true;
    } else if (
      // Escalation rule: if oversold drops >=2.5 pts deeper, or overbought rises >=2.5 pts higher
      (item.territory === 'OVERSOLD' && item.rsi <= record.rsi - 2.5) ||
      (item.territory === 'OVERBOUGHT' && item.rsi >= record.rsi + 2.5)
    ) {
      alertCooldownMap.set(key, { timestamp: now, rsi: item.rsi });
      alertable.push(item);
      changed = true;
    }
  }

  if (changed) saveCooldownsToDisk();
  return alertable;
}

/**
 * Clean stale entries from alertCooldownMap
 */
export function purgeOldCooldowns() {
  loadCooldownsFromDisk();
  const now = Date.now();
  let changed = false;
  for (const [key, record] of alertCooldownMap.entries()) {
    const ts = typeof record === 'object' ? record.timestamp : record;
    if (now - ts > COOLDOWN_DURATION_MS * 2) {
      alertCooldownMap.delete(key);
      changed = true;
    }
  }
  if (changed) saveCooldownsToDisk();
}
