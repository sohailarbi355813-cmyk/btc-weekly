'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTodayBias } from '@/lib/biasEngine';
import { buildWeeklyProfiles, findSimilarWeeks } from '@/lib/weekPatternEngine';
import { calculateWolfKeyLevels } from '@/lib/wolfLevelsEngine';
import WolfKeyLevels from '@/components/WolfKeyLevels';
import AltsTapeReader from '@/components/AltsTapeReader';
import {
  IconBitcoin,
  IconTrendUp,
  IconTrendDown,
  IconScale,
  IconCalendar,
  IconRadar,
  IconBarChart,
  IconGrid,
  IconSparkles,
  IconTarget,
  IconTrophy,
  IconRefresh,
  IconLayers,
  IconZap,
  IconClock,
  IconPin,
  IconCandle,
  IconAlertTriangle,
  IconShield,
  IconCheck,
  IconDatabase,
  IconWolf,
  IconLevels,
} from '@/components/Icons';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon through Sun

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

// ─── Return Distribution Chart ────────────────────────────────────────────────

function DistributionChart({ returns }) {
  if (!returns || returns.length === 0) return null;

  const bins = [];
  const step = 0.5;
  for (let start = -6; start < 6; start += step) {
    const end = start + step;
    const count = returns.filter(r => r >= start && r < end).length;
    bins.push({ start, end, count, label: start === 0 ? '0' : start % 2 === 0 ? `${start}%` : '' });
  }

  const maxCount = Math.max(...bins.map(b => b.count), 1);

  return (
    <div>
      <div className="distribution-chart">
        {bins.map((bin, i) => (
          <div key={i} className="dist-bar-col">
            <div
              className={`dist-bar ${bin.start >= 0 ? 'positive' : 'negative'}`}
              style={{ height: `${(bin.count / maxCount) * 100}%` }}
              title={`${bin.start >= 0 ? '+' : ''}${bin.start}% to ${bin.end >= 0 ? '+' : ''}${bin.end}%: ${bin.count} days`}
            />
          </div>
        ))}
      </div>
      <div className="dist-axis">
        <span className="dist-axis-label">-6%</span>
        <span className="dist-axis-label">-3%</span>
        <span className="dist-axis-label">0</span>
        <span className="dist-axis-label">+3%</span>
        <span className="dist-axis-label">+6%</span>
      </div>
    </div>
  );
}

// ─── Recent Same-Day Candles ──────────────────────────────────────────────────

function RecentCandles({ candles, dayName }) {
  if (!candles || candles.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data available</p>;
  }

  const maxAbs = Math.max(...candles.map(c => Math.abs(((c.close - c.open) / c.open) * 100)), 1);

  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconClock size={13} />
        Last {candles.length} {dayName}s &mdash; chronological order
      </div>
      <div className="recent-candles">
        {candles.map((c, i) => {
          const ret = ((c.close - c.open) / c.open) * 100;
          const bull = ret > 0;
          const heightPct = Math.max((Math.abs(ret) / maxAbs) * 80, 20);
          const dateObj = new Date(c.date + 'T12:00:00Z');
          const dateStr = `${dateObj.getUTCDate()} ${MONTHS[dateObj.getUTCMonth()]}`;
          return (
            <div key={i} className="candle-bar-wrap tooltip-wrap">
              <div
                className={`candle-bar ${bull ? 'candle-bull' : 'candle-bear'}`}
                style={{ height: `${heightPct}px` }}
              >
                {Math.abs(ret) > 1.5 ? `${ret > 0 ? '+' : ''}${ret.toFixed(1)}%` : ''}
              </div>
              <div className="candle-date">{dateStr}</div>
              <div className="tooltip-box">
                <div className="tooltip-row">
                  <span className="tooltip-key">Date</span>
                  <span className="tooltip-val">{c.date}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-key">Open</span>
                  <span className="tooltip-val">{formatPrice(c.open)}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-key">Close</span>
                  <span className="tooltip-val">{formatPrice(c.close)}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-key">Return</span>
                  <span className="tooltip-val" style={{ color: bull ? 'var(--bullish)' : 'var(--bearish)' }}>
                    {formatPct(ret)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Day-of-Week Card ─────────────────────────────────────────────────────────

function DowCard({ stats, isToday }) {
  const color = biasColor(stats.bias);
  const barWidth = `${Math.min(stats.bullishRate, 100)}%`;

  return (
    <div className={`dow-card ${isToday ? 'today' : ''} tooltip-wrap`}>
      <div className="dow-card-day">{stats.dayName.slice(0, 3)}</div>
      <div className={`dow-bias-badge badge-${color}`}>
        {stats.bias === 'bullish' ? <IconTrendUp size={11} /> : stats.bias === 'bearish' ? <IconTrendDown size={11} /> : <IconScale size={11} />}
        <span>{stats.bias}</span>
      </div>
      <div className={`dow-win-rate value-${color}`}>
        {stats.bullishRate.toFixed(0)}%
      </div>
      <div className="dow-avg-return" style={{ color: stats.avgReturn > 0 ? 'var(--bullish)' : 'var(--bearish)' }}>
        {formatPct(stats.avgReturn)}
      </div>
      <div className="dow-bar-container">
        <div className={`dow-bar-fill bar-${color}`} style={{ width: barWidth }} />
      </div>
      <div className="dow-sample">{stats.total} days</div>

      {/* Tooltip */}
      <div className="tooltip-box">
        <div className="tooltip-row"><span className="tooltip-key">Day</span><span className="tooltip-val">{stats.dayName}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Win Rate</span><span className="tooltip-val">{stats.bullishRate.toFixed(1)}%</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Avg Return</span><span className="tooltip-val">{formatPct(stats.avgReturn)}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Median</span><span className="tooltip-val">{formatPct(stats.medianReturn)}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Best Day</span><span className="tooltip-val" style={{ color: 'var(--bullish)' }}>{formatPct(stats.maxGain)}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Worst Day</span><span className="tooltip-val" style={{ color: 'var(--bearish)' }}>{formatPct(stats.maxLoss)}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Streak</span><span className="tooltip-val">{stats.streaks.currentBullStreak > 0 ? `${stats.streaks.currentBullStreak} Bull` : `${stats.streaks.currentBearStreak} Bear`}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Samples</span><span className="tooltip-val">{stats.total}</span></div>
      </div>
    </div>
  );
}

// ─── Month Cell ────────────────────────────────────────────────────────────────

function MonthCell({ stats, isCurrent }) {
  const color = biasColor(stats.bias);
  return (
    <div className={`month-cell month-${color} tooltip-wrap`} style={isCurrent ? { outline: '1.5px solid var(--accent)', outlineOffset: '2px' } : {}}>
      <div className="month-name">{stats.monthName}</div>
      <div className={`month-rate value-${color}`}>{stats.total > 0 ? `${stats.bullishRate.toFixed(0)}%` : '—'}</div>
      <div className="month-avg" style={{ color: stats.avgReturn > 0 ? 'var(--bullish)' : 'var(--bearish)' }}>
        {stats.total > 0 ? formatPct(stats.avgReturn) : ''}
      </div>
      <div className="tooltip-box">
        <div className="tooltip-row"><span className="tooltip-key">Month</span><span className="tooltip-val">{stats.monthName}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Bull Rate</span><span className="tooltip-val">{stats.total > 0 ? `${stats.bullishRate.toFixed(1)}%` : '—'}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Avg Return</span><span className="tooltip-val">{stats.total > 0 ? formatPct(stats.avgReturn) : '—'}</span></div>
        <div className="tooltip-row"><span className="tooltip-key">Samples</span><span className="tooltip-val">{stats.total} years</span></div>
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function Home() {
  const [data, setData] = useState(null);
  const [bias, setBias] = useState(null);
  const [weekPattern, setWeekPattern] = useState(null);
  const [wolfLevels, setWolfLevels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadStep, setLoadStep] = useState(1);
  const [activeTab, setActiveTab] = useState('levels'); // Default to Wolf Key Levels
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clientDate, setClientDate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
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

      setLoadStep(3); // Calculating statistical bias
      const now = new Date();
      setClientDate(now);
      const biasResult = getTodayBias(json.candles, currentPrice, now);

      setLoadStep(4); // Week sequence pattern matching
      const weeklyProfiles = buildWeeklyProfiles(json.candles);
      const patternResult = findSimilarWeeks(weeklyProfiles, 25, now);

      // 5. Wolf Key Levels calculation
      const wolfLevelsResult = calculateWolfKeyLevels(json.candles, currentPrice);

      setData({ candles: json.candles, count: json.count, currentPrice });
      setBias(biasResult);
      setWeekPattern(patternResult);
      setWolfLevels(wolfLevelsResult);
      setLastUpdated(now);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Safe date derivation for rendering (avoids non-deterministic prerender evaluations)
  const todayDow = bias?.dow ?? (clientDate ? clientDate.getUTCDay() : 5);
  const todayMonth = bias?.month ?? (clientDate ? clientDate.getUTCMonth() : 9);
  const formattedToday = clientDate
    ? clientDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : (bias?.date ? `Date: ${bias.date}` : '');

  // ── Render: Loading ────────────────────────────────────────────────────────

  if (loading) {
    const steps = [
      { label: 'Connecting to market data feed...', Icon: IconDatabase },
      { label: 'Ingesting daily BTC candles (2021 → today)...', Icon: IconClock },
      { label: 'Computing day-of-week & seasonal distributions...', Icon: IconBarChart },
      { label: 'Scanning 300+ historical weeks for sequence similarity...', Icon: IconRadar },
      { label: 'Deriving directional edge & predictive confidence...', Icon: IconTarget },
    ];
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo">
                <div className="logo-icon">
                  <IconWolf size={20} color="var(--wolf-yellow-bright)" />
                </div>
                <div className="logo-text">
                  <h1>Wolf Tape Read</h1>
                  <span>Trading The Tape, With Precision &middot; Key Levels &amp; Bias</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="main" style={{ flex: 1 }}>
          <div className="container">
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text">Calibrating Market Statistics...</div>
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

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="logo">
                <div className="logo-icon">
                  <IconWolf size={20} color="var(--wolf-yellow-bright)" />
                </div>
                <div className="logo-text">
                  <h1>Wolf Tape Read</h1>
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
              <button id="retry-btn" className="retry-btn" onClick={loadData}>
                <IconRefresh size={14} />
                <span>Retry Sync</span>
              </button>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Please verify network connection. Data feeds retry automatically.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!bias || !data) return null;

  const bColor = biasColor(bias.bias);
  const dowStatsArr = Object.values(bias.allDowStats);
  const monthlyStatsArr = Object.values(bias.allMonthlyStats);

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-icon">
                <IconWolf size={20} color="var(--wolf-yellow-bright)" />
              </div>
              <div className="logo-text">
                <h1>Wolf Tape Reader</h1>
                <span>Trading The Tape, With Precision &middot; Key Levels, Alts &amp; Bias</span>
              </div>
            </div>
            <div className="header-right">
              <div className="btc-price-header">{formatPrice(data.currentPrice)}</div>
              <div className="live-badge">
                <span className="live-dot" />
                <span>Live Feed</span>
              </div>
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
                Synced: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </span>
              <button className="refresh-link-btn" onClick={loadData} title="Refresh live data">
                <IconRefresh size={13} />
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

          {/* ── TABS ── */}
          <div className="tab-bar">
            <button id="tab-levels" className={`tab-btn ${activeTab === 'levels' ? 'active' : ''}`} onClick={() => setActiveTab('levels')}>
              <IconWolf size={15} color={activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : 'var(--wolf-yellow)'} />
              <span style={{ color: activeTab === 'levels' ? 'var(--wolf-yellow-bright)' : undefined }}>Wolf Key Levels</span>
            </button>
            <button id="tab-alts" className={`tab-btn ${activeTab === 'alts' ? 'active' : ''}`} onClick={() => setActiveTab('alts')}>
              <IconRadar size={15} color={activeTab === 'alts' ? 'var(--wolf-yellow-bright)' : undefined} />
              <span style={{ color: activeTab === 'alts' ? 'var(--wolf-yellow-bright)' : undefined }}>Alts Tape Reader</span>
              <span style={{ background: 'var(--wolf-yellow)', color: '#0b0e14', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 800, marginLeft: '0.35rem' }}>55</span>
            </button>
            <button id="tab-pattern" className={`tab-btn ${activeTab === 'pattern' ? 'active' : ''}`} onClick={() => setActiveTab('pattern')}>
              <IconRadar size={15} />
              <span>Week Pattern Match</span>
            </button>
            <button id="tab-dow" className={`tab-btn ${activeTab === 'dow' ? 'active' : ''}`} onClick={() => setActiveTab('dow')}>
              <IconCalendar size={15} />
              <span>Day of Week</span>
            </button>
            <button id="tab-monthly" className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`} onClick={() => setActiveTab('monthly')}>
              <IconGrid size={15} />
              <span>Monthly Seasonal</span>
            </button>
            <button id="tab-dist" className={`tab-btn ${activeTab === 'dist' ? 'active' : ''}`} onClick={() => setActiveTab('dist')}>
              <IconBarChart size={15} />
              <span>Distribution</span>
            </button>
          </div>

          {/* ── WOLF KEY LEVELS VIEW ── */}
          {activeTab === 'levels' && (
            <WolfKeyLevels levelsData={wolfLevels} />
          )}

          {/* ── ALTS TAPE READER VIEW ── */}
          {activeTab === 'alts' && (
            <AltsTapeReader />
          )}

          {/* ── WEEK PATTERN MATCHING VIEW ── */}
          {activeTab === 'pattern' && (
            <div style={{ animation: 'fadeInUp 0.35s ease' }}>
              {!weekPattern ? (
                <div className="no-data-msg">
                  <IconRadar size={22} color="var(--text-muted)" />
                  <span>Calibrating weekly sequence data...</span>
                </div>
              ) : (
                <>
                  {/* ─ Current Week Timeline ─ */}
                  <div className="section-header">
                    <div className="section-title">
                      <IconLayers size={18} color="var(--accent)" />
                      <span>This Week&apos;s Running Sequence</span>
                    </div>
                    <div className="section-subtitle">
                      Closed days display realized % returns. Active day is live. Future days show upcoming targets.
                    </div>
                  </div>

                  <div className="week-timeline">
                    {WEEK_ORDER.map(dow => {
                      const dayData = weekPattern.currentWeek?.days[dow];
                      const isClosed = weekPattern.closedDows?.includes(dow);
                      const isToday = dow === weekPattern.todayDow;
                      const isFuture = weekPattern.futureDows?.includes(dow);
                      const bull = dayData?.bullish;

                      let cellClass = 'week-day-cell';
                      if (isToday) cellClass += ' is-today';
                      else if (isClosed && bull) cellClass += ' completed-bull';
                      else if (isClosed && !bull) cellClass += ' completed-bear';
                      else if (isFuture) cellClass += ' future';

                      return (
                        <div key={dow} className={cellClass}>
                          <div className="week-day-header">
                            <span className="week-day-name">{DAY_SHORT[dow]}</span>
                            <span className="week-day-badge">
                              {isToday ? 'Live' : isClosed ? 'Closed' : 'Pending'}
                            </span>
                          </div>
                          {dayData ? (
                            <>
                              <div className={`week-day-return ${bull ? 'value-bullish' : 'value-bearish'}`}>
                                {dayData.return > 0 ? '+' : ''}{dayData.return.toFixed(2)}%
                              </div>
                              <div className="week-day-prices">
                                O: {formatPrice(dayData.open)}<br />
                                C: {formatPrice(dayData.close)}
                              </div>
                            </>
                          ) : (
                            <div className="week-day-future-label">Upcoming</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ─ Pattern Description ─ */}
                  {weekPattern.currentPattern && (
                    <div className="pattern-desc">
                      <div className="pattern-desc-icon">
                        <IconRadar size={18} color="var(--accent)" />
                      </div>
                      <div>
                        <strong>Current Week Trajectory:</strong> {weekPattern.currentPattern}.<br />
                        Matched against <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{weekPattern.totalMatchesFound}</span> statistically analogous weeks from Jan 2021 to now.
                      </div>
                    </div>
                  )}

                  {/* ─ Match Count Badges ─ */}
                  <div className="match-count-row">
                    <div className="match-badge">
                      <IconCalendar size={13} />
                      <span><span className="badge-num">{weekPattern.totalMatchesFound}</span> matching weeks found</span>
                    </div>
                    <div className="match-badge">
                      <IconTrophy size={13} />
                      <span>Top <span className="badge-num">{weekPattern.topMatches.length}</span> highest correlation</span>
                    </div>
                    <div className="match-badge">
                      <IconTarget size={13} />
                      <span>Similarity threshold: <span className="badge-num">25%+</span></span>
                    </div>
                  </div>

                  {/* ─ Current Week Predictions ─ */}
                  <div className="panel" style={{ marginBottom: 28 }}>
                    <div className="section-title" style={{ marginBottom: 4 }}>
                      <IconTarget size={18} color="var(--accent)" />
                      <span>Historical Sequence Forecast (This Week)</span>
                    </div>
                    <div className="section-subtitle" style={{ marginBottom: 20 }}>
                      Based on what unfolded across the {weekPattern.totalMatchesFound} matched historical weeks.
                      Completed days reflect realized history; active and upcoming days show probabilistic bias.
                    </div>
                    <div className="predictions-grid">
                      {WEEK_ORDER.map(dow => {
                        const pred = weekPattern.predictions[dow];
                        if (!pred) return (
                          <div key={dow} className="prediction-card">
                            <div className="pred-day-name">{DAY_SHORT[dow]}</div>
                            <div className="pred-completed-label">No data</div>
                          </div>
                        );
                        const color = biasColor(pred.bias);
                        let cardClass = `prediction-card pred-${color}`;
                        if (pred.isClosed) cardClass += ' is-completed';
                        if (pred.isToday) cardClass += ' is-today-pred';

                        return (
                          <div key={dow} className={cardClass + ' tooltip-wrap'}>
                            <div className="pred-day-name">
                              <span>{pred.dayName}</span>
                              {pred.isToday && <span className="today-chip">Today</span>}
                            </div>
                            <div className={`pred-bull-rate value-${color}`}>
                              {pred.weightedBullRate.toFixed(0)}%
                            </div>
                            <div className="pred-dir-badge">
                              {pred.bias === 'bullish' ? (
                                <span className="badge-bullish-mini"><IconTrendUp size={11} /> Bullish</span>
                              ) : pred.bias === 'bearish' ? (
                                <span className="badge-bearish-mini"><IconTrendDown size={11} /> Bearish</span>
                              ) : (
                                <span className="badge-neutral-mini"><IconScale size={11} /> Neutral</span>
                              )}
                            </div>
                            <div className={`pred-avg-return ${pred.avgReturn > 0 ? 'value-bullish' : 'value-bearish'}`}>
                              avg {pred.avgReturn > 0 ? '+' : ''}{pred.avgReturn.toFixed(2)}%
                            </div>
                            <div className="pred-conf-bar">
                              <div
                                className={`pred-conf-fill bar-${color}`}
                                style={{ width: `${pred.confidence}%` }}
                              />
                            </div>
                            <div className="pred-sample">{pred.sampleSize} matched weeks</div>
                            {pred.actualData && (
                              <div className="pred-actual-tag">
                                Actual: {pred.actualData.return > 0 ? '+' : ''}{pred.actualData.return.toFixed(2)}%
                              </div>
                            )}

                            {/* Tooltip */}
                            <div className="tooltip-box">
                              <div className="tooltip-row"><span className="tooltip-key">Day</span><span className="tooltip-val">{pred.fullDayName}</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Win Rate</span><span className="tooltip-val">{pred.bullishRate.toFixed(1)}%</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Weighted Win</span><span className="tooltip-val" style={{ color: `var(--${color})` }}>{pred.weightedBullRate.toFixed(1)}%</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Avg Return</span><span className="tooltip-val">{pred.avgReturn > 0 ? '+' : ''}{pred.avgReturn.toFixed(2)}%</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Best</span><span className="tooltip-val" style={{ color: 'var(--bullish)' }}>+{pred.maxGain.toFixed(2)}%</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Worst</span><span className="tooltip-val" style={{ color: 'var(--bearish)' }}>{pred.maxLoss.toFixed(2)}%</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Confidence</span><span className="tooltip-val">{pred.confidence}%</span></div>
                              <div className="tooltip-row"><span className="tooltip-key">Samples</span><span className="tooltip-val">{pred.sampleSize}</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ─ Similar Historical Weeks ─ */}
                  {weekPattern.topMatches.length > 0 && (
                    <div style={{ marginBottom: 28 }}>
                      <div className="section-title" style={{ marginBottom: 12, fontSize: '0.95rem' }}>
                        <IconTrophy size={16} color="var(--gold)" />
                        <span>Top Correlated Historical Weeks</span>
                      </div>
                      <div className="similar-weeks-grid">
                        {weekPattern.topMatches.map((m, i) => {
                          const maxAbs = Math.max(...WEEK_ORDER.map(d => Math.abs(m.week.days[d]?.return ?? 0)), 1);
                          return (
                            <div key={i} className="similar-week-card tooltip-wrap">
                              <div className="sim-week-header">
                                <span className="sim-week-date">{m.week.weekStart}</span>
                                <span className="sim-score-badge">{Math.round(m.score)}% match</span>
                              </div>
                              <div className="sim-week-bars">
                                {WEEK_ORDER.map(dow => {
                                  const d = m.week.days[dow];
                                  if (!d) return (
                                    <div key={dow} className="sim-day-bar-wrap">
                                      <div className="sim-day-bar missing" />
                                      <div className="sim-day-label">{DAY_LETTERS[dow]}</div>
                                    </div>
                                  );
                                  const h = Math.max((Math.abs(d.return) / maxAbs) * 32, 4);
                                  return (
                                    <div key={dow} className="sim-day-bar-wrap">
                                      <div
                                        className={`sim-day-bar ${d.bullish ? 'bull' : 'bear'}`}
                                        style={{ height: `${h}px` }}
                                        title={`${DAY_SHORT[dow]}: ${d.return > 0 ? '+' : ''}${d.return.toFixed(2)}%`}
                                      />
                                      <div className="sim-day-label">{DAY_LETTERS[dow]}</div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Tooltip */}
                              <div className="tooltip-box" style={{ minWidth: 210 }}>
                                <div className="tooltip-row"><span className="tooltip-key">Week of</span><span className="tooltip-val">{m.week.weekStart}</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Similarity</span><span className="tooltip-val" style={{ color: 'var(--gold)' }}>{Math.round(m.score)}% match</span></div>
                                {WEEK_ORDER.map(dow => m.week.days[dow] && (
                                  <div key={dow} className="tooltip-row">
                                    <span className="tooltip-key">{DAY_SHORT[dow]}</span>
                                    <span className="tooltip-val" style={{ color: m.week.days[dow].bullish ? 'var(--bullish)' : 'var(--bearish)' }}>
                                      {m.week.days[dow].return > 0 ? '+' : ''}{m.week.days[dow].return.toFixed(2)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ─ Next Week Forecast ─ */}
                  {Object.keys(weekPattern.nextWeekPredictions).length >= 3 && (
                    <div className="panel" style={{ marginBottom: 32 }}>
                      <div className="section-title" style={{ marginBottom: 4 }}>
                        <IconSparkles size={18} color="var(--accent)" />
                        <span>Subsequent Week Historical Projection</span>
                      </div>
                      <div className="section-subtitle" style={{ marginBottom: 20 }}>
                        What happened during the week immediately following these matched patterns?
                        Provides forward statistical positioning for the coming week.
                      </div>
                      <div className="next-week-grid">
                        {WEEK_ORDER.map(dow => {
                          const pred = weekPattern.nextWeekPredictions[dow];
                          if (!pred) return (
                            <div key={dow} className="next-week-card">
                              <div className="nw-day-name">{DAY_SHORT[dow]}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>&mdash;</div>
                            </div>
                          );
                          const color = biasColor(pred.bias);
                          return (
                            <div key={dow} className={`next-week-card nw-${color} tooltip-wrap`}>
                              <div className="nw-day-name">{pred.dayName}</div>
                              <div className={`nw-bias-badge badge-${color}`}>
                                {pred.bias === 'bullish' ? <IconTrendUp size={10} /> : pred.bias === 'bearish' ? <IconTrendDown size={10} /> : <IconScale size={10} />}
                                <span>{pred.bias}</span>
                              </div>
                              <div className={`nw-bull-rate value-${color}`}>{pred.weightedBullRate.toFixed(0)}%</div>
                              <div className={`nw-avg-return ${pred.avgReturn > 0 ? 'value-bullish' : 'value-bearish'}`}>
                                avg {pred.avgReturn > 0 ? '+' : ''}{pred.avgReturn.toFixed(2)}%
                              </div>
                              <div className="nw-sample">{pred.sampleSize} weeks</div>
                              {/* Tooltip */}
                              <div className="tooltip-box">
                                <div className="tooltip-row"><span className="tooltip-key">Day</span><span className="tooltip-val">{pred.fullDayName}</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Bull Rate</span><span className="tooltip-val">{pred.bullishRate.toFixed(1)}%</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Weighted</span><span className="tooltip-val" style={{ color: `var(--${color})` }}>{pred.weightedBullRate.toFixed(1)}%</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Avg Return</span><span className="tooltip-val">{pred.avgReturn > 0 ? '+' : ''}{pred.avgReturn.toFixed(2)}%</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Best</span><span className="tooltip-val" style={{ color: 'var(--bullish)' }}>+{pred.maxGain.toFixed(2)}%</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Worst</span><span className="tooltip-val" style={{ color: 'var(--bearish)' }}>{pred.maxLoss.toFixed(2)}%</span></div>
                                <div className="tooltip-row"><span className="tooltip-key">Samples</span><span className="tooltip-val">{pred.sampleSize}</span></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── DAY OF WEEK VIEW ── */}
          {activeTab === 'dow' && (
            <div className="dow-section" style={{ animation: 'fadeInUp 0.35s ease' }}>
              <div className="section-header">
                <div className="section-title">
                  <IconCalendar size={18} color="var(--accent)" />
                  <span>Day-of-Week Historical Edge</span>
                </div>
                <div className="section-subtitle">
                  Historical win rate and average daily return for each weekday since January 2021. Today is highlighted.
                </div>
              </div>
              <div className="dow-grid">
                {WEEK_ORDER.map(dow => {
                  const stats = bias.allDowStats[dow];
                  if (!stats) return null;
                  return <DowCard key={stats.day} stats={stats} isToday={stats.day === todayDow} />;
                })}
              </div>

              {/* Recent same-day candles */}
              <div className="panel" style={{ marginTop: 24 }}>
                <div className="section-title" style={{ marginBottom: 16 }}>
                  <IconCandle size={17} color="var(--accent)" />
                  <span>Recent {bias.dayName}s Execution History</span>
                </div>
                <RecentCandles candles={bias.recentSameDay} dayName={bias.dayName} />
              </div>

              {/* Weekly open deep dive */}
              <div className="two-col" style={{ marginTop: 24 }}>
                <div className="panel">
                  <div className="section-title" style={{ marginBottom: 16 }}>
                    <IconPin size={17} color="var(--accent)" />
                    <span>Weekly Open Anchor Analysis</span>
                  </div>
                  <div className="weekly-open-price-row">
                    <div className="price-block">
                      <div className="price-label">Monday 00:00 UTC Open</div>
                      <div className="price-value">{formatPrice(bias.weeklyBias.weeklyOpen)}</div>
                    </div>
                    <div className="price-block">
                      <div className="price-label">Current Spot Price</div>
                      <div className="price-value">{formatPrice(data.currentPrice)}</div>
                      <div className={`price-diff ${bias.weeklyBias.pctFromWeeklyOpen >= 0 ? 'diff-bullish' : 'diff-bearish'}`}>
                        {formatPct(bias.weeklyBias.pctFromWeeklyOpen)} from open
                      </div>
                    </div>
                  </div>
                  <div className="weekly-bias-row">
                    <div className="bias-stat-block">
                      <div className="bias-stat-label">Historically when ABOVE weekly open</div>
                      <div className={`bias-stat-value ${bias.weeklyBias.aboveOpenBullRate > 55 ? 'value-bullish' : bias.weeklyBias.aboveOpenBullRate < 45 ? 'value-bearish' : 'value-neutral'}`}>
                        {bias.weeklyBias.aboveOpenBullRate.toFixed(0)}% Bullish
                      </div>
                    </div>
                    <div className="bias-stat-block">
                      <div className="bias-stat-label">Historically when BELOW weekly open</div>
                      <div className={`bias-stat-value ${bias.weeklyBias.belowOpenBullRate > 55 ? 'value-bullish' : bias.weeklyBias.belowOpenBullRate < 45 ? 'value-bearish' : 'value-neutral'}`}>
                        {bias.weeklyBias.belowOpenBullRate.toFixed(0)}% Bullish
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    BTC is trading <strong style={{ color: bias.weeklyBias.priceVsWeeklyOpen === 'above' ? 'var(--bullish)' : 'var(--bearish)' }}>
                      {bias.weeklyBias.priceVsWeeklyOpen}
                    </strong> the weekly open.
                    Historically, weeks positioned here closed bullish <strong style={{ color: bias.weeklyBias.currentBullRate > 55 ? 'var(--bullish)' : 'var(--bearish)' }}>
                      {bias.weeklyBias.currentBullRate.toFixed(0)}%
                    </strong> of the time.
                  </div>
                </div>

                <div className="panel">
                  <div className="section-title" style={{ marginBottom: 4 }}>
                    <IconZap size={17} color="var(--gold)" />
                    <span>{bias.dayName} Statistical Edge</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                    Aggregate metrics across all {bias.dayName}s (2021&ndash;present)
                  </div>
                  {[
                    ['Total Samples', `${todayDowStats.total} ${bias.dayName}s`],
                    ['Bullish Days', `${todayDowStats.bullish} (${todayDowStats.bullishRate.toFixed(1)}%)`],
                    ['Bearish Days', `${todayDowStats.bearish} (${todayDowStats.bearishRate.toFixed(1)}%)`],
                    ['Average Return', formatPct(todayDowStats.avgReturn)],
                    ['Median Return', formatPct(todayDowStats.medianReturn)],
                    ['Max Single-Day Gain', `${formatPct(todayDowStats.maxGain)}`],
                    ['Max Single-Day Loss', `${formatPct(todayDowStats.maxLoss)}`],
                    ['Avg Win Magnitude', `${formatPct(todayDowStats.avgBullishReturn)}`],
                    ['Avg Loss Magnitude', `${formatPct(todayDowStats.avgBearishReturn)}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid var(--border)',
                      fontSize: '0.8rem'
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── MONTHLY VIEW ── */}
          {activeTab === 'monthly' && (
            <div className="panel" style={{ marginBottom: 32, animation: 'fadeInUp 0.35s ease' }}>
              <div className="section-header">
                <div className="section-title">
                  <IconGrid size={18} color="var(--accent)" />
                  <span>Monthly Calendar Seasonality</span>
                </div>
                <div className="section-subtitle">
                  Historical monthly win rate and average return since 2021. Current calendar month highlighted with accent border.
                </div>
              </div>
              <div className="monthly-grid">
                {monthlyStatsArr.map(stats => (
                  <MonthCell key={stats.month} stats={stats} isCurrent={stats.month === todayMonth} />
                ))}
              </div>

              {/* Current month summary */}
              <div style={{ marginTop: 24, padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconCalendar size={14} />
                  <span>Current Month Seasonal Profile &mdash; {MONTHS[todayMonth]}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {[
                    ['Historical Win Rate', `${bias.monthlyStats.bullishRate.toFixed(1)}%`, biasColor(bias.monthlyStats.bias)],
                    ['Average Monthly Return', formatPct(bias.monthlyStats.avgReturn), bias.monthlyStats.avgReturn > 0 ? 'bullish' : 'bearish'],
                    ['Historical Samples', `${bias.monthlyStats.total} years`, 'primary'],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                      <div className={`stat-card-value value-${color}`} style={{ fontSize: '1.15rem' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── DISTRIBUTION VIEW ── */}
          {activeTab === 'dist' && (
            <div className="two-col" style={{ animation: 'fadeInUp 0.35s ease' }}>
              {WEEK_ORDER.map(dow => {
                const stats = bias.allDowStats[dow];
                if (!stats || stats.total === 0) return null;
                return (
                  <div key={stats.day} className="panel" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div className="section-title" style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <IconBarChart size={14} color="var(--accent)" />
                        <span>{stats.dayName}</span>
                        {stats.day === todayDow && <span className="today-chip">Today</span>}
                      </div>
                      <div className={`dow-bias-badge badge-${biasColor(stats.bias)}`}>
                        {stats.bullishRate.toFixed(0)}% Bull
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Histogram of returns ({stats.total} samples, -6% to +6%)
                    </div>
                    <DistributionChart returns={stats.returns} />
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-left">
              <IconWolf size={18} color="var(--wolf-yellow)" />
              <span>Wolf Tape Read &middot; Trading The Tape, With Precision &middot; Data from Jan 2021</span>
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
