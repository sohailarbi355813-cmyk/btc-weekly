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
export function buildWeeklyCandles(candles, currentPrice, refDate = null) {
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
    const activeRef = refDate instanceof Date ? refDate : new Date();
    const todayDow = activeRef.getUTCDay();
    currentWeek.close = currentPrice;
    if (currentPrice > currentWeek.high) {
      currentWeek.high = currentPrice;
      currentWeek.highDay = todayDow;
      currentWeek.highDayIndex = DAY_INDEX_MAP[todayDow] ?? 0;
      currentWeek.highDayName = DAY_LABELS[currentWeek.highDayIndex];
    }
    if (currentPrice < currentWeek.low) {
      currentWeek.low = currentPrice;
      currentWeek.lowDay = todayDow;
      currentWeek.lowDayIndex = DAY_INDEX_MAP[todayDow] ?? 0;
      currentWeek.lowDayName = DAY_LABELS[currentWeek.lowDayIndex];
    }
    if (currentWeek.open > 0) {
      currentWeek.returnPct = Math.round((((currentWeek.close - currentWeek.open) / currentWeek.open) * 100) * 100) / 100;
      currentWeek.highPctAboveOpen = Math.round((((currentWeek.high - currentWeek.open) / currentWeek.open) * 100) * 100) / 100;
      currentWeek.lowPctBelowOpen = Math.round((((currentWeek.open - currentWeek.low) / currentWeek.open) * 100) * 100) / 100;
    }
    currentWeek.isBullish = currentWeek.close > currentWeek.open;
    currentWeek.isBearish = currentWeek.close <= currentWeek.open;
  }

  // All completed historical weeks (exclude ongoing current week & partial <3d boundary weeks)
  const completedWeeks = allWeeks.slice(0, -1).filter(w => w.candleCount >= 3);

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
export function calculateWeeklyHighLowProbabilities(candles, currentPrice, refDate = new Date(), selectedBias = 'auto', topMatches = null, defaultAutoBias = null) {
  const now = refDate instanceof Date ? refDate : new Date();
  const { completedWeeks, currentWeek } = buildWeeklyCandles(candles, currentPrice, now);

  if (!currentWeek || completedWeeks.length < 10) {
    return null;
  }

  const currentDow = now.getUTCDay();
  const currentDayIndex = DAY_INDEX_MAP[currentDow] ?? 0; // 0=Mon, 1=Tue, ..., 6=Sun
  const currentDayName = DAY_LABELS[currentDayIndex];

  const WO = currentWeek.open;
  const currentHOW = currentWeek.high;
  const currentLOW = currentWeek.low;
  const currentHighPct = currentWeek.highPctAboveOpen;
  const currentLowPct = currentWeek.lowPctBelowOpen;
  const spotVsWO = WO > 0 ? ((currentPrice - WO) / WO) * 100 : 0;

  // Auto-detect bias: align with overall macro bias verdict if provided, otherwise fall back to spot vs Weekly Open
  const autoDirection = (defaultAutoBias === 'bearish' || defaultAutoBias === 'bullish')
    ? defaultAutoBias
    : (spotVsWO < 0 ? 'bearish' : 'bullish');

  const effectiveBias = selectedBias === 'auto' ? autoDirection : selectedBias;

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
  const p90HighPct = Math.round(getPercentile(allHighPcts, 90) * 100) / 100;

  const medianLowPct = Math.round(getPercentile(allLowPcts, 50) * 100) / 100;
  const p25LowPct = Math.round(getPercentile(allLowPcts, 25) * 100) / 100;
  const p75LowPct = Math.round(getPercentile(allLowPcts, 75) * 100) / 100;
  const p90LowPct = Math.round(getPercentile(allLowPcts, 90) * 100) / 100;

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
  const projectedHighExtreme = Math.round(WO * (1 + (p90HighPct / 100)));
  const projectedLowTarget = Math.round(WO * (1 - (medianLowPct / 100)));
  const projectedLowMax = Math.round(WO * (1 - (p75LowPct / 100)));
  const projectedLowExtreme = Math.round(WO * (1 - (p90LowPct / 100)));

  // Directional target strictly validated against current spot price
  const roundedSpot = Math.round(currentPrice);
  let targetGuidance;
  if (effectiveBias === 'bearish') {
    if (projectedLowTarget < roundedSpot) {
      targetGuidance = { direction: 'bearish', status: 'median', target: projectedLowTarget, breachedTarget: null, label: 'weekly low median' };
    } else if (projectedLowMax < roundedSpot) {
      targetGuidance = { direction: 'bearish', status: 'p75', target: projectedLowMax, breachedTarget: projectedLowTarget, label: '75th pct extended low' };
    } else if (projectedLowExtreme < roundedSpot) {
      targetGuidance = { direction: 'bearish', status: 'p90', target: projectedLowExtreme, breachedTarget: projectedLowMax, label: '90th pct tail low' };
    } else {
      targetGuidance = { direction: 'bearish', status: 'exceeded', target: null, breachedTarget: projectedLowExtreme, label: '90th pct drawdown exceeded' };
    }
  } else {
    if (projectedHighTarget > roundedSpot) {
      targetGuidance = { direction: 'bullish', status: 'median', target: projectedHighTarget, breachedTarget: null, label: 'weekly high median' };
    } else if (projectedHighMax > roundedSpot) {
      targetGuidance = { direction: 'bullish', status: 'p75', target: projectedHighMax, breachedTarget: projectedHighTarget, label: '75th pct extended high' };
    } else if (projectedHighExtreme > roundedSpot) {
      targetGuidance = { direction: 'bullish', status: 'p90', target: projectedHighExtreme, breachedTarget: projectedHighMax, label: '90th pct tail high' };
    } else {
      targetGuidance = { direction: 'bullish', status: 'exceeded', target: null, breachedTarget: projectedHighExtreme, label: '90th pct expansion exceeded' };
    }
  }

  // ── 5. MATCHED HISTORICAL WEEKS & SUBSEQUENT WEEK PROJECTIONS ──────────
  let matchedStats = null;
  if (topMatches && topMatches.length > 0) {
    const weekCandleMap = new Map();
    for (const w of completedWeeks) {
      weekCandleMap.set(w.weekStart, w);
    }

    const matchedCandles = [];
    const subsequentWeeks = [];

    for (const m of topMatches) {
      const wkStart = m.week?.weekStart;
      const matchedCandle = weekCandleMap.get(wkStart);
      if (matchedCandle) {
        matchedCandles.push({ ...matchedCandle, matchScore: m.score, nextWeek: m.nextWeek });
      }
      if (m.nextWeek) {
        let nextReturn = 0;
        if (m.nextWeek.days) {
          // Sort chronologically by YYYY-MM-DD (since JS object numeric keys put 0=Sun before 1=Mon!)
          const dArr = Object.values(m.nextWeek.days).sort((a, b) => a.date.localeCompare(b.date));
          if (dArr.length > 0) {
            const firstOpen = dArr[0].open;
            const lastClose = dArr[dArr.length - 1].close;
            nextReturn = firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
          }
        }
        subsequentWeeks.push({
          returnPct: Math.round(nextReturn * 100) / 100,
          isBullish: nextReturn > 0,
          isBearish: nextReturn <= 0,
        });
      }
    }

    if (matchedCandles.length >= 3) {
      const totalMatched = matchedCandles.length;
      const matchedHighDayCounts = [0, 0, 0, 0, 0, 0, 0];
      const matchedLowDayCounts = [0, 0, 0, 0, 0, 0, 0];
      let sumHighExt = 0;
      let sumLowExt = 0;

      for (const mc of matchedCandles) {
        matchedHighDayCounts[mc.highDayIndex] = (matchedHighDayCounts[mc.highDayIndex] || 0) + 1;
        matchedLowDayCounts[mc.lowDayIndex] = (matchedLowDayCounts[mc.lowDayIndex] || 0) + 1;
        sumHighExt += mc.highPctAboveOpen;
        sumLowExt += mc.lowPctBelowOpen;
      }

      const maxHighDayCount = Math.max(...matchedHighDayCounts);
      const tiedHighDays = DAY_LABELS.filter((_, idx) => matchedHighDayCounts[idx] === maxHighDayCount);
      const peakHighDayLabel = tiedHighDays.slice(0, 3).join(' / ') + (tiedHighDays.length > 3 ? ` (+${tiedHighDays.length - 3})` : '');

      const maxLowDayCount = Math.max(...matchedLowDayCounts);
      const tiedLowDays = DAY_LABELS.filter((_, idx) => matchedLowDayCounts[idx] === maxLowDayCount);
      const peakLowDayLabel = tiedLowDays.slice(0, 3).join(' / ') + (tiedLowDays.length > 3 ? ` (+${tiedLowDays.length - 3})` : '');

      const matchedHighsInByNow = matchedCandles.filter(mc => mc.highDayIndex <= currentDayIndex).length;
      const matchedHighsInByNowPct = Math.round((matchedHighsInByNow / totalMatched) * 100);

      const matchedLowsInByNow = matchedCandles.filter(mc => mc.lowDayIndex <= currentDayIndex).length;
      const matchedLowsInByNowPct = Math.round((matchedLowsInByNow / totalMatched) * 100);

      const subTotal = subsequentWeeks.length;
      const subBearCount = subsequentWeeks.filter(s => s.isBearish).length;
      const subBullCount = subsequentWeeks.filter(s => s.isBullish).length;
      const subBearPct = subTotal > 0 ? Math.round((subBearCount / subTotal) * 100) : 50;
      const subBullPct = subTotal > 0 ? Math.round((subBullCount / subTotal) * 100) : 50;
      const subAvgReturn = subTotal > 0
        ? Math.round((subsequentWeeks.reduce((acc, s) => acc + s.returnPct, 0) / subTotal) * 100) / 100
        : 0;
      const subIsBear = subBearCount > subBullCount || (subBearCount === subBullCount && subAvgReturn < 0);

      matchedStats = {
        totalMatched,
        peakHighDay: peakHighDayLabel,
        peakHighCount: maxHighDayCount,
        peakHighPct: Math.round((maxHighDayCount / totalMatched) * 100),
        highsInByNowPct: matchedHighsInByNowPct,
        highsInByNowCount: matchedHighsInByNow,

        peakLowDay: peakLowDayLabel,
        peakLowCount: maxLowDayCount,
        peakLowPct: Math.round((maxLowDayCount / totalMatched) * 100),
        lowsInByNowPct: matchedLowsInByNowPct,
        lowsInByNowCount: matchedLowsInByNow,

        avgHighExt: Math.round((sumHighExt / totalMatched) * 100) / 100,
        avgLowExt: Math.round((sumLowExt / totalMatched) * 100) / 100,

        subsequent: {
          total: subTotal,
          bearPct: subBearPct,
          bullPct: subBullPct,
          bias: subIsBear ? 'BEARISH' : 'BULLISH',
          biasRate: subIsBear ? subBearPct : subBullPct,
          avgReturn: subAvgReturn,
        }
      };
    }
  }

  return {
    matchedStats,
    targetGuidance,
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
      p90Pct: p90HighPct,
      projectedTarget: projectedHighTarget,
      projectedMax: projectedHighMax,
      projectedExtreme: projectedHighExtreme,
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
      p90Pct: p90LowPct,
      projectedTarget: projectedLowTarget,
      projectedMax: projectedLowMax,
      projectedExtreme: projectedLowExtreme,
      timingDistribution: lowTimingDistribution,
      verdictText: lowIsInProbability >= 65
        ? `High Probability (${lowIsInProbability}%) Low is IN`
        : lowIsInProbability <= 40
        ? `Low Probability (${lowIsInProbability}%) — Low Likely Still Ahead`
        : `Moderate (${lowIsInProbability}%) — Low Timing Developing`,
    },
  };
}
