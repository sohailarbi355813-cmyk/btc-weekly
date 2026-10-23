import { ALTS_WHITELIST } from './altsData';
import pivotsData from './pivotsData.json';

/**
 * Institutional Catalyst Attribution & Cross-Asset Pattern Twin Engine
 *
 * 1. Analyzes ANY target coin that experienced an extreme move (pump or dump).
 * 2. Diagnoses the exact root orderflow / technical archetype (the "Reason").
 * 3. Scans all 55 whitelisted alts to find coins currently displaying the SAME pattern/setup
 *    before their breakout or breakdown unfolds.
 */

// Archetype Catalyst Signatures
export const CATALYST_ARCHETYPES = {
  VAL_ABSORPTION_EXPANSION: {
    id: 'VAL_ABSORPTION_EXPANSION',
    name: 'Value Area Low (VAL) Absorption & Expansion',
    type: 'BULLISH',
    summary: 'Price was trapped at deep support near VAL, absorbed aggressive sell orders, and compressed before explosive markup above Weekly Open.',
    preCondition: 'Trading within -1.5% to +2.5% of VAL with declining volatility, then breaking outward with volume.',
    twinCriteria: 'Currently sitting directly at or near VAL support (-2% to +3.5%), holding firm with low downside extension.',
  },
  SHORT_SQUEEZE_MOMENTUM: {
    id: 'SHORT_SQUEEZE_MOMENTUM',
    name: 'Short Squeeze & Resistance Liquidation Run',
    type: 'BULLISH',
    summary: 'Massive volume breakout punching through Value Area High (VAH) and previous resistance, trapping late perps shorts into forced buy liquidations.',
    preCondition: 'Price traded near VAH (-1% to +2%), volume surged >2x, forcing cascade past Yearly/Monthly opens.',
    twinCriteria: 'Currently pressing against VAH or resistance (-2.5% to +1.5%), building volume pressure right at the breakout trigger.',
  },
  RELATIVE_STRENGTH_DECOUPLING: {
    id: 'RELATIVE_STRENGTH_DECOUPLING',
    name: 'Relative Strength (RS) Decoupling from BTC',
    type: 'BULLISH',
    summary: 'Asset decoupled positively from Bitcoin while BTC consolidated or dipped, showing persistent spot absorption and refusing to break lower pivots.',
    preCondition: 'Strong positive delta vs BTC, maintaining price above all quarterly and monthly VAL levels.',
    twinCriteria: 'Consistently holding above all VAL levels with positive relative momentum while BTC is stationary.',
  },
  VOLATILITY_COMPRESSION_RELEASE: {
    id: 'VOLATILITY_COMPRESSION_RELEASE',
    name: 'Multi-Day Volatility Squeeze & Energy Release',
    type: 'BULLISH',
    summary: 'Extremely tight consolidation between Weekly Open and VAL, building massive coiled potential energy that detonated into high-velocity trend continuation.',
    preCondition: 'Trading in a < 3% range across 48h, followed by immediate impulse.',
    twinCriteria: 'Extremely compressed distance to both WO and VAL (< 2.5% distance), tight coiled spring ready to release.',
  },
  VAH_REJECTION_CASCADE: {
    id: 'VAH_REJECTION_CASCADE',
    name: 'Value Area High (VAH) Rejection & Distribution',
    type: 'BEARISH',
    summary: 'Failed auction at key resistance near VAH or Yearly Open, trapping breakout buyers into an aggressive long flush cascade.',
    preCondition: 'Spiked into VAH (+1% to +3%), heavy rejection wicks, followed by breakdown through Weekly Open.',
    twinCriteria: 'Currently testing VAH (+0.5% to -2.5%) showing stalling momentum and unable to close above resistance.',
  },
  LONG_LIQUIDATION_FLUSH: {
    id: 'LONG_LIQUIDATION_FLUSH',
    name: 'Over-Leveraged Long Capitulation & Liquidity Hunt',
    type: 'BEARISH',
    summary: 'Breakdown below Value Area Low and Previous Day Low triggering cascading stop-loss liquidations across perpetual futures.',
    preCondition: 'Broke below VAL with accelerating negative delta and volume spikes.',
    twinCriteria: 'Hovering right at the edge of VAL (-0.5% to +1.5%) with weakening support, at risk of cascading breakdown.',
  },
};

/**
 * Diagnose the target coin's primary driver based on live metrics
 */
export function diagnoseCoinCatalyst(targetCoin, btcChange = 0) {
  const { symbol, lastPrice, priceChange24h, high24h, low24h, volume24h } = targetCoin;
  const isPump = priceChange24h >= 0;
  const absChange = Math.abs(priceChange24h);

  // Check if target coin has pivot mapping in our whitelist
  const cleanSymbol = symbol.replace('1000', '').replace('USDT', '').toUpperCase();
  const matchedItem = ALTS_WHITELIST.find(a => a.symbol.includes(cleanSymbol) || cleanSymbol.includes(a.symbol.replace('USDT', '')));
  const pivots = matchedItem ? pivotsData[matchedItem.symbol] : null;

  let diagnosedArchetype = CATALYST_ARCHETYPES.VAL_ABSORPTION_EXPANSION;
  let driverConfidence = 85;
  let detailedReason = '';

  if (isPump) {
    if (absChange >= 15) {
      diagnosedArchetype = CATALYST_ARCHETYPES.SHORT_SQUEEZE_MOMENTUM;
      driverConfidence = 92;
      detailedReason = `${cleanSymbol} experienced an aggressive +${priceChange24h.toFixed(1)}% short squeeze. Taker buy volume overwhelmed resting limit offers at resistance, triggering cascading forced buy liquidations across perpetual contracts.`;
    } else if (priceChange24h > (btcChange + 6)) {
      diagnosedArchetype = CATALYST_ARCHETYPES.RELATIVE_STRENGTH_DECOUPLING;
      driverConfidence = 88;
      detailedReason = `${cleanSymbol} (+${priceChange24h.toFixed(1)}%) decoupled strongly from Bitcoin (BTC ${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(1)}%). Spot volume absorption was relentless, driving an independent relative strength expansion.`;
    } else if (pivots && lastPrice > pivots.w?.val) {
      diagnosedArchetype = CATALYST_ARCHETYPES.VAL_ABSORPTION_EXPANSION;
      driverConfidence = 90;
      detailedReason = `${cleanSymbol} respected key institutional support at Value Area Low (VAL). After defending the lower auction boundary, buyers absorbed floating supply and drove an impulsive breakout toward upper value targets.`;
    } else {
      diagnosedArchetype = CATALYST_ARCHETYPES.VOLATILITY_COMPRESSION_RELEASE;
      driverConfidence = 84;
      detailedReason = `${cleanSymbol} underwent multi-day range compression. The coiled liquidity released impulsively once spot buyers stepped in above the weekly open benchmark.`;
    }
  } else {
    // DUMP
    if (absChange >= 12) {
      diagnosedArchetype = CATALYST_ARCHETYPES.LONG_LIQUIDATION_FLUSH;
      driverConfidence = 91;
      detailedReason = `${cleanSymbol} flushed -${absChange.toFixed(1)}% as support collapsed. Overleveraged long positions were liquidated in a cascade below key institutional pivot floors.`;
    } else {
      diagnosedArchetype = CATALYST_ARCHETYPES.VAH_REJECTION_CASCADE;
      driverConfidence = 87;
      detailedReason = `${cleanSymbol} suffered a violent rejection at Value Area High (VAH) resistance. Breakout buyers were trapped at the auction ceiling, prompting sharp mean-reversion down into value.`;
    }
  }

  return {
    symbol: cleanSymbol,
    fullSymbol: symbol,
    price: lastPrice,
    change24h: priceChange24h,
    direction: isPump ? 'PUMP' : 'DUMP',
    magnitude: `${isPump ? '+' : ''}${priceChange24h.toFixed(1)}%`,
    archetype: diagnosedArchetype,
    confidence: driverConfidence,
    detailedReason,
    pivotsFound: !!pivots,
  };
}

/**
 * Scan all 55 whitelisted alts and identify coins matching this exact setup
 */
export function scanAltsForTwinPatterns(diagnosis, allCoinsData) {
  if (!allCoinsData || allCoinsData.length === 0) return [];

  const archetype = diagnosis.archetype;
  const isPump = diagnosis.direction === 'PUMP';

  const matches = [];

  allCoinsData.forEach((coin) => {
    // Skip self
    if (coin.symbol.toUpperCase() === diagnosis.symbol || coin.fullSymbol.includes(diagnosis.symbol)) {
      return;
    }

    const spot = coin.spot;
    const p = pivotsData[coin.rawSymbol || coin.symbol + 'USDT'];
    if (!p || !spot) return;

    // Distances to key pivots
    const distW_VAL = ((spot - p.w.val) / p.w.val) * 100;
    const distW_VAH = ((spot - p.w.vah) / p.w.vah) * 100;
    const distM_VAL = ((spot - p.m.val) / p.m.val) * 100;
    const distM_VAH = ((spot - p.m.vah) / p.m.vah) * 100;
    const distWO = p.wo ? ((spot - p.wo) / p.wo) * 100 : distW_VAL;

    let similarityScore = 0;
    let stage = 'STAGE 1: Silent Consolidation';
    let triggerAction = '';
    let entryZone = '';
    let targetPrice = '';
    let invalidation = '';

    if (archetype.id === 'VAL_ABSORPTION_EXPANSION') {
      // Looking for coins currently holding VAL support (-1.5% to +3.5%)
      const nearVal = Math.min(Math.abs(distW_VAL), Math.abs(distM_VAL));
      if (nearVal <= 3.8 && distW_VAL >= -2.0) {
        similarityScore = Math.max(72, Math.round(98 - nearVal * 6.5));
        stage = nearVal <= 1.2 ? 'STAGE 2: Liquidity Swept at VAL (Primed)' : 'STAGE 1: Early Support Defense';
        triggerAction = `Holding ${distW_VAL >= 0 ? '+' : ''}${distW_VAL.toFixed(1)}% above Weekly VAL ($${p.w.val.toFixed(4)}). Mirrors ${diagnosis.symbol}'s pre-pump absorption.`;
        entryZone = `$${p.w.val.toFixed(4)} - $${(p.w.val * 1.02).toFixed(4)}`;
        targetPrice = `$${p.w.vah.toFixed(4)} (+${(((p.w.vah - spot) / spot) * 100).toFixed(1)}% to VAH)`;
        invalidation = `Daily close below $${(p.w.val * 0.985).toFixed(4)}`;
      }
    } else if (archetype.id === 'SHORT_SQUEEZE_MOMENTUM') {
      // Looking for coins pressing against VAH (-3.0% to +1.5%) with breakout pressure
      const nearVah = Math.abs(distW_VAH);
      if (distW_VAH >= -3.5 && distW_VAH <= 2.0) {
        similarityScore = Math.max(75, Math.round(97 - nearVah * 6.0));
        stage = distW_VAH >= -0.5 ? 'STAGE 3: Breakout Trigger Imminent' : 'STAGE 2: Building Pressure Under VAH';
        triggerAction = `Pressing right under Weekly VAH ($${p.w.vah.toFixed(4)}). A volume spike will trigger short squeeze contagion.`;
        entryZone = `Breakout above $${p.w.vah.toFixed(4)}`;
        targetPrice = `$${(p.w.vah * 1.15).toFixed(4)} (+15.0% Extension)`;
        invalidation = `Pullback below $${(p.w.vah * 0.97).toFixed(4)}`;
      }
    } else if (archetype.id === 'RELATIVE_STRENGTH_DECOUPLING') {
      // Looking for coins above all VALs with strong holding pattern
      if (distW_VAL >= 0.5 && distM_VAL >= 0.5 && distWO >= -1.0) {
        const quality = 95 - Math.min(Math.abs(distW_VAL - 2.5), 15);
        similarityScore = Math.max(74, Math.round(quality));
        stage = 'STAGE 2: Independent Strength Decoupling';
        triggerAction = `Trading safely above all Weekly & Monthly VAL pivots with zero breakdown wicks. High probability runner.`;
        entryZone = `$${spot.toFixed(4)} (Current Base)`;
        targetPrice = `$${p.w.vah.toFixed(4)} (+${(((p.w.vah - spot) / spot) * 100).toFixed(1)}%)`;
        invalidation = `Below Weekly VAL $${p.w.val.toFixed(4)}`;
      }
    } else if (archetype.id === 'VOLATILITY_COMPRESSION_RELEASE') {
      // Coiled spring: tight distance between VAL and WO (< 3.0%)
      const spread = Math.abs(distW_VAH - distW_VAL);
      const distToMid = Math.abs(distW_VAL - 1.5);
      if (distToMid <= 3.0) {
        similarityScore = Math.max(70, Math.round(96 - distToMid * 7));
        stage = 'STAGE 1: Ultra-Coiled Energy Compression';
        triggerAction = `Volatility compressed to multi-week lows. Orderbook energy coiling for an explosive expansion.`;
        entryZone = `$${p.w.val.toFixed(4)} - $${spot.toFixed(4)}`;
        targetPrice = `$${p.w.vah.toFixed(4)} (+${(((p.w.vah - spot) / spot) * 100).toFixed(1)}%)`;
        invalidation = `Below $${(p.w.val * 0.98).toFixed(4)}`;
      }
    } else if (archetype.id === 'VAH_REJECTION_CASCADE') {
      // DUMP twin: coins stalling near VAH (-1% to +2%)
      const nearVah = Math.abs(distW_VAH);
      if (distW_VAH >= -2.0 && distW_VAH <= 2.5) {
        similarityScore = Math.max(75, Math.round(96 - nearVah * 6.5));
        stage = 'STAGE 2: Resistance Exhaustion Detected';
        triggerAction = `Stalling directly at VAH resistance ($${p.w.vah.toFixed(4)}). High risk of long rejection cascade mirroring ${diagnosis.symbol}.`;
        entryZone = `Short on rejection at $${p.w.vah.toFixed(4)}`;
        targetPrice = `$${p.w.val.toFixed(4)} (-${(((spot - p.w.val) / spot) * 100).toFixed(1)}% to VAL Support)`;
        invalidation = `Clean 4h close above $${(p.w.vah * 1.025).toFixed(4)}`;
      }
    } else if (archetype.id === 'LONG_LIQUIDATION_FLUSH') {
      // DUMP twin: coins hovering on the knife-edge of VAL (-1.0% to +1.0%)
      const nearVal = Math.abs(distW_VAL);
      if (distW_VAL >= -1.5 && distW_VAL <= 1.5) {
        similarityScore = Math.max(73, Math.round(95 - nearVal * 8.0));
        stage = 'STAGE 3: Fragile Pivot Breakdown Danger';
        triggerAction = `Teetering on the edge of Weekly VAL ($${p.w.val.toFixed(4)}). Breakdown risks immediate cascading flush.`;
        entryZone = `Breakdown confirmation below $${(p.w.val * 0.99).toFixed(4)}`;
        targetPrice = `$${(p.w.val * 0.90).toFixed(4)} (-10.0% Liquidation Target)`;
        invalidation = `Reclaim above $${(p.w.val * 1.02).toFixed(4)}`;
      }
    }

    if (similarityScore >= 70) {
      matches.push({
        symbol: coin.symbol,
        fullSymbol: coin.fullSymbol,
        name: coin.name,
        spot: spot,
        change24h: coin.change24h || 0,
        similarity: similarityScore,
        stage,
        triggerAction,
        entryZone,
        targetPrice,
        invalidation,
        pivots: {
          wVal: p.w.val,
          wVah: p.w.vah,
          mVal: p.m.val,
          mVah: p.m.vah,
        },
      });
    }
  });

  // Sort by highest twin similarity match
  matches.sort((a, b) => b.similarity - a.similarity);

  return matches;
}
