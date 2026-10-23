'use client';

import React, { useState, useEffect } from 'react';
import {
  IconRadar,
  IconSearch,
  IconZap,
  IconBell,
  IconCheck,
  IconTrendUp,
  IconTrendDown,
  IconRefresh,
  IconTarget,
} from './Icons';
import { playAlertChime } from '@/lib/alertSound';

const QUICK_MOVERS = [
  { symbol: 'SUI', change: '+24.2%', dir: 'pump' },
  { symbol: 'TAO', change: '+31.5%', dir: 'pump' },
  { symbol: 'ENA', change: '+19.4%', dir: 'pump' },
  { symbol: 'TIA', change: '-14.8%', dir: 'dump' },
  { symbol: 'DOGE', change: '+22.0%', dir: 'pump' },
  { symbol: 'VIRTUAL', change: '-18.6%', dir: 'dump' },
  { symbol: 'RENDER', change: '+16.2%', dir: 'pump' },
  { symbol: 'APT', change: '+14.1%', dir: 'pump' },
];

export default function TwinPatternScanner({ onSetAlert }) {
  const [targetInput, setTargetInput] = useState('SUI');
  const [activeQuery, setActiveQuery] = useState('SUI');
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [armedAlerts, setArmedAlerts] = useState(new Set());

  const executeScan = async (symbolToScan) => {
    const sym = (symbolToScan || targetInput).trim().toUpperCase();
    if (!sym) return;

    setLoading(true);
    setError(null);
    setActiveQuery(sym);

    try {
      const res = await fetch(`/api/catalyst-scanner?symbol=${encodeURIComponent(sym)}`);
      if (!res.ok) throw new Error('Failed to query catalyst engine.');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');

      setScanResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeScan('SUI');
  }, []);

  const handleArmAlert = (twin) => {
    if (onSetAlert) {
      onSetAlert({
        symbol: twin.symbol,
        fullSymbol: twin.fullSymbol,
        targetPrice: twin.spot,
        condition: twin.change24h >= 0 ? 'price_above' : 'price_below',
        note: `Twin Pattern Match for ${activeQuery} (${twin.similarity}% similarity)`,
      });
    }
    setArmedAlerts((prev) => new Set(prev).add(twin.symbol));
    playAlertChime();
  };

  const diagnosis = scanResult?.diagnosis;
  const twins = scanResult?.twins || [];

  return (
    <div style={{ animation: 'fadeInUp 0.35s ease' }}>
      {/* ── Search Bar & Quick Catalyst Pills ── */}
      <div style={{
        background: '#070707',
        border: '1px solid #1a1a1a',
        borderRadius: 10,
        padding: '20px 22px',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconZap size={18} color="#38bdf8" />
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em', fontFamily: 'var(--font-display)' }}>
                CATALYST ATTRIBUTION &amp; PATTERN TWIN SCANNER
              </span>
            </div>
            <p style={{ fontSize: '0.74rem', color: '#888888', marginTop: 4 }}>
              Type ANY coin that pumped or dumped. The system diagnoses the underlying orderflow catalyst, then immediately identifies which of our 55 whitelisted alts are currently forming the exact same pattern!
            </p>
          </div>
        </div>

        {/* Input Row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeScan(targetInput);
          }}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value.toUpperCase())}
              placeholder="Type coin that moved hard (e.g. SUI, ENA, TAO, TIA, DOGE)..."
              style={{
                width: '100%',
                background: '#000000',
                border: '1px solid #282828',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#ffffff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#38bdf8')}
              onBlur={(e) => (e.target.style.borderColor = '#282828')}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 22px',
              background: '#000000',
              border: '1px solid #38bdf8',
              borderRadius: 8,
              color: '#38bdf8',
              fontFamily: 'var(--font-main)',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 0 14px rgba(56, 189, 248, 0.15)',
              transition: 'all 0.15s ease',
            }}
          >
            <IconSearch size={15} className={loading ? 'spin-icon' : ''} />
            <span>{loading ? 'Diagnosing Catalyst...' : 'Scan Reason & Find 55 Alts Twins'}</span>
          </button>
        </form>

        {/* Quick Movers Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: '#666666', fontFamily: 'var(--font-mono)' }}>
            QUICK RUNNERS:
          </span>
          {QUICK_MOVERS.map((m) => (
            <button
              key={m.symbol}
              type="button"
              onClick={() => {
                setTargetInput(m.symbol);
                executeScan(m.symbol);
              }}
              style={{
                background: activeQuery === m.symbol ? 'rgba(56, 189, 248, 0.15)' : '#000000',
                border: `1px solid ${activeQuery === m.symbol ? '#38bdf8' : '#222222'}`,
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: m.dir === 'pump' ? '#22c55e' : '#ef4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ color: '#ffffff', fontWeight: 700 }}>{m.symbol}</span>
              <span>{m.change}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: 14, color: '#ef4444', marginBottom: 20, fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {/* ── Section A: Diagnosed Catalyst Reason Card ── */}
      {diagnosis && (
        <div style={{
          background: '#070707',
          border: `1px solid ${diagnosis.direction === 'PUMP' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
          borderRadius: 10,
          padding: '22px 24px',
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Top Row: Coin Badge, Move Magnitude, and Confidence */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: '#000000',
                border: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontFamily: 'var(--font-mono)',
                color: '#38bdf8',
                fontSize: '1rem',
              }}>
                {diagnosis.symbol.slice(0, 3)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-display)' }}>
                    {diagnosis.symbol}
                  </span>
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: diagnosis.direction === 'PUMP' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: diagnosis.direction === 'PUMP' ? '#22c55e' : '#ef4444',
                    border: `1px solid ${diagnosis.direction === 'PUMP' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}>
                    {diagnosis.magnitude} (24H {diagnosis.direction})
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#888888', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  Spot: ${Number(diagnosis.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: '#000000',
                border: '1px solid #222222',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                color: '#38bdf8',
              }}>
                Confidence: <strong>{diagnosis.confidence}%</strong>
              </div>
            </div>
          </div>

          {/* Diagnosed Catalyst Box */}
          <div style={{
            background: '#000000',
            border: '1px solid #1c1c1c',
            borderRadius: 8,
            padding: '16px 18px',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <IconTarget size={15} color="#38bdf8" />
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888888', fontWeight: 700 }}>
                DIAGNOSED CATALYST REASON &amp; ORDERFLOW SIGNATURE
              </span>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#38bdf8', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
              {diagnosis.archetype.name}
            </div>
            <p style={{ fontSize: '0.82rem', color: '#cccccc', lineHeight: 1.6, marginBottom: 10 }}>
              {diagnosis.detailedReason}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, fontSize: '0.74rem', borderTop: '1px solid #181818', paddingTop: 10 }}>
              <div>
                <span style={{ color: '#888888', display: 'block' }}>Pre-Move Fingerprint:</span>
                <span style={{ color: '#ffffff' }}>{diagnosis.archetype.preCondition}</span>
              </div>
              <div>
                <span style={{ color: '#888888', display: 'block' }}>Scanning 55 Alts For:</span>
                <span style={{ color: '#22c55e' }}>{diagnosis.archetype.twinCriteria}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section B: Identified Twin Coins Among 55 Alts ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconRadar size={18} color="#38bdf8" />
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-display)' }}>
              IDENTIFIED PATTERN TWINS IN OUR 55 ALTS
            </span>
            <span style={{
              background: '#2dd4bf',
              color: '#000000',
              fontWeight: 800,
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {twins.length} Active Candidates
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#888888', fontFamily: 'var(--font-mono)' }}>
            Sorted by Twin Match Similarity
          </span>
        </div>

        {twins.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: '#070707', border: '1px solid #1a1a1a', borderRadius: 8, color: '#888888' }}>
            <IconRadar size={32} color="#38bdf8" style={{ marginBottom: 12, opacity: 0.7 }} />
            <p style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>No exact twin candidates active for this archetype right now.</p>
            <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Try scanning another runner like SUI, TAO, or ENA.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
            {twins.map((twin) => {
              const isArmed = armedAlerts.has(twin.symbol);
              return (
                <div
                  key={twin.symbol}
                  style={{
                    background: '#070707',
                    border: '1px solid #1f1f1f',
                    borderRadius: 10,
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#38bdf8')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1f1f1f')}
                >
                  <div>
                    {/* Header: Symbol, Price, and Match % */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          background: '#000000',
                          border: '1px solid #262626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          color: '#38bdf8',
                          fontSize: '0.85rem',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {twin.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-display)' }}>
                              {twin.symbol}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#888888' }}>{twin.name}</span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#aaaaaa', fontFamily: 'var(--font-mono)' }}>
                            Spot: ${Number(twin.spot).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          padding: '3px 9px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {twin.similarity}% TWIN MATCH
                        </span>
                      </div>
                    </div>

                    {/* Stage Badge */}
                    <div style={{
                      background: '#000000',
                      border: '1px solid #1a1a1a',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: '0.74rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#22c55e',
                      marginBottom: 12,
                    }}>
                      ⚡ {twin.stage}
                    </div>

                    {/* Trigger Action Description */}
                    <p style={{ fontSize: '0.78rem', color: '#cccccc', lineHeight: 1.5, marginBottom: 14 }}>
                      {twin.triggerAction}
                    </p>

                    {/* Actionable Blueprint Grid */}
                    <div style={{
                      background: '#040404',
                      border: '1px solid #161616',
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      marginBottom: 16,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#777777' }}>Entry Zone:</span>
                        <span style={{ color: '#ffffff', fontWeight: 600 }}>{twin.entryZone}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#777777' }}>Target:</span>
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>{twin.targetPrice}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#777777' }}>Invalidation:</span>
                        <span style={{ color: '#ef4444' }}>{twin.invalidation}</span>
                      </div>
                    </div>
                  </div>

                  {/* Arm Alert Button */}
                  <button
                    type="button"
                    onClick={() => handleArmAlert(twin)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px',
                      background: isArmed ? '#0d2218' : '#0a0a0a',
                      border: `1px solid ${isArmed ? '#22c55e' : '#262626'}`,
                      borderRadius: 6,
                      color: isArmed ? '#22c55e' : '#38bdf8',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isArmed ? <IconCheck size={14} /> : <IconBell size={14} />}
                    <span>{isArmed ? 'Alert Armed for this Twin' : 'Arm Instant Audio & Webhook Alert'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
