import { ALTS_WHITELIST, MAJOR_SYMBOLS } from './altsData.js';
import {
  calculateRSI,
  calculateZScore,
  checkRsiDivergence,
  aggregateCandlesByMinutes,
  RSI_OVERBOUGHT_THRESHOLD,
  RSI_OVERSOLD_THRESHOLD,
} from './rsiScannerEngine.js';

export const MONDAY_RANGE_ENGINE_VERSION = 1;
export const MR_TIMEFRAMES = ['30m', '45m', '1h'];

const EPS = 0.0005; // 0.05% minimum excursion threshold to ignore 1-tick spread noise
const MIN_SWEEP_PCT = 0.15; // Require >= 0.15% wick sweep or >= 1 closed bar beyond Mon H/L
const MAX_BREAK_IN_AGE_HOURS = 36; // Only keep active break-ins from last 36 hours
const SWEEP_RSI_PRE_BUFFER_MS = 90 * 60 * 1000; // 90m lookback before excursion start
const MAX_SWEEP_RSI_WINDOW_MS = 48 * 3600 * 1000;

/**
 * Compute current ISO/UTC week's Monday (00:00:00 UTC -> 23:59:59 UTC)
 */
export function getCurrentUtcMondayWindow(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const utcDow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMonday = utcDow === 0 ? 6 : utcDow - 1;
  const mondayStart = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysSinceMonday,
    0,
    0,
    0,
    0
  );
  const mondayEnd = mondayStart + 24 * 60 * 60 * 1000;
  const isMondayForming = nowMs < mondayEnd;
  const mondayDateStr = new Date(mondayStart).toISOString().split('T')[0];

  return {
    mondayStart,
    mondayEnd,
    isMondayForming,
    mondayDateStr,
  };
}

/**
 * Fetch perpetual candles from Bybit Linear v5 with Binance Vision fallback
 */
async function fetchKlineSeries(symbol, interval, limit) {
  // 1. Bybit Linear Perpetuals
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfMondayRangeScanner/1.0' },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (res.ok) {
      const json = await res.json();
      if (json.result?.list && json.result.list.length >= 24) {
        return json.result.list
          .slice()
          .reverse()
          .map((k) => ({
            time: parseInt(k[0], 10),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            vol: parseFloat(k[5] || 0),
          }));
      }
    }
  } catch (e) {}

  // 2. Binance Vision Fallback
  try {
    const bInterval = interval === '15' ? '15m' : interval === '60' ? '1h' : '1h';
    const bRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfMondayRangeScanner/1.0' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList) && bList.length >= 24) {
        return bList.map((k) => ({
          time: parseInt(k[0], 10),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          vol: parseFloat(k[5] || 0),
        }));
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Evaluate RSI (14), Divergence, Sigma, and Sweep-Window Peak/Trough RSI for a timeframe
 */
function analyzeTimeframeRsi(candles, sweepStartTime, nowMs, isMajor) {
  if (!candles || candles.length < 30) return null;

  const closes = candles.map((c) => c.close);
  const rsiSeries = calculateRSI(closes, 14);
  const rawLiveRsi = rsiSeries[rsiSeries.length - 1];
  if (rawLiveRsi === null || rawLiveRsi === undefined) return null;

  const rsi = Number(rawLiveRsi.toFixed(1));
  const divergence = checkRsiDivergence(candles, rsiSeries, isMajor);
  const sigmaMetrics = calculateZScore(closes, 20);

  // Measure peak/trough RSI across the active sweep window (capped to <= 48h lookback)
  const fallbackStart = nowMs - 12 * 3600 * 1000;
  const rawWindowStart = (sweepStartTime || fallbackStart) - SWEEP_RSI_PRE_BUFFER_MS;
  const windowStart = Math.max(rawWindowStart, nowMs - MAX_SWEEP_RSI_WINDOW_MS);

  let peakRsi = rsi;
  let troughRsi = rsi;
  let peakRsiTime = candles[candles.length - 1].time;
  let troughRsiTime = candles[candles.length - 1].time;

  const minLookbackStart = Math.max(14, candles.length - 3);
  for (let i = 14; i < candles.length; i++) {
    const r = rsiSeries[i];
    if (r === null || r === undefined) continue;
    if (candles[i].time >= windowStart || i >= minLookbackStart) {
      if (r > peakRsi) {
        peakRsi = Number(r.toFixed(1));
        peakRsiTime = candles[i].time;
      }
      if (r < troughRsi) {
        troughRsi = Number(r.toFixed(1));
        troughRsiTime = candles[i].time;
      }
    }
  }

  peakRsi = Number(peakRsi.toFixed(1));
  troughRsi = Number(troughRsi.toFixed(1));

  const isLiveOb = rsi >= RSI_OVERBOUGHT_THRESHOLD;
  const isLiveOs = rsi <= RSI_OVERSOLD_THRESHOLD;
  const hasBearDiv = divergence?.direction === 'BEAR';
  const hasBullDiv = divergence?.direction === 'BULL';

  // Peak >= 70 OB during the Monday High sweep while RSI hasn't dumped into oversold yet (>= 45)
  const isSweepPeakOb = peakRsi >= RSI_OVERBOUGHT_THRESHOLD && rsi >= 45.0;
  // Trough <= 30 OS during the Monday Low sweep while RSI hasn't already over-rallied (<= 55)
  const isSweepTroughOs = troughRsi <= RSI_OVERSOLD_THRESHOLD && rsi <= 55.0;

  const sellConfirmed = hasBearDiv || isLiveOb || isSweepPeakOb;
  const buyConfirmed = hasBullDiv || isLiveOs || isSweepTroughOs;

  let sellReason = null;
  let sellShortTag = null;
  if (hasBearDiv && isLiveOb) {
    sellReason = `Bearish Div + Live OB (${rsi})`;
    sellShortTag = `Bear Div · ${rsi}`;
  } else if (hasBearDiv) {
    sellReason = `Bearish Div (${divergence.prevRsi}→${divergence.curRsi})`;
    sellShortTag = `Bear Div`;
  } else if (isLiveOb) {
    sellReason = `Live Overbought (${rsi} ≥70)`;
    sellShortTag = `${rsi} OB`;
  } else if (isSweepPeakOb) {
    sellReason = `Peak ${peakRsi} OB → ${rsi}`;
    sellShortTag = `Pk ${peakRsi}→${rsi}`;
  }

  let buyReason = null;
  let buyShortTag = null;
  if (hasBullDiv && isLiveOs) {
    buyReason = `Bullish Div + Live OS (${rsi})`;
    buyShortTag = `Bull Div · ${rsi}`;
  } else if (hasBullDiv) {
    buyReason = `Bullish Div (${divergence.prevRsi}→${divergence.curRsi})`;
    buyShortTag = `Bull Div`;
  } else if (isLiveOs) {
    buyReason = `Live Oversold (${rsi} ≤30)`;
    buyShortTag = `${rsi} OS`;
  } else if (isSweepTroughOs) {
    buyReason = `Dip ${troughRsi} OS → ${rsi}`;
    buyShortTag = `Dp ${troughRsi}→${rsi}`;
  }

  return {
    rsi,
    peakRsi,
    troughRsi,
    peakRsiTime,
    troughRsiTime,
    isLiveOb,
    isLiveOs,
    isSweepPeakOb,
    isSweepTroughOs,
    hasBearDiv,
    hasBullDiv,
    divergence,
    sigmaMetrics,
    sellConfirmed,
    buyConfirmed,
    sellReason,
    sellShortTag,
    buyReason,
    buyShortTag,
  };
}

/**
 * Analyze a single coin's Monday Range, excursion/break-in state, and 30m/45m/1h RSI confirmations
 */
export function analyzeCoinMondayRange(coin, candles1h, candles15m, nowMs = Date.now()) {
  if (!candles1h || candles1h.length < 24 || !candles15m || candles15m.length < 36) {
    return null;
  }

  const isMajor = MAJOR_SYMBOLS.includes(coin.symbol);
  const { mondayStart, mondayEnd, isMondayForming, mondayDateStr } = getCurrentUtcMondayWindow(nowMs);

  const monCandles = candles1h.filter((c) => c.time >= mondayStart && c.time < mondayEnd);
  if ((!isMondayForming && monCandles.length < 12) || (isMondayForming && monCandles.length === 0)) {
    return null;
  }

  const mondayHigh = Math.max(...monCandles.map((c) => c.high));
  const mondayLow = Math.min(...monCandles.map((c) => c.low));
  if (!Number.isFinite(mondayHigh) || !Number.isFinite(mondayLow) || mondayLow <= 0) {
    return null;
  }

  const mondayMid = (mondayHigh + mondayLow) / 2;
  const mondayOpen = monCandles[0].open;
  const mondayRange = mondayHigh - mondayLow;
  const mondayRangePct = mondayLow > 0 ? Number(((mondayRange / mondayLow) * 100).toFixed(2)) : 0;

  const candles30m = aggregateCandlesByMinutes(candles15m, 30, 2);
  const candles45m = aggregateCandlesByMinutes(candles15m, 45, 3);
  if (candles30m.length < 24 || candles45m.length < 24) {
    return null;
  }

  const spot = candles15m[candles15m.length - 1].close || candles1h[candles1h.length - 1].close;
  const distFromHighPct = Number((((spot - mondayHigh) / mondayHigh) * 100).toFixed(2));
  const distFromLowPct = Number((((spot - mondayLow) / mondayLow) * 100).toFixed(2));
  const distFromMidPct = mondayMid > 0 ? Number((((spot - mondayMid) / mondayMid) * 100).toFixed(2)) : 0;
  const rawPosPct = mondayRange > 0 ? ((spot - mondayLow) / mondayRange) * 100 : 50;
  const posInRangePct = Math.round(rawPosPct);

  // Post-Monday full week extremes (from 1h)
  const post1h = !isMondayForming ? candles1h.filter((c) => c.time >= mondayEnd) : [];
  const post30m = !isMondayForming ? candles30m.filter((c) => c.time >= mondayEnd) : [];

  // Stitch earlier 1h post-Monday bars before earliest 30m bar (ensures full Tue->Sun continuity)
  const earliest30mTime = post30m.length > 0 ? post30m[0].time : Infinity;
  const earlierPost1h = post1h.filter((c) => c.time < earliest30mTime);
  const scanBars = [...earlierPost1h, ...post30m];

  let postMonHigh = post1h.length > 0 ? Math.max(...post1h.map((c) => c.high), spot) : spot;
  let postMonLow = post1h.length > 0 ? Math.min(...post1h.map((c) => c.low), spot) : spot;
  if (post30m.length > 0) {
    postMonHigh = Math.max(postMonHigh, ...post30m.map((c) => c.high));
    postMonLow = Math.min(postMonLow, ...post30m.map((c) => c.low));
  }

  let setupState = isMondayForming ? 'MONDAY_FORMING' : 'INSIDE_RANGE';
  let activeSweep = null;
  let direction = 'NEUTRAL'; // 'SELL' | 'BUY' | 'NEUTRAL'
  let isClosedConfirm = false;

  if (!isMondayForming && scanBars.length > 0) {
    let activeHighSweep = null;
    let activeLowSweep = null;

    for (let i = 0; i < scanBars.length; i++) {
      const b = scanBars[i];
      const isLast = i === scanBars.length - 1;
      const bClose = isLast ? spot : b.close;
      const bHigh = isLast ? Math.max(b.high, spot) : b.high;
      const bLow = isLast ? Math.min(b.low, spot) : b.low;

      // Track Monday High Excursion
      if (bHigh > mondayHigh * (1 + EPS)) {
        if (!activeHighSweep) {
          activeHighSweep = {
            startTime: b.time,
            lastAboveTime: b.time,
            maxHigh: bHigh,
            maxHighTime: b.time,
            closedAboveCount: bClose > mondayHigh ? 1 : 0,
            brokeInsideTime: null,
            closedBreakInConfirmed: false,
          };
        } else {
          activeHighSweep.lastAboveTime = b.time;
          if (bHigh > activeHighSweep.maxHigh) {
            activeHighSweep.maxHigh = bHigh;
            activeHighSweep.maxHighTime = b.time;
          }
          if (bClose > mondayHigh) {
            activeHighSweep.closedAboveCount += 1;
            activeHighSweep.brokeInsideTime = null;
            activeHighSweep.closedBreakInConfirmed = false;
          }
        }
      }

      if (activeHighSweep && bClose < mondayHigh) {
        if (!activeHighSweep.brokeInsideTime) {
          activeHighSweep.brokeInsideTime = b.time;
        }
        if (!isLast) {
          activeHighSweep.closedBreakInConfirmed = true;
        }
      }

      // Track Monday Low Excursion
      if (bLow < mondayLow * (1 - EPS)) {
        if (!activeLowSweep) {
          activeLowSweep = {
            startTime: b.time,
            lastBelowTime: b.time,
            minLow: bLow,
            minLowTime: b.time,
            closedBelowCount: bClose < mondayLow ? 1 : 0,
            reclaimedTime: null,
            closedReclaimConfirmed: false,
          };
        } else {
          activeLowSweep.lastBelowTime = b.time;
          if (bLow < activeLowSweep.minLow) {
            activeLowSweep.minLow = bLow;
            activeLowSweep.minLowTime = b.time;
          }
          if (bClose < mondayLow) {
            activeLowSweep.closedBelowCount += 1;
            activeLowSweep.reclaimedTime = null;
            activeLowSweep.closedReclaimConfirmed = false;
          }
        }
      }

      if (activeLowSweep && bClose > mondayLow) {
        if (!activeLowSweep.reclaimedTime) {
          activeLowSweep.reclaimedTime = b.time;
        }
        if (!isLast) {
          activeLowSweep.closedReclaimConfirmed = true;
        }
      }

      // Full-range completion resets opposite excursion
      if (bClose < mondayLow * (1 - EPS)) {
        activeHighSweep = null;
      }
      if (bClose > mondayHigh * (1 + EPS)) {
        activeLowSweep = null;
      }
    }

    const highSweepPct = activeHighSweep
      ? Number((((activeHighSweep.maxHigh - mondayHigh) / mondayHigh) * 100).toFixed(2))
      : 0;
    const lowSweepPct = activeLowSweep
      ? Number((((mondayLow - activeLowSweep.minLow) / mondayLow) * 100).toFixed(2))
      : 0;

    const highBreakAgeHrs = activeHighSweep?.brokeInsideTime
      ? (nowMs - activeHighSweep.brokeInsideTime) / (3600 * 1000)
      : Infinity;
    const lowReclaimAgeHrs = activeLowSweep?.reclaimedTime
      ? (nowMs - activeLowSweep.reclaimedTime) / (3600 * 1000)
      : Infinity;

    const isValidHighSweep =
      activeHighSweep && (activeHighSweep.closedAboveCount >= 1 || highSweepPct >= MIN_SWEEP_PCT);
    const isValidLowSweep =
      activeLowSweep && (activeLowSweep.closedBelowCount >= 1 || lowSweepPct >= MIN_SWEEP_PCT);

    if (spot > mondayHigh) {
      setupState = 'WATCH_SELL';
      direction = 'SELL';
      activeSweep = {
        side: 'SELL',
        startTime: activeHighSweep?.startTime || nowMs,
        extremePrice: Math.max(activeHighSweep?.maxHigh || spot, spot),
        sweepPct: Math.max(highSweepPct, Math.max(0, distFromHighPct)),
        closedBarsOutside: activeHighSweep?.closedAboveCount || 0,
        hoursAgo: 0,
      };
    } else if (spot < mondayLow) {
      setupState = 'WATCH_BUY';
      direction = 'BUY';
      activeSweep = {
        side: 'BUY',
        startTime: activeLowSweep?.startTime || nowMs,
        extremePrice: Math.min(activeLowSweep?.minLow || spot, spot),
        sweepPct: Math.max(lowSweepPct, Math.max(0, Math.abs(distFromLowPct))),
        closedBarsOutside: activeLowSweep?.closedBelowCount || 0,
        hoursAgo: 0,
      };
    } else {
      // Spot is inside [mondayLow, mondayHigh]
      const canSellBreakIn =
        isValidHighSweep &&
        spot < mondayHigh &&
        posInRangePct >= 20 &&
        highBreakAgeHrs <= MAX_BREAK_IN_AGE_HOURS;

      const canBuyReclaim =
        isValidLowSweep &&
        spot > mondayLow &&
        posInRangePct <= 80 &&
        lowReclaimAgeHrs <= MAX_BREAK_IN_AGE_HOURS;

      let chosenSide = null;
      if (canSellBreakIn && canBuyReclaim) {
        chosenSide =
          activeHighSweep.maxHighTime >= activeLowSweep.minLowTime ? 'SELL' : 'BUY';
      } else if (canSellBreakIn) {
        chosenSide = 'SELL';
      } else if (canBuyReclaim) {
        chosenSide = 'BUY';
      }

      if (chosenSide === 'SELL') {
        setupState = 'BREAK_IN_SELL';
        direction = 'SELL';
        isClosedConfirm = Boolean(activeHighSweep.closedBreakInConfirmed);
        activeSweep = {
          side: 'SELL',
          startTime: activeHighSweep.startTime,
          extremePrice: activeHighSweep.maxHigh,
          sweepPct: highSweepPct,
          closedBarsOutside: activeHighSweep.closedAboveCount,
          breakInTime: activeHighSweep.brokeInsideTime,
          hoursAgo: Number(highBreakAgeHrs.toFixed(1)),
          isClosedConfirm,
        };
      } else if (chosenSide === 'BUY') {
        setupState = 'RECLAIM_BUY';
        direction = 'BUY';
        isClosedConfirm = Boolean(activeLowSweep.closedReclaimConfirmed);
        activeSweep = {
          side: 'BUY',
          startTime: activeLowSweep.startTime,
          extremePrice: activeLowSweep.minLow,
          sweepPct: lowSweepPct,
          closedBarsOutside: activeLowSweep.closedBelowCount,
          breakInTime: activeLowSweep.reclaimedTime,
          hoursAgo: Number(lowReclaimAgeHrs.toFixed(1)),
          isClosedConfirm,
        };
      }
    }
  }

  // Evaluate RSI across strict 30m, 45m, 1h timeframes
  const sweepStartTime = activeSweep?.startTime || nowMs - 12 * 3600 * 1000;
  const tf30 = analyzeTimeframeRsi(candles30m, sweepStartTime, nowMs, isMajor);
  const tf45 = analyzeTimeframeRsi(candles45m, sweepStartTime, nowMs, isMajor);
  const tf1h = analyzeTimeframeRsi(candles1h, sweepStartTime, nowMs, isMajor);
  if (!tf30 || !tf45 || !tf1h) return null;

  const timeframes = {
    '30m': tf30,
    '45m': tf45,
    '1h': tf1h,
  };

  const matchedSellTfs = MR_TIMEFRAMES.filter((tf) => timeframes[tf]?.sellConfirmed);
  const matchedBuyTfs = MR_TIMEFRAMES.filter((tf) => timeframes[tf]?.buyConfirmed);

  let signalStatus = 'INSIDE_RANGE';
  let confirmedTfs = [];
  let hasDivergence = false;
  let hasLiveExtremeRsi = false;

  if (isMondayForming) {
    signalStatus = 'MONDAY_FORMING';
  } else if (setupState === 'BREAK_IN_SELL') {
    confirmedTfs = matchedSellTfs;
    hasDivergence = confirmedTfs.some((tf) => timeframes[tf].hasBearDiv);
    hasLiveExtremeRsi = confirmedTfs.some((tf) => timeframes[tf].isLiveOb);
    signalStatus = matchedSellTfs.length > 0 ? 'CONFIRMED_SELL' : 'UNCONFIRMED_BREAK_IN';
  } else if (setupState === 'RECLAIM_BUY') {
    confirmedTfs = matchedBuyTfs;
    hasDivergence = confirmedTfs.some((tf) => timeframes[tf].hasBullDiv);
    hasLiveExtremeRsi = confirmedTfs.some((tf) => timeframes[tf].isLiveOs);
    signalStatus = matchedBuyTfs.length > 0 ? 'CONFIRMED_BUY' : 'UNCONFIRMED_RECLAIM';
  } else if (setupState === 'WATCH_SELL') {
    confirmedTfs = matchedSellTfs;
    hasDivergence = confirmedTfs.some((tf) => timeframes[tf].hasBearDiv);
    hasLiveExtremeRsi = confirmedTfs.some((tf) => timeframes[tf].isLiveOb);
    signalStatus = matchedSellTfs.length > 0 ? 'WATCH_SELL' : 'OUTSIDE_ABOVE';
  } else if (setupState === 'WATCH_BUY') {
    confirmedTfs = matchedBuyTfs;
    hasDivergence = confirmedTfs.some((tf) => timeframes[tf].hasBullDiv);
    hasLiveExtremeRsi = confirmedTfs.some((tf) => timeframes[tf].isLiveOs);
    signalStatus = matchedBuyTfs.length > 0 ? 'WATCH_BUY' : 'OUTSIDE_BELOW';
  }

  // Conviction score for clean ranking (higher = stronger setup)
  let score = 0;
  if (signalStatus === 'CONFIRMED_SELL' || signalStatus === 'CONFIRMED_BUY') score += 100;
  else if (signalStatus === 'WATCH_SELL' || signalStatus === 'WATCH_BUY') score += 50;
  score += confirmedTfs.length * 15;
  if (hasDivergence) score += 22;
  if (hasLiveExtremeRsi) score += 14;
  if (isClosedConfirm) score += 10;
  if (isMajor) score += 4;
  if (activeSweep && activeSweep.hoursAgo <= 4) score += 8;

  // Build concise, transparent narrative
  let narrative = null;
  if (signalStatus === 'CONFIRMED_SELL') {
    const reasons = confirmedTfs
      .map((tf) => `${tf.toUpperCase()} (${timeframes[tf].sellReason})`)
      .join(' · ');
    const styleLabel =
      activeSweep.closedBarsOutside > 0
        ? `Accepted ${activeSweep.closedBarsOutside}×30m above (+${activeSweep.sweepPct}% max)`
        : `Swept +${activeSweep.sweepPct}% above`;
    narrative = `${styleLabel} Monday High → broke inside (${distFromHighPct}% below High). Confirmed on ${reasons}.`;
  } else if (signalStatus === 'CONFIRMED_BUY') {
    const reasons = confirmedTfs
      .map((tf) => `${tf.toUpperCase()} (${timeframes[tf].buyReason})`)
      .join(' · ');
    const styleLabel =
      activeSweep.closedBarsOutside > 0
        ? `Accepted ${activeSweep.closedBarsOutside}×30m below (-${activeSweep.sweepPct}% max)`
        : `Swept -${activeSweep.sweepPct}% below`;
    narrative = `${styleLabel} Monday Low → reclaimed inside (+${distFromLowPct}% above Low). Confirmed on ${reasons}.`;
  } else if (signalStatus === 'WATCH_SELL') {
    const reasons = confirmedTfs
      .map((tf) => `${tf.toUpperCase()} (${timeframes[tf].sellReason})`)
      .join(' · ');
    narrative = `Currently trading +${distFromHighPct}% ABOVE Monday High with ${reasons}. Watch for candle close back below Monday High.`;
  } else if (signalStatus === 'WATCH_BUY') {
    const reasons = confirmedTfs
      .map((tf) => `${tf.toUpperCase()} (${timeframes[tf].buyReason})`)
      .join(' · ');
    narrative = `Currently trading ${distFromLowPct}% BELOW Monday Low with ${reasons}. Watch for candle reclaim back above Monday Low.`;
  }

  return {
    symbol: coin.symbol,
    displaySymbol: coin.displaySymbol,
    name: coin.name,
    decimals: coin.decimals ?? 4,
    isMajor,
    price: spot,
    mondayDateStr,
    isMondayForming,
    mondayOpen,
    mondayHigh,
    mondayMid,
    mondayLow,
    mondayRangePct,
    postMonHigh,
    postMonLow,
    distFromHighPct,
    distFromMidPct,
    distFromLowPct,
    posInRangePct,
    setupState,
    direction,
    signalStatus,
    isClosedConfirm,
    hasDivergence,
    hasLiveExtremeRsi,
    confirmedTfs,
    matchedSellTfs,
    matchedBuyTfs,
    activeSweep,
    timeframes,
    score,
    narrative,
  };
}

/**
 * Scan all 56 whitelisted coins for Monday Range Break-In + 30m/45m/1h RSI setups
 */
export async function scanAllMondayRanges() {
  const scanTime = Date.now();
  const { isMondayForming, mondayDateStr } = getCurrentUtcMondayWindow(scanTime);
  const allCoins = [];

  const BATCH_SIZE = 10;

  for (let i = 0; i < ALTS_WHITELIST.length; i += BATCH_SIZE) {
    const batch = ALTS_WHITELIST.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (coin) => {
      const [candles1h, candles15m] = await Promise.all([
        fetchKlineSeries(coin.symbol, '60', 200),
        fetchKlineSeries(coin.symbol, '15', 480),
      ]);
      return analyzeCoinMondayRange(coin, candles1h, candles15m, scanTime);
    });

    const batchResults = await Promise.allSettled(promises);
    batchResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) {
        allCoins.push(r.value);
      }
    });
  }

  allCoins.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });

  const confirmedSellSignals = allCoins.filter((c) => c.signalStatus === 'CONFIRMED_SELL');
  const confirmedBuySignals = allCoins.filter((c) => c.signalStatus === 'CONFIRMED_BUY');
  const watchSellSignals = allCoins.filter((c) => c.signalStatus === 'WATCH_SELL');
  const watchBuySignals = allCoins.filter((c) => c.signalStatus === 'WATCH_BUY');

  const majorsContext = MAJOR_SYMBOLS.map((sym) =>
    allCoins.find((c) => c.symbol === sym)
  ).filter(Boolean);

  return {
    engineVersion: MONDAY_RANGE_ENGINE_VERSION,
    scanTime,
    mondayDateStr,
    isMondayForming,
    totalScanned: allCoins.length,
    totalCoins: ALTS_WHITELIST.length,
    monitoredTimeframes: MR_TIMEFRAMES,
    confirmedSellCount: confirmedSellSignals.length,
    confirmedBuyCount: confirmedBuySignals.length,
    watchSellCount: watchSellSignals.length,
    watchBuyCount: watchBuySignals.length,
    confirmedSellSignals,
    confirmedBuySignals,
    watchSellSignals,
    watchBuySignals,
    majorsContext,
    allCoins,
  };
}
