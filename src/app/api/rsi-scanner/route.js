import { NextResponse } from 'next/server';
import { scanAllAltsRSI, filterCooldownAlerts, SCAN_TIMEFRAMES, RSI_SCANNER_ENGINE_VERSION } from '@/lib/rsiScannerEngine';
import { sendDiscordRsiAlerts, sendTestDiscordAlert } from '@/lib/discordNotifier';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATUS_FILE = path.join(process.cwd(), '.rsi-scanner-status.json');
const CONFIG_FILE = path.join(process.cwd(), '.rsi-scanner-config.json');

let inMemoryCache = null;
let lastScanTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1-minute memory cache

function persistStatus(data) {
  inMemoryCache = data;
  lastScanTime = Date.now();
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // On-demand explicit scan
    if (action === 'scan') {
      const results = await scanAllAltsRSI();
      const allSignals = [...results.overboughtCoins, ...results.oversoldCoins];
      for (const d of results.divergenceCoins || []) {
        if (!allSignals.some((t) => t.symbol === d.symbol && t.timeframe === d.timeframe)) {
          allSignals.push(d);
        }
      }
      const alertable = filterCooldownAlerts(allSignals);

      let sentAlerts = 0;
      if (alertable.length > 0 && process.env.DISCORD_WEBHOOK_URL) {
        const sendRes = await sendDiscordRsiAlerts(alertable);
        sentAlerts = sendRes.count || 0;
      }

      const statusObj = {
        ...results,
        lastScanTime: Date.now(),
        alertsDispatched: sentAlerts,
      };
      persistStatus(statusObj);

      return NextResponse.json({
        success: true,
        scannedNow: true,
        ...statusObj,
      });
    }

    // Default: return cached or run auto-scan on initial load if no cache exists
    let cachedStatus = loadStatus();

    // Auto-scan if no cache exists yet or scanner logic version changed
    if (
      !cachedStatus ||
      cachedStatus.engineVersion !== RSI_SCANNER_ENGINE_VERSION ||
      (!cachedStatus.allCoins?.length && !cachedStatus.overboughtCoins?.length && !cachedStatus.oversoldCoins?.length)
    ) {
      const results = await scanAllAltsRSI();
      cachedStatus = {
        ...results,
        lastScanTime: Date.now(),
        alertsDispatched: 0,
      };
      persistStatus(cachedStatus);
    }

    const isDaemonActive = cachedStatus && Date.now() - (cachedStatus.lastScanTime || 0) < 7 * 60 * 1000;

    return NextResponse.json({
      success: true,
      daemonActive: isDaemonActive,
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
      if (!process.env.DISCORD_WEBHOOK_URL) {
        return NextResponse.json({
          success: false,
          message: 'No DISCORD_WEBHOOK_URL found in environment. Alerts are displayed directly on-site in the table below.',
        });
      }
      const ok = await sendTestDiscordAlert();
      return NextResponse.json({
        success: ok,
        message: ok ? 'Test alert sent to Discord!' : 'Failed to send test alert to Discord URL',
      });
    }

    if (action === 'scan_now') {
      const territory = body.territory || 'both';
      try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ territory }), 'utf-8');
      } catch (e) {}

      const results = await scanAllAltsRSI();
      let targetCoins = [];
      if (territory === 'overbought') {
        targetCoins = results.overboughtCoins;
      } else if (territory === 'oversold') {
        targetCoins = results.oversoldCoins;
      } else {
        targetCoins = [...results.overboughtCoins, ...results.oversoldCoins];
        if (results.divergenceCoins && results.divergenceCoins.length > 0) {
          for (const d of results.divergenceCoins) {
            if (!targetCoins.some((t) => t.symbol === d.symbol && t.timeframe === d.timeframe)) {
              targetCoins.push(d);
            }
          }
        }
      }

      const alertable = filterCooldownAlerts(targetCoins);

      let sentAlerts = 0;
      if (alertable.length > 0 && process.env.DISCORD_WEBHOOK_URL) {
        const sendRes = await sendDiscordRsiAlerts(alertable);
        sentAlerts = sendRes.count || 0;
      }

      const statusObj = {
        ...results,
        lastScanTime: Date.now(),
        territory,
        alertsDispatched: sentAlerts,
      };
      persistStatus(statusObj);

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
