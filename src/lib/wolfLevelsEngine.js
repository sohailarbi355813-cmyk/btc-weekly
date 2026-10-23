/**
 * Wolf Key Levels Engine
 * Calculates critical auction market theory & institutional price levels:
 * - PDH / PDL / PDC (Previous Day High, Low, Close)
 * - DO (Daily Open)
 * - pPOC / pVAH / pVAL (Previous Point of Control, Value Area High & Low)
 * - WO / PWH / PWL / PWC (Weekly Open, Previous Week High, Low, Close)
 * - MO / PMH / PML (Monthly Open, Previous Month High, Low)
 * - YO (Yearly Open)
 *
 * Sorts all levels into a dynamic ordered price ladder with the LAST price slotted into position.
 */

export function calculateWolfKeyLevels(candles, currentPrice) {
  if (!candles || candles.length < 5) return null;

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const lastCandle = sorted[sorted.length - 1];
  const prevCandle = sorted[sorted.length - 2];

  const spot = Number(currentPrice || lastCandle.close);

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

  // 4. Yearly Open
  const curYearPrefix = `${curYear}-01-01`;
  const curYearCandles = sorted.filter(c => c.date >= curYearPrefix);
  const YO = curYearCandles[0]?.open ?? MO;

  // Define full raw level entries
  const rawLevels = [
    { code: 'PDH', name: 'Previous Day High', price: PDH, category: 'daily', importance: 'high' },
    { code: 'PDL', name: 'Previous Day Low', price: PDL, category: 'daily', importance: 'high' },
    { code: 'PDC', name: 'Previous Day Close', price: PDC, category: 'daily', importance: 'medium' },
    { code: 'DO', name: 'Daily Open', price: DO, category: 'daily', importance: 'high' },
    { code: 'pPOC', name: 'Previous Point of Control', price: pPOC, category: 'daily', importance: 'high' },
    { code: 'pVAH', name: 'Previous Value Area High', price: pVAH, category: 'daily', importance: 'medium' },
    { code: 'pVAL', name: 'Previous Value Area Low', price: pVAL, category: 'daily', importance: 'medium' },
    { code: 'WO', name: 'Weekly Open', price: WO, category: 'weekly', importance: 'critical' },
    { code: 'PWH', name: 'Previous Week High', price: PWH, category: 'weekly', importance: 'critical' },
    { code: 'PWL', name: 'Previous Week Low', price: PWL, category: 'weekly', importance: 'critical' },
    { code: 'PWC', name: 'Previous Week Close', price: PWC, category: 'weekly', importance: 'medium' },
    { code: 'MO', name: 'Monthly Open', price: MO, category: 'monthly', importance: 'critical' },
    { code: 'PMH', name: 'Previous Month High', price: PMH, category: 'monthly', importance: 'high' },
    { code: 'PML', name: 'Previous Month Low', price: PML, category: 'monthly', importance: 'high' },
    { code: 'YO', name: 'Yearly Open', price: YO, category: 'yearly', importance: 'critical' },
  ];

  // Calculate distances & relative metrics
  const processedLevels = rawLevels.map(lvl => {
    const diff = lvl.price - spot;
    const pctDiff = (diff / spot) * 100;
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
  };
}
