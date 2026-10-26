'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTodayBias } from '@/lib/biasEngine';
import { calculateWolfKeyLevels } from '@/lib/wolfLevelsEngine';
import { buildWeeklyProfiles, findSimilarWeeks } from '@/lib/weekPatternEngine';
import WolfKeyLevels from '@/components/WolfKeyLevels';
import MacroWhalesEtf from '@/components/MacroWhalesEtf';
import WeeklyForecast from '@/components/WeeklyForecast';
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

  // ── High-Probability Bias Filters State ──
  const [biasFilters, setBiasFilters] = useState({
    preset: 'highest_prob', // 'highest_prob' | 'sigma_regime' | 'bleed_guard' | 'trend_only' | 'recent_cycle' | 'raw_legacy' | 'custom'
    enableSigma: true,
    enableRegime: true,
    enableTrend: true,
    enableBleedGuard: true,
    enableWeeklyOpen: true,
    enableRecentRegime: true,
    enableRawStats: true,
  });
  const [showConfluences, setShowConfluences] = useState(false);

  const applyBiasFilterPreset = (presetKey) => {
    let newFilters = { ...biasFilters, preset: presetKey };
    if (presetKey === 'highest_prob') {
      newFilters = {
        preset: 'highest_prob',
        enableSigma: true,
        enableRegime: true,
        enableTrend: true,
        enableBleedGuard: true,
        enableWeeklyOpen: true,
        enableRecentRegime: true,
        enableRawStats: true,
      };
    } else if (presetKey === 'sigma_regime') {
      newFilters = {
        preset: 'sigma_regime',
        enableSigma: true,
        enableRegime: true,
        enableTrend: false,
        enableBleedGuard: true,
        enableWeeklyOpen: true,
        enableRecentRegime: false,
        enableRawStats: false,
      };
    } else if (presetKey === 'bleed_guard') {
      newFilters = {
        preset: 'bleed_guard',
        enableSigma: false,
        enableRegime: false,
        enableTrend: true,
        enableBleedGuard: true,
        enableWeeklyOpen: true,
        enableRecentRegime: false,
        enableRawStats: false,
      };
    } else if (presetKey === 'trend_only') {
      newFilters = {
        preset: 'trend_only',
        enableSigma: false,
        enableRegime: false,
        enableTrend: true,
        enableBleedGuard: false,
        enableWeeklyOpen: true,
        enableRecentRegime: false,
        enableRawStats: false,
      };
    } else if (presetKey === 'recent_cycle') {
      newFilters = {
        preset: 'recent_cycle',
        enableSigma: false,
        enableRegime: false,
        enableTrend: false,
        enableBleedGuard: true,
        enableWeeklyOpen: false,
        enableRecentRegime: true,
        enableRawStats: false,
      };
    } else if (presetKey === 'raw_legacy') {
      newFilters = {
        preset: 'raw_legacy',
        enableSigma: false,
        enableRegime: false,
        enableTrend: false,
        enableBleedGuard: false,
        enableWeeklyOpen: false,
        enableRecentRegime: false,
        enableRawStats: true,
      };
    }
    setBiasFilters(newFilters);
    if (data?.candles) {
      const updatedBias = getTodayBias(data.candles, data.currentPrice, clientDate, newFilters);
      setBias(updatedBias);
    }
  };

  const toggleSingleBiasFilter = (filterKey) => {
    const newFilters = {
      ...biasFilters,
      preset: 'custom',
      [filterKey]: !biasFilters[filterKey],
    };
    setBiasFilters(newFilters);
    if (data?.candles) {
      const updatedBias = getTodayBias(data.candles, data.currentPrice, clientDate, newFilters);
      setBias(updatedBias);
    }
  };

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
      let currentPrice = json.currentPrice || json.candles[json.candles.length - 1]?.close || 0;

      setLoadStep(3); // Calculating statistical bias & weekly profiles
      const now = new Date();
      setClientDate(now);
      const biasResult = getTodayBias(json.candles, currentPrice, now, biasFilters);

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
  }, [biasFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time live price ticker (every 4 seconds for sub-second precision)
  useEffect(() => {
    let isMounted = true;
    const pollLivePrice = async () => {
      try {
        const res = await fetch('/api/live-price');
        if (!res.ok) return;
        const pData = await res.json();
        if (pData?.success && pData.price > 0 && isMounted) {
          setData((prev) => {
            if (!prev) return prev;
            if (prev.currentPrice === pData.price) return prev;
            return {
              ...prev,
              currentPrice: pData.price,
            };
          });

          setWolfLevels((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              spot: pData.price,
            };
          });
        }
      } catch (err) {
        // Silent ticker error
      }
    };

    const interval = setInterval(pollLivePrice, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
  let biasSummary = '';
  if (bias.isFiltered) {
    const sigmaInfo = bias.sigmaMetrics ? `, Sigma at ${bias.sigmaMetrics.zScoreText} (${bias.sigmaMetrics.statusShort})` : '';
    const regimeInfo = bias.regimeMetrics ? ` in ${bias.regimeMetrics.name}` : '';
    if (bias.bias === 'bearish') {
      biasSummary = `Filtered High-Probability Bias: Bearish (${bias.confidence}% Conviction)${regimeInfo}. Key confluences: ${bias.technicalMetrics ? `Trading ${bias.technicalMetrics.priceVsEma20Pct}% vs 20 EMA ($${bias.technicalMetrics.ema20.toLocaleString()}), 24h delta is ${bias.technicalMetrics.change24h}%, RSI ${bias.technicalMetrics.rsi14}${sigmaInfo}` : 'Structure & weekly open confirm downside pressure'}.`;
    } else if (bias.bias === 'bullish') {
      biasSummary = `Filtered High-Probability Bias: Bullish (${bias.confidence}% Conviction)${regimeInfo}. Key confluences: ${bias.technicalMetrics ? `Holding above 20 EMA ($${bias.technicalMetrics.ema20.toLocaleString()}), weekly open acceptance (+${Math.abs(bias.technicalMetrics.pctFromWeeklyOpen)}%), and positive momentum expansion${sigmaInfo}` : 'Structure & weekly open confirm bullish continuation'}.`;
    } else {
      biasSummary = `Filtered High-Probability Bias: Neutral / Defensive (${bias.confidence}% Confidence)${regimeInfo}. Price is inside fair value (${bias.sigmaMetrics ? bias.sigmaMetrics.zScoreText : '0.00σ'}) with mixed trend structure. Focus on level-to-level rotation.`;
    }
  } else {
    biasSummary = bias.bias === 'bullish'
      ? `${bias.dayName}s have been bullish ${todayDowStats.bullishRate.toFixed(0)}% of the time historically (Raw 5-Year Average). Current week is trading ${bias.weeklyBias.priceVsWeeklyOpen} the weekly open by ${Math.abs(bias.weeklyBias.pctFromWeeklyOpen).toFixed(2)}%.`
      : bias.bias === 'bearish'
      ? `${bias.dayName}s have been bearish ${todayDowStats.bearishRate.toFixed(0)}% of the time historically (Raw 5-Year Average). Current week is trading ${bias.weeklyBias.priceVsWeeklyOpen} the weekly open by ${Math.abs(bias.weeklyBias.pctFromWeeklyOpen).toFixed(2)}%.`
      : `${bias.dayName}s show no strong directional edge historically. Mixed signals from day-of-week and weekly open analysis.`;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#000000' }}>


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
                <span>Trading The Tape, With Precision &middot; Key Levels &amp; Statistical Models</span>
              </div>
            </div>
            <div className="header-right">
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
                aria-label="Toggle navigation menu"
                title="Open menu"
              >
                <IconMenu size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Functional Mobile Navigation Drawer ── */}
      {mobileMenuOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-nav-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconBlackFlag size={18} color="var(--wolf-yellow-bright)" />
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>Navigation</span>
              </div>
              <button
                className="mobile-nav-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Quick Live Price Card */}
            <div className="mobile-nav-price-card">
              <div>
                <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase' }}>Bitcoin Last Price</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--wolf-yellow-bright)', fontFamily: 'var(--font-mono)' }}>
                  {formatPrice(data.currentPrice)}
                </div>
              </div>
              <button
                className="live-badge-btn"
                onClick={() => {
                  handleRefresh();
                  setMobileMenuOpen(false);
                }}
              >
                <span className="live-dot" />
                <span>Refresh</span>
              </button>
            </div>

            {/* Nav Links */}
            <div className="mobile-nav-links">
              <button
                className={`mobile-nav-item ${activeTab === 'levels' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('levels');
                  setMobileMenuOpen(false);
                }}
              >
                <IconWolf size={18} color={activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : '#888888'} />
                <div className="mobile-nav-item-text">
                  <span className="mobile-nav-title">Wolf Key Levels</span>
                  <span className="mobile-nav-desc">Auction Price Ladder, VAL/VAH &amp; Anchors</span>
                </div>
              </button>


              <button
                className={`mobile-nav-item ${activeTab === 'session' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('session');
                  setMobileMenuOpen(false);
                }}
              >
                <IconClock size={18} color={activeTab === 'session' ? '#38bdf8' : '#888888'} />
                <div className="mobile-nav-item-text">
                  <span className="mobile-nav-title">Session HOD/LOD</span>
                  <span className="mobile-nav-desc">Asia, London &amp; NY Probabilities</span>
                </div>
              </button>

              <button
                className={`mobile-nav-item ${activeTab === 'pattern' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('pattern');
                  setMobileMenuOpen(false);
                }}
              >
                <IconCalendar size={18} color={activeTab === 'pattern' ? '#38bdf8' : '#888888'} />
                <div className="mobile-nav-item-text">
                  <span className="mobile-nav-title">Weekly Forecast</span>
                  <span className="mobile-nav-desc">Historical Cycle Match &amp; Weekly Path</span>
                </div>
              </button>

              <button
                className={`mobile-nav-item ${activeTab === 'macro' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('macro');
                  setMobileMenuOpen(false);
                }}
              >
                <IconBarChart size={18} color={activeTab === 'macro' ? '#38bdf8' : '#888888'} />
                <div className="mobile-nav-item-text">
                  <span className="mobile-nav-title">Whales • MVRV • ETFs</span>
                  <span className="mobile-nav-desc">Institutional On-Chain Flows</span>
                </div>
              </button>
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

          {/* ── TODAY'S BIAS HERO WITH INSTITUTIONAL HIGH-PROBABILITY FILTERS ── */}
          <div id="todays-bias" className={`bias-hero hero-${bColor}`}>
            <div className="hero-glow-bg" />

            {/* 1. Bias Filter Presets Bar & Matrix Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: 14,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  marginRight: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <IconZap size={12} color="#38bdf8" /> Bias Filters:
                </span>
                
                <button
                  className={`bias-filter-pill ${biasFilters.preset === 'highest_prob' ? 'active' : ''}`}
                  onClick={() => applyBiasFilterPreset('highest_prob')}
                  title="Combines Sigmas, Market Regime, 20 EMA structure, Bleed Guard, Weekly Open & Stats for highest probability bias"
                >
                  🎯 Highest Probability
                </button>
                <button
                  className={`bias-filter-pill ${biasFilters.preset === 'sigma_regime' ? 'active' : ''}`}
                  onClick={() => applyBiasFilterPreset('sigma_regime')}
                  title="Statistical Sigmas (Z-Score) & Macro Volatility/Trend Regime"
                >
                  📐 Sigmas &amp; Regime
                </button>
                <button
                  className={`bias-filter-pill ${biasFilters.preset === 'bleed_guard' ? 'active' : ''}`}
                  onClick={() => applyBiasFilterPreset('bleed_guard')}
                  title="Detects intraday bleeding and prevents 67% bullish bleed traps"
                >
                  🛡️ Bleed Trap Guard
                </button>
                <button
                  className={`bias-filter-pill ${biasFilters.preset === 'trend_only' ? 'active' : ''}`}
                  onClick={() => applyBiasFilterPreset('trend_only')}
                  title="20 EMA / 50 EMA Market Structure & Weekly Open"
                >
                  📈 Trend Structure
                </button>
                <button
                  className={`bias-filter-pill ${biasFilters.preset === 'recent_cycle' ? 'active' : ''}`}
                  onClick={() => applyBiasFilterPreset('recent_cycle')}
                  title="Recent 8-Week Regime Momentum vs Stale 5-Year History"
                >
                  ⚡ 8-Week DOW
                </button>
                <button
                  className={`bias-filter-pill ${biasFilters.preset === 'raw_legacy' ? 'active' : ''}`}
                  onClick={() => applyBiasFilterPreset('raw_legacy')}
                  title="Raw 2021-Present Unfiltered Statistics (No Technical Overlays)"
                >
                  📊 Raw Legacy Stats
                </button>
              </div>

              <button
                className="confluence-toggle-btn"
                onClick={() => setShowConfluences(!showConfluences)}
                style={{
                  background: showConfluences ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${showConfluences ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: showConfluences ? '#38bdf8' : 'var(--text-muted)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-mono)'
                }}
              >
                <span>Confluence Matrix</span>
                <span style={{ fontSize: '0.65rem' }}>{showConfluences ? '▲ Hide' : '▼ View'}</span>
              </button>
            </div>

            {/* 2. Bleed Trap Alert Warning Banner (Triggers if Bleed Guard detects trap) */}
            {bias.bleedTrap?.detected && bias.isFiltered && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{
                  background: '#ef4444',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  marginTop: 1,
                  flexShrink: 0
                }}>
                  BLEED TRAP ⚠️
                </div>
                <div style={{ fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.45 }}>
                  <strong style={{ color: '#ffffff' }}>{bias.bleedTrap.title}:</strong> {bias.bleedTrap.explanation}
                </div>
              </div>
            )}

            {/* 3. Interactive Confluence Chip Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ fontSize: '0.68rem', color: '#666', fontFamily: 'var(--font-mono)', marginRight: 2 }}>Confluences:</span>
              <button
                className={`confluence-chip ${biasFilters.enableSigma ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableSigma')}
              >
                {biasFilters.enableSigma ? '✓ ' : '+ '}Sigmas (Z-Score)
              </button>
              <button
                className={`confluence-chip ${biasFilters.enableRegime ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableRegime')}
              >
                {biasFilters.enableRegime ? '✓ ' : '+ '}Market Regime
              </button>
              <button
                className={`confluence-chip ${biasFilters.enableTrend ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableTrend')}
              >
                {biasFilters.enableTrend ? '✓ ' : '+ '}Trend (20 EMA)
              </button>
              <button
                className={`confluence-chip ${biasFilters.enableBleedGuard ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableBleedGuard')}
              >
                {biasFilters.enableBleedGuard ? '✓ ' : '+ '}Bleed Trap Guard
              </button>
              <button
                className={`confluence-chip ${biasFilters.enableWeeklyOpen ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableWeeklyOpen')}
              >
                {biasFilters.enableWeeklyOpen ? '✓ ' : '+ '}Weekly Open
              </button>
              <button
                className={`confluence-chip ${biasFilters.enableRecentRegime ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableRecentRegime')}
              >
                {biasFilters.enableRecentRegime ? '✓ ' : '+ '}Recent 8W DOW
              </button>
              <button
                className={`confluence-chip ${biasFilters.enableRawStats ? 'active' : ''}`}
                onClick={() => toggleSingleBiasFilter('enableRawStats')}
              >
                {biasFilters.enableRawStats ? '✓ ' : '+ '}Historical DOW
              </button>
            </div>

            {/* 4. Hero Main Content */}
            <div className="hero-content">
              <div className="hero-left">
                <div className="hero-date">{formattedToday}</div>
                <div className={`hero-title bias-${bColor}-text`} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {bias.bias === 'bullish' ? (
                      <IconTrendUp size={28} className="hero-bias-icon" />
                    ) : bias.bias === 'bearish' ? (
                      <IconTrendDown size={28} className="hero-bias-icon" />
                    ) : (
                      <IconScale size={28} className="hero-bias-icon" />
                    )}
                    <span>{bias.bias.charAt(0).toUpperCase() + bias.bias.slice(1)} Bias</span>
                  </div>
                  
                  {/* High Probability Conviction Badge */}
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                    background: bias.isFiltered ? (bias.bias === 'bearish' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)') : 'rgba(255, 255, 255, 0.08)',
                    color: bias.isFiltered ? (bias.bias === 'bearish' ? '#f87171' : '#4ade80') : '#888888',
                    border: `1px solid ${bias.isFiltered ? (bias.bias === 'bearish' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)') : '#333333'}`,
                  }}>
                    {bias.isFiltered ? `HIGHEST PROBABILITY: ${bias.confidence}% CONVICTION` : `RAW UNFILTERED: ${bias.confidence}%`}
                  </span>

                  {/* Market Regime Badge */}
                  {bias.regimeMetrics && (
                    <span style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.04em',
                      background: `${bias.regimeMetrics.color}15`,
                      color: bias.regimeMetrics.color,
                      border: `1px solid ${bias.regimeMetrics.color}40`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: bias.regimeMetrics.color }} />
                      REGIME: {bias.regimeMetrics.name.toUpperCase()}
                    </span>
                  )}

                  {/* Sigma Z-Score Badge */}
                  {bias.sigmaMetrics && (
                    <span style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.04em',
                      background: `${bias.sigmaMetrics.color}15`,
                      color: bias.sigmaMetrics.color,
                      border: `1px solid ${bias.sigmaMetrics.color}40`,
                    }}>
                      σ {bias.sigmaMetrics.zScoreText} ({bias.sigmaMetrics.statusShort})
                    </span>
                  )}
                </div>
                <p className="hero-subtitle">{biasSummary}</p>

                {/* Real-time Filtered Confluence Signals */}
                <div className="hero-signals">
                  {bias.isFiltered && bias.technicalMetrics ? (
                    <>
                      {bias.sigmaMetrics && (
                        <div className="signal-pill">
                          <span className="pill-dot" style={{ background: bias.sigmaMetrics.color }} />
                          <span className="pill-label">Sigma Position</span>
                          <span className="pill-value" style={{ color: bias.sigmaMetrics.color }}>
                            {bias.sigmaMetrics.zScoreText} &middot; {bias.sigmaMetrics.statusShort}
                          </span>
                        </div>
                      )}
                      {bias.regimeMetrics && (
                        <div className="signal-pill">
                          <span className="pill-dot" style={{ background: bias.regimeMetrics.color }} />
                          <span className="pill-label">Macro Regime</span>
                          <span className="pill-value" style={{ color: bias.regimeMetrics.color }}>
                            {bias.regimeMetrics.name}
                          </span>
                        </div>
                      )}
                      <div className="signal-pill">
                        <span className={`pill-dot ${bias.technicalMetrics.priceVsEma20Pct >= 0 ? 'bullish' : 'bearish'}`} />
                        <span className="pill-label">20 EMA Structure</span>
                        <span className={`pill-value ${bias.technicalMetrics.priceVsEma20Pct >= 0 ? 'value-bullish' : 'value-bearish'}`}>
                          {bias.technicalMetrics.priceVsEma20Pct >= 0 ? '+' : ''}{bias.technicalMetrics.priceVsEma20Pct}% (${bias.technicalMetrics.ema20.toLocaleString()})
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
                        <span className={`pill-dot ${bias.technicalMetrics.change24h >= 0 ? 'bullish' : 'bearish'}`} />
                        <span className="pill-label">Bleed Guard</span>
                        <span className={`pill-value ${bias.technicalMetrics.change24h >= 0 ? 'value-bullish' : 'value-bearish'}`}>
                          24h: {bias.technicalMetrics.change24h >= 0 ? '+' : ''}{bias.technicalMetrics.change24h}% · RSI {bias.technicalMetrics.rsi14}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                {/* ── QUANT STATISTICAL SIGMA VOLATILITY GAUGE & BANDS ── */}
                {bias.sigmaMetrics && (
                  <div style={{
                    marginTop: 16,
                    padding: '12px 14px',
                    background: '#070707',
                    border: '1px solid #1a1a1a',
                    borderRadius: 8,
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 8,
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#38bdf8', fontWeight: 800 }}>STATISTICAL SIGMAS (&plusmn;&sigma;)</span>
                        <span style={{ color: '#555' }}>&middot;</span>
                        <span style={{ color: '#888' }}>Daily Volatility: <strong style={{ color: '#fff' }}>&plusmn;{bias.sigmaMetrics.dailyStdDevPct}%</strong></span>
                      </div>
                      <div style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: `${bias.sigmaMetrics.color}15`,
                        color: bias.sigmaMetrics.color,
                        border: `1px solid ${bias.sigmaMetrics.color}35`,
                        fontWeight: 700,
                        fontSize: '0.68rem',
                      }}>
                        {bias.sigmaMetrics.zScoreText} &middot; {bias.sigmaMetrics.statusShort}
                      </div>
                    </div>

                    {/* Horizontal Sigma Scale Gauge (-3σ to +3σ) */}
                    <div style={{ position: 'relative', margin: '14px 4px 8px' }}>
                      <div style={{
                        height: 6,
                        background: 'linear-gradient(90deg, #ef4444 0%, #38bdf8 25%, #22c55e 50%, #38bdf8 75%, #ef4444 100%)',
                        borderRadius: 3,
                        position: 'relative',
                        opacity: 0.85
                      }}>
                        {/* Live Z-score needle marker */}
                        <div style={{
                          position: 'absolute',
                          left: `${Math.min(Math.max(((bias.sigmaMetrics.zScore + 3) / 6) * 100, 2), 98)}%`,
                          top: -6,
                          bottom: -6,
                          width: 4,
                          background: '#ffffff',
                          boxShadow: '0 0 8px #ffffff, 0 0 14px #38bdf8',
                          borderRadius: 2,
                          transform: 'translateX(-50%)',
                          zIndex: 3
                        }} />
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.58rem',
                        fontFamily: 'var(--font-mono)',
                        color: '#666',
                        marginTop: 6
                      }}>
                        <span>-3&sigma; Extreme</span>
                        <span>-2&sigma; Floor</span>
                        <span>-1&sigma; Low</span>
                        <span style={{ color: '#fff', fontWeight: 700 }}>0 (Mean)</span>
                        <span>+1&sigma; High</span>
                        <span>+2&sigma; Ceiling</span>
                        <span>+3&sigma; Extreme</span>
                      </div>
                    </div>

                    {/* Sigma Price Nodes Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
                      gap: 6,
                      marginTop: 10
                    }}>
                      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: '#888', textTransform: 'uppercase' }}>-2&sigma; Bounce Floor</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4ade80', fontFamily: 'var(--font-mono)' }}>{formatPrice(bias.sigmaMetrics.minus2Sigma)}</div>
                      </div>
                      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: '#888', textTransform: 'uppercase' }}>-1&sigma; Expected Low</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{formatPrice(bias.sigmaMetrics.minus1Sigma)}</div>
                      </div>
                      <div style={{ background: '#0d0d0d', border: '1px solid #262626', borderRadius: 4, padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: '#888', textTransform: 'uppercase' }}>Mean (20 SMA)</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{formatPrice(bias.sigmaMetrics.mean)}</div>
                      </div>
                      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: '#888', textTransform: 'uppercase' }}>+1&sigma; Expected High</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{formatPrice(bias.sigmaMetrics.plus1Sigma)}</div>
                      </div>
                      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: '#888', textTransform: 'uppercase' }}>+2&sigma; Mean Rev Ceiling</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-mono)' }}>{formatPrice(bias.sigmaMetrics.plus2Sigma)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confidence Ring */}
              <div className="confidence-meter">
                <ConfidenceRing confidence={bias.confidence} bias={bias.bias} />
                <div className="meter-description">
                  {bias.isFiltered ? (
                    <>Highest-probability<br />multi-confluence filter</>
                  ) : (
                    <>Raw unweighted<br />3-signal baseline</>
                  )}
                </div>
              </div>
            </div>

            {/* 5. Confluence Matrix Breakdown (Toggleable) */}
            {showConfluences && bias.confluences && (
              <div style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                animation: 'fadeIn 0.2s ease',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}>
                  <span>CONFLUENCE ALIGNMENT SCORECARD:</span>
                  <span style={{ color: bias.bias === 'bearish' ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                    Composite Score: {bias.confluenceScore > 0 ? '+' : ''}{bias.confluenceScore}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 10,
                }}>
                  {bias.confluences.map((c) => {
                    const isBull = c.state === 'bullish';
                    const isBear = c.state === 'bearish';
                    return (
                      <div
                        key={c.id}
                        style={{
                          background: '#090909',
                          border: `1px solid ${isBull ? 'rgba(34, 197, 94, 0.25)' : isBear ? 'rgba(239, 68, 68, 0.25)' : '#1f1f1f'}`,
                          borderRadius: 6,
                          padding: '8px 12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.72rem', color: '#aaaaaa', fontFamily: 'var(--font-mono)' }}>{c.name}</span>
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: isBull ? 'rgba(34, 197, 94, 0.2)' : isBear ? 'rgba(239, 68, 68, 0.2)' : '#222222',
                            color: isBull ? '#4ade80' : isBear ? '#f87171' : '#888888',
                          }}>
                            {c.state.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e5e5e5', fontFamily: 'var(--font-mono)' }}>
                          {c.valueText}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#666666', marginTop: 2 }}>
                          {c.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
            <button id="tab-session" className={`tab-btn ${activeTab === 'session' ? 'active' : ''}`} onClick={() => setActiveTab('session')}>
              <IconClock size={15} color={activeTab === 'session' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'session' ? '#38bdf8' : undefined }}>Session HOD/LOD</span>
            </button>
            <button id="tab-pattern" className={`tab-btn ${activeTab === 'pattern' ? 'active' : ''}`} onClick={() => setActiveTab('pattern')}>
              <IconCalendar size={15} color={activeTab === 'pattern' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'pattern' ? '#38bdf8' : undefined }}>Weekly Forecast</span>
            </button>
            <button id="tab-macro" className={`tab-btn ${activeTab === 'macro' ? 'active' : ''}`} onClick={() => setActiveTab('macro')}>
              <IconBarChart size={15} color={activeTab === 'macro' ? '#38bdf8' : undefined} />
              <span style={{ color: activeTab === 'macro' ? '#38bdf8' : undefined }}>Whales • MVRV • ETFs</span>
            </button>
          </div>

          {/* ── 1. WOLF KEY LEVELS VIEW ── */}
          {activeTab === 'levels' && (
            <WolfKeyLevels levelsData={wolfLevels} />
          )}

          {/* ── 2. SESSION PROFILER (Asia · London · NY HOD/LOD Probabilities) ── */}
          {activeTab === 'session' && (
            <SessionProfiler />
          )}

          {/* ── 3. WEEKLY FORECAST VIEW ── */}
          {activeTab === 'pattern' && (
            <WeeklyForecast weekPattern={weekPattern} formatPrice={formatPrice} />
          )}

          {/* ── 4. MACRO WHALES & ETF VIEW ── */}
          {activeTab === 'macro' && (
            <MacroWhalesEtf />
          )}

        </div>
      </main>

      {/* ── Mobile Sticky Bottom Bar (4 Clean Institutional Tools) ── */}
      <div className="mobile-bottom-bar">
        <button
          className={`mobile-bottom-btn ${activeTab === 'levels' ? 'active' : ''}`}
          onClick={() => setActiveTab('levels')}
        >
          <IconWolf size={18} />
          <span>Levels</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'session' ? 'active' : ''}`}
          onClick={() => setActiveTab('session')}
        >
          <IconClock size={18} />
          <span>Sessions</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'pattern' ? 'active' : ''}`}
          onClick={() => setActiveTab('pattern')}
        >
          <IconCalendar size={18} />
          <span>Forecast</span>
        </button>
        <button
          className={`mobile-bottom-btn ${activeTab === 'macro' ? 'active' : ''}`}
          onClick={() => setActiveTab('macro')}
        >
          <IconBarChart size={18} />
          <span>Whales</span>
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
