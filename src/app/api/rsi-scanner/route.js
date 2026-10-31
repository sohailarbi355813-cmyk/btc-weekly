import { NextResponse } from 'next/server';
import { scanAllAltsRSI, filterCooldownAlerts, SCAN_TIMEFRAMES } from '@/lib/rsiScannerEngine';
import { sendDiscordRsiAlerts, sendTestDiscordAlert } from '@/lib/discordNotifier';
import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.join(process.cwd(), '.rsi-scanner-status.json');

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // On-demand immediate scan
    if (action === 'scan') {
      const results = await scanAllAltsRSI();
      const allTerritory = [...results.overboughtCoins, ...results.oversoldCoins];
      const alertable = filterCooldownAlerts(allTerritory);

      let sentAlerts = 0;
      if (alertable.length > 0) {
        const sendRes = await sendDiscordRsiAlerts(alertable);
        sentAlerts = sendRes.count || 0;
      }

      return NextResponse.json({
        success: true,
        scannedNow: true,
        ...results,
        alertsDispatched: sentAlerts,
      });
    }

    // Default: read persisted scanner status
    let cachedStatus = null;
    try {
      if (fs.existsSync(STATUS_FILE)) {
        const raw = fs.readFileSync(STATUS_FILE, 'utf-8');
        cachedStatus = JSON.parse(raw);
      }
    } catch (e) {}

    const isDaemonActive = cachedStatus && Date.now() - cachedStatus.lastScanTime < 7 * 60 * 1000;

    return NextResponse.json({
      success: true,
      daemonActive: isDaemonActive,
      status: cachedStatus || {
        lastScanTime: null,
        overboughtCount: 0,
        oversoldCount: 0,
        overboughtCoins: [],
        oversoldCoins: [],
        totalCoins: 55,
        timeframes: SCAN_TIMEFRAMES.map((t) => t.id),
      },
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
      const ok = await sendTestDiscordAlert();
      return NextResponse.json({ success: ok, message: ok ? 'Test alert sent to Discord!' : 'Failed to send test alert' });
    }

    if (action === 'scan_now') {
      const results = await scanAllAltsRSI();
      const allTerritory = [...results.overboughtCoins, ...results.oversoldCoins];
      const alertable = filterCooldownAlerts(allTerritory);

      let sentAlerts = 0;
      if (alertable.length > 0) {
        const sendRes = await sendDiscordRsiAlerts(alertable);
        sentAlerts = sendRes.count || 0;
      }

      return NextResponse.json({
        success: true,
        overboughtCount: results.overboughtCount,
        oversoldCount: results.oversoldCount,
        alertsDispatched: sentAlerts,
        overboughtCoins: results.overboughtCoins,
        oversoldCoins: results.oversoldCoins,
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('RSI Scanner API POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

