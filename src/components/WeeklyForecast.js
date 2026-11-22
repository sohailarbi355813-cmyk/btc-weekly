'use client';

import React from 'react';
import WeeklyHighLowMatrix from '@/components/WeeklyHighLowMatrix';
import {
  IconLayers,
  IconRadar,
  IconCalendar,
  IconTarget,
  IconZap,
  IconAlertTriangle,
  IconTrendUp,
  IconTrendDown,
  IconClock,
  IconShield,
  IconLevels,
} from '@/components/Icons';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon through Sun

const WEEKLY_CYCLE_STAGES = [
  {
    dow: 1,
    name: 'Monday',
    title: 'Range Establishment',
    desc: 'Sets initial Monday High & Low range. Asian session creates reference liquidity.',
    role: 'Range Setter',
  },
  {
    dow: 2,
    name: 'Tuesday',
    title: 'Judas Swing (HOW / LOW)',
    desc: 'Historically forms the High or Low of the Week (~38% probability). Traps breakout traders.',
    role: 'Judas Extreme',
  },
  {
    dow: 3,
    name: 'Wednesday',
    title: 'Midweek Expansion',
    desc: 'Decisive direction established. Tests Monday Midpoint (50% EQ) and drives toward weekly targets.',
    role: 'Trend Expansion',
  },
  {
    dow: 4,
    name: 'Thursday',
    title: 'Trend Continuation',
    desc: 'London & NY sessions deliver secondary volume into opposing liquidity pools.',
    role: 'Continuation',
  },
  {
    dow: 5,
    name: 'Friday',
    title: 'CME Settlement',
    desc: 'CME futures close at 21:00 UTC. Range extension finishes; institutions lock weekly profits.',
    role: 'Weekly Close',
  },
  {
    dow: 6,
    name: 'Saturday',
    title: 'Weekend Drift',
    desc: 'Retail & spot compression. Low volume mean-reversion toward previous day close.',
    role: 'Low Vol Drift',
  },
  {
    dow: 0,
    name: 'Sunday',
    title: 'Weekly Close & CME Gap Prep',
    desc: 'Weekly candle close at 23:59 UTC. Watch for manipulation wicks into Monday open.',
    role: 'Close & Prep',
  },
];

function defaultFormatPrice(n) {
  if (!n) return '--';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(n, decimals = 1) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(decimals)}%`;
}

export default function WeeklyForecast({
  weekPattern,
  weeklyHighLowData,
  selectedWeeklyBias = 'auto',
  onWeeklyBiasChange,
  dowStats2025 = null,
  formatPrice = defaultFormatPrice,
  bias = null,
  currentPrice = null,
}) {
  if (!weekPattern) {
    return (
      <div
        className="no-data-msg"
        style={{
          minHeight: '300px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <IconRadar size={28} color="#38bdf8" className="spin-icon" />
        <span style={{ fontFamily: 'var(--font-mono)', color: '#888888' }}>
          Calibrating Weekly Cycle &amp; Execution Playbook...
        </span>
      </div>
    );
  }

  const spot = currentPrice || bias?.keyLevels?.currentPrice || 0;
  const isBear = bias?.verdict === 'BEARISH' || weeklyHighLowData?.effectiveBias === 'bearish';
  const verdict = isBear ? 'BEARISH' : 'BULLISH';
  const accentColor = isBear ? '#ef4444' : '#22c55e';
  const bgAccent = isBear ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)';
  const borderAccent = isBear ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)';

  const weeklyOpen = bias?.weeklyOpen || 0;
  const pctFromWo = bias?.pctFromWeeklyOpen ?? 0;
  const pwh = bias?.priorWeekLevels?.pwh || 0;
  const pwl = bias?.priorWeekLevels?.pwl || 0;
  const pwm = bias?.priorWeekLevels?.pwm || (pwh && pwl ? (pwh + pwl) / 2 : 0);
  const ema20 = bias?.keyLevels?.ema20 || 0;
  const rsi = bias?.keyLevels?.rsi14 || 0;

  // Determine current cycle phase relative to weekly levels
  let cyclePhase = 'Consolidation inside Weekly Range';
  let phaseDetail = 'Price trading within expected boundaries.';
  if (spot && pwl && spot < pwl) {
    cyclePhase = 'Breakdown Below Prior Week Low (PWL)';
    phaseDetail = `Trading below PWL (${formatPrice(pwl)}). Downward draw on liquidity is active.`;
  } else if (spot && weeklyOpen && spot < weeklyOpen) {
    cyclePhase = 'Below Weekly Open · In Prior Value Area';
    phaseDetail = `Trading below WO (${formatPrice(weeklyOpen)}). Rallies face overhead resistance.`;
  } else if (spot && weeklyOpen && spot > weeklyOpen && pwh && spot < pwh) {
    cyclePhase = 'Above Weekly Open · Bullish Value Expansion';
    phaseDetail = `Trading above WO (${formatPrice(weeklyOpen)}). Targeting Prior Week High (${formatPrice(pwh)}).`;
  } else if (spot && pwh && spot > pwh) {
    cyclePhase = 'Breakout Above Prior Week High (PWH)';
    phaseDetail = `Trading above PWH (${formatPrice(pwh)}). Upward price discovery mode.`;
  }

  const todayDow = weekPattern.todayDow ?? new Date().getUTCDay();

  return (
    <div style={{ animation: 'fadeInUp 0.35s ease' }}>
      {/* ── 1. High / Low of Week Formation Probability (HOW / LOW Proximity) ── */}
      <WeeklyHighLowMatrix
        probData={weeklyHighLowData}
        selectedBias={selectedWeeklyBias}
        onBiasChange={onWeeklyBiasChange}
        formatPrice={formatPrice}
      />

      {/* ── 2. UNIFIED WEEKLY CYCLE TRADING PLAYBOOK (OPTION 2) ── */}
      <div
        className="panel"
        style={{
          background: '#050505',
          border: `1px solid ${borderAccent}`,
          borderRadius: 10,
          padding: '18px',
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top Header: Unified Direction & Phase */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            borderBottom: '1px solid #1a1a1a',
            paddingBottom: 14,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: bgAccent,
                  color: accentColor,
                  border: `1px solid ${borderAccent}`,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                }}
              >
                {verdict === 'BEARISH' ? '↓ INSTITUTIONAL BEARISH PLAYBOOK' : '↑ INSTITUTIONAL BULLISH PLAYBOOK'}
              </span>

              <span
                style={{
                  fontSize: '0.64rem',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: '#0e0e12',
                  color: '#94a3b8',
                  border: '1px solid #22222e',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
              >
                CONVICTION: {bias?.strengthPct || 77}%
              </span>
            </div>

            <div
              style={{
                fontSize: '0.98rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)',
                marginTop: 6,
              }}
            >
              {cyclePhase}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {phaseDetail}
            </div>
          </div>

          {/* Reference Anchor Strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              background: '#09090d',
              border: '1px solid #1c1c24',
              borderRadius: 6,
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
            }}
          >
            <div>
              <span style={{ color: '#64748b' }}>WO: </span>
              <strong style={{ color: spot >= weeklyOpen ? '#4ade80' : '#f87171' }}>
                {formatPrice(weeklyOpen)} ({formatPct(pctFromWo)})
              </strong>
            </div>
            <span style={{ color: '#272730' }}>&middot;</span>
            <div>
              <span style={{ color: '#64748b' }}>PWL: </span>
              <strong style={{ color: spot >= pwl ? '#4ade80' : '#f87171' }}>
                {formatPrice(pwl)}
              </strong>
            </div>
            <span style={{ color: '#272730' }}>&middot;</span>
            <div>
              <span style={{ color: '#64748b' }}>PWH: </span>
              <strong style={{ color: '#e2e8f0' }}>{formatPrice(pwh)}</strong>
            </div>
            {ema20 > 0 && (
              <>
                <span style={{ color: '#272730' }}>&middot;</span>
                <div>
                  <span style={{ color: '#64748b' }}>20 EMA: </span>
                  <strong style={{ color: '#38bdf8' }}>{formatPrice(ema20)}</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3 Actionable Execution Rules */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {/* Card 1: Primary Continuation Plan */}
          <div
            style={{
              background: '#08080c',
              border: `1px solid ${isBear ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
              borderLeft: `3px solid ${accentColor}`,
              borderRadius: 8,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isBear ? <IconTrendDown size={14} color="#f87171" /> : <IconTrendUp size={14} color="#4ade80" />}
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: accentColor, fontFamily: 'var(--font-mono)' }}>
                {isBear ? 'PRIMARY PLAN: SHORT CONTINUATION' : 'PRIMARY PLAN: LONG CONTINUATION'}
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.45 }}>
              {isBear ? (
                <>
                  Watch for <strong>retest &amp; rejection</strong> around broken PWL (<strong>{formatPrice(pwl)}</strong>) or Weekly Open (<strong>{formatPrice(weeklyOpen)}</strong>).
                </>
              ) : (
                <>
                  Watch for <strong>pullback &amp; defense</strong> at Weekly Open (<strong>{formatPrice(weeklyOpen)}</strong>) or Monday Midpoint.
                </>
              )}
            </div>

            <div
              style={{
                fontSize: '0.70rem',
                color: 'var(--text-muted)',
                background: '#040406',
                padding: '8px 10px',
                borderRadius: 5,
                border: '1px solid #1a1a22',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Target Draw on Liquidity:</div>
              <div style={{ color: accentColor, fontWeight: 800 }}>
                {isBear
                  ? `Next Major Support Zone: ${formatPrice(pwl ? Math.round(pwl * 0.96) : 59500)} – ${formatPrice(pwl ? Math.round(pwl * 0.94) : 58200)}`
                  : `Next Major Target: ${formatPrice(pwh || 75000)} (Prior Week High)`}
              </div>
            </div>
          </div>

          {/* Card 2: Bullish Reclaim & Invalidation Plan */}
          <div
            style={{
              background: '#08080c',
              border: '1px solid #1e1e28',
              borderLeft: '3px solid #38bdf8',
              borderRadius: 8,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconShield size={14} color="#38bdf8" />
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                {isBear ? 'COUNTER-TREND RECLAIM TRIGGER' : 'BEARISH BREAKDOWN TRIGGER'}
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.45 }}>
              {isBear ? (
                <>
                  <strong>Do NOT long lower low sweeps blindly.</strong> Longs only become high-probability after a confirmed <strong>1H/4H candle close above {formatPrice(pwl)}</strong> (PWL) with bullish market structure shift.
                </>
              ) : (
                <>
                  <strong>Do NOT short blindly.</strong> Shorts only trigger if price decisively breaks and accepts below <strong>{formatPrice(weeklyOpen)}</strong> (WO).
                </>
              )}
            </div>

            <div
              style={{
                fontSize: '0.70rem',
                color: 'var(--text-muted)',
                background: '#040406',
                padding: '8px 10px',
                borderRadius: 5,
                border: '1px solid #1a1a22',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Hard Invalidation Level:</div>
              <div style={{ color: '#38bdf8', fontWeight: 800 }}>
                {isBear
                  ? `Decisive 4H close above ${formatPrice(weeklyOpen)} (WO) fully cancels the bearish bias.`
                  : `Decisive 4H close below ${formatPrice(pwl || weeklyOpen)} cancels the bullish bias.`}
              </div>
            </div>
          </div>

          {/* Card 3: Trap Awareness & Cycle Context */}
          <div
            style={{
              background: '#08080c',
              border: '1px solid #1e1e28',
              borderLeft: '3px solid #eab308',
              borderRadius: 8,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconAlertTriangle size={14} color="#eab308" />
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#eab308', fontFamily: 'var(--font-mono)' }}>
                TRAP AWARENESS &amp; MOMENTUM
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.45 }}>
              {rsi > 0 && rsi <= 30 ? (
                <>
                  Daily RSI is <strong>washed out at {rsi} (Oversold)</strong>. Chasing fresh breakout shorts at the very bottom carries high trap risk. Wait for relief bounces into resistance.
                </>
              ) : rsi >= 70 ? (
                <>
                  Daily RSI is <strong>overextended at {rsi} (Overbought)</strong>. Beware buying the absolute top; wait for dips into support.
                </>
              ) : (
                <>
                  Daily RSI is <strong>neutral at {rsi}</strong>. Momentum is following primary trend structure without extreme divergence.
                </>
              )}
            </div>

            <div
              style={{
                fontSize: '0.70rem',
                color: 'var(--text-muted)',
                background: '#040406',
                padding: '8px 10px',
                borderRadius: 5,
                border: '1px solid #1a1a22',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Weekly Cycle Status:</div>
              <div style={{ color: '#facc15', fontWeight: 800 }}>
                {todayDow === 0 || todayDow === 6
                  ? 'Weekend Liquidity Compression — Watch Sunday 23:59 UTC close & CME Gap setup.'
                  : todayDow === 2
                  ? 'Tuesday Judas Swing Active — Extreme of Week Formation window.'
                  : 'Weekly Range Expansion Active — Trade with institutional trend delivery.'}
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. The 5-Stage Institutional Weekly Lifecycle Roadmap ── */}
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconClock size={14} color="#38bdf8" />
              <span style={{ fontSize: '0.74rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                INSTITUTIONAL WEEKLY CYCLE ROADMAP
              </span>
            </div>
            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              How smart money typically unfolds the week
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
              gap: 8,
            }}
          >
            {WEEKLY_CYCLE_STAGES.map((st) => {
              const isToday = st.dow === todayDow;
              return (
                <div
                  key={st.dow}
                  style={{
                    background: isToday ? 'rgba(56, 189, 248, 0.12)' : '#08080b',
                    border: `1px solid ${isToday ? '#38bdf8' : '#1a1a22'}`,
                    borderRadius: 6,
                    padding: '10px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    position: 'relative',
                  }}
                >
                  {isToday && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 6,
                        fontSize: '0.50rem',
                        fontWeight: 900,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: '#38bdf8',
                        color: '#000000',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      TODAY
                    </span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.70rem', fontWeight: 800, color: isToday ? '#38bdf8' : '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                      {st.name}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: isToday ? '#ffffff' : '#94a3b8' }}>
                    {st.title}
                  </div>

                  <div style={{ fontSize: '0.58rem', color: '#64748b', lineHeight: 1.35, marginTop: 2 }}>
                    {st.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 4. Current Week Realized Sequence ── */}
      <div className="section-header" style={{ marginBottom: 12 }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconLayers size={16} color="#38bdf8" />
          <span>This Week&apos;s Realized Performance</span>
        </div>
        <div className="section-subtitle" style={{ color: '#888888', fontSize: '0.76rem' }}>
          Daily candle returns and structural roles this week
        </div>
      </div>

      <div className="week-timeline" style={{ marginBottom: 24 }}>
        {WEEK_ORDER.map((dow) => {
          const dayData = weekPattern.currentWeek?.days[dow];
          const isClosed = weekPattern.closedDows?.includes(dow);
          const isToday = dow === todayDow;
          const isFuture = weekPattern.futureDows?.includes(dow);
          const bull = dayData?.bullish;
          const stageInfo = WEEKLY_CYCLE_STAGES.find((s) => s.dow === dow);

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
                    {dayData.return > 0 ? '+' : ''}
                    {dayData.return.toFixed(2)}%
                  </div>
                  <div className="week-day-prices">
                    O: {formatPrice(dayData.open)}
                    <br />
                    C: {formatPrice(dayData.close)}
                  </div>
                  <div style={{ fontSize: '0.54rem', color: '#94a3b8', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                    {stageInfo?.role || ''}
                  </div>
                </>
              ) : (
                <>
                  <div className="week-day-future-label">Upcoming</div>
                  <div style={{ fontSize: '0.54rem', color: '#64748b', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                    {stageInfo?.role || ''}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
