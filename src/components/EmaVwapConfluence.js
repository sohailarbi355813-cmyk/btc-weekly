'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IconLayers, IconRadar, IconRefresh } from '@/components/Icons';

const SPREAD_OPTIONS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
const CMP_SPREAD_OPTIONS = [null, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0];
const TF_ORDER = ['4h', '3h', '2h', '1h'];
const ANCHOR_ORDER = ['week', 'month', 'quarter', 'year'];
const ANCHOR_SHORT = {
  week: 'W-VWAP',
  month: 'M-VWAP',
  quarter: 'Q-VWAP',
  year: 'Y-VWAP',
};

function formatCoinPrice(n, decimals = 4) {
  if (n === null || n === undefined) return '--';
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '--';
  if (num >= 1000) {
    return (
      '$' +
      num.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      })
    );
  }
  const d = Math.min(Math.max(decimals !== undefined ? Number(decimals) : 4, 2), 6);
  return '$' + num.toFixed(d);
}

function getRibbonStyle(ribbonColor) {
  switch (ribbonColor) {
    case 'lime':
      return {
        color: '#4ade80',
        bg: 'rgba(34, 197, 94, 0.14)',
        border: 'rgba(34, 197, 94, 0.38)',
      };
    case 'maroon':
      return {
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.14)',
        border: 'rgba(245, 158, 11, 0.38)',
      };
    case 'red':
      return {
        color: '#f87171',
        bg: 'rgba(239, 68, 68, 0.14)',
        border: 'rgba(239, 68, 68, 0.38)',
      };
    case 'green':
      return {
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.14)',
        border: 'rgba(56, 189, 248, 0.38)',
      };
    default:
      return {
        color: '#94a3b8',
        bg: 'rgba(148, 163, 184, 0.10)',
        border: 'rgba(148, 163, 184, 0.25)',
      };
  }
}

function getZoneRoleMeta(zoneRole, distFromSpotPct) {
  const sign = distFromSpotPct > 0 ? '+' : '';
  if (zoneRole === 'TESTING') {
    return {
      label: `TESTING NOW (${sign}${distFromSpotPct}%)`,
      color: '#facc15',
      bg: 'rgba(234, 179, 8, 0.15)',
      border: 'rgba(234, 179, 8, 0.45)',
      accent: '#eab308',
    };
  }
  if (zoneRole === 'RESISTANCE') {
    return {
      label: `RESISTANCE (${sign}${distFromSpotPct}%)`,
      color: '#f87171',
      bg: 'rgba(239, 68, 68, 0.13)',
      border: 'rgba(239, 68, 68, 0.42)',
      accent: '#ef4444',
    };
  }
  return {
    label: `SUPPORT (${sign}${distFromSpotPct}%)`,
    color: '#4ade80',
    bg: 'rgba(34, 197, 94, 0.13)',
    border: 'rgba(34, 197, 94, 0.42)',
    accent: '#22c55e',
  };
}

function buildFilteredTfMatches(
  coin,
  { maxSpreadPct, maxCmpSpreadPct = null, selectedTf, selectedAnchor, zoneFilter, onlyStacked }
) {
  const tfCandidates = selectedTf === 'all' ? TF_ORDER : [selectedTf];
  const matches = [];

  for (const tfKey of tfCandidates) {
    const tf = coin.timeframes?.[tfKey];
    if (!tf || !Array.isArray(tf.alignedVwaps) || tf.alignedVwaps.length === 0) continue;

    const matchingVwaps = tf.alignedVwaps.filter((v) => {
      if (v.spreadPct > maxSpreadPct) return false;
      if (selectedAnchor !== 'all' && v.anchor !== selectedAnchor) return false;
      return true;
    });

    if (matchingVwaps.length === 0) continue;

    const indicatorCount = 1 + matchingVwaps.length;
    if (onlyStacked && indicatorCount < 3) continue;

    const prices = [tf.ema200, ...matchingVwaps.map((v) => v.price)];
    const clusterLow = Math.min(...prices);
    const clusterHigh = Math.max(...prices);
    const clusterMid = (clusterLow + clusterHigh) / 2;
    const distFromSpotPct = Number((((clusterMid - coin.price) / coin.price) * 100).toFixed(2));
    const absSpotDistPct = Number(Math.abs(distFromSpotPct).toFixed(2));

    if (maxCmpSpreadPct !== null && absSpotDistPct > maxCmpSpreadPct) continue;

    const zoneRole =
      absSpotDistPct <= 1.5 ? 'TESTING' : distFromSpotPct > 0 ? 'RESISTANCE' : 'SUPPORT';

    if (zoneFilter === 'testing' && zoneRole !== 'TESTING') continue;
    if (zoneFilter === 'support' && zoneRole !== 'SUPPORT') continue;
    if (zoneFilter === 'resistance' && zoneRole !== 'RESISTANCE') continue;

    matches.push({
      timeframe: tfKey,
      ema200: tf.ema200,
      ema05: tf.ema05,
      ribbonColor: tf.ribbonColor,
      ribbonLabel: tf.ribbonLabel,
      emaSlopePct: tf.emaSlopePct,
      vwaps: tf.vwaps,
      matchingVwaps,
      indicatorCount,
      tightestSpreadPct: matchingVwaps[0].spreadPct,
      clusterLow,
      clusterHigh,
      clusterMid,
      distFromSpotPct,
      absSpotDistPct,
      zoneRole,
    });
  }

  matches.sort((a, b) => {
    if (b.indicatorCount !== a.indicatorCount) return b.indicatorCount - a.indicatorCount;
    return a.tightestSpreadPct - b.tightestSpreadPct;
  });

  return matches;
}

export default function EmaVwapConfluence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanningNow, setScanningNow] = useState(false);
  const [message, setMessage] = useState(null);

  // Filter State (default <= 2.0% indicator spread; CMP spread defaults to null / None)
  const [maxSpreadPct, setMaxSpreadPct] = useState(2.0);
  const [maxCmpSpreadPct, setMaxCmpSpreadPct] = useState(null);
  const [selectedTf, setSelectedTf] = useState('all'); // 'all' | '1h' | '2h' | '3h' | '4h'
  const [selectedAnchor, setSelectedAnchor] = useState('all'); // 'all' | 'week' | 'month' | 'quarter' | 'year'
  const [zoneFilter, setZoneFilter] = useState('all'); // 'all' | 'testing' | 'support' | 'resistance'
  const [onlyStacked, setOnlyStacked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cardTfOverrides, setCardTfOverrides] = useState({});

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ema-vwap-confluence');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      // Ignore transient poll errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleScanNow = async () => {
    setScanningNow(true);
    setMessage(null);
    try {
      const res = await fetch('/api/ema-vwap-confluence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_now' }),
      });
      const json = await res.json();
      if (json.success) {
        const st = json.status || json;
        setData({ success: true, status: st });
        setMessage({
          type: 'success',
          text: `Scanned ${st.totalScanned || 0} linear perpetuals across 1h/2h/3h/4h — ${st.alignedCount || 0} coins have EMA 200 × Anchored VWAP alignment (≤${st.maxStoredSpreadPct || 3}%).`,
        });
      } else {
        setMessage({ type: 'error', text: json.error || 'EMA × VWAP confluence scan failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Scan error: ' + err.message });
    } finally {
      setScanningNow(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const status = data?.status || {};
  const totalScanned = status.totalScanned || status.totalUniverse || 100;
  const majorsContext = status.majorsContext || [];
  const alignedCoins = status.alignedCoins || [];

  // Summary counts dynamically computed for the active tolerance (ignoring search query)
  const toleranceStats = useMemo(() => {
    let alignedAtTol = 0;
    let tightCount = 0;
    let stackedCount = 0;

    for (const coin of alignedCoins) {
      const matchesAtTol = buildFilteredTfMatches(coin, {
        maxSpreadPct,
        maxCmpSpreadPct,
        selectedTf: 'all',
        selectedAnchor: 'all',
        zoneFilter: 'all',
        onlyStacked: false,
      });
      if (matchesAtTol.length > 0) {
        alignedAtTol += 1;
        if (matchesAtTol.some((m) => m.tightestSpreadPct <= 1.0)) {
          tightCount += 1;
        }
        if (matchesAtTol.some((m) => m.indicatorCount >= 3)) {
          stackedCount += 1;
        }
      }
    }

    return { alignedAtTol, tightCount, stackedCount };
  }, [alignedCoins, maxSpreadPct, maxCmpSpreadPct]);

  // Displayed coins with full dynamic TF + Anchor + Ind Spread + CMP Spread + Zone + Search filtering
  const displayedItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const out = [];

    for (const coin of alignedCoins) {
      if (q) {
        const matchSym = coin.symbol?.toLowerCase().includes(q);
        const matchDisp = coin.displaySymbol?.toLowerCase().includes(q);
        const matchName = coin.name?.toLowerCase().includes(q);
        if (!matchSym && !matchDisp && !matchName) continue;
      }

      const matchingEntries = buildFilteredTfMatches(coin, {
        maxSpreadPct,
        maxCmpSpreadPct,
        selectedTf,
        selectedAnchor,
        zoneFilter,
        onlyStacked,
      });

      if (matchingEntries.length === 0) continue;

      const overrideTf = cardTfOverrides[coin.symbol];
      const activeMatch =
        matchingEntries.find((m) => m.timeframe === overrideTf) || matchingEntries[0];

      out.push({
        coin,
        matchingEntries,
        activeMatch,
      });
    }

    out.sort((a, b) => {
      if (b.activeMatch.indicatorCount !== a.activeMatch.indicatorCount) {
        return b.activeMatch.indicatorCount - a.activeMatch.indicatorCount;
      }
      if (a.activeMatch.tightestSpreadPct !== b.activeMatch.tightestSpreadPct) {
        return a.activeMatch.tightestSpreadPct - b.activeMatch.tightestSpreadPct;
      }
      if (a.activeMatch.absSpotDistPct !== b.activeMatch.absSpotDistPct) {
        return a.activeMatch.absSpotDistPct - b.activeMatch.absSpotDistPct;
      }
      return (a.coin.volumeRank || 999) - (b.coin.volumeRank || 999);
    });

    return out;
  }, [
    alignedCoins,
    searchQuery,
    maxSpreadPct,
    maxCmpSpreadPct,
    selectedTf,
    selectedAnchor,
    zoneFilter,
    onlyStacked,
    cardTfOverrides,
  ]);

  const lastScanDateStr = status.lastScanTime
    ? new Date(status.lastScanTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Scanning...';

  return (
    <div
      className="confluence-wrap"
      style={{
        background: '#050505',
        border: '1px solid #1a1a1a',
        borderRadius: 10,
        padding: '16px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 14,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <IconLayers size={16} color="#38bdf8" />
            <h2
              style={{
                fontSize: '0.95rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                margin: 0,
              }}
            >
              EMA 200 &times; Anchored VWAP Confluence
            </h2>
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 4,
                background: 'rgba(56, 189, 248, 0.1)',
                color: 'var(--accent)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              TOP {totalScanned} PERPS &middot; 1H / 2H / 3H / 4H
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Finds coins where 200-MAR EMA 200 and Weekly / Monthly / Quarterly / Yearly Anchored VWAP (hlc3) fall at the same price level on the same timeframe
          </div>
        </div>

        <button
          onClick={handleScanNow}
          disabled={scanningNow}
          style={{
            padding: '6px 12px',
            background: '#0284c7',
            border: '1px solid #38bdf8',
            borderRadius: 6,
            color: '#ffffff',
            fontSize: '0.72rem',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            cursor: scanningNow ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <IconRefresh size={12} className={scanningNow ? 'spin-icon' : ''} color="#ffffff" />
          <span>{scanningNow ? 'Scanning...' : 'Scan Now'}</span>
        </button>
      </div>

      {/* Toast Feedback */}
      {message && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            marginBottom: 14,
            fontSize: '0.76rem',
            lineHeight: 1.45,
            overflowWrap: 'anywhere',
            fontFamily: 'var(--font-mono)',
            background:
              message.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: message.type === 'success' ? '#4ade80' : '#f87171',
            border: `1px solid ${
              message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
            }`,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Majors Context Strip (BTC · ETH · SOL) */}
      {majorsContext.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {majorsContext.map((m) => {
            const activeMatches = buildFilteredTfMatches(m, {
              maxSpreadPct,
              maxCmpSpreadPct,
              selectedTf: 'all',
              selectedAnchor: 'all',
              zoneFilter: 'all',
              onlyStacked: false,
            });
            const mBest = activeMatches[0] || null;

            return (
              <div
                key={m.symbol}
                style={{
                  background: '#0a0a0e',
                  border: `1px solid ${mBest ? 'rgba(56, 189, 248, 0.4)' : '#1e1e26'}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#eab308' }}>
                    {m.displaySymbol}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#ffffff' }}>
                      {formatCoinPrice(m.price, m.decimals)}
                    </span>
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=BYBIT:${m.symbol}.P`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.62rem',
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        fontWeight: 700,
                      }}
                    >
                      Chart &rarr;
                    </a>
                  </div>
                </div>

                {mBest ? (
                  <div style={{ fontSize: '0.63rem', color: '#4ade80', fontWeight: 700, lineHeight: 1.4 }}>
                    CONFLUENCE {mBest.timeframe.toUpperCase()}: EMA 200 (
                    {formatCoinPrice(mBest.ema200, m.decimals)}) +{' '}
                    {mBest.matchingVwaps.map((v) => v.shortLabel).join(', ')} (
                    {mBest.tightestSpreadPct}%)
                  </div>
                ) : m.nearestContext ? (
                  <div style={{ fontSize: '0.61rem', color: '#94a3b8', lineHeight: 1.4 }}>
                    Nearest {m.nearestContext.timeframe.toUpperCase()}: EMA 200{' '}
                    {formatCoinPrice(m.nearestContext.ema200, m.decimals)} vs{' '}
                    {m.nearestContext.vwapLabel}{' '}
                    {formatCoinPrice(m.nearestContext.vwapPrice, m.decimals)} (
                    <span style={{ color: '#cbd5e1' }}>{m.nearestContext.spreadPct}%</span>)
                  </div>
                ) : (
                  <div style={{ fontSize: '0.61rem', color: '#64748b' }}>No confluence &le;{maxSpreadPct}%</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4 Summary Cards */}
      <div
        className="confluence-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          onClick={() => {
            setOnlyStacked(false);
            setZoneFilter('all');
            setSelectedTf('all');
            setSelectedAnchor('all');
            setMaxCmpSpreadPct(null);
          }}
          style={{
            background: 'rgba(56, 189, 248, 0.10)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              ALIGNED (&le;{maxSpreadPct}%)
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
              {toleranceStats.alignedAtTol}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            EMA 200 + &ge;1 Anchored VWAP
          </div>
        </div>

        <div
          onClick={() => setMaxSpreadPct(maxSpreadPct === 1.0 ? 2.0 : 1.0)}
          style={{
            background: maxSpreadPct <= 1.0 ? 'rgba(34, 197, 94, 0.16)' : 'var(--bg-elevated)',
            border: `1px solid ${maxSpreadPct <= 1.0 ? '#22c55e' : 'rgba(34, 197, 94, 0.28)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#4ade80', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              TIGHT (&le;1.0%)
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#4ade80', fontFamily: 'var(--font-display)' }}>
              {toleranceStats.tightCount}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Pinpoint Overlap Zone
          </div>
        </div>

        <div
          onClick={() => setOnlyStacked(!onlyStacked)}
          style={{
            background: onlyStacked ? 'rgba(234, 179, 8, 0.16)' : 'var(--bg-elevated)',
            border: `1px solid ${onlyStacked ? '#eab308' : 'rgba(234, 179, 8, 0.28)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#facc15', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              STACKED (3+ IND)
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#facc15', fontFamily: 'var(--font-display)' }}>
              {toleranceStats.stackedCount}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            EMA 200 + 2 or more VWAPs
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              UNIVERSE SCANNED
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {totalScanned}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Last scan: <strong style={{ color: 'var(--text-primary)' }}>{lastScanDateStr}</strong>
          </div>
        </div>
      </div>

      {/* Controls Bar 1: Indicator Spread, CMP Spread & Timeframe */}
      <div
        className="confluence-controls-bar"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 10,
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
            <span
              style={{
                fontSize: '0.66rem',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
              }}
              title="Spread between EMA 200 and Anchored VWAP"
            >
              IND SPREAD:
            </span>
            {SPREAD_OPTIONS.map((pct) => (
              <button
                key={pct}
                onClick={() => setMaxSpreadPct(pct)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 5,
                  fontSize: '0.67rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: maxSpreadPct === pct ? 'var(--accent)' : 'var(--bg-card)',
                  color: maxSpreadPct === pct ? '#000000' : 'var(--text-secondary)',
                  border: `1px solid ${maxSpreadPct === pct ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                &le;{pct.toFixed(1)}%
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
            <span
              style={{
                fontSize: '0.66rem',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
              }}
            >
              TF:
            </span>
            {['all', '1h', '2h', '3h', '4h'].map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTf(tf)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 5,
                  fontSize: '0.67rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: selectedTf === tf ? 'var(--accent)' : 'var(--bg-card)',
                  color: selectedTf === tf ? '#000000' : 'var(--text-secondary)',
                  border: `1px solid ${selectedTf === tf ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexWrap: 'wrap',
            paddingTop: 8,
            borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: '0.66rem',
              color: maxCmpSpreadPct !== null ? '#4ade80' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}
            title="Optional max distance from Current Market Price (CMP) to the EMA-VWAP confluence cluster"
          >
            CMP SPREAD:
          </span>
          {CMP_SPREAD_OPTIONS.map((pct) => {
            const isSelected = maxCmpSpreadPct === pct;
            const isNone = pct === null;
            return (
              <button
                key={isNone ? 'none' : pct}
                onClick={() => setMaxCmpSpreadPct(pct)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 5,
                  fontSize: '0.67rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: isSelected
                    ? isNone
                      ? 'rgba(148, 163, 184, 0.22)'
                      : '#22c55e'
                    : 'var(--bg-card)',
                  color: isSelected
                    ? isNone
                      ? '#ffffff'
                      : '#000000'
                    : 'var(--text-secondary)',
                  border: `1px solid ${
                    isSelected
                      ? isNone
                        ? '#94a3b8'
                        : '#4ade80'
                      : 'var(--border)'
                  }`,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                {isNone ? 'None' : `≤${pct.toFixed(1)}%`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls Bar 2: VWAP Anchor, Zone Filter, Stack Toggle & Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            VWAP:
          </span>
          {[
            { id: 'all', label: 'All' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
            { id: 'quarter', label: 'Quarter' },
            { id: 'year', label: 'Year' },
          ].map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAnchor(a.id)}
              style={{
                padding: '4px 9px',
                borderRadius: 5,
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                background: selectedAnchor === a.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                color: selectedAnchor === a.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${selectedAnchor === a.id ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Zones' },
            { id: 'testing', label: 'Testing (±1.5%)' },
            { id: 'support', label: 'Support' },
            { id: 'resistance', label: 'Resistance' },
          ].map((z) => (
            <button
              key={z.id}
              onClick={() => setZoneFilter(z.id)}
              style={{
                padding: '4px 9px',
                borderRadius: 5,
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                background: zoneFilter === z.id ? 'rgba(56, 189, 248, 0.16)' : 'var(--bg-card)',
                color: zoneFilter === z.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${zoneFilter === z.id ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {z.label}
            </button>
          ))}

          <button
            onClick={() => setOnlyStacked(!onlyStacked)}
            style={{
              padding: '4px 9px',
              borderRadius: 5,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: onlyStacked ? 'rgba(234, 179, 8, 0.2)' : 'var(--bg-card)',
              color: onlyStacked ? '#eab308' : 'var(--text-secondary)',
              border: `1px solid ${onlyStacked ? '#eab308' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            3+ Ind Only {onlyStacked ? '✓' : ''}
          </button>
        </div>

        <div style={{ flex: '1 1 200px', maxWidth: 280, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search coin (e.g. INJ, SOL, BTC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          fontSize: '0.70rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span>
          Showing <strong style={{ color: 'var(--text-primary)' }}>{displayedItems.length}</strong> Confluence Setups
        </span>
        <span>
          IND &le;{maxSpreadPct.toFixed(1)}% &middot;{' '}
          <strong style={{ color: maxCmpSpreadPct !== null ? '#4ade80' : 'var(--text-muted)' }}>
            CMP: {maxCmpSpreadPct === null ? 'NONE' : `≤${maxCmpSpreadPct.toFixed(1)}%`}
          </strong>{' '}
          &middot; TF: {selectedTf.toUpperCase()} &middot; VWAP: {selectedAnchor.toUpperCase()}
        </span>
      </div>

      {/* Results Grid */}
      {loading && !data ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.80rem',
          }}
        >
          <IconRadar size={28} color="var(--accent)" className="spin-icon" style={{ marginBottom: 10, opacity: 0.8 }} />
          <div>Scanning Top 100 Perps across 1h / 2h / 3h / 4h for EMA 200 &times; Anchored VWAP confluence...</div>
        </div>
      ) : displayedItems.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '36px 20px',
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
          }}
        >
          <IconLayers size={28} color="var(--accent)" style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>No coins currently match this EMA 200 &times; Anchored VWAP filter.</div>
          <div style={{ fontSize: '0.70rem', marginTop: 6 }}>
            Try setting CMP Spread to <strong>None</strong>, widening IND Spread, or resetting TF / VWAP Anchor to <strong>ALL</strong>.
          </div>
          <button
            onClick={() => {
              setMaxCmpSpreadPct(null);
              setMaxSpreadPct(2.0);
              setSelectedTf('all');
              setSelectedAnchor('all');
              setZoneFilter('all');
              setOnlyStacked(false);
              setSearchQuery('');
            }}
            style={{
              marginTop: 12,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div
          className="confluence-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: 12,
          }}
        >
          {displayedItems.map(({ coin, matchingEntries, activeMatch }) => {
            const zoneMeta = getZoneRoleMeta(activeMatch.zoneRole, activeMatch.distFromSpotPct);
            const ribbonStyle = getRibbonStyle(activeMatch.ribbonColor);
            const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${coin.symbol}.P`;
            const isStacked = activeMatch.indicatorCount >= 3;

            return (
              <div
                key={coin.symbol}
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${isStacked ? 'rgba(234, 179, 8, 0.5)' : zoneMeta.border}`,
                  borderLeft: `3px solid ${zoneMeta.accent}`,
                  borderRadius: 8,
                  padding: '13px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  minWidth: 0,
                }}
              >
                {/* Row 1: Symbol, Vol Rank, Spot Price & Chart */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.86rem',
                        fontWeight: 800,
                        color: coin.isMajor ? '#eab308' : 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {coin.displaySymbol}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {coin.name}
                    </span>
                    {coin.volumeRank && (
                      <span
                        style={{
                          fontSize: '0.56rem',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: '#0b0b10',
                          color: '#94a3b8',
                          border: '1px solid #262630',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                      >
                        #{coin.volumeRank}
                      </span>
                    )}
                    {coin.isMajor && (
                      <span
                        style={{
                          fontSize: '0.56rem',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(234, 179, 8, 0.2)',
                          color: '#eab308',
                          border: '1px solid rgba(234, 179, 8, 0.45)',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                        }}
                      >
                        MAJOR
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatCoinPrice(coin.price, coin.decimals)}
                    </span>
                    <a
                      href={tvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}
                    >
                      Chart &rarr;
                    </a>
                  </div>
                </div>

                {/* Row 2: Clickable Matching Timeframes + Zone Role + Stack Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {matchingEntries.map((m) => {
                      const isActive = m.timeframe === activeMatch.timeframe;
                      return (
                        <button
                          key={m.timeframe}
                          onClick={() =>
                            setCardTfOverrides((prev) => ({ ...prev, [coin.symbol]: m.timeframe }))
                          }
                          style={{
                            padding: '2px 7px',
                            borderRadius: 4,
                            fontSize: '0.62rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            background: isActive ? 'var(--accent)' : '#0d0d12',
                            color: isActive ? '#000000' : '#cbd5e1',
                            border: `1px solid ${isActive ? 'var(--accent)' : '#262630'}`,
                            cursor: 'pointer',
                          }}
                          title={`Inspect ${m.timeframe.toUpperCase()} EMA 200 × VWAP levels`}
                        >
                          {m.timeframe.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: isStacked ? 'rgba(234, 179, 8, 0.16)' : '#0b0b0f',
                        color: isStacked ? '#facc15' : '#38bdf8',
                        border: `1px solid ${isStacked ? 'rgba(234, 179, 8, 0.45)' : 'rgba(56, 189, 248, 0.3)'}`,
                      }}
                    >
                      {activeMatch.indicatorCount}/5 IND
                    </span>
                    <span
                      style={{
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: zoneMeta.bg,
                        color: zoneMeta.color,
                        border: `1px solid ${zoneMeta.border}`,
                      }}
                    >
                      {zoneMeta.label}
                    </span>
                  </div>
                </div>

                {/* Row 3: Active TF EMA 200 vs Aligned VWAP(s) */}
                <div
                  style={{
                    background: '#09090d',
                    border: '1px solid #1a1a22',
                    borderRadius: 6,
                    padding: '9px 10px',
                    fontFamily: 'var(--font-mono)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {/* EMA 200 Line + 200-MAR State */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 700 }}>
                        {activeMatch.timeframe.toUpperCase()} EMA 200
                      </span>
                      <span
                        style={{
                          fontSize: '0.56rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: ribbonStyle.bg,
                          color: ribbonStyle.color,
                          border: `1px solid ${ribbonStyle.border}`,
                        }}
                      >
                        {activeMatch.ribbonLabel}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ffffff' }}>
                      {formatCoinPrice(activeMatch.ema200, coin.decimals)}
                    </span>
                  </div>

                  {/* Aligned VWAP Rows */}
                  {activeMatch.matchingVwaps.map((v) => {
                    const isTight = v.spreadPct <= 1.0;
                    return (
                      <div
                        key={v.anchor}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 7px',
                          borderRadius: 4,
                          background: isTight ? 'rgba(34, 197, 94, 0.10)' : 'rgba(56, 189, 248, 0.08)',
                          border: `1px solid ${isTight ? 'rgba(34, 197, 94, 0.35)' : 'rgba(56, 189, 248, 0.25)'}`,
                        }}
                      >
                        <span style={{ fontSize: '0.64rem', fontWeight: 800, color: isTight ? '#4ade80' : '#38bdf8' }}>
                          {v.label}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#e2e8f0' }}>
                            {formatCoinPrice(v.price, coin.decimals)}
                          </span>
                          <span
                            style={{
                              fontSize: '0.58rem',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: '#050507',
                              color: isTight ? '#4ade80' : '#38bdf8',
                              border: `1px solid ${isTight ? 'rgba(34, 197, 94, 0.4)' : 'rgba(56, 189, 248, 0.35)'}`,
                            }}
                          >
                            {v.spreadPct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Cluster Range Band */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.60rem',
                      color: '#94a3b8',
                      paddingTop: 4,
                      borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                      flexWrap: 'wrap',
                      gap: 4,
                    }}
                  >
                    <span>
                      Cluster Band:{' '}
                      <strong style={{ color: '#e2e8f0' }}>
                        {formatCoinPrice(activeMatch.clusterLow, coin.decimals)} &ndash;{' '}
                        {formatCoinPrice(activeMatch.clusterHigh, coin.decimals)}
                      </strong>
                    </span>
                    <span>
                      Tightest:{' '}
                      <strong style={{ color: activeMatch.tightestSpreadPct <= 1.0 ? '#4ade80' : '#38bdf8' }}>
                        {activeMatch.tightestSpreadPct}%
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Row 4: Full 4-VWAP Snapshot on Active Timeframe */}
                <div
                  className="confluence-vwap-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 5,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {ANCHOR_ORDER.map((anchorKey) => {
                    const val = activeMatch.vwaps?.[anchorKey];
                    const isMatched = activeMatch.matchingVwaps.some((v) => v.anchor === anchorKey);
                    const rawDiff =
                      Number.isFinite(val) && val > 0 && activeMatch.ema200 > 0
                        ? Number(((Math.abs(activeMatch.ema200 - val) / activeMatch.ema200) * 100).toFixed(2))
                        : null;

                    return (
                      <div
                        key={anchorKey}
                        style={{
                          background: isMatched ? 'rgba(56, 189, 248, 0.12)' : '#0a0a0e',
                          border: `1px solid ${isMatched ? 'rgba(56, 189, 248, 0.4)' : '#1c1c24'}`,
                          borderRadius: 5,
                          padding: '5px 4px',
                          textAlign: 'center',
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontSize: '0.54rem', color: isMatched ? '#38bdf8' : '#64748b', fontWeight: 700 }}>
                          {ANCHOR_SHORT[anchorKey]}
                        </div>
                        <div
                          style={{
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            color: isMatched ? '#ffffff' : '#cbd5e1',
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatCoinPrice(val, coin.decimals)}
                        </div>
                        <div style={{ fontSize: '0.52rem', color: isMatched ? '#4ade80' : '#64748b', marginTop: 1 }}>
                          {rawDiff !== null ? `${rawDiff}%` : '--'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

