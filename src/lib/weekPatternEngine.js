/**
 * Week Pattern Matching Engine
 *
 * Algorithm:
 * 1. Build weekly profiles from historical candles (each week = array of daily returns by DOW)
 * 2. Get the current week's completed days and their returns
 * 3. Score every historical week based on similarity to the current week pattern
 * 4. From top-N similar weeks, calculate what happened on the remaining days
 * 5. Also compute what happened the NEXT week (for next-week prediction)
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Build Weekly Profiles ─────────────────────────────────────────────────────
/**
 * Groups candles into weekly profiles.
 * Each week = { weekKey, weekStart, days: { 0: {date,open,close,return}, ... }, ... }
 * Days keyed by day-of-week (0=Sun, 1=Mon, ... 6=Sat)
 */
export function buildWeeklyProfiles(candles) {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const weekMap = new Map();

  for (const candle of sorted) {
    const d = new Date(candle.date + 'T12:00:00Z');
    const weekKey = getISOWeekKey(d);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekKey,
        weekStart: getWeekMonday(d).toISOString().split('T')[0],
        days: {},
      });
    }

    const dow = d.getUTCDay();
    const ret = ((candle.close - candle.open) / candle.open) * 100;
    weekMap.get(weekKey).days[dow] = {
      date: candle.date,
      dow,
      dayName: DAY_NAMES[dow],
      open: candle.open,
      close: candle.close,
      return: ret,
      bullish: ret > 0,
    };
  }

  // Convert to sorted array, filter weeks with at least 3 days of data
  return Array.from(weekMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .filter(w => Object.keys(w.days).length >= 3);
}

// ─── Get Current Week Profile ──────────────────────────────────────────────────
export function getCurrentWeekProfile(weeks) {
  if (weeks.length === 0) return null;
  // The last week in the array is the current (or most recent) week
  return weeks[weeks.length - 1];
}

// ─── Similarity Scoring ────────────────────────────────────────────────────────
/**
 * Score how similar a historical week is to the current week.
 * We only compare days that are COMPLETED in the current week.
 *
 * Scoring factors (weighted):
 * - Direction match (bull/bear): 50%
 * - Magnitude similarity (returns in same bucket): 30%
 * - Trend shape (consecutive pattern): 20%
 *
 * Returns a score from 0 to 100.
 */
function scoreWeekSimilarity(currentWeek, historicalWeek, completedDows) {
  if (completedDows.length === 0) return 0;

  let totalScore = 0;
  let maxScore = 0;

  for (const dow of completedDows) {
    const cur = currentWeek.days[dow];
    const hist = historicalWeek.days[dow];

    if (!cur || !hist) continue;

    maxScore += 100;

    // Direction match (most important)
    if (cur.bullish === hist.bullish) {
      totalScore += 50;
    }

    // Magnitude bucket match: both small (<1%), medium (1-3%), large (>3%)
    const curMag = magnitudeBucket(cur.return);
    const histMag = magnitudeBucket(hist.return);
    if (curMag === histMag) {
      totalScore += 30;
    } else if (Math.abs(curMag - histMag) === 1) {
      totalScore += 10; // Partial credit for adjacent buckets
    }

    // Magnitude closeness: extra points for very similar % return
    const diff = Math.abs(Math.abs(cur.return) - Math.abs(hist.return));
    if (diff < 0.5) totalScore += 20;
    else if (diff < 1.5) totalScore += 10;
    else if (diff < 3) totalScore += 5;
  }

  if (maxScore === 0) return 0;

  // Bonus: trend shape similarity (direction sequence)
  const curSequence = completedDows
    .map(d => currentWeek.days[d]?.bullish)
    .filter(Boolean);
  const histSequence = completedDows
    .map(d => historicalWeek.days[d]?.bullish)
    .filter(Boolean);

  let sequenceMatches = 0;
  for (let i = 0; i < Math.min(curSequence.length, histSequence.length); i++) {
    if (curSequence[i] === histSequence[i]) sequenceMatches++;
  }
  const seqBonus = completedDows.length > 1
    ? (sequenceMatches / completedDows.length) * 20
    : 0;

  return Math.min(100, ((totalScore / maxScore) * 80) + seqBonus);
}

function magnitudeBucket(ret) {
  const abs = Math.abs(ret);
  if (abs < 1) return 0;   // small
  if (abs < 3) return 1;   // medium
  if (abs < 6) return 2;   // large
  return 3;                // extreme
}

// ─── Find Similar Weeks ────────────────────────────────────────────────────────
/**
 * Main function: find historical weeks similar to current, analyze remaining days.
 */
export function findSimilarWeeks(weeks, topN = 25, referenceDate = null) {
  if (weeks.length < 5) return null;

  const currentWeek = getCurrentWeekProfile(weeks);
  if (!currentWeek) return null;

  // Standard trading week order: Mon (1) to Sun (0)
  const allDows = [1, 2, 3, 4, 5, 6, 0];

  const refDate = referenceDate instanceof Date ? referenceDate : new Date();
  const todayDow = refDate.getUTCDay();

  // Completed days in current week (have data)
  const completedDows = Object.keys(currentWeek.days).map(Number).sort((a, b) => {
    return allDows.indexOf(a) - allDows.indexOf(b);
  });

  // Closed days: days strictly before today in this week that are closed
  const todayIndex = allDows.indexOf(todayDow);
  const closedDows = completedDows.filter(d => allDows.indexOf(d) < todayIndex);
  
  // Matching days: use closed days if available, otherwise available days
  const matchDows = closedDows.length > 0 ? closedDows : completedDows;

  // Remaining / future days
  const futureDows = allDows.filter(d => allDows.indexOf(d) > todayIndex);

  // Score all historical weeks (exclude current week itself)
  const historicalWeeks = weeks.slice(0, -1);

  const scored = historicalWeeks.map((week, idx) => ({
    week,
    idx,
    score: scoreWeekSimilarity(currentWeek, week, matchDows),
    nextWeek: weeks[idx + 1] ?? null,
  })).filter(w => w.score >= 25);

  // Sort by similarity score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  const topMatches = scored.slice(0, topN);

  if (topMatches.length === 0) {
    return {
      currentWeek,
      completedDows,
      closedDows,
      futureDows,
      todayDow,
      topMatches: [],
      predictions: {},
      nextWeekPredictions: {},
      currentPattern: describePattern(currentWeek, matchDows),
      totalMatchesFound: 0,
    };
  }

  // ── Analyze days from matched weeks ──
  const predictions = {};

  for (const dow of allDowsInWeek()) {
    const dayResults = topMatches
      .filter(m => m.week.days[dow] !== undefined)
      .map(m => m.week.days[dow]);

    if (dayResults.length === 0) continue;

    const bullish = dayResults.filter(d => d.bullish).length;
    const returns = dayResults.map(d => d.return);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const bullishRate = (bullish / dayResults.length) * 100;

    // Weighted stats (weighted by similarity score)
    const weightedBull = topMatches
      .filter(m => m.week.days[dow] !== undefined)
      .reduce((sum, m) => sum + (m.week.days[dow].bullish ? m.score : 0), 0);
    const totalWeight = topMatches
      .filter(m => m.week.days[dow] !== undefined)
      .reduce((sum, m) => sum + m.score, 0);
    const weightedBullRate = totalWeight > 0 ? (weightedBull / totalWeight) * 100 : bullishRate;

    const isToday = dow === todayDow;
    const isClosed = closedDows.includes(dow);
    const isFuture = futureDows.includes(dow);

    predictions[dow] = {
      dow,
      dayName: DAY_NAMES[dow],
      fullDayName: FULL_DAY_NAMES[dow],
      sampleSize: dayResults.length,
      bullish,
      bearish: dayResults.length - bullish,
      bullishRate: Math.round(bullishRate * 10) / 10,
      weightedBullRate: Math.round(weightedBullRate * 10) / 10,
      avgReturn: Math.round(avgReturn * 100) / 100,
      maxGain: Math.max(...returns),
      maxLoss: Math.min(...returns),
      bias: weightedBullRate > 55 ? 'bullish' : weightedBullRate < 45 ? 'bearish' : 'neutral',
      confidence: Math.round(Math.min(Math.abs(weightedBullRate - 50) * 2, 100)),
      returns,
      isCompleted: completedDows.includes(dow),
      isClosed,
      isToday,
      isFuture,
      actualData: currentWeek.days[dow] ?? null,
    };
  }

  // ── Next week predictions ──
  const nextWeekPredictions = {};
  const nextWeekMatches = topMatches.filter(m => m.nextWeek !== null);

  if (nextWeekMatches.length >= 3) {
    for (const dow of allDowsInWeek()) {
      const dayResults = nextWeekMatches
        .filter(m => m.nextWeek?.days[dow] !== undefined)
        .map(m => ({ day: m.nextWeek.days[dow], score: m.score }));

      if (dayResults.length < 3) continue;

      const bullish = dayResults.filter(d => d.day.bullish).length;
      const returns = dayResults.map(d => d.day.return);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

      const weightedBull = dayResults.reduce((sum, d) => sum + (d.day.bullish ? d.score : 0), 0);
      const totalWeight = dayResults.reduce((sum, d) => sum + d.score, 0);
      const weightedBullRate = totalWeight > 0 ? (weightedBull / totalWeight) * 100 : (bullish / dayResults.length) * 100;

      nextWeekPredictions[dow] = {
        dow,
        dayName: DAY_NAMES[dow],
        fullDayName: FULL_DAY_NAMES[dow],
        sampleSize: dayResults.length,
        bullishRate: Math.round((bullish / dayResults.length) * 100 * 10) / 10,
        weightedBullRate: Math.round(weightedBullRate * 10) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
        maxGain: Math.max(...returns),
        maxLoss: Math.min(...returns),
        bias: weightedBullRate > 55 ? 'bullish' : weightedBullRate < 45 ? 'bearish' : 'neutral',
        confidence: Math.round(Math.min(Math.abs(weightedBullRate - 50) * 2, 100)),
        returns,
      };
    }
  }

  // ── Describe the matching pattern ──
  const currentPattern = describePattern(currentWeek, matchDows);

  return {
    currentWeek,
    completedDows,
    closedDows,
    matchDows,
    futureDows,
    todayDow,
    topMatches: topMatches.slice(0, 8),
    totalMatchesFound: topMatches.length,
    predictions,
    nextWeekPredictions,
    currentPattern,
  };
}

// ─── Describe Current Week Pattern ────────────────────────────────────────────
function describePattern(week, dows) {
  const parts = dows
    .filter(d => week.days[d])
    .map(d => {
      const day = week.days[d];
      const mag = Math.abs(day.return);
      const strength = mag > 4 ? 'strongly' : mag > 2 ? 'moderately' : 'slightly';
      const dir = day.bullish ? 'bullish' : 'bearish';
      return `${DAY_NAMES[d]} ${strength} ${dir} (${day.return > 0 ? '+' : ''}${day.return.toFixed(2)}%)`;
    });
  return parts.join(', ');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function allDowsInWeek() {
  return [1, 2, 3, 4, 5, 6, 0]; // Mon through Sun
}

function getISOWeekKey(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekMonday(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}
