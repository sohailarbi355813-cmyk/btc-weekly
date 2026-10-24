/**
 * Institutional Session Profiler Engine (Asia · London · New York)
 * 
 * Scans previous month of 1-hour candles to calculate:
 * 1. Day of Week Session Probabilities: Which session sets High of Day (HOD) and Low of Day (LOD)
 *    (e.g., "On Tuesdays, London sets LOD 60% and NY sets HOD 75%")
 * 2. Weekly Cycle Profiling: Which day sets High of Week (HOW) and Low of Week (LOW)
 * 3. Live Active Session Clock & Today's Predictive Playbook
 */

const DOW_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Standard Institutional Session Windows (UTC)
// Asia: 00:00 - 08:00 UTC (Tokyo / Singapore / Hong Kong)
// London: 07:00 - 15:00 UTC (Frankfurt / London open)
// New York: 13:00 - 21:00 UTC (US open, cash session, London fix)
// Late NY / Asian Prep: 21:00 - 00:00 UTC

export function getSessionNameForHour(hour) {
  if (hour >= 0 && hour < 7) return 'Asia';
  if (hour >= 7 && hour < 13) return 'London';
  if (hour >= 13 && hour < 22) return 'New York';
  return 'New York'; // 22:00-23:59 late NY cash close
}

export function getCurrentActiveSession(utcHour) {
  // Returns { name, window, label, color, endsInHours }
  if (utcHour >= 0 && utcHour < 8) {
    return {
      name: 'Asia',
      code: 'ASIA',
      window: '00:00 - 08:00 UTC',
      label: 'Asia Session Active (Tokyo · Hong Kong · Singapore)',
      color: '#38bdf8',
      hoursRemaining: 8 - utcHour,
    };
  }
  if (utcHour >= 7 && utcHour < 15) {
    return {
      name: 'London',
      code: 'LON',
      window: '07:00 - 15:00 UTC',
      label: 'London Session Active (Europe Open · Liquidity Hunt)',
      color: '#22c55e',
      hoursRemaining: 15 - utcHour,
    };
  }
  if (utcHour >= 13 && utcHour < 21) {
    return {
      name: 'New York',
      code: 'NY',
      window: '13:00 - 21:00 UTC',
      label: 'New York Session Active (US Open · Cash Volume Expansion)',
      color: '#f59e0b',
      hoursRemaining: 21 - utcHour,
    };
  }
  return {
    name: 'New York Close / Asian Prep',
    code: 'INTER',
    window: '21:00 - 00:00 UTC',
    label: 'Late US Close / Inter-session Transition',
    color: '#a855f7',
    hoursRemaining: 24 - utcHour,
  };
}

/**
 * Main Engine: Analyzes array of 1h candles
 * Each candle: [openTime, open, high, low, close, volume]
 */
export function analyzeSessions(hourlyCandles, customNow = null) {
  const now = customNow ? new Date(customNow) : new Date();
  const currentUtcHour = now.getUTCHours();
  const currentUtcDow = now.getUTCDay();

  // 1. Group 1h candles by UTC Day (YYYY-MM-DD)
  const dayMap = {};
  for (const c of hourlyCandles) {
    const dt = new Date(c[0]);
    const dateStr = dt.toISOString().split('T')[0];
    const hour = dt.getUTCHours();
    if (!dayMap[dateStr]) dayMap[dateStr] = [];
    dayMap[dateStr].push({
      ts: c[0],
      hour,
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      vol: parseFloat(c[5] || 0),
    });
  }

  const allDates = Object.keys(dayMap).sort();
  const dowBuckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const dailyLogs = [];

  for (const dateStr of allDates) {
    const list = dayMap[dateStr];
    if (list.length < 20) continue; // Skip incomplete days (e.g. today if only 3h old)

    const dt = new Date(dateStr + 'T12:00:00Z');
    const dow = dt.getUTCDay();

    const dayHigh = Math.max(...list.map(x => x.high));
    const dayLow = Math.min(...list.map(x => x.low));
    const dayOpen = list[0].open;
    const dayClose = list[list.length - 1].close;
    const dayReturn = ((dayClose - dayOpen) / dayOpen) * 100;
    const dayRange = dayHigh - dayLow;
    const dayRangePct = (dayRange / dayLow) * 100;

    const highCandles = list.filter(x => x.high === dayHigh);
    const lowCandles = list.filter(x => x.low === dayLow);
    const hodCandle = highCandles[0];
    const lodCandle = lowCandles[0];

    const hodSession = getSessionNameForHour(hodCandle.hour);
    const lodSession = getSessionNameForHour(lodCandle.hour);

    // Calculate individual session highs & lows
    const asiaCandles = list.filter(x => x.hour >= 0 && x.hour < 8);
    const londonCandles = list.filter(x => x.hour >= 7 && x.hour < 15);
    const nyCandles = list.filter(x => x.hour >= 13 && x.hour < 22);

    const asiaH = asiaCandles.length > 0 ? Math.max(...asiaCandles.map(x => x.high)) : dayOpen;
    const asiaL = asiaCandles.length > 0 ? Math.min(...asiaCandles.map(x => x.low)) : dayOpen;
    const londonH = londonCandles.length > 0 ? Math.max(...londonCandles.map(x => x.high)) : dayOpen;
    const londonL = londonCandles.length > 0 ? Math.min(...londonCandles.map(x => x.low)) : dayOpen;
    const nyH = nyCandles.length > 0 ? Math.max(...nyCandles.map(x => x.high)) : dayOpen;
    const nyL = nyCandles.length > 0 ? Math.min(...nyCandles.map(x => x.low)) : dayOpen;

    const logEntry = {
      date: dateStr,
      dow,
      dayName: DOW_SHORT_NAMES[dow],
      fullDayName: DOW_FULL_NAMES[dow],
      dayOpen,
      dayClose,
      dayHigh,
      dayLow,
      dayReturn: Math.round(dayReturn * 100) / 100,
      dayRange: Math.round(dayRange * 10) / 10,
      dayRangePct: Math.round(dayRangePct * 100) / 100,
      hodSession,
      hodHour: hodCandle.hour,
      lodSession,
      lodHour: lodCandle.hour,
      sequence: `${lodSession} Low → ${hodSession} High`,
      sessions: {
        asia: { high: asiaH, low: asiaL },
        london: { high: londonH, low: londonL },
        ny: { high: nyH, low: nyL },
      },
    };

    dowBuckets[dow].push(logEntry);
    dailyLogs.push(logEntry);
  }

  // 2. Aggregate Day-of-Week Statistics (Weekly Basis)
  // Format for Mon through Sun: 1, 2, 3, 4, 5, 6, 0
  const weekDayStats = [1, 2, 3, 4, 5, 6, 0].map(dow => {
    const records = dowBuckets[dow];
    const total = records.length;
    if (total === 0) {
      return {
        dow,
        dayName: DOW_SHORT_NAMES[dow],
        fullDayName: DOW_FULL_NAMES[dow],
        totalScanned: 0,
        hod: { Asia: 0, London: 0, NY: 0 },
        lod: { Asia: 0, London: 0, NY: 0 },
        dominantHod: 'None',
        dominantLod: 'None',
        topSequence: 'N/A',
        topSequencePct: 0,
        avgRangePct: 0,
        bullishRate: 0,
        playbook: 'Insufficient historical data for this day.',
      };
    }

    const hodCounts = { Asia: 0, London: 0, 'New York': 0 };
    const lodCounts = { Asia: 0, London: 0, 'New York': 0 };
    const seqCounts = {};
    let totalRangePct = 0;
    let greenDays = 0;

    records.forEach(r => {
      hodCounts[r.hodSession] = (hodCounts[r.hodSession] || 0) + 1;
      lodCounts[r.lodSession] = (lodCounts[r.lodSession] || 0) + 1;
      seqCounts[r.sequence] = (seqCounts[r.sequence] || 0) + 1;
      totalRangePct += r.dayRangePct;
      if (r.dayReturn > 0) greenDays++;
    });

    const asiaHodPct = Math.round((hodCounts.Asia / total) * 100);
    const lonHodPct = Math.round((hodCounts.London / total) * 100);
    const nyHodPct = Math.round((hodCounts['New York'] / total) * 100);

    const asiaLodPct = Math.round((lodCounts.Asia / total) * 100);
    const lonLodPct = Math.round((lodCounts.London / total) * 100);
    const nyLodPct = Math.round((lodCounts['New York'] / total) * 100);

    // Dominant HOD / LOD
    const hodSessions = [
      { name: 'New York', pct: nyHodPct },
      { name: 'London', pct: lonHodPct },
      { name: 'Asia', pct: asiaHodPct },
    ].sort((a, b) => b.pct - a.pct);

    const lodSessions = [
      { name: 'London', pct: lonLodPct },
      { name: 'Asia', pct: asiaLodPct },
      { name: 'New York', pct: nyLodPct },
    ].sort((a, b) => b.pct - a.pct);

    const dominantHod = hodSessions[0];
    const dominantLod = lodSessions[0];

    // Top Archetype sequence
    const sortedSeqs = Object.entries(seqCounts).sort((a, b) => b[1] - a[1]);
    const topSeq = sortedSeqs[0] || ['Unknown', 0];
    const topSeqPct = Math.round((topSeq[1] / total) * 100);

    const avgRangePct = Math.round((totalRangePct / total) * 100) / 100;
    const bullishRate = Math.round((greenDays / total) * 100);

    // Generate actionable institutional playbook text
    let playbook = '';
    if (dominantLod.name === 'Asia' && dominantHod.name === 'New York') {
      playbook = `On ${DOW_FULL_NAMES[dow]}s, Asia establishes the Day Low (${dominantLod.pct}% prob), and New York drives the expansion to Day High (${dominantHod.pct}% prob). Typical playbook: Accumulation in Asia, London continuation, New York peak.`;
    } else if (dominantLod.name === 'London' && dominantHod.name === 'New York') {
      playbook = `On ${DOW_FULL_NAMES[dow]}s, London typically sweeps liquidity to set the Day Low (${dominantLod.pct}% prob), while New York puts in the Day High (${dominantHod.pct}% prob). Typical playbook: London Judas swing into New York trend.`;
    } else if (dominantHod.name === 'London' && dominantLod.name === 'New York') {
      playbook = `On ${DOW_FULL_NAMES[dow]}s, London puts in the Day High (${dominantHod.pct}% prob), followed by New York distribution to Day Low (${dominantLod.pct}% prob). Beware afternoon US bleed.`;
    } else if (dominantLod.name === 'Asia' && dominantHod.name === 'London') {
      playbook = `On ${DOW_FULL_NAMES[dow]}s, Asia establishes the Low (${dominantLod.pct}% prob) and London puts in the High (${dominantHod.pct}% prob). Expect European morning expansion.`;
    } else {
      playbook = `On ${DOW_FULL_NAMES[dow]}s, ${dominantLod.name} leads Low of Day (${dominantLod.pct}%), with ${dominantHod.name} leading High of Day (${dominantHod.pct}%). Most common sequence: ${topSeq[0]} (${topSeqPct}%).`;
    }

    return {
      dow,
      dayName: DOW_SHORT_NAMES[dow],
      fullDayName: DOW_FULL_NAMES[dow],
      totalScanned: total,
      hod: {
        Asia: asiaHodPct,
        London: lonHodPct,
        NY: nyHodPct,
      },
      lod: {
        Asia: asiaLodPct,
        London: lonLodPct,
        NY: nyLodPct,
      },
      dominantHod: dominantHod.name,
      dominantHodPct: dominantHod.pct,
      dominantLod: dominantLod.name,
      dominantLodPct: dominantLod.pct,
      topSequence: topSeq[0],
      topSequencePct: topSeqPct,
      avgRangePct,
      bullishRate,
      playbook,
    };
  });

  // 3. Weekly Cycle: High of Week (HOW) and Low of Week (LOW) by Day
  const weekMap = {};
  for (const c of hourlyCandles) {
    const dt = new Date(c[0]);
    const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setUTCDate(diff)).toISOString().split('T')[0];
    if (!weekMap[monday]) weekMap[monday] = [];
    weekMap[monday].push({
      ts: c[0],
      dow: dt.getUTCDay(),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
    });
  }

  const howCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const lowCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let completedWeeks = 0;
  const weeklyCycleList = [];

  for (const [mondayStr, list] of Object.entries(weekMap)) {
    if (list.length < 100) continue; // Skip incomplete weeks
    completedWeeks++;
    const weekHigh = Math.max(...list.map(x => x.high));
    const weekLow = Math.min(...list.map(x => x.low));
    const highCandle = list.find(x => x.high === weekHigh);
    const lowCandle = list.find(x => x.low === weekLow);

    howCounts[highCandle.dow]++;
    lowCounts[lowCandle.dow]++;

    weeklyCycleList.push({
      weekStart: mondayStr,
      lowDow: lowCandle.dow,
      lowDay: DOW_SHORT_NAMES[lowCandle.dow],
      weekLow,
      highDow: highCandle.dow,
      highDay: DOW_SHORT_NAMES[highCandle.dow],
      weekHigh,
    });
  }

  const weeklyCycleByDay = [1, 2, 3, 4, 5, 6, 0].map(dow => {
    const lowCount = lowCounts[dow] || 0;
    const howCount = howCounts[dow] || 0;
    return {
      dow,
      dayName: DOW_SHORT_NAMES[dow],
      fullDayName: DOW_FULL_NAMES[dow],
      lowOfWeekPct: completedWeeks > 0 ? Math.round((lowCount / completedWeeks) * 100) : 0,
      highOfWeekPct: completedWeeks > 0 ? Math.round((howCount / completedWeeks) * 100) : 0,
      lowCount,
      howCount,
    };
  });

  // 4. Live Today's Intel
  const todayStats = weekDayStats.find(x => x.dow === currentUtcDow) || weekDayStats[0];
  const activeSession = getCurrentActiveSession(currentUtcHour);

  return {
    meta: {
      generatedAt: now.toISOString(),
      currentUtcHour,
      currentUtcDow,
      currentUtcDate: now.toISOString().split('T')[0],
      totalCandlesScanned: hourlyCandles.length,
      daysScanned: dailyLogs.length,
      weeksScanned: completedWeeks,
    },
    activeSession,
    today: {
      dayName: todayStats.fullDayName,
      dow: currentUtcDow,
      stats: todayStats,
      playbook: todayStats.playbook,
      liveTip: `Current Active Session: ${activeSession.label}. Expecting ${todayStats.dominantLod} to form Low of Day (${todayStats.dominantLodPct}%) and ${todayStats.dominantHod} to form High of Day (${todayStats.dominantHodPct}%).`,
    },
    weeklyByDay: weekDayStats,
    weeklyCycle: {
      totalWeeks: completedWeeks,
      byDay: weeklyCycleByDay,
      recentWeeks: weeklyCycleList.reverse().slice(0, 6),
    },
    dailyLogs: dailyLogs.reverse().slice(0, 31), // Last 31 days
  };
}
