import { NextResponse } from 'next/server';
import { ALTS_WHITELIST } from '@/lib/altsData';
import pivotsData from '@/lib/pivotsData.json';

export async function GET() {
  try {
    // 1. Fetch live 24h ticker tape from Bybit Linear
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
      console.warn('Bybit linear tickers fetch failed:', e.message);
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
            });
          });
        }
      } catch (e) {
        console.error('Binance fallback failed:', e.message);
      }
    }

    // Helper to format distance text and detect close pivots
    function formatDist(spot, pivotLevel, label) {
      if (!pivotLevel || !spot) {
        return { dist: 0, text: '--', isClose: false, level: 0, label };
      }
      const d = ((spot - pivotLevel) / pivotLevel) * 100;
      const absD = Math.abs(d);
      const isClose = absD <= 1.2;

      let text;
      if (absD < 1.0) {
        text = d.toFixed(1);
        if (text === '0.0' || text === '-0.0') text = '0.1';
      } else if (absD < 10) {
        text = (d >= 0 ? '+' : '') + d.toFixed(1);
      } else {
        text = (d >= 0 ? '+' : '') + Math.round(d);
      }

      return {
        dist: Number(d.toFixed(2)),
        text,
        isClose,
        level: Number(pivotLevel.toFixed(4)),
        label,
      };
    }

    const bullishList = [];
    const bearishList = [];

    ALTS_WHITELIST.forEach((item) => {
      const ticker = bybitMap.get(item.symbol);
      let spot = ticker ? parseFloat(ticker.lastPrice) : item.yo;
      if (item.scaleFactor) spot = spot * item.scaleFactor;

      const p = pivotsData[item.symbol];
      if (!p) return;

      const shortSymbol = item.symbol.replace('1000', '').replace('USDT', '');

      // ─── Bullish State: Value Area Low (VAL) distances ───
      const pY_val = formatDist(spot, p.py.val, 'Prior Year VAL');
      const Y_val = formatDist(spot, p.y.val, 'Current Year VAL');
      const pQ_val = formatDist(spot, p.pq.val, 'Prior Quarter VAL');
      const Q_val = formatDist(spot, p.q.val, 'Current Quarter VAL');
      const pM_val = formatDist(spot, p.pm.val, 'Prior Month VAL');
      const M_val = formatDist(spot, p.m.val, 'Current Month VAL');
      const pW_val = formatDist(spot, p.pw.val, 'Prior Week VAL');
      const W_val = formatDist(spot, p.w.val, 'Current Week VAL');

      const valArr = [pY_val, Y_val, pQ_val, Q_val, pM_val, M_val, pW_val, W_val];
      const minAbsValDist = Math.min(...valArr.map((x) => Math.abs(x.dist)));
      const hasValHighlight = valArr.some((x) => x.isClose);
      const closestVal = valArr.reduce((prev, curr) => (Math.abs(curr.dist) < Math.abs(prev.dist) ? curr : prev), valArr[0]);

      bullishList.push({
        symbol: shortSymbol,
        fullSymbol: item.displaySymbol,
        name: item.name,
        spot: spot,
        pY: pY_val,
        Y: Y_val,
        pQ: pQ_val,
        Q: Q_val,
        pM: pM_val,
        M: M_val,
        pW: pW_val,
        W: W_val,
        state: 'BULL',
        minAbsDist: Number(minAbsValDist.toFixed(2)),
        hasHighlight: hasValHighlight,
        closest: closestVal,
      });

      // ─── Bearish State: Value Area High (VAH) distances ───
      const pY_vah = formatDist(spot, p.py.vah, 'Prior Year VAH');
      const Y_vah = formatDist(spot, p.y.vah, 'Current Year VAH');
      const pQ_vah = formatDist(spot, p.pq.vah, 'Prior Quarter VAH');
      const Q_vah = formatDist(spot, p.q.vah, 'Current Quarter VAH');
      const pM_vah = formatDist(spot, p.pm.vah, 'Prior Month VAH');
      const M_vah = formatDist(spot, p.m.vah, 'Current Month VAH');
      const pW_vah = formatDist(spot, p.pw.vah, 'Prior Week VAH');
      const W_vah = formatDist(spot, p.w.vah, 'Current Week VAH');

      const vahArr = [pY_vah, Y_vah, pQ_vah, Q_vah, pM_vah, M_vah, pW_vah, W_vah];
      const minAbsVahDist = Math.min(...vahArr.map((x) => Math.abs(x.dist)));
      const hasVahHighlight = vahArr.some((x) => x.isClose);
      const closestVah = vahArr.reduce((prev, curr) => (Math.abs(curr.dist) < Math.abs(prev.dist) ? curr : prev), vahArr[0]);

      bearishList.push({
        symbol: shortSymbol,
        fullSymbol: item.displaySymbol,
        name: item.name,
        spot: spot,
        pY: pY_vah,
        Y: Y_vah,
        pQ: pQ_vah,
        Q: Q_vah,
        pM: pM_vah,
        M: M_vah,
        pW: pW_vah,
        W: W_vah,
        state: 'BEAR',
        minAbsDist: Number(minAbsVahDist.toFixed(2)),
        hasHighlight: hasVahHighlight,
        closest: closestVah,
      });
    });

    // Sort by proximity to nearest pivot (coins closest to VAL / VAH at top)
    bullishList.sort((a, b) => a.minAbsDist - b.minAbsDist);
    bearishList.sort((a, b) => a.minAbsDist - b.minAbsDist);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      total: ALTS_WHITELIST.length,
      bullishStates: bullishList,
      bearishStates: bearishList,
    });
  } catch (error) {
    console.error('Value Area API error:', error);
    return NextResponse.json(
      { success: false, error: error.message, bullishStates: [], bearishStates: [] },
      { status: 500 }
    );
  }
}
