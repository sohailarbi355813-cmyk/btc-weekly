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
  } = levelsData;

  // Filter ladder rows while always preserving the LAST row
  const filteredLadder = useMemo(() => {
    if (filter === 'all') return ladder;
    return ladder.filter(row => row.isLast || row.category === filter);
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
                  {nearestResistance ? `+${nearestResistance.pctDiff}% (+$${Math.abs(nearestResistance.diff).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}
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
                  {nearestSupport ? `${nearestSupport.pctDiff}% (-$${Math.abs(nearestSupport.diff).toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}
                </div>
              </div>
            </div>

            {/* Range & Anchor Context */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
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
            </div>
          </div>

          {/* Filter Bar */}
          <div className="wolf-filter-row">
            {[
              { id: 'all', label: 'All Levels' },
              { id: 'daily', label: 'Daily (PDH/L, DO, POC)' },
              { id: 'weekly', label: 'Weekly (WO, PWH/L)' },
              { id: 'monthly', label: 'Monthly (MO, PMH/L)' },
            ].map(f => (
              <button
                key={f.id}
                className={`wolf-filter-btn ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
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
                    <div className="wolf-row-code">
                      <span>LAST</span>
                    </div>
                    <div className="wolf-row-price">
                      {Number(row.price).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </div>
                    <div className="wolf-row-pct">
                      0.00 %
                    </div>
                  </div>
                );
              }

              const isPositive = row.pctDiff > 0;
              return (
                <div key={row.code + idx} className="wolf-row tooltip-wrap">
                  <div>
                    <div className="wolf-row-code">{row.code}</div>
                    <span className="wolf-row-name-sub">{row.name}</span>
                  </div>
                  <div className="wolf-row-price">
                    {Number(row.price).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                  <div className={`wolf-row-pct ${isPositive ? 'pos' : 'neg'}`}>
                    {isPositive ? '+' : ''}{row.pctDiff.toFixed(2)} %
                  </div>

                  {/* Tooltip */}
                  <div className="tooltip-box" style={{ minWidth: 200 }}>
                    <div className="tooltip-row"><span className="tooltip-key">Level</span><span className="tooltip-val" style={{ color: 'var(--wolf-yellow)' }}>{row.code} ({row.name})</span></div>
                    <div className="tooltip-row"><span className="tooltip-key">Price</span><span className="tooltip-val">${Number(row.price).toLocaleString('en-US', { minimumFractionDigits: 1 })}</span></div>
                    <div className="tooltip-row"><span className="tooltip-key">Distance</span><span className="tooltip-val">{isPositive ? '+' : ''}{row.pctDiff}% (${Math.abs(row.diff).toLocaleString('en-US')})</span></div>
                    <div className="tooltip-row"><span className="tooltip-key">Role</span><span className="tooltip-val">{row.role}</span></div>
                    <div className="tooltip-row"><span className="tooltip-key">Category</span><span className="tooltip-val">{row.category.toUpperCase()}</span></div>
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
