'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// Lightweight inline icons
function IconRadar({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l5 5" />
      <path d="M12 12a3 3 0 1 0 0-6" />
    </svg>
  );
}

function IconRefresh({ size = 14, className = '', color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function IconArrowUpRight({ size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

function IconShield({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function formatCvdUsd(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0';
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export default function CvdDivergenceScanner() {
  const [timeframe, setTimeframe] = useState('1h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterDirection, setFilterDirection] = useState('all'); // 'all' | 'bull' | 'bear' | 'exhaustion' | 'absorption' | 'btc'
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchDivergences = useCallback(async (tf) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cvd-scanner?timeframe=${tf}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success && json.error) throw new Error(json.error);
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch CVD divergences:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDivergences(timeframe);
  }, [timeframe, fetchDivergences]);

  // Filtered and sorted coins list
  const filteredCoins = useMemo(() => {
    if (!data?.allCoins) return [];
    let list = [...data.allCoins];

    if (filterDirection === 'bull') {
      list = list.filter((c) => c.hasBullishDiv);
    } else if (filterDirection === 'bear') {
      list = list.filter((c) => c.hasBearishDiv);
    } else if (filterDirection === 'exhaustion') {
      list = list.filter((c) =>
        c.divergences.some((d) => d.category === 'EXHAUSTION')
      );
    } else if (filterDirection === 'absorption') {
      list = list.filter((c) =>
        c.divergences.some((d) => d.category === 'ABSORPTION')
      );
    } else if (filterDirection === 'btc') {
      list = list.filter((c) => c.isBtc);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      );
    }

    // Sort: BTC first, then coins with active divergence (most recent first), then largest net delta
    list.sort((a, b) => {
      if (a.isBtc) return -1;
      if (b.isBtc) return 1;
      const divA = a.primaryDiv;
      const divB = b.primaryDiv;
      if (divA && !divB) return -1;
      if (!divA && divB) return 1;
      if (divA && divB && divA.barsAgo !== divB.barsAgo) {
        return divA.barsAgo - divB.barsAgo;
      }
      return Math.abs(b.net24hDelta || 0) - Math.abs(a.net24hDelta || 0);
    });

    return list;
  }, [data, filterDirection, searchQuery]);

  const btcItem = data?.btc;

  return (
    <div style={{ background: '#000000', color: '#ffffff', minHeight: '80vh' }}>
      {/* ── Top Header Bar ── */}
      <div
        style={{
          borderBottom: '1px solid #1a1a1a',
          padding: '12px 16px',
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
              width: 34,
              height: 34,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, letterSpacing: '0.02em' }}>
                CVD &amp; Price Action Divergence Scanner
              </h2>
              <span
                style={{
                  background: '#f59e0b',
                  color: '#000000',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 3,
                }}
              >
                BTC + 55 ALTS
              </span>
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
                ORDER FLOW
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#888888' }}>
              Cumulative Volume Delta (CVD) vs Price Action: Identifies Buyer/Seller Exhaustion &amp; Institutional Absorption Traps across 30m, 1h, 2h, 3h &amp; 4h.
            </p>
          </div>
        </div>

        {/* Timeframe Switcher & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* 5 Timeframes: 30m, 1h, 2h, 3h, 4h */}
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
            {[
              { id: '30m', label: '30m' },
              { id: '1h', label: '1h' },
              { id: '2h', label: '2h' },
              { id: '3h', label: '3h' },
              { id: '4h', label: '4h' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeframe(t.id)}
                style={{
                  background: timeframe === t.id ? '#1e293b' : 'transparent',
                  color: timeframe === t.id ? '#38bdf8' : '#888888',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: 4,
                  fontSize: '0.74rem',
                  fontWeight: timeframe === t.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

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
            title="Scan BTC + 55 alts for CVD Divergences"
          >
            <IconRefresh size={14} className={loading ? 'spin' : ''} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {/* ── Featured BTC Benchmark Card ── */}
      {btcItem && (
        <div
          style={{
            padding: '12px 16px',
            background: '#030712',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                background: '#f59e0b',
                color: '#000000',
                padding: '3px 8px',
                borderRadius: 4,
                fontWeight: 900,
                fontSize: '0.8rem',
              }}
            >
              ₿ BTC BENCHMARK
            </span>
            <div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                ${btcItem.price ? btcItem.price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '---'}
              </span>
              <span style={{ marginLeft: 10, fontSize: '0.74rem', color: btcItem.net24hDelta >= 0 ? '#22c55e' : '#ef4444' }}>
                Net 24h CVD: {formatCvdUsd(btcItem.net24hDelta)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {btcItem.divergences && btcItem.divergences.length > 0 ? (
              btcItem.divergences.map((d, i) => (
                <div
                  key={i}
                  style={{
                    background: d.direction === 'BULL' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${d.direction === 'BULL' ? '#22c55e' : '#ef4444'}`,
                    padding: '4px 10px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.74rem',
                  }}
                >
                  {d.category === 'ABSORPTION' && <IconShield size={12} color={d.direction === 'BULL' ? '#22c55e' : '#ef4444'} />}
                  <span style={{ fontWeight: 800, color: d.direction === 'BULL' ? '#22c55e' : '#f87171' }}>
                    {d.shortLabel}
                  </span>
                  <span style={{ color: '#888888', fontSize: '0.68rem' }}>({d.barsAgo} bars ago)</span>
                </div>
              ))
            ) : (
              <span style={{ fontSize: '0.74rem', color: '#666666' }}>
                No active CVD divergence on {timeframe} (Order flow aligned)
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Metric Summary Tiles ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          padding: '12px 16px',
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
              BULLISH CVD DIVS
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 6px #22c55e',
              }}
            />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e', marginTop: 4 }}>
            {data?.bullishCount || 0}
          </div>
          <div style={{ fontSize: '0.66rem', color: '#777777', marginTop: 2 }}>
            Seller Exhaustion &amp; Trapped Shorts
          </div>
        </div>

        {/* Bearish Tile */}
        <div
          onClick={() => setFilterDirection('bear')}
          style={{
            background: filterDirection === 'bear' ? '#1a0808' : '#080808',
            border: `1px solid ${filterDirection === 'bear' ? '#ef4444' : '#1a1a1a'}`,
            borderRadius: 6,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#888888', fontWeight: 600 }}>
              BEARISH CVD DIVS
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 6px #ef4444',
              }}
            />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', marginTop: 4 }}>
            {data?.bearishCount || 0}
          </div>
          <div style={{ fontSize: '0.66rem', color: '#777777', marginTop: 2 }}>
            Buyer Exhaustion &amp; Trapped Longs
          </div>
        </div>

        {/* Absorptions Tile */}
        <div
          onClick={() => setFilterDirection('absorption')}
          style={{
            background: filterDirection === 'absorption' ? '#0c1a2e' : '#080808',
            border: `1px solid ${filterDirection === 'absorption' ? '#38bdf8' : '#1a1a1a'}`,
            borderRadius: 6,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#888888', fontWeight: 600 }}>
              ABSORPTION TRAPS
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#38bdf8',
                boxShadow: '0 0 6px #38bdf8',
              }}
            />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
            {data?.allCoins?.filter((c) => c.divergences?.some((d) => d.category === 'ABSORPTION'))?.length || 0}
          </div>
          <div style={{ fontSize: '0.66rem', color: '#777777', marginTop: 2 }}>
            Limit Orders Absorbing Market Flow
          </div>
        </div>

        {/* Scanned Count */}
        <div
          onClick={() => setFilterDirection('all')}
          style={{
            background: filterDirection === 'all' ? '#121212' : '#080808',
            border: `1px solid ${filterDirection === 'all' ? '#444444' : '#1a1a1a'}`,
            borderRadius: 6,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#888888', fontWeight: 600 }}>
              TOTAL WATCHLIST
            </span>
            <span style={{ fontSize: '0.68rem', color: '#555555' }}>{timeframe} TF</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
            {data?.totalScanned || 56}
          </div>
          <div style={{ fontSize: '0.66rem', color: '#777777', marginTop: 2 }}>
            BTC + 55 Whitelisted Alts
          </div>
        </div>
      </div>

      {/* ── Sub-Filter Bar with Mobile Touch Scrolling ── */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid #161616',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: '#020202',
        }}
      >
        <div className="wolf-filter-pills-scroll">
          <button
            className={`wolf-filter-btn ${filterDirection === 'all' ? 'active' : ''}`}
            onClick={() => setFilterDirection('all')}
          >
            All Coins ({(data?.totalScanned || 56)})
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
            className={`wolf-filter-btn ${filterDirection === 'absorption' ? 'active' : ''}`}
            onClick={() => setFilterDirection('absorption')}
            style={{
              borderColor: filterDirection === 'absorption' ? '#38bdf8' : undefined,
              color: filterDirection === 'absorption' ? '#38bdf8' : undefined,
            }}
            title="Institutional Limit Absorptions (Trapped Buyers/Sellers)"
          >
            🛡️ Absorptions &amp; Traps
          </button>
          <button
            className={`wolf-filter-btn ${filterDirection === 'exhaustion' ? 'active' : ''}`}
            onClick={() => setFilterDirection('exhaustion')}
            style={{
              borderColor: filterDirection === 'exhaustion' ? '#eab308' : undefined,
              color: filterDirection === 'exhaustion' ? '#fde047' : undefined,
            }}
            title="Classic Volume Delta Exhaustion (Price pushed, CVD ran out of fuel)"
          >
            ⚡ Regular Exhaustions
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="va-search-input"
            placeholder="Search coin (e.g. BTC, NEAR)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#888888',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Table Content ── */}
      {loading && !data ? (
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#666666' }}>
          <IconRefresh size={28} className="spin" style={{ marginBottom: '0.75rem', color: '#38bdf8' }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            Scanning BTC and 55 Alts for CVD order flow divergences on {timeframe}...
          </p>
        </div>
      ) : error ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#ef4444' }}>
          <p>Failed to scan CVD divergences: {error}</p>
          <button
            onClick={() => fetchDivergences(timeframe)}
            style={{
              background: '#222222',
              border: '1px solid #444444',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Retry Scan
          </button>
        </div>
      ) : (
        <div className="vyaps-table-wrapper" style={{ background: '#000000' }}>
          <table className="vyaps-table" style={{ background: '#000000' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: '1rem' }}>Asset</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'center' }}>24h Net CVD ($)</th>
                <th style={{ textAlign: 'left' }}>Primary CVD Signal ({timeframe})</th>
                <th style={{ textAlign: 'left' }}>Price Action vs CVD Order Flow</th>
                <th style={{ textAlign: 'center' }}>Recency</th>
                <th style={{ textAlign: 'right', paddingRight: '1rem' }}>Chart</th>
              </tr>
            </thead>
            <tbody>
              {filteredCoins.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#666666' }}>
                    No coins found matching the selected filter on {timeframe}.
                  </td>
                </tr>
              ) : (
                filteredCoins.map((coin) => {
                  const pDiv = coin.primaryDiv;
                  const isBull = pDiv?.direction === 'BULL';
                  const isBear = pDiv?.direction === 'BEAR';

                  return (
                    <tr
                      key={coin.symbol}
                      style={{
                        background: coin.isBtc ? 'rgba(245, 158, 11, 0.05)' : '#000000',
                        borderBottom: '1px solid #141414',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Asset Symbol & Name */}
                      <td style={{ textAlign: 'left', paddingLeft: '1rem', padding: '0.75rem 0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#ffffff' }}>
                            {coin.symbol}
                          </span>
                          {coin.isBtc && (
                            <span
                              style={{
                                background: '#f59e0b',
                                color: '#000000',
                                fontSize: '0.6rem',
                                fontWeight: 900,
                                padding: '1px 5px',
                                borderRadius: 3,
                              }}
                            >
                              BTC
                            </span>
                          )}
                          <span style={{ fontSize: '0.7rem', color: '#666666' }}>{coin.name}</span>
                        </div>
                      </td>

                      {/* Price */}
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.84rem' }}>
                        {coin.price !== null
                          ? `$${coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '---'}
                      </td>

                      {/* 24h Net CVD */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            background: coin.net24hDelta >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: coin.net24hDelta >= 0 ? '#22c55e' : '#f87171',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {formatCvdUsd(coin.net24hDelta)}
                        </span>
                      </td>

                      {/* Primary Divergence Signal */}
                      <td style={{ textAlign: 'left' }}>
                        {pDiv ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                background: isBull ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: isBull ? '#22c55e' : '#ef4444',
                                border: `1px solid ${isBull ? '#22c55e' : '#ef4444'}`,
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {pDiv.category === 'ABSORPTION' && <IconShield size={11} />}
                              {pDiv.shortLabel}
                            </span>
                            {coin.divergences.length > 1 && (
                              <span
                                style={{
                                  background: '#1a1a1a',
                                  color: '#888888',
                                  fontSize: '0.62rem',
                                  padding: '1px 5px',
                                  borderRadius: 3,
                                }}
                                title={`${coin.divergences.length} total divergences detected`}
                              >
                                +{coin.divergences.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#444444', fontSize: '0.72rem' }}>Aligned</span>
                        )}
                      </td>

                      {/* PA vs CVD Description */}
                      <td style={{ textAlign: 'left', maxWidth: 360 }}>
                        {pDiv ? (
                          <div style={{ fontSize: '0.72rem', lineHeight: '1.25' }}>
                            <span style={{ color: '#cccccc' }}>{pDiv.description}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#444444', fontSize: '0.72rem' }}>
                            Price and CVD trend aligned
                          </span>
                        )}
                      </td>

                      {/* Recency */}
                      <td style={{ textAlign: 'center' }}>
                        {pDiv ? (
                          <span
                            style={{
                              color: pDiv.barsAgo <= 3 ? '#38bdf8' : '#888888',
                              fontWeight: pDiv.barsAgo <= 3 ? 700 : 500,
                              fontSize: '0.72rem',
                            }}
                          >
                            {pDiv.barsAgo === 0 ? 'Current Bar' : `${pDiv.barsAgo}b ago`}
                          </span>
                        ) : (
                          <span style={{ color: '#444444' }}>--</span>
                        )}
                      </td>

                      {/* Chart Link */}
                      <td style={{ textAlign: 'right', paddingRight: '1rem' }}>
                        <a
                          href={`https://www.tradingview.com/chart/?symbol=BINANCE:${coin.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#38bdf8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: '0.7rem',
                            textDecoration: 'none',
                          }}
                          title="Open chart on TradingView"
                        >
                          <span>TV</span>
                          <IconArrowUpRight size={11} />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
