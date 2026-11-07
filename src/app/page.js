'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTodayBias } from '@/lib/biasEngine';
import { calculateWolfKeyLevels } from '@/lib/wolfLevelsEngine';
import { buildWeeklyProfiles, findSimilarWeeks } from '@/lib/weekPatternEngine';
import { calculateWeeklyHighLowProbabilities } from '@/lib/weeklyHighLowEngine';
import WolfKeyLevels from '@/components/WolfKeyLevels';
import MacroWhalesEtf from '@/components/MacroWhalesEtf';
import WeeklyForecast from '@/components/WeeklyForecast';
import SessionProfiler from '@/components/SessionProfiler';
import BootIntroSequence from '@/components/BootIntroSequence';
import RsiScannerWidget from '@/components/RsiScannerWidget';
import MarketStructureTable from '@/components/MarketStructureTable';
import {
  IconBitcoin, IconTrendUp, IconTrendDown, IconScale, IconRadar,
  IconBarChart, IconRefresh, IconZap, IconPin, IconAlertTriangle,
  IconShield, IconCheck, IconDatabase, IconWolf, IconBlackFlag,
  IconMenu, IconX, IconCalendar, IconClock,
} from '@/components/Icons';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPrice(n) {
  if (!n) return '--';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(n, decimals = 1) {
  if (n === undefined || n === null) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(decimals)}%`;
}

// ─── Verdict Hero Component ────────────────────────────────────────────────────

function VerdictHero({ bias, data, clientDate }) {
  if (!bias || !data) return null;

  const verdict = bias.verdict; // 'BULLISH' | 'BEARISH' | 'CAUTION'
  const color = bias.verdictColor;
  const score = bias.score;
  const conviction = bias.convictionLevel; // 1-5

  const formattedDate = clientDate
    ? clientDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : bias.date || '';

  const convictionLabel = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'][conviction] || 'Moderate';

  const verdictBg = verdict === 'BULLISH'
    ? 'rgba(34,197,94,0.07)'
    : verdict === 'BEARISH'
    ? 'rgba(239,68,68,0.07)'
    : 'rgba(245,158,11,0.07)';

  const verdictBorder = verdict === 'BULLISH'
    ? 'rgba(34,197,94,0.35)'
    : verdict === 'BEARISH'
    ? 'rgba(239,68,68,0.35)'
    : 'rgba(245,158,11,0.35)';

  return (
    <div className="verdict-hero-card" style={{
      border: `1px solid ${verdictBorder}`,
      background: verdictBg,
    }}>
      {/* Top bar: date + live price */}
      <div className="verdict-top-bar">
        <div className="verdict-date">
          {formattedDate}
        </div>
        <div className="verdict-price-badge">
          <div className="verdict-spot-price">
            {formatPrice(data.currentPrice)}
          </div>
          <div className="verdict-badge" style={{ color: color, background: `${color}18`, borderColor: `${color}40` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {verdict}
          </div>
        </div>
      </div>

      {/* Main verdict body */}
      <div className="verdict-hero-body">
        <div className="verdict-hero-content">
          {/* Bleed Trap Alert */}
          {bias.isBleedTrap && verdict === 'CAUTION' && (
            <div style={{
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: 8, padding: '8px 14px', marginBottom: 14,
              display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.78rem',
            }}>
              <span style={{ background: '#f59e0b', color: '#000', fontWeight: 900, fontSize: '0.65rem', padding: '2px 7px', borderRadius: 3, flexShrink: 0, fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                ⚠ BLEED TRAP
              </span>
              <span style={{ color: '#fcd34d', lineHeight: 1.5 }}>
                Historical stats say bull, but real-time structure is bleeding. Do not trust the calendar stats right now.
              </span>
            </div>
          )}

          {/* Big verdict word */}
          <div className="verdict-hero-title" style={{ color: color }}>
            {verdict === 'BULLISH' ? '↑ BULLISH' : verdict === 'BEARISH' ? '↓ BEARISH' : '⚡ CAUTION'}
          </div>

          {/* Conviction bar */}
          <div className="verdict-conviction-row">
            <span className="verdict-conviction-label">
              Conviction:
            </span>
            <div className="verdict-conviction-dots">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="conviction-dot" style={{ background: i <= conviction ? color : 'rgba(255,255,255,0.08)' }} />
              ))}
            </div>
            <span className="verdict-conviction-text" style={{ color }}>
              {convictionLabel}
            </span>
          </div>

          {/* Reason */}
          <p className="verdict-hero-reason">
            {bias.verdictReason}
          </p>

          {/* Signal pills */}
          <div className="verdict-signals-wrap">
            {bias.signals && bias.signals.map(sig => {
              const sc = sig.state === 'bullish' ? '#22c55e' : sig.state === 'bearish' ? '#ef4444' : '#6b7280';
              return (
                <div key={sig.id} className="verdict-signal-pill" style={{ borderColor: `${sc}30`, background: `${sc}08` }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                  <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)' }}>{sig.name}:</span>
                  <span style={{ color: sc, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{sig.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Score meter */}
        <div className="verdict-score-meter-wrap">
          <div className="verdict-score-circle" style={{ borderColor: color, boxShadow: `0 0 20px ${color}30`, background: `${color}0d` }}>
            <span style={{ color }}>
              {score > 0 ? '+' : ''}{score}
            </span>
            <span>score</span>
          </div>
          <div className="verdict-score-subtext">
            −100 Bear<br />+100 Bull
          </div>
        </div>
      </div>

      {/* Footer: Prior Week Levels + Sigma */}
      <div className="verdict-footer-bar">
        {/* Prior Week High / Low */}
        {bias.priorWeekLevels && bias.priorWeekLevels.pwh > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: '0.76rem' }}>
            <span style={{ color: '#4b5563', fontFamily: 'var(--font-mono)' }}>Prior Week:</span>
            <span style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              PWH {formatPrice(bias.priorWeekLevels.pwh)}
            </span>
            <span style={{ color: '#374151' }}>·</span>
            <span style={{ color: '#4ade80', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              PWL {formatPrice(bias.priorWeekLevels.pwl)}
            </span>
            {bias.priorWeekLevels.posInRange !== null && (
              <span style={{
                fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                padding: '1px 7px', borderRadius: 3, color: '#6b7280',
              }}>
                {bias.priorWeekLevels.posInRange}% of range
              </span>
            )}
          </div>
        )}
        {/* Sigma Visual Bar */}
        {bias.sigmaMetrics && (() => {
          const sm = bias.sigmaMetrics;
          // Map zScore (-3 to +3) → 0% to 100% position on bar
          const rawPos = ((sm.zScore + 3) / 6) * 100;
          const markerPos = Math.max(1, Math.min(99, rawPos));
          // Color zones: -2σ to -1σ = green (mean reversion long), mean zone = neutral, +1σ to +2σ = caution, beyond ±2σ = extreme
          const markerColor = sm.zScore <= -2.2 ? '#4ade80'
            : sm.zScore <= -1.2 ? '#38bdf8'
            : sm.zScore >= 2.2 ? '#f87171'
            : sm.zScore >= 1.2 ? '#fb923c'
            : '#94a3b8';
          const statusColor = sm.color || markerColor;
          return (
            <div className="sigma-bar-wrap">
              {/* Header row */}
              <div className="sigma-bar-header">
                <span className="sigma-bar-label">σ Gaussian Band</span>
                <span className="sigma-bar-zscore" style={{ color: statusColor }}>
                  {sm.zScoreText}
                </span>
                <span className="sigma-bar-status" style={{ color: statusColor }}>
                  {sm.statusShort}
                </span>
              </div>

              {/* The visual bar */}
              <div className="sigma-bar-track">
                {/* Zone fills */}
                <div className="sigma-zone sigma-zone-extreme-os" />   {/* below -2σ: strong green */}
                <div className="sigma-zone sigma-zone-os" />            {/* -2σ to -1σ: soft green */}
                <div className="sigma-zone sigma-zone-fair" />          {/* -1σ to +1σ: neutral */}
                <div className="sigma-zone sigma-zone-ob" />            {/* +1σ to +2σ: amber */}
                <div className="sigma-zone sigma-zone-extreme-ob" />   {/* above +2σ: red */}

                {/* Tick labels on bar */}
                <div className="sigma-tick" style={{ left: '0%' }}><span>-3σ</span></div>
                <div className="sigma-tick" style={{ left: '16.66%' }}><span>-2σ</span></div>
                <div className="sigma-tick" style={{ left: '33.33%' }}><span>-1σ</span></div>
                <div className="sigma-tick" style={{ left: '50%' }}><span>μ</span></div>
                <div className="sigma-tick" style={{ left: '66.66%' }}><span>+1σ</span></div>
                <div className="sigma-tick" style={{ left: '83.33%' }}><span>+2σ</span></div>
                <div className="sigma-tick" style={{ left: '100%' }}><span>+3σ</span></div>

                {/* Price marker */}
                <div className="sigma-marker" style={{ left: `${markerPos}%`, background: markerColor, boxShadow: `0 0 8px ${markerColor}` }} />
              </div>

              {/* Price anchors row */}
              <div className="sigma-prices-row">
                <span style={{ color: '#4ade80', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  -2σ {formatPrice(sm.minus2Sigma)}
                </span>
                <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  -1σ {formatPrice(sm.minus1Sigma)}
                </span>
                <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  μ {formatPrice(sm.mean)}
                </span>
                <span style={{ color: '#fb923c', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  +1σ {formatPrice(sm.plus1Sigma)}
                </span>
                <span style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  +2σ {formatPrice(sm.plus2Sigma)}
                </span>
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
    <div style={{ marginBottom: 24, background: '#0c0c0f', border: '1px solid #1e1e24', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e24', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconRadar size={14} color="#38bdf8" />
        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>
          Confluence Breakdown · Score: {bias.score > 0 ? '+' : ''}{bias.score}/100
        </span>
      </div>
      <div style={{ padding: '0 4px' }}>
        {bias.signals.map((sig, i) => {
          const sc = sig.state === 'bullish' ? '#22c55e' : sig.state === 'bearish' ? '#ef4444' : '#6b7280';
          const barWidth = `${Math.round((Math.abs(sig.score) / sig.weight) * 100)}%`;
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
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.68rem', color: sc, fontFamily: 'var(--font-mono)' }}>{sig.label}</div>
              </div>
              <div className="signals-breakdown-score-col">
                <span style={{
                  fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  color: sc,
                  background: `${sc}15`, border: `1px solid ${sc}30`,
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
  const [bias, setBias] = useState(null);
  const [wolfLevels, setWolfLevels] = useState(null);
  const [weekPattern, setWeekPattern] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [loadStep, setLoadStep] = useState(1);
  const [activeTab, setActiveTab] = useState('levels');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clientDate, setClientDate] = useState(null);
  const [bootDone, setBootDone] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [weeklyProbBias, setWeeklyProbBias] = useState('auto');
  const [weeklyHighLowData, setWeeklyHighLowData] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [showSignals, setShowSignals] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wolf-theme') || 'dark';
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
      document.documentElement.classList.toggle('theme-light', saved === 'light');
      document.documentElement.classList.toggle('theme-dark', saved !== 'light');
    } catch (e) {}
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('wolf-theme', next);
      document.documentElement.setAttribute('data-theme', next);
      document.documentElement.classList.toggle('theme-light', next === 'light');
      document.documentElement.classList.toggle('theme-dark', next !== 'light');
    } catch (e) {}
  };

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
    setLoadStep(1);

    try {
      const res = await fetch('/api/btc-data');
      if (!res.ok) throw new Error('Failed to fetch BTC price history. Please try again.');
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setLoadStep(2);
      const currentPrice = json.currentPrice || json.candles[json.candles.length - 1]?.close || 0;

      setLoadStep(3);
      const now = new Date();
      setClientDate(now);

      // Single call to getTodayBias — no filter presets, deterministic
      const biasResult = getTodayBias(json.candles, currentPrice, now);

      setLoadStep(4);
      const weeklyProfiles = buildWeeklyProfiles(json.candles);
      const patternResult = findSimilarWeeks(weeklyProfiles, 25, now);
      const wolfLevelsResult = calculateWolfKeyLevels(json.candles, currentPrice);
      const hlProb = calculateWeeklyHighLowProbabilities(json.candles, currentPrice, now, weeklyProbBias);

      setData({ candles: json.candles, count: json.count, currentPrice });
      setBias(biasResult);
      setWolfLevels(wolfLevelsResult);
      setWeekPattern(patternResult);
      setWeeklyHighLowData(hlProb);
      setLastUpdated(now);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 500);
    }
  }, [weeklyProbBias]);

  const handleWeeklyProbBiasChange = (newBias) => {
    setWeeklyProbBias(newBias);
    if (data?.candles) {
      const updated = calculateWeeklyHighLowProbabilities(data.candles, data.currentPrice, clientDate || new Date(), newBias);
      setWeeklyHighLowData(updated);
    }
  };

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
          setWolfLevels(prev => prev ? { ...prev, spot: pData.price } : prev);
        }
      } catch (e) {}
    };
    const interval = setInterval(pollLivePrice, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const handleRefresh = () => loadData(true);

  // Boot intro
  if (!bootDone) return <BootIntroSequence onComplete={() => setBootDone(true)} />;

  // Loading
  if (loading && !data) {
    const steps = [
      { label: 'Connecting to market data feed...', Icon: IconDatabase },
      { label: 'Ingesting daily BTC candles (2021 → today)...', Icon: IconBitcoin },
      { label: 'Computing statistical bias & seasonal distributions...', Icon: IconBarChart },
      { label: 'Deriving historical sequence & weekly forecasts...', Icon: IconRadar },
      { label: 'Calculating Wolf Key Levels auction price ladder...', Icon: IconWolf },
    ];
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo"><div className="logo-icon"><IconBlackFlag size={20} /></div><div className="logo-text"><h1>Wolf Tape Reader</h1></div></div>
            </div>
          </div>
        </header>
        <main className="main" style={{ flex: 1 }}>
          <div className="container">
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text" style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>CALIBRATING WOLF TAPE TELEMETRY...</div>
              <div className="loading-steps">
                {steps.map((s, i) => (
                  <div key={i} className={`loading-step ${i < loadStep ? 'done' : i === loadStep ? 'active' : ''}`}>
                    <span className="step-indicator">
                      {i < loadStep ? <IconCheck size={13} color="var(--bullish)" /> : i === loadStep ? <IconRefresh size={13} className="spin-icon" color="var(--accent)" /> : <span className="step-circle" />}
                    </span>
                    <span className="step-label"><s.Icon size={14} className="step-icon" />{s.label}</span>
                  </div>
                ))}
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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
        <header className="header"><div className="container"><div className="header-inner"><div className="logo"><div className="logo-icon"><IconBlackFlag size={20} /></div><div className="logo-text"><h1>Wolf Tape Reader</h1></div></div></div></div></header>
        <main className="main" style={{ flex: 1 }}><div className="container"><div className="error-screen">
          <div className="error-icon-box"><IconAlertTriangle size={36} color="var(--bearish)" /></div>
          <h2>Market Data Sync Error</h2><p>{error}</p>
          <button id="retry-btn" className="retry-btn" onClick={() => loadData()}><IconRefresh size={14} /><span>Retry Sync</span></button>
        </div></div></main>
      </div>
    );
  }

  if (!bias || !data) return null;

  const dowStatsArr = Object.values(bias.allDowStats);
  const totalCandles = data.count;
  const totalBullish = data.candles.filter(c => c.close > c.open).length;
  const overallBullRate = ((totalBullish / totalCandles) * 100).toFixed(1);
  const best = dowStatsArr.reduce((a, b) => a.bullishRate > b.bullishRate ? a : b, dowStatsArr[0]);
  const worst = dowStatsArr.reduce((a, b) => a.bullishRate < b.bullishRate ? a : b, dowStatsArr[0]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo" onClick={() => navigateToSection('bias')} style={{ cursor: 'pointer' }}>
              <div className="logo-icon"><IconBlackFlag size={20} /></div>
              <div className="logo-text"><h1>Wolf Tape Reader</h1></div>
            </div>

            <nav className="header-nav">
              {[
                { id: 'bias', label: "Today's Bias" },
                { id: 'levels', label: 'Key Levels', Icon: IconWolf, iconColor: 'var(--wolf-yellow-bright)' },
                { id: 'session', label: 'Sessions', Icon: IconClock },
                { id: 'pattern', label: 'Weekly Forecast', Icon: IconCalendar },
                { id: 'rsi', label: 'RSI Alerts', Icon: IconZap },
                { id: 'structure', label: 'Structure', Icon: IconScale },
                { id: 'macro', label: 'Whales', Icon: IconBarChart },
              ].map(({ id, label, Icon, iconColor }) => (
                <button key={id} className={`header-nav-link ${activeTab === id ? 'active' : ''}`} onClick={() => navigateToSection(id)}>
                  {Icon && <Icon size={13} color={activeTab === id ? (iconColor || 'var(--accent)') : 'var(--neutral)'} />}
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="header-right">
              <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
                <span style={{ fontSize: '0.85rem' }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
              <div className="btc-price-header">{formatPrice(data.currentPrice)}</div>
              <button className="live-badge-btn" onClick={handleRefresh} title="Click to refresh live feed">
                <span className="live-dot" />
                <span>Live Feed</span>
                <IconRefresh size={12} className={refreshing ? 'spin-icon' : ''} style={{ opacity: refreshing ? 1 : 0.6 }} />
              </button>
              <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><IconMenu size={20} /></button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="theme-toggle-btn" onClick={toggleTheme} style={{ padding: '4px 10px', fontSize: '0.70rem' }}>
                  <span>{theme === 'dark' ? '☀️' : '🌙'}</span><span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
                <button className="mobile-nav-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><IconX size={20} /></button>
              </div>
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
                { id: 'bias', Icon: IconScale, title: "Today's Macro Bias", desc: 'Single Verdict · Signals Breakdown' },
                { id: 'levels', Icon: IconWolf, title: 'Wolf Key Levels', desc: 'Auction Price Ladder, VAL/VAH & Anchors' },
                { id: 'session', Icon: IconClock, title: 'Session HOD/LOD', desc: 'Asia, London & NY Probabilities' },
                { id: 'pattern', Icon: IconCalendar, title: 'Weekly Forecast & HOW/LOW', desc: 'High/Low Formation Probability & Cycle Match' },
                { id: 'rsi', Icon: IconZap, title: 'RSI Alerts (Discord)', desc: '55 Alts · Overbought / Oversold Telemetry' },
                { id: 'structure', Icon: IconScale, title: 'Market Structure Matrix', desc: '1H, 4H, 1D, 1W · 2-Candle HTF Bias' },
                { id: 'macro', Icon: IconBarChart, title: 'Whales · MVRV · ETFs', desc: 'Institutional On-Chain Flows' },
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

          {/* Data freshness bar */}
          <div className="data-info-bar">
            <div className="data-info-left">
              <IconDatabase size={15} color="var(--accent)" />
              <span>Analyzing <span className="data-count">{totalCandles.toLocaleString()}</span> daily candles from <span className="data-count">Jan 2021</span> to today</span>
            </div>
            <div className="data-info-right">
              <span>Synced: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}</span>
              <button className="refresh-link-btn" onClick={handleRefresh} title="Refresh live data">
                <IconRefresh size={13} className={refreshing ? 'spin-icon' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* ── VERDICT HERO ── */}
          <div id="todays-bias">
            <VerdictHero bias={bias} data={data} clientDate={clientDate} />

            {/* Signals breakdown toggle */}
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={() => setShowSignals(!showSignals)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '7px 14px', fontSize: '0.74rem',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', transition: 'all 0.15s ease',
                }}
              >
                <IconRadar size={13} color="var(--accent)" />
                <span>Confluence Breakdown</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{showSignals ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {showSignals && <div style={{ marginTop: 12 }}><SignalsBreakdown bias={bias} /></div>}
            </div>
          </div>

          {/* ── QUICK STATS ── */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label"><IconTrendUp size={14} color="var(--bullish)" /><span>Best Day</span></div>
              <div className="stat-card-value value-bullish">{best?.dayName?.slice(0, 3)}</div>
              <div className="stat-card-sub">{best?.bullishRate.toFixed(1)}% win rate · avg {formatPct(best?.avgReturn)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label"><IconTrendDown size={14} color="var(--bearish)" /><span>Weakest Day</span></div>
              <div className="stat-card-value value-bearish">{worst?.dayName?.slice(0, 3)}</div>
              <div className="stat-card-sub">{worst?.bullishRate.toFixed(1)}% win rate · avg {formatPct(worst?.avgReturn)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label"><IconBitcoin size={14} color="var(--gold)" /><span>Overall Bull Rate</span></div>
              <div className="stat-card-value value-gold">{overallBullRate}%</div>
              <div className="stat-card-sub">{totalBullish} bull / {totalCandles} total days</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label"><IconPin size={14} color="var(--accent)" /><span>Weekly Open</span></div>
              <div className={`stat-card-value ${bias.aboveWeeklyOpen ? 'value-bullish' : 'value-bearish'}`}>{formatPrice(bias.weeklyOpen)}</div>
              <div className="stat-card-sub">
                Spot: {formatPrice(data.currentPrice)} ·{' '}
                <span style={{ color: bias.pctFromWeeklyOpen > 0 ? 'var(--bullish)' : 'var(--bearish)' }}>
                  {formatPct(bias.pctFromWeeklyOpen)}
                </span>
              </div>
            </div>
          </div>

          {/* ── DOW GRID ── */}
          <div className="dow-section">
            <div className="section-header">
              <div className="section-title"><IconCalendar size={16} color="var(--accent)" /> Day-of-Week Historical Rates</div>
              <div className="section-subtitle">5-year base rate by day — context only, not the final verdict</div>
            </div>
            <div className="dow-grid">
              {dowStatsArr.map(d => {
                const isToday = d.day === bias.dow;
                const bColor = d.bias === 'bullish' ? 'var(--bullish)' : d.bias === 'bearish' ? 'var(--bearish)' : 'var(--neutral)';
                return (
                  <div key={d.day} className={`dow-card${isToday ? ' today' : ''}`}>
                    <div className="dow-card-day">{DAY_SHORT[d.day]}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: bColor, fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                      {d.bullishRate.toFixed(0)}%
                    </div>
                    <div className={`dow-bias-badge ${d.bias}`}>{d.bias}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 6 }}>
                      avg {d.avgReturn > 0 ? '+' : ''}{d.avgReturn.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {d.bullish}G / {d.bearish}R
                    </div>
                  </div>
                );
              })}
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
              <span style={{ color: activeTab === 'pattern' ? '#38bdf8' : undefined }}>Weekly HOW/LOW &amp; Forecast</span>
            </button>
            <button id="tab-macro" className={`tab-btn ${activeTab === 'macro' ? 'active' : ''}`} onClick={() => navigateToSection('macro')}>
              <IconBarChart size={15} color={activeTab === 'macro' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'macro' ? '#38bdf8' : undefined }}>Whales · MVRV · ETFs</span>
            </button>
            <button id="tab-rsi" className={`tab-btn ${activeTab === 'rsi' ? 'active' : ''}`} onClick={() => navigateToSection('rsi')}>
              <IconZap size={15} color={activeTab === 'rsi' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'rsi' ? '#38bdf8' : undefined }}>RSI Alerts (Discord)</span>
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
                onWeeklyBiasChange={handleWeeklyProbBiasChange}
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
              <IconBlackFlag size={18} />
              <span>Wolf Tape Reader · Trading The Tape, With Precision · Pitch Black Desk</span>
            </div>
            <p className="disclaimer">
              <IconShield size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              Educational &amp; statistical reference only. Past market statistics do not guarantee future performance. Not financial advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
