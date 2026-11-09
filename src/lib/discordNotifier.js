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
  const CHUNK_SIZE = 4; // Safe chunk size to stay well under Discord's 6,000 total character payload limit

  let sentCount = 0;

  for (let i = 0; i < alerts.length; i += CHUNK_SIZE) {
    const chunk = alerts.slice(i, i + CHUNK_SIZE);

    const embeds = chunk.map((item) => {
      const isTrueOB = item.rsi >= 70;
      const isTrueOS = item.rsi <= 30;
      const isBearSide = item.territory === 'OVERBOUGHT' || item.territory === 'BEARISH_DIV' || item.divergence?.direction === 'BEAR';
      const isMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(item.symbol) || item.isMajor;
      const color = item.divergence
        ? (isBearSide ? 0xDC2626 : 0x16A34A)
        : isTrueOB
        ? (item.rsi >= 80 ? 0x991B1B : item.rsi >= 75 ? 0xDC2626 : 0xEF4444)
        : (item.rsi <= 20 ? 0x065F46 : item.rsi <= 25 ? 0x059669 : 0x10B981);

      const symbolTag = item.displaySymbol || `${item.symbol}.P`;
      const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${item.symbol}.P`;

      const rsiTag = isTrueOB
        ? `${item.severity || 'ELEVATED'} OVERBOUGHT (\u226570)`
        : isTrueOS
        ? `${item.severity || 'ELEVATED'} OVERSOLD (\u226430)`
        : `${isBearSide ? 'Bearish Div' : 'Bullish Div'} \u00B7 Neutral Band`;

      const fields = [
        {
          name: '⏱️ Timeframe',
          value: `**${item.timeframe.toUpperCase()}** (${item.timeframeLabel || item.timeframe})`,
          inline: true,
        },
        {
          name: isBearSide ? '🔥 RSI (14)' : '❄️ RSI (14)',
          value: `**${item.rsi}** (${rsiTag})`,
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
          name: '🎯 RSI Divergence Structure',
          value: `⚠️ **${item.divergence.label}** (${item.divergence.barsAgo} bars ago)\n` +
                 (item.divergence.prevPrice ? `Swing Pivot: \`${formatPrice(item.divergence.prevPrice)}\` ➔ \`${formatPrice(item.divergence.curPrice || item.price)}\`\n` : '') +
                 (item.divergence.prevRsi ? `Pivot RSI: \`${item.divergence.prevRsi}\` ➔ \`${item.divergence.curRsi}\` (Now: \`${item.rsi}\`)` : ''),
          inline: false,
        });
      }

      if (item.sigmaMetrics) {
        const isExtreme = item.sigmaMetrics.isExtremeGaussian;
        const zTxt = item.sigmaMetrics.zScoreText;
        const gPct = item.sigmaMetrics.gaussianPct;

        fields.push({
          name: isExtreme ? '📐 Statistical Volatility (Z-Score) ⚡' : '📐 Statistical Volatility (Z-Score)',
          value: `Extension: **${zTxt}** (${gPct}% Gaussian Boundary)\n` +
                 `Reversal Edge: **${isExtreme ? '🔥 HIGH PROBABILITY REVERSAL ZONE (>95%)' : '⚠️ Momentum Trend Extension'}**\n` +
                 `20-Period Mean: \`${formatPrice(item.sigmaMetrics.mean)}\` (${item.sigmaMetrics.pctFromMean >= 0 ? '+' : ''}${item.sigmaMetrics.pctFromMean}% distance)`,
          inline: false,
        });
      }

      fields.push({
        name: '🔗 Chart Quick Link',
        value: `[Open ${symbolTag} on TradingView](${tvUrl})`,
        inline: false,
      });

      const sigmaTag = item.sigmaMetrics ? ` [${item.sigmaMetrics.zScoreText}]` : '';
      const extremeTag = item.sigmaMetrics?.isExtremeGaussian ? ' ⚡' : '';
      const majorPrefix = isMajor ? '👑 [MAJOR] ' : '';

      const title = item.divergence
        ? (isBearSide
            ? `🔴 ${majorPrefix}${symbolTag} (${item.name}) • RSI BEARISH DIVERGENCE${isTrueOB ? ' + OVERBOUGHT' : ''}${sigmaTag}${extremeTag}`
            : `🟢 ${majorPrefix}${symbolTag} (${item.name}) • RSI BULLISH DIVERGENCE${isTrueOS ? ' + OVERSOLD' : ''}${sigmaTag}${extremeTag}`)
        : (isTrueOB
            ? `🔴 ${majorPrefix}${symbolTag} (${item.name}) • RSI OVERBOUGHT${sigmaTag}${extremeTag}`
            : `🟢 ${majorPrefix}${symbolTag} (${item.name}) • RSI OVERSOLD${sigmaTag}${extremeTag}`);

      const description = item.divergence
        ? `🎯 **${symbolTag}** printed **${item.divergence.label}** on **${item.timeframe.toUpperCase()}** (Pivot RSI \`${item.divergence.prevRsi}\` ➔ \`${item.divergence.curRsi}\`, current RSI \`${item.rsi}\`).\nPrice is at **${item.sigmaMetrics?.zScoreText || 'N/A'}** (${item.sigmaMetrics?.gaussianPct || 0}% Gaussian Boundary). ${item.sigmaMetrics?.isExtremeGaussian ? '🔥 **High probability reversal confluence!**' : 'Watch for confirmation.'}`
        : (isTrueOB
            ? `**${symbolTag}** is trading in **RSI Overbought territory** (\u226570) at **${item.sigmaMetrics?.zScoreText || 'N/A'}** above 20 SMA (${item.sigmaMetrics?.gaussianPct || 0}% Gaussian Boundary).\n${item.sigmaMetrics?.isExtremeGaussian ? '🎯 **Statistical mean-reversion probability is strongly elevated (>95% Gaussian boundary).**' : '⚠️ Within normal volatility band—look for structural confirmation.'}`
            : `**${symbolTag}** is trading in **RSI Oversold territory** (\u226430) at **${item.sigmaMetrics?.zScoreText || 'N/A'}** below 20 SMA (${item.sigmaMetrics?.gaussianPct || 0}% Gaussian Boundary).\n${item.sigmaMetrics?.isExtremeGaussian ? '🎯 **Statistical mean-reversion bounce probability is strongly elevated (>95% Gaussian boundary).**' : '⚠️ Within normal volatility band—look for structural confirmation.'}`);

      return {
        title,
        description,
        color,
        fields,
        footer: {
          text: `Wolf Tape Reader • RSI & Divergence Scanner • 5m Loop`,
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
        const errText = await res.text().catch(() => '');
        console.error('Discord webhook responded with error:', res.status, res.statusText, errText);
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
      '• **Thresholds:** Overbought \u2265 70 | Oversold \u2264 30\n' +
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
