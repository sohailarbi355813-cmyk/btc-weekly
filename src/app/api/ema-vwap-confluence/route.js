import { NextResponse } from 'next/server';
import {
  scanAllEmaVwapConfluence,
  CONFLUENCE_ENGINE_VERSION,
  CONFLUENCE_TIMEFRAMES,
  VWAP_ANCHORS,
} from '@/lib/confluenceEngine';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? '/tmp'
    : process.cwd();
const STATUS_FILE = path.join(DATA_DIR, '.ema-vwap-confluence.json');

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
    console.warn('Failed to write .ema-vwap-confluence.json:', e.message);
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

async function runConfluenceScan() {
  if (inFlightScanPromise) {
    return inFlightScanPromise;
  }

  inFlightScanPromise = (async () => {
    const results = await scanAllEmaVwapConfluence();
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
        cachedStatus.engineVersion === CONFLUENCE_ENGINE_VERSION &&
        Array.isArray(cachedStatus.alignedCoins) &&
        typeof cachedStatus.totalScanned === 'number' &&
        cachedStatus.totalScanned > 0 &&
        Date.now() - (cachedStatus.lastScanTime || 0) < EXPLICIT_THROTTLE_MS;

      if (cacheValid) {
        return NextResponse.json({
          success: true,
          scannedNow: false,
          throttled: true,
          status: cachedStatus,
          timeframes: CONFLUENCE_TIMEFRAMES,
          vwapAnchors: VWAP_ANCHORS,
        });
      }

      const statusObj = await runConfluenceScan();
      return NextResponse.json({
        success: true,
        scannedNow: true,
        status: statusObj,
        timeframes: CONFLUENCE_TIMEFRAMES,
        vwapAnchors: VWAP_ANCHORS,
      });
    }

    let cachedStatus = loadStatus();
    const isMissingOrStale =
      force ||
      !cachedStatus ||
      cachedStatus.engineVersion !== CONFLUENCE_ENGINE_VERSION ||
      !Array.isArray(cachedStatus.alignedCoins) ||
      typeof cachedStatus.totalScanned !== 'number' ||
      cachedStatus.totalScanned === 0 ||
      Date.now() - (cachedStatus.lastScanTime || 0) >= SCAN_FRESH_MS;

    if (isMissingOrStale) {
      cachedStatus = await runConfluenceScan();
    }

    return NextResponse.json({
      success: true,
      status: cachedStatus,
      timeframes: CONFLUENCE_TIMEFRAMES,
      vwapAnchors: VWAP_ANCHORS,
    });
  } catch (error) {
    console.error('EMA-VWAP Confluence API GET error:', error);
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
      const statusObj = await runConfluenceScan();
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
    console.error('EMA-VWAP Confluence API POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
