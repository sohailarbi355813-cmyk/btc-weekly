'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IconRadar,
  IconRefresh,
  IconCheck,
  IconAlertTriangle,
  IconTrendUp,
  IconTrendDown,
  IconZap,
} from '@/components/Icons';

export default function RsiScannerWidget() {
  const [data, setData] = useState(null);
  const [scanningNow, setScanningNow] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
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
    } catch (err) {}
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
        setMessage({
          type: 'success',
          text: `Scan complete! Found ${json.overboughtCount || 0} Overbought (\u226570), ${json.oversoldCount || 0} Oversold (\u226430), and ${json.divergenceCount || 0} Divergences across 55 coins.`,
        });
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: 'Scan failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Scan error: ' + err.message });
    } finally {
      setScanningNow(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleTestAlert = async () => {
    setTestingWebhook(true);
    setMessage(null);
    try {
      const res = await fetch('/api/rsi-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_alert' }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Discord test embed delivered successfully!' });
      } else {
        setMessage({ type: 'error', text: json.message || 'Webhook failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error: ' + err.message });
    } finally {
      setTestingWebhook(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const status = data?.status || {};
  const overboughtCoins = status.overboughtCoins || [];
  const oversoldCoins = status.oversoldCoins || [];
  const divergenceCoins = status.divergenceCoins || [];
  const allScannedCoins = status.allCoins || [];

  // Coins for "Active Signals" view
  const activeSignalCoins = useMemo(() => {
    const combined = [...overboughtCoins, ...oversoldCoins];
    // Add divergences if not already in list
    for (const d of divergenceCoins) {
      if (!combined.some((c) => c.symbol === d.symbol && c.timeframe === d.timeframe)) {
        combined.push(d);
      }
    }
    return combined;
  }, [overboughtCoins, oversoldCoins, divergenceCoins]);

  // Unified list depending on view mode
  const baseCoinsList = useMemo(() => {
    if (viewMode === 'all') {
      // If allScannedCoins is populated, use it. Otherwise fallback to active signals
      return allScannedCoins.length > 0 ? allScannedCoins : activeSignalCoins;
    }
    if (viewMode === 'majors') {
      const pool = allScannedCoins.length > 0 ? allScannedCoins : activeSignalCoins;
      return pool.filter((c) => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(c.symbol));
    }
    // Default 'signals'
    return activeSignalCoins;
  }, [viewMode, allScannedCoins, activeSignalCoins]);

  // Filtered coins by search, timeframe, territory, divergence, sigma
  const displayedCoins = useMemo(() => {
    return baseCoinsList.filter((item) => {
      // Timeframe filter
      if (selectedTf !== 'all' && item.timeframe !== selectedTf) {
        return false;
      }
      // Search query filter (matches BTC, Bitcoin, etc.)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSym = item.symbol?.toLowerCase().includes(q);
        const matchesDisp = item.displaySymbol?.toLowerCase().includes(q);
        const matchesName = item.name?.toLowerCase().includes(q);
        if (!matchesSym && !matchesDisp && !matchesName) return false;
      }
      // Territory filter strictly enforces OB >= 70 and OS <= 30
      if (territoryFilter === 'overbought' && item.rsi < 70) {
        return false;
      }
      if (territoryFilter === 'oversold' && item.rsi > 30) {
        return false;
      }
      // Divergence filter
      if (filterDivergenceOnly && !item.divergence) {
        return false;
      }
      // Extreme Gaussian filter (>= 1.8 sigma)
      if (filterExtremeOnly && Math.abs(item.sigmaMetrics?.zScore || 0) < 1.8) {
        return false;
      }
      return true;
    });
  }, [baseCoinsList, selectedTf, searchQuery, territoryFilter, filterDivergenceOnly, filterExtremeOnly]);

  const lastScanDateStr = status.lastScanTime
    ? new Date(status.lastScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Live';

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
              55 COINS · 5 TFs
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Real-time RSI extremes (&ge;70 OB, &le;30 OS) &amp; confirmed divergences
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleTestAlert}
            disabled={testingWebhook}
            style={{
              padding: '5px 10px',
              background: '#0d0d0d',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--accent)',
              fontSize: '0.70rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: testingWebhook ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Send Discord test alert"
          >
            <IconZap size={12} color="var(--accent)" />
            <span>{testingWebhook ? 'Testing...' : 'Test Alert'}</span>
          </button>

          <button
            onClick={handleScanNow}
            disabled={scanningNow}
            style={{
              padding: '5px 12px',
              background: '#0284c7',
              border: '1px solid #38bdf8',
              borderRadius: 6,
              color: '#ffffff',
              fontSize: '0.70rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              cursor: scanningNow ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Run instant scan across 55 coins"
          >
            <IconRefresh size={12} className={scanningNow ? 'spin-icon' : ''} color="#ffffff" />
            <span>{scanningNow ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {message && (
        <div style={{
          padding: '8px 14px',
          borderRadius: 6,
          marginBottom: 14,
          fontSize: '0.76rem',
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
        {/* Overbought Card */}
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

        {/* Oversold Card */}
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

        {/* Divergences Card */}
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

        {/* Total Monitored Card */}
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
              55
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
        {/* View Mode Tabs */}
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
            All 55 Coins
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

        {/* Timeframe Selector */}
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
        {/* Fast Search Input */}
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

        {/* Filters */}
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

      {/* ── Coins Grid Display ── */}
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

        {displayedCoins.length === 0 ? (
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
              Click <strong>&quot;All 55 Coins&quot;</strong> above or click <strong>&quot;Scan Now&quot;</strong> to refresh live market feeds.
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10,
          }}>
            {displayedCoins.map((item, idx) => {
              const isOB = item.rsi >= 70;
              const isOS = item.rsi <= 30;
              const isMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(item.symbol) || item.isMajor;
              const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${item.symbol}.P`;
              const rsiColor = isOB ? '#ef4444' : isOS ? '#22c55e' : 'var(--accent)';
              const rsiPct = Math.min(Math.max(item.rsi, 0), 100);

              return (
                <div
                  key={`${item.symbol}-${item.timeframe}-${idx}`}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${
                      item.divergence
                        ? item.divergence.type?.includes('BEARISH')
                          ? 'rgba(239, 68, 68, 0.7)'
                          : 'rgba(34, 197, 94, 0.7)'
                        : isOB
                        ? 'rgba(239, 68, 68, 0.35)'
                        : isOS
                        ? 'rgba(34, 197, 94, 0.35)'
                        : 'var(--border)'
                    }`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Top line: Symbol, Name, TF, TradingView Link */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        color: isMajor ? '#eab308' : 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {item.displaySymbol || item.symbol}
                      </span>
                      <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        {item.name}
                      </span>
                      {isMajor && (
                        <span style={{
                          fontSize: '0.58rem',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(234, 179, 8, 0.2)',
                          color: '#eab308',
                          border: '1px solid rgba(234, 179, 8, 0.5)',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                        }}>
                          MAJOR
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '0.64rem',
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: 'var(--bg-card)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--border)',
                        fontWeight: 700,
                      }}>
                        {item.timeframe?.toUpperCase()}
                      </span>
                      <a
                        href={tvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-muted)',
                          textDecoration: 'none',
                          fontFamily: 'var(--font-mono)',
                        }}
                        title="Open in TradingView"
                      >
                        Chart &rarr;
                      </a>
                    </div>
                  </div>

                  {/* Price & Sigma */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.74rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ${Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: item.price < 1 ? 4 : 2 })}
                    </span>
                    {item.sigmaMetrics && (
                      <span style={{
                        fontSize: '0.64rem',
                        fontFamily: 'var(--font-mono)',
                        color: Math.abs(item.sigmaMetrics.zScore || 0) >= 1.8 ? (item.sigmaMetrics.zScore > 0 ? '#f87171' : '#4ade80') : 'var(--text-muted)',
                      }}>
                        σ {item.sigmaMetrics.zScoreText}
                      </span>
                    )}
                  </div>

                  {/* RSI Visual Bar Gauge */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>RSI (14)</span>
                      <span style={{ color: rsiColor, fontWeight: 900 }}>
                        {item.rsi} {isOB ? '· OVERBOUGHT' : isOS ? '· OVERSOLD' : item.divergence ? (item.divergence.direction === 'BEAR' ? '· BEAR DIV' : '· BULL DIV') : ''}
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
                        background: rsiColor,
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

                  {/* Divergence Tag if Active */}
                  {item.divergence && (
                    <div style={{
                      marginTop: 8,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: item.divergence.type?.includes('BEARISH') ? 'rgba(239, 68, 68, 0.18)' : 'rgba(34, 197, 94, 0.18)',
                      border: `1px solid ${item.divergence.type?.includes('BEARISH') ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                      fontSize: '0.66rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      color: item.divergence.type?.includes('BEARISH') ? '#f87171' : '#4ade80',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}>
                      <span>{item.divergence.label}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {item.divergence.prevRsi != null && item.divergence.curRsi != null ? `${item.divergence.prevRsi}\u2192${item.divergence.curRsi} \u00B7 ` : ''}{item.divergence.barsAgo} bars ago
                      </span>
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
