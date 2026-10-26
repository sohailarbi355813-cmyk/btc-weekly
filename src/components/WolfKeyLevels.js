'use client';

import { useState, useMemo } from 'react';
import { IconWolf, IconLevels, IconTrendUp, IconTrendDown } from '@/components/Icons';

export default function WolfKeyLevels({ levelsData }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'daily' | 'weekly' | 'monthly'

  if (!levelsData) return null;

  const {
    spot,
    utcDate,
    ladder,
    nearestResistance,
    nearestSupport,
    dayRange,
    weeklyStats,
    monthlyStats,
    previousWeekStats,
    previousMonthStats,
    sigmas,
  } = levelsData;

  // Filter ladder rows while always preserving the LAST row
  const filteredLadder = useMemo(() => {
    if (filter === 'all') return ladder;
    return ladder.filter(row => row.isLast || row.category === filter || (filter === 'monthly' && row.category === 'yearly'));
  }, [ladder, filter]);

  return (
    <div className="wolf-container" style={{ animation: 'fadeInUp 0.4s ease' }}>
      <div className="wolf-glow-bar" />

      <div className="wolf-layout">
        {/* Left Column: Big Price & Spot Info */}
        <div className="wolf-left-panel">
          <div>
            <div className="wolf-brand-row">
              <div className="wolf-brand-title">
                WOLF<span className="wolf-cursor" />
              </div>
              <div className="wolf-tag-badge">[ KEY LEVELS ]</div>
            </div>

            <div className="wolf-main-heading">btc levels</div>
            <div className="wolf-big-price">
              {Number(spot).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </div>
            <div className="wolf-price-sub">BTCUSDT perpetual, last price</div>

            {/* Quick Targets */}
            <div className="wolf-targets-grid">
              <div className="wolf-target-card res">
                <div className="wolf-target-label">
                  <span>Next Resistance</span>
                  <span style={{ color: 'var(--wolf-yellow-bright)' }}>{nearestResistance?.code || 'None'}</span>
                </div>
                <div className="wolf-target-val">
                  {nearestResistance ? `$${Number(nearestResistance.price).toLocaleString('en-US', { minimumFractionDigits: 1 })}` : 'All-time High'}
                </div>
                <div className="wolf-target-diff pos">
                  {nearestResistance ? `+${Math.abs(nearestResistance.pctDiff).toFixed(2)}% (+$${Math.abs(nearestResistance.diff).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}
                </div>
              </div>

              <div className="wolf-target-card sup">
                <div className="wolf-target-label">
                  <span>Next Support</span>
                  <span style={{ color: 'var(--wolf-yellow)' }}>{nearestSupport?.code || 'None'}</span>
                </div>
                <div className="wolf-target-val">
                  {nearestSupport ? `$${Number(nearestSupport.price).toLocaleString('en-US', { minimumFractionDigits: 1 })}` : '--'}
                </div>
                <div className="wolf-target-diff neg">
                  {nearestSupport ? `-${Math.abs(nearestSupport.pctDiff).toFixed(2)}% (-$${Math.abs(nearestSupport.diff).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}
                </div>
              </div>
            </div>

            {/* Previous Week Value Area & Range (PW VAL · PW POC · PW VAH · PWH · PWL) */}
            {previousWeekStats && (
              <div className="wolf-va-card weekly-card">
                <div className="wolf-va-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="wolf-va-title weekly">Prev Week Value Area</span>
                    <span className="wolf-va-status-pill" style={{
                      background: previousWeekStats.valStatus === 'ABOVE_VAH' ? 'rgba(34, 197, 94, 0.15)' : previousWeekStats.valStatus === 'BELOW_VAL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: previousWeekStats.valStatus === 'ABOVE_VAH' ? '#4ade80' : previousWeekStats.valStatus === 'BELOW_VAL' ? '#f87171' : '#38bdf8',
                      border: `1px solid ${previousWeekStats.valStatus === 'ABOVE_VAH' ? 'rgba(34, 197, 94, 0.3)' : previousWeekStats.valStatus === 'BELOW_VAL' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                    }}>
                      {previousWeekStats.valStatus === 'ABOVE_VAH' ? 'Above PW VAH (Expansion)' : previousWeekStats.valStatus === 'BELOW_VAL' ? 'Below PW VAL (Expansion)' : 'Inside PW VA (Rotation)'}
                    </span>
                  </div>
                  <span className="wolf-va-range-badge">
                    R: ${Number(previousWeekStats.range).toLocaleString('en-US', { maximumFractionDigits: 0 })} ({previousWeekStats.rangePct}%)
                  </span>
                </div>

                {/* 3 Value Area Nodes: PW VAL, PW POC, PW VAH */}
                <div className="wolf-va-grid">
                  <div className="wolf-va-box">
                    <div className="wolf-va-box-lbl">PW VAL (Value Low)</div>
                    <div className="wolf-va-box-val">${Number(previousWeekStats.PW_VAL).toLocaleString('en-US', { minimumFractionDigits: 1 })}</div>
                    <div className={`wolf-va-box-diff ${previousWeekStats.pctFromVAL >= 0 ? 'pos' : 'neg'}`}>
                      {previousWeekStats.pctFromVAL >= 0 ? '+' : ''}{previousWeekStats.pctFromVAL}%
                    </div>
                  </div>

                  <div className="wolf-va-box poc">
                    <div className="wolf-va-box-lbl" style={{ color: 'var(--wolf-yellow-bright)' }}>PW POC (Control)</div>
                    <div className="wolf-va-box-val" style={{ color: 'var(--wolf-yellow-bright)' }}>${Number(previousWeekStats.PW_POC).toLocaleString('en-US', { minimumFractionDigits: 1 })}</div>
                    <div className={`wolf-va-box-diff ${previousWeekStats.pctFromPOC >= 0 ? 'pos' : 'neg'}`}>
                      {previousWeekStats.pctFromPOC >= 0 ? '+' : ''}{previousWeekStats.pctFromPOC}%
                    </div>
                  </div>

                  <div className="wolf-va-box">
                    <div className="wolf-va-box-lbl">PW VAH (Value High)</div>
                    <div className="wolf-va-box-val">${Number(previousWeekStats.PW_VAH).toLocaleString('en-US', { minimumFractionDigits: 1 })}</div>
                    <div className={`wolf-va-box-diff ${previousWeekStats.pctFromVAH >= 0 ? 'pos' : 'neg'}`}>
                      {previousWeekStats.pctFromVAH >= 0 ? '+' : ''}{previousWeekStats.pctFromVAH}%
                    </div>
                  </div>
                </div>

                {/* Range Extremes: PWL & PWH */}
                <div className="wolf-va-extremes">
                  <span>PWL: <strong style={{ color: '#fff' }}>${Number(previousWeekStats.PWL).toLocaleString('en-US', { minimumFractionDigits: 1 })}</strong> ({previousWeekStats.pctFromPWL >= 0 ? '+' : ''}{previousWeekStats.pctFromPWL}%)</span>
                  <span>PWH: <strong style={{ color: '#fff' }}>${Number(previousWeekStats.PWH).toLocaleString('en-US', { minimumFractionDigits: 1 })}</strong> ({previousWeekStats.pctFromPWH >= 0 ? '+' : ''}{previousWeekStats.pctFromPWH}%)</span>
                </div>

                {/* Progress Bar within Range */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', position: 'relative', marginTop: 6 }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${previousWeekStats.positionPct}%`,
                    background: 'linear-gradient(90deg, #ef4444, #38bdf8)',
                    borderRadius: 99,
                  }} />
                </div>
              </div>
            )}

            {/* Previous Month Value Area & Range (PM VAL · PM POC · PM VAH · PMH · PML) */}
            {previousMonthStats && (
              <div className="wolf-va-card monthly-card">
                <div className="wolf-va-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="wolf-va-title monthly">Prev Month Value Area</span>
                    <span className="wolf-va-status-pill" style={{
                      background: previousMonthStats.valStatus === 'ABOVE_VAH' ? 'rgba(34, 197, 94, 0.15)' : previousMonthStats.valStatus === 'BELOW_VAL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                      color: previousMonthStats.valStatus === 'ABOVE_VAH' ? '#4ade80' : previousMonthStats.valStatus === 'BELOW_VAL' ? '#f87171' : '#c084fc',
                      border: `1px solid ${previousMonthStats.valStatus === 'ABOVE_VAH' ? 'rgba(34, 197, 94, 0.3)' : previousMonthStats.valStatus === 'BELOW_VAL' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
                    }}>
                      {previousMonthStats.valStatus === 'ABOVE_VAH' ? 'Above PM VAH (Macro Expansion)' : previousMonthStats.valStatus === 'BELOW_VAL' ? 'Below PM VAL (Macro Expansion)' : 'Inside PM VA (Macro Rotation)'}
                    </span>
                  </div>
                  <span className="wolf-va-range-badge">
                    R: ${Number(previousMonthStats.range).toLocaleString('en-US', { maximumFractionDigits: 0 })} ({previousMonthStats.rangePct}%)
                  </span>
                </div>

                {/* 3 Value Area Nodes: PM VAL, PM POC, PM VAH */}
                <div className="wolf-va-grid">
                  <div className="wolf-va-box">
                    <div className="wolf-va-box-lbl">PM VAL (Value Low)</div>
                    <div className="wolf-va-box-val">${Number(previousMonthStats.PM_VAL).toLocaleString('en-US', { minimumFractionDigits: 1 })}</div>
                    <div className={`wolf-va-box-diff ${previousMonthStats.pctFromVAL >= 0 ? 'pos' : 'neg'}`}>
                      {previousMonthStats.pctFromVAL >= 0 ? '+' : ''}{previousMonthStats.pctFromVAL}%
                    </div>
                  </div>

                  <div className="wolf-va-box poc monthly">
                    <div className="wolf-va-box-lbl" style={{ color: '#c084fc' }}>PM POC (Control)</div>
                    <div className="wolf-va-box-val" style={{ color: '#c084fc' }}>${Number(previousMonthStats.PM_POC).toLocaleString('en-US', { minimumFractionDigits: 1 })}</div>
                    <div className={`wolf-va-box-diff ${previousMonthStats.pctFromPOC >= 0 ? 'pos' : 'neg'}`}>
                      {previousMonthStats.pctFromPOC >= 0 ? '+' : ''}{previousMonthStats.pctFromPOC}%
                    </div>
                  </div>

                  <div className="wolf-va-box">
                    <div className="wolf-va-box-lbl">PM VAH (Value High)</div>
                    <div className="wolf-va-box-val">${Number(previousMonthStats.PM_VAH).toLocaleString('en-US', { minimumFractionDigits: 1 })}</div>
                    <div className={`wolf-va-box-diff ${previousMonthStats.pctFromVAH >= 0 ? 'pos' : 'neg'}`}>
                      {previousMonthStats.pctFromVAH >= 0 ? '+' : ''}{previousMonthStats.pctFromVAH}%
                    </div>
                  </div>
                </div>

                {/* Range Extremes: PML & PMH */}
                <div className="wolf-va-extremes">
                  <span>PML: <strong style={{ color: '#fff' }}>${Number(previousMonthStats.PML).toLocaleString('en-US', { minimumFractionDigits: 1 })}</strong> ({previousMonthStats.pctFromPML >= 0 ? '+' : ''}{previousMonthStats.pctFromPML}%)</span>
                  <span>PMH: <strong style={{ color: '#fff' }}>${Number(previousMonthStats.PMH).toLocaleString('en-US', { minimumFractionDigits: 1 })}</strong> ({previousMonthStats.pctFromPMH >= 0 ? '+' : ''}{previousMonthStats.pctFromPMH}%)</span>
                </div>

                {/* Progress Bar within Range */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', position: 'relative', marginTop: 6 }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${previousMonthStats.positionPct}%`,
                    background: 'linear-gradient(90deg, #ef4444, #a855f7)',
                    borderRadius: 99,
                  }} />
                </div>
              </div>
            )}

            {/* Range & Anchor Context + Sigma Volatility */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Weekly Open Anchor</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: weeklyStats.status === 'ABOVE_WO' ? 'var(--wolf-yellow-bright)' : 'var(--wolf-support)', fontWeight: 600 }}>
                  {weeklyStats.pctFromWO >= 0 ? '+' : ''}{weeklyStats.pctFromWO}% vs WO (${Number(weeklyStats.WO).toLocaleString('en-US', { maximumFractionDigits: 0 })})
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Monthly Open Anchor</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: monthlyStats.status === 'ABOVE_MO' ? 'var(--wolf-yellow-bright)' : 'var(--wolf-support)', fontWeight: 600 }}>
                  {monthlyStats.pctFromMO >= 0 ? '+' : ''}{monthlyStats.pctFromMO}% vs MO (${Number(monthlyStats.MO).toLocaleString('en-US', { maximumFractionDigits: 0 })})
                </span>
              </div>
              {sigmas && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '8px 10px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                  <span style={{ color: '#38bdf8', display: 'block', marginBottom: 2, fontWeight: 700 }}>Daily Sigma (±{sigmas.dailyStdDevPct}%)</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                    Z: {sigmas.zScoreText} ({sigmas.statusShort})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="wolf-filter-row">
            {[
              { id: 'all', label: 'All Levels', short: 'All Levels' },
              { id: 'daily', label: 'Daily (PDH/L, DO, pPOC/VA)', short: 'Daily' },
              { id: 'weekly', label: 'Weekly (WO, PW VAL/POC/VAH, PWH/L)', short: 'Weekly' },
              { id: 'monthly', label: 'Monthly & Yearly (MO, PM VAL/POC/VAH, PMH/L, YO)', short: 'Monthly/Yearly' },
            ].map(f => (
              <button
                key={f.id}
                className={`wolf-filter-btn ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
                title={f.label}
              >
                <span className="wolf-filter-full">{f.label}</span>
                <span className="wolf-filter-short">{f.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Ordered Ladder Table */}
        <div className="wolf-right-panel">
          <div className="wolf-ladder-top">
            <div className="wolf-ladder-title">
              <IconLevels size={14} color="var(--wolf-yellow)" style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
              Key Auction Price Ladder
            </div>
            <div className="wolf-utc-badge">
              {utcDate} &middot; UTC
            </div>
          </div>

          <div className="wolf-ladder">
            {filteredLadder.map((row, idx) => {
              if (row.isLast) {
                return (
                  <div key="last" className="wolf-row is-last">
                    <div className="wolf-row-left">
                      <div className="wolf-row-code">
                        <span>LAST SPOT</span>
                      </div>
                      <span className="wolf-row-name-sub">Current Market Price</span>
                    </div>
                    <div className="wolf-row-right">
                      <span className="wolf-row-price">
                        ${Number(row.price).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                      <span className="wolf-row-pct">
                        0.00%
                      </span>
                    </div>
                  </div>
                );
              }

              const isPositive = row.pctDiff > 0;
              const isWeeklyVA = ['PW VAH', 'PW POC', 'PW VAL'].includes(row.code);
              const isMonthlyVA = ['PM VAH', 'PM POC', 'PM VAL'].includes(row.code);
              const isSigma = row.isSigma;

              return (
                <div key={row.code + idx} className={`wolf-row ${isWeeklyVA ? 'is-va-level' : ''} ${isMonthlyVA ? 'is-monthly-va' : ''} ${isSigma ? 'is-sigma-level' : ''}`}>
                  <div className="wolf-row-left">
                    <div className="wolf-row-code">
                      <span>{row.code}</span>
                      {isWeeklyVA && <span className="wolf-va-pill weekly">PW VA</span>}
                      {isMonthlyVA && <span className="wolf-va-pill monthly">PM VA</span>}
                      {isSigma && <span className="wolf-va-pill sigma">σ BAND</span>}
                    </div>
                    <span className="wolf-row-name-sub">{row.name}</span>
                  </div>
                  <div className="wolf-row-right">
                    <span className="wolf-row-price">
                      ${Number(row.price).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                    <span className={`wolf-row-pct ${isPositive ? 'pos' : 'neg'}`}>
                      {isPositive ? '+' : ''}{row.pctDiff.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Signature Bottom Banner */}
      <div className="wolf-footer-banner">
        <div className="wolf-motto">
          trading the tape, with precision
        </div>
        <div className="wolf-disclaimer-tag">
          wolf key levels &middot; not financial advice
        </div>
      </div>
    </div>
  );
}
