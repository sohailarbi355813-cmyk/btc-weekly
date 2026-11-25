'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IconLevels, IconRefresh } from '@/components/Icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, dec = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(dec)}%`;
}

function fmtPrice(n) {
  if (!n) return '--';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function timeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── Overlay Chart (SVG) ─────────────────────────────────────────────────────

function FractalOverlayChart({
  matchSeries,
  forwardSeries,
  currentSeries,
  fwdColor = '#4ade80',
  width = 480,
  height = 88,
}) {
  if (!matchSeries || matchSeries.length === 0) return null;

  const fwd = forwardSeries || [];
  const totalPoints = matchSeries.length + fwd.length;
  const allVals = [...matchSeries, ...fwd, ...(currentSeries || [])];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const padY = 6;
  const innerH = height - padY * 2;

  const toX = (i) => (i / Math.max(1, totalPoints - 1)) * width;
  const toY = (v) => padY + innerH - ((v - minV) / range) * innerH;

  const buildPath = (arr, startIdx = 0) => {
    if (!arr || arr.length < 2) return '';
    return arr
      .map((v, idx) => `${idx === 0 ? 'M' : 'L'}${toX(startIdx + idx).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(' ');
  };

  // Connect forward line seamlessly from last match bar
  const fwdWithBridge =
    fwd.length > 0 && matchSeries.length > 0
      ? [matchSeries[matchSeries.length - 1], ...fwd]
      : [];

  const splitX = toX(matchSeries.length - 1);
  const zeroY = toY(0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
    >
      {/* 0% baseline */}
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#1e2230" strokeWidth={1} strokeDasharray="3,3" />

      {/* Current-day boundary */}
      {fwd.length > 0 && (
        <line x1={splitX} y1={0} x2={splitX} y2={height} stroke="#374151" strokeWidth={1} strokeDasharray="4,2" />
      )}

      {/* Historical match window (grey line) */}
      <path d={buildPath(matchSeries, 0)} fill="none" stroke="#94a3b8" strokeWidth={1.6} opacity={0.85} />

      {/* Historical forward outcome (dashed green/red continuation) */}
      {fwdWithBridge.length > 1 && (
        <path
          d={buildPath(fwdWithBridge, matchSeries.length - 1)}
          fill="none"
          stroke={fwdColor}
          strokeWidth={1.75}
          strokeDasharray="4,3"
        />
      )}

      {/* Current active window overlaid on top (cyan/white) */}
      {currentSeries && currentSeries.length > 1 && (
        <path d={buildPath(currentSeries, 0)} fill="none" stroke="#38bdf8" strokeWidth={2} />
      )}
    </svg>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({ match, rank, currentNormed }) {
  const isBullish = match.fwdClosePct > 0;
  const fwdColor = isBullish ? '#4ade80' : '#f87171';

  return (
    <div style={{
      background: '#080810', border: '1px solid #1e1e2e',
      borderRadius: 8, padding: '12px 14px', marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 22, height: 22, background: '#1e1e2e', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>#{rank}</span>
          <div>
            <div style={{ color: '#e5e7eb', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {match.startDate} → {match.endDate}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
              Open: {fmtPrice(match.openPrice)} · Close: {fmtPrice(match.closePrice)}
            </div>
          </div>
        </div>
        <div style={{
          background: '#0a2010', border: '1px solid #22c55e30',
          borderRadius: 5, padding: '3px 10px',
          color: '#4ade80', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 800,
        }}>
          {match.matchPct}% match
        </div>
      </div>

      {/* Overlaid Fractal vs Current + Forward Path */}
      <div style={{
        background: '#05050a', border: '1px solid #151522',
        borderRadius: 6, padding: '8px 10px', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: '#6b7280', flexWrap: 'wrap' }}>
          <span><span style={{ color: '#38bdf8' }}>━</span> Current window</span>
          <span><span style={{ color: '#94a3b8' }}>━</span> Historical match</span>
          <span><span style={{ color: fwdColor }}>┅</span> What happened next ({fmt(match.fwdClosePct, 1)})</span>
        </div>
        <FractalOverlayChart
          matchSeries={match.normed}
          forwardSeries={match.fwdNormed}
          currentSeries={currentNormed}
          fwdColor={fwdColor}
        />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          { label: 'Window DD', value: fmt(match.drawdownPct, 1), color: '#f87171' },
          { label: 'Fwd Close', value: fmt(match.fwdClosePct, 1), color: fwdColor },
          { label: 'Fwd High', value: fmt(match.fwdHighPct, 1), color: '#38bdf8' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#0d0d1a', border: '1px solid #1e1e2e',
            borderRadius: 5, padding: '6px 8px', textAlign: 'center',
          }}>
            <div style={{ color: '#4b5563', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', marginBottom: 1 }}>{label}</div>
            <div style={{ color, fontSize: '0.86rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Consensus Bar ───────────────────────────────────────────────────────────

function ConsensusBar({ forwardStats, forwardLen }) {
  if (!forwardStats) return null;
  const { bullishPct, bearishPct, medianForwardClose, meanDrawdown, maxUpside, n } = forwardStats;

  return (
    <div style={{
      background: '#080814', border: '1px solid #1e1e2e',
      borderRadius: 8, padding: '12px 14px', marginBottom: 14,
    }}>
      <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em' }}>
        FORWARD CONSENSUS (NEXT {forwardLen}D) — TOP {n} DISTINCT MATCHES
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>↑ {bullishPct}% bullish</span>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>{bearishPct}% bearish ↓</span>
        </div>
        <div style={{ height: 8, background: '#1a1a24', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${bullishPct}%`, background: '#22c55e', transition: 'width 0.5s' }} />
          <div style={{ flex: 1, background: '#ef4444' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Median Fwd', value: fmt(medianForwardClose), color: medianForwardClose >= 0 ? '#4ade80' : '#f87171' },
          { label: 'Mean Fwd Low', value: fmt(meanDrawdown), color: '#f87171' },
          { label: 'Max Fwd High', value: fmt(maxUpside), color: '#38bdf8' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#0a0a12', border: '1px solid #1e1e2e',
            borderRadius: 5, padding: '4px 10px',
            fontSize: '0.74rem', fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: '#4b5563' }}>{label}: </span>
            <span style={{ color, fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FractalFinder() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [windowLen, setWindowLen] = useState(30);

  const fetchFractals = useCallback(async (force = false, wLen = 30, signal) => {
    const url = `/api/fractal-finder?symbol=BTCUSDT&interval=1d&limit=2000&window=${wLen}&forward=30&k=5${force ? '&force=1' : ''}`;
    const res = await fetch(url, { signal });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Unknown error');
    return json.data;
  }, []);

  const handleLoad = useCallback(async (force = false, wLen = windowLen) => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchFractals(force, wLen);
      setData(nextData);
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchFractals, windowLen]);

  useEffect(() => {
    const controller = new AbortController();
    fetchFractals(false, 30, controller.signal)
      .then((nextData) => setData(nextData))
      .catch((e) => {
        if (e?.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchFractals]);

  const handleWindowChange = (w) => {
    setWindowLen(w);
    handleLoad(false, w);
  };

  return (
    <div style={{ color: '#e5e7eb', fontFamily: 'var(--font-main)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconLevels size={18} color="#38bdf8" />
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              FRACTAL FINDER
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
              {data ? `BTC Daily · ${data.windowLen}d shape across ${data.historyDays}d history (since ${data.historyStart}) · ${timeAgo(data.lastUpdated)}` : 'Loading…'}
            </div>
          </div>
        </div>
        <button
          onClick={() => handleLoad(true, windowLen)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: loading ? '#1e1e2e' : '#0a0a12',
            border: '1px solid #2d2d3e', borderRadius: 5,
            color: loading ? '#6b7280' : '#9ca3af',
            padding: '5px 12px', fontSize: '0.74rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <IconRefresh size={12} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Scanning' : 'Refresh'}</span>
        </button>
      </div>

      {/* Window size control */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#6b7280', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>Window:</span>
        {[14, 21, 30, 45, 60].map((w) => (
          <button
            key={w}
            onClick={() => handleWindowChange(w)}
            style={{
              background: windowLen === w ? '#152030' : '#0a0a12',
              border: `1px solid ${windowLen === w ? '#38bdf8' : '#1e1e2e'}`,
              borderRadius: 4, padding: '3px 10px',
              color: windowLen === w ? '#38bdf8' : '#6b7280',
              fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {w}d
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#1a0a0a', border: '1px solid #ef444430', borderRadius: 6, padding: '10px 14px', color: '#f87171', fontSize: '0.8rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', color: '#4b5563', padding: '40px 0', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
          Running fractal match…
        </div>
      )}

      {data && (
        <>
          {/* Current period info */}
          <div style={{
            background: '#0a0a14', border: '1px solid #2d2d3e',
            borderRadius: 7, padding: '10px 14px', marginBottom: 12,
          }}>
            <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>
              CURRENT PERIOD BEING MATCHED ({data.windowLen}D)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 700 }}>
                {data.current?.startDate} → {data.current?.endDate}
              </div>
              <div style={{ color: '#9ca3af', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                Return:{' '}
                <span style={{ color: (data.current?.returnPct ?? 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                  {fmt(data.current?.returnPct)}
                </span>
                <span style={{ color: '#374151', margin: '0 8px' }}>·</span>
                Max DD: <span style={{ color: '#f87171', fontWeight: 700 }}>{fmt(data.current?.drawdownPct)}</span>
                <span style={{ color: '#374151', margin: '0 8px' }}>·</span>
                Close: <span style={{ color: '#e5e7eb', fontWeight: 700 }}>{fmtPrice(data.current?.closePrice)}</span>
              </div>
            </div>
          </div>

          {/* Consensus summary */}
          <ConsensusBar forwardStats={data.forwardStats} forwardLen={data.forwardLen} />

          {/* Top matches */}
          <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em' }}>
            TOP {data.topMatches?.length} DISTINCT HISTORICAL MATCHES
          </div>
          {data.topMatches?.map((match, i) => (
            <MatchCard
              key={match.startDate}
              match={match}
              rank={i + 1}
              currentNormed={data.current?.normed}
            />
          ))}

          {/* Disclaimer */}
          <div style={{ color: '#4b5563', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginTop: 8, lineHeight: 1.4 }}>
            Fractal matching uses RMS distance on normalised % returns over {data.windowLen} daily candles with non-overlapping window deduplication. Past shapes do not predict future price action.
          </div>
        </>
      )}
    </div>
  );
}
