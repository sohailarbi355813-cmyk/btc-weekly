/**
 * Wolf Key Levels Engine
 * Calculates critical auction market theory & institutional price levels:
 * - PDH / PDL / PDC (Previous Day High, Low, Close)
 * - DO (Daily Open)
 * - pPOC / pVAH / pVAL (Previous Day Point of Control, Value Area High & Low)
 * - WO / PWH / PWL / PWC (Weekly Open, Previous Week High, Low, Close)
 * - PW VAL / PW POC / PW VAH (Previous Week Value Area Low, Point of Control, Value Area High)
 * - MO / PMH / PML / PMC (Monthly Open, Previous Month High, Low, Close)
 * - PM VAL / PM POC / PM VAH (Previous Month Value Area Low, Point of Control, Value Area High)
 * - YO (Yearly Open)
 *
 * Sorts all levels into a dynamic ordered price ladder with the LAST price slotted into position.
 */

import { calculateSigmas } from './biasEngine';

export function calculateWolfKeyLevels(candles, currentPrice) {
  if (!candles || candles.length < 5) return null;

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const lastCandle = sorted[sorted.length - 1];
  const prevCandle = sorted[sorted.length - 2];

  const spot = Number(currentPrice || lastCandle.close);
  const sigmas = calculateSigmas(sorted, spot, 20);

  // 1. Daily Levels
  const DO = lastCandle.open;
  const PDH = prevCandle.high;
  const PDL = prevCandle.low;
  const PDC = prevCandle.close;

  // Previous Day POC & Value Area (Estimated using standard Typical Price & 70% Value Area)
  const pPOC = (prevCandle.high + prevCandle.low + prevCandle.close) / 3;
  const dayRange = PDH - PDL;
  const pVAH = pPOC + (dayRange * 0.35);
  const pVAL = pPOC - (dayRange * 0.35);

  // 2. Weekly Levels
  // Current Week Monday Open
  const lastDate = new Date(lastCandle.date + 'T12:00:00Z');
  const dow = lastDate.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const thisWeekMon = new Date(lastDate);
  thisWeekMon.setUTCDate(thisWeekMon.getUTCDate() + diffToMon);
  const thisWeekMonStr = thisWeekMon.toISOString().split('T')[0];

  const currentWeekCandles = sorted.filter(c => c.date >= thisWeekMonStr);
  const WO = currentWeekCandles[0]?.open ?? DO;

  // Previous Week: Monday 7 days before to Sunday
  const prevWeekMon = new Date(thisWeekMon);
  prevWeekMon.setUTCDate(prevWeekMon.getUTCDate() - 7);
  const prevWeekMonStr = prevWeekMon.toISOString().split('T')[0];

  const prevWeekCandles = sorted.filter(c => c.date >= prevWeekMonStr && c.date < thisWeekMonStr);
  const PWH = prevWeekCandles.length > 0 ? Math.max(...prevWeekCandles.map(c => c.high)) : PDH;
  const PWL = prevWeekCandles.length > 0 ? Math.min(...prevWeekCandles.map(c => c.low)) : PDL;
  const PWC = prevWeekCandles.length > 0 ? prevWeekCandles[prevWeekCandles.length - 1].close : PDC;

  // Previous Week Value Area & Point of Control (POC)
  let pwPocSum = 0;
  let pwVolSum = 0;
  for (const c of prevWeekCandles) {
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume && c.volume > 0 ? c.volume : 1;
    pwPocSum += tp * vol;
    pwVolSum += vol;
  }
  const PW_POC = pwVolSum > 0 ? (pwPocSum / pwVolSum) : ((PWH + PWL + PWC) / 3);
  const pwRange = PWH - PWL;
  const rawPwVah = PW_POC + (pwRange * 0.35);
  const rawPwVal = PW_POC - (pwRange * 0.35);
  const PW_VAH = Math.min(rawPwVah, PWH);
  const PW_VAL = Math.max(rawPwVal, PWL);

  // 3. Monthly Levels
  const curMonthPrefix = lastCandle.date.slice(0, 7);
  const curMonthCandles = sorted.filter(c => c.date.startsWith(curMonthPrefix));
  const MO = curMonthCandles[0]?.open ?? DO;

  // Previous Month
  const curYear = parseInt(lastCandle.date.slice(0, 4), 10);
  const curMonth = parseInt(lastCandle.date.slice(5, 7), 10);
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevMonthPrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const prevMonthCandles = sorted.filter(c => c.date.startsWith(prevMonthPrefix));
  const PMH = prevMonthCandles.length > 0 ? Math.max(...prevMonthCandles.map(c => c.high)) : PWH;
  const PML = prevMonthCandles.length > 0 ? Math.min(...prevMonthCandles.map(c => c.low)) : PWL;
  const PMC = prevMonthCandles.length > 0 ? prevMonthCandles[prevMonthCandles.length - 1].close : PDC;

  // Previous Month Value Area & Point of Control (POC)
  let pmPocSum = 0;
  let pmVolSum = 0;
  for (const c of prevMonthCandles) {
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume && c.volume > 0 ? c.volume : 1;
    pmPocSum += tp * vol;
    pmVolSum += vol;
  }
  const PM_POC = pmVolSum > 0 ? (pmPocSum / pmVolSum) : ((PMH + PML + PMC) / 3);
  const pmRange = PMH - PML;
  const rawPmVah = PM_POC + (pmRange * 0.35);
  const rawPmVal = PM_POC - (pmRange * 0.35);
  const PM_VAH = Math.min(rawPmVah, PMH);
  const PM_VAL = Math.max(rawPmVal, PML);

  // 4. Yearly Open
  const curYearPrefix = `${curYear}-01-01`;
  const curYearCandles = sorted.filter(c => c.date >= curYearPrefix);
  const YO = curYearCandles[0]?.open ?? MO;

  // Define full raw level entries
  const rawLevels = [
    // Daily Auction Levels
    { code: 'PDH', name: 'Previous Day High', price: PDH, category: 'daily', importance: 'high' },
    { code: 'PDL', name: 'Previous Day Low', price: PDL, category: 'daily', importance: 'high' },
    { code: 'PDC', name: 'Previous Day Close', price: PDC, category: 'daily', importance: 'medium' },
    { code: 'DO', name: 'Daily Open', price: DO, category: 'daily', importance: 'high' },
    { code: 'pPOC', name: 'Previous Day POC', price: pPOC, category: 'daily', importance: 'high' },
    { code: 'pVAH', name: 'Previous Day Value Area High', price: pVAH, category: 'daily', importance: 'medium' },
    { code: 'pVAL', name: 'Previous Day Value Area Low', price: pVAL, category: 'daily', importance: 'medium' },

    // Weekly Auction Levels (Includes PW VAL, PW POC, PW VAH)
    { code: 'WO', name: 'Weekly Open', price: WO, category: 'weekly', importance: 'critical' },
    { code: 'PWH', name: 'Previous Week High', price: PWH, category: 'weekly', importance: 'critical' },
    { code: 'PW VAH', name: 'Previous Week Value Area High', price: PW_VAH, category: 'weekly', importance: 'critical' },
    { code: 'PW POC', name: 'Previous Week Point of Control', price: PW_POC, category: 'weekly', importance: 'critical' },
    { code: 'PW VAL', name: 'Previous Week Value Area Low', price: PW_VAL, category: 'weekly', importance: 'critical' },
    { code: 'PWL', name: 'Previous Week Low', price: PWL, category: 'weekly', importance: 'critical' },
    { code: 'PWC', name: 'Previous Week Close', price: PWC, category: 'weekly', importance: 'medium' },

    // Monthly Auction Levels (Includes PM VAL, PM POC, PM VAH)
    { code: 'MO', name: 'Monthly Open', price: MO, category: 'monthly', importance: 'critical' },
    { code: 'PMH', name: 'Previous Month High', price: PMH, category: 'monthly', importance: 'high' },
    { code: 'PM VAH', name: 'Previous Month Value Area High', price: PM_VAH, category: 'monthly', importance: 'critical' },
    { code: 'PM POC', name: 'Previous Month Point of Control', price: PM_POC, category: 'monthly', importance: 'critical' },
    { code: 'PM VAL', name: 'Previous Month Value Area Low', price: PM_VAL, category: 'monthly', importance: 'critical' },
    { code: 'PML', name: 'Previous Month Low', price: PML, category: 'monthly', importance: 'high' },

    // Yearly Open
    { code: 'YO', name: 'Yearly Open', price: YO, category: 'yearly', importance: 'critical' },

    // Statistical Volatility Sigmas (Daily Expected Range & Mean Reversion Limits)
    { code: '+2σ BAND', name: '+2 Sigma Volatility Extreme (95.4% Upper Ceiling)', price: sigmas.plus2Sigma, category: 'daily', importance: 'high', isSigma: true },
    { code: '+1σ BAND', name: '+1 Sigma Expected Daily High (68.2% Normal Top)', price: sigmas.plus1Sigma, category: 'daily', importance: 'medium', isSigma: true },
    { code: '-1σ BAND', name: '-1 Sigma Expected Daily Low (68.2% Normal Bottom)', price: sigmas.minus1Sigma, category: 'daily', importance: 'medium', isSigma: true },
    { code: '-2σ BAND', name: '-2 Sigma Volatility Extreme (95.4% Lower Floor)', price: sigmas.minus2Sigma, category: 'daily', importance: 'high', isSigma: true },
  ];

  // Calculate distances & relative metrics (relative position of price to level)
  // When price is below a level (e.g. PW VAH at 83,522 with spot at 80,550),
  // price is -3.56% BELOW that level (Resistance).
  // When price is above a level (e.g. support at 78,000), price is +3.27% ABOVE that level (Support).
  const processedLevels = rawLevels.map(lvl => {
    const diff = spot - lvl.price;
    const pctDiff = lvl.price > 0 ? ((spot - lvl.price) / lvl.price) * 100 : 0;
    const isAbove = lvl.price > spot;
    return {
      ...lvl,
      price: Math.round(lvl.price * 10) / 10,
      diff: Math.round(diff * 10) / 10,
      pctDiff: Math.round(pctDiff * 100) / 100,
      isAbove,
      role: isAbove ? 'Resistance' : 'Support',
    };
  });

  // Sort descending by price (highest at top, lowest at bottom)
  processedLevels.sort((a, b) => b.price - a.price);

  // Find nearest resistance (lowest level strictly > spot)
  const resistances = processedLevels.filter(l => l.isAbove);
  const nearestResistance = resistances.length > 0 ? resistances[resistances.length - 1] : null;

  // Find nearest support (highest level strictly < spot)
  const supports = processedLevels.filter(l => !l.isAbove);
  const nearestSupport = supports.length > 0 ? supports[0] : null;

  // Form the combined ladder with LAST row inserted
  const ladder = [];
  let lastInserted = false;

  for (const lvl of processedLevels) {
    if (!lastInserted && spot >= lvl.price) {
      ladder.push({
        isLast: true,
        code: 'LAST',
        name: 'Spot / Perpetual Last Price',
        price: spot,
        diff: 0,
        pctDiff: 0,
        role: 'CURRENT PRICE',
        category: 'spot',
      });
      lastInserted = true;
    }
    ladder.push(lvl);
  }

  if (!lastInserted) {
    ladder.push({
      isLast: true,
      code: 'LAST',
      name: 'Spot / Perpetual Last Price',
      price: spot,
      diff: 0,
      pctDiff: 0,
      role: 'CURRENT PRICE',
      category: 'spot',
    });
  }

  return {
    spot,
    utcDate: lastCandle.date,
    levels: processedLevels,
    ladder,
    nearestResistance,
    nearestSupport,
    dayRange: {
      high: PDH,
      low: PDL,
      current: spot,
      rangePct: Math.round(((PDH - PDL) / PDL) * 100 * 100) / 100,
    },
    previousWeekStats: {
      PWH: Math.round(PWH * 10) / 10,
      PWL: Math.round(PWL * 10) / 10,
      PWC: Math.round(PWC * 10) / 10,
      PW_VAL: Math.round(PW_VAL * 10) / 10,
      PW_VAH: Math.round(PW_VAH * 10) / 10,
      PW_POC: Math.round(PW_POC * 10) / 10,
      pctFromPWH: Math.round(((spot - PWH) / PWH) * 100 * 100) / 100,
      pctFromPWL: Math.round(((spot - PWL) / PWL) * 100 * 100) / 100,
      pctFromVAL: Math.round(((spot - PW_VAL) / PW_VAL) * 100 * 100) / 100,
      pctFromVAH: Math.round(((spot - PW_VAH) / PW_VAH) * 100 * 100) / 100,
      pctFromPOC: Math.round(((spot - PW_POC) / PW_POC) * 100 * 100) / 100,
      range: Math.round((PWH - PWL) * 10) / 10,
      rangePct: Math.round(((PWH - PWL) / PWL) * 100 * 100) / 100,
      positionPct: Math.round(Math.min(Math.max(((spot - PWL) / (PWH - PWL)) * 100, 0), 100)),
      valStatus: spot > PW_VAH ? 'ABOVE_VAH' : spot < PW_VAL ? 'BELOW_VAL' : 'INSIDE_VA',
      status: spot > PWH ? 'ABOVE_PWH' : spot < PWL ? 'BELOW_PWL' : 'INSIDE_PREV_WEEK_RANGE',
    },
    previousMonthStats: {
      PMH: Math.round(PMH * 10) / 10,
      PML: Math.round(PML * 10) / 10,
      PMC: Math.round(PMC * 10) / 10,
      PM_VAL: Math.round(PM_VAL * 10) / 10,
      PM_VAH: Math.round(PM_VAH * 10) / 10,
      PM_POC: Math.round(PM_POC * 10) / 10,
      pctFromPMH: Math.round(((spot - PMH) / PMH) * 100 * 100) / 100,
      pctFromPML: Math.round(((spot - PML) / PML) * 100 * 100) / 100,
      pctFromVAL: Math.round(((spot - PM_VAL) / PM_VAL) * 100 * 100) / 100,
      pctFromVAH: Math.round(((spot - PM_VAH) / PM_VAH) * 100 * 100) / 100,
      pctFromPOC: Math.round(((spot - PM_POC) / PM_POC) * 100 * 100) / 100,
      range: Math.round((PMH - PML) * 10) / 10,
      rangePct: Math.round(((PMH - PML) / PML) * 100 * 100) / 100,
      positionPct: Math.round(Math.min(Math.max(((spot - PML) / (PMH - PML)) * 100, 0), 100)),
      valStatus: spot > PM_VAH ? 'ABOVE_VAH' : spot < PM_VAL ? 'BELOW_VAL' : 'INSIDE_VA',
      status: spot > PM_VAH ? 'ABOVE_PM_VAH' : spot < PM_VAL ? 'BELOW_PM_VAL' : 'INSIDE_PM_VALUE_AREA',
    },
    weeklyStats: {
      WO,
      pctFromWO: Math.round(((spot - WO) / WO) * 100 * 100) / 100,
      status: spot >= WO ? 'ABOVE_WO' : 'BELOW_WO',
    },
    monthlyStats: {
      MO,
      pctFromMO: Math.round(((spot - MO) / MO) * 100 * 100) / 100,
      status: spot >= MO ? 'ABOVE_MO' : 'BELOW_MO',
    },
    sigmas,
  };
}
