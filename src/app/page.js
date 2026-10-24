'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTodayBias } from '@/lib/biasEngine';
import { calculateWolfKeyLevels } from '@/lib/wolfLevelsEngine';
import { buildWeeklyProfiles, findSimilarWeeks } from '@/lib/weekPatternEngine';
import WolfKeyLevels from '@/components/WolfKeyLevels';
import AltsTapeReader from '@/components/AltsTapeReader';
import MacroWhalesEtf from '@/components/MacroWhalesEtf';
import WeeklyForecast from '@/components/WeeklyForecast';
import TwinPatternScanner from '@/components/TwinPatternScanner';
import SessionProfiler from '@/components/SessionProfiler';
import BootIntroSequence from '@/components/BootIntroSequence';
import {
  IconBitcoin,
  IconTrendUp,
  IconTrendDown,
  IconScale,
  IconRadar,
  IconBarChart,
  IconRefresh,
  IconZap,
  IconPin,
  IconAlertTriangle,
  IconShield,
  IconCheck,
  IconDatabase,
  IconWolf,
  IconBlackFlag,
  IconMenu,
  IconX,
  IconCalendar,
  IconClock,
} from '@/components/Icons';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Format Helpers ─────────────────────────────────────────────────────────

function formatPrice(n) {
  if (!n) return '--';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(n, decimals = 1) {
  if (n === undefined || n === null) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(decimals)}%`;
}

function biasColor(bias) {
  return bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral';
}

// ─── Confidence Ring Component ────────────────────────────────────────────────

function ConfidenceRing({ confidence, bias }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const [dashOffset, setDashOffset] = useState(circ);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDashOffset(circ - (confidence / 100) * circ);
    }, 300);
    return () => clearTimeout(timer);
  }, [confidence, circ]);

  const color = biasColor(bias);

  return (
    <div className="confidence-ring">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle className="confidence-ring-track" cx="70" cy="70" r={radius} />
        <circle
          className={`confidence-ring-fill ring-${color}`}
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="confidence-value">
        <span className={`confidence-pct ${bias === 'bullish' ? 'value-bullish' : bias === 'bearish' ? 'value-bearish' : 'value-neutral'}`}>
          {confidence}%
        </span>
        <span className="confidence-label">Confidence</span>
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
  const [activeTab, setActiveTab] = useState('levels'); // 'levels' | 'alts' | 'macro' | 'pattern'
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clientDate, setClientDate] = useState(null);
  const [bootDone, setBootDone] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    setError(null);
    setLoadStep(1);

    try {
      setLoadStep(1); // Fetching data
      const res = await fetch('/api/btc-data');
      if (!res.ok) throw new Error('Failed to fetch BTC price history. Please try again.');
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setLoadStep(2); // Analyzing latest live candle
      let currentPrice = json.candles[json.candles.length - 1]?.close ?? 0;
      try {
        const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        if (binanceRes.ok) {
          const binanceData = await binanceRes.json();
          if (binanceData?.price) {
            currentPrice = parseFloat(binanceData.price);
          }
        }
      } catch {
        // Fallback to candle close
      }

      setLoadStep(3); // Calculating statistical bias & weekly profiles
      const now = new Date();
      setClientDate(now);
      const biasResult = getTodayBias(json.candles, currentPrice, now);

      setLoadStep(4); // Week pattern matching and predictive sequence forecasts
      const weeklyProfiles = buildWeeklyProfiles(json.candles);
      const patternResult = findSimilarWeeks(weeklyProfiles, 25, now);

      // Calculating Wolf Key Levels
      const wolfLevelsResult = calculateWolfKeyLevels(json.candles, currentPrice);

      setData({ candles: json.candles, count: json.count, currentPrice });
      setBias(biasResult);
      setWolfLevels(wolfLevelsResult);
      setWeekPattern(patternResult);
      setLastUpdated(now);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 500);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
  };

  // Safe date derivation for rendering
  const todayDow = bias?.dow ?? (clientDate ? clientDate.getUTCDay() : 5);
  const todayMonth = bias?.month ?? (clientDate ? clientDate.getUTCMonth() : 9);
  const formattedToday = clientDate
    ? clientDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : (bias?.date ? `Date: ${bias.date}` : '');

  // ── Render: Hyper-Animated Boot Intro Animation on Initial Load ──
  if (!bootDone) {
    return <BootIntroSequence onComplete={() => setBootDone(true)} />;
  }

  // ── Render: Loading (if user bypassed intro before data sync) ─────────────
  if (loading && !data) {
    const steps = [
      { label: 'Connecting to market data feed...', Icon: IconDatabase },
      { label: 'Ingesting daily BTC candles (2021 → today)...', Icon: IconBitcoin },
      { label: 'Computing day-of-week & seasonal distributions...', Icon: IconBarChart },
      { label: 'Deriving historical sequence & weekly forecasts...', Icon: IconRadar },
      { label: 'Calculating Wolf Key Levels auction price ladder...', Icon: IconWolf },
    ];
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo">
                <div className="logo-icon">
                  <IconBlackFlag size={20} />
                </div>
                <div className="logo-text">
                  <h1>Wolf Tape Reader</h1>
                  <span>Trading The Tape, With Precision &middot; Key Levels, Alts &amp; Forecasts</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="main" style={{ flex: 1 }}>
          <div className="container">
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text" style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                CALIBRATING WOLF TAPE TELEMETRY...
              </div>
              <div className="loading-steps">
                {steps.map((s, i) => (
                  <div key={i} className={`loading-step ${i < loadStep ? 'done' : i === loadStep ? 'active' : ''}`}>
                    <span className="step-indicator">
                      {i < loadStep ? <IconCheck size={13} color="var(--bullish)" /> : i === loadStep ? <IconRefresh size={13} className="spin-icon" color="var(--accent)" /> : <span className="step-circle" />}
                    </span>
                    <span className="step-label">
                      <s.Icon size={14} className="step-icon" />
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo">
                <div className="logo-icon">
                  <IconBlackFlag size={20} />
                </div>
                <div className="logo-text">
                  <h1>Wolf Tape Reader</h1>
                  <span>Trading The Tape, With Precision</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="main" style={{ flex: 1 }}>
          <div className="container">
            <div className="error-screen">
              <div className="error-icon-box">
                <IconAlertTriangle size={36} color="var(--bearish)" />
              </div>
              <h2>Market Data Sync Error</h2>
              <p>{error}</p>
              <button id="retry-btn" className="retry-btn" onClick={() => loadData()}>
                <IconRefresh size={14} />
                <span>Retry Sync</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!bias || !data) return null;

  const bColor = biasColor(bias.bias);
  const dowStatsArr = Object.values(bias.allDowStats);

  // Quick stats
  const totalCandles = data.count;
  const totalBullish = data.candles.filter(c => c.close > c.open).length;
  const overallBullRate = ((totalBullish / totalCandles) * 100).toFixed(1);
  const best = bias.allDowStats[dowStatsArr.reduce((a, b) => a.bullishRate > b.bullishRate ? a : b, dowStatsArr[0]).day];
  const worst = bias.allDowStats[dowStatsArr.reduce((a, b) => a.bullishRate < b.bullishRate ? a : b, dowStatsArr[0]).day];

  // Today's description
  const todayDowStats = bias.dowStats;
  const biasSummary = bias.bias === 'bullish'
    ? `${bias.dayName}s have been bullish ${todayDowStats.bullishRate.toFixed(0)}% of the time historically. Current week is trading ${bias.weeklyBias.priceVsWeeklyOpen} the weekly open by ${Math.abs(bias.weeklyBias.pctFromWeeklyOpen).toFixed(2)}%.`
    : bias.bias === 'bearish'
    ? `${bias.dayName}s have been bearish ${todayDowStats.bearishRate.toFixed(0)}% of the time historically. Current week is trading ${bias.weeklyBias.priceVsWeeklyOpen} the weekly open by ${Math.abs(bias.weeklyBias.pctFromWeeklyOpen).toFixed(2)}%.`
    : `${bias.dayName}s show no strong directional edge historically. Mixed signals from day-of-week and weekly open analysis.`;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>
      {/* ── Mobile Navigation Drawer ── */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="logo-icon">
                  <IconBlackFlag size={20} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.95rem', fontFamily: 'var(--font-display)' }}>
                    WOLF TAPE READER
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#888888' }}>Trading The Tape</span>
                </div>
              </div>
              <button className="mobile-drawer-close" onClick={() => setMobileMenuOpen(false)}>
                <IconX size={18} />
              </button>
            </div>

            <div className="mobile-drawer-spot">
              <span className="spot-label">BTC SPOT</span>
              <span className="spot-val">{formatPrice(data.currentPrice)}</span>
            </div>

            <nav className="mobile-nav-list">
              <button
                className={`mobile-nav-item ${activeTab === 'levels' ? 'active' : ''}`}
                onClick={() => { setActiveTab('levels'); setMobileMenuOpen(false); }}
              >
                <IconWolf size={18} color={activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : '#888888'} />
                <span>Wolf Key Levels</span>
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'alts' ? 'active' : ''}`}
                onClick={() => { setActiveTab('alts'); setMobileMenuOpen(false); }}
              >
                <IconRadar size={18} color={activeTab === 'alts' ? '#38bdf8' : '#888888'} />
                <span>Alts Value Area (VAL/VAH)</span>
                <span className="alts-count-chip">55</span>
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'twin' ? 'active' : ''}`}
                onClick={() => { setActiveTab('twin'); setMobileMenuOpen(false); }}
              >
                <IconZap size={18} color={activeTab === 'twin' ? '#38bdf8' : '#888888'} />
                <span>Twin Pattern Scanner</span>
                <span style={{ marginLeft: 'auto', background: '#38bdf8', color: '#000000', fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>AI</span>
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'macro' ? 'active' : ''}`}
                onClick={() => { setActiveTab('macro'); setMobileMenuOpen(false); }}
              >
                <IconBarChart size={18} color={activeTab === 'macro' ? '#38bdf8' : '#888888'} />
                <span>Whales • MVRV • ETFs</span>
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'pattern' ? 'active' : ''}`}
                onClick={() => { setActiveTab('pattern'); setMobileMenuOpen(false); }}
              >
                <IconCalendar size={18} color={activeTab === 'pattern' ? '#38bdf8' : '#888888'} />
                <span>Weekly Forecast</span>
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'session' ? 'active' : ''}`}
                onClick={() => { setActiveTab('session'); setMobileMenuOpen(false); }}
              >
                <IconClock size={18} color={activeTab === 'session' ? '#38bdf8' : '#888888'} />
                <span>Session HOD/LOD (Asia/Lon/NY)</span>
                <span style={{ marginLeft: 'auto', background: '#38bdf8', color: '#000000', fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>PROB</span>
              </button>
            </nav>

            <div className="mobile-drawer-actions">
              <button className="mobile-drawer-refresh" onClick={() => { handleRefresh(); setMobileMenuOpen(false); }}>
                <IconRefresh size={14} className={refreshing ? 'spin-icon' : ''} />
                <span>Refresh Live Telemetry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-icon">
                <IconBlackFlag size={20} />
              </div>
              <div className="logo-text">
                <h1>Wolf Tape Reader</h1>
                <span>Trading The Tape, With Precision &middot; Key Levels, Alts &amp; Forecasts</span>
              </div>
            </div>
            <div className="header-right">
              {/* Audio Spectrum Equalizer */}
              <div className="audio-pulse-bars" title="Real-time orderflow telemetry">
                <span className="audio-bar" />
                <span className="audio-bar" />
                <span className="audio-bar" />
                <span className="audio-bar" />
                <span className="audio-bar" />
              </div>

              {/* BTC Price Header */}
              <div className="btc-price-header">{formatPrice(data.currentPrice)}</div>

              {/* Interactive Live Feed Button */}
              <button
                className="live-badge-btn"
                onClick={handleRefresh}
                title="Click to refresh live feed"
              >
                <span className="live-dot" />
                <span>Live Feed</span>
                <IconRefresh size={12} className={refreshing ? 'spin-icon' : ''} style={{ opacity: refreshing ? 1 : 0.6 }} />
              </button>

              {/* Mobile Hamburger Button */}
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Toggle menu"
                title="Open menu"
              >
                <IconMenu size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main" style={{ flex: 1 }}>
        <div className="container">

          {/* Data freshness bar */}
          <div className="data-info-bar">
            <div className="data-info-left">
              <IconDatabase size={15} color="var(--accent)" />
              <span>
                Analyzing <span className="data-count">{totalCandles.toLocaleString()}</span> daily candles from{' '}
                <span className="data-count">Jan 2021</span> to today
              </span>
            </div>
            <div className="data-info-right">
              <span>
                Synced: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
              </span>
              <button className="refresh-link-btn" onClick={handleRefresh} title="Refresh live data">
                <IconRefresh size={13} className={refreshing ? 'spin-icon' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* ── TODAY'S BIAS HERO ── */}
          <div id="todays-bias" className={`bias-hero hero-${bColor}`}>
            <div className="hero-glow-bg" />
            <div className="hero-content">
              <div className="hero-left">
                <div className="hero-date">{formattedToday}</div>
                <div className={`hero-title bias-${bColor}-text`}>
                  {bias.bias === 'bullish' ? (
                    <IconTrendUp size={28} className="hero-bias-icon" />
                  ) : bias.bias === 'bearish' ? (
                    <IconTrendDown size={28} className="hero-bias-icon" />
                  ) : (
                    <IconScale size={28} className="hero-bias-icon" />
                  )}
                  <span>{bias.bias.charAt(0).toUpperCase() + bias.bias.slice(1)} Bias</span>
                </div>
                <p className="hero-subtitle">{biasSummary}</p>
                <div className="hero-signals">
                  <div className="signal-pill">
                    <span className={`pill-dot ${biasColor(todayDowStats.bias)}`} />
                    <span className="pill-label">Day-of-Week</span>
                    <span className={`pill-value value-${biasColor(todayDowStats.bias)}`}>
                      {todayDowStats.bullishRate.toFixed(0)}% Bull
                    </span>
                  </div>
                  <div className="signal-pill">
                    <span className={`pill-dot ${bias.weeklyBias.priceVsWeeklyOpen === 'above' ? 'bullish' : 'bearish'}`} />
                    <span className="pill-label">Weekly Open</span>
                    <span className={`pill-value ${bias.weeklyBias.priceVsWeeklyOpen === 'above' ? 'value-bullish' : 'value-bearish'}`}>
                      {bias.weeklyBias.priceVsWeeklyOpen === 'above' ? '+' : '-'}
                      {Math.abs(bias.weeklyBias.pctFromWeeklyOpen).toFixed(2)}%
                    </span>
                  </div>
                  <div className="signal-pill">
                    <span className={`pill-dot ${biasColor(bias.monthlyStats.bias)}`} />
                    <span className="pill-label">{MONTHS[todayMonth]} Seasonal</span>
                    <span className={`pill-value value-${biasColor(bias.monthlyStats.bias)}`}>
                      {bias.monthlyStats.bullishRate.toFixed(0)}% Bull
                    </span>
                  </div>
                  <div className="signal-pill">
                    <span className={`pill-dot ${bias.recentBullRate > 50 ? 'bullish' : 'bearish'}`} />
                    <span className="pill-label">Recent {DAY_SHORT[todayDow]}s</span>
                    <span className={`pill-value ${bias.recentBullRate > 50 ? 'value-bullish' : 'value-bearish'}`}>
                      {bias.recentBullRate}% last 8
                    </span>
                  </div>
                </div>
              </div>

              {/* Confidence Ring */}
              <div className="confidence-meter">
                <ConfidenceRing confidence={bias.confidence} bias={bias.bias} />
                <div className="meter-description">
                  Model confidence<br />from 3 composite signals
                </div>
              </div>
            </div>
          </div>

          {/* ── QUICK STATS ── */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">
                <IconTrendUp size={14} color="var(--bullish)" />
                <span>Best Day</span>
              </div>
              <div className="stat-card-value value-bullish">{best?.dayName.slice(0, 3)}</div>
              <div className="stat-card-sub">{best?.bullishRate.toFixed(1)}% win rate &middot; avg {formatPct(best?.avgReturn)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">
                <IconTrendDown size={14} color="var(--bearish)" />
                <span>Weakest Day</span>
              </div>
              <div className="stat-card-value value-bearish">{worst?.dayName.slice(0, 3)}</div>
              <div className="stat-card-sub">{worst?.bullishRate.toFixed(1)}% win rate &middot; avg {formatPct(worst?.avgReturn)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">
                <IconBitcoin size={14} color="var(--gold)" />
                <span>Overall Bull Rate</span>
              </div>
              <div className="stat-card-value value-gold">{overallBullRate}%</div>
              <div className="stat-card-sub">{totalBullish} bull / {totalCandles} total days</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">
                <IconPin size={14} color="var(--accent)" />
                <span>Weekly Open</span>
              </div>
              <div className={`stat-card-value ${bias.weeklyBias.priceVsWeeklyOpen === 'above' ? 'value-bullish' : 'value-bearish'}`}>
                {formatPrice(bias.weeklyBias.weeklyOpen)}
              </div>
              <div className="stat-card-sub">
                Spot: {formatPrice(data.currentPrice)} &middot;{' '}
                <span style={{ color: bias.weeklyBias.pctFromWeeklyOpen > 0 ? 'var(--bullish)' : 'var(--bearish)' }}>
                  {formatPct(bias.weeklyBias.pctFromWeeklyOpen)}
                </span>
              </div>
            </div>
          </div>

          {/* ── 4 PRIMARY INSTITUTIONAL TABS (Restored Weekly Forecast) ── */}
          <div className="tab-bar">
            <button id="tab-levels" className={`tab-btn ${activeTab === 'levels' ? 'active' : ''}`} onClick={() => setActiveTab('levels')}>
              <IconWolf size={15} color={activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : 'var(--wolf-yellow)'} />
              <span style={{ color: activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : undefined }}>Wolf Key Levels</span>
            </button>
            <button id="tab-alts" className={`tab-btn ${activeTab === 'alts' ? 'active' : ''}`} onClick={() => setActiveTab('alts')}>
              <IconRadar size={15} color={activeTab === 'alts' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'alts' ? '#38bdf8' : undefined }}>Alts Value Area (VAL/VAH)</span>
              <span style={{ background: '#2dd4bf', color: '#000000', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 800, marginLeft: '0.35rem' }}>55</span>
            </button>
            <button id="tab-twin" className={`tab-btn ${activeTab === 'twin' ? 'active' : ''}`} onClick={() => setActiveTab('twin')}>
              <IconZap size={15} color={activeTab === 'twin' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'twin' ? '#38bdf8' : undefined }}>Twin Pattern Scanner</span>
              <span style={{ background: '#38bdf8', color: '#000000', fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 800, marginLeft: '0.35rem' }}>AI</span>
            </button>
            <button id="tab-macro" className={`tab-btn ${activeTab === 'macro' ? 'active' : ''}`} onClick={() => setActiveTab('macro')}>
              <IconBarChart size={15} color={activeTab === 'macro' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'macro' ? '#38bdf8' : undefined }}>Whales • MVRV • ETFs</span>
            </button>
            <button id="tab-pattern" className={`tab-btn ${activeTab === 'pattern' ? 'active' : ''}`} onClick={() => setActiveTab('pattern')}>
              <IconCalendar size={15} color={activeTab === 'pattern' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'pattern' ? '#38bdf8' : undefined }}>Weekly Forecast</span>
            </button>
            <button id="tab-session" className={`tab-btn ${activeTab === 'session' ? 'active' : ''}`} onClick={() => setActiveTab('session')}>
              <IconClock size={15} color={activeTab === 'session' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'session' ? '#38bdf8' : undefined }}>Session HOD/LOD</span>
              <span style={{ background: '#38bdf8', color: '#000000', fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 800, marginLeft: '0.35rem' }}>PROB</span>
            </button>
          </div>

          {/* ── 1. WOLF KEY LEVELS VIEW ── */}
          {activeTab === 'levels' && (
            <WolfKeyLevels levelsData={wolfLevels} />
          )}

          {/* ── 2. ALTS VALUE AREA TAPE READER VIEW ── */}
          {activeTab === 'alts' && (
            <AltsTapeReader />
          )}

          {/* ── 2B. TWIN PATTERN SCANNER VIEW (Direct Main Tab) ── */}
          {activeTab === 'twin' && (
            <TwinPatternScanner />
          )}

          {/* ── 3. MACRO WHALES & ETF VIEW ── */}
          {activeTab === 'macro' && (
            <MacroWhalesEtf />
          )}

          {/* ── 4. WEEKLY FORECAST VIEW (Restored & Mobile Optimized) ── */}
          {activeTab === 'pattern' && (
            <WeeklyForecast weekPattern={weekPattern} formatPrice={formatPrice} />
          )}

          {/* ── 5. SESSION PROFILER (Asia · London · NY HOD/LOD Probabilities) ── */}
          {activeTab === 'session' && (
            <SessionProfiler />
          )}

        </div>
      </main>

      {/* ── Mobile Sticky Bottom Bar (6 Quick-Switch Tools) ── */}
      <div className="mobile-bottom-bar">
        <button
          className={`mobile-bottom-btn ${activeTab === 'levels' ? 'active' : ''}`}
          onClick={() => setActiveTab('levels')}
        >
          <IconWolf size={18} />
          <span>Levels</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'alts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alts')}
        >
          <IconRadar size={18} />
          <span>Alts</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'twin' ? 'active' : ''}`}
          onClick={() => setActiveTab('twin')}
        >
          <IconZap size={18} />
          <span>Twin Scan</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'macro' ? 'active' : ''}`}
          onClick={() => setActiveTab('macro')}
        >
          <IconBarChart size={18} />
          <span>Whales</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'pattern' ? 'active' : ''}`}
          onClick={() => setActiveTab('pattern')}
        >
          <IconCalendar size={18} />
          <span>Forecast</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'session' ? 'active' : ''}`}
          onClick={() => setActiveTab('session')}
        >
          <IconClock size={18} />
          <span>Sessions</span>
        </button>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-left">
              <IconBlackFlag size={18} />
              <span>Wolf Tape Reader &middot; Trading The Tape, With Precision &middot; Pitch Black Desk</span>
            </div>
            <p className="disclaimer">
              <IconShield size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              Educational &amp; statistical reference only. Past market statistics do not guarantee future performance.
              Not financial advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
