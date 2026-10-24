/**
 * BTC Bias Engine — Statistical analysis of historical BTC daily candles.
 * Provides:
 *  - Day-of-week bias (bullish/bearish win rate per day)
 *  - Weekly open bias (current price vs weekly open)
 *  - Monthly seasonal patterns
 *  - Combined confidence score
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Determine if a candle is bullish (close > open)
 */
function isBullish(candle) {
  return candle.close > candle.open;
}

/**
 * Calculate percentage return for a candle
 */
function pctReturn(candle) {
  return ((candle.close - candle.open) / candle.open) * 100;
}

/**
 * Analyze day-of-week bias from candle data
 * Returns stats for each day (0=Sun … 6=Sat)
 */
export function analyzeDayOfWeek(candles) {
  const stats = {};

  for (let d = 0; d < 7; d++) {
    stats[d] = {
      day: d,
      dayName: DAY_NAMES[d],
      total: 0,
      bullish: 0,
      bearish: 0,
      returns: [],
      avgReturn: 0,
      bullishRate: 0,
      bearishRate: 0,
      avgBullishReturn: 0,
      avgBearishReturn: 0,
      maxGain: 0,
      maxLoss: 0,
      medianReturn: 0,
      bias: 'neutral',
      strength: 0, // 0-100 confidence
      streaks: { currentBullStreak: 0, currentBearStreak: 0, maxBullStreak: 0, maxBearStreak: 0 },
    };
  }

  // Sort candles by date
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));

  for (const candle of sorted) {
    const dow = new Date(candle.date + 'T12:00:00Z').getUTCDay();
    const ret = pctReturn(candle);
    const s = stats[dow];

    s.total++;
    s.returns.push(ret);
    if (ret > 0) s.bullish++;
    else s.bearish++;
    s.maxGain = Math.max(s.maxGain, ret);
    s.maxLoss = Math.min(s.maxLoss, ret);
  }

  // Calculate derived stats
  for (let d = 0; d < 7; d++) {
    const s = stats[d];
    if (s.total === 0) continue;

    const sortedReturns = [...s.returns].sort((a, b) => a - b);
    s.avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    s.bullishRate = (s.bullish / s.total) * 100;
    s.bearishRate = (s.bearish / s.total) * 100;

    // Median
    const mid = Math.floor(sortedReturns.length / 2);
    s.medianReturn = sortedReturns.length % 2 === 0
      ? (sortedReturns[mid - 1] + sortedReturns[mid]) / 2
      : sortedReturns[mid];

    // Avg bullish/bearish returns
    const bullReturns = s.returns.filter(r => r > 0);
    const bearReturns = s.returns.filter(r => r < 0);
    s.avgBullishReturn = bullReturns.length ? bullReturns.reduce((a, b) => a + b, 0) / bullReturns.length : 0;
    s.avgBearishReturn = bearReturns.length ? bearReturns.reduce((a, b) => a + b, 0) / bearReturns.length : 0;

    // Bias determination
    // Use both win rate and average return weighted
    const winRateSignal = s.bullishRate - 50; // positive = bullish edge
    const returnSignal = s.avgReturn; // positive = bullish

    // Normalize signals to -1 to 1
    const normalizedWinRate = winRateSignal / 50;
    const normalizedReturn = Math.min(Math.max(returnSignal / 3, -1), 1); // cap at ±3%

    const combinedSignal = (normalizedWinRate * 0.6) + (normalizedReturn * 0.4);

    if (combinedSignal > 0.05) s.bias = 'bullish';
    else if (combinedSignal < -0.05) s.bias = 'bearish';
    else s.bias = 'neutral';

    // Strength = how far from 50% win rate (0-100 scale)
    s.strength = Math.min(Math.abs(combinedSignal) * 100, 100);
  }

  // Calculate streaks
  for (let d = 0; d < 7; d++) {
    const dayCandlesSorted = sorted.filter(c => new Date(c.date + 'T12:00:00Z').getUTCDay() === d);
    let bullStreak = 0, bearStreak = 0, maxBull = 0, maxBear = 0;

    for (const c of dayCandlesSorted) {
      if (isBullish(c)) {
        bullStreak++;
        bearStreak = 0;
        maxBull = Math.max(maxBull, bullStreak);
      } else {
        bearStreak++;
        bullStreak = 0;
        maxBear = Math.max(maxBear, bearStreak);
      }
    }
    stats[d].streaks = { currentBullStreak: bullStreak, currentBearStreak: bearStreak, maxBullStreak: maxBull, maxBearStreak: maxBear };
  }

  return stats;
}

/**
 * Calculate weekly open bias
 * Returns whether current price is above or below the weekly open
 * and the historical tendency when price is above/below weekly open
 */
export function analyzeWeeklyOpenBias(candles, currentPrice) {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));

  // Find weekly opens (first candle of each ISO week)
  const weekMap = new Map();
  for (const candle of sorted) {
    const d = new Date(candle.date + 'T12:00:00Z');
    // ISO week key: year-week
    const weekKey = getISOWeekKey(d);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { open: candle.open, candles: [] });
    }
    weekMap.get(weekKey).candles.push(candle);
  }

  // For each week: was the week bullish or bearish? Was price mostly above/below weekly open?
  let aboveOpenBullish = 0, aboveOpenBearish = 0;
  let belowOpenBullish = 0, belowOpenBearish = 0;

  for (const [, week] of weekMap) {
    if (week.candles.length < 3) continue;
    const weeklyClose = week.candles[week.candles.length - 1].close;
    const weeklyReturn = ((weeklyClose - week.open) / week.open) * 100;
    const weekBullish = weeklyReturn > 0;

    // Check midweek price position relative to weekly open
    const midCandle = week.candles[Math.floor(week.candles.length / 2)];
    const midAboveOpen = midCandle.close > week.open;

    if (midAboveOpen) {
      if (weekBullish) aboveOpenBullish++;
      else aboveOpenBearish++;
    } else {
      if (weekBullish) belowOpenBullish++;
      else belowOpenBearish++;
    }
  }

  // Current week position
  const thisWeekStart = getThisWeekMonday();
  const thisWeekKey = getISOWeekKey(thisWeekStart);
  const thisWeek = weekMap.get(thisWeekKey);
  const weeklyOpen = thisWeek ? thisWeek.open : (sorted[sorted.length - 1]?.open ?? currentPrice);

  const priceVsWeeklyOpen = currentPrice > weeklyOpen ? 'above' : 'below';
  const pctFromWeeklyOpen = ((currentPrice - weeklyOpen) / weeklyOpen) * 100;

  // Bullish rate when above weekly open historically
  const aboveTotal = aboveOpenBullish + aboveOpenBearish;
  const belowTotal = belowOpenBullish + belowOpenBearish;
  const aboveOpenBullRate = aboveTotal > 0 ? (aboveOpenBullish / aboveTotal) * 100 : 50;
  const belowOpenBullRate = belowTotal > 0 ? (belowOpenBullish / belowTotal) * 100 : 50;

  return {
    weeklyOpen,
    currentPrice,
    priceVsWeeklyOpen,
    pctFromWeeklyOpen,
    aboveOpenBullRate,
    belowOpenBullRate,
    currentBullRate: priceVsWeeklyOpen === 'above' ? aboveOpenBullRate : belowOpenBullRate,
    bias: priceVsWeeklyOpen === 'above'
      ? (aboveOpenBullRate > 55 ? 'bullish' : aboveOpenBullRate < 45 ? 'bearish' : 'neutral')
      : (belowOpenBullRate > 55 ? 'bullish' : belowOpenBullRate < 45 ? 'bearish' : 'neutral'),
  };
}

/**
 * Analyze monthly seasonal bias
 */
export function analyzeMonthlyBias(candles) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const stats = {};

  for (let m = 0; m < 12; m++) {
    stats[m] = { month: m, monthName: MONTHS[m], total: 0, bullish: 0, returns: [], avgReturn: 0, bullishRate: 0, bias: 'neutral' };
  }

  // Group by month and calculate monthly returns (first to last candle of month)
  const monthMap = new Map();
  for (const candle of candles) {
    const d = new Date(candle.date + 'T12:00:00Z');
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!monthMap.has(key)) monthMap.set(key, { month: d.getUTCMonth(), candles: [] });
    monthMap.get(key).candles.push(candle);
  }

  for (const [, mData] of monthMap) {
    if (mData.candles.length < 10) continue;
    const sorted = mData.candles.sort((a, b) => a.date.localeCompare(b.date));
    const monthReturn = ((sorted[sorted.length - 1].close - sorted[0].open) / sorted[0].open) * 100;
    const s = stats[mData.month];
    s.total++;
    s.returns.push(monthReturn);
    if (monthReturn > 0) s.bullish++;
  }

  for (let m = 0; m < 12; m++) {
    const s = stats[m];
    if (s.total === 0) continue;
    s.avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    s.bullishRate = (s.bullish / s.total) * 100;
    s.bias = s.bullishRate > 55 ? 'bullish' : s.bullishRate < 45 ? 'bearish' : 'neutral';
  }

  return stats;
}

export const DEFAULT_BIAS_FILTERS = {
  preset: 'highest_prob', // 'highest_prob' | 'bleed_guard' | 'trend_structure' | 'recent_regime' | 'raw_legacy' | 'custom'
  enableTrend: true,
  enableBleedGuard: true,
  enableWeeklyOpen: true,
  enableRecentRegime: true,
  enableRawStats: true,
};

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(data, period) {
  if (!data || data.length === 0) return 0;
  if (data.length < period) return data[data.length - 1];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(data, period = 14) {
  if (!data || data.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }
  const rs = avgGain / (avgLoss || 1e-9);
  return Math.round((100 - (100 / (1 + rs))) * 10) / 10;
}

/**
 * Calculate the combined bias signal for today with multi-confluence institutional filters
 */
export function getTodayBias(candles, currentPrice, referenceDate = null, filterSettings = DEFAULT_BIAS_FILTERS) {
  const today = referenceDate instanceof Date ? referenceDate : new Date();
  const dow = today.getUTCDay();
  const month = today.getUTCMonth();

  const dowStats = analyzeDayOfWeek(candles);
  const weeklyBias = analyzeWeeklyOpenBias(candles, currentPrice);
  const monthlyStats = analyzeMonthlyBias(candles);

  const todayDowStats = dowStats[dow];
  const todayMonthStats = monthlyStats[month];

  // 1. Raw Legacy Formula (historical DOW + Weekly Open + Monthly)
  const dowSignal = todayDowStats.bullishRate - 50; // -50 to +50
  const weeklySignal = weeklyBias.currentBullRate - 50;
  const monthlySignal = todayMonthStats.bullishRate - 50;

  const rawCombinedSignal = (dowSignal * 0.50) + (weeklySignal * 0.35) + (monthlySignal * 0.15);
  const rawConfidence = Math.min(Math.round(Math.abs(rawCombinedSignal) * 2), 100);
  const rawBias = rawCombinedSignal > 2 ? 'bullish' : rawCombinedSignal < -2 ? 'bearish' : 'neutral';

  // Recent N-week same-day performance (last 8 occurrences of today's DOW)
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const recentSameDay = sorted
    .filter(c => new Date(c.date + 'T12:00:00Z').getUTCDay() === dow)
    .slice(-8);

  const recentBullish = recentSameDay.filter(c => isBullish(c)).length;
  const recentBullRate = recentSameDay.length > 0 ? (recentBullish / recentSameDay.length) * 100 : 50;

  // 2. High-Probability Confluence Filters (EMA 20/50, Bleed Trap Guard, RSI, 24h Momentum)
  const closes = sorted.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);

  const prevCandle = sorted.length >= 2 ? sorted[sorted.length - 2] : sorted[sorted.length - 1];
  const change24h = prevCandle && prevCandle.close > 0
    ? ((currentPrice - prevCandle.close) / prevCandle.close) * 100
    : 0;
  const priceVsEma20Pct = ema20 > 0 ? ((currentPrice - ema20) / ema20) * 100 : 0;
  const priceVsEma50Pct = ema50 > 0 ? ((currentPrice - ema50) / ema50) * 100 : 0;

  // Confluence Scoring
  const activeFilters = { ...DEFAULT_BIAS_FILTERS, ...(filterSettings || {}) };
  const confluences = [];
  let sumScores = 0;
  let totalWeight = 0;

  // A. Trend Structure (20 EMA & 50 EMA)
  let trendScore = 0;
  if (currentPrice > ema20 && ema20 > ema50) trendScore = 30; // Golden bull trend
  else if (currentPrice > ema20) trendScore = 15; // Above 20 EMA
  else if (currentPrice < ema20 && ema20 < ema50) trendScore = -30; // Bear trend
  else trendScore = -20; // Under 20 EMA

  const trendConfluence = {
    id: 'trend',
    name: 'Trend Structure (20 EMA)',
    weight: 30,
    score: trendScore,
    state: trendScore > 0 ? 'bullish' : 'bearish',
    valueText: `${priceVsEma20Pct > 0 ? '+' : ''}${priceVsEma20Pct.toFixed(2)}% vs 20 EMA ($${Math.round(ema20).toLocaleString()})`,
    detail: currentPrice > ema20 ? 'Holding above Daily 20 EMA support' : 'Trading below Daily 20 EMA resistance',
  };
  confluences.push(trendConfluence);
  if (activeFilters.enableTrend) {
    sumScores += trendScore;
    totalWeight += 30;
  }

  // B. Bleed Trap Guard (24h Net Delta & RSI 14)
  let bleedScore = 0;
  const isBleeding = change24h < -0.5 || rsi14 < 44;
  const isPumping = change24h > 0.8 && rsi14 > 53;

  if (isBleeding) {
    bleedScore = -25;
  } else if (isPumping) {
    bleedScore = 25;
  } else {
    bleedScore = 0;
  }

  const isBleedTrap = (change24h < -0.4 || rsi14 < 45 || currentPrice < ema20) && (todayDowStats.bullishRate >= 50);

  const bleedConfluence = {
    id: 'bleed_guard',
    name: 'Bleed Trap Guard (RSI & Delta)',
    weight: 25,
    score: bleedScore,
    state: bleedScore < 0 ? 'bearish' : bleedScore > 0 ? 'bullish' : 'neutral',
    valueText: `24h: ${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% · RSI: ${rsi14.toFixed(1)}`,
    detail: isBleedTrap
      ? '⚠️ Warning: Intraday distribution active despite historical bullish bias'
      : isBleeding
      ? 'Bearish momentum & selling pressure dominant'
      : isPumping
      ? 'Clean expansion & positive delta momentum'
      : 'Neutral order flow consolidation',
  };
  confluences.push(bleedConfluence);
  if (activeFilters.enableBleedGuard) {
    sumScores += bleedScore;
    totalWeight += 25;
  }

  // C. Weekly Open Level
  const woScore = weeklyBias.priceVsWeeklyOpen === 'above' ? 25 : -25;
  const woConfluence = {
    id: 'weekly_open',
    name: 'Weekly Open Level',
    weight: 25,
    score: woScore,
    state: weeklyBias.priceVsWeeklyOpen === 'above' ? 'bullish' : 'bearish',
    valueText: `${weeklyBias.pctFromWeeklyOpen > 0 ? '+' : ''}${weeklyBias.pctFromWeeklyOpen.toFixed(2)}% ($${Math.round(weeklyBias.weeklyOpen).toLocaleString()})`,
    detail: weeklyBias.priceVsWeeklyOpen === 'above'
      ? 'Acceptance above Weekly Open (Institutional Long Edge)'
      : 'Trading below Weekly Open (Institutional Short Edge)',
  };
  confluences.push(woConfluence);
  if (activeFilters.enableWeeklyOpen) {
    sumScores += woScore;
    totalWeight += 25;
  }

  // D. Recent 8-Week Cycle Regime
  let regimeScore = 0;
  if (recentBullRate >= 62.5) regimeScore = 15;
  else if (recentBullRate <= 37.5) regimeScore = -15;
  else regimeScore = 0;

  const regimeConfluence = {
    id: 'recent_regime',
    name: 'Recent 8-Week Regime',
    weight: 15,
    score: regimeScore,
    state: recentBullRate > 50 ? 'bullish' : recentBullRate < 50 ? 'bearish' : 'neutral',
    valueText: `${recentBullRate.toFixed(0)}% Bull win rate (last 8 ${DAY_NAMES[dow].slice(0, 3)}s)`,
    detail: recentBullRate >= 60
      ? 'Current cycle strongly favors longs on this day'
      : recentBullRate <= 40
      ? 'Current cycle heavily bleeds on this day'
      : 'Even distribution in recent weeks',
  };
  confluences.push(regimeConfluence);
  if (activeFilters.enableRecentRegime) {
    sumScores += regimeScore;
    totalWeight += 15;
  }

  // E. Raw DOW Historical Rate
  const rawDowScore = Math.max(-10, Math.min(10, Math.round((todayDowStats.bullishRate - 50) * 0.2)));
  const rawDowConfluence = {
    id: 'raw_dow',
    name: 'Historical DOW Baseline',
    weight: 10,
    score: rawDowScore,
    state: todayDowStats.bullishRate > 52 ? 'bullish' : todayDowStats.bullishRate < 48 ? 'bearish' : 'neutral',
    valueText: `${todayDowStats.bullishRate.toFixed(0)}% Bull (5-Year Average)`,
    detail: `${todayDowStats.bullish} green / ${todayDowStats.total} total occurrences since 2021`,
  };
  confluences.push(rawDowConfluence);
  if (activeFilters.enableRawStats) {
    sumScores += rawDowScore;
    totalWeight += 10;
  }

  // Final Composite High-Probability Calculation
  const isRawPreset = activeFilters.preset === 'raw_legacy' || totalWeight === 0;

  let finalBias = rawBias;
  let finalConfidence = rawConfidence;
  let normalizedScore = 0;

  if (!isRawPreset && totalWeight > 0) {
    normalizedScore = Math.round((sumScores / totalWeight) * 100);
    finalBias = normalizedScore > 8 ? 'bullish' : normalizedScore < -8 ? 'bearish' : 'neutral';
    // When confluences align, confidence reflects true institutional certainty (65% - 95%)
    finalConfidence = Math.min(Math.max(Math.round(Math.abs(normalizedScore)), 55), 96);
  }

  // Bleed Trap Alert Details
  const bleedTrap = {
    detected: isBleedTrap,
    title: 'BLEED TRAP CONFLICT DETECTED',
    explanation: `Historical Day-of-Week statistics show a ${todayDowStats.bullishRate.toFixed(0)}% bullish tendency, but real-time technical structure is actively bleeding (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% 24h delta, RSI ${rsi14.toFixed(1)}, and price below 20 EMA). Naive longs are at severe risk of being trapped.`,
  };

  return {
    date: today.toISOString().split('T')[0],
    dayName: DAY_NAMES[dow],
    dow,
    month,
    bias: finalBias,
    confidence: finalConfidence,
    rawBias,
    rawConfidence,
    isFiltered: !isRawPreset,
    activeFilters,
    confluences,
    confluenceScore: normalizedScore,
    bleedTrap,
    technicalMetrics: {
      ema20: Math.round(ema20),
      ema50: Math.round(ema50),
      priceVsEma20Pct: Math.round(priceVsEma20Pct * 100) / 100,
      priceVsEma50Pct: Math.round(priceVsEma50Pct * 100) / 100,
      rsi14,
      change24h: Math.round(change24h * 100) / 100,
      weeklyOpen: Math.round(weeklyBias.weeklyOpen),
      pctFromWeeklyOpen: Math.round(weeklyBias.pctFromWeeklyOpen * 100) / 100,
    },
    combinedSignal: Math.round(rawCombinedSignal * 10) / 10,
    dowStats: todayDowStats,
    weeklyBias,
    monthlyStats: todayMonthStats,
    recentSameDay,
    recentBullRate: Math.round(recentBullRate),
    allDowStats: dowStats,
    allMonthlyStats: monthlyStats,
    currentPrice,
  };
}

// --- Helpers ---

function getISOWeekKey(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getThisWeekMonday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}
