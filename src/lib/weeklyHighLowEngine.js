/**
 * Weekly High / Low of the Week (HOW / LOW) Formation Probability Engine
 * 
 * Quantitatively models:
 * 1. Historical timing distributions (Which day of the week sets the High and Low?)
 * 2. Magnitude extension from Weekly Open (How far above/below WO does price travel?)
 * 3. Real-time probability that the High of the Week (HOW) or Low of the Week (LOW) is already locked in.
 * 4. Modeled after institutional weekly candle profiling (e.g. Jip Molenaar / auction weekly cycles).
 */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_INDEX_MAP = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }; // JS getUTCDay() -> 0=Mon..6=Sun

function getISOWeekMonday(d) {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function getPercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Groups daily candles into Monday-to-Sunday weekly candles
 */
export function buildWeeklyCandles(candles, currentPrice) {
  if (!candles || candles.length === 0) return { completedWeeks: [], currentWeek: null };

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const weekMap = new Map();

  for (const c of sorted) {
    const d = new Date(c.date + 'T12:00:00Z');
    const monday = getISOWeekMonday(d);
    const weekKey = monday.toISOString().split('T')[0];

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekStart: weekKey,
        mondayDate: monday,
        candles: [],
      });
    }
    weekMap.get(weekKey).candles.push(c);
  }

  const allWeeks = Array.from(weekMap.values()).map(w => {
    const cs = w.candles.sort((a, b) => a.date.localeCompare(b.date));
    const open = cs[0].open;
    const close = cs[cs.length - 1].close;

    let high = -Infinity;
    let low = Infinity;
    let highCandle = cs[0];
    let lowCandle = cs[0];

    for (const c of cs) {
      if (c.high > high) {
        high = c.high;
        highCandle = c;
      }
      if (c.low < low) {
        low = c.low;
        lowCandle = c;
      }
    }

    const highDate = new Date(highCandle.date + 'T12:00:00Z');
    const lowDate = new Date(lowCandle.date + 'T12:00:00Z');
    const highDow = highDate.getUTCDay();
    const lowDow = lowDate.getUTCDay();
    const highDayIndex = DAY_INDEX_MAP[highDow] ?? 0;
    const lowDayIndex = DAY_INDEX_MAP[lowDow] ?? 0;

    const returnPct = open > 0 ? ((close - open) / open) * 100 : 0;
    const highPctAboveOpen = open > 0 ? ((high - open) / open) * 100 : 0;
    const lowPctBelowOpen = open > 0 ? ((open - low) / open) * 100 : 0;

    return {
      weekStart: w.weekStart,
      open,
      high,
      low,
      close,
      isBullish: close > open,
      isBearish: close <= open,
      returnPct: Math.round(returnPct * 100) / 100,
      highPctAboveOpen: Math.round(highPctAboveOpen * 100) / 100,
      lowPctBelowOpen: Math.round(lowPctBelowOpen * 100) / 100,
      highDay: highDow,
      lowDay: lowDow,
      highDayName: DAY_LABELS[highDayIndex],
      lowDayName: DAY_LABELS[lowDayIndex],
      highDayIndex,
      lowDayIndex,
      candleCount: cs.length,
      candles: cs,
    };
  });

  if (allWeeks.length === 0) return { completedWeeks: [], currentWeek: null };

  // Current active week is the last entry
  const currentWeek = allWeeks[allWeeks.length - 1];

  // Adjust current week with live price if available
  if (currentPrice && currentWeek) {
    currentWeek.close = currentPrice;
    if (currentPrice > currentWeek.high) {
      currentWeek.high = currentPrice;
      const todayDow = new Date().getUTCDay();
      currentWeek.highDay = todayDow;
      currentWeek.highDayIndex = DAY_INDEX_MAP[todayDow] ?? 0;
      currentWeek.highDayName = DAY_LABELS[currentWeek.highDayIndex];
    }
    if (currentPrice < currentWeek.low) {
      currentWeek.low = currentPrice;
      const todayDow = new Date().getUTCDay();
      currentWeek.lowDay = todayDow;
      currentWeek.lowDayIndex = DAY_INDEX_MAP[todayDow] ?? 0;
      currentWeek.lowDayName = DAY_LABELS[currentWeek.lowDayIndex];
    }
    currentWeek.returnPct = Math.round((((currentWeek.close - currentWeek.open) / currentWeek.open) * 100) * 100) / 100;
    currentWeek.highPctAboveOpen = Math.round((((currentWeek.high - currentWeek.open) / currentWeek.open) * 100) * 100) / 100;
    currentWeek.lowPctBelowOpen = Math.round((((currentWeek.open - currentWeek.low) / currentWeek.open) * 100) * 100) / 100;
    currentWeek.isBullish = currentWeek.close > currentWeek.open;
    currentWeek.isBearish = currentWeek.close <= currentWeek.open;
  }

  // All completed historical weeks (exclude ongoing current week)
  const completedWeeks = allWeeks.slice(0, -1);

  return { completedWeeks, currentWeek };
}

/**
 * Calculates High/Low of the Week Formation Probabilities
 * 
 * @param {Array} candles - Raw daily candles
 * @param {number} currentPrice - Spot price
 * @param {Date} refDate - Reference date
 * @param {string} selectedBias - 'auto' | 'bearish' | 'bullish' | 'all'
 */
export function calculateWeeklyHighLowProbabilities(candles, currentPrice, refDate = new Date(), selectedBias = 'auto') {
  const { completedWeeks, currentWeek } = buildWeeklyCandles(candles, currentPrice);

  if (!currentWeek || completedWeeks.length < 10) {
    return null;
  }

  const now = refDate instanceof Date ? refDate : new Date();
  const currentDow = now.getUTCDay();
  const currentDayIndex = DAY_INDEX_MAP[currentDow] ?? 0; // 0=Mon, 1=Tue, ..., 6=Sun
  const currentDayName = DAY_LABELS[currentDayIndex];

  const WO = currentWeek.open;
  const currentHOW = currentWeek.high;
  const currentLOW = currentWeek.low;
  const currentHighPct = currentWeek.highPctAboveOpen;
  const currentLowPct = currentWeek.lowPctBelowOpen;
  const spotVsWO = WO > 0 ? ((currentPrice - WO) / WO) * 100 : 0;

  // Auto-detect bias if requested:
  // If spot is below Weekly Open and technicals are leaning bear, default to bearish assumption
  const effectiveBias = selectedBias === 'auto'
    ? (spotVsWO < 0 ? 'bearish' : 'bullish')
    : selectedBias;

  // Filter historical weeks by selected model
  let cohort = completedWeeks;
  let cohortLabel = 'All Historical Weeks';

  if (effectiveBias === 'bearish') {
    cohort = completedWeeks.filter(w => w.isBearish);
    cohortLabel = 'Bearish Close Weeks';
  } else if (effectiveBias === 'bullish') {
    cohort = completedWeeks.filter(w => w.isBullish);
    cohortLabel = 'Bullish Close Weeks';
  }

  const sampleSize = cohort.length;
  if (sampleSize === 0) return null;

  // ── 1. Timing Breakdown (By Day of Week) ──────────────────────────────────
  const highDayCounts = [0, 0, 0, 0, 0, 0, 0];
  const lowDayCounts = [0, 0, 0, 0, 0, 0, 0];

  for (const w of cohort) {
    highDayCounts[w.highDayIndex] = (highDayCounts[w.highDayIndex] || 0) + 1;
    lowDayCounts[w.lowDayIndex] = (lowDayCounts[w.lowDayIndex] || 0) + 1;
  }

  const highTimingDistribution = DAY_LABELS.map((day, idx) => ({
    day,
    dayIndex: idx,
    count: highDayCounts[idx],
    pct: Math.round((highDayCounts[idx] / sampleSize) * 1000) / 10,
    isPastOrToday: idx <= currentDayIndex,
    isToday: idx === currentDayIndex,
  }));

  const lowTimingDistribution = DAY_LABELS.map((day, idx) => ({
    day,
    dayIndex: idx,
    count: lowDayCounts[idx],
    pct: Math.round((lowDayCounts[idx] / sampleSize) * 1000) / 10,
    isPastOrToday: idx <= currentDayIndex,
    isToday: idx === currentDayIndex,
  }));

  // Cumulative timing up to current day
  const weeksWithHighByNow = cohort.filter(w => w.highDayIndex <= currentDayIndex).length;
  const pctHighInByNow = Math.round((weeksWithHighByNow / sampleSize) * 100);
  const pctHighInLater = Math.max(0, 100 - pctHighInByNow);

  const weeksWithLowByNow = cohort.filter(w => w.lowDayIndex <= currentDayIndex).length;
  const pctLowInByNow = Math.round((weeksWithLowByNow / sampleSize) * 100);
  const pctLowInLater = Math.max(0, 100 - pctLowInByNow);

  // ── 2. Magnitude Breakdown (Extension Above / Below Open) ─────────────────
  const allHighPcts = cohort.map(w => w.highPctAboveOpen);
  const allLowPcts = cohort.map(w => w.lowPctBelowOpen);

  const medianHighPct = Math.round(getPercentile(allHighPcts, 50) * 100) / 100;
  const p25HighPct = Math.round(getPercentile(allHighPcts, 25) * 100) / 100;
  const p75HighPct = Math.round(getPercentile(allHighPcts, 75) * 100) / 100;

  const medianLowPct = Math.round(getPercentile(allLowPcts, 50) * 100) / 100;
  const p25LowPct = Math.round(getPercentile(allLowPcts, 25) * 100) / 100;
  const p75LowPct = Math.round(getPercentile(allLowPcts, 75) * 100) / 100;

  // How many historical weeks had a high that exceeded the current week's high?
  const weeksWithHighFurther = cohort.filter(w => w.highPctAboveOpen > currentHighPct).length;
  const pctHighFurther = Math.round((weeksWithHighFurther / sampleSize) * 100);
  const pctHighCapped = Math.max(0, 100 - pctHighFurther);

  // How many historical weeks had a low that exceeded the current week's drawdown?
  const weeksWithLowFurther = cohort.filter(w => w.lowPctBelowOpen > currentLowPct).length;
  const pctLowFurther = Math.round((weeksWithLowFurther / sampleSize) * 100);
  const pctLowFloor = Math.max(0, 100 - pctLowFurther);

  // ── 3. Calibrated Probabilities ──────────────────────────────────────────
  // Blended Bayes: 50% weight on time elapsed, 50% weight on magnitude exhaustion
  // Additional boost if current price has clearly dropped well below the week's high
  const highExhaustionScore = (pctHighInByNow * 0.5) + (pctHighCapped * 0.5);
  const highIsInProbability = Math.min(Math.max(Math.round(highExhaustionScore), 5), 95);

  const lowExhaustionScore = (pctLowInByNow * 0.5) + (pctLowFloor * 0.5);
  const lowIsInProbability = Math.min(Math.max(Math.round(lowExhaustionScore), 5), 95);

  // ── 4. Target Projections ────────────────────────────────────────────────
  const projectedHighTarget = Math.round(WO * (1 + (medianHighPct / 100)));
  const projectedHighMax = Math.round(WO * (1 + (p75HighPct / 100)));
  const projectedLowTarget = Math.round(WO * (1 - (medianLowPct / 100)));
  const projectedLowMax = Math.round(WO * (1 - (p75LowPct / 100)));

  return {
    effectiveBias,
    selectedBias,
    cohortLabel,
    sampleSize,
    totalCompletedWeeks: completedWeeks.length,
    currentWeek: {
      open: Math.round(WO),
      high: Math.round(currentHOW),
      low: Math.round(currentLOW),
      price: Math.round(currentPrice),
      spotVsWO: Math.round(spotVsWO * 100) / 100,
      highPct: currentHighPct,
      lowPct: currentLowPct,
      highDayName: currentWeek.highDayName,
      lowDayName: currentWeek.lowDayName,
      currentDayName,
      currentDayIndex,
    },
    highMetrics: {
      probabilityIsIn: highIsInProbability,
      pctInByNow: pctHighInByNow,
      pctInLater: pctHighInLater,
      pctFurtherAboveOpen: pctHighFurther,
      pctCappedAtOrBelow: pctHighCapped,
      medianPct: medianHighPct,
      p75Pct: p75HighPct,
      projectedTarget: projectedHighTarget,
      projectedMax: projectedHighMax,
      timingDistribution: highTimingDistribution,
      verdictText: highIsInProbability >= 65
        ? `High Probability (${highIsInProbability}%) High is IN`
        : highIsInProbability <= 40
        ? `Low Probability (${highIsInProbability}%) — High Likely Still Ahead`
        : `Moderate (${highIsInProbability}%) — High Timing Developing`,
    },
    lowMetrics: {
      probabilityIsIn: lowIsInProbability,
      pctInByNow: pctLowInByNow,
      pctInLater: pctLowInLater,
      pctFurtherBelowOpen: pctLowFurther,
      pctFloorAtOrAbove: pctLowFloor,
      medianPct: medianLowPct,
      p75Pct: p75LowPct,
      projectedTarget: projectedLowTarget,
      projectedMax: projectedLowMax,
      timingDistribution: lowTimingDistribution,
      verdictText: lowIsInProbability >= 65
        ? `High Probability (${lowIsInProbability}%) Low is IN`
        : lowIsInProbability <= 40
        ? `Low Probability (${lowIsInProbability}%) — Low Likely Still Ahead`
        : `Moderate (${lowIsInProbability}%) — Low Timing Developing`,
    },
  };
}
