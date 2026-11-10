'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IconLevels, IconRadar, IconRefresh } from '@/components/Icons';

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

function getStatusMeta(item) {
  switch (item.signalStatus) {
    case 'CONFIRMED_SELL':
      return {
        badge: 'SELL · MON HIGH BREAK-IN',
        accent: '#ef4444',
        textAccent: '#f87171',
        border: 'rgba(239, 68, 68, 0.55)',
        bg: 'rgba(239, 68, 68, 0.14)',
        side: 'SELL',
      };
    case 'CONFIRMED_BUY':
      return {
        badge: 'BUY · MON LOW RECLAIM',
        accent: '#22c55e',
        textAccent: '#4ade80',
        border: 'rgba(34, 197, 94, 0.55)',
        bg: 'rgba(34, 197, 94, 0.14)',
        side: 'BUY',
      };
    case 'WATCH_SELL':
      return {
        badge: 'WATCH SELL · ABOVE MON HIGH',
        accent: '#f59e0b',
        textAccent: '#fbbf24',
        border: 'rgba(245, 158, 11, 0.45)',
        bg: 'rgba(245, 158, 11, 0.14)',
        side: 'SELL',
      };
    case 'WATCH_BUY':
      return {
        badge: 'WATCH BUY · BELOW MON LOW',
        accent: '#38bdf8',
        textAccent: '#38bdf8',
        border: 'rgba(56, 189, 248, 0.45)',
        bg: 'rgba(56, 189, 248, 0.14)',
        side: 'BUY',
      };
    case 'UNCONFIRMED_BREAK_IN':
      return {
        badge: 'BROKE INSIDE · NO RSI CONFIRM',
        accent: '#94a3b8',
        textAccent: '#cbd5e1',
        border: 'var(--border)',
        bg: 'rgba(148, 163, 184, 0.10)',
        side: 'NEUTRAL',
      };
    case 'UNCONFIRMED_RECLAIM':
      return {
        badge: 'RECLAIMED · NO RSI CONFIRM',
        accent: '#94a3b8',
        textAccent: '#cbd5e1',
        border: 'var(--border)',
        bg: 'rgba(148, 163, 184, 0.10)',
        side: 'NEUTRAL',
      };
    case 'OUTSIDE_ABOVE':
      return {
        badge: 'ABOVE MON HIGH',
        accent: '#94a3b8',
        textAccent: '#fb923c',
        border: 'var(--border)',
        bg: 'rgba(251, 146, 60, 0.10)',
        side: 'NEUTRAL',
      };
    case 'OUTSIDE_BELOW':
      return {
        badge: 'BELOW MON LOW',
        accent: '#94a3b8',
        textAccent: '#38bdf8',
        border: 'var(--border)',
        bg: 'rgba(56, 189, 248, 0.10)',
        side: 'NEUTRAL',
      };
    case 'MONDAY_FORMING':
      return {
        badge: 'MONDAY RANGE FORMING',
        accent: '#eab308',
        textAccent: '#facc15',
        border: 'var(--border)',
        bg: 'rgba(234, 179, 8, 0.12)',
        side: 'NEUTRAL',
      };
    default:
      return {
        badge: `INSIDE RANGE (${item.posInRangePct}%)`,
        accent: 'var(--accent)',
        textAccent: '#94a3b8',
        border: 'var(--border)',
        bg: 'rgba(148, 163, 184, 0.08)',
        side: 'NEUTRAL',
      };
  }
}

export default function MondayRangeScanner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanningNow, setScanningNow] = useState(false);
  const [message, setMessage] = useState(null);

  // Filter State
  const [viewMode, setViewMode] = useState('confirmed'); // 'confirmed' | 'sell' | 'buy' | 'watching' | 'all'
  const [selectedTf, setSelectedTf] = useState('all'); // 'all' | '30m' | '45m' | '1h'
  const [onlyDivergence, setOnlyDivergence] = useState(false);
  const [onlyClosed, setOnlyClosed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/monday-range');
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
      const res = await fetch('/api/monday-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_now' }),
      });
      const json = await res.json();
      if (json.success) {
        setData({ success: true, status: json.status || json });
        setMessage({
          type: 'success',
          text: `Scan complete! ${json.confirmedSellCount || 0} Sell (Mon High Break-In) & ${json.confirmedBuyCount || 0} Buy (Mon Low Reclaim) confirmed across ${json.totalCoins || 56} coins.`,
        });
      } else {
        setMessage({ type: 'error', text: json.error || 'Monday Range scan failed' });
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
  const confirmedSell = status.confirmedSellSignals || [];
  const confirmedBuy = status.confirmedBuySignals || [];
  const watchSell = status.watchSellSignals || [];
  const watchBuy = status.watchBuySignals || [];
  const majorsContext = status.majorsContext || [];
  const allCoins = status.allCoins || [];

  const confirmedCount = confirmedSell.length + confirmedBuy.length;
  const watchingCount = watchSell.length + watchBuy.length;

  const baseList = useMemo(() => {
    if (viewMode === 'sell') return confirmedSell;
    if (viewMode === 'buy') return confirmedBuy;
    if (viewMode === 'watching') {
      return [...watchSell, ...watchBuy].sort((a, b) => b.score - a.score);
    }
    if (viewMode === 'all') return allCoins;
    // 'confirmed'
    return [...confirmedSell, ...confirmedBuy].sort((a, b) => b.score - a.score);
  }, [viewMode, confirmedSell, confirmedBuy, watchSell, watchBuy, allCoins]);

  const displayedCoins = useMemo(() => {
    return baseList.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSym = item.symbol?.toLowerCase().includes(q);
        const matchDisp = item.displaySymbol?.toLowerCase().includes(q);
        const matchName = item.name?.toLowerCase().includes(q);
        if (!matchSym && !matchDisp && !matchName) return false;
      }

      if (selectedTf !== 'all') {
        const tfObj = item.timeframes?.[selectedTf];
        if (!tfObj) return false;
        if (viewMode === 'sell' || item.direction === 'SELL') {
          if (!tfObj.sellConfirmed) return false;
        } else if (viewMode === 'buy' || item.direction === 'BUY') {
          if (!tfObj.buyConfirmed) return false;
        } else {
          if (!tfObj.sellConfirmed && !tfObj.buyConfirmed) return false;
        }
      }

      if (onlyDivergence) {
        const matchesDir = (tfObj) => {
          const d = tfObj?.divergence;
          if (!d) return false;
          if (viewMode === 'sell' || item.direction === 'SELL') return d.direction === 'BEAR';
          if (viewMode === 'buy' || item.direction === 'BUY') return d.direction === 'BULL';
          return true;
        };
        if (selectedTf !== 'all') {
          if (!matchesDir(item.timeframes?.[selectedTf])) return false;
        } else if (!['30m', '45m', '1h'].some((t) => matchesDir(item.timeframes?.[t]))) {
          return false;
        }
      }

      if (onlyClosed && (item.setupState === 'BREAK_IN_SELL' || item.setupState === 'RECLAIM_BUY')) {
        if (!item.isClosedConfirm) return false;
      }

      return true;
    });
  }, [baseList, searchQuery, selectedTf, viewMode, onlyDivergence, onlyClosed]);

  const lastScanDateStr = status.lastScanTime
    ? new Date(status.lastScanTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Scanning...';

  return (
    <div
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
            <IconLevels size={16} color="#38bdf8" />
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
              Monday Range + RSI Break-In Filter
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
              {monitoredCount} COINS · 30M / 45M / 1H
            </span>
            {status.mondayDateStr && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#cbd5e1',
                  border: '1px solid #262626',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Mon {status.mondayDateStr} UTC
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Filters sweeps above Monday High breaking back inside (+ 30m/45m/1h OB/Div SELL) and sweeps below Monday Low reclaiming (+ OS/Div BUY)
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
            background: message.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: message.type === 'success' ? '#4ade80' : '#f87171',
            border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Monday Forming Banner */}
      {status.isMondayForming && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            background: 'rgba(234, 179, 8, 0.10)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            color: '#facc15',
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          UTC Monday is currently in progress. Final Monday High / Low locks at Tuesday 00:00 UTC; switch to &ldquo;All {monitoredCount} Coins&rdquo; below to view developing Monday levels.
        </div>
      )}

      {/* Market Leaders Context (BTC · ETH · SOL vs Monday Range) */}
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
            const isAbove = m.price > m.mondayHigh;
            const isBelow = m.price < m.mondayLow;
            const statusText = isAbove
              ? `+${m.distFromHighPct}% ABOVE MON HIGH`
              : isBelow
              ? `${m.distFromLowPct}% BELOW MON LOW`
              : `INSIDE MON RANGE (${m.posInRangePct}%)`;
            const statusColor = isAbove
              ? '#4ade80'
              : isBelow
              ? '#f87171'
              : m.posInRangePct >= 50
              ? '#38bdf8'
              : '#fb923c';

            return (
              <div
                key={m.symbol}
                style={{
                  background: '#0a0a0e',
                  border: '1px solid #1e1e26',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6 }}>
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
                      style={{ fontSize: '0.62rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}
                    >
                      Chart &rarr;
                    </a>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: '0.62rem', color: '#94a3b8', marginBottom: 5 }}>
                  <span>L {formatCoinPrice(m.mondayLow, m.decimals)}</span>
                  <span>M {formatCoinPrice(m.mondayMid, m.decimals)}</span>
                  <span>H {formatCoinPrice(m.mondayHigh, m.decimals)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.64rem', fontWeight: 800, color: statusColor }}>
                    {statusText}
                  </span>
                  <span style={{ fontSize: '0.58rem', color: '#64748b' }}>
                    RSI {m.timeframes?.['30m']?.rsi ?? '--'} / {m.timeframes?.['45m']?.rsi ?? '--'} / {m.timeframes?.['1h']?.rsi ?? '--'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div
          onClick={() => setViewMode(viewMode === 'sell' ? 'confirmed' : 'sell')}
          style={{
            background: viewMode === 'sell' ? 'rgba(239, 68, 68, 0.16)' : 'var(--bg-elevated)',
            border: `1px solid ${viewMode === 'sell' ? '#ef4444' : 'rgba(239, 68, 68, 0.28)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#f87171', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              SELL · BREAK-IN
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f87171', fontFamily: 'var(--font-display)' }}>
              {status.confirmedSellCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Swept Mon High &rarr; Broke Inside + OB/Div
          </div>
        </div>

        <div
          onClick={() => setViewMode(viewMode === 'buy' ? 'confirmed' : 'buy')}
          style={{
            background: viewMode === 'buy' ? 'rgba(34, 197, 94, 0.16)' : 'var(--bg-elevated)',
            border: `1px solid ${viewMode === 'buy' ? '#22c55e' : 'rgba(34, 197, 94, 0.28)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#4ade80', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              BUY · RECLAIM
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#4ade80', fontFamily: 'var(--font-display)' }}>
              {status.confirmedBuyCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Swept Mon Low &rarr; Reclaimed + OS/Div
          </div>
        </div>

        <div
          onClick={() => setViewMode(viewMode === 'watching' ? 'confirmed' : 'watching')}
          style={{
            background: viewMode === 'watching' ? 'rgba(245, 158, 11, 0.16)' : 'var(--bg-elevated)',
            border: `1px solid ${viewMode === 'watching' ? '#f59e0b' : 'rgba(245, 158, 11, 0.28)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: '#fbbf24', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              WATCHING OUTSIDE
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-display)' }}>
              {watchingCount}
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Outside Mon Range w/ OB or OS RSI
          </div>
        </div>

        <div
          onClick={() => setViewMode('all')}
          style={{
            background: viewMode === 'all' ? 'rgba(56, 189, 248, 0.14)' : 'var(--bg-elevated)',
            border: `1px solid ${viewMode === 'all' ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '12px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              ALL WATCHLIST
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

      {/* Controls Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'confirmed', label: `Confirmed (${confirmedCount})` },
            { id: 'sell', label: `Sell Break-In (${status.confirmedSellCount || 0})` },
            { id: 'buy', label: `Buy Reclaim (${status.confirmedBuyCount || 0})` },
            { id: 'watching', label: `Watching (${watchingCount})` },
            { id: 'all', label: `All ${monitoredCount}` },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setViewMode(btn.id)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                background: viewMode === btn.id ? 'var(--accent-dim)' : 'transparent',
                color: viewMode === btn.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${viewMode === btn.id ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            RSI TF:
          </span>
          {['all', '30m', '45m', '1h'].map((tf) => (
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

      {/* Search & Precision Toggles */}
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
        <div style={{ flex: '1 1 240px', maxWidth: 360, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search coin (e.g. ETH, VIRTUAL, ZEC, APT)..."
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
            onClick={() => setOnlyClosed(!onlyClosed)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: onlyClosed ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-card)',
              color: onlyClosed ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${onlyClosed ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            Closed Candle Only {onlyClosed ? '✓' : ''}
          </button>
          <button
            onClick={() => setOnlyDivergence(!onlyDivergence)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: onlyDivergence ? 'rgba(234, 179, 8, 0.2)' : 'var(--bg-card)',
              color: onlyDivergence ? '#eab308' : 'var(--text-secondary)',
              border: `1px solid ${onlyDivergence ? '#eab308' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            Divergence Only {onlyDivergence ? '✓' : ''}
          </button>
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
        }}
      >
        <span>
          Showing <strong style={{ color: 'var(--text-primary)' }}>{displayedCoins.length}</strong> Setups
        </span>
        <span>RSI TF: {selectedTf.toUpperCase()}</span>
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
          <div>Scanning {monitoredCount} coins for Monday High/Low sweeps + 30m/45m/1h RSI confirmation...</div>
        </div>
      ) : displayedCoins.length === 0 ? (
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
          <IconLevels size={28} color="var(--accent)" style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>No coins currently match this Monday Range + RSI filter.</div>
          <div style={{ fontSize: '0.70rem', marginTop: 6 }}>
            Check <strong>&ldquo;Watching ({watchingCount})&rdquo;</strong> for coins outside Monday Range with OB/OS RSI, or click <strong>&ldquo;All {monitoredCount}&rdquo;</strong>.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 310px), 1fr))',
            gap: 12,
          }}
        >
          {displayedCoins.map((item) => {
            const meta = getStatusMeta(item);
            const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${item.symbol}.P`;
            const clampedPos = Math.max(2, Math.min(98, item.posInRangePct));
            const isSignalCard =
              item.signalStatus === 'CONFIRMED_SELL' || item.signalStatus === 'CONFIRMED_BUY';

            return (
              <div
                key={item.symbol}
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${meta.border}`,
                  borderLeft: isSignalCard ? `3px solid ${meta.accent}` : `1px solid ${meta.border}`,
                  borderRadius: 8,
                  padding: '13px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Row 1: Coin + Major + Chart Link */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        color: item.isMajor ? '#eab308' : 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {item.displaySymbol}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {item.name}
                    </span>
                    {item.isMajor && (
                      <span
                        style={{
                          fontSize: '0.58rem',
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
                    title={`Open ${item.displaySymbol} on TradingView`}
                  >
                    Chart &rarr;
                  </a>
                </div>

                {/* Row 2: Directional Badge + Spot Price */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.64rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: meta.bg,
                        color: meta.textAccent,
                        border: `1px solid ${meta.border}`,
                      }}
                    >
                      {meta.badge}
                    </span>
                    {isSignalCard && (
                      <span
                        style={{
                          fontSize: '0.60rem',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#0b0b0f',
                          color: item.isClosedConfirm ? '#e2e8f0' : '#fbbf24',
                          border: '1px solid #262630',
                        }}
                      >
                        {item.confirmedTfs.length}/3 TFs · {item.isClosedConfirm ? 'Closed' : 'Live Bar'}
                      </span>
                    )}
                  </div>

                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {formatCoinPrice(item.price, item.decimals)}
                  </span>
                </div>

                {/* Row 3: Monday Range Bar + High/Mid/Low Numbers */}
                <div
                  style={{
                    background: '#09090d',
                    border: '1px solid #1a1a22',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#94a3b8', marginBottom: 6, gap: 6 }}>
                    <span>
                      Low <strong style={{ color: '#4ade80' }}>{formatCoinPrice(item.mondayLow, item.decimals)}</strong>
                    </span>
                    <span>
                      Mid <strong style={{ color: '#cbd5e1' }}>{formatCoinPrice(item.mondayMid, item.decimals)}</strong>
                    </span>
                    <span>
                      High <strong style={{ color: '#f87171' }}>{formatCoinPrice(item.mondayHigh, item.decimals)}</strong>
                    </span>
                  </div>

                  {/* Range Position Track */}
                  <div
                    style={{
                      position: 'relative',
                      height: 8,
                      borderRadius: 4,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {/* Mid 50% marker */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: 0,
                        bottom: 0,
                        width: 1,
                        background: 'rgba(255, 255, 255, 0.35)',
                      }}
                    />
                    {/* Spot position dot */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${clampedPos}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: meta.accent,
                        border: '2px solid #000',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.60rem', color: '#64748b', marginTop: 5, gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      Pos:{' '}
                      <strong style={{ color: '#e2e8f0' }}>
                        {item.posInRangePct}%
                      </strong>{' '}
                      (Range {item.mondayRangePct}%)
                    </span>
                    {item.activeSweep && (
                      <span style={{ color: meta.textAccent }}>
                        {item.activeSweep.side === 'SELL' ? '+' : '-'}
                        {item.activeSweep.sweepPct}% sweep{' '}
                        {item.activeSweep.hoursAgo > 0 ? `· ${item.activeSweep.hoursAgo}h ago` : '· active'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 4: 30M / 45M / 1H RSI Confirmation Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {['30m', '45m', '1h'].map((tfKey) => {
                    const tf = item.timeframes?.[tfKey];
                    if (!tf) return null;

                    const isSellSide = item.direction === 'SELL';
                    const isBuySide = item.direction === 'BUY';
                    const isTfMatch = isSellSide
                      ? tf.sellConfirmed
                      : isBuySide
                      ? tf.buyConfirmed
                      : tf.sellConfirmed || tf.buyConfirmed;

                    const isBearHighlight =
                      (isSellSide && tf.sellConfirmed) || (!isBuySide && tf.sellConfirmed);
                    const isBullHighlight =
                      (isBuySide && tf.buyConfirmed) || (!isSellSide && tf.buyConfirmed);

                    const tfColor = isBearHighlight
                      ? '#f87171'
                      : isBullHighlight
                      ? '#4ade80'
                      : '#94a3b8';

                    const tfBg = isBearHighlight
                      ? 'rgba(239, 68, 68, 0.12)'
                      : isBullHighlight
                      ? 'rgba(34, 197, 94, 0.12)'
                      : '#0a0a0e';

                    const tfBorder = isBearHighlight
                      ? 'rgba(239, 68, 68, 0.40)'
                      : isBullHighlight
                      ? 'rgba(34, 197, 94, 0.40)'
                      : '#1c1c24';

                    const tagText = isBearHighlight
                      ? tf.sellShortTag
                      : isBullHighlight
                      ? tf.buyShortTag
                      : 'Neutral';

                    return (
                      <div
                        key={tfKey}
                        style={{
                          background: tfBg,
                          border: `1px solid ${tfBorder}`,
                          borderRadius: 6,
                          padding: '6px 7px',
                          textAlign: 'center',
                        }}
                        title={
                          (isBearHighlight ? tf.sellReason : isBullHighlight ? tf.buyReason : `RSI ${tf.rsi}`) ||
                          ''
                        }
                      >
                        <div style={{ fontSize: '0.58rem', color: '#94a3b8', fontWeight: 700 }}>
                          {tfKey.toUpperCase()} RSI
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 900, color: isTfMatch ? tfColor : '#e2e8f0', marginTop: 1 }}>
                          {tf.rsi}
                        </div>
                        <div
                          style={{
                            fontSize: '0.56rem',
                            fontWeight: 700,
                            color: tfColor,
                            marginTop: 2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {tagText}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Row 5: Setup Summary Narrative */}
                {item.narrative && (
                  <div
                    style={{
                      fontSize: '0.68rem',
                      lineHeight: 1.45,
                      color: '#cbd5e1',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 6,
                      padding: '8px 10px',
                    }}
                  >
                    {item.narrative}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
