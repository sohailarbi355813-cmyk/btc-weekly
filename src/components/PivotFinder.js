'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IconRadar, IconRefresh } from '@/components/Icons';

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function BigStat({ value, label, color = '#ffffff', sublabel }) {
  return (
    <div style={{
      background: '#0a0a12', border: '1px solid #1e1e2e',
      borderRadius: 6, padding: '10px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>{label}</span>
      </div>
      {sublabel && (
        <div style={{ color: '#6b7280', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

function TimingBuckets({ buckets, totalSwept }) {
  if (!buckets || !totalSwept) return null;
  const entries = [
    { key: 'lt6h', label: '< 6h', color: '#ef4444' },
    { key: '6to12h', label: '6–12h', color: '#f97316' },
    { key: '12to30h', label: '12–30h', color: '#facc15' },
    { key: 'gt30h', label: '> 30h', color: '#38bdf8' },
  ];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ color: '#6b7280', fontSize: '0.66rem', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>
        SWEEP TIMING BREAKDOWN
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {entries.map(({ key, label, color }) => {
          const count = buckets[key] || 0;
          const pct = totalSwept > 0 ? Math.round((count / totalSwept) * 100) : 0;
          return (
            <div key={key} style={{
              flex: '1 1 68px',
              background: '#0a0a12', border: `1px solid ${color}30`,
              borderRadius: 5, padding: '6px 9px', textAlign: 'center',
            }}>
              <div style={{ color, fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {count}
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.64rem', fontFamily: 'var(--font-mono)' }}>{label}</div>
              <div style={{ color: '#6b7280', fontSize: '0.6rem', fontFamily: 'var(--font-mono)' }}>{pct}% of sweeps</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TargetGrid({ title, targets, isHigh }) {
  if (!targets) return null;
  const rows = isHigh
    ? [
        { pct: 80, label: '80% Low Target', price: targets.target80pct, delta: -targets.decline80, color: '#facc15' },
        { pct: 50, label: '50% Low Target', price: targets.target50pct, delta: -targets.decline50, color: '#fb923c' },
        { pct: 20, label: '20% Low Target', price: targets.target20pct, delta: -targets.decline20, color: '#ef4444' },
      ]
    : [
        { pct: 80, label: '80% High Target', price: targets.target80pct, delta: targets.gain80, color: '#38bdf8' },
        { pct: 50, label: '50% High Target', price: targets.target50pct, delta: targets.gain50, color: '#4ade80' },
        { pct: 20, label: '20% High Target', price: targets.target20pct, delta: targets.gain20, color: '#22c55e' },
      ];

  return (
    <div style={{
      background: '#0a0a14', border: '1px solid #1e1e2a',
      borderRadius: 6, padding: '10px 12px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>
          {title}
        </span>
        <span style={{ color: '#4b5563', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
          n = {targets.sampleSize} held pivots
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {rows.map(({ pct, label, price, delta, color }) => (
          <div key={pct} style={{
            flex: '1 1 110px', background: '#0d0d1a', border: '1px solid #1e1e2e',
            borderRadius: 5, padding: '7px 8px', textAlign: 'center',
          }}>
            <div style={{ color: '#9ca3af', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ color, fontSize: '0.86rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {fmtPrice(price)}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
              {fmt(delta, 1)} from pivot
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PivotCard({ type, data, horizonDays }) {
  if (!data) return null;
  const { pivot, allStats, simStats, lowTargets, highTargets } = data;
  const isHigh = type === 'high';
  const accentColor = isHigh ? '#ef4444' : '#22c55e';
  const icon = isHigh ? '▼' : '▲';
  const label = isHigh ? 'Swing HIGH' : 'Swing LOW';
  const sweepVerb = isHigh ? 'taken out above' : 'taken out below';

  const sweepPctAll = allStats?.sweepPct;
  const sweepPctSim = simStats?.sweepPct;
  const totalAll = allStats?.total;
  const totalSim = simStats?.total;
  const swept = simStats?.swept;

  return (
    <div style={{
      background: '#080810', border: `1px solid ${accentColor}25`,
      borderRadius: 8, padding: '14px 16px', marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 22, height: 22, background: accentColor + '20',
            border: `1px solid ${accentColor}50`, borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', color: accentColor,
          }}>{icon}</span>
          <div>
            <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'var(--font-mono)' }}>
              BTC {label}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.66rem', fontFamily: 'var(--font-mono)' }}>
              {pivot?.date} · Age: {pivot?.ageHours}h · Reaction: {pivot?.reactionATR} ATR ({fmt(pivot?.reactionPct)})
            </div>
          </div>
        </div>
        <span style={{
          background: accentColor + '15', color: accentColor,
          border: `1px solid ${accentColor}30`,
          borderRadius: 4, padding: '3px 10px',
          fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
        }}>
          {fmtPrice(pivot?.price)}
        </span>
      </div>

      {/* Universe counts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ background: '#0d0d1a', border: '1px solid #1e1e2e', borderRadius: 5, padding: '8px 10px' }}>
          <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>IF IT FAILS (SWEPT)</div>
          <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {allStats?.swept ?? '--'}
          </div>
          <div style={{ color: '#4b5563', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
            of {totalAll} pivots ({horizonDays}d window)
          </div>
        </div>
        <div style={{ background: '#0d0d1a', border: '1px solid #1e1e2e', borderRadius: 5, padding: '8px 10px' }}>
          <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>IF IT HOLDS</div>
          <div style={{ color: '#22c55e', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {allStats?.held ?? '--'}
          </div>
          <div style={{ color: '#4b5563', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
            of {totalAll} pivots held
          </div>
        </div>
      </div>

      {/* Section: How often swept? */}
      <div style={{
        background: '#0a0a14', border: '1px solid #1e1e2a',
        borderRadius: 6, padding: '10px 12px', marginBottom: 10,
      }}>
        <div style={{ color: accentColor, fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em' }}>
          HOW OFTEN WAS THE {isHigh ? 'HIGH' : 'LOW'} {sweepVerb.toUpperCase()}?
        </div>

        <BigStat
          value={sweepPctAll !== null ? `${sweepPctAll}%` : '--'}
          color={sweepPctAll > 60 ? '#ef4444' : '#facc15'}
          label={`of all historical ${isHigh ? 'highs' : 'lows'} ${sweepVerb} later`}
          sublabel={`${allStats?.swept} swept / ${allStats?.held} held · still standing at hour ${Math.round(pivot?.ageHours || 0)}: ${allStats?.stillStandingSweepPct ?? '--'}% swept later (${allStats?.stillStandingSweptCount ?? 0} of ${allStats?.stillStandingCount ?? 0})`}
        />

        {totalSim > 0 && (
          <BigStat
            value={sweepPctSim !== null ? `${sweepPctSim}%` : '--'}
            color={sweepPctSim > 60 ? '#ef4444' : '#facc15'}
            label={`of structurally similar ${isHigh ? 'highs' : 'lows'} swept later`}
            sublabel={`${swept} of ${totalSim} setups (${simStats?.matchedBy}) · standing at hour ${Math.round(pivot?.ageHours || 0)}: ${simStats?.stillStandingSweepPct ?? '--'}% swept (${simStats?.stillStandingSweptCount ?? 0} of ${simStats?.stillStandingCount ?? 0})`}
          />
        )}
      </div>

      {/* Timing breakdown */}
      {simStats?.timingBuckets && (
        <div style={{
          background: '#0a0a14', border: '1px solid #1e1e2a',
          borderRadius: 6, padding: '10px 12px', marginBottom: 10,
        }}>
          <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.08em' }}>
            WHEN WAS IT {isHigh ? 'SWEPT' : 'BREACHED'}? (TIMELINE SURVIVAL)
          </div>
          <TimingBuckets buckets={simStats.timingBuckets} totalSwept={swept} />
          {simStats.post30hSweepPct !== null && (
            <div style={{
              marginTop: 10, padding: '7px 10px',
              background: simStats.post30hSweepPct < (sweepPctSim || 100) ? '#0d1f17' : '#14141e',
              border: `1px solid ${simStats.post30hSweepPct < (sweepPctSim || 100) ? '#22c55e30' : '#2d2d3e'}`,
              borderRadius: 5, color: simStats.post30hSweepPct < (sweepPctSim || 100) ? '#4ade80' : '#9ca3af',
              fontSize: '0.73rem', fontFamily: 'var(--font-mono)',
            }}>
              {simStats.earlySweptCount} of {swept} swept in first 30h → survive 30h &amp; sweep odds shift from{' '}
              <strong>{sweepPctSim}%</strong> to <strong>{simStats.post30hSweepPct}%</strong> ({simStats.post30hSweptCount} of {simStats.post30hStandingCount} standing)
            </div>
          )}
        </div>
      )}

      {/* Probability Targets */}
      {isHigh && lowTargets && (
        <TargetGrid title="LOW TARGETS FOR HELD HIGHS" targets={lowTargets} isHigh={true} />
      )}
      {!isHigh && highTargets && (
        <TargetGrid title="HIGH TARGETS FOR HELD LOWS" targets={highTargets} isHigh={false} />
      )}

      {/* Similar Cases Sample */}
      {simStats?.cases?.length > 0 && (
        <div style={{
          background: '#0a0a14', border: '1px solid #1e1e2a',
          borderRadius: 6, padding: '10px 12px',
        }}>
          <div style={{ color: '#6b7280', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em' }}>
            SIMILAR HISTORICAL {isHigh ? 'HIGHS' : 'LOWS'} ({simStats.cases.length} MOST RECENT)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {simStats.cases.map((c, idx) => {
              const sweptCase = c.outcome === 'swept';
              return (
                <div key={`${c.date}-${idx}`} style={{
                  background: '#0d0d1a',
                  border: `1px solid ${sweptCase ? '#ef444425' : '#22c55e30'}`,
                  borderRadius: 5, padding: '5px 8px',
                  fontSize: '0.66rem', fontFamily: 'var(--font-mono)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ color: '#9ca3af' }}>{c.date}</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 700 }}>{fmtPrice(c.price)}</span>
                  <span style={{ color: sweptCase ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                    {sweptCase ? `SWEPT ${c.sweepHours}h` : `HELD +${c.maxFavorablePct}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PivotFinder() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('high');
  const [interval, setInterval] = useState('4h');

  const fetchPivots = useCallback(async (force = false, tf = '4h', signal) => {
    const url = `/api/pivot-finder?symbol=BTCUSDT&interval=${tf}${force ? '&force=1' : ''}`;
    const res = await fetch(url, { signal });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Unknown error');
    return json.data;
  }, []);

  const handleLoad = useCallback(async (force = false, tf = interval) => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchPivots(force, tf);
      setData(nextData);
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchPivots, interval]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPivots(false, '4h', controller.signal)
      .then((nextData) => setData(nextData))
      .catch((e) => {
        if (e?.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchPivots]);

  const handleIntervalChange = (tf) => {
    setInterval(tf);
    handleLoad(false, tf);
  };

  return (
    <div style={{ color: '#e5e7eb', fontFamily: 'var(--font-main)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconRadar size={18} color="#38bdf8" />
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e5e7eb', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              PIVOT FINDER
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
              {data ? `BTC · ${data.interval.toUpperCase()} · ${data.candleCount} bars (since ${data.historyStart}) · ${timeAgo(data.lastUpdated)}` : 'Loading…'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {['15m', '1h', '4h'].map((tf) => (
            <button
              key={tf}
              onClick={() => handleIntervalChange(tf)}
              style={{
                background: interval === tf ? '#152030' : '#0a0a12',
                border: `1px solid ${interval === tf ? '#38bdf8' : '#1e1e2e'}`,
                borderRadius: 5, padding: '4px 10px',
                color: interval === tf ? '#38bdf8' : '#6b7280',
                fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={() => handleLoad(true, interval)}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: loading ? '#1e1e2e' : '#0a0a12',
              border: '1px solid #2d2d3e', borderRadius: 5,
              color: loading ? '#6b7280' : '#9ca3af',
              padding: '4px 10px', fontSize: '0.72rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <IconRefresh size={12} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Scanning' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#1a0a0a', border: '1px solid #ef444430', borderRadius: 6, padding: '10px 14px', color: '#f87171', fontSize: '0.8rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ textAlign: 'center', color: '#4b5563', padding: '40px 0', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
          Analysing pivots…
        </div>
      )}

      {data && (
        <>
          {/* ATR + Price context bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'BTC', value: fmtPrice(data.currentPrice), color: '#ffffff' },
              { label: 'ATR(14)', value: fmtPrice(data.atr), color: '#9ca3af' },
              { label: 'Horizon', value: `${data.horizonDays}d`, color: '#9ca3af' },
              { label: 'Pivots', value: data.totalPivotsDetected, color: '#9ca3af' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: '#0a0a12', border: '1px solid #1e1e2e',
                borderRadius: 5, padding: '4px 10px',
                fontSize: '0.74rem', fontFamily: 'var(--font-mono)',
              }}>
                <span style={{ color: '#4b5563' }}>{label}: </span>
                <span style={{ color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['high', 'low'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '7px 0',
                  background: activeTab === tab ? (tab === 'high' ? '#1a0808' : '#081a0a') : '#0a0a12',
                  border: `1px solid ${activeTab === tab ? (tab === 'high' ? '#ef444440' : '#22c55e40') : '#1e1e2e'}`,
                  borderRadius: 6, cursor: 'pointer',
                  color: activeTab === tab ? (tab === 'high' ? '#ef4444' : '#22c55e') : '#6b7280',
                  fontSize: '0.76rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  letterSpacing: '0.06em',
                }}
              >
                {tab === 'high' ? '▼ Swing HIGH' : '▲ Swing LOW'}
                {data[tab]?.pivot && (
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>
                    {fmtPrice(data[tab].pivot.price)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Active pivot card */}
          <PivotCard type={activeTab} data={data[activeTab]} horizonDays={data.horizonDays} />

          {/* Disclaimer */}
          <div style={{ color: '#4b5563', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginTop: 8, lineHeight: 1.4 }}>
            Based on {data.candleCount} × {data.interval} BTC candles ({data.horizonDays}-day forward sweep horizon). Historical probabilities do not guarantee future results.
          </div>
        </>
      )}
    </div>
  );
}
