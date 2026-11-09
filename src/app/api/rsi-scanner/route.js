import { NextResponse } from 'next/server';
import {
  scanAllAltsRSI,
  filterCooldownAlerts,
  purgeOldCooldowns,
  getDiscordWebhookUrl,
  SCAN_TIMEFRAMES,
  RSI_SCANNER_ENGINE_VERSION,
} from '@/lib/rsiScannerEngine';
import { sendDiscordRsiAlerts, sendTestDiscordAlert } from '@/lib/discordNotifier';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

const DATA_DIR = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) ? '/tmp' : process.cwd();
const STATUS_FILE = path.join(DATA_DIR, '.rsi-scanner-status.json');
const CONFIG_FILE = path.join(DATA_DIR, '.rsi-scanner-config.json');

let inMemoryCache = null;
let lastScanTime = 0;
let inFlightScanPromise = null;

const CACHE_TTL_MS = 60 * 1000; // 1-minute hot read cache
const SCAN_FRESH_MS = 5 * 60 * 1000; // 5-minute automated rescan + alert cadence
const EXPLICIT_THROTTLE_MS = 30 * 1000; // avoid repeat external ?action=scan bursts within 30s

function persistStatus(data) {
  inMemoryCache = data;
  lastScanTime = data?.lastScanTime || Date.now();
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to write .rsi-scanner-status.json:', e.message);
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

function loadSavedTerritory() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (['overbought', 'oversold', 'both'].includes(parsed?.territory)) {
        return parsed.territory;
      }
    }
  } catch (e) {}
  return 'both';
}

function saveTerritoryConfig(territory) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ territory }), 'utf-8');
  } catch (e) {}
}

function buildTargetSignals(results, territory = 'both') {
  let targetCoins = [];
  if (territory === 'overbought') {
    targetCoins = [...(results.overboughtCoins || [])];
  } else if (territory === 'oversold') {
    targetCoins = [...(results.oversoldCoins || [])];
  } else {
    targetCoins = [...(results.overboughtCoins || []), ...(results.oversoldCoins || [])];
    if (results.divergenceCoins && results.divergenceCoins.length > 0) {
      for (const d of results.divergenceCoins) {
        if (!targetCoins.some((t) => t.symbol === d.symbol && t.timeframe === d.timeframe)) {
          targetCoins.push(d);
        }
      }
    }
  }

  targetCoins.sort((a, b) => {
    if (a.isMajor && !b.isMajor) return -1;
    if (!a.isMajor && b.isMajor) return 1;
    if (a.divergence && !b.divergence) return -1;
    if (!a.divergence && b.divergence) return 1;
    if (a.territory === 'OVERSOLD' && b.territory === 'OVERSOLD') return a.rsi - b.rsi;
    if (a.territory === 'OVERBOUGHT' && b.territory === 'OVERBOUGHT') return b.rsi - a.rsi;
    return 0;
  });

  return targetCoins;
}

async function runScanAndAlert(territory = 'both') {
  if (inFlightScanPromise) {
    return inFlightScanPromise;
  }

  inFlightScanPromise = (async () => {
    purgeOldCooldowns();
    const results = await scanAllAltsRSI();
    const targetCoins = buildTargetSignals(results, territory);
    const webhookUrl = getDiscordWebhookUrl();
    const webhookConfigured = Boolean(webhookUrl);

    let alertable = [];
    let cooldownSuppressedCount = 0;
    let sentAlerts = 0;
    let discordError = null;

    if (webhookConfigured) {
      alertable = filterCooldownAlerts(targetCoins);
      cooldownSuppressedCount = Math.max(0, targetCoins.length - alertable.length);
      const dispatchBatch = alertable.slice(0, 16);

      if (dispatchBatch.length > 0) {
        const sendRes = await sendDiscordRsiAlerts(dispatchBatch, webhookUrl);
        sentAlerts = sendRes.count || 0;
        discordError = sendRes.error || null;
      }
    } else {
      alertable = targetCoins;
    }

    const statusObj = {
      ...results,
      lastScanTime: Date.now(),
      territory,
      webhookConfigured,
      alertableCount: alertable.length,
      cooldownSuppressedCount,
      alertsDispatched: sentAlerts,
      discordError,
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
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';
    const webhookConfigured = Boolean(getDiscordWebhookUrl());

    // On-demand explicit scan (also usable by external 5-minute cron services)
    if (action === 'scan') {
      let cachedStatus = loadStatus();
      const cacheValid =
        !force &&
        cachedStatus &&
        cachedStatus.engineVersion === RSI_SCANNER_ENGINE_VERSION &&
        Date.now() - (cachedStatus.lastScanTime || 0) < EXPLICIT_THROTTLE_MS;

      if (cacheValid) {
        return NextResponse.json({
          ...cachedStatus,
          success: true,
          scannedNow: false,
          throttled: true,
          webhookConfigured,
          daemonActive: true,
          status: { ...cachedStatus, webhookConfigured },
        });
      }

      const statusObj = await runScanAndAlert(loadSavedTerritory());
      return NextResponse.json({
        success: true,
        scannedNow: true,
        daemonActive: true,
        webhookConfigured: statusObj.webhookConfigured,
        status: statusObj,
        ...statusObj,
      });
    }

    // Default: return cached or auto-scan + alert on initial load / stale >= 5m cache
    let cachedStatus = loadStatus();
    const isMissingOrStale =
      !cachedStatus ||
      cachedStatus.engineVersion !== RSI_SCANNER_ENGINE_VERSION ||
      (!cachedStatus.allCoins?.length && !cachedStatus.overboughtCoins?.length && !cachedStatus.oversoldCoins?.length) ||
      Date.now() - (cachedStatus.lastScanTime || 0) >= SCAN_FRESH_MS;

    if (isMissingOrStale) {
      cachedStatus = await runScanAndAlert(loadSavedTerritory());
    } else {
      cachedStatus = { ...cachedStatus, webhookConfigured };
    }

    const isDaemonActive = Boolean(cachedStatus && Date.now() - (cachedStatus.lastScanTime || 0) < 7 * 60 * 1000);

    return NextResponse.json({
      success: true,
      daemonActive: isDaemonActive,
      webhookConfigured,
      status: cachedStatus,
      timeframes: SCAN_TIMEFRAMES,
    });
  } catch (error) {
    console.error('RSI Scanner API GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'test_alert') {
      const url = getDiscordWebhookUrl();
      if (!url) {
        return NextResponse.json({
          success: false,
          webhookConfigured: false,
          message:
            'DISCORD_WEBHOOK_URL is not set on this server. Add DISCORD_WEBHOOK_URL in Vercel Project Settings -> Environment Variables and redeploy.',
        });
      }
      const testRes = await sendTestDiscordAlert(url);
      return NextResponse.json({
        success: testRes.ok,
        webhookConfigured: true,
        statusCode: testRes.status,
        message: testRes.ok
          ? 'Test alert delivered to Discord!'
          : `Discord rejected the webhook (${testRes.error || `HTTP ${testRes.status}`}). Check your webhook URL in environment variables.`,
      });
    }

    if (action === 'scan_now') {
      const territory = ['overbought', 'oversold', 'both'].includes(body.territory) ? body.territory : 'both';
      saveTerritoryConfig(territory);

      const statusObj = await runScanAndAlert(territory);

      return NextResponse.json({
        success: true,
        ...statusObj,
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('RSI Scanner API POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
