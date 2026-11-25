import { NextResponse } from 'next/server';
import { fetchBinanceKlines } from '@/lib/pivotEngine';
import { runFractalFinder, FRACTAL_ENGINE_VERSION } from '@/lib/fractalEngine';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? '/tmp'
    : process.cwd();
const CACHE_FILE = path.join(DATA_DIR, '.fractal-finder.json');

const ALLOWED_INTERVALS = new Set(['1h', '4h', '1d']);
const memoryCache = new Map();
const inFlightMap = new Map();

const CACHE_TTL_MS = 10 * 60 * 1000;
const FORCE_THROTTLE_MS = 60 * 1000;

function readDiskStore() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) || {};
    }
  } catch {}
  return {};
}

function persistKey(key, data) {
  memoryCache.set(key, data);
  try {
    const existing = readDiskStore();
    existing[key] = data;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(existing), 'utf-8');
  } catch {}
}

function loadCachedKey(key) {
  const mem = memoryCache.get(key);
  if (mem && mem.engineVersion === FRACTAL_ENGINE_VERSION) return mem;

  const disk = readDiskStore();
  const entry = disk?.[key];
  if (entry && entry.engineVersion === FRACTAL_ENGINE_VERSION) {
    memoryCache.set(key, entry);
    return entry;
  }
  return null;
}

async function runScan(key, opts) {
  if (inFlightMap.has(key)) return inFlightMap.get(key);
  const promise = (async () => {
    const candles = await fetchBinanceKlines(opts.symbol, opts.interval, opts.limit);
    const result = runFractalFinder(candles, {
      windowLen: opts.windowLen,
      forwardLen: opts.forwardLen,
      k: opts.k,
    });
    const withMeta = { ...result, lastUpdated: Date.now(), symbol: opts.symbol };
    persistKey(key, withMeta);
    return withMeta;
  })();
  inFlightMap.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightMap.delete(key);
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';
    const rawSym = searchParams.get('symbol') || 'BTCUSDT';
    const symbol = rawSym.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
    const rawInt = searchParams.get('interval') || '1d';
    const interval = ALLOWED_INTERVALS.has(rawInt) ? rawInt : '1d';
    const limit = Math.max(200, Math.min(parseInt(searchParams.get('limit') || '2000', 10) || 2000, 3000));
    const windowLen = Math.max(7, Math.min(parseInt(searchParams.get('window') || '30', 10) || 30, 90));
    const forwardLen = Math.max(7, Math.min(parseInt(searchParams.get('forward') || '30', 10) || 30, 90));
    const k = Math.max(1, Math.min(parseInt(searchParams.get('k') || '5', 10) || 5, 10));

    const cacheKey = `${symbol}:${interval}:${limit}:${windowLen}:${forwardLen}:${k}`;
    const cached = loadCachedKey(cacheKey);
    const ageMs = cached ? Date.now() - (cached.lastUpdated || 0) : Infinity;
    const isStale = !cached || !cached.topMatches || ageMs >= CACHE_TTL_MS;
    const forceSafe = force && ageMs >= FORCE_THROTTLE_MS;

    if (!force && !isStale) {
      return NextResponse.json({ success: true, fromCache: true, data: cached });
    }

    if (forceSafe || isStale) {
      const result = await runScan(cacheKey, {
        symbol,
        interval,
        limit,
        windowLen,
        forwardLen,
        k,
      });
      return NextResponse.json({ success: true, fromCache: false, data: result });
    }

    return NextResponse.json({ success: true, fromCache: true, throttled: true, data: cached });
  } catch (err) {
    if (err?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw err;
    console.error('Fractal Finder API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
