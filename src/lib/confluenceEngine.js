import { ALTS_WHITELIST, MAJOR_SYMBOLS, WHITELIST_MAP } from './altsData.js';
import { aggregateCandlesByMinutes } from './rsiScannerEngine.js';

export const CONFLUENCE_ENGINE_VERSION = 2;
export const CONFLUENCE_TIMEFRAMES = ['1h', '2h', '3h', '4h'];
export const VWAP_ANCHORS = ['week', 'month', 'quarter', 'year'];
export const VWAP_LABELS = {
  week: 'Weekly VWAP',
  month: 'Monthly VWAP',
  quarter: 'Quarterly VWAP',
  year: 'Yearly VWAP',
};
export const VWAP_SHORT_LABELS = {
  week: 'W-VWAP',
  month: 'M-VWAP',
  quarter: 'Q-VWAP',
  year: 'Y-VWAP',
};

export const TARGET_SCAN_COINS = 75; // Top actively traded Binance perpetuals + curated whitelist
export const MAX_STORED_SPREAD_PCT = 3.5; // Store alignments up to 3.5% so UI filters cleanly down to 0.2%

// Liquid Major & Cross Forex pairs requested by user
export const FOREX_PAIRS = [
  { symbol: 'EURUSD', yfSymbol: 'EURUSD=X', displaySymbol: 'EUR/USD', name: 'Euro / US Dollar', base: 'EUR', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:EURUSD' },
  { symbol: 'NZDUSD', yfSymbol: 'NZDUSD=X', displaySymbol: 'NZD/USD', name: 'NZ Dollar / US Dollar', base: 'NZD', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:NZDUSD' },
  { symbol: 'EURNZD', yfSymbol: 'EURNZD=X', displaySymbol: 'EUR/NZD', name: 'Euro / NZ Dollar', base: 'EUR', quote: 'NZD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:EURNZD' },
  { symbol: 'USDCAD', yfSymbol: 'USDCAD=X', displaySymbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', base: 'USD', quote: 'CAD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:USDCAD' },
  { symbol: 'GBPUSD', yfSymbol: 'GBPUSD=X', displaySymbol: 'GBP/USD', name: 'British Pound / US Dollar', base: 'GBP', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:GBPUSD' },
  { symbol: 'USDJPY', yfSymbol: 'USDJPY=X', displaySymbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', base: 'USD', quote: 'JPY', pipDecimals: 2, pipMultiplier: 100, tvSymbol: 'FX:USDJPY' },
  { symbol: 'AUDUSD', yfSymbol: 'AUDUSD=X', displaySymbol: 'AUD/USD', name: 'Aussie / US Dollar', base: 'AUD', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:AUDUSD' },
  { symbol: 'USDCHF', yfSymbol: 'USDCHF=X', displaySymbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', base: 'USD', quote: 'CHF', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:USDCHF' },
  { symbol: 'EURGBP', yfSymbol: 'EURGBP=X', displaySymbol: 'EUR/GBP', name: 'Euro / British Pound', base: 'EUR', quote: 'GBP', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:EURGBP' },
  { symbol: 'EURJPY', yfSymbol: 'EURJPY=X', displaySymbol: 'EUR/JPY', name: 'Euro / Japanese Yen', base: 'EUR', quote: 'JPY', pipDecimals: 2, pipMultiplier: 100, tvSymbol: 'FX:EURJPY' },
  { symbol: 'GBPJPY', yfSymbol: 'GBPJPY=X', displaySymbol: 'GBP/JPY', name: 'Pound / Japanese Yen', base: 'GBP', quote: 'JPY', pipDecimals: 2, pipMultiplier: 100, tvSymbol: 'FX:GBPJPY' },
  { symbol: 'AUDNZD', yfSymbol: 'AUDNZD=X', displaySymbol: 'AUD/NZD', name: 'Aussie / NZ Dollar', base: 'AUD', quote: 'NZD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:AUDNZD' },
  { symbol: 'AUDCAD', yfSymbol: 'AUDCAD=X', displaySymbol: 'AUD/CAD', name: 'Aussie / Canadian Dollar', base: 'AUD', quote: 'CAD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:AUDCAD' },
  { symbol: 'XAUUSD', yfSymbol: 'GC=F', displaySymbol: 'XAU/USD (Gold)', name: 'Gold / US Dollar', base: 'XAU', quote: 'USD', pipDecimals: 2, pipMultiplier: 10, tvSymbol: 'TVC:GOLD' },
];

const EXCLUDED_STABLE_SYMBOLS = new Set([
  'USDCUSDT',
  'FDUSDUSDT',
  'TUSDUSDT',
  'USDEUSDT',
  'USD1USDT',
  'BUSDUSDT',
  'DAIUSDT',
  'EURCUSDT',
  'PYUSDUSDT',
  'USDDUSDT',
  'RLUSDUSDT',
  'RWUSDUSDT',
  'UUSDT',
  'EURUSDT',
  'WBTCUSDT',
  'WBETHUSDT',
]);

function inferDecimals(price, fallback = 4) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n >= 1000) return 1;
  if (n >= 100) return 2;
  if (n >= 1) return 3;
  if (n >= 0.05) return 4;
  if (n >= 0.005) return 5;
  return 6;
}

function formatDisplaySymbol(symbol) {
  if (symbol.startsWith('1000') && symbol.endsWith('USDT')) {
    return `${symbol.slice(4)}.P`;
  }
  return `${symbol}.P`;
}

/**
 * Calculate Wilder's 14-period Average True Range (ATR)
 */
export function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;

  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trs[i];
  }
  atr = atr / period;

  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

/**
 * Fetch top actively traded Binance-listed USDT perpetuals (impressive volume only, no shitcoins),
 * merged with curated whitelist (BTC, ETH, SOL, INJ, SUI, NEAR, TIA, AVAX, LINK, etc.).
 */
export async function fetchTopBinanceCoins(targetCount = TARGET_SCAN_COINS) {
  const binanceTickers = [];

  // 1. Fetch Binance 24hr Tickers (Source of Truth for Binance listing & impressive volume)
  const binanceEndpoints = [
    'https://api.binance.com/api/v3/ticker/24hr',
    'https://data-api.binance.vision/api/v3/ticker/24hr',
    'https://fapi.binance.com/fapi/v1/ticker/24hr',
  ];

  for (const endpoint of binanceEndpoints) {
    try {
      const bRes = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(6000),
      });
      if (bRes.ok) {
        const bList = await bRes.json();
        if (Array.isArray(bList) && bList.length > 0) {
          for (const t of bList) {
            const sym = (t.symbol || '').toUpperCase();
            if (!sym.endsWith('USDT')) continue;
            if (EXCLUDED_STABLE_SYMBOLS.has(sym)) continue;
            if (/(UP|DOWN|BEAR|BULL)USDT$/.test(sym)) continue;

            const lastPrice = parseFloat(t.lastPrice);
            const turnover24h = parseFloat(t.quoteVolume || 0);

            // Strictly filter for impressive active volume (>= $5M USD 24h turnover)
            if (!Number.isFinite(lastPrice) || lastPrice <= 0 || turnover24h < 5_000_000) continue;

            binanceTickers.push({
              symbol: sym,
              lastPrice,
              turnover24h,
            });
          }
          if (binanceTickers.length > 0) {
            break; // Successfully loaded from this endpoint
          }
        }
      }
    } catch (e) {
      // Try next endpoint
    }
  }

  binanceTickers.sort((a, b) => b.turnover24h - a.turnover24h);
  const tickerInfoMap = new Map();
  binanceTickers.forEach((t, idx) => {
    if (!tickerInfoMap.has(t.symbol)) {
      tickerInfoMap.set(t.symbol, { ...t, volumeRank: idx + 1 });
    }
  });

  const merged = new Map();

  // Guarantee Majors + full curated ALTS_WHITELIST first
  for (const coin of ALTS_WHITELIST) {
    const tk = tickerInfoMap.get(coin.symbol);
    merged.set(coin.symbol, {
      assetType: 'crypto',
      symbol: coin.symbol,
      displaySymbol: coin.displaySymbol,
      name: coin.name,
      decimals: coin.decimals ?? inferDecimals(tk?.lastPrice || coin.yo, 4),
      lastPrice: tk?.lastPrice || null,
      turnover24h: tk?.turnover24h || 0,
      volumeRank: tk?.volumeRank || null,
      isMajor: MAJOR_SYMBOLS.includes(coin.symbol),
      isWatchlist: true,
      tvSymbol: `BINANCE:${coin.symbol}`,
    });
  }

  // Expand cleanly up to targetCount with top actively traded Binance coins
  for (const t of binanceTickers) {
    if (merged.size >= targetCount) break;
    if (merged.has(t.symbol)) continue;
    const wl = WHITELIST_MAP.get(t.symbol);
    merged.set(t.symbol, {
      assetType: 'crypto',
      symbol: t.symbol,
      displaySymbol: wl?.displaySymbol || formatDisplaySymbol(t.symbol),
      name: wl?.name || t.symbol.replace(/^1000/, '').replace(/USDT$/, ''),
      decimals: wl?.decimals ?? inferDecimals(t.lastPrice, 4),
      lastPrice: t.lastPrice,
      turnover24h: t.turnover24h,
      volumeRank: tickerInfoMap.get(t.symbol)?.volumeRank || null,
      isMajor: MAJOR_SYMBOLS.includes(t.symbol),
      isWatchlist: Boolean(wl),
      tvSymbol: `BINANCE:${t.symbol}`,
    });
  }

  return Array.from(merged.values());
}

/**
 * Fetch crypto klines from Binance Vision API with Bybit Linear fallback
 */
async function fetchCryptoKlineSeries(symbol, interval, limit) {
  const bIntervalMap = { '60': '1h', '240': '4h', '720': '12h', D: '1d' };
  const bInterval = bIntervalMap[interval] || '1h';

  // 1. Binance Vision
  try {
    const bRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfConfluenceScanner/2.0' },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (bRes.ok) {
      const bList = await bRes.json();
      if (Array.isArray(bList) && bList.length > 0) {
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

  // 2. Bybit Linear Fallback
  try {
    const bybitIntervalMap = { '60': '60', '240': '240', '720': '720', D: 'D' };
    const byInterval = bybitIntervalMap[interval] || '60';
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${byInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfConfluenceScanner/2.0' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.result?.list) && json.result.list.length > 0) {
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

  return null;
}

/**
 * Fetch Forex 1h and 1d Klines from Yahoo Finance
 * Returns clean candles with synthetic volume if volume is 0
 */
async function fetchForexKlineSeries(yfSymbol) {
  const hosts = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `${host}/v8/finance/chart/${yfSymbol}?interval=1h&range=60d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result || !Array.isArray(result.timestamp) || result.timestamp.length === 0) continue;

      const timestamps = result.timestamp;
      const q = result.indicators?.quote?.[0];
      if (!q) continue;

      const candles1h = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        const v = q.volume?.[i];
        if (o != null && h != null && l != null && c != null && !Number.isNaN(c) && c > 0) {
          candles1h.push({
            time: timestamps[i] * 1000,
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(c),
            vol: Number(v && v > 0 ? v : 1), // synthetic volume 1 so VWAP weights properly
          });
        }
      }
      if (candles1h.length >= 200) {
        return candles1h;
      }
    } catch (e) {
      // try next host
    }
  }
  return null;
}

/**
 * Exact TradingView SMA-seeded Exponential Moving Average
 */
export function calculateEMASeries(closes, period = 200) {
  if (!closes || closes.length < period) return null;
  const out = new Array(closes.length).fill(null);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;
  out[period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Compute EMA 200 and 200-MAR lead ribbon bias (ma05 vs ma200 + slope)
 */
export function calculateEMA200AndRibbon(candles) {
  if (!candles || candles.length < 200) return null;
  const closes = candles.map((c) => c.close);
  const ema200Series = calculateEMASeries(closes, 200);
  const ema05Series = calculateEMASeries(closes, 5);
  if (!ema200Series || !ema05Series) return null;

  const lastIdx = candles.length - 1;
  const ema200 = ema200Series[lastIdx];
  const prevEma200 = ema200Series[lastIdx - 1];
  const ema05 = ema05Series[lastIdx];
  const prevEma05 = ema05Series[lastIdx - 1];
  if (!Number.isFinite(ema200) || ema200 <= 0) return null;

  // Match TradingView leadMAColor from user's 200-EMA Ribbon Pine Script
  const ma05Change = prevEma05 !== null ? ema05 - prevEma05 : 0;
  let ribbonColor = 'gray';
  let ribbonLabel = 'Neutral';
  if (ma05Change >= 0 && ema05 > ema200) {
    ribbonColor = 'lime';
    ribbonLabel = 'Bull Expansion (Lime)';
  } else if (ma05Change < 0 && ema05 > ema200) {
    ribbonColor = 'maroon';
    ribbonLabel = 'Bull Pullback (Maroon)';
  } else if (ma05Change <= 0 && ema05 < ema200) {
    ribbonColor = 'red';
    ribbonLabel = 'Bear Expansion (Red)';
  } else if (ma05Change >= 0 && ema05 < ema200) {
    ribbonColor = 'green';
    ribbonLabel = 'Bear Bounce (Green)';
  }

  return {
    ema200,
    prevEma200,
    ema05,
    ribbonColor,
    ribbonLabel,
    emaSlopePct:
      prevEma200 > 0 ? Number((((ema200 - prevEma200) / prevEma200) * 100).toFixed(3)) : 0,
  };
}

/**
 * Compute UTC calendar anchor boundaries (Week, Month, Quarter, Year) matching TradingView VWAP
 */
export function getVwapAnchorTimestamps(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const utcDow = d.getUTCDay();
  const daysSinceMon = utcDow === 0 ? 6 : utcDow - 1;

  return {
    week: Date.UTC(y, m, day - daysSinceMon, 0, 0, 0, 0),
    month: Date.UTC(y, m, 1, 0, 0, 0, 0),
    quarter: Date.UTC(y, Math.floor(m / 3) * 3, 1, 0, 0, 0, 0),
    year: Date.UTC(y, 0, 1, 0, 0, 0, 0),
  };
}

/**
 * Calculate TradingView-compatible Anchored VWAP (src = hlc3 = (H + L + C) / 3)
 */
function computeAnchoredVwap(anchorStart, candlesTf, candles4h, candles12h) {
  if (!candlesTf || candlesTf.length === 0) return null;

  let cumPV = 0;
  let cumVol = 0;
  const tfStart = candlesTf[0].time;

  if (anchorStart < tfStart) {
    const start4h = candles4h && candles4h.length > 0 ? candles4h[0].time : tfStart;
    if (anchorStart < start4h && candles12h && candles12h.length > 0) {
      const upper12h = Math.min(start4h, tfStart);
      for (const b of candles12h) {
        if (b.time >= anchorStart && b.time < upper12h && b.vol > 0) {
          const hlc3 = (b.high + b.low + b.close) / 3;
          cumPV += hlc3 * b.vol;
          cumVol += b.vol;
        }
      }
    }

    if (candles4h && candles4h.length > 0 && tfStart > candles4h[0].time) {
      for (const b of candles4h) {
        if (b.time >= anchorStart && b.time < tfStart && b.vol > 0) {
          const hlc3 = (b.high + b.low + b.close) / 3;
          cumPV += hlc3 * b.vol;
          cumVol += b.vol;
        }
      }
    }
  }

  for (const b of candlesTf) {
    if (b.time >= anchorStart && b.vol > 0) {
      const hlc3 = (b.high + b.low + b.close) / 3;
      cumPV += hlc3 * b.vol;
      cumVol += b.vol;
    }
  }

  return cumVol > 0 ? cumPV / cumVol : null;
}

/**
 * Analyze an asset (Crypto or Forex) across 1h, 2h, 3h, 4h for EMA 200 x Anchored VWAP confluence
 * Computes exact ATR14, ATR%, price difference, and pip difference in accordance with its price.
 */
export function analyzeAssetConfluence(
  asset,
  candles1h,
  candles4h,
  candles12h,
  nowMs = Date.now()
) {
  if (!candles1h || candles1h.length < 200) {
    return null;
  }

  const candles2h = aggregateCandlesByMinutes(candles1h, 120, 2);
  const candles3h = aggregateCandlesByMinutes(candles1h, 180, 3);
  const candles4hFinal =
    candles4h && candles4h.length >= 200
      ? candles4h
      : aggregateCandlesByMinutes(candles1h, 240, 4);

  const tfSeriesMap = {
    '1h': candles1h,
    '2h': candles2h,
    '3h': candles3h,
    '4h': candles4hFinal,
  };

  const spot =
    candles1h[candles1h.length - 1]?.close ||
    candles4hFinal[candles4hFinal.length - 1]?.close ||
    asset.lastPrice;
  if (!Number.isFinite(spot) || spot <= 0) return null;

  const decimals = asset.decimals ?? inferDecimals(spot, asset.assetType === 'forex' ? 4 : 4);
  const anchors = getVwapAnchorTimestamps(nowMs);
  const pipMultiplier = asset.pipMultiplier || (decimals >= 4 ? 10000 : 100);

  const timeframes = {};
  const alignedTimeframes = [];

  for (const tfId of CONFLUENCE_TIMEFRAMES) {
    const tfCandles = tfSeriesMap[tfId];
    if (!tfCandles || tfCandles.length < 200) continue;

    const emaInfo = calculateEMA200AndRibbon(tfCandles);
    if (!emaInfo) continue;

    // Calculate Wilder's 14-period ATR on this timeframe
    const atrVal = calculateATR(tfCandles, 14);
    const atrPct =
      atrVal !== null && spot > 0 ? Number(((atrVal / spot) * 100).toFixed(2)) : null;

    const vwaps = {};
    const alignedVwaps = [];

    for (const anchorKey of VWAP_ANCHORS) {
      const vwapVal = computeAnchoredVwap(
        anchors[anchorKey],
        tfCandles,
        candles4hFinal,
        candles12h
      );
      vwaps[anchorKey] = vwapVal;

      if (Number.isFinite(vwapVal) && vwapVal > 0) {
        const spreadPct = Number(
          ((Math.abs(emaInfo.ema200 - vwapVal) / emaInfo.ema200) * 100).toFixed(2)
        );
        if (spreadPct <= MAX_STORED_SPREAD_PCT) {
          alignedVwaps.push({
            anchor: anchorKey,
            label: VWAP_LABELS[anchorKey],
            shortLabel: VWAP_SHORT_LABELS[anchorKey],
            price: vwapVal,
            spreadPct,
          });
        }
      }
    }

    alignedVwaps.sort((a, b) => a.spreadPct - b.spreadPct);

    const tightestSpreadPct = alignedVwaps.length > 0 ? alignedVwaps[0].spreadPct : null;
    const clusterPrices = [emaInfo.ema200, ...alignedVwaps.map((v) => v.price)];
    const clusterLow = Math.min(...clusterPrices);
    const clusterHigh = Math.max(...clusterPrices);
    const clusterMid = (clusterLow + clusterHigh) / 2;

    // Distance metrics in accordance with its price
    const absDiffPrice = Number(Math.abs(spot - clusterMid).toFixed(decimals));
    const distFromSpotPct = Number((((clusterMid - spot) / spot) * 100).toFixed(2));
    const absSpotDistPct = Number(Math.abs(distFromSpotPct).toFixed(2));
    const cmpDistAtr =
      atrVal && atrVal > 0 ? Number((absDiffPrice / atrVal).toFixed(2)) : null;
    const cmpDistPips =
      asset.assetType === 'forex' ? Number((absDiffPrice * pipMultiplier).toFixed(1)) : null;

    // Volatility-aware testing zone (within 1.2% or within 0.5x ATR)
    const isTesting =
      cmpDistAtr !== null ? cmpDistAtr <= 0.6 : absSpotDistPct <= (asset.assetType === 'forex' ? 0.35 : 1.5);

    const zoneRole = isTesting
      ? 'TESTING'
      : distFromSpotPct > 0
      ? 'RESISTANCE'
      : 'SUPPORT';

    const tfEntry = {
      timeframe: tfId,
      ema200: emaInfo.ema200,
      ema05: emaInfo.ema05,
      ribbonColor: emaInfo.ribbonColor,
      ribbonLabel: emaInfo.ribbonLabel,
      emaSlopePct: emaInfo.emaSlopePct,
      atr: atrVal,
      atrPct,
      vwaps,
      alignedVwaps,
      alignedCount: alignedVwaps.length,
      alignedIndicatorCount: alignedVwaps.length > 0 ? 1 + alignedVwaps.length : 0,
      tightestSpreadPct,
      clusterLow,
      clusterHigh,
      clusterMid,
      absDiffPrice,
      distFromSpotPct,
      absSpotDistPct,
      cmpDistAtr,
      cmpDistPips,
      zoneRole,
    };

    timeframes[tfId] = tfEntry;

    if (alignedVwaps.length > 0) {
      alignedTimeframes.push(tfEntry);
    }
  }

  alignedTimeframes.sort((a, b) => {
    if (b.alignedIndicatorCount !== a.alignedIndicatorCount) {
      return b.alignedIndicatorCount - a.alignedIndicatorCount;
    }
    return (a.tightestSpreadPct ?? 99) - (b.tightestSpreadPct ?? 99);
  });

  const bestMatch = alignedTimeframes[0] || null;
  const maxIndicatorStack = bestMatch ? bestMatch.alignedIndicatorCount : 0;
  const minSpreadPct =
    alignedTimeframes.length > 0
      ? Math.min(...alignedTimeframes.map((m) => m.tightestSpreadPct ?? 99))
      : null;

  // Nearest context for majors
  let nearestContext = null;
  if (!bestMatch) {
    const prefOrder = ['4h', '1h', '2h', '3h'];
    for (const tfId of prefOrder) {
      const tf = timeframes[tfId];
      if (!tf) continue;
      let bestAnchor = null;
      let bestPct = Infinity;
      for (const anchorKey of VWAP_ANCHORS) {
        const vv = tf.vwaps?.[anchorKey];
        if (!Number.isFinite(vv) || vv <= 0) continue;
        const pct = Math.abs((tf.ema200 - vv) / tf.ema200) * 100;
        if (pct < bestPct) {
          bestPct = pct;
          bestAnchor = { anchor: anchorKey, shortLabel: VWAP_SHORT_LABELS[anchorKey], price: vv };
        }
      }
      if (bestAnchor) {
        nearestContext = {
          timeframe: tfId,
          ema200: tf.ema200,
          vwapLabel: bestAnchor.shortLabel,
          vwapPrice: bestAnchor.price,
          spreadPct: Number(bestPct.toFixed(2)),
        };
        break;
      }
    }
  }

  // Ranking score
  let score = 0;
  if (bestMatch) {
    score += maxIndicatorStack * 100;
    score += Math.max(0, 40 - (minSpreadPct || 0) * 12);
    if (bestMatch.cmpDistAtr !== null && bestMatch.cmpDistAtr <= 0.5) score += 30;
    else if (bestMatch.absSpotDistPct <= 1.5) score += 20;
    if (asset.isMajor) score += 10;
  }

  return {
    assetType: asset.assetType || 'crypto',
    symbol: asset.symbol,
    displaySymbol: asset.displaySymbol || asset.symbol,
    name: asset.name,
    decimals,
    pipMultiplier,
    isMajor: Boolean(asset.isMajor),
    isWatchlist: Boolean(asset.isWatchlist),
    volumeRank: asset.volumeRank || null,
    turnover24h: asset.turnover24h || 0,
    price: spot,
    tvSymbol: asset.tvSymbol || `BINANCE:${asset.symbol}`,
    hasConfluence: alignedTimeframes.length > 0,
    matchingTimeframes: alignedTimeframes.map((m) => m.timeframe),
    bestMatch,
    alignedMatches: alignedTimeframes,
    maxIndicatorStack,
    minSpreadPct,
    nearestContext,
    timeframes,
    score: Number(score.toFixed(1)),
  };
}

/**
 * Scan top actively traded Binance linear perpetuals AND liquid Forex pairs across 1h, 2h, 3h, 4h
 */
export async function scanAllEmaVwapConfluence() {
  const scanTime = Date.now();
  const allAssets = [];

  // 1. Scan Top Actively Traded Binance Crypto
  const cryptoUniverse = await fetchTopBinanceCoins(TARGET_SCAN_COINS);
  const BATCH_SIZE = 10;

  for (let i = 0; i < cryptoUniverse.length; i += BATCH_SIZE) {
    const batch = cryptoUniverse.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (coin) => {
      const [candles1h, candles4h, candles12h] = await Promise.all([
        fetchCryptoKlineSeries(coin.symbol, '60', 1000),
        fetchCryptoKlineSeries(coin.symbol, '240', 600),
        fetchCryptoKlineSeries(coin.symbol, '720', 750),
      ]);
      return analyzeAssetConfluence(coin, candles1h, candles4h, candles12h, scanTime);
    });

    const settled = await Promise.allSettled(promises);
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        allAssets.push(r.value);
      }
    }
  }

  // 2. Scan Forex Pairs (EUR/USD, NZD/USD, EUR/NZD, USD/CAD, Gold, etc.)
  const FX_BATCH = 4;
  for (let i = 0; i < FOREX_PAIRS.length; i += FX_BATCH) {
    const fxBatch = FOREX_PAIRS.slice(i, i + FX_BATCH);
    const fxPromises = fxBatch.map(async (fx) => {
      const candles1h = await fetchForexKlineSeries(fx.yfSymbol);
      if (!candles1h) return null;
      return analyzeAssetConfluence(
        {
          ...fx,
          assetType: 'forex',
          decimals: fx.pipDecimals || 4,
          isMajor: fx.symbol === 'EURUSD' || fx.symbol === 'GBPUSD' || fx.symbol === 'USDJPY',
          isWatchlist: true,
        },
        candles1h,
        null, // will aggregate 4h and 12h cleanly from 1h
        null,
        scanTime
      );
    });

    const fxSettled = await Promise.allSettled(fxPromises);
    for (const r of fxSettled) {
      if (r.status === 'fulfilled' && r.value) {
        allAssets.push(r.value);
      }
    }
  }

  allAssets.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.volumeRank || 999) - (b.volumeRank || 999);
  });

  const alignedCoins = allAssets.filter((c) => c.hasConfluence);
  const cryptoAligned = alignedCoins.filter((c) => c.assetType === 'crypto');
  const forexAligned = alignedCoins.filter((c) => c.assetType === 'forex');

  const majorsContext = MAJOR_SYMBOLS.map((sym) =>
    allAssets.find((c) => c.symbol === sym)
  ).filter(Boolean);

  return {
    engineVersion: CONFLUENCE_ENGINE_VERSION,
    scanTime,
    totalUniverse: cryptoUniverse.length + FOREX_PAIRS.length,
    totalScanned: allAssets.length,
    cryptoCount: cryptoUniverse.length,
    forexCount: FOREX_PAIRS.length,
    alignedCount: alignedCoins.length,
    alignedCryptoCount: cryptoAligned.length,
    alignedForexCount: forexAligned.length,
    tightCount: alignedCoins.filter((c) => (c.minSpreadPct ?? 99) <= 1.0).length,
    stackedCount: alignedCoins.filter((c) => c.maxIndicatorStack >= 3).length,
    maxStoredSpreadPct: MAX_STORED_SPREAD_PCT,
    monitoredTimeframes: CONFLUENCE_TIMEFRAMES,
    vwapAnchors: VWAP_ANCHORS,
    majorsContext,
    alignedCoins,
    allCoinsCount: allAssets.length,
  };
}
