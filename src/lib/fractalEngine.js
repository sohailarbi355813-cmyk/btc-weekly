/**
 * fractalEngine.js — wolf_xbt Fractal Finder
 *
 * Matches the current period's price action shape against all historical
 * windows of the same length, ranked by Euclidean distance on normalised
 * % returns. Deduplicates overlapping shifted windows so top-K represent
 * distinct historical market episodes, and projects 30-day targets from CMP.
 */

export const FRACTAL_ENGINE_VERSION = 3;

// ─── 1. Normalise a candle window to % returns from window open ───────────────

export function normalizeWindow(candles) {
  if (!candles || candles.length === 0) return [];
  const base = candles[0].o;
  if (!base || base === 0) return candles.map(() => 0);
  return candles.map((c) => ((c.c - base) / base) * 100);
}

// ─── 2. Similarity score (lower = more similar) ───────────────────────────────

export function similarityScore(winA, winB) {
  if (winA.length !== winB.length || winA.length === 0) return Infinity;
  return Math.sqrt(winA.reduce((sum, v, i) => sum + (v - winB[i]) ** 2, 0));
}

// ─── 3. Scale-invariant RMSE → percentage match (100% = identical) ────────────

export function distToMatchPct(dist, windowLen = 30, maxRmse = 25) {
  const rmse = dist / Math.sqrt(Math.max(1, windowLen));
  return Math.max(0, Math.min(99, Math.round((1 - rmse / maxRmse) * 100)));
}

// ─── 4. Slide and collect all historical windows ─────────────────────────────

export function extractHistoricalWindows(candles, windowLen = 30, forwardLen = 30) {
  const windows = [];
  // Strictly exclude overlap with the active trailing `windowLen` slice
  const limit = candles.length - windowLen - forwardLen;

  for (let i = 0; i < limit; i++) {
    const window = candles.slice(i, i + windowLen);
    const forward = candles.slice(i + windowLen, i + windowLen + forwardLen);
    const normed = normalizeWindow(window);

    // Express forward closes as cumulative % return from window open for continuous chart overlay
    const windowOpen = window[0].o || 1;
    const windowClose = window[window.length - 1].c || 1;
    const fwdSeriesFromOpen = forward.map((c) => ((c.c - windowOpen) / windowOpen) * 100);
    // Exact forward % move measured from window close (analogous to CMP)
    const fwdFromClose = forward.map((c) => ((c.c - windowClose) / windowClose) * 100);

    const fwdHighPct = forward.length
      ? ((Math.max(...forward.map((c) => c.h)) - windowClose) / windowClose) * 100
      : null;
    const fwdLowPct = forward.length
      ? ((Math.min(...forward.map((c) => c.l)) - windowClose) / windowClose) * 100
      : null;
    const fwdClosePct = forward.length
      ? ((forward[forward.length - 1].c - windowClose) / windowClose) * 100
      : null;

    const drawdown = window.reduce((min, c) => {
      const pct = ((c.l - windowOpen) / windowOpen) * 100;
      return Math.min(min, pct);
    }, 0);

    windows.push({
      startIdx: i,
      startTime: window[0].t,
      endTime: window[window.length - 1].tClose,
      startDate: new Date(window[0].t).toISOString().split('T')[0],
      endDate: new Date(window[window.length - 1].tClose).toISOString().split('T')[0],
      normed,
      fwdNormed: fwdSeriesFromOpen,
      fwdFromClose,
      fwdHighPct,
      fwdLowPct,
      fwdClosePct,
      drawdownPct: drawdown,
      openPrice: windowOpen,
      closePrice: windowClose,
    });
  }

  return windows;
}

// ─── 5. Find top-K non-overlapping distinct matches ───────────────────────────

export function findTopMatches(currentNormed, historicalWindows, k = 5, minSeparation = null) {
  const winLen = currentNormed.length || 30;
  const minSep = minSeparation ?? Math.max(7, Math.floor(winLen * 0.5));

  const scored = historicalWindows
    .map((w) => ({
      ...w,
      dist: similarityScore(currentNormed, w.normed),
    }))
    .sort((a, b) => a.dist - b.dist);

  const picked = [];
  for (const cand of scored) {
    if (picked.length >= k) break;
    const tooClose = picked.some((p) => Math.abs(cand.startIdx - p.startIdx) < minSep);
    if (!tooClose) {
      picked.push({
        ...cand,
        matchPct: distToMatchPct(cand.dist, winLen),
      });
    }
  }

  return picked;
}

// ─── 6. Aggregate forward statistics & CMP target projections ─────────────────

function calcMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

function calcMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function aggregateForwardStats(topMatches, currentPrice = null, forwardLen = 30) {
  if (!topMatches || topMatches.length === 0) return null;

  const valid = topMatches.filter((m) => m.fwdClosePct !== null);
  if (valid.length === 0) return null;

  const closes = valid.map((m) => m.fwdClosePct);
  const lows = valid.map((m) => m.fwdLowPct).filter((v) => v !== null);
  const highs = valid.map((m) => m.fwdHighPct).filter((v) => v !== null);

  const bullishMatches = valid.filter((m) => m.fwdClosePct > 0);
  const bearishMatches = valid.filter((m) => m.fwdClosePct <= 0);
  const bullishCount = bullishMatches.length;
  const bearishCount = bearishMatches.length;
  const bullishPct = Math.round((bullishCount / valid.length) * 100);
  const bearishPct = 100 - bullishPct;

  const dominantBias =
    bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL';

  const medianForwardClose = calcMedian(closes);
  const meanForwardClose = calcMean(closes);

  // Similarity-weighted expected close %
  const totalWeight = valid.reduce((s, m) => s + Math.max(1, m.matchPct || 50), 0);
  const weightedForwardClose =
    valid.reduce((s, m) => s + m.fwdClosePct * Math.max(1, m.matchPct || 50), 0) /
    (totalWeight || 1);

  // Majority-side average (e.g., average of the 4 bearish matches out of 5)
  const majorityPool =
    dominantBias === 'BEARISH'
      ? bearishMatches
      : dominantBias === 'BULLISH'
        ? bullishMatches
        : valid;
  const majorityMeanClose = calcMean(majorityPool.map((m) => m.fwdClosePct));
  const majorityMedianClose = calcMedian(majorityPool.map((m) => m.fwdClosePct));

  const meanDrawdown = calcMean(lows);
  const medianDrawdown = calcMedian(lows);
  const meanUpside = calcMean(highs);
  const medianUpside = calcMedian(highs);
  const maxUpside = highs.length ? Math.max(...highs) : 0;
  const maxDownside = lows.length ? Math.min(...lows) : 0;

  const toPrice = (pct) =>
    currentPrice ? Math.round(currentPrice * (1 + pct / 100)) : null;

  // Day-by-day similarity-weighted composite forward path from CMP (0% on day 0 -> day forwardLen)
  const compositePath = [{ day: 0, pct: 0, price: currentPrice ? Math.round(currentPrice) : null }];
  for (let d = 0; d < forwardLen; d++) {
    let wSum = 0;
    let vSum = 0;
    for (const m of valid) {
      const val = m.fwdFromClose?.[d];
      if (val !== undefined && val !== null) {
        const w = Math.max(1, m.matchPct || 50);
        wSum += w;
        vSum += val * w;
      }
    }
    const dayPct = wSum > 0 ? vSum / wSum : 0;
    compositePath.push({
      day: d + 1,
      pct: parseFloat(dayPct.toFixed(2)),
      price: toPrice(dayPct),
    });
  }

  return {
    n: valid.length,
    bullishCount,
    bearishCount,
    dominantBias,
    medianForwardClose: parseFloat(medianForwardClose.toFixed(2)),
    meanForwardClose: parseFloat(meanForwardClose.toFixed(2)),
    weightedForwardClose: parseFloat(weightedForwardClose.toFixed(2)),
    majorityMeanClose: parseFloat(majorityMeanClose.toFixed(2)),
    majorityMedianClose: parseFloat(majorityMedianClose.toFixed(2)),
    meanDrawdown: parseFloat(meanDrawdown.toFixed(2)),
    medianDrawdown: parseFloat(medianDrawdown.toFixed(2)),
    meanUpside: parseFloat(meanUpside.toFixed(2)),
    medianUpside: parseFloat(medianUpside.toFixed(2)),
    maxUpside: parseFloat(maxUpside.toFixed(2)),
    maxDownside: parseFloat(maxDownside.toFixed(2)),
    bullishPct,
    bearishPct,
    compositePath,
    targets: {
      cmp: currentPrice ? Math.round(currentPrice) : null,
      weightedClosePrice: toPrice(weightedForwardClose),
      medianClosePrice: toPrice(medianForwardClose),
      meanClosePrice: toPrice(meanForwardClose),
      majorityClosePrice: toPrice(majorityMeanClose),
      medianLowPrice: toPrice(medianDrawdown),
      meanLowPrice: toPrice(meanDrawdown),
      maxLowPrice: toPrice(maxDownside),
      medianHighPrice: toPrice(medianUpside),
      maxHighPrice: toPrice(maxUpside),
    },
  };
}

// ─── 7. Main Entry Point ─────────────────────────────────────────────────────

export function runFractalFinder(candles, { windowLen = 30, forwardLen = 30, k = 5 } = {}) {
  if (candles.length < windowLen + forwardLen + 10) {
    throw new Error(`Need at least ${windowLen + forwardLen + 10} candles for fractal analysis`);
  }

  const currentWindow = candles.slice(-windowLen);
  const currentNormed = normalizeWindow(currentWindow);
  const cmp = currentWindow[currentWindow.length - 1].c;

  const currentInfo = {
    startDate: new Date(currentWindow[0].t).toISOString().split('T')[0],
    endDate: new Date(currentWindow[currentWindow.length - 1].tClose).toISOString().split('T')[0],
    openPrice: currentWindow[0].o,
    closePrice: cmp,
    returnPct: parseFloat((((cmp - currentWindow[0].o) / currentWindow[0].o) * 100).toFixed(2)),
    drawdownPct: parseFloat(
      (((Math.min(...currentWindow.map((c) => c.l)) - currentWindow[0].o) / currentWindow[0].o) * 100).toFixed(2)
    ),
    normed: currentNormed,
  };

  const historicalWindows = extractHistoricalWindows(candles, windowLen, forwardLen);
  const topMatches = findTopMatches(currentNormed, historicalWindows, k);
  const forwardStats = aggregateForwardStats(topMatches, cmp, forwardLen);

  return {
    engineVersion: FRACTAL_ENGINE_VERSION,
    windowLen,
    forwardLen,
    historyDays: candles.length,
    historyStart: new Date(candles[0].t).toISOString().split('T')[0],
    current: currentInfo,
    topMatches: topMatches.map((m) => ({
      startDate: m.startDate,
      endDate: m.endDate,
      matchPct: m.matchPct,
      dist: parseFloat(m.dist.toFixed(2)),
      openPrice: m.openPrice,
      closePrice: m.closePrice,
      drawdownPct: parseFloat(m.drawdownPct.toFixed(2)),
      fwdClosePct: m.fwdClosePct !== null ? parseFloat(m.fwdClosePct.toFixed(2)) : null,
      fwdHighPct: m.fwdHighPct !== null ? parseFloat(m.fwdHighPct.toFixed(2)) : null,
      fwdLowPct: m.fwdLowPct !== null ? parseFloat(m.fwdLowPct.toFixed(2)) : null,
      normed: m.normed,
      fwdNormed: m.fwdNormed,
    })),
    forwardStats,
  };
}
