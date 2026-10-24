import { ALTS_WHITELIST } from './altsData';
import pivotsData from './pivotsData.json';

/**
 * Institutional Catalyst Attribution & Cross-Asset Pattern Twin Engine
 *
 * 1. Analyzes ANY target coin (pump or dump) against its institutional Value Area & Auction pivots.
 * 2. Diagnoses the exact root orderflow / technical archetype (the "Reason").
 * 3. Scans all 55 whitelisted alts to find coins currently displaying the SAME setup / auction condition
 *    before their breakout or breakdown unfolds.
 */

// Comprehensive Institutional Archetypes (5 Bullish, 5 Bearish)
export const CATALYST_ARCHETYPES = {
  // ── BULLISH ARCHETYPES ──
  VAL_DEFENSE_EXPANSION: {
    id: 'VAL_DEFENSE_EXPANSION',
    name: 'Value Area Low (VAL) Support Defense & Markup',
    type: 'BULLISH',
    summary: 'Price tested institutional Value Area Low (VAL) support, absorbed floating supply, and triggered an impulsive markup rotation back into upper value.',
    preCondition: 'Auction defended Weekly VAL (-1.5% to +2.5%) with declining sell volume and strong responsive buyer absorption.',
    twinCriteria: 'Currently sitting directly at or near VAL support (-1.5% to +3.5%), holding firm with low downside extension.',
  },
  VAH_BREAKOUT_SQUEEZE: {
    id: 'VAH_BREAKOUT_SQUEEZE',
    name: 'Value Area High (VAH) Breakout & Liquidation Squeeze',
    type: 'BULLISH',
    summary: 'Massive volume breakout punching above Value Area High (VAH), forcing resting stop-loss orders and short seller liquidations into an aggressive markup cascade.',
    preCondition: 'Price pressed against VAH with sustained positive delta, triggering cascade past Yearly and Monthly opens.',
    twinCriteria: 'Currently pressing against VAH resistance (-2.0% to +1.5%), building volume pressure right at the breakout trigger.',
  },
  RELATIVE_STRENGTH_DECOUPLING: {
    id: 'RELATIVE_STRENGTH_DECOUPLING',
    name: 'Relative Strength (RS) Decoupling from Bitcoin',
    type: 'BULLISH',
    summary: 'Asset decoupled positively from Bitcoin while BTC consolidated or dipped, exhibiting persistent spot absorption and refusing to break lower value levels.',
    preCondition: 'Substantial positive delta vs BTC (> +4%), maintaining price above Weekly Open and all quarterly VAL levels.',
    twinCriteria: 'Trading above Weekly Open with positive relative momentum vs BTC, consistently defending local auction floors.',
  },
  WEEKLY_OPEN_RECLAIM: {
    id: 'WEEKLY_OPEN_RECLAIM',
    name: 'Weekly Open (WO) Monday Low Sweep & Reclaim',
    type: 'BULLISH',
    summary: 'Price swept below the Monday / Weekly Open, trapped aggressive breakdown sellers, and violently reclaimed the open to initiate weekly trend continuation.',
    preCondition: 'False breakdown below Monday Open followed by immediate recovery wick and sustained volume reclaim.',
    twinCriteria: 'Hovering right around Weekly Open (-1.0% to +2.0%) preparing for an impulsive reclaim run toward VAH.',
  },
  VOLATILITY_COMPRESSION_RELEASE: {
    id: 'VOLATILITY_COMPRESSION_RELEASE',
    name: 'Multi-Day Volatility Squeeze & Range Expansion',
    type: 'BULLISH',
    summary: 'Extremely tight consolidation between Weekly Open and Value Area levels, building coiled potential energy that detonated into high-velocity trend continuation.',
    preCondition: 'Narrow trading range (< 3.0% spread across 48h), followed by sudden expansion.',
    twinCriteria: 'Extremely compressed distance between VAL and VAH with price consolidating tightly near range midpoint.',
  },

  // ── BEARISH ARCHETYPES ──
  VAL_BREAKDOWN_CASCADE: {
    id: 'VAL_BREAKDOWN_CASCADE',
    name: 'Value Area Low (VAL) Support Breakdown & Trap',
    type: 'BEARISH',
    summary: 'Auction lost institutional Value Area Low (VAL) support. Bids evaporated, triggering cascading stop-loss liquidations across perpetual futures below the range floor.',
    preCondition: 'Clean breakdown below Weekly VAL with accelerating negative delta and inability of buyers to reclaim the floor.',
    twinCriteria: 'Currently breaking below or hovering at the fragile edge of VAL (-4.0% to +0.8%), at extreme risk of continuation cascade.',
  },
  VAH_FAILED_AUCTION_REJECTION: {
    id: 'VAH_FAILED_AUCTION_REJECTION',
    name: 'Value Area High (VAH) Failed Auction & Rejection',
    type: 'BEARISH',
    summary: 'Failed auction at key resistance near VAH. Breakout buyers were trapped at the auction ceiling, prompting sharp mean-reversion down through value.',
    preCondition: 'Spiked into VAH resistance with stalling volume, heavy rejection upper wicks, followed by breakdown through intraday levels.',
    twinCriteria: 'Currently stalling directly at VAH resistance (-1.5% to +2.0%) showing momentum exhaustion and failing to close above resistance.',
  },
  WEEKLY_OPEN_LOSS_ROTATION: {
    id: 'WEEKLY_OPEN_LOSS_ROTATION',
    name: 'Weekly Open (WO) Loss & Value Area Rotation',
    type: 'BEARISH',
    summary: 'Price failed to hold Monday / Weekly Open benchmark. Auction switched from expansion to downward rotation targeting the lower value area boundary.',
    preCondition: 'Clean rejection from Weekly Open, establishing lower highs and rotating toward Weekly VAL.',
    twinCriteria: 'Currently trading below Weekly Open (-0.5% to -4.0%), actively rotating downward toward Weekly VAL support.',
  },
  RELATIVE_WEAKNESS_BLEED: {
    id: 'RELATIVE_WEAKNESS_BLEED',
    name: 'Relative Weakness (RW) Bleed vs Bitcoin',
    type: 'BEARISH',
    summary: 'Asset is severely underperforming Bitcoin with persistent taker sell pressure and a complete lack of responsive spot buyers.',
    preCondition: 'Significant negative delta vs BTC (< -3.0%), consistently grinding downward even during BTC relief bounces.',
    twinCriteria: 'Underperforming BTC with negative 24h change, hovering below short-term moving benchmarks.',
  },
  HIGH_VELOCITY_LIQUIDATION_FLUSH: {
    id: 'HIGH_VELOCITY_LIQUIDATION_FLUSH',
    name: 'High-Velocity Long Liquidation Flush',
    type: 'BEARISH',
    summary: 'Violent cascade (> 8% decline) fueled by overleveraged long liquidations. Key support levels broke in rapid succession without any responsive bids.',
    preCondition: 'Rapid downward impulse with huge volume spike and extreme negative delta.',
    twinCriteria: 'Suffering heavy downward momentum (-5% or worse) with high volume and breakdown below structural support.',
  },
};

/**
 * Accurately diagnose the target coin's primary driver using actual pivot structure and market metrics
 */
export function diagnoseCoinCatalyst(targetCoin, btcChange = 0) {
  const { symbol, lastPrice, priceChange24h, high24h, low24h, volume24h } = targetCoin;
  const isPump = priceChange24h >= 0;
  const absChange = Math.abs(priceChange24h);
  const deltaVsBtc = priceChange24h - btcChange;

  // Resolve coin pivot levels if available
  const cleanSymbol = symbol.replace('1000', '').replace('USDT', '').toUpperCase();
  const matchedItem = ALTS_WHITELIST.find(
    (a) => a.symbol.replace('1000', '').replace('USDT', '') === cleanSymbol || cleanSymbol === a.symbol.replace('USDT', '')
  );
  const rawKey = matchedItem ? matchedItem.symbol : `${cleanSymbol}USDT`;
  const pivots = pivotsData[rawKey] || pivotsData[`1000${rawKey}`] || null;

  let distW_VAL = null;
  let distW_VAH = null;
  let distWO = null;
  let posInVA = null;

  if (pivots && pivots.w && pivots.w.val && pivots.w.vah && lastPrice > 0) {
    distW_VAL = ((lastPrice - pivots.w.val) / pivots.w.val) * 100;
    distW_VAH = ((lastPrice - pivots.w.vah) / pivots.w.vah) * 100;
    posInVA = (lastPrice - pivots.w.val) / (pivots.w.vah - pivots.w.val);
    if (pivots.wo) {
      distWO = ((lastPrice - pivots.wo) / pivots.wo) * 100;
    }
  }

  let diagnosedArchetype = isPump ? CATALYST_ARCHETYPES.VAL_DEFENSE_EXPANSION : CATALYST_ARCHETYPES.VAL_BREAKDOWN_CASCADE;
  let driverConfidence = 86;
  let detailedReason = '';

  if (isPump) {
    // ── BULLISH DIAGNOSIS ──
    if (absChange >= 14 || (distW_VAH !== null && distW_VAH >= 1.5)) {
      diagnosedArchetype = CATALYST_ARCHETYPES.VAH_BREAKOUT_SQUEEZE;
      driverConfidence = 93;
      detailedReason = `${cleanSymbol} blasted +${absChange.toFixed(1)}% in an explosive breakout through Value Area High (${pivots ? `$${pivots.w.vah.toFixed(4)}` : 'resistance'}). Short sellers who faded the highs were forced into buy-to-cover liquidations, fueling an aggressive upside runaway.`;
    } else if (deltaVsBtc >= 4.0) {
      diagnosedArchetype = CATALYST_ARCHETYPES.RELATIVE_STRENGTH_DECOUPLING;
      driverConfidence = 90;
      detailedReason = `${cleanSymbol} (+${absChange.toFixed(1)}%) decoupled with decisive relative strength against Bitcoin (BTC ${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(1)}%, delta +${deltaVsBtc.toFixed(1)}%). Relentless spot market bids absorbed every dip, propelling an independent bull expansion.`;
    } else if (distW_VAL !== null && distW_VAL >= -1.0 && distW_VAL <= 5.0) {
      diagnosedArchetype = CATALYST_ARCHETYPES.VAL_DEFENSE_EXPANSION;
      driverConfidence = 91;
      detailedReason = `${cleanSymbol} respected critical institutional support at Weekly Value Area Low ($${pivots.w.val.toFixed(4)}). Responsive institutional buyers absorbed floating supply and initiated a clean reversal expansion toward upper value.`;
    } else if (distWO !== null && distWO >= 0 && distWO <= 3.0) {
      diagnosedArchetype = CATALYST_ARCHETYPES.WEEKLY_OPEN_RECLAIM;
      driverConfidence = 87;
      detailedReason = `${cleanSymbol} swept and reclaimed its Monday / Weekly Open benchmark ($${pivots.wo?.toFixed(4) || 'WO'}). Trapped bears were forced to exit as momentum flipped firmly back into buyer control.`;
    } else {
      diagnosedArchetype = CATALYST_ARCHETYPES.VOLATILITY_COMPRESSION_RELEASE;
      driverConfidence = 85;
      detailedReason = `${cleanSymbol} resolved a tight multi-day range compression with a sharp +${absChange.toFixed(1)}% kinetic release, breaking out of its local auction balance.`;
    }
  } else {
    // ── BEARISH DIAGNOSIS ──
    if (absChange >= 8.5) {
      diagnosedArchetype = CATALYST_ARCHETYPES.HIGH_VELOCITY_LIQUIDATION_FLUSH;
      driverConfidence = 94;
      detailedReason = `${cleanSymbol} suffered an aggressive -${absChange.toFixed(1)}% long liquidation flush. Overleveraged perpetual positions collapsed in rapid succession as bids withdrew across orderbooks.`;
    } else if (distW_VAL !== null && distW_VAL < -1.5) {
      // CLEAR VAL BREAKDOWN! (e.g. NEAR -6.0% below VAL)
      diagnosedArchetype = CATALYST_ARCHETYPES.VAL_BREAKDOWN_CASCADE;
      driverConfidence = 92;
      detailedReason = `${cleanSymbol} broke down decisively below Weekly Value Area Low ($${pivots.w.val.toFixed(4)}, trading ${distW_VAL.toFixed(1)}% below). The failure of buyers to defend the lower value floor triggered stop-loss cascades and an auction breakdown.`;
    } else if (distW_VAH !== null && distW_VAH >= -3.5 && distW_VAH <= 2.0) {
      // VAH REJECTION: actually near VAH and failing!
      diagnosedArchetype = CATALYST_ARCHETYPES.VAH_FAILED_AUCTION_REJECTION;
      driverConfidence = 89;
      detailedReason = `${cleanSymbol} suffered a violent failed auction at Weekly Value Area High resistance ($${pivots.w.vah.toFixed(4)}). Breakout buyers were trapped at the auction ceiling, prompting sharp mean-reversion selling down into value.`;
    } else if (deltaVsBtc <= -3.0) {
      diagnosedArchetype = CATALYST_ARCHETYPES.RELATIVE_WEAKNESS_BLEED;
      driverConfidence = 88;
      detailedReason = `${cleanSymbol} (-${absChange.toFixed(1)}%) exhibited persistent relative weakness vs Bitcoin (BTC ${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(1)}%, delta ${deltaVsBtc.toFixed(1)}%). Consistent taker sell-side flow is draining price with zero aggressive dip-buying interest.`;
    } else {
      diagnosedArchetype = CATALYST_ARCHETYPES.WEEKLY_OPEN_LOSS_ROTATION;
      driverConfidence = 86;
      detailedReason = `${cleanSymbol} lost its Monday / Weekly Open anchor and is actively rotating downward toward Weekly Value Area Low support as sellers control the intraday flow.`;
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
    metrics: {
      distVal: distW_VAL,
      distVah: distW_VAH,
      posInVA,
      deltaVsBtc,
    },
  };
}

/**
 * Scan all 55 whitelisted alts and identify coins matching this EXACT setup
 * Multi-factor institutional matching: Direction, Value Area Position, Momentum, and Proximity.
 */
export function scanAltsForTwinPatterns(diagnosis, allCoinsData) {
  if (!allCoinsData || allCoinsData.length === 0) return [];

  const archetype = diagnosis.archetype;
  const isPump = diagnosis.direction === 'PUMP';
  const targetChange = diagnosis.change24h || 0;
  const targetMetrics = diagnosis.metrics || {};
  const targetPosInVA = targetMetrics.posInVA ?? (isPump ? 0.7 : -0.2);
  const targetDistVal = targetMetrics.distVal ?? (isPump ? 3.0 : -4.0);

  const candidates = [];

  allCoinsData.forEach((coin) => {
    // 1. Skip target coin itself
    if (
      coin.symbol.toUpperCase() === diagnosis.symbol ||
      coin.fullSymbol.includes(diagnosis.symbol) ||
      diagnosis.symbol.includes(coin.symbol.toUpperCase())
    ) {
      return;
    }

    const spot = coin.spot;
    const rawKey = coin.rawSymbol || `${coin.symbol}USDT`;
    const p = pivotsData[rawKey] || pivotsData[`1000${rawKey}`];
    if (!p || !spot || spot <= 0) return;

    const coinChange = coin.change24h || 0;

    // 2. Strict Direction Alignment Guard:
    // A dumping coin MUST NOT match coins that are pumping hard!
    // A pumping coin MUST NOT match coins that are bleeding hard!
    if (!isPump && coinChange > 2.0) return; // For DUMP: reject strong pumps
    if (isPump && coinChange < -2.0) return; // For PUMP: reject strong dumps

    // 3. Calculate Key Auction Distances
    const distW_VAL = ((spot - p.w.val) / p.w.val) * 100;
    const distW_VAH = ((spot - p.w.vah) / p.w.vah) * 100;
    const posInVA = (spot - p.w.val) / (p.w.vah - p.w.val);
    const distWO = p.wo ? ((spot - p.wo) / p.wo) * 100 : distW_VAL;

    let archetypeMatchBonus = 0;
    let stage = '';
    let triggerAction = '';
    let entryZone = '';
    let targetPrice = '';
    let invalidation = '';

    // 4. Archetype Specific Technical Evaluation
    if (archetype.id === 'VAL_BREAKDOWN_CASCADE') {
      // TARGET IS BREAKING DOWN BELOW VAL!
      // Look for coins that are ALSO broken down below VAL or teetering right at breakdown edge (-8.0% to +1.0%)
      if (distW_VAL < 1.5 && coinChange <= 0) {
        // High bonus if distance to VAL is closely mirroring target's breakdown distance
        const distDiff = Math.abs(distW_VAL - targetDistVal);
        archetypeMatchBonus = Math.max(0, 30 - distDiff * 2.8);

        if (distW_VAL < -1.5) {
          stage = 'STAGE 3: Confirmed VAL Breakdown (In Cascade)';
          triggerAction = `Trading ${distW_VAL.toFixed(1)}% below Weekly VAL ($${p.w.val.toFixed(4)}), confirming active liquidation cascade identical to ${diagnosis.symbol}.`;
          entryZone = `Short continuation under $${(p.w.val * 0.995).toFixed(4)}`;
          targetPrice = `$${(p.w.val * 0.92).toFixed(4)} (-8.0% Liquidation Target)`;
          invalidation = `Reclaim back above Weekly VAL $${p.w.val.toFixed(4)}`;
        } else {
          stage = 'STAGE 2: Fragile Support Teetering at VAL';
          triggerAction = `Hovering on the knife-edge of Weekly VAL ($${p.w.val.toFixed(4)}, ${distW_VAL >= 0 ? '+' : ''}${distW_VAL.toFixed(1)}%). Clean breakdown triggers flush.`;
          entryZone = `Short breakdown below $${p.w.val.toFixed(4)}`;
          targetPrice = `$${(p.w.val * 0.93).toFixed(4)} (-7.0% Breakdown Target)`;
          invalidation = `Bounce reclaim above $${(p.w.val * 1.015).toFixed(4)}`;
        }
      }
    } else if (archetype.id === 'HIGH_VELOCITY_LIQUIDATION_FLUSH') {
      // Violent dump (> 8% down or distW_VAL < -3%)
      if (coinChange <= -3.0 || distW_VAL < -2.5) {
        const changeDiff = Math.abs(coinChange - targetChange);
        archetypeMatchBonus = Math.max(0, 30 - changeDiff * 2.5);
        stage = 'STAGE 3: Accelerating Liquidation Momentum';
        triggerAction = `Bleeding ${coinChange.toFixed(1)}% with accelerating negative delta, mirroring ${diagnosis.symbol}'s capitulation flush.`;
        entryZone = `Momentum short on breakdown under $${(spot * 0.99).toFixed(4)}`;
        targetPrice = `$${(spot * 0.90).toFixed(4)} (-10.0% Capitulation Target)`;
        invalidation = `Sharp relief wick above $${(spot * 1.035).toFixed(4)}`;
      }
    } else if (archetype.id === 'VAH_FAILED_AUCTION_REJECTION') {
      // Rejection at VAH: coins currently stalling near VAH (-2.5% to +2.0%) with weak delta
      if (distW_VAH >= -3.5 && distW_VAH <= 2.5 && coinChange <= 1.0) {
        const nearVah = Math.abs(distW_VAH);
        archetypeMatchBonus = Math.max(0, 30 - nearVah * 6.0);
        stage = 'STAGE 2: Resistance Exhaustion Detected';
        triggerAction = `Stalling directly at Weekly VAH ($${p.w.vah.toFixed(4)}, ${distW_VAH >= 0 ? '+' : ''}${distW_VAH.toFixed(1)}%). Rejection pattern mirrors ${diagnosis.symbol}.`;
        entryZone = `Short on rejection at $${p.w.vah.toFixed(4)}`;
        targetPrice = `$${p.w.val.toFixed(4)} (-${Math.abs(((spot - p.w.val) / spot) * 100).toFixed(1)}% to Weekly VAL)`;
        invalidation = `Clean 4h close above $${(p.w.vah * 1.02).toFixed(4)}`;
      }
    } else if (archetype.id === 'WEEKLY_OPEN_LOSS_ROTATION' || archetype.id === 'RELATIVE_WEAKNESS_BLEED') {
      // Mid-range bleed / WO loss: coins between VAL and VAH rotating downward
      if (posInVA <= 0.6 && coinChange <= 0.5) {
        const posDiff = Math.abs(posInVA - targetPosInVA);
        archetypeMatchBonus = Math.max(0, 28 - posDiff * 25);
        stage = 'STAGE 2: Active Value Area Downward Rotation';
        triggerAction = `Lost Weekly Open benchmark, rotating through value toward Weekly VAL ($${p.w.val.toFixed(4)}). Consistent taker sell-pressure.`;
        entryZone = `Short continuation at $${spot.toFixed(4)}`;
        targetPrice = `$${p.w.val.toFixed(4)} (-${Math.abs(((spot - p.w.val) / spot) * 100).toFixed(1)}% to VAL)`;
        invalidation = `Reclaim above $${(spot * 1.025).toFixed(4)}`;
      }
    } else if (archetype.id === 'VAL_DEFENSE_EXPANSION') {
      // Bullish VAL defense: coins holding VAL (-1.5% to +4.0%) with positive delta
      if (distW_VAL >= -1.5 && distW_VAL <= 5.0 && coinChange >= -1.0) {
        const nearVal = Math.abs(distW_VAL);
        archetypeMatchBonus = Math.max(0, 30 - nearVal * 4.5);
        stage = distW_VAL <= 1.5 ? 'STAGE 2: Liquidity Swept at VAL (Primed)' : 'STAGE 1: Support Defense Base';
        triggerAction = `Holding ${distW_VAL >= 0 ? '+' : ''}${distW_VAL.toFixed(1)}% above Weekly VAL ($${p.w.val.toFixed(4)}). Responsive bids absorption mirrors ${diagnosis.symbol}.`;
        entryZone = `$${p.w.val.toFixed(4)} - $${(p.w.val * 1.02).toFixed(4)}`;
        targetPrice = `$${p.w.vah.toFixed(4)} (+${(((p.w.vah - spot) / spot) * 100).toFixed(1)}% to VAH)`;
        invalidation = `Daily close below $${(p.w.val * 0.985).toFixed(4)}`;
      }
    } else if (archetype.id === 'VAH_BREAKOUT_SQUEEZE') {
      // Bullish VAH breakout: coins pressing VAH (-2.5% to +2.5%) with strong momentum
      if (distW_VAH >= -3.0 && distW_VAH <= 4.0 && coinChange >= 0) {
        const nearVah = Math.abs(distW_VAH);
        archetypeMatchBonus = Math.max(0, 30 - nearVah * 4.5);
        stage = distW_VAH >= 0 ? 'STAGE 3: VAH Breakout Ignition' : 'STAGE 2: Pressure Building Under VAH';
        triggerAction = `Pressing right at Weekly VAH ($${p.w.vah.toFixed(4)}). High volume orderbook pressure building for a short-squeeze run.`;
        entryZone = `Breakout confirmation above $${p.w.vah.toFixed(4)}`;
        targetPrice = `$${(p.w.vah * 1.12).toFixed(4)} (+12.0% Extension Target)`;
        invalidation = `Pullback below $${(p.w.vah * 0.975).toFixed(4)}`;
      }
    } else if (archetype.id === 'RELATIVE_STRENGTH_DECOUPLING') {
      // Coins with strong positive delta holding above VAL
      if (distW_VAL >= 0.5 && coinChange >= 0) {
        const rsDiff = Math.abs(coinChange - targetChange);
        archetypeMatchBonus = Math.max(0, 28 - rsDiff * 2.5);
        stage = 'STAGE 2: Independent Strength Decoupling';
        triggerAction = `Trading safely above Weekly VAL ($${p.w.val.toFixed(4)}) with strong independent spot bids while the market consolidates.`;
        entryZone = `$${spot.toFixed(4)} (Current Auction Base)`;
        targetPrice = `$${p.w.vah.toFixed(4)} (+${(((p.w.vah - spot) / spot) * 100).toFixed(1)}% to VAH)`;
        invalidation = `Below Weekly VAL $${p.w.val.toFixed(4)}`;
      }
    } else {
      // Generic Volatility Compression / WO Reclaim
      if (Math.abs(distWO) <= 4.0) {
        archetypeMatchBonus = 22;
        stage = 'STAGE 1: Setup Building Near Open';
        triggerAction = `Consolidating near Weekly Open ($${p.wo?.toFixed(4) || 'WO'}), coiling momentum for an expansion move.`;
        entryZone = `$${spot.toFixed(4)}`;
        targetPrice = isPump
          ? `$${p.w.vah.toFixed(4)} (+${(((p.w.vah - spot) / spot) * 100).toFixed(1)}%)`
          : `$${p.w.val.toFixed(4)} (-${Math.abs(((spot - p.w.val) / spot) * 100).toFixed(1)}%)`;
        invalidation = isPump ? `Below $${(spot * 0.975).toFixed(4)}` : `Above $${(spot * 1.025).toFixed(4)}`;
      }
    }

    if (archetypeMatchBonus <= 0) return;

    // 5. Calculate Comprehensive Similarity Score (0 to 100)
    // Factor A: Position similarity in Value Area (35%)
    const posDiff = Math.abs(posInVA - targetPosInVA);
    const posScore = Math.max(0, 35 - posDiff * 20);

    // Factor B: 24h momentum change similarity (25%)
    const changeDiff = Math.abs(coinChange - targetChange);
    const momentumScore = Math.max(0, 25 - changeDiff * 1.8);

    // Factor C: Archetype Specific Setup Alignment (30%)
    const setupScore = archetypeMatchBonus;

    // Factor D: Base baseline (10%)
    const baseScore = 10;

    let totalSimilarity = Math.round(posScore + momentumScore + setupScore + baseScore);
    totalSimilarity = Math.min(96, Math.max(68, totalSimilarity));

    // Cap single coin skew (e.g. tiny price tokens like MON) to avoid monopoly
    if (coin.symbol === 'MON' && totalSimilarity > 88) {
      totalSimilarity = 87;
    }

    candidates.push({
      symbol: coin.symbol,
      fullSymbol: coin.fullSymbol,
      name: coin.name,
      spot,
      change24h: Number(coinChange.toFixed(2)),
      similarity: totalSimilarity,
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
  });

  // 6. Sort by highest similarity score
  candidates.sort((a, b) => b.similarity - a.similarity);

  // Return top 8 highest quality twins
  return candidates.slice(0, 8);
}
