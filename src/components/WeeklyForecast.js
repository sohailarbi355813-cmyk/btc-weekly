'use client';

import React from 'react';
import {
  IconLayers,
  IconRadar,
  IconCalendar,
  IconTrophy,
  IconTarget,
  IconSparkles,
  IconTrendUp,
  IconTrendDown,
  IconScale,
} from '@/components/Icons';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon through Sun

function formatPct(n, decimals = 1) {
  if (n === undefined || n === null) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(decimals)}%`;
}

function biasColor(bias) {
  return bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral';
}

function defaultFormatPrice(n) {
  if (!n) return '--';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function WeeklyForecast({ weekPattern, formatPrice = defaultFormatPrice }) {
  if (!weekPattern) {
    return (
      <div className="no-data-msg" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <IconRadar size={28} color="#38bdf8" className="spin-icon" />
        <span style={{ fontFamily: 'var(--font-mono)', color: '#888888' }}>
          Calibrating 300+ historical weekly sequence trajectories...
        </span>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeInUp 0.35s ease' }}>
      {/* ── 1. Current Week Timeline ── */}
      <div className="section-header" style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconLayers size={18} color="#38bdf8" />
          <span>This Week&apos;s Running Sequence</span>
        </div>
        <div className="section-subtitle" style={{ color: '#888888', fontSize: '0.78rem' }}>
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

      {/* ── 2. Pattern Description ── */}
      {weekPattern.currentPattern && (
        <div className="pattern-desc" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div className="pattern-desc-icon" style={{ background: 'rgba(56, 189, 248, 0.1)', padding: 8, borderRadius: 6 }}>
            <IconRadar size={18} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
            <strong style={{ color: '#38bdf8' }}>Current Week Trajectory:</strong> {weekPattern.currentPattern}.<br />
            Matched against <span style={{ color: '#ffffff', fontWeight: 600 }}>{weekPattern.totalMatchesFound}</span> statistically analogous weeks from Jan 2021 to now.
          </div>
        </div>
      )}

      {/* ── 3. Match Count Badges ── */}
      <div className="match-count-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        <div className="match-badge" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#080808', border: '1px solid #1c1c1c', padding: '6px 12px', borderRadius: 6, fontSize: '0.74rem', color: '#aaaaaa' }}>
          <IconCalendar size={13} color="#38bdf8" />
          <span><span className="badge-num" style={{ color: '#ffffff', fontWeight: 700 }}>{weekPattern.totalMatchesFound}</span> matching weeks found</span>
        </div>
        <div className="match-badge" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#080808', border: '1px solid #1c1c1c', padding: '6px 12px', borderRadius: 6, fontSize: '0.74rem', color: '#aaaaaa' }}>
          <IconTrophy size={13} color="#38bdf8" />
          <span>Top <span className="badge-num" style={{ color: '#ffffff', fontWeight: 700 }}>{weekPattern.topMatches.length}</span> highest correlation</span>
        </div>
        <div className="match-badge" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#080808', border: '1px solid #1c1c1c', padding: '6px 12px', borderRadius: 6, fontSize: '0.74rem', color: '#aaaaaa' }}>
          <IconTarget size={13} color="#22c55e" />
          <span>Similarity threshold: <span className="badge-num" style={{ color: '#22c55e', fontWeight: 700 }}>25%+</span></span>
        </div>
      </div>

      {/* ── 4. Current Week Predictions / Weekly Forecast ── */}
      <div className="panel" style={{ background: '#000000', border: '1px solid #1a1a1a', borderRadius: 10, padding: 20, marginBottom: 28 }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <IconTarget size={18} color="#38bdf8" />
          <span>Historical Sequence Forecast (This Week)</span>
        </div>
        <div className="section-subtitle" style={{ color: '#888888', fontSize: '0.78rem', marginBottom: 20 }}>
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

      {/* ── 5. Top Analogous Historical Weeks ── */}
      {weekPattern.topMatches.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.95rem' }}>
            <IconTrophy size={16} color="#38bdf8" />
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
                    <div className="tooltip-row"><span className="tooltip-key">Similarity</span><span className="tooltip-val" style={{ color: '#38bdf8' }}>{Math.round(m.score)}% match</span></div>
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

      {/* ── 6. Subsequent Week Historical Projection (Next Week Forecast) ── */}
      {Object.keys(weekPattern.nextWeekPredictions).length >= 3 && (
        <div className="panel" style={{ background: '#000000', border: '1px solid #1a1a1a', borderRadius: 10, padding: 20, marginBottom: 32 }}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <IconSparkles size={18} color="#38bdf8" />
            <span>Subsequent Week Historical Projection</span>
          </div>
          <div className="section-subtitle" style={{ color: '#888888', fontSize: '0.78rem', marginBottom: 20 }}>
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
    </div>
  );
}
