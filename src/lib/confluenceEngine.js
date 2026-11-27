import { ALTS_WHITELIST, MAJOR_SYMBOLS, WHITELIST_MAP } from './altsData.js';
import { aggregateCandlesByMinutes } from './rsiScannerEngine.js';

export const CONFLUENCE_ENGINE_VERSION = 5;
export const CONFLUENCE_TIMEFRAMES = ['4h', '1d'];
export const MAX_FOREX_DISTANCE_PIPS = 300; // User cutoff: Forex setups > 300 pips from EMA200 / VWAP are disqualified
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

// 29 global FX currencies + metals backed by 28 verified Yahoo USD legs
const FX_CURRENCIES = {
  USD: { name: 'US Dollar',        yf: null,        invert: false, dec: 4, pipMult: 10000 },
  EUR: { name: 'Euro',             yf: 'EURUSD=X',  invert: false, dec: 4, pipMult: 10000 },
  GBP: { name: 'British Pound',    yf: 'GBPUSD=X',  invert: false, dec: 4, pipMult: 10000 },
  AUD: { name: 'Aussie',           yf: 'AUDUSD=X',  invert: false, dec: 4, pipMult: 10000 },
  NZD: { name: 'NZ Dollar',        yf: 'NZDUSD=X',  invert: false, dec: 4, pipMult: 10000 },
  CAD: { name: 'Canadian Dollar',  yf: 'USDCAD=X',  invert: true,  dec: 4, pipMult: 10000 },
  CHF: { name: 'Swiss Franc',      yf: 'USDCHF=X',  invert: true,  dec: 4, pipMult: 10000 },
  SGD: { name: 'Singapore Dollar', yf: 'USDSGD=X',  invert: true,  dec: 4, pipMult: 10000 },
  DKK: { name: 'Danish Krone',     yf: 'USDDKK=X',  invert: true,  dec: 4, pipMult: 10000 },
  NOK: { name: 'Norwegian Krone',  yf: 'USDNOK=X',  invert: true,  dec: 4, pipMult: 10000 },
  SEK: { name: 'Swedish Krona',    yf: 'USDSEK=X',  invert: true,  dec: 4, pipMult: 10000 },
  PLN: { name: 'Polish Zloty',     yf: 'USDPLN=X',  invert: true,  dec: 4, pipMult: 10000 },
  CZK: { name: 'Czech Koruna',     yf: 'USDCZK=X',  invert: true,  dec: 4, pipMult: 10000 },
  RON: { name: 'Romanian Leu',     yf: 'USDRON=X',  invert: true,  dec: 4, pipMult: 10000 },
  TRY: { name: 'Turkish Lira',     yf: 'USDTRY=X',  invert: true,  dec: 2, pipMult: 100 },
  BRL: { name: 'Brazilian Real',   yf: 'USDBRL=X',  invert: true,  dec: 4, pipMult: 10000 },
  ILS: { name: 'Israeli Shekel',   yf: 'USDILS=X',  invert: true,  dec: 4, pipMult: 10000 },
  SAR: { name: 'Saudi Riyal',      yf: 'USDSAR=X',  invert: true,  dec: 4, pipMult: 10000 },
  AED: { name: 'UAE Dirham',       yf: 'USDAED=X',  invert: true,  dec: 4, pipMult: 10000 },
  CNY: { name: 'Chinese Yuan',     yf: 'USDCNY=X',  invert: true,  dec: 4, pipMult: 10000 },
  HKD: { name: 'Hong Kong Dollar', yf: 'USDHKD=X',  invert: true,  dec: 4, pipMult: 10000 },
  MXN: { name: 'Mexican Peso',     yf: 'USDMXN=X',  invert: true,  dec: 4, pipMult: 10000 },
  ZAR: { name: 'South African Rand', yf: 'USDZAR=X', invert: true, dec: 4, pipMult: 10000 },
  THB: { name: 'Thai Baht',        yf: 'USDTHB=X',  invert: true,  dec: 2, pipMult: 100 },
  INR: { name: 'Indian Rupee',     yf: 'USDINR=X',  invert: true,  dec: 2, pipMult: 100 },
  JPY: { name: 'Japanese Yen',     yf: 'USDJPY=X',  invert: true,  dec: 2, pipMult: 100 },
  HUF: { name: 'Hungarian Forint', yf: 'USDHUF=X',  invert: true,  dec: 2, pipMult: 100 },
  XAU: { name: 'Gold',             yf: 'GC=F',      invert: false, dec: 2, pipMult: 10 },
  XAG: { name: 'Silver',           yf: 'SI=F',      invert: false, dec: 3, pipMult: 100 },
};

const CANONICAL_ORDER = [
  'XAU', 'XAG', 'EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF',
  'SGD', 'DKK', 'NOK', 'SEK', 'PLN', 'CZK', 'RON', 'TRY', 'BRL',
  'ILS', 'SAR', 'AED', 'CNY', 'HKD', 'MXN', 'ZAR', 'THB', 'INR',
  'JPY', 'HUF',
];

const CORE_14_FOREX = [
  { symbol: 'EURUSD', yfSymbol: 'EURUSD=X', displaySymbol: 'EUR/USD', name: 'Euro / US Dollar', base: 'EUR', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:EURUSD', directFetch: true },
  { symbol: 'NZDUSD', yfSymbol: 'NZDUSD=X', displaySymbol: 'NZD/USD', name: 'NZ Dollar / US Dollar', base: 'NZD', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:NZDUSD', directFetch: true },
  { symbol: 'EURNZD', yfSymbol: 'EURNZD=X', displaySymbol: 'EUR/NZD', name: 'Euro / NZ Dollar', base: 'EUR', quote: 'NZD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:EURNZD', directFetch: true },
  { symbol: 'USDCAD', yfSymbol: 'USDCAD=X', displaySymbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', base: 'USD', quote: 'CAD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:USDCAD', directFetch: true },
  { symbol: 'GBPUSD', yfSymbol: 'GBPUSD=X', displaySymbol: 'GBP/USD', name: 'British Pound / US Dollar', base: 'GBP', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:GBPUSD', directFetch: true },
  { symbol: 'USDJPY', yfSymbol: 'USDJPY=X', displaySymbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', base: 'USD', quote: 'JPY', pipDecimals: 2, pipMultiplier: 100, tvSymbol: 'FX:USDJPY', directFetch: true },
  { symbol: 'AUDUSD', yfSymbol: 'AUDUSD=X', displaySymbol: 'AUD/USD', name: 'Aussie / US Dollar', base: 'AUD', quote: 'USD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:AUDUSD', directFetch: true },
  { symbol: 'USDCHF', yfSymbol: 'USDCHF=X', displaySymbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', base: 'USD', quote: 'CHF', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:USDCHF', directFetch: true },
  { symbol: 'EURGBP', yfSymbol: 'EURGBP=X', displaySymbol: 'EUR/GBP', name: 'Euro / British Pound', base: 'EUR', quote: 'GBP', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:EURGBP', directFetch: true },
  { symbol: 'EURJPY', yfSymbol: 'EURJPY=X', displaySymbol: 'EUR/JPY', name: 'Euro / Japanese Yen', base: 'EUR', quote: 'JPY', pipDecimals: 2, pipMultiplier: 100, tvSymbol: 'FX:EURJPY', directFetch: true },
  { symbol: 'GBPJPY', yfSymbol: 'GBPJPY=X', displaySymbol: 'GBP/JPY', name: 'Pound / Japanese Yen', base: 'GBP', quote: 'JPY', pipDecimals: 2, pipMultiplier: 100, tvSymbol: 'FX:GBPJPY', directFetch: true },
  { symbol: 'AUDNZD', yfSymbol: 'AUDNZD=X', displaySymbol: 'AUD/NZD', name: 'Aussie / NZ Dollar', base: 'AUD', quote: 'NZD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:AUDNZD', directFetch: true },
  { symbol: 'AUDCAD', yfSymbol: 'AUDCAD=X', displaySymbol: 'AUD/CAD', name: 'Aussie / Canadian Dollar', base: 'AUD', quote: 'CAD', pipDecimals: 4, pipMultiplier: 10000, tvSymbol: 'FX:AUDCAD', directFetch: true },
  { symbol: 'XAUUSD', yfSymbol: 'GC=F',     displaySymbol: 'XAU/USD (Gold)', name: 'Gold / US Dollar', base: 'XAU', quote: 'USD', pipDecimals: 2, pipMultiplier: 10, tvSymbol: 'TVC:GOLD', directFetch: true },
];

function makeFxPair(a, b) {
  const [base, quote] =
    CANONICAL_ORDER.indexOf(a) < CANONICAL_ORDER.indexOf(b) ? [a, b] : [b, a];
  const sym = `${base}${quote}`;
  const bMeta = FX_CURRENCIES[base];
  const qMeta = FX_CURRENCIES[quote];
  let pipDecimals = qMeta.dec;
  let pipMultiplier = qMeta.pipMult;

  if (base === 'XAU') {
    pipDecimals = quote === 'JPY' ? 0 : 2;
    pipMultiplier = quote === 'JPY' ? 1 : 10;
  } else if (base === 'XAG') {
    pipDecimals = quote === 'JPY' ? 1 : 3;
    pipMultiplier = quote === 'JPY' ? 1 : 100;
  } else if (quote === 'JPY' && ['INR', 'THB', 'TRY', 'CZK', 'ZAR', 'MXN', 'SEK', 'NOK'].includes(base)) {
    pipDecimals = 3; // Preserve sub-pip precision on lower-value JPY crosses
  }

  return {
    symbol: sym,
    yfSymbol: sym === 'XAUUSD' ? 'GC=F' : sym === 'XAGUSD' ? 'SI=F' : `${sym}=X`,
    displaySymbol: base === 'XAU' ? `XAU/${quote} (Gold)` : base === 'XAG' ? `XAG/${quote} (Silver)` : `${base}/${quote}`,
    name: `${bMeta.name} / ${qMeta.name}`,
    base,
    quote,
    pipDecimals,
    pipMultiplier,
    tvSymbol: sym === 'XAUUSD' ? 'TVC:GOLD' : sym === 'XAGUSD' ? 'TVC:SILVER' : `FX_IDC:${sym}`,
  };
}

function buildForexUniverse(targetCount = 200) {
  const bySym = new Map();
  for (const p of CORE_14_FOREX) bySym.set(p.symbol, p);

  const add = (a, b) => {
    if (bySym.size >= targetCount || a === b) return;
    const item = makeFxPair(a, b);
    if (!bySym.has(item.symbol)) bySym.set(item.symbol, item);
  };

  const g10 = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  const europe = ['SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY'];
  const apac = ['SGD', 'HKD', 'CNY', 'INR', 'THB'];
  const emeaAmer = ['MXN', 'ZAR', 'BRL', 'ILS', 'SAR', 'AED'];
  const metals = ['XAU', 'XAG'];

  // 1. Complete 28 G10 crosses
  for (let i = 0; i < g10.length; i++) {
    for (let j = i + 1; j < g10.length; j++) add(g10[i], g10[j]);
  }
  // 2. European & Nordic vs G10 + intra-European pairs
  for (const c of europe) for (const g of g10) add(c, g);
  for (const [a, b] of [
    ['NOK', 'SEK'], ['NOK', 'DKK'], ['SEK', 'DKK'],
    ['PLN', 'CZK'], ['PLN', 'HUF'], ['CZK', 'HUF'],
    ['PLN', 'SEK'], ['PLN', 'NOK'], ['PLN', 'TRY'],
    ['SEK', 'TRY'], ['NOK', 'TRY'], ['SEK', 'HUF'],
  ]) add(a, b);
  // 3. Precious metals vs G10
  for (const m of metals) for (const g of g10) add(m, g);
  // 4. APAC vs G10 + SGD crosses
  for (const c of apac) for (const g of g10) add(c, g);
  for (const c of ['HKD', 'CNY', 'INR', 'THB', 'SEK', 'NOK', 'PLN', 'TRY', 'ZAR', 'MXN', 'BRL']) add('SGD', c);
  // 5. LatAm & EMEA vs G10 + EM crosses (filling cleanly up to 200 pairs)
  for (const c of emeaAmer) for (const g of g10) add(c, g);
  for (const [a, b] of [
    ['MXN', 'ZAR'], ['MXN', 'BRL'], ['ZAR', 'BRL'],
    ['ZAR', 'TRY'], ['MXN', 'TRY'], ['BRL', 'TRY'],
    ['ZAR', 'PLN'], ['ZAR', 'ILS'], ['ILS', 'TRY'],
    ['HKD', 'CNY'], ['CNY', 'INR'], ['THB', 'INR'],
  ]) add(a, b);

  return Array.from(bySym.values());
}

// 200 liquid Forex & Precious Metals pairs (Majors, G10 Crosses, Nordics, Europe, APAC, LatAm, EMEA)
export const FOREX_PAIRS = buildForexUniverse(200);

const EXCLUDED_STABLE_SYMBOLS = new Set([
  'USDCUSDT',
  'FDUSDUSDT',
  'BFUSDUSDT',
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
 * Fetch crypto klines from Binance API with Bybit Linear fallback
 */
async function fetchCryptoKlineSeries(symbol, interval, limit) {
  const bIntervalMap = { '60': '1h', '240': '4h', '720': '12h', D: '1d' };
  const bInterval = bIntervalMap[interval] || '1h';

  // 1. Primary: Binance Official Spot API (fastest ~200-700ms)
  // 2. Secondary: Binance Futures API
  // 3. Fallback: Binance Vision
  const binanceHosts = [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${bInterval}&limit=${limit}`,
  ];

  for (const ep of binanceHosts) {
    try {
      const bRes = await fetch(ep, {
        headers: { 'User-Agent': 'WolfConfluenceScanner/3.0' },
        signal: AbortSignal.timeout(3000),
      });
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
  }

  // 4. Bybit Linear Fallback
  try {
    const bybitIntervalMap = { '60': '60', '240': '240', '720': '720', D: 'D' };
    const byInterval = bybitIntervalMap[interval] || '60';
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${byInterval}&limit=${limit}`,
      {
        headers: { 'User-Agent': 'WolfConfluenceScanner/3.0' },
        signal: AbortSignal.timeout(3000),
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
 * Fetch Forex 1h Klines from Yahoo Finance (used to aggregate into 4h)
 * Returns clean candles with synthetic volume if volume is 0
 */
async function fetchForex1hKlineSeries(yfSymbol) {
  const hosts = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `${host}/v8/finance/chart/${yfSymbol}?interval=1h&range=60d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6500),
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
 * Fetch Forex Daily Klines from Yahoo Finance with Frankfurter ECB fallback
 */
async function fetchForexDailySeries(yfSymbol, base, quote) {
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `${host}/v8/finance/chart/${yfSymbol}?interval=1d&range=2y`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result || !Array.isArray(result.timestamp) || result.timestamp.length === 0) continue;

      const timestamps = result.timestamp;
      const q = result.indicators?.quote?.[0];
      if (!q) continue;

      const candles1d = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        const v = q.volume?.[i];
        if (o != null && h != null && l != null && c != null && !Number.isNaN(c) && c > 0) {
          candles1d.push({
            time: timestamps[i] * 1000,
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(c),
            vol: Number(v && v > 0 ? v : 1),
          });
        }
      }
      if (candles1d.length >= 200) {
        return candles1d;
      }
    } catch (e) {
      // try next host
    }
  }

  // Fallback to Frankfurter for supported currency pairs
  if (base && quote && base !== 'XAU') {
    try {
      const dNow = new Date();
      const endStr = dNow.toISOString().slice(0, 10);
      const startYear = dNow.getUTCFullYear() - 2;
      const startStr = `${startYear}-01-01`;
      const url = `https://api.frankfurter.app/${startStr}..${endStr}?from=${base}&to=${quote}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        const dates = Object.keys(json.rates || {}).sort();
        if (dates.length >= 200) {
          const candles1d = [];
          for (let i = 0; i < dates.length; i++) {
            const dt = dates[i];
            const rate = json.rates[dt]?.[quote];
            if (rate && Number.isFinite(rate)) {
              const time = new Date(dt + 'T00:00:00Z').getTime();
              candles1d.push({
                time,
                open: rate,
                high: rate,
                low: rate,
                close: rate,
                vol: 1,
              });
            }
          }
          if (candles1d.length >= 200) {
            return candles1d;
          }
        }
      }
    } catch (e) {}
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
 * Analyze an asset (Crypto or Forex) across 4H & 1D (Daily) for EMA 200 x Anchored VWAP confluence
 * Computes exact ATR14, ATR%, price difference, and pip difference in accordance with its price.
 * USER REQUIREMENT: Disqualifies any Forex pair where distance from CMP to confluence is > 300 pips.
 */
export function analyzeAssetConfluence(
  asset,
  candles4h,
  candles1d,
  candles12h,
  nowMs = Date.now()
) {
  if (!candles4h || candles4h.length < 200) {
    return null;
  }

  const tfSeriesMap = {
    '4h': candles4h,
  };
  if (candles1d && candles1d.length >= 200) {
    tfSeriesMap['1d'] = candles1d;
  }

  const spot =
    candles4h[candles4h.length - 1]?.close ||
    candles1d?.[candles1d.length - 1]?.close ||
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
        candles4h,
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

    // HARD CUTOFF: Disqualify any Forex setup > 300 pips from confluence zone!
    if (asset.assetType === 'forex' && (cmpDistPips === null || cmpDistPips > MAX_FOREX_DISTANCE_PIPS)) {
      continue;
    }

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
    const prefOrder = ['4h', '1d'];
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
 * Invert OHLC series when converting USD/CUR -> CUR/USD
 */
function invertForexCandles(candles) {
  if (!candles) return null;
  const out = [];
  for (const b of candles) {
    if (b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0) {
      out.push({
        time: b.time,
        open: 1 / b.open,
        high: 1 / b.low,
        low: 1 / b.high,
        close: 1 / b.close,
        vol: b.vol,
      });
    }
  }
  return out;
}

/**
 * Synthesize cross OHLC series BASE/QUOTE from USD-denominated legs (USD per 1 BASE & USD per 1 QUOTE)
 */
function synthesizeCrossCandles(baseUsdCandles, quoteUsdCandles, isDaily = false) {
  if (!baseUsdCandles || !quoteUsdCandles || baseUsdCandles.length < 200 || quoteUsdCandles.length < 200) {
    return null;
  }
  const keyFn = isDaily
    ? (t) => new Date(t).toISOString().slice(0, 10)
    : (t) => Math.floor(t / 3600000) * 3600000;

  const qMap = new Map();
  for (const q of quoteUsdCandles) {
    if (q.close > 0) qMap.set(keyFn(q.time), q);
  }

  const out = [];
  for (const a of baseUsdCandles) {
    const b = qMap.get(keyFn(a.time));
    if (!b || b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) continue;
    const o = a.open / b.open;
    const c = a.close / b.close;
    const h = Math.max(o, c, (a.high / b.close + a.close / b.low) / 2);
    const l = Math.min(o, c, (a.low / b.close + a.close / b.high) / 2);
    out.push({
      time: a.time,
      open: o,
      high: h,
      low: l,
      close: c,
      vol: 1,
    });
  }
  return out;
}

/**
 * Fetch Crypto + 200 Forex pairs in parallel (using 28 Yahoo USD legs + core direct crosses)
 * Strict cutoff: Forex pairs > 300 pips from EMA200 / VWAP confluence are disqualified
 */
export async function scanAllEmaVwapConfluence() {
  const scanTime = Date.now();
  const allAssets = [];

  const scanCrypto = async () => {
    const cryptoUniverse = await fetchTopBinanceCoins(TARGET_SCAN_COINS);
    const out = [];
    const BATCH_SIZE = 15;
    for (let i = 0; i < cryptoUniverse.length; i += BATCH_SIZE) {
      const batch = cryptoUniverse.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (coin) => {
        const [candles4h, candles1d] = await Promise.all([
          fetchCryptoKlineSeries(coin.symbol, '240', 500),
          fetchCryptoKlineSeries(coin.symbol, 'D', 365),
        ]);
        return analyzeAssetConfluence(coin, candles4h, candles1d, null, scanTime);
      });
      const settled = await Promise.allSettled(promises);
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) out.push(r.value);
      }
    }
    return { cryptoUniverse, out };
  };

  const scanForex = async () => {
    // Warm up Yahoo DNS/TLS once to avoid initial-batch timeouts
    await fetch('https://query2.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1h&range=5d', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});

    // 1. Fetch the 28 USD base legs + 6 non-USD core G10 crosses in parallel batches
    const legKeys = Object.keys(FX_CURRENCIES).filter((c) => FX_CURRENCIES[c].yf);
    const directNonUsdPairs = CORE_14_FOREX.filter(
      (p) => p.base !== 'USD' && p.quote !== 'USD'
    );

    const rawUsd1h = new Map();
    const rawUsd1d = new Map();
    const usdPerCur1h = new Map();
    const usdPerCur1d = new Map();

    const LEG_BATCH = 7;
    for (let i = 0; i < legKeys.length; i += LEG_BATCH) {
      const batch = legKeys.slice(i, i + LEG_BATCH);
      await Promise.allSettled(
        batch.map(async (cur) => {
          const meta = FX_CURRENCIES[cur];
          const baseCode = meta.invert ? 'USD' : cur;
          const quoteCode = meta.invert ? cur : 'USD';
          const [c1h, c1d] = await Promise.all([
            fetchForex1hKlineSeries(meta.yf),
            fetchForexDailySeries(meta.yf, baseCode, quoteCode),
          ]);
          if (c1h) {
            rawUsd1h.set(meta.yf, c1h);
            usdPerCur1h.set(cur, meta.invert ? invertForexCandles(c1h) : c1h);
          }
          if (c1d) {
            rawUsd1d.set(meta.yf, c1d);
            usdPerCur1d.set(cur, meta.invert ? invertForexCandles(c1d) : c1d);
          }
        })
      );
    }

    // Retry any missed leg once cleanly so full 200-pair coverage stays consistent
    const missedLegs = legKeys.filter((cur) => !usdPerCur1h.has(cur) || !usdPerCur1d.has(cur));
    if (missedLegs.length > 0 && missedLegs.length <= 10) {
      await Promise.allSettled(
        missedLegs.map(async (cur) => {
          const meta = FX_CURRENCIES[cur];
          const baseCode = meta.invert ? 'USD' : cur;
          const quoteCode = meta.invert ? cur : 'USD';
          if (!usdPerCur1h.has(cur)) {
            const c1h = await fetchForex1hKlineSeries(meta.yf);
            if (c1h) {
              rawUsd1h.set(meta.yf, c1h);
              usdPerCur1h.set(cur, meta.invert ? invertForexCandles(c1h) : c1h);
            }
          }
          if (!usdPerCur1d.has(cur)) {
            const c1d = await fetchForexDailySeries(meta.yf, baseCode, quoteCode);
            if (c1d) {
              rawUsd1d.set(meta.yf, c1d);
              usdPerCur1d.set(cur, meta.invert ? invertForexCandles(c1d) : c1d);
            }
          }
        })
      );
    }

    // Fetch non-USD core G10 pairs directly so original benchmarks stay identical
    const directMap = new Map();
    await Promise.allSettled(
      directNonUsdPairs.map(async (fx) => {
        const [c1h, c1d] = await Promise.all([
          fetchForex1hKlineSeries(fx.yfSymbol),
          fetchForexDailySeries(fx.yfSymbol, fx.base, fx.quote),
        ]);
        directMap.set(fx.symbol, { c1h, c1d });
      })
    );

    // 2. Analyze all 200 Forex pairs cleanly
    const out = [];
    for (const fx of FOREX_PAIRS) {
      let candles1h = null;
      let candles1d = null;

      if (directMap.has(fx.symbol)) {
        const d = directMap.get(fx.symbol);
        candles1h = d.c1h;
        candles1d = d.c1d;
      } else if (fx.quote === 'USD' || fx.base === 'USD') {
        candles1h = rawUsd1h.get(fx.yfSymbol) || null;
        candles1d = rawUsd1d.get(fx.yfSymbol) || null;
      }

      // Fallback or cross synthesis from USD-per-unit series
      if (!candles1h) {
        if (fx.base === 'USD' && usdPerCur1h.has(fx.quote)) {
          candles1h = invertForexCandles(usdPerCur1h.get(fx.quote));
        } else if (fx.quote === 'USD' && usdPerCur1h.has(fx.base)) {
          candles1h = usdPerCur1h.get(fx.base);
        } else {
          candles1h = synthesizeCrossCandles(
            usdPerCur1h.get(fx.base),
            usdPerCur1h.get(fx.quote),
            false
          );
        }
      }
      if (!candles1d) {
        if (fx.base === 'USD' && usdPerCur1d.has(fx.quote)) {
          candles1d = invertForexCandles(usdPerCur1d.get(fx.quote));
        } else if (fx.quote === 'USD' && usdPerCur1d.has(fx.base)) {
          candles1d = usdPerCur1d.get(fx.base);
        } else {
          candles1d = synthesizeCrossCandles(
            usdPerCur1d.get(fx.base),
            usdPerCur1d.get(fx.quote),
            true
          );
        }
      }

      if (!candles1h || candles1h.length < 200) continue;
      const candles4h = aggregateCandlesByMinutes(candles1h, 240, 4);
      const analyzed = analyzeAssetConfluence(
        {
          ...fx,
          assetType: 'forex',
          decimals: fx.pipDecimals ?? 4,
          isMajor: fx.symbol === 'EURUSD' || fx.symbol === 'GBPUSD' || fx.symbol === 'USDJPY',
          isWatchlist: true,
        },
        candles4h,
        candles1d,
        null,
        scanTime
      );
      if (analyzed) out.push(analyzed);
    }

    return out;
  };

  const [{ cryptoUniverse, out: cryptoResults }, forexResults] = await Promise.all([
    scanCrypto(),
    scanForex(),
  ]);

  allAssets.push(...cryptoResults, ...forexResults);

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
