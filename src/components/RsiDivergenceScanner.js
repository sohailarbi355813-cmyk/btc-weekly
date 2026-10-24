'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IconRadar,
  IconRefresh,
  IconTrendUp,
  IconTrendDown,
  IconBell,
  IconSearch,
  IconZap,
  IconCheck,
  IconX,
} from './Icons';

export default function RsiDivergenceScanner({ onSetAlert }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('4h'); // '4h' or '1h'
  const [filterDirection, setFilterDirection] = useState('all'); // 'all' | 'bull' | 'bear' | 'regular' | 'strong'
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch divergences for active timeframe
  const fetchDivergences = useCallback(async (tf = timeframe) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/divergence-scanner?timeframe=${tf}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to scan divergences');

      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Divergence scanner fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchDivergences(timeframe);
    const interval = setInterval(() => fetchDivergences(timeframe), 60000); // 1-minute auto poll
    return () => clearInterval(interval);
  }, [timeframe, fetchDivergences]);

  const handleTimeframeChange = (newTf) => {
    if (newTf === timeframe) return;
    setTimeframe(newTf);
    fetchDivergences(newTf);
  };

  // Filter and prepare list of diverging coins
  const filteredList = useMemo(() => {
    if (!data?.allCoins) return [];
    let list = data.allCoins.filter((c) => c.divergences && c.divergences.length > 0);

    // Filter by direction / strength
    if (filterDirection === 'bull') {
      list = list.filter((c) => c.hasBullishDiv);
    } else if (filterDirection === 'bear') {
      list = list.filter((c) => c.hasBearishDiv);
    } else if (filterDirection === 'regular') {
      list = list.filter((c) =>
        c.divergences.some((d) => d.type.startsWith('REGULAR'))
      );
    } else if (filterDirection === 'strong') {
      list = list.filter((c) => c.divergences.some((d) => d.isStrong));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      );
    }

    // Sort: most recent formation first, then by strongest RSI diff
    list.sort((a, b) => {
      const divA = a.primaryDiv;
      const divB = b.primaryDiv;
      if (!divA) return 1;
      if (!divB) return -1;
      if (divA.barsAgo !== divB.barsAgo) {
        return divA.barsAgo - divB.barsAgo; // closer to current candle first
      }
      return Math.abs(divB.rsiDiff || 0) - Math.abs(divA.rsiDiff || 0);
    });

    return list;
  }, [data, filterDirection, searchQuery]);

  return (
    <div style={{ background: '#000000', color: '#ffffff', minHeight: '80vh' }}>
      {/* ── Top Header Bar ── */}
      <div
        style={{
          borderBottom: '1px solid #1a1a1a',
          padding: '14px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: '#0d1829',
              border: '1px solid #38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconRadar size={18} color="#38bdf8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, letterSpacing: '0.02em' }}>
                RSI &amp; Price Action Divergence Scanner
              </h2>
              <span
                style={{
                  background: '#38bdf8',
                  color: '#000000',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 3,
                }}
              >
                LIVE 55 ALTS
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#888888' }}>
              Detects institutional exhaustion &amp; trend reversals: Price Higher Highs (HH) vs RSI Lower Highs (LH) &amp; Lower Lows (LL) vs RSI Higher Lows (HL)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Timeframe Switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#0a0a0a',
              border: '1px solid #222222',
              borderRadius: 6,
              padding: 2,
            }}
          >
            <button
              onClick={() => handleTimeframeChange('4h')}
              style={{
                background: timeframe === '4h' ? '#38bdf8' : 'transparent',
                color: timeframe === '4h' ? '#000000' : '#888888',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              4H Macro
            </button>
            <button
              onClick={() => handleTimeframeChange('1h')}
              style={{
                background: timeframe === '1h' ? '#38bdf8' : 'transparent',
                color: timeframe === '1h' ? '#000000' : '#888888',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              1H Intraday
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchDivergences(timeframe)}
            disabled={loading}
            style={{
              background: '#0c1322',
              border: '1px solid #222222',
              color: '#38bdf8',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.74rem',
              fontWeight: 600,
            }}
            title="Scan 55 coins for RSI Divergences"
          >
            <IconRefresh size={14} className={loading ? 'spin' : ''} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {/* ── Metric Summary Tiles ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          padding: '14px 20px',
          borderBottom: '1px solid #141414',
          background: '#040404',
        }}
      >
        {/* Bullish Tile */}
        <div
          onClick={() => setFilterDirection('bull')}
          style={{
            background: filterDirection === 'bull' ? '#061a10' : '#080808',
            border: `1px solid ${filterDirection === 'bull' ? '#22c55e' : '#1a1a1a'}`,
            borderRadius: 6,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#888888', fontWeight: 600 }}>
              BULLISH DIVERGENCES
            </span>
            <IconTrendUp size={16} color="#22c55e" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>
              {data?.bullishCount || 0}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#888888' }}>
              Reversal Long Opportunities
            </span>
          </div>
        </div>

        {/* Bearish Tile */}
        <div
          onClick={() => setFilterDirection('bear')}
          style={{
            background: filterDirection === 'bear' ? '#1c0909' : '#080808',
            border: `1px solid ${filterDirection === 'bear' ? '#ef4444' : '#1a1a1a'}`,
            borderRadius: 6,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#888888', fontWeight: 600 }}>
              BEARISH DIVERGENCES
            </span>
            <IconTrendDown size={16} color="#ef4444" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
              {data?.bearishCount || 0}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#888888' }}>
              Exhaustion / Short Warnings
            </span>
          </div>
        </div>

        {/* Total Scanned Tile */}
        <div
          onClick={() => setFilterDirection('all')}
          style={{
            background: filterDirection === 'all' ? '#081422' : '#080808',
            border: `1px solid ${filterDirection === 'all' ? '#38bdf8' : '#1a1a1a'}`,
            borderRadius: 6,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#888888', fontWeight: 600 }}>
              TOTAL DIVERGENCES ACTIVE
            </span>
            <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {timeframe.toUpperCase()} TF
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {filteredList.length}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#888888' }}>
              across 55 whitelisted alts
            </span>
          </div>
        </div>
      </div>

      {/* ── Sub-Filter Bar ── */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid #161616',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: '#020202',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <button
            className={`wolf-filter-btn ${filterDirection === 'all' ? 'active' : ''}`}
            onClick={() => setFilterDirection('all')}
          >
            All Divergences ({(data?.bullishCount || 0) + (data?.bearishCount || 0)})
          </button>
          <button
            className={`wolf-filter-btn ${filterDirection === 'bull' ? 'active' : ''}`}
            onClick={() => setFilterDirection('bull')}
            style={{
              borderColor: filterDirection === 'bull' ? '#22c55e' : undefined,
              color: filterDirection === 'bull' ? '#22c55e' : undefined,
            }}
          >
            🟢 Bullish Only ({data?.bullishCount || 0})
          </button>
          <button
            className={`wolf-filter-btn ${filterDirection === 'bear' ? 'active' : ''}`}
            onClick={() => setFilterDirection('bear')}
            style={{
              borderColor: filterDirection === 'bear' ? '#ef4444' : undefined,
              color: filterDirection === 'bear' ? '#ef4444' : undefined,
            }}
          >
            🔴 Bearish Only ({data?.bearishCount || 0})
          </button>
          <button
            className={`wolf-filter-btn ${filterDirection === 'regular' ? 'active' : ''}`}
            onClick={() => setFilterDirection('regular')}
            style={{
              borderColor: filterDirection === 'regular' ? '#eab308' : undefined,
              color: filterDirection === 'regular' ? '#fde047' : undefined,
            }}
            title="Show only Regular Classic Reversal Divergences (HH/LH or LL/HL)"
          >
            🎯 Classic Reversals
          </button>
          <button
            className={`wolf-filter-btn ${filterDirection === 'strong' ? 'active' : ''}`}
            onClick={() => setFilterDirection('strong')}
            style={{
              borderColor: filterDirection === 'strong' ? '#38bdf8' : undefined,
              color: filterDirection === 'strong' ? '#38bdf8' : undefined,
            }}
            title="Filter divergences with high RSI displacement (>4.0 pts)"
          >
            🔥 Strong Displacement
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="va-search-input"
            placeholder="Search coin (e.g. INJ, TIA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 190 }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#888888',
                cursor: 'pointer',
              }}
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Cards Grid ── */}
      <div style={{ padding: '16px 20px' }}>
        {loading && !data ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#666666' }}>
            <IconRefresh size={28} className="spin" style={{ marginBottom: 8 }} />
            <p>Scanning 55 whitelisted alts for RSI &amp; Price Action divergences...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div
            style={{
              padding: '3.5rem 2rem',
              textAlign: 'center',
              background: '#050505',
              border: '1px solid #161616',
              borderRadius: 8,
            }}
          >
            <IconRadar size={32} color="#444444" style={{ marginBottom: 10 }} />
            <h3 style={{ fontSize: '1rem', color: '#ffffff', margin: '0 0 6px' }}>
              No Divergences Match Current Filter
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#888888', maxWidth: 460, margin: '0 auto 14px', lineHeight: 1.5 }}>
              Try selecting the other timeframe (e.g. 1H Intraday vs 4H Macro) or toggling &apos;All Divergences&apos; to view all active setups across the 55 whitelisted coins.
            </p>
            <button
              onClick={() => {
                setFilterDirection('all');
                setSearchQuery('');
              }}
              style={{
                background: '#0c1322',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                padding: '6px 14px',
                borderRadius: 5,
                fontSize: '0.76rem',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: 14,
            }}
          >
            {filteredList.map((coin) => (
              <div
                key={coin.symbol}
                style={{
                  background: '#060606',
                  border: `1px solid ${
                    coin.hasBullishDiv
                      ? 'rgba(34, 197, 94, 0.35)'
                      : 'rgba(239, 68, 68, 0.35)'
                  }`,
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  transition: 'border-color 0.2s ease, transform 0.15s ease',
                }}
              >
                {/* Coin Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: '#111111',
                        border: '1px solid #222222',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#38bdf8',
                      }}
                    >
                      {coin.symbol.slice(0, 3)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
                          {coin.symbol}
                        </span>
                        <span style={{ fontSize: '0.62rem', color: '#666666' }}>
                          {coin.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontFamily: 'var(--font-mono)',
                          color: '#aaaaaa',
                          display: 'block',
                        }}
                      >
                        ${coin.spot}
                      </span>
                    </div>
                  </div>

                  {/* RSI Meter Badge */}
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        background:
                          (coin.currentRsi || 50) <= 32
                            ? 'rgba(34, 197, 94, 0.2)'
                            : (coin.currentRsi || 50) >= 68
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(56, 189, 248, 0.15)',
                        color:
                          (coin.currentRsi || 50) <= 32
                            ? '#22c55e'
                            : (coin.currentRsi || 50) >= 68
                            ? '#ef4444'
                            : '#38bdf8',
                        border: `1px solid ${
                          (coin.currentRsi || 50) <= 32
                            ? 'rgba(34, 197, 94, 0.4)'
                            : (coin.currentRsi || 50) >= 68
                            ? 'rgba(239, 68, 68, 0.4)'
                            : 'rgba(56, 189, 248, 0.3)'
                        }`,
                      }}
                      title={`Current ${timeframe.toUpperCase()} RSI: ${coin.currentRsi}`}
                    >
                      RSI {coin.currentRsi ?? '--'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.58rem',
                        color: '#666666',
                        display: 'block',
                        marginTop: 2,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {(coin.currentRsi || 50) <= 32
                        ? 'OVERSOLD'
                        : (coin.currentRsi || 50) >= 68
                        ? 'OVERBOUGHT'
                        : 'NEUTRAL ZONE'}
                    </span>
                  </div>
                </div>

                {/* Divergences list for this coin */}
                {coin.divergences.map((div, dIdx) => (
                  <div
                    key={dIdx}
                    style={{
                      background: div.direction === 'BULL' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                      border: `1px solid ${
                        div.direction === 'BULL' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'
                      }`,
                      borderRadius: 6,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                    }}
                  >
                    {/* Signal Title Banner */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          color: div.direction === 'BULL' ? '#22c55e' : '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {div.direction === 'BULL' ? <IconTrendUp size={14} color="#22c55e" /> : <IconTrendDown size={14} color="#ef4444" />}
                        {div.label}
                      </span>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          fontFamily: 'var(--font-mono)',
                          color: '#888888',
                        }}
                      >
                        {div.barsAgo === 0 ? 'Active Candle' : `${div.barsAgo} bars ago (${div.barsAgo * (timeframe === '4h' ? 4 : 1)}h)`}
                      </span>
                    </div>

                    {/* Side-by-Side: Price Action vs RSI Divergence */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        background: '#040404',
                        border: '1px solid #141414',
                        borderRadius: 5,
                        padding: '8px 10px',
                      }}
                    >
                      {/* Price Action Column */}
                      <div>
                        <span style={{ fontSize: '0.6rem', color: '#888888', fontWeight: 700, display: 'block' }}>
                          PRICE ACTION (PA)
                        </span>
                        <div style={{ marginTop: 2 }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: div.priceDiffPcnt >= 0 ? '#22c55e' : '#ef4444',
                            }}
                          >
                            {div.priceAction}
                          </span>
                          <span style={{ fontSize: '0.62rem', color: '#aaaaaa', display: 'block', fontFamily: 'var(--font-mono)' }}>
                            ${div.price1} ➔ ${div.price2} ({div.priceDiffPcnt >= 0 ? '+' : ''}{div.priceDiffPcnt}%)
                          </span>
                        </div>
                      </div>

                      {/* RSI Column */}
                      <div>
                        <span style={{ fontSize: '0.6rem', color: '#888888', fontWeight: 700, display: 'block' }}>
                          RSI DISPLACEMENT
                        </span>
                        <div style={{ marginTop: 2 }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: div.rsiDiff >= 0 ? '#22c55e' : '#ef4444',
                            }}
                          >
                            {div.rsiAction}
                          </span>
                          <span style={{ fontSize: '0.62rem', color: '#aaaaaa', display: 'block', fontFamily: 'var(--font-mono)' }}>
                            {div.rsi1} ➔ {div.rsi2} ({div.rsiDiff >= 0 ? '+' : ''}{div.rsiDiff} pts)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Invalidation / Action Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: '0.62rem', color: '#777777', fontStyle: 'italic' }}>
                        {div.direction === 'BULL' ? 'Bullish bounce signal' : 'Bearish rejection signal'}
                      </span>
                      {onSetAlert && (
                        <button
                          onClick={() =>
                            onSetAlert({
                              symbol: coin.symbol,
                              fullSymbol: coin.fullSymbol,
                              targetPrice: coin.spot,
                              condition: div.direction === 'BULL' ? 'price_above' : 'price_below',
                              note: `${div.label} on ${timeframe.toUpperCase()}`,
                            })
                          }
                          style={{
                            background: '#0a101d',
                            border: '1px solid #38bdf8',
                            color: '#38bdf8',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <IconBell size={11} />
                          <span>Set Alert</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Educational Legend Footer ── */}
      <div
        style={{
          borderTop: '1px solid #161616',
          padding: '12px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          fontSize: '0.68rem',
          color: '#666666',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <span>
            <strong style={{ color: '#ef4444' }}>Regular Bear Div:</strong> Price Higher High (HH) + RSI Lower High (LH) ➔ Exhaustion &amp; Reversal Short
          </span>
          <span>
            <strong style={{ color: '#22c55e' }}>Regular Bull Div:</strong> Price Lower Low (LL) + RSI Higher Low (HL) ➔ Reversal Long
          </span>
          <span>
            <strong style={{ color: '#38bdf8' }}>Hidden Divs:</strong> Trend continuation setups (pullback completed in direction of trend)
          </span>
        </div>
        <span>Synced: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
      </div>
    </div>
  );
}
