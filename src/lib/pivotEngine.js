/**
 * pivotEngine.js — wolf_xbt Pivot Outcome Tool
 *
 * 1. Fetches BTC klines (multi-host paginated up to requested limit)
 * 2. Detects swing highs/lows (ZigZag, N-bar rule)
 * 3. Labels every historical pivot: "swept" or "held" after lookForwardBars
 * 4. Matches historically similar pivots using ATR-normalized structure
 * 5. Returns overall + still-standing-at-age + post-30h survival odds & targets
 */

export const PIVOT_ENGINE_VERSION = 3;

const ALLOWED_INTERVALS = new Set(['15m', '1h', '4h', '1d']);

function getIntervalMs(interval) {
  return {
    '15m': 15 * 60000,
    '1h': 3600000,
    '4h': 4 * 3600000,
    '1d': 86400000,
  }[interval] || 4 * 3600000;
}

function defaultLookForward(interval) {
  return {
    '15m': 288, // 72h
    '1h': 240,  // 10d
    '4h': 180,  // 30d
    '1d': 90,   // 90d
  }[interval] || 180;
}

// ─── 1. Multi-Host Paginated Klines Fetch ─────────────────────────────────────

async function fetchHostBatch(hostType, symbol, interval, limit, endTime) {
  const safeLimit = Math.min(limit, hostType === 'fapi' ? 1500 : 1000);
  let url = '';

  if (hostType === 'fapi') {
    url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;
    if (endTime) url += `&endTime=${endTime}`;
  } else if (hostType === 'vision') {
    url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;
    if (endTime) url += `&endTime=${endTime}`;
  } else if (hostType === 'spot') {
    url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;
    if (endTime) url += `&endTime=${endTime}`;
  } else if (hostType === 'bybit') {
    const byInt = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D' }[interval] || '240';
    url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${byInt}&limit=${safeLimit}`;
    if (endTime) url += `&end=${endTime}`;
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'WolfPivotEngine/3.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${hostType} klines HTTP ${res.status}`);
  const raw = await res.json();

  if (hostType === 'bybit') {
    const list = raw?.result?.list;
    if (!Array.isArray(list) || list.length === 0) throw new Error('Bybit empty klines');
    const stepMs = getIntervalMs(interval);
    return list
      .slice()
      .reverse()
      .map((k) => {
        const t = Number(k[0]);
        return {
          t,
          tClose: t + stepMs - 1,
          o: parseFloat(k[1]),
          h: parseFloat(k[2]),
          l: parseFloat(k[3]),
          c: parseFloat(k[4]),
          v: parseFloat(k[5] || 0),
        };
      });
  }

  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${hostType} empty klines`);
  return raw.map((k) => ({
    t: Number(k[0]),
    tClose: Number(k[6]),
    o: parseFloat(k[1]),
    h: parseFloat(k[2]),
    l: parseFloat(k[3]),
    c: parseFloat(k[4]),
    v: parseFloat(k[5] || 0),
  }));
}

export async function fetchBinanceKlines(symbol = 'BTCUSDT', interval = '4h', limit = 1500) {
  const cleanSymbol = String(symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanInterval = ALLOWED_INTERVALS.has(interval) ? interval : '4h';
  const targetLimit = Math.max(100, Math.min(Number(limit) || 1500, 3000));

  const hosts = ['fapi', 'vision', 'spot', 'bybit'];
  let lastErr = null;

  for (const host of hosts) {
    try {
      const byTimestamp = new Map();
      let endTime = undefined;
      const maxPages = Math.ceil(targetLimit / (host === 'fapi' ? 1500 : 1000)) + 1;

      for (let page = 0; page < maxPages && byTimestamp.size < targetLimit; page++) {
        const remaining = targetLimit - byTimestamp.size;
        const batch = await fetchHostBatch(host, cleanSymbol, cleanInterval, remaining, endTime);
        if (!batch.length) break;

        let added = 0;
        for (const bar of batch) {
          if (!byTimestamp.has(bar.t)) {
            byTimestamp.set(bar.t, bar);
            added++;
          }
        }
        if (added === 0 || batch.length < 50) break;
        endTime = batch[0].t - 1;
      }

      if (byTimestamp.size >= Math.min(200, targetLimit)) {
        const sorted = Array.from(byTimestamp.values()).sort((a, b) => a.t - b.t);
        return sorted.slice(-targetLimit);
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All market data feeds failed');
}

// ─── 2. ATR & EMA Series ──────────────────────────────────────────────────────

export function calcATRSeries(candles, period = 14) {
  const n = candles.length;
  const out = new Array(n).fill(0);
  if (n === 0) return out;
  out[0] = Math.max(1, candles[0].h - candles[0].l);

  const trs = new Array(n).fill(0);
  trs[0] = out[0];
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs[i] = Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
  }

  const initLen = Math.min(period, n);
  let atr = trs.slice(0, initLen).reduce((s, v) => s + v, 0) / initLen;
  for (let i = 0; i < initLen; i++) out[i] = atr;
  for (let i = initLen; i < n; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out[i] = atr;
  }
  return out;
}

export function calcATR(candles, period = 14) {
  const series = calcATRSeries(candles, period);
  return series[series.length - 1] || 1000;
}

export function calcEMASeries(candles, period = 20) {
  const n = candles.length;
  const out = new Array(n).fill(0);
  if (n === 0) return out;
  const k = 2 / (period + 1);
  let ema = candles[0].c;
  out[0] = ema;
  for (let i = 1; i < n; i++) {
    ema = candles[i].c * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

// ─── 3. ZigZag Swing Detector ─────────────────────────────────────────────────

export function detectPivots(candles, leftBars = 5, rightBars = 5) {
  const pivots = [];
  const n = candles.length;

  for (let i = leftBars; i < n - rightBars; i++) {
    const c = candles[i];

    let isHigh = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      // Strict on left, non-strict on right keeps only the first bar of an equal double-top tick
      if (j < i ? candles[j].h >= c.h : candles[j].h > c.h) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      pivots.push({ idx: i, type: 'high', price: c.h, t: c.t, tClose: c.tClose });
    }

    let isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (j < i ? candles[j].l <= c.l : candles[j].l < c.l) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      pivots.push({ idx: i, type: 'low', price: c.l, t: c.t, tClose: c.tClose });
    }
  }

  return pivots.sort((a, b) => a.idx - b.idx);
}

// ─── 4. Outcome Labelling ─────────────────────────────────────────────────────

export function labelOutcomes(
  pivots,
  candles,
  lookForwardBars = 180,
  intervalMs = 4 * 3600 * 1000,
  atrSeries = null,
  emaSeries = null
) {
  const atrs = atrSeries || calcATRSeries(candles, 14);
  const emas = emaSeries || calcEMASeries(candles, 20);

  return pivots.map((p) => {
    const start = p.idx + 1;
    const end = Math.min(candles.length, start + lookForwardBars);
    const localAtr = Math.max(1e-6, atrs[p.idx] || 1000);
    const localEma = emas[p.idx] || p.price;

    let swept = false;
    let sweepBarOffset = null;
    let maxFavorableMove = 0;

    for (let i = start; i < end; i++) {
      const c = candles[i];
      if (p.type === 'high') {
        const fav = Math.max(0, p.price - c.l);
        if (fav > maxFavorableMove) maxFavorableMove = fav;
        if (c.h > p.price) {
          swept = true;
          sweepBarOffset = i - p.idx;
          break;
        }
      } else {
        const fav = Math.max(0, c.h - p.price);
        if (fav > maxFavorableMove) maxFavorableMove = fav;
        if (c.l < p.price) {
          swept = true;
          sweepBarOffset = i - p.idx;
          break;
        }
      }
    }

    const sweepHours =
      swept && sweepBarOffset !== null
        ? parseFloat(((sweepBarOffset * intervalMs) / 3600000).toFixed(1))
        : null;

    let sweepTimingBucket = null;
    if (sweepHours !== null) {
      if (sweepHours <= 6) sweepTimingBucket = 'lt6h';
      else if (sweepHours <= 12) sweepTimingBucket = '6to12h';
      else if (sweepHours <= 30) sweepTimingBucket = '12to30h';
      else sweepTimingBucket = 'gt30h';
    }

    const barsRemaining = candles.length - 1 - p.idx;
    const isOpen = !swept && barsRemaining < lookForwardBars;

    // Volatility-normalized structure metrics at pivot formation
    const extensionATR = parseFloat(((p.price - localEma) / localAtr).toFixed(2));
    const maxReactionATR = parseFloat((maxFavorableMove / localAtr).toFixed(2));
    const maxFavorablePct = parseFloat(((maxFavorableMove / p.price) * 100).toFixed(2));

    return {
      ...p,
      outcome: swept ? 'swept' : isOpen ? 'open' : 'held',
      sweepBarOffset,
      sweepHours,
      sweepTimingBucket,
      localAtr,
      extensionATR,
      maxReactionATR,
      maxFavorablePct,
    };
  });
}

// ─── 5. Conditional Outcome Summarizer ────────────────────────────────────────

function summarizeSubset(subset, ageBars = 0) {
  const total = subset.length;
  const swept = subset.filter((p) => p.outcome === 'swept').length;
  const held = subset.filter((p) => p.outcome === 'held').length;

  const timingBuckets = { lt6h: 0, '6to12h': 0, '12to30h': 0, gt30h: 0 };
  for (const p of subset) {
    if (p.outcome === 'swept' && p.sweepTimingBucket) {
      timingBuckets[p.sweepTimingBucket]++;
    }
  }

  // Pivots that survived the initial 30h window (either held cleanly or swept after >30h)
  const post30hStanding = subset.filter(
    (p) => p.outcome === 'held' || (p.outcome === 'swept' && p.sweepTimingBucket === 'gt30h')
  );
  const post30hSwept = post30hStanding.filter((p) => p.outcome === 'swept').length;
  const post30hSweepPct =
    post30hStanding.length > 0
      ? Math.round((post30hSwept / post30hStanding.length) * 100)
      : null;

  // Pivots STILL standing at the current pivot's exact age (`ageBars`)
  const safeAge = Math.max(0, ageBars);
  const stillStanding = subset.filter(
    (p) => p.outcome === 'held' || (p.outcome === 'swept' && p.sweepBarOffset > safeAge)
  );
  const stillStandingSwept = stillStanding.filter((p) => p.outcome === 'swept').length;
  const stillStandingSweepPct =
    stillStanding.length > 0
      ? Math.round((stillStandingSwept / stillStanding.length) * 100)
      : null;

  return {
    total,
    swept,
    held,
    sweepPct: total > 0 ? Math.round((swept / total) * 100) : null,
    holdPct: total > 0 ? Math.round((held / total) * 100) : null,
    timingBuckets,
    earlySweptCount: timingBuckets.lt6h + timingBuckets['6to12h'] + timingBuckets['12to30h'],
    post30hStandingCount: post30hStanding.length,
    post30hSweptCount: post30hSwept,
    post30hSweepPct,
    stillStandingCount: stillStanding.length,
    stillStandingSweptCount: stillStandingSwept,
    stillStandingSweepPct,
  };
}

// ─── 6. ATR-Structure Similarity Matcher ──────────────────────────────────────

/**
 * Matches historical pivots of the same direction with similar ATR extension from trend
 * (invariant to BTC nominal price epoch, so $25k/$55k/$100k swings remain comparable).
 * Uses toleranceATR first, broadening gracefully if fewer than 12 similar pivots match.
 */
export function findSimilarPivots(currentPivot, labelledPivots, ageBars = 0, toleranceATR = 1.0) {
  const candidates = labelledPivots
    .filter((p) => p.idx !== currentPivot.idx && p.type === currentPivot.type && p.outcome !== 'open')
    .map((p) => ({
      ...p,
      structDistATR: Math.abs((p.extensionATR || 0) - (currentPivot.extensionATR || 0)),
    }))
    .sort((a, b) => a.structDistATR - b.structDistATR);

  let similar = candidates.filter((p) => p.structDistATR <= toleranceATR);
  let matchedBy = `±${toleranceATR} ATR extension`;

  if (similar.length < 12 && candidates.length > 0) {
    similar = candidates.slice(0, Math.min(25, candidates.length));
    matchedBy = `closest ${similar.length} ATR setups`;
  }

  const summary = summarizeSubset(similar, ageBars);
  const recentCases = [...similar]
    .sort((a, b) => b.t - a.t)
    .slice(0, 12)
    .map((p) => ({
      date: new Date(p.t).toISOString().split('T')[0],
      price: p.price,
      outcome: p.outcome,
      sweepHours: p.sweepHours,
      maxFavorablePct: p.maxFavorablePct,
      extensionATR: p.extensionATR,
    }));

  return {
    ...summary,
    matchedBy,
    cases: recentCases,
  };
}

export function allPivotsStats(currentPivot, labelledPivots, ageBars = 0) {
  const all = labelledPivots.filter(
    (p) => p.type === currentPivot.type && p.outcome !== 'open' && p.idx !== currentPivot.idx
  );
  return summarizeSubset(all, ageBars);
}

// ─── 7. Target Levels for Held Pivots ─────────────────────────────────────────

/**
 * Computes 80% / 50% / 20% probability excursion targets from held pivots:
 * - For held HIGHS: target80pct = shallowest 20th-percentile drop (hit 80% of the time),
 *   target50pct = median drop (50%), target20pct = deepest 80th-percentile drop (20%).
 */
export function calcLowTargets(currentPivot, labelledPivots, candles, lookForwardBars = 180) {
  if (currentPivot.type !== 'high') return null;

  const heldHighs = labelledPivots.filter(
    (p) => p.type === 'high' && p.outcome === 'held' && p.idx !== currentPivot.idx
  );
  if (heldHighs.length === 0) return null;

  const declines = heldHighs
    .map((p) => {
      const fwdEnd = Math.min(candles.length, p.idx + 1 + lookForwardBars);
      let minLow = p.price;
      for (let i = p.idx + 1; i < fwdEnd; i++) {
        if (candles[i].l < minLow) minLow = candles[i].l;
      }
      return ((p.price - minLow) / p.price) * 100;
    })
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  if (declines.length === 0) return null;

  // Shallowest drop -> highest probability of being reached (80% hit rate)
  const pct80Hit = declines[Math.floor(declines.length * 0.2)];
  const pct50Hit = declines[Math.floor(declines.length * 0.5)];
  const pct20Hit = declines[Math.min(declines.length - 1, Math.floor(declines.length * 0.8))];

  return {
    sampleSize: declines.length,
    target80pct: currentPivot.price * (1 - pct80Hit / 100),
    target50pct: currentPivot.price * (1 - pct50Hit / 100),
    target20pct: currentPivot.price * (1 - pct20Hit / 100),
    decline80: pct80Hit,
    decline50: pct50Hit,
    decline20: pct20Hit,
  };
}

export function calcHighTargets(currentPivot, labelledPivots, candles, lookForwardBars = 180) {
  if (currentPivot.type !== 'low') return null;

  const heldLows = labelledPivots.filter(
    (p) => p.type === 'low' && p.outcome === 'held' && p.idx !== currentPivot.idx
  );
  if (heldLows.length === 0) return null;

  const rallies = heldLows
    .map((p) => {
      const fwdEnd = Math.min(candles.length, p.idx + 1 + lookForwardBars);
      let maxHigh = p.price;
      for (let i = p.idx + 1; i < fwdEnd; i++) {
        if (candles[i].h > maxHigh) maxHigh = candles[i].h;
      }
      return ((maxHigh - p.price) / p.price) * 100;
    })
    .filter((r) => r > 0)
    .sort((a, b) => a - b);

  if (rallies.length === 0) return null;

  const pct80Hit = rallies[Math.floor(rallies.length * 0.2)];
  const pct50Hit = rallies[Math.floor(rallies.length * 0.5)];
  const pct20Hit = rallies[Math.min(rallies.length - 1, Math.floor(rallies.length * 0.8))];

  return {
    sampleSize: rallies.length,
    target80pct: currentPivot.price * (1 + pct80Hit / 100),
    target50pct: currentPivot.price * (1 + pct50Hit / 100),
    target20pct: currentPivot.price * (1 + pct20Hit / 100),
    gain80: pct80Hit,
    gain50: pct50Hit,
    gain20: pct20Hit,
  };
}

// ─── 8. Main Entry Point ─────────────────────────────────────────────────────

export async function runPivotAnalysis({
  symbol = 'BTCUSDT',
  interval = '4h',
  limit,
  leftBars = 5,
  rightBars = 5,
  lookForwardBars,
  toleranceATR = 1.0,
} = {}) {
  const cleanInterval = ALLOWED_INTERVALS.has(interval) ? interval : '4h';
  const intervalMs = getIntervalMs(cleanInterval);
  const effectiveLimit = limit || (cleanInterval === '4h' ? 2500 : 2000);
  const horizonBars = lookForwardBars || defaultLookForward(cleanInterval);

  const candles = await fetchBinanceKlines(symbol, cleanInterval, effectiveLimit);
  if (candles.length < leftBars + rightBars + 20) {
    throw new Error('Not enough candles for pivot analysis');
  }

  const atrSeries = calcATRSeries(candles, 14);
  const emaSeries = calcEMASeries(candles, 20);
  const atr = atrSeries[atrSeries.length - 1] || 1000;
  const currentPrice = candles[candles.length - 1].c;
  const lastBarIdx = candles.length - 1;

  const rawPivots = detectPivots(candles, leftBars, rightBars);
  const labelledPivots = labelOutcomes(
    rawPivots,
    candles,
    horizonBars,
    intervalMs,
    atrSeries,
    emaSeries
  );

  // Pick the most recent active (unswept 'open') pivot, else most recent historical pivot
  const pickActivePivot = (type) => {
    const open = labelledPivots.filter((p) => p.type === type && p.outcome === 'open');
    if (open.length > 0) return open[open.length - 1];
    const all = labelledPivots.filter((p) => p.type === type);
    return all[all.length - 1] || null;
  };

  const pivotHigh = pickActivePivot('high');
  const pivotLow = pickActivePivot('low');

  const analyzePivot = (pivot) => {
    if (!pivot) return null;
    const ageBars = Math.max(0, lastBarIdx - pivot.idx);
    const ageHours = parseFloat(((ageBars * intervalMs) / 3600000).toFixed(1));
    const reactionATR = parseFloat((Math.abs(currentPrice - pivot.price) / atr).toFixed(2));
    const reactionPct = parseFloat((((currentPrice - pivot.price) / pivot.price) * 100).toFixed(2));

    const allStats = allPivotsStats(pivot, labelledPivots, ageBars);
    const simStats = findSimilarPivots(pivot, labelledPivots, ageBars, toleranceATR);
    const lowTargets =
      pivot.type === 'high' ? calcLowTargets(pivot, labelledPivots, candles, horizonBars) : null;
    const highTargets =
      pivot.type === 'low' ? calcHighTargets(pivot, labelledPivots, candles, horizonBars) : null;

    return {
      pivot: {
        ...pivot,
        date: new Date(pivot.t).toISOString().split('T')[0],
        ageBars,
        ageHours,
        reactionATR,
        reactionPct,
      },
      allStats,
      simStats,
      lowTargets,
      highTargets,
      atr,
      currentPrice,
    };
  };

  return {
    engineVersion: PIVOT_ENGINE_VERSION,
    symbol,
    interval: cleanInterval,
    lookForwardBars: horizonBars,
    horizonDays: Math.round((horizonBars * intervalMs) / 86400000),
    lastUpdated: Date.now(),
    candleCount: candles.length,
    historyStart: new Date(candles[0].t).toISOString().split('T')[0],
    atr,
    currentPrice,
    totalPivotsDetected: labelledPivots.length,
    high: analyzePivot(pivotHigh),
    low: analyzePivot(pivotLow),
  };
}
