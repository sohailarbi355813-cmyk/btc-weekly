/**
 * fractalEngine.js — wolf_xbt Fractal Finder
 *
 * Matches the current period's price action shape against all historical
 * windows of the same length, ranked by Euclidean distance on normalised
 * % returns. Deduplicates overlapping shifted windows so top-K represent
 * distinct historical market episodes.
 */

export const FRACTAL_ENGINE_VERSION = 2;

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

    // Express forward closes as cumulative % return from the historical window's open
    // so both matched window and forward path share one continuous coordinate space
    const windowOpen = window[0].o || 1;
    const windowClose = window[window.length - 1].c;
    const fwdSeriesFromOpen = forward.map((c) => ((c.c - windowOpen) / windowOpen) * 100);

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

// ─── 6. Aggregate forward statistics over top matches ─────────────────────────

export function aggregateForwardStats(topMatches) {
  if (!topMatches || topMatches.length === 0) return null;

  const closes = topMatches.map((m) => m.fwdClosePct).filter((v) => v !== null);
  const drawdowns = topMatches.map((m) => m.fwdLowPct).filter((v) => v !== null);
  const highs = topMatches.map((m) => m.fwdHighPct).filter((v) => v !== null);

  if (closes.length === 0) return null;

  const sortedCloses = [...closes].sort((a, b) => a - b);
  const median =
    sortedCloses.length % 2 === 0
      ? (sortedCloses[sortedCloses.length / 2 - 1] + sortedCloses[sortedCloses.length / 2]) / 2
      : sortedCloses[Math.floor(sortedCloses.length / 2)];

  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const bullishPct = Math.round((closes.filter((v) => v > 0).length / closes.length) * 100);

  return {
    n: topMatches.length,
    medianForwardClose: parseFloat(median.toFixed(2)),
    meanForwardClose: parseFloat(mean(closes).toFixed(2)),
    meanDrawdown: parseFloat(mean(drawdowns).toFixed(2)),
    maxUpside: parseFloat(Math.max(...highs).toFixed(2)),
    bullishPct,
    bearishPct: 100 - bullishPct,
  };
}

// ─── 7. Main Entry Point ─────────────────────────────────────────────────────

export function runFractalFinder(candles, { windowLen = 30, forwardLen = 30, k = 5 } = {}) {
  if (candles.length < windowLen + forwardLen + 10) {
    throw new Error(`Need at least ${windowLen + forwardLen + 10} candles for fractal analysis`);
  }

  const currentWindow = candles.slice(-windowLen);
  const currentNormed = normalizeWindow(currentWindow);

  const currentInfo = {
    startDate: new Date(currentWindow[0].t).toISOString().split('T')[0],
    endDate: new Date(currentWindow[currentWindow.length - 1].tClose).toISOString().split('T')[0],
    openPrice: currentWindow[0].o,
    closePrice: currentWindow[currentWindow.length - 1].c,
    returnPct: parseFloat(
      (((currentWindow[currentWindow.length - 1].c - currentWindow[0].o) / currentWindow[0].o) * 100).toFixed(2)
    ),
    drawdownPct: parseFloat(
      (((Math.min(...currentWindow.map((c) => c.l)) - currentWindow[0].o) / currentWindow[0].o) * 100).toFixed(2)
    ),
    normed: currentNormed,
  };

  const historicalWindows = extractHistoricalWindows(candles, windowLen, forwardLen);
  const topMatches = findTopMatches(currentNormed, historicalWindows, k);
  const forwardStats = aggregateForwardStats(topMatches);

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
