import { NextResponse } from 'next/server';
import {
  scanAllMondayRanges,
  MR_TIMEFRAMES,
  MONDAY_RANGE_ENGINE_VERSION,
} from '@/lib/mondayRangeEngine';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? '/tmp'
    : process.cwd();
const STATUS_FILE = path.join(DATA_DIR, '.monday-range-status.json');

let inMemoryCache = null;
let lastScanTime = 0;
let inFlightScanPromise = null;

const CACHE_TTL_MS = 60 * 1000; // 1-minute hot memory cache
const SCAN_FRESH_MS = 5 * 60 * 1000; // 5-minute automated rescan cadence
const EXPLICIT_THROTTLE_MS = 30 * 1000;

function persistStatus(data) {
  inMemoryCache = data;
  lastScanTime = data?.lastScanTime || Date.now();
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data), 'utf-8');
  } catch (e) {
    console.warn('Failed to write .monday-range-status.json:', e.message);
  }
}

function loadStatus() {
  if (inMemoryCache && Date.now() - lastScanTime < CACHE_TTL_MS) {
    return inMemoryCache;
  }
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const raw = fs.readFileSync(STATUS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      inMemoryCache = parsed;
      lastScanTime = parsed.lastScanTime || Date.now();
      return parsed;
    }
  } catch (e) {}
  return null;
}

async function runMondayRangeScan() {
  if (inFlightScanPromise) {
    return inFlightScanPromise;
  }

  inFlightScanPromise = (async () => {
    const results = await scanAllMondayRanges();
    const statusObj = {
      ...results,
      lastScanTime: Date.now(),
    };
    persistStatus(statusObj);
    return statusObj;
  })();

  try {
    return await inFlightScanPromise;
  } finally {
    inFlightScanPromise = null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const force =
      searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    if (action === 'scan') {
      const cachedStatus = loadStatus();
      const cacheValid =
        !force &&
        cachedStatus &&
        cachedStatus.engineVersion === MONDAY_RANGE_ENGINE_VERSION &&
        Date.now() - (cachedStatus.lastScanTime || 0) < EXPLICIT_THROTTLE_MS;

      if (cacheValid) {
        return NextResponse.json({
          success: true,
          scannedNow: false,
          throttled: true,
          status: cachedStatus,
          timeframes: MR_TIMEFRAMES,
        });
      }

      const statusObj = await runMondayRangeScan();
      return NextResponse.json({
        success: true,
        scannedNow: true,
        status: statusObj,
        timeframes: MR_TIMEFRAMES,
      });
    }

    let cachedStatus = loadStatus();
    const isMissingOrStale =
      force ||
      !cachedStatus ||
      cachedStatus.engineVersion !== MONDAY_RANGE_ENGINE_VERSION ||
      !Array.isArray(cachedStatus.allCoins) ||
      cachedStatus.allCoins.length === 0 ||
      Date.now() - (cachedStatus.lastScanTime || 0) >= SCAN_FRESH_MS;

    if (isMissingOrStale) {
      cachedStatus = await runMondayRangeScan();
    }

    return NextResponse.json({
      success: true,
      status: cachedStatus,
      timeframes: MR_TIMEFRAMES,
    });
  } catch (error) {
    console.error('Monday Range API GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'scan_now') {
      const statusObj = await runMondayRangeScan();
      return NextResponse.json({
        success: true,
        status: statusObj,
        ...statusObj,
      });
    }

    return NextResponse.json(
      { success: false, message: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Monday Range API POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
