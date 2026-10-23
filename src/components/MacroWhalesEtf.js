'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import '../app/macro-whales.css';
import { IconRefresh, IconRadar, IconBarChart, IconDatabase, IconZap, IconShield } from './Icons';

export default function MacroWhalesEtf() {
  const [macroData, setMacroData] = useState(null);
  const [etfData, setEtfData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [etfFilter, setEtfFilter] = useState('30'); // '7', '30', '90', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [mRes, eRes] = await Promise.all([
        fetch('/api/macro-metrics', { cache: 'no-store' }),
        fetch('/api/etf-flows', { cache: 'no-store' })
      ]);

      if (mRes.ok) {
        const mJson = await mRes.json();
        if (mJson.success) setMacroData(mJson);
      }

      if (eRes.ok) {
        const eJson = await eRes.json();
        if (eJson.success) setEtfData(eJson);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load macro & ETF data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 60000); // 60s auto refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  // Format monetary amount in Millions ($M)
  const formatFlow = (val) => {
    if (val === undefined || val === null || val === 0) {
      return <span className="val-dim">--</span>;
    }
    const isPos = val > 0;
    const sign = isPos ? '+' : '';
    const formatted = `${sign}${Number(val).toFixed(1)}M`;
    return (
      <span className={isPos ? 'val-yellow' : 'val-white'}>
        {formatted}
      </span>
    );
  };

  // Format Large Cumulative ($B or $M)
  const formatCumulative = (val) => {
    if (!val && val !== 0) return '--';
    const isPos = val > 0;
    const sign = isPos ? '+' : '';
    const inBillions = (val / 1000).toFixed(2);
    return (
      <span className={isPos ? 'val-yellow' : 'val-white'}>
        {sign}${inBillions}B
      </span>
    );
  };

  // Filtered ETF rows
  const filteredDaily = useMemo(() => {
    if (!etfData?.daily) return [];
    let rows = etfData.daily;

    if (etfFilter === '7') {
      rows = rows.slice(0, 7);
    } else if (etfFilter === '30') {
      rows = rows.slice(0, 30);
    } else if (etfFilter === '90') {
      rows = rows.slice(0, 90);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => r.date.toLowerCase().includes(q));
    }

    return rows;
  }, [etfData, etfFilter, searchQuery]);

  // Export CSV handler
  const exportCsv = () => {
    if (!filteredDaily.length || !etfData?.issuerKeys) return;
    const headers = ['Date', 'Total ($M)', ...etfData.issuerKeys];
    const lines = [headers.join(',')];
    filteredDaily.forEach(r => {
      const rowVals = [
        `"${r.date}"`,
        r.total,
        ...etfData.issuerKeys.map(k => r.issuers[k] || 0)
      ];
      lines.push(rowVals.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `btc_etf_flows_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && !macroData && !etfData) {
    return (
      <div className="macro-container">
        <div className="loading-indicator">
          INITIALIZING WOLF TAPE INSTITUTIONAL FEEDS (WHALES • MVRV • SPOT ETF)...
        </div>
      </div>
    );
  }

  const whales = macroData?.whales;
  const mvrv = macroData?.mvrv;
  const stats = etfData?.stats;

  return (
    <div className="macro-container">
      {/* Header Bar */}
      <div className="macro-header-bar">
        <div className="macro-title-group">
          <h2>WOLF TAPE // MACRO & INSTITUTIONAL FLOWS</h2>
          <div className="macro-subtitle">
            REAL-TIME BINANCE WHALES L/S • ON-CHAIN MVRV RATIO • SPOT BITCOIN ETF FLOWS BY ISSUER
          </div>
        </div>
        <div className="macro-controls">
          {lastUpdated && (
            <span style={{ fontSize: '0.75rem', color: '#777777', fontFamily: 'monospace' }}>
              UPDATED {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            className="macro-btn"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Refresh All Feeds"
          >
            <IconRefresh size={14} className={refreshing ? 'rotating' : ''} />
            <span>{refreshing ? 'SYNCING...' : 'REFRESH'}</span>
          </button>
        </div>
      </div>

      {/* Summary Ribbon */}
      <div className="macro-ribbon">
        <div className="ribbon-card">
          <span className="ribbon-label">Whales Position L/S Ratio</span>
          <span className="ribbon-value val-yellow">
            {whales?.position?.ratio ? `${whales.position.ratio.toFixed(2)}x` : '--'}
          </span>
          <span className="ribbon-sub">
            {whales?.position?.longPct}% Long • {whales?.position?.shortPct}% Short
          </span>
        </div>

        <div className="ribbon-card">
          <span className="ribbon-label">Live MVRV Valuation</span>
          <span className="ribbon-value val-yellow">
            {mvrv?.liveMVRV ? `${mvrv.liveMVRV.toFixed(2)}x` : '--'}
          </span>
          <span className="ribbon-sub">
            {mvrv?.regime || 'Fair Value'}
          </span>
        </div>

        <div className="ribbon-card">
          <span className="ribbon-label">BTC Realized Price</span>
          <span className="ribbon-value val-white">
            ${mvrv?.realizedPrice ? mvrv.realizedPrice.toLocaleString() : '--'}
          </span>
          <span className="ribbon-sub">
            Spot: ${macroData?.spotPrice ? Number(macroData.spotPrice).toLocaleString() : '--'}
          </span>
        </div>

        <div className="ribbon-card">
          <span className="ribbon-label">Latest ETF Net Flow</span>
          <span className="ribbon-value">
            {stats ? formatFlow(stats.latestDayTotal) : '--'}
          </span>
          <span className="ribbon-sub">
            {stats?.latestDate || 'Completed Trading Day'}
          </span>
        </div>

        <div className="ribbon-card">
          <span className="ribbon-label">ETF All-Time Net Inflow</span>
          <span className="ribbon-value">
            {stats ? formatCumulative(stats.allTimeNetTotal) : '--'}
          </span>
          <span className="ribbon-sub">
            {stats?.totalDays || 700}+ Active Trading Days
          </span>
        </div>
      </div>

      {/* Dual Grid: Whales Long/Short & MVRV */}
      <div className="macro-grid-dual">
        {/* Panel 1: Whales Long / Short Ratio */}
        <div className="macro-panel">
          <div className="panel-title-bar">
            <h3 className="panel-title">
              <IconRadar size={16} />
              WHALES LONG / SHORT RATIO (BINANCE TOP TRADERS)
            </h3>
            <span className="panel-badge">LIVE 1H</span>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#aaaaaa', marginBottom: '14px' }}>
            Top 20% institutional & high-capital accounts weighted by position size (not retail headcounts).
          </div>

          {/* Visual Position Ratio Bar */}
          <div className="ratio-bar-wrapper">
            <div className="ratio-bar-header">
              <span className="val-yellow">LONGS: {whales?.position?.longPct}%</span>
              <span className="val-white">SHORTS: {whales?.position?.shortPct}%</span>
            </div>
            <div className="ratio-bar-track" title="Yellow = Longs, White = Shorts">
              <div
                className="ratio-bar-fill-long"
                style={{ width: `${whales?.position?.longPct || 50}%` }}
              />
            </div>
          </div>

          {/* Institutional vs Retail Comparison Table */}
          <table className="whale-comparison-table">
            <thead>
              <tr>
                <th>Tier / Metric</th>
                <th style={{ textAlign: 'right' }}>Long %</th>
                <th style={{ textAlign: 'right' }}>Short %</th>
                <th style={{ textAlign: 'right' }}>L/S Ratio</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>
                  <span className="val-yellow">●</span> Top Trader Positions (Size-Weighted)
                </td>
                <td style={{ textAlign: 'right' }} className="val-yellow">
                  {whales?.position?.longPct}%
                </td>
                <td style={{ textAlign: 'right' }} className="val-white">
                  {whales?.position?.shortPct}%
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800 }} className="val-yellow">
                  {whales?.position?.ratio}x
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>
                  <span className="val-yellow">●</span> Top Trader Accounts (Margin Balance)
                </td>
                <td style={{ textAlign: 'right' }} className="val-yellow">
                  {whales?.accounts?.longPct}%
                </td>
                <td style={{ textAlign: 'right' }} className="val-white">
                  {whales?.accounts?.shortPct}%
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800 }} className="val-yellow">
                  {whales?.accounts?.ratio}x
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: '#888888' }}>
                  <span className="val-white">○</span> Retail / Global Crowd Accounts
                </td>
                <td style={{ textAlign: 'right' }} className="val-white">
                  {whales?.retail?.longPct}%
                </td>
                <td style={{ textAlign: 'right' }} className="val-white">
                  {whales?.retail?.shortPct}%
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800 }} className="val-white">
                  {whales?.retail?.ratio}x
                </td>
              </tr>
            </tbody>
          </table>

          {/* 24-Hour Whale Hourly Trajectory */}
          {whales?.position?.history24h?.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '0.72rem', color: '#777777', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
                Past 24-Hour Whale Position Shift (Hourly)
              </div>
              <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #1a1a1a', borderRadius: '4px' }}>
                <table className="whale-comparison-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th style={{ textAlign: 'right' }}>Whale Long %</th>
                      <th style={{ textAlign: 'right' }}>Whale Short %</th>
                      <th style={{ textAlign: 'right' }}>L/S Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...whales.position.history24h].reverse().map((h, idx) => (
                      <tr key={idx}>
                        <td style={{ color: '#888888' }}>
                          {new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ textAlign: 'right' }} className="val-yellow">{h.longPct}%</td>
                        <td style={{ textAlign: 'right' }} className="val-white">{h.shortPct}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }} className="val-yellow">{h.ratio}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: Bitcoin MVRV (Market Value to Realized Value) */}
        <div className="macro-panel">
          <div className="panel-title-bar">
            <h3 className="panel-title">
              <IconDatabase size={16} />
              BITCOIN MVRV (MARKET VALUE TO REALIZED VALUE)
            </h3>
            <span className="panel-badge">ON-CHAIN COINMETRICS</span>
          </div>

          <div className="mvrv-hero-box">
            <div className="mvrv-big-number">{mvrv?.liveMVRV ? mvrv.liveMVRV.toFixed(2) : '--'}</div>
            <div className="mvrv-hero-info">
              <span className="mvrv-regime-pill">{mvrv?.regime || 'Accumulation'}</span>
              <span className="mvrv-regime-desc">
                Current Bitcoin Market Cap is {mvrv?.liveMVRV}x aggregate purchase cost basis.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: '#0a0a0a', border: '1px solid #222222', padding: '10px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.7rem', color: '#777777', textTransform: 'uppercase' }}>Bitcoin Spot Price</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#facc15', fontFamily: 'monospace' }}>
                ${macroData?.spotPrice ? Number(macroData.spotPrice).toLocaleString() : '--'}
              </div>
            </div>
            <div style={{ background: '#0a0a0a', border: '1px solid #222222', padding: '10px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.7rem', color: '#777777', textTransform: 'uppercase' }}>Aggregate Realized Price</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', fontFamily: 'monospace' }}>
                ${mvrv?.realizedPrice ? mvrv.realizedPrice.toLocaleString() : '--'}
              </div>
            </div>
          </div>

          {/* MVRV Macro Cycle Bands */}
          <div className="mvrv-bands">
            <div style={{ fontSize: '0.72rem', color: '#888888', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
              MVRV Cycle Regime Reference
            </div>

            <div className={`band-row ${mvrv?.liveMVRV >= 3.5 ? 'active' : ''}`}>
              <span style={{ color: '#ffffff' }}>&gt; 3.5x — Extreme Cycle Blow-Off Top</span>
              <span style={{ fontFamily: 'monospace' }}>Euphoria / Maximum Risk</span>
            </div>
            <div className={`band-row ${mvrv?.liveMVRV >= 2.4 && mvrv?.liveMVRV < 3.5 ? 'active' : ''}`}>
              <span style={{ color: '#ffffff' }}>2.4x - 3.2x — Late-Bull Overheating</span>
              <span style={{ fontFamily: 'monospace' }}>Heavy Distribution</span>
            </div>
            <div className={`band-row ${mvrv?.liveMVRV >= 1.5 && mvrv?.liveMVRV < 2.4 ? 'active' : ''}`}>
              <span style={{ color: '#facc15' }}>1.5x - 2.4x — Fair Value / Mid-Bull (CURRENT)</span>
              <span style={{ fontFamily: 'monospace', color: '#facc15' }}>Healthy Expansion</span>
            </div>
            <div className={`band-row ${mvrv?.liveMVRV >= 1.0 && mvrv?.liveMVRV < 1.5 ? 'active' : ''}`}>
              <span style={{ color: '#facc15' }}>1.0x - 1.5x — Early Bull / Accumulation</span>
              <span style={{ fontFamily: 'monospace' }}>Optimal Long Entry</span>
            </div>
            <div className={`band-row ${mvrv?.liveMVRV < 1.0 ? 'active' : ''}`}>
              <span style={{ color: '#facc15' }}>&lt; 1.0x — Deep Value / Historical Cycle Bottom</span>
              <span style={{ fontFamily: 'monospace' }}>Max Historical Opportunity</span>
            </div>
          </div>

          {/* 30-Day On-Chain History Table */}
          {mvrv?.history?.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', color: '#777777', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
                Recent Daily On-Chain History (CoinMetrics)
              </div>
              <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid #1a1a1a', borderRadius: '4px' }}>
                <table className="whale-comparison-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>MVRV</th>
                      <th style={{ textAlign: 'right' }}>Price (USD)</th>
                      <th style={{ textAlign: 'right' }}>Realized Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...mvrv.history].reverse().slice(0, 10).map((h, idx) => (
                      <tr key={idx}>
                        <td style={{ color: '#888888' }}>{h.date}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }} className="val-yellow">{h.mvrv.toFixed(3)}</td>
                        <td style={{ textAlign: 'right' }} className="val-white">${h.price.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }} className="val-white">${h.realizedPrice.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Complete Daily BTC ETF Inflows/Outflows Section */}
      <div className="etf-section">
        <div className="etf-header-row">
          <div>
            <h3 className="panel-title" style={{ fontSize: '1.05rem' }}>
              <IconBarChart size={17} />
              COMPLETE DAILY BTC SPOT ETF INFLOW / OUTFLOW BY ISSUER ($ MILLIONS)
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '4px' }}>
              Official SEC/Farside institutional ledger • Yellow indicates net positive inflows (+), White indicates net outflows (-).
            </div>
          </div>

          <div className="etf-filter-row">
            <input
              type="text"
              placeholder="Search date (e.g. Oct 2026)..."
              className="etf-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className={`macro-btn ${etfFilter === '7' ? 'active' : ''}`}
              onClick={() => setEtfFilter('7')}
            >
              7D
            </button>
            <button
              className={`macro-btn ${etfFilter === '30' ? 'active' : ''}`}
              onClick={() => setEtfFilter('30')}
            >
              30D
            </button>
            <button
              className={`macro-btn ${etfFilter === '90' ? 'active' : ''}`}
              onClick={() => setEtfFilter('90')}
            >
              90D
            </button>
            <button
              className={`macro-btn ${etfFilter === 'all' ? 'active' : ''}`}
              onClick={() => setEtfFilter('all')}
            >
              ALL ({etfData?.daily?.length || 0}D)
            </button>
            <button className="macro-btn" onClick={exportCsv} title="Export CSV Ledger">
              EXPORT CSV
            </button>
          </div>
        </div>

        {/* Issuer Cumulative Breakdown Chips */}
        {stats?.cumulativeByIssuer && (
          <div className="etf-issuer-pills">
            {Object.entries(stats.cumulativeByIssuer).map(([ticker, val]) => (
              <div key={ticker} className="issuer-pill">
                <span className="issuer-pill-name">{ticker}:</span>
                <span className={`issuer-pill-val ${val >= 0 ? 'val-yellow' : 'val-white'}`}>
                  {val >= 0 ? '+' : ''}{Number(val).toLocaleString()}M
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Full Interactive Daily Table */}
        <div className="etf-table-container">
          <table className="etf-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Date</th>
                <th style={{ width: '120px' }}>Total Net Flow</th>
                <th>IBIT (BlackRock)</th>
                <th>FBTC (Fidelity)</th>
                <th>BITB (Bitwise)</th>
                <th>ARKB (ARK 21S)</th>
                <th>GBTC (Grayscale)</th>
                <th>BTC (Grayscale Mini)</th>
                <th>BTCO (Invesco)</th>
                <th>EZBC (Franklin)</th>
                <th>HODL (VanEck)</th>
                <th>BRRR (Valkyrie)</th>
                <th>BTCW (WisdomTree)</th>
                <th>MSBT (Mini)</th>
              </tr>
            </thead>
            <tbody>
              {filteredDaily.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ color: '#aaaaaa', fontWeight: 600 }}>{row.date}</td>
                  <td>{formatFlow(row.total)}</td>
                  <td>{formatFlow(row.issuers?.IBIT)}</td>
                  <td>{formatFlow(row.issuers?.FBTC)}</td>
                  <td>{formatFlow(row.issuers?.BITB)}</td>
                  <td>{formatFlow(row.issuers?.ARKB)}</td>
                  <td>{formatFlow(row.issuers?.GBTC)}</td>
                  <td>{formatFlow(row.issuers?.BTC)}</td>
                  <td>{formatFlow(row.issuers?.BTCO)}</td>
                  <td>{formatFlow(row.issuers?.EZBC)}</td>
                  <td>{formatFlow(row.issuers?.HODL)}</td>
                  <td>{formatFlow(row.issuers?.BRRR)}</td>
                  <td>{formatFlow(row.issuers?.BTCW)}</td>
                  <td>{formatFlow(row.issuers?.MSBT)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
