/**
 * Wolf RSI Discord Alert Scanner Daemon
 * 
 * Periodically scans 55 whitelisted Altcoin Perpetuals across:
 * - 30 Minutes (30m)
 * - 45 Minutes (45m)
 * - 1 Hour (1h)
 * - 2 Hours (2h)
 * - 3 Hours (3h)
 * 
 * Alerts Discord Webhook whenever any coin trades in Overbought (RSI >= 70) or Oversold (RSI <= 30).
 * Runs every 5 minutes.
 */

import { scanAllAltsRSI, filterCooldownAlerts, purgeOldCooldowns } from '../src/lib/rsiScannerEngine.js';
import { sendDiscordRsiAlerts } from '../src/lib/discordNotifier.js';
import fs from 'fs';
import path from 'path';

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STATUS_FILE = path.join(process.cwd(), '.rsi-scanner-status.json');

let scanIteration = 0;
let totalAlertsSentLifetime = 0;

function saveStatus(statusObj) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(statusObj, null, 2), 'utf-8');
  } catch (e) {}
}

async function runScanCycle() {
  scanIteration++;
  const startTime = Date.now();
  const timeStr = new Date().toLocaleTimeString();

  console.log(`\n=============================================================`);
  console.log(`🐺 [${timeStr}] Starting Scan #${scanIteration} across 55 Alts...`);
  console.log(`⏱️ Timeframes: 30m, 45m, 1h, 2h, 3h | Thresholds: OB >= 70, OS <= 30`);
  console.log(`=============================================================`);

  try {
    purgeOldCooldowns();

    const results = await scanAllAltsRSI();
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Scan completed in ${durationSec}s. Analyzed ${results.totalScanned} candle series.`);
    console.log(`📊 Found: ${results.overboughtCount} Overbought | ${results.oversoldCount} Oversold`);

    const allTerritoryCoins = [...results.overboughtCoins, ...results.oversoldCoins];

    // Filter through cooldown so we don't spam Discord every 5m for unchanged coins
    const alertable = filterCooldownAlerts(allTerritoryCoins);

    if (alertable.length > 0) {
      console.log(`🚨 Dispatching ${alertable.length} fresh alert(s) to Discord Webhook...`);
      for (const item of alertable) {
        const sigmaTxt = item.sigmaMetrics ? ` | σ: ${item.sigmaMetrics.zScoreText} (${item.sigmaMetrics.gaussianPct}% Gauss)` : '';
        console.log(`   -> [${item.territory}] ${item.displaySymbol} (${item.name}) on ${item.timeframe.toUpperCase()}: RSI ${item.rsi}${sigmaTxt} (Spot: $${item.price})`);
      }

      const alertRes = await sendDiscordRsiAlerts(alertable);
      if (alertRes.success) {
        totalAlertsSentLifetime += alertRes.count;
        console.log(`📨 Successfully delivered ${alertRes.count} alert(s) to Discord! Total lifetime: ${totalAlertsSentLifetime}`);
      }
    } else if (allTerritoryCoins.length > 0) {
      console.log(`⏳ ${allTerritoryCoins.length} coin(s) in OB/OS territory, but suppressed by cooldown (already alerted recently).`);
    } else {
      console.log(`🧘 No coins currently in extreme Overbought (>=70) or Oversold (<=30) territory.`);
    }

    // Persist status for web app telemetry
    saveStatus({
      lastScanTime: Date.now(),
      lastScanTimeFormatted: new Date().toISOString(),
      scanIteration,
      durationSec: Number(durationSec),
      totalCoins: results.totalCoins,
      timeframes: results.monitoredTimeframes,
      overboughtCount: results.overboughtCount,
      oversoldCount: results.oversoldCount,
      overboughtCoins: results.overboughtCoins,
      oversoldCoins: results.oversoldCoins,
      alertsDispatchedThisCycle: alertable.length,
      totalAlertsSentLifetime,
      nextScanTime: Date.now() + SCAN_INTERVAL_MS,
    });

  } catch (err) {
    console.error(`❌ Error during scan cycle #${scanIteration}:`, err.message);
  }

  const nextTime = new Date(Date.now() + SCAN_INTERVAL_MS).toLocaleTimeString();
  console.log(`💤 Next automated scan scheduled for: ${nextTime} (in 5 minutes)\n`);
}

// Initial immediate scan
console.log('🚀 Initializing Wolf RSI Discord Alert Scanner Daemon...');
runScanCycle();

// Schedule recurring 5-minute loop
setInterval(runScanCycle, SCAN_INTERVAL_MS);

