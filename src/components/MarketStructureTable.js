'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  IconRadar,
  IconRefresh,
  IconSearch,
  IconTrendUp,
  IconTrendDown,
  IconScale,
  IconCheck,
  IconZap,
} from './Icons';

function formatPrice(n) {
  if (!n) return '--';
  const num = Number(n);
  if (num >= 1000) return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return '$' + num.toFixed(num < 10 ? 4 : 2);
  return '$' + num.toFixed(5);
}

function TrendBadge({ tfData }) {
  if (!tfData) {
    return (
      <span style={{
        padding: '3px 8px',
        borderRadius: 12,
        fontSize: '0.66rem',
        fontFamily: 'var(--font-mono)',
        background: '#121212',
        color: '#555',
        border: '1px solid #222',
      }}>
        --
      </span>
    );
  }

  const { trend, label, lastEvent } = tfData;
  const isBull = trend === 'bullish';
  const isBear = trend === 'bearish';

  const bg = isBull ? 'rgba(34, 197, 94, 0.12)' : isBear ? 'rgba(239, 68, 68, 0.12)' : 'rgba(251, 191, 36, 0.12)';
  const border = isBull ? '1px solid rgba(34, 197, 94, 0.35)' : isBear ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(251, 191, 36, 0.35)';
  const color = isBull ? '#4ade80' : isBear ? '#f87171' : '#fbbf24';
  const dotColor = isBull ? '#22c55e' : isBear ? '#ef4444' : '#eab308';

  return (
    <div
      title={lastEvent || label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 12,
        fontSize: '0.68rem',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        background: bg,
        border,
        color,
        cursor: 'default',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dotColor,
        boxShadow: `0 0 6px ${dotColor}`,
      }} />
      <span>{label}</span>
    </div>
  );
}

export default function MarketStructureTable() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'bullish' | 'bearish' | 'confluence'
  const [sortBy, setSortBy] = useState('score_desc'); // 'score_desc' | 'score_asc' | 'name'
  const [expandedCoin, setExpandedCoin] = useState(null);

  const fetchStructure = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch('/api/market-structure');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load market structure:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStructure();
    const interval = setInterval(() => fetchStructure(true), 60000); // 60s background refresh
    return () => clearInterval(interval);
  }, []);

  const coins = data?.coins || [];

  // Filter & Sort
  const filteredCoins = useMemo(() => {
    return coins.filter((c) => {
      // Search filter
      const matchesSearch =
        c.symbol.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      // Category filter
      if (filterMode === 'bullish') return c.overallTrend === 'bullish';
      if (filterMode === 'bearish') return c.overallTrend === 'bearish';
      if (filterMode === 'confluence') {
        const tfList = Object.values(c.timeframes || {});
        const bullCount = tfList.filter((t) => t.trend === 'bullish').length;
        const bearCount = tfList.filter((t) => t.trend === 'bearish').length;
        return bullCount >= 4 || bearCount >= 4; // 4 or 5 timeframes aligned
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'score_desc') return b.score - a.score;
      if (sortBy === 'score_asc') return a.score - b.score;
      if (sortBy === 'name') return a.symbol.localeCompare(b.symbol);
      return 0;
    });
  }, [coins, search, filterMode, sortBy]);

  return (
    <div style={{
      background: '#040404',
      border: '1px solid #141414',
      borderRadius: 12,
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      marginBottom: 24,
    }}>
      {/* Top Ambient Glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '25%',
        right: '25%',
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.4), transparent)',
      }} />

      {/* Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 10px #38bdf8',
            }} />
            <h2 style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#ffffff',
              fontFamily: 'var(--font-mono)'
            }}>
              Multi-Timeframe Market Structure Matrix
            </h2>
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: '0.62rem',
              fontWeight: 800,
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontFamily: 'var(--font-mono)'
            }}>
              2-CANDLE CONFIRMATION BOS/MSS
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#777777', marginTop: 4 }}>
            Tracks confirmed swing structural hierarchy (HH, HL, LH, LL) and break of structure across 15M, 1H, 4H, 1D, 1W.
          </div>
        </div>

        {/* Refresh & Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#090909',
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid #1a1a1a',
            fontSize: '0.70rem',
            fontFamily: 'var(--font-mono)'
          }}>
            <span style={{ color: '#4ade80' }}>● {data?.bullishCount || 0} Bull</span>
            <span style={{ color: '#f87171' }}>● {data?.bearishCount || 0} Bear</span>
            <span style={{ color: '#fbbf24' }}>● {data?.neutralCount || 0} Range</span>
          </div>

          <button
            onClick={() => fetchStructure(true)}
            disabled={refreshing}
            style={{
              padding: '6px 12px',
              background: '#111',
              border: '1px solid #222',
              borderRadius: 6,
              color: '#38bdf8',
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <IconRefresh size={12} className={refreshing ? 'spin-icon' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        background: '#070707',
        border: '1px solid #151515',
        borderRadius: 8,
        padding: '8px 12px',
        marginBottom: 16,
      }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All Coins (${coins.length})` },
            { id: 'bullish', label: `Bullish Structure (${data?.bullishCount || 0})` },
            { id: 'bearish', label: `Bearish Structure (${data?.bearishCount || 0})` },
            { id: 'confluence', label: '⚡ HTF Alignment (4+ Aligned)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
                background: filterMode === tab.id ? '#1c1c1c' : 'transparent',
                color: filterMode === tab.id ? '#ffffff' : '#777777',
                border: filterMode === tab.id ? '1px solid #333' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: 200 }}>
          <IconSearch size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <input
            type="text"
            placeholder="Search coin (e.g. ASTER, SOL, BTC)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 10px 5px 28px',
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: 4,
              color: '#fff',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.76rem',
          fontFamily: 'var(--font-mono)',
        }}>
          <thead>
            <tr style={{
              borderBottom: '1px solid #1a1a1a',
              color: '#888888',
              fontSize: '0.66rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              textAlign: 'left',
            }}>
              <th style={{ padding: '12px 14px' }}>Coin</th>
              <th style={{ padding: '12px 14px' }}>Live Price</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>15M</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>1H</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>4H</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>1D</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>1W</th>
              <th
                onClick={() => setSortBy(sortBy === 'score_desc' ? 'score_asc' : 'score_desc')}
                style={{
                  padding: '12px 14px',
                  textAlign: 'right',
                  cursor: 'pointer',
                  userSelect: 'none',
                  color: '#38bdf8'
                }}
              >
                Score / 100 {sortBy === 'score_desc' ? '↓' : '↑'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  <IconRadar size={24} color="#38bdf8" className="spin-icon" style={{ margin: '0 auto 8px' }} />
                  <div>Scanning 55 Altcoin structures across 15M, 1H, 4H, 1D, 1W...</div>
                </td>
              </tr>
            ) : filteredCoins.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                  No coins found matching &ldquo;{search}&rdquo;
                </td>
              </tr>
            ) : (
              filteredCoins.map((coin) => {
                const isExpanded = expandedCoin === coin.symbol;
                const isBull = coin.overallTrend === 'bullish';
                const isBear = coin.overallTrend === 'bearish';
                const scoreColor = isBull ? '#4ade80' : isBear ? '#f87171' : '#fbbf24';
                const avatarLetter = coin.symbol.slice(0, 3).toUpperCase();

                return (
                  <React.Fragment key={coin.symbol}>
                    <tr
                      onClick={() => setExpandedCoin(isExpanded ? null : coin.symbol)}
                      style={{
                        borderBottom: '1px solid #111111',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        background: isExpanded ? '#0c0c0c' : 'transparent',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#0a0a0a')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = isExpanded ? '#0c0c0c' : 'transparent')}
                    >
                      {/* 1. Coin Column (Matches User Screenshot) */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#18120e',
                            border: '1px solid #2d2019',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            color: '#d97706',
                            flexShrink: 0,
                          }}>
                            {avatarLetter}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.82rem' }}>
                              {coin.symbol}
                            </div>
                            <div style={{ fontSize: '0.64rem', color: '#666', marginTop: 1 }}>
                              {coin.sector}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Live Price (Neon Green like screenshot) */}
                      <td style={{ padding: '12px 14px', color: '#4ade80', fontWeight: 700, fontSize: '0.84rem' }}>
                        {formatPrice(coin.price)}
                      </td>

                      {/* 3. 15M Trend Badge */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <TrendBadge tfData={coin.timeframes?.['15m']} />
                      </td>

                      {/* 4. 1H Trend Badge */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <TrendBadge tfData={coin.timeframes?.['1h']} />
                      </td>

                      {/* 5. 4H Trend Badge */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <TrendBadge tfData={coin.timeframes?.['4h']} />
                      </td>

                      {/* 6. 1D Trend Badge */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <TrendBadge tfData={coin.timeframes?.['1d']} />
                      </td>

                      {/* 7. 1W Trend Badge */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <TrendBadge tfData={coin.timeframes?.['1w']} />
                      </td>

                      {/* 8. Score / 100 Column (Matches User Screenshot with bar) */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', minWidth: 160 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 900, color: '#ffffff' }}>
                            {coin.score}/100
                          </span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: scoreColor }}>
                            {coin.overallLabel}
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div style={{
                          width: '100%',
                          height: 4,
                          background: '#181818',
                          borderRadius: 2,
                          overflow: 'hidden',
                          display: 'flex',
                          justifyContent: 'flex-end',
                        }}>
                          <div style={{
                            width: `${coin.score}%`,
                            height: '100%',
                            background: scoreColor,
                            borderRadius: 2,
                          }} />
                        </div>
                      </td>
                    </tr>

                    {/* Detailed Drawer on Row Click */}
                    {isExpanded && (
                      <tr style={{ background: '#080808' }}>
                        <td colSpan={8} style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1a' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 10,
                            borderBottom: '1px solid #141414',
                            paddingBottom: 8,
                          }}>
                            <span style={{ fontSize: '0.70rem', color: '#38bdf8', fontWeight: 700 }}>
                              {coin.displaySymbol} &middot; Detailed 2-Candle Market Structure Breakdown:
                            </span>
                            <a
                              href={`https://www.tradingview.com/chart/?symbol=BYBIT:${coin.fullSymbol}.P`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#38bdf8', fontSize: '0.68rem', textDecoration: 'none' }}
                            >
                              Open in TradingView &rarr;
                            </a>
                          </div>

                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 10,
                          }}>
                            {['15m', '1h', '4h', '1d', '1w'].map((tfKey) => {
                              const t = coin.timeframes?.[tfKey];
                              if (!t) return null;
                              return (
                                <div
                                  key={tfKey}
                                  style={{
                                    background: '#0d0d0d',
                                    border: '1px solid #1a1a1a',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontWeight: 800, color: '#ffffff' }}>{tfKey.toUpperCase()}</span>
                                    <TrendBadge tfData={t} />
                                  </div>
                                  <div style={{ fontSize: '0.66rem', color: '#888', marginTop: 4 }}>
                                    Last Event: <strong style={{ color: '#e5e5e5' }}>{t.lastEvent}</strong>
                                  </div>
                                  <div style={{ fontSize: '0.62rem', color: '#666', marginTop: 3 }}>
                                    High: ${t.prevHigh || '--'} | Low: ${t.prevLow || '--'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

