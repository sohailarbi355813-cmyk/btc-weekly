import { NextResponse } from 'next/server';
import { ALTS_WHITELIST } from '@/lib/altsData';


export async function GET() {
  try {
    // 1. Fetch live 24h ticker tape from Bybit Linear (matches user's perps)
    let bybitMap = new Map();
    try {
      const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
        headers: { 'User-Agent': 'WolfTapeReader/2.0' },
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result?.list) {
          json.result.list.forEach((t) => bybitMap.set(t.symbol, t));
        }
      }
    } catch (e) {
      console.warn('Bybit linear tickers fetch failed, will try fallback', e.message);
    }

    // Fallback: If Bybit had an issue, fetch from Binance Futures
    if (bybitMap.size === 0) {
      try {
        const bRes = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', {
          headers: { 'User-Agent': 'WolfTapeReader/2.0' },
          cache: 'no-store',
        });
        if (bRes.ok) {
          const bList = await bRes.json();
          bList.forEach((t) => {
            bybitMap.set(t.symbol, {
              symbol: t.symbol,
              lastPrice: t.lastPrice,
              price24hPcnt: (parseFloat(t.priceChangePercent) / 100).toString(),
              highPrice24h: t.highPrice,
              lowPrice24h: t.lowPrice,
              turnover24h: t.quoteVolume,
            });
          });
        }
      } catch (e) {
        console.error('Binance fallback failed as well:', e.message);
      }
    }

    // 2. Extract BTC Benchmark
    const btcTicker = bybitMap.get('BTCUSDT');
    const btcPrice = btcTicker ? parseFloat(btcTicker.lastPrice) : 81700;
    const btcChange24h = btcTicker ? parseFloat(btcTicker.price24hPcnt) * 100 : 0.36;
    const btcHigh24h = btcTicker ? parseFloat(btcTicker.highPrice24h) : btcPrice * 1.01;
    const btcLow24h = btcTicker ? parseFloat(btcTicker.lowPrice24h) : btcPrice * 0.99;
    const btcBounceVelocity = btcLow24h > 0 ? ((btcPrice - btcLow24h) / btcLow24h) * 100 : 0;

    const isBtcDipping = btcChange24h < 0;
    const isBtcPumping = btcChange24h > 1.2;

    // 3. Process every Whitelisted Altcoin
    let rockHoldersCount = 0;
    let rocketPullCount = 0;
    let atYOCount = 0;
    let pumpLeadersCount = 0;
    let bleedersCount = 0;

    const processedAlts = ALTS_WHITELIST.map((item) => {
      const ticker = bybitMap.get(item.symbol);
      let lastPrice = ticker ? parseFloat(ticker.lastPrice) : item.yo;
      if (item.scaleFactor) lastPrice = lastPrice * item.scaleFactor;

      const change24h = ticker ? parseFloat(ticker.price24hPcnt) * 100 : 0;
      let high24h = ticker ? parseFloat(ticker.highPrice24h) : lastPrice;
      let low24h = ticker ? parseFloat(ticker.lowPrice24h) : lastPrice;
      if (item.scaleFactor) {
        high24h = high24h * item.scaleFactor;
        low24h = low24h * item.scaleFactor;
      }
      const turnover24h = ticker ? parseFloat(ticker.turnover24h || 0) : 0;

      // Distance from Yearly Open (Jan 1, 2026)
      const pctFromYO = item.yo > 0 ? ((lastPrice - item.yo) / item.yo) * 100 : 0;
      const absPctFromYO = Math.abs(pctFromYO);
      const isAtYO = absPctFromYO <= 1.0;
      const isNearYO = absPctFromYO <= 2.5;

      let yoRegime = 'BELOW_YO';
      if (isAtYO) yoRegime = 'AT_YO';
      else if (pctFromYO > 0) yoRegime = 'ABOVE_YO';

      if (isAtYO) atYOCount++;

      // Relative Delta vs BTC
      const btcDelta = change24h - btcChange24h;

      // Bounce Velocity off 24h Low
      const bounceVelocity = low24h > 0 ? ((lastPrice - low24h) / low24h) * 100 : 0;

      // Relative Strength Score (-100 to +100)
      const rsScore = Math.max(-100, Math.min(100, Math.round(btcDelta * 12 + (bounceVelocity - btcBounceVelocity) * 8)));

      // Tape Characterization
      let tapeCategory = 'neutral';
      let tapeReason = 'Tracking BTC in line';

      // 1. Rock Holder: When BTC is red/dumping, this alt holds its ground like a rock or stays green!
      // (Or has massive positive delta vs BTC)
      if (isBtcDipping) {
        if (change24h >= 0) {
          tapeCategory = 'rock_holder';
          tapeReason = 'Holding green like a rock while BTC is red!';
          rockHoldersCount++;
        } else if (btcDelta >= 1.5) {
          tapeCategory = 'rock_holder';
          tapeReason = 'Strong bid absorption (dumping far less than BTC)';
          rockHoldersCount++;
        } else if (btcDelta <= -2.0) {
          tapeCategory = 'bleeder';
          tapeReason = 'Bleeding / dumping harder than BTC';
          bleedersCount++;
        }
      } else {
        // BTC is green or flat
        if (btcDelta >= 2.5 && change24h >= 2.0) {
          tapeCategory = 'pump_leader';
          tapeReason = 'Leading market upside / pump multiplier';
          pumpLeadersCount++;
        } else if (change24h < -0.5 || btcDelta <= -2.5) {
          tapeCategory = 'bleeder';
          tapeReason = 'Diverging weak / failing to lift with BTC';
          bleedersCount++;
        }
      }

      // 2. Rocket Pull: Explosive bounce off the lows (pulling upside with strong momentum)
      if (bounceVelocity >= 3.5 && bounceVelocity > btcBounceVelocity * 1.5) {
        tapeCategory = 'rocket_pull';
        tapeReason = `Violent upside recovery (+${bounceVelocity.toFixed(1)}% off 24h low)`;
        rocketPullCount++;
      }

      return {
        symbol: item.symbol,
        displaySymbol: item.displaySymbol,
        name: item.name,
        decimals: item.decimals,
        lastPrice,
        priceFormatted: formatPrice(lastPrice, item.decimals),
        change24h: Number(change24h.toFixed(2)),
        high24h,
        low24h,
        turnover24h,
        yo: item.yo,
        yoFormatted: formatPrice(item.yo, item.decimals),
        pctFromYO: Number(pctFromYO.toFixed(2)),
        absPctFromYO: Number(absPctFromYO.toFixed(2)),
        isAtYO,
        isNearYO,
        yoRegime,
        btcDelta: Number(btcDelta.toFixed(2)),
        bounceVelocity: Number(bounceVelocity.toFixed(2)),
        rsScore,
        tapeCategory,
        tapeReason,
      };
    });

    // Helper price formatter for display
    function formatPrice(val, dec = 2) {
      if (val === undefined || val === null || isNaN(val)) return '--';
      if (val >= 1000) {
        return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      }
      return '$' + Number(val).toFixed(dec);
    }

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      btcBenchmark: {
        price: btcPrice,
        priceFormatted: '$' + btcPrice.toLocaleString('en-US', { maximumFractionDigits: 1 }),
        change24h: Number(btcChange24h.toFixed(2)),
        high24h: btcHigh24h,
        low24h: btcLow24h,
        bounceVelocity: Number(btcBounceVelocity.toFixed(2)),
        isDipping: isBtcDipping,
        isPumping: isBtcPumping,
      },
      macro: {
        usdtDominance: 6.74, // USDT.D indicator from TradingView watchlist
        usdtDChange: -0.45,
      },
      counts: {
        total: processedAlts.length,
        rockHolders: rockHoldersCount,
        rocketPulls: rocketPullCount,
        atYearlyOpen: atYOCount,
        pumpLeaders: pumpLeadersCount,
        bleeders: bleedersCount,
      },
      alts: processedAlts,
    });
  } catch (error) {
    console.error('Alts Tape API error:', error);
    return NextResponse.json(
      { success: false, error: error.message, alts: [] },
      { status: 500 }
    );
  }
}
