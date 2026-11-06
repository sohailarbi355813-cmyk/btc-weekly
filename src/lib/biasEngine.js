/**
 * BTC Bias Engine v4 — Upgraded Verdict System
 *
 * Outputs ONE clear verdict: BULLISH | BEARISH | CAUTION
 *
 * Signal Architecture (max ±100 total, normalized):
 *   1. Trend (20/50 EMA alignment)      ±25  — lagging but very reliable macro direction
 *   2. Market Structure (HH/HL on 1D)   ±20  — price action structure, leading indicator
 *   3. Weekly Open Level                ±18  — institutional Mon 00:00 UTC reference
 *   4. Prior Week High / Low            ±15  — key breakout/breakdown level
 *   5. Momentum (Vol-confirmed RSI)     ±12  — real-time pressure w/ volume gate
 *   6. Sigma Z-Score (regime-gated)     ±10  — only meaningful in ranging markets
 *   7. Day-of-Week History              ±8   — background context only
 *   8. Monthly Seasonality              ±4   — very minor seasonal tint
 *   TOTAL MAX                           ±112 → normalized to ±100
 *
 * Verdict thresholds (on normalized −100 to +100 score):
 *   score ≥ +20  → BULLISH
 *   score ≤ −20  → BEARISH
 *   otherwise    → CAUTION
 *
 * Key upgrades from v3:
 *   - Market Structure (HH/HL check on last 20 daily closes) — NEW
 *   - Prior Week High/Low breakout/breakdown signal — NEW
 *   - Sigma is now REGIME-GATED: in a bull trend, being at +2σ is NOT penalized
 *     (because BTC regularly rides +2σ in bull trends for weeks)
 *   - Momentum uses VOLUME confirmation: strong move on below-avg volume = discounted
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Pure Utilities ───────────────────────────────────────────────────────────

function isBullish(candle) { return candle.close > candle.open; }
function pctReturn(candle) { return ((candle.close - candle.open) / candle.open) * 100; }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// ─── Indicators ───────────────────────────────────────────────────────────────

export function calculateEMA(data, period) {
  if (!data || data.length === 0) return 0;
  if (data.length < period) return data[data.length - 1];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

export function calculateRSI(data, period = 14) {
  if (!data || data.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
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

export function calculateSigmas(candles, currentPrice, period = 20) {
  if (!candles || candles.length < period) {
    const p = Number(currentPrice || 80000);
    return {
      mean: Math.round(p), stdDev: Math.round(p * 0.025), zScore: 0,
      zScoreText: '+0.00σ', status: 'Equilibrium', statusShort: 'Fair Value',
      color: '#38bdf8', scoreImpact: 0, dailyStdDevPct: 2.5,
      plus1Sigma: Math.round(p * 1.025), minus1Sigma: Math.round(p * 0.975),
      plus2Sigma: Math.round(p * 1.05), minus2Sigma: Math.round(p * 0.95),
      bandwidthPct: 5.0, zScore: 0,
    };
  }
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-period);
  const closes = recent.map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close;
    if (prev > 0) returns.push(((recent[i].close - prev) / prev) * 100);
  }
  const avgRet = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const retVar = returns.length ? returns.reduce((a, r) => a + Math.pow(r - avgRet, 2), 0) / returns.length : 0;
  const dailyStdDevPct = Math.sqrt(retVar) || 2.5;
  const bandwidthPct = mean > 0 ? ((4 * stdDev) / mean) * 100 : 0;

  // Raw score impact — will be regime-gated in getTodayBias
  let status, statusShort, color, scoreImpact;
  if (zScore > 2.2) {
    status = 'Extreme Overbought — Mean Reversion Risk High'; statusShort = 'Extreme OB'; color = '#f87171'; scoreImpact = -10;
  } else if (zScore > 1.2) {
    status = 'Upper Expansion — Bullish Momentum Zone'; statusShort = 'Upper Band'; color = '#4ade80'; scoreImpact = 8;
  } else if (zScore < -2.2) {
    status = 'Extreme Oversold — High Bounce Edge'; statusShort = 'Extreme OS'; color = '#4ade80'; scoreImpact = 10;
  } else if (zScore < -1.2) {
    status = 'Value Dip — Institutional Discount Area'; statusShort = 'Value Dip'; color = '#38bdf8'; scoreImpact = 6;
  } else {
    status = 'Inside Fair Value — Gaussian Center'; statusShort = 'Fair Value'; color = '#94a3b8'; scoreImpact = 0;
  }

  return {
    mean: Math.round(mean), stdDev: Math.round(stdDev),
    zScore: Math.round(zScore * 100) / 100,
    zScoreText: `${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ`,
    status, statusShort, color, scoreImpact,
    dailyStdDevPct: Math.round(dailyStdDevPct * 100) / 100,
    plus1Sigma: Math.round(mean + stdDev), minus1Sigma: Math.round(mean - stdDev),
    plus2Sigma: Math.round(mean + 2 * stdDev), minus2Sigma: Math.round(mean - 2 * stdDev),
    bandwidthPct: Math.round(bandwidthPct * 100) / 100,
  };
}

// ─── NEW: 1D Market Structure — Higher Highs / Higher Lows ───────────────────
/**
 * Checks the last N daily candles for HH/HL (bull structure) or LH/LL (bear structure).
 * Uses swing pivots: a local high is a candle whose high > prev and next candle highs.
 * Returns: { type: 'bull'|'bear'|'neutral', score, label, detail }
 */
function analyzeMarketStructure(sorted, lookback = 20) {
  if (sorted.length < lookback + 2) {
    return { type: 'neutral', score: 0, label: 'Insufficient data', detail: 'Need more candle history' };
  }

  const slice = sorted.slice(-(lookback + 2)); // extra 2 for pivot detection edges

  const swingHighs = [];
  const swingLows = [];

  // Find swing pivots (simple 1-bar left, 1-bar right)
  for (let i = 1; i < slice.length - 1; i++) {
    const prev = slice[i - 1], cur = slice[i], next = slice[i + 1];
    if (cur.high > prev.high && cur.high > next.high) swingHighs.push(cur.high);
    if (cur.low < prev.low && cur.low < next.low) swingLows.push(cur.low);
  }

  if (swingHighs.length < 2 || swingLows.length < 2) {
    return { type: 'neutral', score: 0, label: 'No clear structure', detail: 'Price rotating — no dominant swing pattern' };
  }

  // Compare last 2 swing highs and last 2 swing lows
  const lastHigh = swingHighs[swingHighs.length - 1];
  const prevHigh = swingHighs[swingHighs.length - 2];
  const lastLow = swingLows[swingLows.length - 1];
  const prevLow = swingLows[swingLows.length - 2];

  const makingHH = lastHigh > prevHigh;
  const makingHL = lastLow > prevLow;
  const makingLH = lastHigh < prevHigh;
  const makingLL = lastLow < prevLow;

  if (makingHH && makingHL) {
    return {
      type: 'bull', score: 20,
      label: 'HH + HL (Bull Structure)',
      detail: `Making Higher Highs ($${Math.round(lastHigh).toLocaleString()}) and Higher Lows ($${Math.round(lastLow).toLocaleString()}) — clean uptrend structure`,
    };
  } else if (makingLH && makingLL) {
    return {
      type: 'bear', score: -20,
      label: 'LH + LL (Bear Structure)',
      detail: `Making Lower Highs ($${Math.round(lastHigh).toLocaleString()}) and Lower Lows ($${Math.round(lastLow).toLocaleString()}) — clean downtrend structure`,
    };
  } else if (makingHH && makingLL) {
    // Expanding range — volatile, no clear bias
    return {
      type: 'neutral', score: 0,
      label: 'Expanding Range',
      detail: `Higher Highs but Lower Lows — expanding volatility, no dominant structure`,
    };
  } else if (makingLH && makingHL) {
    // Contracting range — compression before breakout
    return {
      type: 'neutral', score: 0,
      label: 'Contracting (Compression)',
      detail: `Lower Highs and Higher Lows — compressing toward a breakout`,
    };
  } else if (makingHH) {
    return {
      type: 'bull', score: 10,
      label: 'HH — Weak Bull',
      detail: `Higher Highs confirmed but lows not yet holding — partial bull structure`,
    };
  } else if (makingLL) {
    return {
      type: 'bear', score: -10,
      label: 'LL — Weak Bear',
      detail: `Lower Lows confirmed but highs not yet failing — partial bear structure`,
    };
  }

  return { type: 'neutral', score: 0, label: 'Mixed Swings', detail: 'No clean HH/HL or LH/LL pattern detected' };
}

// ─── NEW: Prior Week High / Low ───────────────────────────────────────────────
/**
 * Finds the previous full ISO week's high and low.
 * Returns: { pwh, pwl, priceVsPwh, priceVsPwl, signal, score, label, detail }
 *
 * Logic:
 *   - Price > PWH → bullish breakout above last week's high (strong bull signal)
 *   - Price < PWL → bearish breakdown below last week's low (strong bear signal)
 *   - Price between PWL and PWH → respect range (neutral, no extra signal)
 */
function analyzePriorWeekLevels(sorted, currentPrice, now) {
  const thisWeekKey = _getWeeklyOpenKey(now);

  // Build week map: weekKey → { high, low, candles[] }
  const weekMap = new Map();
  for (const candle of sorted) {
    const wk = _getWeeklyOpenKey(new Date(candle.date + 'T12:00:00Z'));
    if (!weekMap.has(wk)) weekMap.set(wk, { high: -Infinity, low: Infinity, candles: [] });
    const w = weekMap.get(wk);
    w.high = Math.max(w.high, candle.high);
    w.low = Math.min(w.low, candle.low);
    w.candles.push(candle);
  }

  // Find prior week (the week before current)
  const weekKeys = [...weekMap.keys()].sort();
  const thisKeyIdx = weekKeys.indexOf(thisWeekKey);
  if (thisKeyIdx < 1) {
    return { pwh: 0, pwl: 0, signal: 'neutral', score: 0, label: 'No prior week data', detail: 'Insufficient history for prior week levels' };
  }

  const priorWeekKey = weekKeys[thisKeyIdx - 1];
  const priorWeek = weekMap.get(priorWeekKey);

  // Need at least 3 candles to trust the week data
  if (!priorWeek || priorWeek.candles.length < 3) {
    return { pwh: 0, pwl: 0, signal: 'neutral', score: 0, label: 'Incomplete prior week', detail: 'Prior week has insufficient candle data' };
  }

  const pwh = priorWeek.high;
  const pwl = priorWeek.low;
  const weekRange = pwh - pwl;
  const pctFromPwh = ((currentPrice - pwh) / pwh) * 100;
  const pctFromPwl = ((currentPrice - pwl) / pwl) * 100;
  const posInRange = weekRange > 0 ? ((currentPrice - pwl) / weekRange) * 100 : 50;

  let signal, score, label, detail;

  if (currentPrice > pwh) {
    // Above Prior Week High — bullish breakout
    score = 15; signal = 'bull';
    label = `+${pctFromPwh.toFixed(2)}% above PWH`;
    detail = `Accepted above Prior Week High ($${Math.round(pwh).toLocaleString()}) — institutional breakout confirmed`;
  } else if (currentPrice < pwl) {
    // Below Prior Week Low — bearish breakdown
    score = -15; signal = 'bear';
    label = `${pctFromPwl.toFixed(2)}% below PWL`;
    detail = `Trading below Prior Week Low ($${Math.round(pwl).toLocaleString()}) — institutional breakdown confirmed`;
  } else if (posInRange >= 70) {
    // Upper 30% of prior week range — leaning bullish, potential PWH test
    score = 6; signal = 'bull';
    label = `${posInRange.toFixed(0)}% of PW Range (upper)`;
    detail = `In upper zone of PW Range ($${Math.round(pwl).toLocaleString()}–$${Math.round(pwh).toLocaleString()}) — testing prior week high resistance`;
  } else if (posInRange <= 30) {
    // Lower 30% of prior week range — leaning bearish, potential PWL test
    score = -6; signal = 'bear';
    label = `${posInRange.toFixed(0)}% of PW Range (lower)`;
    detail = `In lower zone of PW Range ($${Math.round(pwl).toLocaleString()}–$${Math.round(pwh).toLocaleString()}) — hovering above prior week low support`;
  } else {
    // Middle of range — no directional edge
    score = 0; signal = 'neutral';
    label = `${posInRange.toFixed(0)}% of PW Range (mid)`;
    detail = `Inside PW Range ($${Math.round(pwl).toLocaleString()}–$${Math.round(pwh).toLocaleString()}) mid-zone — no edge, respect both levels`;
  }

  return { pwh: Math.round(pwh), pwl: Math.round(pwl), pctFromPwh, pctFromPwl, posInRange, signal, score, label, detail };
}

// ─── Historical Analysis (kept for DOW grid display) ─────────────────────────

export function analyzeDayOfWeek(candles) {
  const stats = {};
  for (let d = 0; d < 7; d++) {
    stats[d] = { day: d, dayName: DAY_NAMES[d], total: 0, bullish: 0, bearish: 0, returns: [], avgReturn: 0, bullishRate: 0, bearishRate: 0, bias: 'neutral', strength: 0 };
  }
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  for (const candle of sorted) {
    const dow = new Date(candle.date + 'T12:00:00Z').getUTCDay();
    const ret = pctReturn(candle);
    const s = stats[dow];
    s.total++; s.returns.push(ret);
    if (ret > 0) s.bullish++; else s.bearish++;
  }
  for (let d = 0; d < 7; d++) {
    const s = stats[d];
    if (s.total === 0) continue;
    s.avgReturn = s.returns.reduce((a, b) => a + b, 0) / s.returns.length;
    s.bullishRate = (s.bullish / s.total) * 100;
    s.bearishRate = (s.bearish / s.total) * 100;
    s.bias = s.bullishRate > 55 ? 'bullish' : s.bullishRate < 45 ? 'bearish' : 'neutral';
    s.strength = Math.abs(s.bullishRate - 50);
  }
  return stats;
}

export function analyzeMonthlyBias(candles) {
  const stats = {};
  for (let m = 0; m < 12; m++) {
    stats[m] = { month: m, monthName: MONTHS[m], total: 0, bullish: 0, returns: [], avgReturn: 0, bullishRate: 0, bias: 'neutral' };
  }
  const monthMap = new Map();
  for (const candle of candles) {
    const d = new Date(candle.date + 'T12:00:00Z');
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!monthMap.has(key)) monthMap.set(key, { month: d.getUTCMonth(), candles: [] });
    monthMap.get(key).candles.push(candle);
  }
  for (const [, mData] of monthMap) {
    if (mData.candles.length < 10) continue;
    const sortedM = mData.candles.sort((a, b) => a.date.localeCompare(b.date));
    const monthReturn = ((sortedM[sortedM.length - 1].close - sortedM[0].open) / sortedM[0].open) * 100;
    const s = stats[mData.month];
    s.total++; s.returns.push(monthReturn);
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

// ─── Week Key Helpers ─────────────────────────────────────────────────────────

function _getWeeklyOpenKey(d) {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
  const ys = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((copy - ys) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function _getWeeklyOpen(candles, now) {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const thisWeekKey = _getWeeklyOpenKey(now);
  const weekMap = new Map();
  for (const candle of sorted) {
    const wk = _getWeeklyOpenKey(new Date(candle.date + 'T12:00:00Z'));
    if (!weekMap.has(wk)) weekMap.set(wk, candle.open);
  }
  return weekMap.get(thisWeekKey) || sorted[sorted.length - 1]?.close || 0;
}

// ─── MAIN VERDICT ENGINE ──────────────────────────────────────────────────────

/**
 * getTodayBias v4 — deterministic single-verdict engine.
 * No filter presets. No percentage splits. One answer.
 */
export function getTodayBias(candles, currentPrice, referenceDate = null) {
  const now = referenceDate instanceof Date ? referenceDate : new Date();
  const dow = now.getUTCDay();
  const month = now.getUTCMonth();

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map(c => c.close);
  const volumes = sorted.map(c => c.volume || 0);

  // ── Core Indicators ─────────────────────────────────────────────────────────
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const sigmaMetrics = calculateSigmas(candles, currentPrice, 20);

  // 20-day average volume (for momentum confirmation)
  const recentVols = volumes.slice(-20).filter(v => v > 0);
  const avgVol20 = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 0;
  const lastVol = volumes[volumes.length - 1] || 0;
  const prevVol = volumes[volumes.length - 2] || lastVol;
  const volumeRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1; // >1 = above avg, <1 = below avg

  const prevCandle = sorted.length >= 2 ? sorted[sorted.length - 2] : sorted[sorted.length - 1];
  const change24h = prevCandle && prevCandle.close > 0
    ? ((currentPrice - prevCandle.close) / prevCandle.close) * 100 : 0;

  const weeklyOpen = _getWeeklyOpen(candles, now);
  const pctFromWeeklyOpen = weeklyOpen > 0 ? ((currentPrice - weeklyOpen) / weeklyOpen) * 100 : 0;
  const aboveWeeklyOpen = currentPrice > weeklyOpen;

  // Macro regime determination (used by sigma gate)
  const isBullTrend = currentPrice > ema20 && ema20 > ema50;
  const isBearTrend = currentPrice < ema20 && ema20 < ema50;
  const isRangingOrChop = !isBullTrend && !isBearTrend;

  const priceVsEma20Pct = ema20 > 0 ? ((currentPrice - ema20) / ema20) * 100 : 0;
  const priceVsEma50Pct = ema50 > 0 ? ((currentPrice - ema50) / ema50) * 100 : 0;

  const dowStats = analyzeDayOfWeek(candles);
  const monthlyStats = analyzeMonthlyBias(candles);
  const todayDowStats = dowStats[dow];
  const todayMonthStats = monthlyStats[month];

  const recentSameDay = sorted
    .filter(c => new Date(c.date + 'T12:00:00Z').getUTCDay() === dow)
    .slice(-8);
  const recentBullCount = recentSameDay.filter(c => isBullish(c)).length;
  const recentBullRate = recentSameDay.length > 0 ? (recentBullCount / recentSameDay.length) * 100 : 50;

  // ── Market Structure & Prior Week ───────────────────────────────────────────
  const structureResult = analyzeMarketStructure(sorted, 20);
  const pwLevels = analyzePriorWeekLevels(sorted, currentPrice, now);

  // ── Build Signals Array ──────────────────────────────────────────────────────
  const signals = [];

  // ── 1. TREND (20/50 EMA) — ±25 ──────────────────────────────────────────────
  let trendScore, trendState, trendLabel, trendDetail;
  if (isBullTrend) {
    trendScore = 25; trendState = 'bullish'; trendLabel = 'Bull Trend';
    trendDetail = `Price > 20 EMA ($${Math.round(ema20).toLocaleString()}) > 50 EMA ($${Math.round(ema50).toLocaleString()}) — golden alignment`;
  } else if (currentPrice > ema20 && !isBullTrend) {
    trendScore = 10; trendState = 'bullish'; trendLabel = 'Weak Bull';
    trendDetail = `Above 20 EMA ($${Math.round(ema20).toLocaleString()}) but 50 EMA not stacked — mixed structure`;
  } else if (isBearTrend) {
    trendScore = -25; trendState = 'bearish'; trendLabel = 'Bear Trend';
    trendDetail = `Price < 20 EMA ($${Math.round(ema20).toLocaleString()}) < 50 EMA ($${Math.round(ema50).toLocaleString()}) — full bear alignment`;
  } else {
    trendScore = -10; trendState = 'bearish'; trendLabel = 'Below 20 EMA';
    trendDetail = `Price below 20 EMA ($${Math.round(ema20).toLocaleString()}) — in resistance zone, 50 EMA not broken`;
  }
  signals.push({
    id: 'trend', name: 'Trend (20/50 EMA)', weight: 25,
    score: trendScore, state: trendState, label: trendLabel, detail: trendDetail,
    value: `${priceVsEma20Pct > 0 ? '+' : ''}${priceVsEma20Pct.toFixed(2)}% vs 20 EMA`,
  });

  // ── 2. MARKET STRUCTURE (HH/HL) — ±20 ───────────────────────────────────────
  signals.push({
    id: 'structure', name: 'Market Structure (1D)', weight: 20,
    score: structureResult.score,
    state: structureResult.type === 'bull' ? 'bullish' : structureResult.type === 'bear' ? 'bearish' : 'neutral',
    label: structureResult.label,
    detail: structureResult.detail,
    value: structureResult.label,
  });

  // ── 3. WEEKLY OPEN — ±18 ────────────────────────────────────────────────────
  let woScore, woState, woLabel, woDetail;
  if (aboveWeeklyOpen) {
    woScore = 18; woState = 'bullish'; woLabel = `+${pctFromWeeklyOpen.toFixed(2)}% above WO`;
    woDetail = `Accepted above $${Math.round(weeklyOpen).toLocaleString()} weekly open — institutional long bias`;
  } else {
    woScore = -18; woState = 'bearish'; woLabel = `${pctFromWeeklyOpen.toFixed(2)}% below WO`;
    woDetail = `Rejected below $${Math.round(weeklyOpen).toLocaleString()} weekly open — institutional short bias`;
  }
  signals.push({
    id: 'weekly_open', name: 'Weekly Open Level', weight: 18,
    score: woScore, state: woState, label: woLabel, detail: woDetail,
    value: `$${Math.round(weeklyOpen).toLocaleString()}`,
  });

  // ── 4. PRIOR WEEK HIGH / LOW — ±15 ──────────────────────────────────────────
  signals.push({
    id: 'prior_week', name: 'Prior Week H/L', weight: 15,
    score: pwLevels.score,
    state: pwLevels.signal === 'bull' ? 'bullish' : pwLevels.signal === 'bear' ? 'bearish' : 'neutral',
    label: pwLevels.label,
    detail: pwLevels.detail,
    value: pwLevels.pwh > 0 ? `PWH $${pwLevels.pwh.toLocaleString()} / PWL $${pwLevels.pwl.toLocaleString()}` : 'N/A',
  });

  // ── 5. MOMENTUM (Volume-Confirmed RSI + 24h) — ±12 ──────────────────────────
  // Volume-confirmation gate: if move is on below-avg volume, halve the momentum score
  // Strong = RSI > 54 + 24h > +1% + volume above avg
  // Weak bleed = RSI < 44 OR 24h < -0.6%
  // Volume-confirmed pump = needs volumeRatio > 0.9 (not on dead volume)
  let momScore, momState, momLabel, momDetail;
  const isStrongPump = change24h > 1.0 && rsi14 > 54;
  const isWeakBleed = change24h < -0.6 || rsi14 < 44;
  const volConfirmed = volumeRatio >= 0.9; // at least 90% of avg volume

  if (isStrongPump) {
    const rawScore = volConfirmed ? 12 : 6; // half score if thin volume
    momScore = rawScore; momState = 'bullish';
    momLabel = volConfirmed ? 'Strong Momentum (vol-confirmed)' : 'Pump on Low Volume (caution)';
    momDetail = `RSI ${rsi14} · +${change24h.toFixed(2)}% 24h · Vol ${(volumeRatio * 100).toFixed(0)}% of avg${!volConfirmed ? ' — low volume pump, less conviction' : ''}`;
  } else if (isWeakBleed) {
    const rawScore = volConfirmed ? -12 : -6; // heavy bleed on high vol = more serious
    momScore = rawScore; momState = 'bearish';
    momLabel = volConfirmed ? 'Bearish Pressure (vol-confirmed)' : 'Weak Bleed (low volume)';
    momDetail = `RSI ${rsi14}${rsi14 < 44 ? ' — selling momentum' : ''} · 24h ${change24h.toFixed(2)}% · Vol ${(volumeRatio * 100).toFixed(0)}% of avg`;
  } else {
    momScore = 0; momState = 'neutral'; momLabel = 'Neutral Flow';
    momDetail = `RSI ${rsi14} · 24h ${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% · Vol ${(volumeRatio * 100).toFixed(0)}% of avg`;
  }
  signals.push({
    id: 'momentum', name: 'Momentum (Vol-RSI)', weight: 12,
    score: momScore, state: momState, label: momLabel, detail: momDetail,
    value: `RSI ${rsi14} · ${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%`,
  });

  // ── 6. SIGMA Z-SCORE — ±10 (regime-gated) ───────────────────────────────────
  // KEY FIX: In a bull trend, being at +2σ is NOT penalized.
  // BTC regularly rides the upper band for weeks in bull markets.
  // The mean-reversion penalty only applies in ranging/bear regimes.
  let sigmaScore = sigmaMetrics.scoreImpact;

  if (isBullTrend && sigmaMetrics.zScore > 2.2) {
    // In a bull trend, extreme overbought just means strong trend — neutral, not bearish
    sigmaScore = 0;
  } else if (isBullTrend && sigmaMetrics.zScore > 1.2) {
    // In a bull trend, upper band = trend continuation
    sigmaScore = 8;
  } else if (isBearTrend && sigmaMetrics.zScore < -2.2) {
    // In a bear trend, extreme oversold can bounce but trend prevails — neutral
    sigmaScore = 0;
  }
  // Else: use the raw scoreImpact from calculateSigmas (which handles the ranging case)

  // Build regime-aware status text
  let sigmaLabel = sigmaMetrics.statusShort;
  let sigmaDetail = sigmaMetrics.status;
  if (isBullTrend && sigmaMetrics.zScore > 2.2) {
    sigmaLabel = 'OB in Bull Trend (normal)';
    sigmaDetail = `${sigmaMetrics.zScoreText} — overbought in bull trend is momentum, not reversal signal`;
  } else if (isBearTrend && sigmaMetrics.zScore < -2.2) {
    sigmaLabel = 'OS in Bear Trend (dead-cat risk)';
    sigmaDetail = `${sigmaMetrics.zScoreText} — oversold in bear trend — wait for structure before longing`;
  }

  signals.push({
    id: 'sigma', name: 'Sigma (Regime-Gated)', weight: 10,
    score: clamp(sigmaScore, -10, 10),
    state: sigmaScore > 0 ? 'bullish' : sigmaScore < 0 ? 'bearish' : 'neutral',
    label: sigmaLabel, detail: sigmaDetail,
    value: sigmaMetrics.zScoreText,
  });

  // ── 7. DOW HISTORY — ±8 ─────────────────────────────────────────────────────
  const dowEdge = todayDowStats.bullishRate - 50;
  const dowScore = clamp(Math.round(dowEdge * 0.16), -8, 8);
  const dowState = dowScore > 0 ? 'bullish' : dowScore < 0 ? 'bearish' : 'neutral';
  signals.push({
    id: 'dow', name: `${DAY_NAMES[dow]} DOW History`, weight: 8,
    score: dowScore, state: dowState,
    label: `${todayDowStats.bullishRate.toFixed(0)}% bull rate`,
    detail: `${todayDowStats.bullish} green / ${todayDowStats.total} ${DAY_NAMES[dow]}s since 2021 — context only`,
    value: `${todayDowStats.bullishRate.toFixed(0)}% (${todayDowStats.total} sample)`,
  });

  // ── 8. SEASONALITY — ±4 ─────────────────────────────────────────────────────
  const monthEdge = todayMonthStats.bullishRate - 50;
  const monthScore = clamp(Math.round(monthEdge * 0.08), -4, 4);
  const monthState = monthScore > 0 ? 'bullish' : monthScore < 0 ? 'bearish' : 'neutral';
  signals.push({
    id: 'seasonal', name: `${MONTHS[month]} Seasonality`, weight: 4,
    score: monthScore, state: monthState,
    label: `${todayMonthStats.bullishRate.toFixed(0)}% bull in ${MONTHS[month]}`,
    detail: `Historical: ${todayMonthStats.bullish} green / ${todayMonthStats.total} ${MONTHS[month]}s — minor seasonal tint`,
    value: `${todayMonthStats.bullishRate.toFixed(0)}% (${todayMonthStats.total} years)`,
  });

  // ── COMPOSITE SCORE ──────────────────────────────────────────────────────────
  // Max theoretical raw sum = 25+20+18+15+12+10+8+4 = 112
  // Normalize to -100 to +100 for clean display
  const rawTotal = signals.reduce((sum, s) => sum + s.score, 0);
  const maxPossible = 112;
  const normalizedScore = clamp(Math.round((rawTotal / maxPossible) * 100), -100, 100);

  // ── BLEED TRAP DETECTION ─────────────────────────────────────────────────────
  // Calendar says bull BUT price action says no: RSI weak, 24h negative, below 20 EMA
  const isBleedTrap =
    (change24h < -0.5 || rsi14 < 44 || currentPrice < ema20) &&
    todayDowStats.bullishRate >= 54;

  // ── VERDICT ──────────────────────────────────────────────────────────────────
  let verdict, verdictColor, verdictGlow;
  if (normalizedScore >= 20) {
    verdict = 'BULLISH'; verdictColor = '#22c55e'; verdictGlow = 'rgba(34,197,94,0.2)';
  } else if (normalizedScore <= -20) {
    verdict = 'BEARISH'; verdictColor = '#ef4444'; verdictGlow = 'rgba(239,68,68,0.2)';
  } else {
    verdict = 'CAUTION'; verdictColor = '#f59e0b'; verdictGlow = 'rgba(245,158,11,0.2)';
  }

  // Bleed trap override: downgrade BULLISH → CAUTION
  if (isBleedTrap && verdict === 'BULLISH') {
    verdict = 'CAUTION'; verdictColor = '#f59e0b'; verdictGlow = 'rgba(245,158,11,0.2)';
  }

  // ── VERDICT REASON (plain English, actionable) ───────────────────────────────
  const bullSignals = signals.filter(s => s.state === 'bullish' && Math.abs(s.score) >= 8).map(s => s.name);
  const bearSignals = signals.filter(s => s.state === 'bearish' && Math.abs(s.score) >= 8).map(s => s.name);

  let verdictReason;
  if (verdict === 'BULLISH') {
    verdictReason = `${bullSignals.join(' · ')} all align bullish. Pullbacks toward $${Math.round(ema20).toLocaleString()} (20 EMA) are high-probability long entries. ${pwLevels.pwh > 0 && currentPrice > pwLevels.pwh ? `Trading above Prior Week High $${pwLevels.pwh.toLocaleString()} — trend continuation bias.` : ''}`;
  } else if (verdict === 'BEARISH') {
    verdictReason = `${bearSignals.join(' · ')} confirm downside. Rallies into $${Math.round(ema20).toLocaleString()} (20 EMA) are institutional resistance traps. ${pwLevels.pwl > 0 && currentPrice < pwLevels.pwl ? `Broken below Prior Week Low $${pwLevels.pwl.toLocaleString()} — continuation breakdown.` : ''}`;
  } else if (isBleedTrap) {
    verdictReason = `Historical DOW stats favor bulls, but real-time structure is bleeding: RSI ${rsi14} · 24h ${change24h.toFixed(2)}% · price ${currentPrice < ema20 ? 'below' : 'near'} 20 EMA. Do NOT blindly trust the calendar. Wait for structure to hold.`;
  } else {
    const parts = [];
    if (bullSignals.length) parts.push(`${bullSignals.join(' · ')} favor longs`);
    if (bearSignals.length) parts.push(`${bearSignals.join(' · ')} favor shorts`);
    verdictReason = parts.length > 0
      ? `Mixed signals — ${parts.join(', but ')}. No institutional edge. Trade key levels only: PWH $${pwLevels.pwh?.toLocaleString() || '--'} above, PWL $${pwLevels.pwl?.toLocaleString() || '--'} below.`
      : `Signals are balanced with no dominant direction. Price is at equilibrium. Wait for a confirmed level break before committing.`;
  }

  const convictionLevel = Math.round(clamp(Math.abs(normalizedScore) / 20, 1, 5));

  // ── RETURN OBJECT ─────────────────────────────────────────────────────────────
  return {
    // Core verdict
    verdict, verdictColor, verdictGlow,
    verdictReason,
    score: normalizedScore,
    convictionLevel,
    isBleedTrap,
    signals,

    // Technical context
    technicalMetrics: {
      ema20: Math.round(ema20), ema50: Math.round(ema50),
      rsi14, change24h: Math.round(change24h * 100) / 100,
      priceVsEma20Pct: Math.round(priceVsEma20Pct * 100) / 100,
      priceVsEma50Pct: Math.round(priceVsEma50Pct * 100) / 100,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
    },
    weeklyOpen: Math.round(weeklyOpen),
    pctFromWeeklyOpen: Math.round(pctFromWeeklyOpen * 100) / 100,
    aboveWeeklyOpen,
    sigmaMetrics,

    // New: Prior Week Levels
    priorWeekLevels: {
      pwh: pwLevels.pwh, pwl: pwLevels.pwl,
      posInRange: pwLevels.posInRange ? Math.round(pwLevels.posInRange) : null,
    },

    // Historical stats for DOW grid
    allDowStats: dowStats,
    allMonthlyStats: monthlyStats,
    todayDowStats, todayMonthStats,
    recentSameDay,
    recentBullRate: Math.round(recentBullRate),

    // Metadata
    date: now.toISOString().split('T')[0],
    dayName: DAY_NAMES[dow],
    dow, month, currentPrice,

    // ── Legacy compat aliases ─────────────────────────────────────────────────
    bias: verdict === 'BULLISH' ? 'bullish' : verdict === 'BEARISH' ? 'bearish' : 'neutral',
    confidence: clamp(Math.round(Math.abs(normalizedScore) * 0.75 + 30), 35, 95),
    weeklyBias: {
      weeklyOpen: Math.round(weeklyOpen),
      priceVsWeeklyOpen: aboveWeeklyOpen ? 'above' : 'below',
      pctFromWeeklyOpen: Math.round(pctFromWeeklyOpen * 100) / 100,
      currentBullRate: aboveWeeklyOpen ? 62 : 38,
    },
    confluences: signals.map(s => ({
      id: s.id, name: s.name, weight: s.weight, score: s.score, state: s.state,
      valueText: s.value, detail: s.detail,
    })),
    confluenceScore: normalizedScore,
    regimeMetrics: classifyMarketRegime(candles, currentPrice, ema20, ema50, sigmaMetrics),
    bleedTrap: { detected: isBleedTrap, title: 'BLEED TRAP CONFLICT', explanation: verdictReason },
    isFiltered: true,
  };
}

// ─── Backward-Compat Exports ──────────────────────────────────────────────────

export function analyzeWeeklyOpenBias(candles, currentPrice) {
  const now = new Date();
  const weeklyOpen = _getWeeklyOpen(candles, now);
  const pctFromWeeklyOpen = weeklyOpen > 0 ? ((currentPrice - weeklyOpen) / weeklyOpen) * 100 : 0;
  const aboveOpen = currentPrice > weeklyOpen;
  return {
    weeklyOpen, currentPrice,
    priceVsWeeklyOpen: aboveOpen ? 'above' : 'below',
    pctFromWeeklyOpen, aboveOpenBullRate: 62, belowOpenBullRate: 38,
    currentBullRate: aboveOpen ? 62 : 38, bias: aboveOpen ? 'bullish' : 'bearish',
  };
}

export function classifyMarketRegime(candles, currentPrice, ema20, ema50, sigmaData) {
  const isBullTrend = currentPrice > ema20 && ema20 > ema50;
  const isBearTrend = currentPrice < ema20 && ema20 < ema50;
  const bandwidth = sigmaData?.bandwidthPct || 8;
  if (bandwidth < 6.5) return { key: 'SQUEEZE', name: 'Range Compression (Squeeze)', type: 'squeeze', color: '#38bdf8', score: 0, bandwidth, description: 'Coil/squeeze — breakout traps are high' };
  if (isBullTrend) return { key: 'BULL_TREND', name: 'Bullish Trend Expansion', type: 'bull_trend', color: '#4ade80', score: 25, bandwidth, description: 'Markup phase above 20 & 50 EMA' };
  if (isBearTrend) return { key: 'BEAR_TREND', name: 'Bearish Trend Breakdown', type: 'bear_trend', color: '#f87171', score: -25, bandwidth, description: 'Markdown phase below 20 & 50 EMA' };
  return { key: 'CHOP', name: 'Rotational Chop', type: 'transition', color: '#fbbf24', score: 0, bandwidth, description: 'Mixed structure between EMAs' };
}
