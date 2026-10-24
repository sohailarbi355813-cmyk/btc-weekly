'use client';

import React, { useState, useEffect } from 'react';
import {
  IconRadar,
  IconCalendar,
  IconClock,
  IconTrendUp,
  IconTrendDown,
  IconSparkles,
  IconRefresh,
  IconShield,
  IconZap,
  IconCheck,
} from './Icons';

export default function SessionProfiler() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDow, setSelectedDow] = useState(null); // Defaults to today's DOW once data loads
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'weekly-cycle' | 'logs'

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/session-profiler');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to analyze sessions');

      setData(json.data);
      if (selectedDow === null) {
        setSelectedDow(json.data.today?.dow ?? 1);
      }
      setError(null);
    } catch (err) {
      console.error('Session Profiler Fetch Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionData();
  }, []);

  if (loading && !data) {
    return (
      <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a', padding: '3.5rem', textAlign: 'center' }}>
        <IconRefresh size={28} className="spin" color="#38bdf8" style={{ marginBottom: 12 }} />
        <div style={{ fontFamily: 'var(--font-mono)', color: '#888888', fontSize: '0.9rem' }}>
          Scanning 700+ hourly candles from previous month across Asia, London &amp; New York sessions...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a', padding: '2.5rem', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: 10 }}>Session Scanner Error: {error}</div>
        <button className="va-tab-btn" onClick={fetchSessionData}>
          <IconRefresh size={14} /> Retry Scan
        </button>
      </div>
    );
  }

  const { activeSession, today, weeklyByDay, weeklyCycle, dailyLogs, meta } = data;
  const currentDayStats = weeklyByDay.find(x => x.dow === selectedDow) || weeklyByDay[0];
  const isSelectedToday = selectedDow === today.dow;

  return (
    <div style={{ animation: 'fadeInUp 0.35s ease' }}>
      {/* ── 1. Header Card with Live Active Session Radar ── */}
      <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a', marginBottom: 20 }}>
        <div className="vyaps-card-header" style={{ borderColor: '#161616', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 6,
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconRadar size={18} color="#38bdf8" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em' }}>
                SESSION PROFILER &amp; PROBABILITY ENGINE
              </div>
              <div style={{ fontSize: '0.72rem', color: '#888888' }}>
                Scanned {meta.daysScanned} days ({meta.totalCandlesScanned} hours) across Asia (00-08 UTC), London (07-15 UTC), NY (13-21 UTC)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${activeSession.color}50`,
              padding: '5px 10px',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.74rem'
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeSession.color, boxShadow: `0 0 8px ${activeSession.color}` }} />
              <span style={{ color: activeSession.color, fontWeight: 700 }}>{activeSession.code} ACTIVE</span>
              <span style={{ color: '#888888' }}>({activeSession.hoursRemaining}h left)</span>
            </div>

            <button className="va-tab-btn" onClick={fetchSessionData} title="Refresh Session Scanner" style={{ padding: '0.45rem 0.65rem' }}>
              <IconRefresh size={13} />
            </button>
          </div>
        </div>

        {/* ── Today's Live Playbook Banner ── */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 8,
          margin: '14px 16px',
          padding: '14px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: '#38bdf8',
                color: '#000000',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 4,
                textTransform: 'uppercase'
              }}>
                Today&apos;s Playbook &middot; {today.dayName}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#ffffff', fontWeight: 600 }}>
                {today.stats.topSequence} ({today.stats.topSequencePct}% Probability)
              </span>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#888888' }}>
              Based on {today.stats.totalScanned} {today.dayName}s in previous month
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 10 }}>
            {/* HOD Winner Box */}
            <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                High of Day (HOD) Odds
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  {today.stats.dominantHod}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>
                  {today.stats.dominantHodPct}%
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#aaaaaa', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                NY: {today.stats.hod.NY}% &middot; Lon: {today.stats.hod.London}% &middot; Asia: {today.stats.hod.Asia}%
              </div>
            </div>

            {/* LOD Winner Box */}
            <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                Low of Day (LOD) Odds
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                  {today.stats.dominantLod}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                  {today.stats.dominantLodPct}%
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#aaaaaa', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                Lon: {today.stats.lod.London}% &middot; Asia: {today.stats.lod.Asia}% &middot; NY: {today.stats.lod.NY}%
              </div>
            </div>

            {/* Day Volatility & Bull Rate */}
            <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                Average Volatility &amp; Edge
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                  {today.stats.avgRangePct}%
                </span>
                <span style={{ fontSize: '0.78rem', color: '#888888' }}>avg daily range</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#aaaaaa', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                Green Close Rate: <strong style={{ color: today.stats.bullishRate >= 50 ? '#22c55e' : '#ef4444' }}>{today.stats.bullishRate}%</strong>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#cccccc', lineHeight: 1.5, fontFamily: 'var(--font-main)' }}>
            <strong style={{ color: '#38bdf8' }}>Institutional Insight: </strong>
            {today.playbook}
          </div>
        </div>

        {/* ── Sub Navigation Tabs ── */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px 16px', borderBottom: '1px solid #161616' }}>
          <button
            className={`va-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >
            Weekly Basis Day-by-Day (Mon-Sun)
          </button>
          <button
            className={`va-tab-btn ${activeTab === 'weekly-cycle' ? 'active' : ''}`}
            onClick={() => setActiveTab('weekly-cycle')}
          >
            Weekly Cycle (High / Low of Week)
          </button>
          <button
            className={`va-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            30-Day Session History Log ({dailyLogs.length})
          </button>
        </div>

        {/* ── TAB 1: WEEKLY BASIS DAY-BY-DAY PROFILER ── */}
        {activeTab === 'daily' && (
          <div style={{ padding: '16px' }}>
            {/* 7 Days Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 20 }}>
              {weeklyByDay.map(day => {
                const isSelected = day.dow === selectedDow;
                const isDayToday = day.dow === today.dow;

                return (
                  <button
                    key={day.dow}
                    onClick={() => setSelectedDow(day.dow)}
                    style={{
                      background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${isSelected ? '#38bdf8' : isDayToday ? 'rgba(56, 189, 248, 0.4)' : '#222222'}`,
                      borderRadius: 6,
                      padding: '10px 4px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        fontWeight: isSelected ? 800 : 700,
                        color: isSelected ? '#38bdf8' : '#ffffff'
                      }}>
                        {day.dayName}
                      </span>
                      {isDayToday && (
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#38bdf8' }} />
                      )}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#888888', fontFamily: 'var(--font-mono)' }}>
                      HOD: {day.dominantHod.slice(0, 3)} ({day.dominantHodPct}%)
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#888888', fontFamily: 'var(--font-mono)' }}>
                      LOD: {day.dominantLod.slice(0, 3)} ({day.dominantLodPct}%)
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Day Deep-Dive Card */}
            <div style={{
              background: '#090909',
              border: '1px solid #1c1c1c',
              borderRadius: 8,
              padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', color: '#ffffff', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0 }}>
                    {currentDayStats.fullDayName} Statistical Session Profile
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: '#888888' }}>
                    Sample size: {currentDayStats.totalScanned} {currentDayStats.fullDayName}s in previous month &middot; Avg daily range: {currentDayStats.avgRangePct}%
                  </span>
                </div>

                <div style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.74rem',
                  color: '#38bdf8',
                  fontWeight: 700,
                }}>
                  Top Sequence: {currentDayStats.topSequence} ({currentDayStats.topSequencePct}%)
                </div>
              </div>

              {/* Two Side-by-Side Panels: HOD vs LOD */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 18 }}>
                {/* HOD Probabilities */}
                <div style={{ background: '#050505', border: '1px solid #161616', borderRadius: 6, padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                      ▲ High of the Day (HOD) Probabilities
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#888888' }}>Total = 100%</span>
                  </div>

                  {/* NY */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>New York Session (13:00 - 21:00 UTC)</span>
                      <span style={{ color: '#38bdf8', fontWeight: 800 }}>{currentDayStats.hod.NY}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${currentDayStats.hod.NY}%`, background: '#38bdf8', borderRadius: 99 }} />
                    </div>
                  </div>

                  {/* London */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>London Session (07:00 - 15:00 UTC)</span>
                      <span style={{ color: '#22c55e', fontWeight: 800 }}>{currentDayStats.hod.London}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${currentDayStats.hod.London}%`, background: '#22c55e', borderRadius: 99 }} />
                    </div>
                  </div>

                  {/* Asia */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>Asia Session (00:00 - 08:00 UTC)</span>
                      <span style={{ color: '#f59e0b', fontWeight: 800 }}>{currentDayStats.hod.Asia}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${currentDayStats.hod.Asia}%`, background: '#f59e0b', borderRadius: 99 }} />
                    </div>
                  </div>
                </div>

                {/* LOD Probabilities */}
                <div style={{ background: '#050505', border: '1px solid #161616', borderRadius: 6, padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                      ▼ Low of the Day (LOD) Probabilities
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#888888' }}>Total = 100%</span>
                  </div>

                  {/* Asia */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>Asia Session (00:00 - 08:00 UTC)</span>
                      <span style={{ color: '#f59e0b', fontWeight: 800 }}>{currentDayStats.lod.Asia}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${currentDayStats.lod.Asia}%`, background: '#f59e0b', borderRadius: 99 }} />
                    </div>
                  </div>

                  {/* London */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>London Session (07:00 - 15:00 UTC)</span>
                      <span style={{ color: '#22c55e', fontWeight: 800 }}>{currentDayStats.lod.London}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${currentDayStats.lod.London}%`, background: '#22c55e', borderRadius: 99 }} />
                    </div>
                  </div>

                  {/* NY */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>New York Session (13:00 - 21:00 UTC)</span>
                      <span style={{ color: '#38bdf8', fontWeight: 800 }}>{currentDayStats.lod.NY}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${currentDayStats.lod.NY}%`, background: '#38bdf8', borderRadius: 99 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Playbook Description */}
              <div style={{
                background: 'rgba(56, 189, 248, 0.04)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: 6,
                padding: '12px 16px',
                fontSize: '0.8rem',
                color: '#dddddd',
                lineHeight: 1.5,
              }}>
                <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {currentDayStats.fullDayName} Playbook:
                </span>{' '}
                {currentDayStats.playbook}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: WEEKLY CYCLE (HIGH & LOW OF WEEK BY DAY) ── */}
        {activeTab === 'weekly-cycle' && (
          <div style={{ padding: '16px' }}>
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: '#ffffff', fontSize: '0.92rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                Weekly Extreme Distribution &middot; Which Day Sets the High / Low of the Week?
              </h4>
              <p style={{ fontSize: '0.75rem', color: '#888888', margin: 0 }}>
                Scanned across {weeklyCycle.totalWeeks} completed weeks. Pinpoints which day of the week statistically sets the High of the Week (HOW) and Low of the Week (LOW).
              </p>
            </div>

            <div className="vyaps-table-wrapper" style={{ background: '#050505', border: '1px solid #1c1c1c', borderRadius: 6 }}>
              <table className="vyaps-table" style={{ background: '#050505' }}>
                <thead>
                  <tr>
                    <th>Day of Week</th>
                    <th>Low of Week (LOW) %</th>
                    <th>Low Probability Bar</th>
                    <th>High of Week (HOW) %</th>
                    <th>High Probability Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyCycle.byDay.map(row => (
                    <tr key={row.dow} className="vyaps-row">
                      <td style={{ fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                        {row.fullDayName}
                      </td>
                      <td style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {row.lowOfWeekPct}%
                      </td>
                      <td style={{ width: '25%' }}>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.lowOfWeekPct}%`, background: '#ef4444', borderRadius: 99 }} />
                        </div>
                      </td>
                      <td style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {row.highOfWeekPct}%
                      </td>
                      <td style={{ width: '25%' }}>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.highOfWeekPct}%`, background: '#22c55e', borderRadius: 99 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent Weeks Historical Examples */}
            <div style={{ marginTop: 20 }}>
              <h5 style={{ color: '#888888', fontSize: '0.78rem', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                Recent Weeks Extreme History
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {weeklyCycle.recentWeeks.map((w, idx) => (
                  <div key={idx} style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#888888', marginBottom: 4 }}>
                      Week of {w.weekStart}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      LOW: <span style={{ color: '#ef4444', fontWeight: 700 }}>{w.lowDay}</span> (${Number(w.weekLow).toLocaleString()})
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      HOW: <span style={{ color: '#22c55e', fontWeight: 700 }}>{w.highDay}</span> (${Number(w.weekHigh).toLocaleString()})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: 30-DAY HISTORICAL LOGS ── */}
        {activeTab === 'logs' && (
          <div style={{ padding: '16px' }}>
            <div className="vyaps-table-wrapper" style={{ background: '#050505', border: '1px solid #1c1c1c', borderRadius: 6, maxHeight: 450, overflowY: 'auto' }}>
              <table className="vyaps-table" style={{ background: '#050505' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Return</th>
                    <th>Range</th>
                    <th>HOD Winner</th>
                    <th>LOD Winner</th>
                    <th>Sequence</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyLogs.map(log => {
                    const isPos = log.dayReturn > 0;
                    return (
                      <tr key={log.date} className="vyaps-row">
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                          {log.date}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#888888' }}>
                          {log.dayName}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: isPos ? '#22c55e' : '#ef4444' }}>
                          {isPos ? '+' : ''}{log.dayReturn}%
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#cccccc' }}>
                          ${log.dayRange} ({log.dayRangePct}%)
                        </td>
                        <td>
                          <span style={{
                            background: log.hodSession === 'New York' ? 'rgba(56, 189, 248, 0.15)' : log.hodSession === 'London' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: log.hodSession === 'New York' ? '#38bdf8' : log.hodSession === 'London' ? '#22c55e' : '#f59e0b',
                            border: `1px solid ${log.hodSession === 'New York' ? '#38bdf8' : log.hodSession === 'London' ? '#22c55e' : '#f59e0b'}40`,
                            padding: '2px 7px',
                            borderRadius: 3,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}>
                            {log.hodSession} ({log.hodHour}:00 UTC)
                          </span>
                        </td>
                        <td>
                          <span style={{
                            background: log.lodSession === 'New York' ? 'rgba(56, 189, 248, 0.15)' : log.lodSession === 'London' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: log.lodSession === 'New York' ? '#38bdf8' : log.lodSession === 'London' ? '#22c55e' : '#f59e0b',
                            border: `1px solid ${log.lodSession === 'New York' ? '#38bdf8' : log.lodSession === 'London' ? '#22c55e' : '#f59e0b'}40`,
                            padding: '2px 7px',
                            borderRadius: 3,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}>
                            {log.lodSession} ({log.lodHour}:00 UTC)
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#aaaaaa' }}>
                          {log.sequence}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
