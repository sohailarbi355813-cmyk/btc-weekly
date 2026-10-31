import { DISCORD_WEBHOOK_URL } from './rsiScannerEngine.js';

/**
 * Format price cleanly based on magnitude
 */
function formatPrice(n) {
  if (!n) return '--';
  const num = Number(n);
  if (num >= 1000) return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return '$' + num.toFixed(3);
  return '$' + num.toFixed(5);
}

/**
 * Send RSI Overbought / Oversold Alert Embeds to Discord Webhook
 */
export async function sendDiscordRsiAlerts(alerts, webhookUrl = DISCORD_WEBHOOK_URL) {
  if (!alerts || alerts.length === 0) return { success: true, count: 0 };

  const url = webhookUrl || DISCORD_WEBHOOK_URL;
  const CHUNK_SIZE = 10; // Discord allows max 10 embeds per message

  let sentCount = 0;

  for (let i = 0; i < alerts.length; i += CHUNK_SIZE) {
    const chunk = alerts.slice(i, i + CHUNK_SIZE);

    const embeds = chunk.map((item) => {
      const isOB = item.territory === 'OVERBOUGHT';
      const color = isOB
        ? (item.rsi >= 80 ? 0x991B1B : item.rsi >= 75 ? 0xDC2626 : 0xEF4444)
        : (item.rsi <= 20 ? 0x065F46 : item.rsi <= 25 ? 0x059669 : 0x10B981);

      const symbolTag = item.displaySymbol || `${item.symbol}.P`;
      const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${item.symbol}.P`;

      const fields = [
        {
          name: '⏱️ Timeframe',
          value: `**${item.timeframe.toUpperCase()}** (${item.timeframeLabel || item.timeframe})`,
          inline: true,
        },
        {
          name: isOB ? '🔥 RSI (14)' : '❄️ RSI (14)',
          value: `**${item.rsi}** (${item.severity} ${isOB ? 'OB' : 'OS'})`,
          inline: true,
        },
        {
          name: '💲 Spot Price',
          value: `**${formatPrice(item.price)}**`,
          inline: true,
        },
      ];

      if (item.divergence) {
        fields.push({
          name: '📐 Pattern / Confluence',
          value: `⚠️ **${item.divergence.label}** (${item.divergence.barsAgo} bars ago)`,
          inline: false,
        });
      }

      fields.push({
        name: '🔗 Chart Quick Link',
        value: `[Open ${symbolTag} on TradingView](${tvUrl})`,
        inline: false,
      });

      return {
        title: isOB
          ? `🔴 ${symbolTag} (${item.name}) • RSI OVERBOUGHT`
          : `🟢 ${symbolTag} (${item.name}) • RSI OVERSOLD`,
        description: isOB
          ? `**${symbolTag}** is trading in **RSI Overbought territory** on the **${item.timeframe.toUpperCase()}** timeframe.\nStatistical exhaustion / blow-off zone.`
          : `**${symbolTag}** is trading in **RSI Oversold territory** on the **${item.timeframe.toUpperCase()}** timeframe.\nStatistical discount / capitulation bounce zone.`,
        color,
        fields,
        footer: {
          text: `Wolf Tape Reader • 55 Alts Scanner • Scan Interval: 5m`,
          icon_url: 'https://cdn-icons-png.flaticon.com/512/2534/2534204.png',
        },
        timestamp: new Date().toISOString(),
      };
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Wolf RSI Scanner',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/2534/2534204.png',
          embeds,
        }),
      });

      if (res.ok || res.status === 204) {
        sentCount += chunk.length;
      } else {
        console.error('Discord webhook responded with error:', res.status, res.statusText);
      }
    } catch (err) {
      console.error('Failed to post to Discord webhook:', err);
    }

    // Small delay between chunks if multiple
    if (i + CHUNK_SIZE < alerts.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return { success: true, count: sentCount };
}

/**
 * Send a Test Alert Embed to verify the Discord connection
 */
export async function sendTestDiscordAlert(webhookUrl = DISCORD_WEBHOOK_URL) {
  const url = webhookUrl || DISCORD_WEBHOOK_URL;
  const testEmbed = {
    title: '🐺 Wolf RSI Scanner • Webhook Active & Verified',
    description:
      'The multi-timeframe RSI Overbought/Oversold Scanner is live and actively scanning every 5 minutes.\n\n' +
      '• **Monitored Timeframes:** `30m`, `45m`, `1h`, `2h`, `3h` (Strictly exclusive)\n' +
      '• **Watchlist:** 55 Whitelisted Altcoins (Including `XPLUSDT.P`, `SOLUSDT.P`, `ETHUSDT.P`, etc.)\n' +
      '• **Thresholds:** Overbought $\\ge 70$ | Oversold $\\le 30$\n' +
      '• **Scan Frequency:** Every 5 minutes with anti-spam cooldown protection.',
    color: 0x38bdf8,
    fields: [
      {
        name: '📡 Telemetry Status',
        value: '🟢 **ONLINE & ARMED**',
        inline: true,
      },
      {
        name: '⏱️ Next Scan',
        value: 'Scheduled in **5 minutes**',
        inline: true,
      },
    ],
    footer: {
      text: 'Wolf Tape Reader • Discord Telemetry',
      icon_url: 'https://cdn-icons-png.flaticon.com/512/2534/2534204.png',
    },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Wolf RSI Scanner',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/2534/2534204.png',
      embeds: [testEmbed],
    }),
  });

  return res.ok || res.status === 204;
}
