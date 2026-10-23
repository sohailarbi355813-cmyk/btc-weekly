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

/**
 * Calculate the combined bias signal for today
 */
export function getTodayBias(candles, currentPrice, referenceDate = null) {
  const today = referenceDate instanceof Date ? referenceDate : new Date();
  const dow = today.getUTCDay();
  const month = today.getUTCMonth();

  const dowStats = analyzeDayOfWeek(candles);
  const weeklyBias = analyzeWeeklyOpenBias(candles, currentPrice);
  const monthlyStats = analyzeMonthlyBias(candles);

  const todayDowStats = dowStats[dow];
  const todayMonthStats = monthlyStats[month];

  // Combine signals with weights
  // DOW: 50%, Weekly Open: 35%, Monthly: 15%
  const dowSignal = todayDowStats.bullishRate - 50; // -50 to +50
  const weeklySignal = weeklyBias.currentBullRate - 50;
  const monthlySignal = todayMonthStats.bullishRate - 50;

  const combinedSignal = (dowSignal * 0.50) + (weeklySignal * 0.35) + (monthlySignal * 0.15);

  // Confidence = how far the signal is from neutral (0), scaled to 0-100
  const confidence = Math.min(Math.abs(combinedSignal) * 2, 100);
  const bias = combinedSignal > 2 ? 'bullish' : combinedSignal < -2 ? 'bearish' : 'neutral';

  // Recent N-week same-day performance (last 8 occurrences of today's DOW)
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const recentSameDay = sorted
    .filter(c => new Date(c.date + 'T12:00:00Z').getUTCDay() === dow)
    .slice(-8);

  const recentBullish = recentSameDay.filter(c => isBullish(c)).length;
  const recentBullRate = recentSameDay.length > 0 ? (recentBullish / recentSameDay.length) * 100 : 50;

  return {
    date: today.toISOString().split('T')[0],
    dayName: DAY_NAMES[dow],
    dow,
    month,
    bias,
    confidence: Math.round(confidence),
    combinedSignal: Math.round(combinedSignal * 10) / 10,
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
