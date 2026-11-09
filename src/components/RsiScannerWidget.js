'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IconRadar, IconRefresh } from '@/components/Icons';

function formatSpotPrice(n) {
  if (!n && n !== 0) return '--';
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '--';
  if (num >= 1000) {
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (num >= 1) return '$' + num.toFixed(3);
  return '$' + num.toFixed(5);
}

function buildAlertDetails(item) {
  const isOB = item.rsi >= 70;
  const isOS = item.rsi <= 30;
  const isMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(item.symbol) || item.isMajor;
  const isBearSide =
    item.territory === 'OVERBOUGHT' ||
    item.territory === 'BEARISH_DIV' ||
    item.divergence?.direction === 'BEAR';

  const symbolTag = item.displaySymbol || `${item.symbol}.P`;
  const tfUpper = (item.timeframe || '').toUpperCase();
  const tfFull = item.timeframeLabel ? `${tfUpper} (${item.timeframeLabel})` : tfUpper;

  const headline = item.divergence
    ? isBearSide
      ? `RSI BEARISH DIVERGENCE${isOB ? ' + OVERBOUGHT' : ''}`
      : `RSI BULLISH DIVERGENCE${isOS ? ' + OVERSOLD' : ''}`
    : isOB
    ? 'RSI OVERBOUGHT'
    : isOS
    ? 'RSI OVERSOLD'
    : 'NEUTRAL BAND';

  const severityTag = isOB
    ? `${item.severity || (item.rsi >= 80 ? 'EXTREME' : item.rsi >= 75 ? 'HIGH' : 'ELEVATED')} OVERBOUGHT (\u226570)`
    : isOS
    ? `${item.severity || (item.rsi <= 20 ? 'EXTREME' : item.rsi <= 25 ? 'HIGH' : 'ELEVATED')} OVERSOLD (\u226430)`
    : item.divergence
    ? `${isBearSide ? 'Bearish Div' : 'Bullish Div'} \u00B7 Neutral Band`
    : 'Neutral Zone (31\u201369)';

  const sm = item.sigmaMetrics || null;
  const zScoreText = sm?.zScoreText || 'N/A';
  const gaussianPct = sm?.gaussianPct ?? 0;
  const absZ = sm?.absZ ?? Math.abs(sm?.zScore || 0);
  const isExtremeGaussian = Boolean(sm?.isExtremeGaussian);
  const reversalEdge = isExtremeGaussian
    ? 'HIGH PROBABILITY REVERSAL ZONE (>95%)'
    : absZ >= 1.6
    ? 'Momentum Trend Extension (>89%)'
    : 'Within Normal Volatility Band';

  let narrative = null;
  if (item.divergence) {
    narrative =
      `${symbolTag} printed ${item.divergence.label} on ${tfUpper} ` +
      `(Pivot RSI ${item.divergence.prevRsi} \u2192 ${item.divergence.curRsi}, live RSI ${item.rsi}). ` +
      `Price is at ${zScoreText} (${gaussianPct}% Gaussian Boundary). ` +
      (isExtremeGaussian ? 'High probability reversal confluence.' : 'Watch for structural confirmation.');
  } else if (isOB) {
    narrative =
      `${symbolTag} is in RSI Overbought territory (\u226570) at ${zScoreText} vs 20 SMA ` +
      `(${gaussianPct}% Gaussian Boundary). ` +
      (isExtremeGaussian
        ? 'Statistical mean-reversion probability is strongly elevated (>95% Gaussian boundary).'
        : 'Within normal volatility band\u2014look for structural confirmation.');
  } else if (isOS) {
    narrative =
      `${symbolTag} is in RSI Oversold territory (\u226430) at ${zScoreText} vs 20 SMA ` +
      `(${gaussianPct}% Gaussian Boundary). ` +
      (isExtremeGaussian
        ? 'Statistical mean-reversion bounce probability is strongly elevated (>95% Gaussian boundary).'
        : 'Within normal volatility band\u2014look for structural confirmation.');
  }

  return {
    isOB,
    isOS,
    isMajor,
    isBearSide,
    symbolTag,
    tfUpper,
    tfFull,
    headline,
    severityTag,
    sm,
    zScoreText,
    gaussianPct,
    isExtremeGaussian,
    reversalEdge,
    narrative,
  };
}

export default function RsiScannerWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanningNow, setScanningNow] = useState(false);
  const [message, setMessage] = useState(null);

  // View & Filter State
  const [viewMode, setViewMode] = useState('signals'); // 'signals' | 'all' | 'majors'
  const [selectedTf, setSelectedTf] = useState('all'); // 'all' | '30m' | '45m' | '1h' | '2h' | '3h'
  const [searchQuery, setSearchQuery] = useState('');
  const [territoryFilter, setTerritoryFilter] = useState('both'); // 'both' | 'overbought' | 'oversold'
  const [filterDivergenceOnly, setFilterDivergenceOnly] = useState(false);
  const [filterExtremeOnly, setFilterExtremeOnly] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/rsi-scanner');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      // Ignore transient poll failure
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
      const res = await fetch('/api/rsi-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_now', territory: territoryFilter }),
      });
      const json = await res.json();
      if (json.success) {
        const coinTotal = json.totalCoins || 56;
        setMessage({
          type: 'success',
          text: `Scan complete! ${json.overboughtCount || 0} Overbought (\u226570), ${json.oversoldCount || 0} Oversold (\u226430), and ${json.divergenceCount || 0} Divergences across ${coinTotal} coins.`,
        });
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: json.error || 'Scan failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Scan error: ' + err.message });
    } finally {
      setScanningNow(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const status = data?.status || {};
  const monitoredCount = status.totalCoins || 56;
  const overboughtCoins = status.overboughtCoins || [];
  const oversoldCoins = status.oversoldCoins || [];
  const divergenceCoins = status.divergenceCoins || [];
  const allScannedCoins = status.allCoins || [];

  // Prioritize active alert signals cleanly: Majors first, Divergences next, most extreme RSI first
  const activeSignalCoins = useMemo(() => {
    const combined = [...overboughtCoins, ...oversoldCoins];
    for (const d of divergenceCoins) {
      if (!combined.some((c) => c.symbol === d.symbol && c.timeframe === d.timeframe)) {
        combined.push(d);
      }
    }
    return combined.sort((a, b) => {
      const aMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(a.symbol) || a.isMajor;
      const bMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(b.symbol) || b.isMajor;
      if (aMajor && !bMajor) return -1;
      if (!aMajor && bMajor) return 1;
      if (a.divergence && !b.divergence) return -1;
      if (!a.divergence && b.divergence) return 1;
      const aExt = Math.abs((a.rsi ?? 50) - 50);
      const bExt = Math.abs((b.rsi ?? 50) - 50);
      return bExt - aExt;
    });
  }, [overboughtCoins, oversoldCoins, divergenceCoins]);

  const baseCoinsList = useMemo(() => {
    if (viewMode === 'all') {
      return allScannedCoins.length > 0 ? allScannedCoins : activeSignalCoins;
    }
    if (viewMode === 'majors') {
      const pool = allScannedCoins.length > 0 ? allScannedCoins : activeSignalCoins;
      return pool.filter((c) => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(c.symbol));
    }
    return activeSignalCoins;
  }, [viewMode, allScannedCoins, activeSignalCoins]);

  const displayedCoins = useMemo(() => {
    return baseCoinsList.filter((item) => {
      if (selectedTf !== 'all' && item.timeframe !== selectedTf) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSym = item.symbol?.toLowerCase().includes(q);
        const matchesDisp = item.displaySymbol?.toLowerCase().includes(q);
        const matchesName = item.name?.toLowerCase().includes(q);
        if (!matchesSym && !matchesDisp && !matchesName) return false;
      }

      if (territoryFilter === 'overbought' && item.rsi < 70) return false;
      if (territoryFilter === 'oversold' && item.rsi > 30) return false;
      if (filterDivergenceOnly && !item.divergence) return false;
      if (filterExtremeOnly && Math.abs(item.sigmaMetrics?.zScore || 0) < 1.8) return false;

      return true;
    });
  }, [baseCoinsList, selectedTf, searchQuery, territoryFilter, filterDivergenceOnly, filterExtremeOnly]);

  const lastScanDateStr = status.lastScanTime
    ? new Date(status.lastScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Scanning...';

  return (
    <div style={{
      background: '#050505',
      border: '1px solid #1a1a1a',
      borderRadius: 10,
      padding: '16px',
      marginBottom: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        borderBottom: '1px solid var(--border)',
        paddingBottom: 14,
        marginBottom: 14,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#22c55e',
            }} />
            <h2 style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              margin: 0,
            }}>
              Market RSI Radar
            </h2>
            <span style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 4,
              background: 'rgba(56, 189, 248, 0.1)',
              color: 'var(--accent)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              fontFamily: 'var(--font-mono)',
            }}>
              {monitoredCount} COINS · 5 TFs
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Full alert breakdown (&ge;70 OB, &le;30 OS, pivots, Gaussian Z-Score &amp; 20 SMA distance) &middot; 5m auto-refresh
          </div>
        </div>

        {/* Scan Button */}
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
          title={`Run instant scan across ${monitoredCount} coins`}
        >
          <IconRefresh size={12} className={scanningNow ? 'spin-icon' : ''} color="#ffffff" />
          <span>{scanningNow ? 'Scanning...' : 'Scan Now'}</span>
        </button>
      </div>

      {/* Toast Feedback */}
      {message && (
        <div style={{
          padding: '8px 14px',
          borderRadius: 6,
          marginBottom: 14,
          fontSize: '0.76rem',
          lineHeight: 1.45,
          overflowWrap: 'anywhere',
          fontFamily: 'var(--font-mono)',
          background: message.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
          border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* ── Summary Counters Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
        marginBottom: 16,
      }}>
        <div
          onClick={() => {
            setViewMode('signals');
            setTerritoryFilter(territoryFilter === 'overbought' ? 'both' : 'overbought');
          }}
          style={{
            background: territoryFilter === 'overbought' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-elevated)',
            border: `1px solid ${territoryFilter === 'overbought' ? '#ef4444' : 'rgba(239, 68, 68, 0.25)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Click to filter Overbought coins (RSI >= 70)"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#f87171', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 800 }}>
              Overbought (&ge;70)
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f87171', fontFamily: 'var(--font-display)' }}>
              {status.overboughtCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Resistance &amp; exhaustion territory
          </div>
        </div>

        <div
          onClick={() => {
            setViewMode('signals');
            setTerritoryFilter(territoryFilter === 'oversold' ? 'both' : 'oversold');
          }}
          style={{
            background: territoryFilter === 'oversold' ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-elevated)',
            border: `1px solid ${territoryFilter === 'oversold' ? '#22c55e' : 'rgba(34, 197, 94, 0.25)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Click to filter Oversold coins (RSI <= 30)"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#4ade80', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 800 }}>
              Oversold (&le;30)
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#4ade80', fontFamily: 'var(--font-display)' }}>
              {status.oversoldCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Discount value &amp; bounce zone
          </div>
        </div>

        <div
          onClick={() => setFilterDivergenceOnly(!filterDivergenceOnly)}
          style={{
            background: filterDivergenceOnly ? 'rgba(234, 179, 8, 0.18)' : 'var(--bg-elevated)',
            border: `1px solid ${filterDivergenceOnly ? '#eab308' : 'rgba(234, 179, 8, 0.25)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Click to filter confirmed RSI Divergences"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#eab308', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 800 }}>
              Divergences
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#eab308', fontFamily: 'var(--font-display)' }}>
              {status.divergenceCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            High-conviction reversal setups
          </div>
        </div>

        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 700 }}>
              Monitored Coins
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
              {monitoredCount}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Last scan: <strong style={{ color: 'var(--text-primary)' }}>{lastScanDateStr}</strong>
          </div>
        </div>
      </div>

      {/* ── View Mode & Controls Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 14,
        padding: '12px 14px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setViewMode('signals'); setTerritoryFilter('both'); }}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: viewMode === 'signals' ? 'var(--accent-dim)' : 'transparent',
              color: viewMode === 'signals' ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${viewMode === 'signals' ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Active Signals ({activeSignalCoins.length})
          </button>
          <button
            onClick={() => { setViewMode('all'); setTerritoryFilter('both'); }}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: viewMode === 'all' ? 'var(--accent-dim)' : 'transparent',
              color: viewMode === 'all' ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${viewMode === 'all' ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            All {monitoredCount} Coins
          </button>
          <button
            onClick={() => { setViewMode('majors'); setTerritoryFilter('both'); }}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: viewMode === 'majors' ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
              color: viewMode === 'majors' ? '#eab308' : 'var(--text-secondary)',
              border: `1px solid ${viewMode === 'majors' ? '#eab308' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Majors (BTC · ETH · SOL)
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>TF:</span>
          {['all', '30m', '45m', '1h', '2h', '3h'].map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTf(tf)}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                background: selectedTf === tf ? 'var(--accent)' : 'var(--bg-card)',
                color: selectedTf === tf ? '#000000' : 'var(--text-secondary)',
                border: `1px solid ${selectedTf === tf ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search & Filter Pill Controls ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
      }}>
        <div style={{ flex: '1 1 240px', maxWidth: 360, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search coin (e.g. SOL, DOGE, SUI, ADA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '0.74rem',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterDivergenceOnly(!filterDivergenceOnly)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: filterDivergenceOnly ? 'rgba(234, 179, 8, 0.2)' : 'var(--bg-card)',
              color: filterDivergenceOnly ? '#eab308' : 'var(--text-secondary)',
              border: `1px solid ${filterDivergenceOnly ? '#eab308' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            Divergence {filterDivergenceOnly ? '✓' : ''}
          </button>
          <button
            onClick={() => setFilterExtremeOnly(!filterExtremeOnly)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: filterExtremeOnly ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-card)',
              color: filterExtremeOnly ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${filterExtremeOnly ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            &ge;1.8&sigma; Band {filterExtremeOnly ? '✓' : ''}
          </button>
          {territoryFilter !== 'both' && (
            <button
              onClick={() => setTerritoryFilter('both')}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              Clear Territory Filter &times;
            </button>
          )}
        </div>
      </div>

      {/* ── Full Alert Cards Grid ── */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          fontSize: '0.70rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
        }}>
          <span>Showing <strong style={{ color: 'var(--text-primary)' }}>{displayedCoins.length}</strong> Results:</span>
          <span>TF: {selectedTf.toUpperCase()}</span>
        </div>

        {loading && !data ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.80rem',
          }}>
            <IconRadar size={28} color="var(--accent)" className="spin-icon" style={{ marginBottom: 10, opacity: 0.8 }} />
            <div>Scanning {monitoredCount} coins across 30m, 45m, 1h, 2h, and 3h...</div>
          </div>
        ) : displayedCoins.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 20px',
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.80rem',
          }}>
            <IconRadar size={28} color="var(--accent)" style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>No coins currently match the selected filter criteria.</div>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Click <strong>&quot;All {monitoredCount} Coins&quot;</strong> above or click <strong>&quot;Scan Now&quot;</strong> to refresh live market feeds.
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: 12,
          }}>
            {displayedCoins.map((item, idx) => {
              const info = buildAlertDetails(item);
              const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${item.symbol}.P`;
              const isSignal = info.isOB || info.isOS || Boolean(item.divergence);
              const accentColor = info.isBearSide && isSignal
                ? '#ef4444'
                : (!info.isBearSide && isSignal)
                ? '#22c55e'
                : 'var(--accent)';
              const textAccent = info.isBearSide && isSignal
                ? '#f87171'
                : (!info.isBearSide && isSignal)
                ? '#4ade80'
                : 'var(--accent)';
              const cardBorder = item.divergence
                ? (info.isBearSide ? 'rgba(239, 68, 68, 0.65)' : 'rgba(34, 197, 94, 0.65)')
                : info.isOB
                ? 'rgba(239, 68, 68, 0.40)'
                : info.isOS
                ? 'rgba(34, 197, 94, 0.40)'
                : 'var(--border)';
              const rsiPct = Math.min(Math.max(item.rsi, 0), 100);

              return (
                <div
                  key={`${item.symbol}-${item.timeframe}-${idx}`}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${cardBorder}`,
                    borderLeft: isSignal ? `3px solid ${accentColor}` : `1px solid ${cardBorder}`,
                    borderRadius: 8,
                    padding: '13px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 9,
                  }}
                >
                  {/* Top Row: Symbol, Name, Major, TF, TradingView Link */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        color: info.isMajor ? '#eab308' : 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {info.symbolTag}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {item.name}
                      </span>
                      {info.isMajor && (
                        <span style={{
                          fontSize: '0.58rem',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(234, 179, 8, 0.2)',
                          color: '#eab308',
                          border: '1px solid rgba(234, 179, 8, 0.45)',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                        }}>
                          MAJOR
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: '0.64rem',
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'var(--bg-card)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--border)',
                        fontWeight: 700,
                      }}>
                        {info.tfFull}
                      </span>
                      <a
                        href={tvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.66rem',
                          color: 'var(--accent)',
                          textDecoration: 'none',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                        title={`Open ${info.symbolTag} on TradingView`}
                      >
                        Chart &rarr;
                      </a>
                    </div>
                  </div>

                  {/* Alert Headline Banner & Spot Price */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.64rem',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: isSignal
                        ? (info.isBearSide ? 'rgba(239, 68, 68, 0.14)' : 'rgba(34, 197, 94, 0.14)')
                        : 'rgba(148, 163, 184, 0.10)',
                      color: isSignal ? textAccent : '#94a3b8',
                      border: `1px solid ${
                        isSignal
                          ? (info.isBearSide ? 'rgba(239, 68, 68, 0.32)' : 'rgba(34, 197, 94, 0.32)')
                          : 'rgba(148, 163, 184, 0.22)'
                      }`,
                    }}>
                      {info.headline}
                    </span>

                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatSpotPrice(item.price)}
                    </span>
                  </div>

                  {/* RSI (14) Severity + Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text-muted)' }}>RSI (14)</span>
                      <span style={{ color: textAccent, fontWeight: 900 }}>
                        {item.rsi} &middot; {info.severityTag}
                      </span>
                    </div>

                    <div style={{
                      height: 5,
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: 3,
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${rsiPct}%`,
                        background: accentColor,
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: '#555', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      <span>0</span>
                      <span style={{ color: '#22c55e' }}>30 OS</span>
                      <span style={{ color: '#ef4444' }}>70 OB</span>
                      <span>100</span>
                    </div>
                  </div>

                  {/* Webhook-Equivalent Alert Summary Narrative (for active signals) */}
                  {info.narrative && (
                    <div style={{
                      fontSize: '0.70rem',
                      lineHeight: 1.45,
                      color: '#cbd5e1',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 6,
                      padding: '8px 10px',
                    }}>
                      {info.narrative}
                    </div>
                  )}

                  {/* Divergence Structure Details */}
                  {item.divergence && (
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: info.isBearSide ? 'rgba(239, 68, 68, 0.10)' : 'rgba(34, 197, 94, 0.10)',
                      border: `1px solid ${info.isBearSide ? 'rgba(239, 68, 68, 0.32)' : 'rgba(34, 197, 94, 0.32)'}`,
                      fontSize: '0.67rem',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 6,
                        fontWeight: 800,
                        color: textAccent,
                      }}>
                        <span>{item.divergence.label}</span>
                        <span style={{ color: '#e2e8f0' }}>{item.divergence.barsAgo} bars ago</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, color: '#cbd5e1' }}>
                        <span>
                          Swing Pivot:{' '}
                          <strong style={{ color: '#ffffff' }}>
                            {formatSpotPrice(item.divergence.prevPrice)} &rarr; {formatSpotPrice(item.divergence.curPrice || item.price)}
                          </strong>
                        </span>
                        <span>
                          Pivot RSI:{' '}
                          <strong style={{ color: textAccent }}>
                            {item.divergence.prevRsi} &rarr; {item.divergence.curRsi}
                          </strong>{' '}
                          (Now {item.rsi})
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Statistical Volatility (Z-Score, Gaussian Boundary, Reversal Edge, 20-Period Mean) */}
                  {info.sm && (
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: '#08080a',
                      border: '1px solid #18181d',
                      fontSize: '0.66rem',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Volatility Extension</span>
                        <span style={{
                          fontWeight: 800,
                          color: info.isExtremeGaussian
                            ? (info.sm.zScore > 0 ? '#f87171' : '#4ade80')
                            : 'var(--text-primary)',
                        }}>
                          {info.zScoreText} ({info.gaussianPct}% Gaussian)
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Reversal Edge</span>
                        <span style={{
                          fontWeight: 800,
                          color: info.isExtremeGaussian ? '#fbbf24' : '#94a3b8',
                        }}>
                          {info.reversalEdge}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)' }}>20-Period Mean (20 SMA)</span>
                        <span style={{ color: '#cbd5e1', fontWeight: 700 }}>
                          {formatSpotPrice(info.sm.mean)} ({info.sm.pctFromMean >= 0 ? '+' : ''}{info.sm.pctFromMean}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
