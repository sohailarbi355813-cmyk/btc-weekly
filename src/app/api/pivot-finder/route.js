import { NextResponse } from 'next/server';
import { runPivotAnalysis, PIVOT_ENGINE_VERSION } from '@/lib/pivotEngine';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? '/tmp'
    : process.cwd();
const CACHE_FILE = path.join(DATA_DIR, '.pivot-finder.json');

const ALLOWED_INTERVALS = new Set(['15m', '1h', '4h', '1d']);
const memoryCache = new Map();
const inFlightMap = new Map();

const CACHE_TTL_MS = 5 * 60 * 1000;
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
  if (mem && mem.engineVersion === PIVOT_ENGINE_VERSION) return mem;

  const disk = readDiskStore();
  const entry = disk?.[key];
  if (entry && entry.engineVersion === PIVOT_ENGINE_VERSION) {
    memoryCache.set(key, entry);
    return entry;
  }
  return null;
}

async function runScan(key, opts) {
  if (inFlightMap.has(key)) return inFlightMap.get(key);
  const promise = (async () => {
    const result = await runPivotAnalysis(opts);
    persistKey(key, result);
    return result;
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
    const rawInt = searchParams.get('interval') || '4h';
    const interval = ALLOWED_INTERVALS.has(rawInt) ? rawInt : '4h';
    const limitParam = parseInt(searchParams.get('limit') || '0', 10);
    const limit = limitParam > 0 ? Math.max(200, Math.min(limitParam, 3000)) : undefined;
    const leftBars = Math.max(2, Math.min(parseInt(searchParams.get('left') || '5', 10) || 5, 20));
    const rightBars = Math.max(2, Math.min(parseInt(searchParams.get('right') || '5', 10) || 5, 20));
    const toleranceATR = Math.max(0.25, Math.min(parseFloat(searchParams.get('tol') || '1.0') || 1.0, 4.0));

    const cacheKey = `${symbol}:${interval}:${limit || 'auto'}:${leftBars}:${rightBars}:${toleranceATR}`;
    const cached = loadCachedKey(cacheKey);
    const ageMs = cached ? Date.now() - (cached.lastUpdated || 0) : Infinity;
    const isStale = !cached || !cached.high || ageMs >= CACHE_TTL_MS;
    const forceSafe = force && ageMs >= FORCE_THROTTLE_MS;

    if (!force && !isStale) {
      return NextResponse.json({ success: true, fromCache: true, data: cached });
    }

    if (forceSafe || isStale) {
      const result = await runScan(cacheKey, {
        symbol,
        interval,
        limit,
        leftBars,
        rightBars,
        toleranceATR,
      });
      return NextResponse.json({ success: true, fromCache: false, data: result });
    }

    return NextResponse.json({ success: true, fromCache: true, throttled: true, data: cached });
  } catch (err) {
    if (err?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw err;
    console.error('Pivot Finder API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
