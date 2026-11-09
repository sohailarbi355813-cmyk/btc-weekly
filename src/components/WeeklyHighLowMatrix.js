'use client';

import React, { useState } from 'react';
import {
  IconRadar,
  IconTrendUp,
  IconTrendDown,
  IconClock,
  IconTarget,
  IconScale,
  IconCheck,
  IconAlertTriangle,
} from '@/components/Icons';

export default function WeeklyHighLowMatrix({
  probData,
  selectedBias,
  onBiasChange,
  formatPrice,
}) {
  const [activeMetricTab, setActiveMetricTab] = useState('high'); // 'high' | 'low'

  if (!probData) {
    return (
      <div style={{
        background: '#070707',
        border: '1px solid #1a1a1a',
        borderRadius: 8,
        padding: '24px',
        textAlign: 'center',
        color: '#666',
        fontFamily: 'var(--font-mono)'
      }}>
        <IconRadar size={22} color="#38bdf8" className="spin-icon" style={{ margin: '0 auto 8px' }} />
        Calibrating Weekly High/Low Historical Probabilities...
      </div>
    );
  }

  const {
    effectiveBias,
    cohortLabel,
    sampleSize,
    totalCompletedWeeks,
    currentWeek,
    highMetrics,
    lowMetrics,
    matchedStats,
  } = probData;

  const isBearModel = effectiveBias === 'bearish';
  const isBullModel = effectiveBias === 'bullish';

  const activeMetrics = activeMetricTab === 'high' ? highMetrics : lowMetrics;
  const isHighTab = activeMetricTab === 'high';

  // Sample percentage of total weeks
  const samplePct = Math.round((sampleSize / totalCompletedWeeks) * 100);

  return (
    <div style={{
      background: '#050505',
      border: '1px solid #1c1c1c',
      borderRadius: 10,
      padding: '16px 18px',
      position: 'relative',
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      {/* Top Ambient Glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '20%',
        right: '20%',
        height: 1,
        background: isBearModel
          ? 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.4), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.4), transparent)',
      }} />

      {/* Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        borderBottom: '1px solid #171717',
        paddingBottom: 14,
        marginBottom: 14,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isBearModel ? '#ef4444' : '#22c55e',
              boxShadow: isBearModel ? '0 0 8px #ef4444' : '0 0 8px #22c55e',
            }} />
            <span style={{
              fontSize: '0.86rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#ffffff',
              fontFamily: 'var(--font-mono)'
            }}>
              Weekly High / Low Proximity &amp; Timing Matrix
            </span>
          </div>
          <div style={{ fontSize: '0.70rem', color: '#777777', marginTop: 3 }}>
            Based on <strong style={{ color: '#ffffff' }}>{sampleSize} {cohortLabel}</strong> ({samplePct}% of {totalCompletedWeeks} completed historical weeks since Jan 2021)
          </div>
        </div>

        {/* Bias Selector Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0a0a0a', padding: 3, borderRadius: 6, border: '1px solid #222' }}>
          <button
            onClick={() => onBiasChange('bearish')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: selectedBias === 'bearish' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: selectedBias === 'bearish' ? '#f87171' : '#666',
              border: selectedBias === 'bearish' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <IconTrendDown size={11} /> Bearish Model
          </button>

          <button
            onClick={() => onBiasChange('bullish')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: selectedBias === 'bullish' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              color: selectedBias === 'bullish' ? '#4ade80' : '#666',
              border: selectedBias === 'bullish' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <IconTrendUp size={11} /> Bullish Model
          </button>

          <button
            onClick={() => onBiasChange('auto')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              background: selectedBias === 'auto' ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
              color: selectedBias === 'auto' ? '#38bdf8' : '#666',
              border: selectedBias === 'auto' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
              cursor: 'pointer',
            }}
            title="Auto-detect based on live price vs Weekly Open"
          >
            Auto ({effectiveBias.toUpperCase()})
          </button>
        </div>
      </div>

      {/* Target Toggle: The High vs The Low */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 14,
        background: '#090909',
        padding: 4,
        borderRadius: 6,
        border: '1px solid #171717'
      }}>
        <button
          onClick={() => setActiveMetricTab('high')}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 4,
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            cursor: 'pointer',
            background: isHighTab ? '#161616' : 'transparent',
            color: isHighTab ? (isBearModel ? '#f87171' : '#38bdf8') : '#666',
            border: isHighTab ? '1px solid #282828' : '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <IconTarget size={13} />
          <span>THE HIGH (HOW) &middot; {highMetrics.probabilityIsIn}% Chance IN</span>
        </button>

        <button
          onClick={() => setActiveMetricTab('low')}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 4,
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            cursor: 'pointer',
            background: !isHighTab ? '#161616' : 'transparent',
            color: !isHighTab ? '#4ade80' : '#666',
            border: !isHighTab ? '1px solid #282828' : '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <IconTarget size={13} />
          <span>THE LOW (LOW) &middot; {lowMetrics.probabilityIsIn}% Chance IN</span>
        </button>
      </div>

      {/* Main Grid: Probability Dial & Core Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        {/* Left Card: Core Probability & Verdict */}
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: '0.68rem',
              color: '#888',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase'
            }}>
              <span>{isHighTab ? 'High of Week (HOW)' : 'Low of Week (LOW)'} Formation Status</span>
              <span style={{
                color: activeMetrics.probabilityIsIn >= 60 ? '#4ade80' : '#fbbf24',
                fontWeight: 700
              }}>
                {activeMetrics.verdictText}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: '2.1rem',
                fontWeight: 900,
                color: isHighTab
                  ? (activeMetrics.probabilityIsIn >= 55 ? '#f87171' : '#38bdf8')
                  : (activeMetrics.probabilityIsIn >= 55 ? '#4ade80' : '#fbbf24'),
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
              }}>
                {activeMetrics.probabilityIsIn}%
              </span>
              <span style={{ fontSize: '0.82rem', color: '#aaa', fontWeight: 600 }}>
                Chance {isHighTab ? 'High' : 'Low'} is already IN
              </span>
            </div>

            {/* Visual Probability Bar */}
            <div style={{
              width: '100%',
              height: 6,
              background: '#1a1a1a',
              borderRadius: 3,
              overflow: 'hidden',
              marginBottom: 10,
            }}>
              <div style={{
                width: `${activeMetrics.probabilityIsIn}%`,
                height: '100%',
                background: isHighTab
                  ? (activeMetrics.probabilityIsIn >= 55 ? 'linear-gradient(90deg, #38bdf8, #f87171)' : '#38bdf8')
                  : 'linear-gradient(90deg, #38bdf8, #4ade80)',
                borderRadius: 3,
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          {/* Current vs Historical Target */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            paddingTop: 10,
            borderTop: '1px solid #141414',
            fontSize: '0.70rem',
            fontFamily: 'var(--font-mono)',
          }}>
            <div>
              <span style={{ color: '#777', textTransform: 'uppercase' }}>Current Week {isHighTab ? 'High' : 'Low'}:</span>
              <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.88rem' }}>
                {formatPrice(isHighTab ? currentWeek.high : currentWeek.low)}
                <span style={{ fontSize: '0.66rem', color: isHighTab ? '#f87171' : '#4ade80', marginLeft: 4 }}>
                  ({isHighTab ? `+${currentWeek.highPct}%` : `-${currentWeek.lowPct}%`})
                </span>
              </div>
              <div style={{ color: '#555', fontSize: '0.62rem' }}>Formed on {isHighTab ? currentWeek.highDayName : currentWeek.lowDayName}</div>
            </div>

            <div>
              <span style={{ color: '#777', textTransform: 'uppercase' }}>Typical {effectiveBias.toUpperCase()} Target:</span>
              <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.88rem' }}>
                {formatPrice(activeMetrics.projectedTarget)}
                <span style={{ fontSize: '0.66rem', color: '#888', marginLeft: 4 }}>
                  ({isHighTab ? `+${activeMetrics.medianPct}%` : `-${activeMetrics.medianPct}%`})
                </span>
              </div>
              <div style={{ color: '#555', fontSize: '0.62rem' }}>Max (75th%): {formatPrice(activeMetrics.projectedMax)}</div>
            </div>
          </div>
        </div>

        {/* Right Card: The 3 Core Statistical Proof Bullets (Exactly like Jip's Post) */}
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-around',
          gap: 10,
        }}>
          {/* Bullet 1: Matched Pattern Timing vs Cohort */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: '#151515',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              flexShrink: 0,
              marginTop: 1,
            }}>
              <IconClock size={13} />
            </div>
            <div>
              <div style={{ fontSize: '0.80rem', color: '#e5e5e5', lineHeight: 1.35 }}>
                {matchedStats ? (
                  <>
                    <strong style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      {isHighTab ? matchedStats.highsInByNowPct : matchedStats.lowsInByNowPct}%
                    </strong> ({isHighTab ? matchedStats.highsInByNowCount : matchedStats.lowsInByNowCount} of {matchedStats.totalMatched} matched weeks) had the {isHighTab ? 'high' : 'low'} in by <strong style={{ color: '#38bdf8' }}>{currentWeek.currentDayName}</strong>
                  </>
                ) : (
                  <>
                    <strong style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{activeMetrics.pctInByNow}%</strong> of {effectiveBias} weeks had the {isHighTab ? 'high' : 'low'} in by <strong style={{ color: '#38bdf8' }}>{currentWeek.currentDayName}</strong>
                  </>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: 4, lineHeight: 1.35 }}>
                {matchedStats ? (
                  <>
                    <strong style={{ color: '#38bdf8' }}>Dominant {isHighTab ? 'High' : 'Low'} Day:</strong> <strong style={{ color: isHighTab ? '#f87171' : '#4ade80' }}>{isHighTab ? matchedStats.peakHighDay : matchedStats.peakLowDay}</strong> &mdash; <strong>{isHighTab ? matchedStats.peakHighCount : matchedStats.peakLowCount} of {matchedStats.totalMatched} weeks ({isHighTab ? matchedStats.peakHighPct : matchedStats.peakLowPct}%)</strong> set their {isHighTab ? 'high' : 'low'} on {isHighTab ? matchedStats.peakHighDay : matchedStats.peakLowDay} (avg extension {isHighTab ? `+${matchedStats.avgHighExt}%` : `-${matchedStats.avgLowExt}%`})
                  </>
                ) : (
                  <>{activeMetrics.pctInLater}% of {effectiveBias} weeks put the {isHighTab ? 'high' : 'low'} in later in the week</>
                )}
              </div>
            </div>
          </div>

          {/* Bullet 2: Subsequent Week Follow-Through Scan */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: '#151515',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: matchedStats?.subsequent?.bias === 'BEARISH' ? '#f87171' : '#4ade80',
              flexShrink: 0,
              marginTop: 1,
            }}>
              <IconScale size={13} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#e5e5e5', lineHeight: 1.3 }}>
                {matchedStats?.subsequent ? (
                  <>
                    Subsequent Week Scan: <strong style={{ color: matchedStats.subsequent.bias === 'BEARISH' ? '#f87171' : '#4ade80', fontFamily: 'var(--font-mono)' }}>
                      {matchedStats.subsequent.biasRate}% {matchedStats.subsequent.bias}
                    </strong>
                  </>
                ) : (
                  <>
                    <strong style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      {isHighTab ? activeMetrics.pctFurtherAboveOpen : activeMetrics.pctFurtherBelowOpen}%
                    </strong> of {effectiveBias} weeks put {isHighTab ? 'high further above' : 'low further below'} open
                  </>
                )}
              </div>
              <div style={{ fontSize: '0.66rem', color: '#777', marginTop: 2 }}>
                {matchedStats?.subsequent ? (
                  <>Across {matchedStats.subsequent.total} matching sequence weeks, next week averaged <strong style={{ color: '#aaa' }}>{matchedStats.subsequent.avgReturn > 0 ? '+' : ''}{matchedStats.subsequent.avgReturn}%</strong> return.</>
                ) : (
                  <>Median extension is {isHighTab ? `+${activeMetrics.medianPct}%` : `-${activeMetrics.medianPct}%`} (Current: {isHighTab ? `+${currentWeek.highPct}%` : `-${currentWeek.lowPct}%`})</>
                )}
              </div>
            </div>
          </div>

          {/* Bullet 3: Definitive Actionable Verdict (Zero Duality) */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: '#151515',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: effectiveBias === 'bearish' ? '#f87171' : '#4ade80',
              flexShrink: 0,
              marginTop: 1,
            }}>
              <IconCheck size={13} />
            </div>
            <div>
              <div style={{ fontSize: '0.76rem', color: '#e5e5e5', lineHeight: 1.3 }}>
                {effectiveBias === 'bearish' ? (
                  <>Institutional bias is <strong style={{ color: '#f87171' }}>BEARISH</strong>. Structure favors short positioning with downside target toward <strong style={{ color: '#ffffff' }}>{formatPrice(activeMetrics.projectedTarget)}</strong>.</>
                ) : (
                  <>Institutional bias is <strong style={{ color: '#4ade80' }}>BULLISH</strong>. Structure favors accumulation with expansion target toward <strong style={{ color: '#ffffff' }}>{formatPrice(activeMetrics.projectedTarget)}</strong>.</>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
