'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTodayBias, analyzeDayOfWeek } from '@/lib/biasEngine';
import { calculateWolfKeyLevels } from '@/lib/wolfLevelsEngine';
import { buildWeeklyProfiles, findSimilarWeeks } from '@/lib/weekPatternEngine';
import { calculateWeeklyHighLowProbabilities } from '@/lib/weeklyHighLowEngine';
import WolfKeyLevels from '@/components/WolfKeyLevels';
import MacroWhalesEtf from '@/components/MacroWhalesEtf';
import WeeklyForecast from '@/components/WeeklyForecast';
import SessionProfiler from '@/components/SessionProfiler';
import RsiScannerWidget from '@/components/RsiScannerWidget';
import MarketStructureTable from '@/components/MarketStructureTable';
import {
  IconScale, IconRadar, IconBarChart, IconRefresh, IconZap,
  IconAlertTriangle, IconShield, IconWolf, IconBlackFlag,
  IconMenu, IconX, IconCalendar, IconClock,
} from '@/components/Icons';

const PRIMARY_SIGNAL_IDS = ['trend', 'structure', 'weekly_open', 'momentum'];

function formatPrice(n) {
  if (!n) return '--';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(n, decimals = 1) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(decimals)}%`;
}

// ─── Verdict Hero Component ────────────────────────────────────────────────────

function VerdictHero({ bias, data, clientDate, lastUpdated }) {
  if (!bias || !data) return null;

  const verdict = bias.verdict === 'BULLISH' ? 'BULLISH' : 'BEARISH';
  const color = verdict === 'BULLISH' ? '#22c55e' : '#ef4444';
  const verdictBorder = verdict === 'BULLISH' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)';
  const score = bias.score;
  const effectiveStrength = bias.strengthPct || Math.min(98, Math.max(52, Math.round(50 + Math.abs(score) * 0.48)));

  const formattedDate = clientDate
    ? clientDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : bias.date || '';

  const syncedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const convictionLabel = effectiveStrength >= 82
    ? 'Very High'
    : effectiveStrength >= 72
    ? 'High'
    : effectiveStrength >= 62
    ? 'Moderate'
    : effectiveStrength >= 54
    ? 'Mild'
    : 'Developing';

  const primarySignals = (bias.signals || []).filter(sig => PRIMARY_SIGNAL_IDS.includes(sig.id));

  return (
    <div className="verdict-hero-card" style={{
      border: `1px solid ${verdictBorder}`,
      background: '#050505',
    }}>
      {/* Top bar: date + synced time + live spot */}
      <div className="verdict-top-bar">
        <div className="verdict-date">
          {formattedDate}
          {syncedTime && <span style={{ color: '#4b5563', marginLeft: 8 }}>· Synced {syncedTime}</span>}
        </div>
        <div className="verdict-price-badge">
          <div className="verdict-spot-price">
            {formatPrice(data.currentPrice)}
          </div>
        </div>
      </div>

      {/* Main verdict body */}
      <div className="verdict-hero-body">
        <div className="verdict-hero-content">
          <div className="verdict-hero-title" style={{ color }}>
            {verdict === 'BULLISH' ? '↑ BULLISH' : '↓ BEARISH'}
          </div>

          <p className="verdict-hero-reason">
            {bias.verdictReason}
          </p>

          {/* 4 Core Driver Pills */}
          <div className="verdict-signals-wrap">
            {primarySignals.map(sig => {
              const sc = sig.state === 'bullish' ? '#22c55e' : sig.state === 'bearish' ? '#ef4444' : '#6b7280';
              return (
                <div key={sig.id} className="verdict-signal-pill" style={{ borderColor: '#1e1e24', background: '#0a0a0a' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                  <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)' }}>{sig.name}:</span>
                  <span style={{ color: sc, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{sig.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Strength Ring */}
        <div className="verdict-score-meter-wrap">
          <div className="verdict-score-circle" style={{ borderColor: color, background: '#0a0a0a' }}>
            <span style={{ color }}>
              {effectiveStrength}%
            </span>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.08em', color: '#9ca3af', fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>
              STRENGTH
            </span>
          </div>
          <div className="verdict-score-subtext">
            <span style={{ color, fontWeight: 800 }}>{verdict} BIAS</span><br />
            Conviction: <strong style={{ color: '#ffffff' }}>{convictionLabel}</strong>
          </div>
        </div>
      </div>

      {/* Footer: Weekly Levels + Sigma Bar */}
      <div className="verdict-footer-bar">
        {(bias.weeklyOpen > 0 || bias.priorWeekLevels?.pwh > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: '0.76rem' }}>
            <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)' }}>Weekly:</span>
            {bias.weeklyOpen > 0 && (
              <span style={{ color: bias.aboveWeeklyOpen ? '#4ade80' : '#f87171', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                WO {formatPrice(bias.weeklyOpen)} ({formatPct(bias.pctFromWeeklyOpen)})
              </span>
            )}
            {bias.priorWeekLevels?.pwh > 0 && (
              <>
                <span style={{ color: '#374151' }}>·</span>
                <span style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  PWH {formatPrice(bias.priorWeekLevels.pwh)}
                </span>
                <span style={{ color: '#374151' }}>·</span>
                <span style={{ color: '#4ade80', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  PWL {formatPrice(bias.priorWeekLevels.pwl)}
                </span>
                {bias.priorWeekLevels.posInRange !== null && bias.priorWeekLevels.posInRange !== undefined && (
                  <span style={{
                    fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                    background: '#0a0a0a', border: '1px solid #1e1e24',
                    padding: '1px 7px', borderRadius: 3, color: '#9ca3af',
                  }}>
                    {bias.priorWeekLevels.posInRange}% of PW range
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Sigma Visual Bar */}
        {bias.sigmaMetrics && (() => {
          const sm = bias.sigmaMetrics;
          const rawPos = ((sm.zScore + 3) / 6) * 100;
          const markerPos = Math.max(2, Math.min(98, rawPos));
          const markerColor = sm.zScore <= -2.2 ? '#4ade80'
            : sm.zScore <= -1.2 ? '#38bdf8'
            : sm.zScore >= 2.2 ? '#f87171'
            : sm.zScore >= 1.2 ? '#fb923c'
            : '#94a3b8';
          const statusColor = sm.color || markerColor;

          const minus3 = sm.minus3Sigma || Math.round(sm.mean - 3 * (sm.stdDev || (sm.mean * 0.025)));
          const plus3 = sm.plus3Sigma || Math.round(sm.mean + 3 * (sm.stdDev || (sm.mean * 0.025)));

          const anchors = [
            { pct: 0, label: '-3σ', val: minus3, color: '#22c55e' },
            { pct: 16.66, label: '-2σ', val: sm.minus2Sigma, color: '#4ade80' },
            { pct: 33.33, label: '-1σ', val: sm.minus1Sigma, color: '#38bdf8' },
            { pct: 50.00, label: 'Mean (μ)', val: sm.mean, color: '#9ca3af' },
            { pct: 66.66, label: '+1σ', val: sm.plus1Sigma, color: '#fb923c' },
            { pct: 83.33, label: '+2σ', val: sm.plus2Sigma, color: '#f87171' },
            { pct: 100, label: '+3σ', val: plus3, color: '#ef4444' },
          ];

          return (
            <div className="sigma-bar-wrap">
              <div className="sigma-bar-header">
                <span className="sigma-bar-label">σ Gaussian Band</span>
                <span className="sigma-bar-zscore" style={{ color: statusColor }}>
                  {sm.zScoreText}
                </span>
                <span className="sigma-bar-status" style={{ color: statusColor }}>
                  {sm.statusShort}
                </span>
              </div>

              <div className="sigma-bar-container">
                <div className="sigma-bar-track">
                  <div className="sigma-zone sigma-zone-extreme-os" />
                  <div className="sigma-zone sigma-zone-os" />
                  <div className="sigma-zone sigma-zone-fair" />
                  <div className="sigma-zone sigma-zone-ob" />
                  <div className="sigma-zone sigma-zone-extreme-ob" />

                  <div className="sigma-marker-wrap" style={{ left: `${markerPos}%` }}>
                    <div className="sigma-marker-dot" style={{ background: markerColor }} />
                    <div
                      className="sigma-marker-pill"
                      style={{
                        color: markerColor,
                        borderColor: `${markerColor}60`,
                        ...(markerPos < 18 ? { left: 0 } : markerPos > 82 ? { right: 0 } : {}),
                      }}
                    >
                      {formatPrice(data.currentPrice)} ({sm.zScoreText})
                    </div>
                  </div>
                </div>

                <div className="sigma-anchors-track">
                  {anchors.map(a => (
                    <div
                      key={a.label}
                      className="sigma-anchor-col"
                      style={{
                        left: `${a.pct}%`,
                        transform: a.pct === 0 ? 'translateX(0%)' : a.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                      }}
                    >
                      <div className="sigma-anchor-tick" />
                      <div className="sigma-anchor-label" style={{ color: a.color || 'var(--text-muted)' }}>
                        {a.label}
                      </div>
                      {a.val && (
                        <div className="sigma-anchor-price" style={{ color: a.color || '#fff' }}>
                          {formatPrice(a.val)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Signals Breakdown Table ───────────────────────────────────────────────────

function SignalsBreakdown({ bias }) {
  if (!bias?.signals) return null;
  return (
    <div style={{ marginBottom: 24, background: '#050505', border: '1px solid #1a1a1a', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconRadar size={14} color="#38bdf8" />
        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>
          All 8 Factors · Weighted Score: {bias.score > 0 ? '+' : ''}{bias.score}/100
        </span>
      </div>
      <div style={{ padding: '0 4px' }}>
        {bias.signals.map((sig, i) => {
          const sc = sig.state === 'bullish' ? '#22c55e' : sig.state === 'bearish' ? '#ef4444' : '#6b7280';
          const barWidth = sig.weight > 0 ? `${Math.round((Math.abs(sig.score) / sig.weight) * 100)}%` : '0%';
          const isBull = sig.state === 'bullish';
          return (
            <div key={sig.id} className="signals-breakdown-row" style={{
              borderBottom: i < bias.signals.length - 1 ? '1px solid #111115' : 'none',
            }}>
              <div className="signals-breakdown-info">
                <div className="signals-breakdown-name">{sig.name}</div>
                <div className="signals-breakdown-detail">{sig.detail}</div>
              </div>
              <div className="signals-breakdown-bar-col">
                <div className="signals-breakdown-track">
                  <div style={{
                    height: '100%', width: barWidth, background: sc, borderRadius: 2,
                    marginLeft: isBull ? 0 : 'auto',
                    transition: 'width 0.35s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.68rem', color: sc, fontFamily: 'var(--font-mono)' }}>{sig.label}</div>
              </div>
              <div className="signals-breakdown-score-col">
                <span style={{
                  fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  color: sc,
                  background: '#0a0a0a', border: `1px solid ${sc}30`,
                  padding: '2px 7px', borderRadius: 3,
                }}>
                  {sig.score > 0 ? '+' : ''}{sig.score}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('levels');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clientDate, setClientDate] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [weeklyProbBias, setWeeklyProbBias] = useState('auto');
  const [showSignals, setShowSignals] = useState(false);

  const navigateToSection = (tabId) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    setTimeout(() => {
      if (tabId === 'bias') {
        const hero = document.getElementById('todays-bias');
        if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const el = document.getElementById('active-tab-content');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/btc-data');
      if (!res.ok) throw new Error('Failed to fetch BTC price history. Please try again.');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (!Array.isArray(json.candles) || json.candles.length === 0) {
        throw new Error('No historical BTC candle data returned.');
      }

      const currentPrice = json.currentPrice || json.candles[json.candles.length - 1]?.close || 0;
      const now = new Date();
      setClientDate(now);
      setLastUpdated(now);
      setData({ candles: json.candles, count: json.count, currentPrice });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 400);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Live price ticker every 5s
  useEffect(() => {
    let isMounted = true;
    const pollLivePrice = async () => {
      try {
        const res = await fetch('/api/live-price');
        if (!res.ok) return;
        const pData = await res.json();
        if (pData?.success && pData.price > 0 && isMounted) {
          setData(prev => {
            if (!prev || prev.currentPrice === pData.price) return prev;
            return { ...prev, currentPrice: pData.price };
          });
        }
      } catch (e) {}
    };
    const interval = setInterval(pollLivePrice, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  // Synchronize latest daily candle immutably with 5s live spot ticks
  const syncedCandles = useMemo(() => {
    if (!data?.candles?.length) return null;
    const candles = data.candles;
    const spot = data.currentPrice;
    if (!spot || spot <= 0) return candles;
    const refDayStr = (clientDate || new Date()).toISOString().split('T')[0];
    const last = candles[candles.length - 1];
    if (last.date !== refDayStr) return candles;
    const updated = candles.slice(0, -1);
    updated.push({
      ...last,
      close: spot,
      high: Math.max(last.high, spot),
      low: Math.min(last.low, spot),
    });
    return updated;
  }, [data, clientDate]);

  const bias = useMemo(() => {
    if (!syncedCandles?.length || !data?.currentPrice) return null;
    return getTodayBias(syncedCandles, data.currentPrice, clientDate || new Date());
  }, [syncedCandles, data?.currentPrice, clientDate]);

  const weekPattern = useMemo(() => {
    if (!syncedCandles?.length) return null;
    const profiles = buildWeeklyProfiles(syncedCandles);
    return findSimilarWeeks(profiles, 25, clientDate || new Date());
  }, [syncedCandles, clientDate]);

  const dowStats2025 = useMemo(() => {
    if (!syncedCandles?.length) return null;
    return analyzeDayOfWeek(syncedCandles, '2025-01-01');
  }, [syncedCandles]);

  const wolfLevels = useMemo(() => {
    if (!syncedCandles?.length || !data?.currentPrice) return null;
    return calculateWolfKeyLevels(syncedCandles, data.currentPrice);
  }, [syncedCandles, data?.currentPrice]);

  const weeklyHighLowData = useMemo(() => {
    if (!syncedCandles?.length || !data?.currentPrice) return null;
    return calculateWeeklyHighLowProbabilities(
      syncedCandles,
      data.currentPrice,
      clientDate || new Date(),
      weeklyProbBias,
      weekPattern?.topMatches,
      bias?.verdict?.toLowerCase()
    );
  }, [syncedCandles, data?.currentPrice, clientDate, weeklyProbBias, weekPattern?.topMatches, bias?.verdict]);

  const handleRefresh = () => loadData(true);

  // Loading
  if (loading && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo">
                <div className="logo-icon"><IconBlackFlag size={20} /></div>
                <div className="logo-text"><h1>Wolf Terminal</h1></div>
              </div>
            </div>
          </div>
        </header>
        <main className="main" style={{ flex: 1 }}>
          <div className="container">
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text" style={{ fontFamily: 'var(--font-mono)', color: '#9ca3af' }}>
                Loading BTC market data...
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error
  if (error && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo">
                <div className="logo-icon"><IconBlackFlag size={20} /></div>
                <div className="logo-text"><h1>Wolf Terminal</h1></div>
              </div>
            </div>
          </div>
        </header>
        <main className="main" style={{ flex: 1 }}>
          <div className="container">
            <div className="error-screen">
              <div className="error-icon-box"><IconAlertTriangle size={36} color="var(--bearish)" /></div>
              <h2>Market Data Sync Error</h2>
              <p>{error}</p>
              <button id="retry-btn" className="retry-btn" onClick={() => loadData()}>
                <IconRefresh size={14} /><span>Retry Sync</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!bias || !data) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>

      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo" onClick={() => navigateToSection('bias')} style={{ cursor: 'pointer' }}>
              <div className="logo-icon"><IconBlackFlag size={20} /></div>
              <div className="logo-text"><h1>Wolf Terminal</h1></div>
            </div>

            <nav className="header-nav">
              {[
                { id: 'bias', label: 'Today' },
                { id: 'levels', label: 'Levels', Icon: IconWolf, iconColor: 'var(--wolf-yellow-bright)' },
                { id: 'session', label: 'Sessions', Icon: IconClock },
                { id: 'pattern', label: 'Forecast', Icon: IconCalendar },
                { id: 'rsi', label: 'RSI', Icon: IconZap },
                { id: 'structure', label: 'Structure', Icon: IconScale },
                { id: 'macro', label: 'Whales', Icon: IconBarChart },
              ].map(({ id, label, Icon, iconColor }) => (
                <button key={id} className={`header-nav-link ${activeTab === id ? 'active' : ''}`} onClick={() => navigateToSection(id)}>
                  {Icon && <Icon size={13} color={activeTab === id ? (iconColor || 'var(--accent)') : 'var(--text-muted)'} />}
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="header-right">
              <div className="btc-price-header">{formatPrice(data.currentPrice)}</div>
              <button className="live-badge-btn" onClick={handleRefresh} title="Click to refresh live feed">
                <span className="live-dot" />
                <span>Live</span>
                <IconRefresh size={12} className={refreshing ? 'spin-icon' : ''} style={{ opacity: refreshing ? 1 : 0.6 }} />
              </button>
              <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
                <IconMenu size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-nav-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconBlackFlag size={18} color="var(--wolf-yellow-bright)" />
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Navigation</span>
              </div>
              <button className="mobile-nav-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                <IconX size={20} />
              </button>
            </div>
            <div className="mobile-nav-price-card">
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bitcoin</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{formatPrice(data.currentPrice)}</div>
              </div>
              <button className="live-badge-btn" onClick={() => { handleRefresh(); setMobileMenuOpen(false); }}>
                <span className="live-dot" /><span>Refresh</span>
              </button>
            </div>
            <div className="mobile-nav-links">
              {[
                { id: 'bias', Icon: IconScale, title: "Today's Bias", desc: 'Direction, Strength & Sigma Band' },
                { id: 'levels', Icon: IconWolf, title: 'Key Levels', desc: 'Auction Ladder, VAL/VAH & Targets' },
                { id: 'session', Icon: IconClock, title: 'Session HOD/LOD', desc: 'Asia, London & NY Probabilities' },
                { id: 'pattern', Icon: IconCalendar, title: 'Weekly Forecast & HOW/LOW', desc: 'High/Low Probabilities & Cycle Match' },
                { id: 'rsi', Icon: IconZap, title: 'RSI Alerts', desc: 'Overbought / Oversold Scanner' },
                { id: 'structure', Icon: IconScale, title: 'Market Structure', desc: '1H, 4H, 1D, 1W · 2-Candle Confirmation' },
                { id: 'macro', Icon: IconBarChart, title: 'Whales · MVRV · ETFs', desc: 'Positioning, Valuation & Flows' },
              ].map(({ id, Icon, title, desc }) => (
                <button key={id} className={`mobile-nav-item ${activeTab === id ? 'active' : ''}`} onClick={() => navigateToSection(id)}>
                  <Icon size={18} color="var(--accent)" />
                  <div className="mobile-nav-item-text">
                    <span className="mobile-nav-title">{title}</span>
                    <span className="mobile-nav-desc">{desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main className="main" style={{ flex: 1 }}>
        <div className="container">

          {/* ── VERDICT HERO ── */}
          <div id="todays-bias">
            <VerdictHero bias={bias} data={data} clientDate={clientDate} lastUpdated={lastUpdated} />

            {/* Signals breakdown toggle */}
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={() => setShowSignals(!showSignals)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#080808', border: '1px solid #1e1e24',
                  borderRadius: 6, padding: '7px 14px', fontSize: '0.74rem',
                  color: '#9ca3af', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', transition: 'all 0.15s ease',
                }}
              >
                <IconRadar size={13} color="var(--accent)" />
                <span>Confluence Breakdown</span>
                <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>{showSignals ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {showSignals && <div style={{ marginTop: 12 }}><SignalsBreakdown bias={bias} /></div>}
            </div>
          </div>

          {/* ── TABS ── */}
          <div className="tab-bar">
            <button id="tab-levels" className={`tab-btn ${activeTab === 'levels' ? 'active' : ''}`} onClick={() => navigateToSection('levels')}>
              <IconWolf size={15} color={activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : 'var(--wolf-yellow)'} />
              <span style={{ color: activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : undefined }}>Wolf Key Levels</span>
            </button>
            <button id="tab-session" className={`tab-btn ${activeTab === 'session' ? 'active' : ''}`} onClick={() => navigateToSection('session')}>
              <IconClock size={15} color={activeTab === 'session' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'session' ? '#38bdf8' : undefined }}>Session HOD/LOD</span>
            </button>
            <button id="tab-pattern" className={`tab-btn ${activeTab === 'pattern' ? 'active' : ''}`} onClick={() => navigateToSection('pattern')}>
              <IconCalendar size={15} color={activeTab === 'pattern' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'pattern' ? '#38bdf8' : undefined }}>Weekly Forecast</span>
            </button>
            <button id="tab-macro" className={`tab-btn ${activeTab === 'macro' ? 'active' : ''}`} onClick={() => navigateToSection('macro')}>
              <IconBarChart size={15} color={activeTab === 'macro' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'macro' ? '#38bdf8' : undefined }}>Whales · MVRV · ETFs</span>
            </button>
            <button id="tab-rsi" className={`tab-btn ${activeTab === 'rsi' ? 'active' : ''}`} onClick={() => navigateToSection('rsi')}>
              <IconZap size={15} color={activeTab === 'rsi' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'rsi' ? '#38bdf8' : undefined }}>RSI Alerts</span>
            </button>
            <button id="tab-structure" className={`tab-btn ${activeTab === 'structure' ? 'active' : ''}`} onClick={() => navigateToSection('structure')}>
              <IconScale size={15} color={activeTab === 'structure' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'structure' ? '#38bdf8' : undefined }}>Market Structure</span>
            </button>
          </div>

          {/* ── Tab Content ── */}
          <div id="active-tab-content" style={{ scrollMarginTop: '80px', minHeight: '400px' }}>
            {activeTab === 'levels' && <WolfKeyLevels levelsData={wolfLevels} />}
            {activeTab === 'session' && <SessionProfiler />}
            {activeTab === 'pattern' && (
              <WeeklyForecast
                weekPattern={weekPattern}
                weeklyHighLowData={weeklyHighLowData}
                selectedWeeklyBias={weeklyProbBias}
                onWeeklyBiasChange={setWeeklyProbBias}
                dowStats2025={dowStats2025}
                formatPrice={formatPrice}
              />
            )}
            {activeTab === 'macro' && <MacroWhalesEtf />}
            {activeTab === 'rsi' && <RsiScannerWidget />}
            {activeTab === 'structure' && <MarketStructureTable />}
          </div>

        </div>
      </main>

      {/* Mobile Bottom Bar */}
      <div className="mobile-bottom-bar">
        {[
          { id: 'levels', Icon: IconWolf, label: 'Levels' },
          { id: 'session', Icon: IconClock, label: 'Sessions' },
          { id: 'pattern', Icon: IconCalendar, label: 'Forecast' },
          { id: 'macro', Icon: IconBarChart, label: 'Whales' },
          { id: 'rsi', Icon: IconZap, label: 'RSI' },
          { id: 'structure', Icon: IconScale, label: 'Structure' },
        ].map(({ id, Icon, label }) => (
          <button key={id} className={`mobile-bottom-btn ${activeTab === id ? 'active' : ''}`} onClick={() => navigateToSection(id)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-left">
              <IconBlackFlag size={16} />
              <span>Wolf Terminal · Statistical Reference</span>
            </div>
            <p className="disclaimer">
              <IconShield size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              Educational &amp; statistical analysis only. Not financial advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
