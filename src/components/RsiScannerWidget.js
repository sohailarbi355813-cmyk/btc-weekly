'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconRadar,
  IconRefresh,
  IconCheck,
  IconAlertTriangle,
  IconTrendUp,
  IconTrendDown,
  IconZap,
} from '@/components/Icons';

export default function RsiScannerWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanningNow, setScanningNow] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [message, setMessage] = useState(null);
  const [filterExtremeOnly, setFilterExtremeOnly] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/rsi-scanner');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll status every 30s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleTestAlert = async () => {
    setTestingWebhook(true);
    setMessage(null);
    try {
      const res = await fetch('/api/rsi-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_alert' }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: '✅ Test ping sent to Discord channel!' });
      } else {
        setMessage({ type: 'error', text: '❌ Failed to send test ping: ' + json.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '❌ Error: ' + err.message });
    } finally {
      setTestingWebhook(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleScanNow = async () => {
    setScanningNow(true);
    setMessage(null);
    try {
      const res = await fetch('/api/rsi-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_now' }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          type: 'success',
          text: `✅ Scan complete! Found ${json.overboughtCount} Overbought, ${json.oversoldCount} Oversold. Dispatched ${json.alertsDispatched} fresh alert(s) to Discord.`,
        });
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: '❌ Scan failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '❌ Scan error: ' + err.message });
    } finally {
      setScanningNow(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const status = data?.status || {};
  const overboughtCoins = status.overboughtCoins || [];
  const oversoldCoins = status.oversoldCoins || [];
  const totalTerritoryCount = overboughtCoins.length + oversoldCoins.length;
  const isDaemonActive = data?.daemonActive;

  return (
    <div style={{
      background: '#070707',
      border: '1px solid #1a1a1a',
      borderRadius: 10,
      padding: '16px 18px',
      marginBottom: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top Accent Line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: 'linear-gradient(90deg, #ef4444 0%, #38bdf8 50%, #22c55e 100%)',
      }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        borderBottom: '1px solid #151515',
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
              background: isDaemonActive ? '#22c55e' : '#38bdf8',
              boxShadow: isDaemonActive ? '0 0 10px #22c55e' : '0 0 10px #38bdf8',
            }} />
            <span style={{
              fontSize: '0.88rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#ffffff',
              fontFamily: 'var(--font-mono)'
            }}>
              Discord RSI Telemetry Scanner &middot; 55 Alts
            </span>
            <span style={{
              fontSize: '0.64rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: isDaemonActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              color: isDaemonActive ? '#4ade80' : '#38bdf8',
              border: `1px solid ${isDaemonActive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
              fontFamily: 'var(--font-mono)'
            }}>
              {isDaemonActive ? '● DAEMON ACTIVE (5M)' : '● STANDBY'}
            </span>
          </div>

          <div style={{ fontSize: '0.70rem', color: '#777777', marginTop: 4 }}>
            Dispatches live Discord embeds when any of the 55 watchlist altcoins enter RSI Overbought (&ge;70) or Oversold (&le;30).
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleTestAlert}
            disabled={testingWebhook}
            style={{
              padding: '5px 12px',
              background: '#121212',
              border: '1px solid #2a2a2a',
              borderRadius: 5,
              color: '#38bdf8',
              fontSize: '0.70rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: testingWebhook ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Send test embed to Discord channel"
          >
            <IconZap size={12} color="#38bdf8" />
            <span>{testingWebhook ? 'Sending...' : 'Test Discord Webhook'}</span>
          </button>

          <button
            onClick={handleScanNow}
            disabled={scanningNow}
            style={{
              padding: '5px 12px',
              background: '#161616',
              border: '1px solid #333',
              borderRadius: 5,
              color: '#ffffff',
              fontSize: '0.70rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: scanningNow ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Run instant scan across all 55 coins on 30m, 45m, 1h, 2h, 3h"
          >
            <IconRefresh size={12} className={scanningNow ? 'spin-icon' : ''} color="#ffffff" />
            <span>{scanningNow ? 'Scanning 275 Charts...' : 'Scan Now (55 Alts)'}</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {message && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 6,
          marginBottom: 12,
          fontSize: '0.74rem',
          fontFamily: 'var(--font-mono)',
          background: message.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
          border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Monitored Timeframes Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 14,
        padding: '8px 12px',
        background: '#0a0a0a',
        borderRadius: 6,
        border: '1px solid #141414',
        fontSize: '0.70rem',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ color: '#888' }}>STRICT TIMEFRAMES MONITORED:</span>
        {['30m', '45m', '1h', '2h', '3h'].map((tf) => (
          <span
            key={tf}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: '#151515',
              border: '1px solid #282828',
              color: '#38bdf8',
              fontWeight: 700,
            }}
          >
            {tf.toUpperCase()}
          </span>
        ))}
        <span style={{ color: '#555', marginLeft: 'auto' }}>
          Loop: <strong style={{ color: '#aaa' }}>Every 5 Mins</strong> &middot; Cooldown: <strong style={{ color: '#aaa' }}>45m Anti-Spam</strong>
        </span>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10,
        marginBottom: 14,
      }}>
        {/* Overbought Card */}
        <div style={{
          background: '#0d0707',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 6,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: '#f87171', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              Overbought (&ge;70)
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
              {status.overboughtCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginTop: 4 }}>
            Sell-side exhaustion / resistance risk
          </div>
        </div>

        {/* Oversold Card */}
        <div style={{
          background: '#060d09',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: 6,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: '#4ade80', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              Oversold (&le;30)
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#4ade80', fontFamily: 'var(--font-mono)' }}>
              {status.oversoldCount || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginTop: 4 }}>
            Capitulation discount / bounce edge
          </div>
        </div>

        {/* Total Monitored Card */}
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #1f1f1f',
          borderRadius: 6,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: '#aaa', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              Lifetime Alerts Sent
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {status.totalAlertsSentLifetime || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginTop: 4 }}>
            Last scan: {status.lastScanTime ? new Date(status.lastScanTime).toLocaleTimeString() : 'Pending'}
          </div>
        </div>
      </div>

      {/* Detected Coins Feed Table */}
      {totalTerritoryCount > 0 ? (
        <div style={{
          background: '#090909',
          border: '1px solid #171717',
          borderRadius: 6,
          padding: '10px 12px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}>
            <div style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              color: '#888',
              textTransform: 'uppercase'
            }}>
              Coins Currently in Territory ({totalTerritoryCount} active signals):
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setFilterExtremeOnly(false)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.64rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: !filterExtremeOnly ? '#222' : 'transparent',
                  color: !filterExtremeOnly ? '#fff' : '#666',
                  border: '1px solid #333',
                  cursor: 'pointer',
                }}
              >
                All Signals ({totalTerritoryCount})
              </button>
              <button
                onClick={() => setFilterExtremeOnly(true)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.64rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: filterExtremeOnly ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: filterExtremeOnly ? '#38bdf8' : '#666',
                  border: filterExtremeOnly ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #222',
                  cursor: 'pointer',
                }}
              >
                ⚡ &ge;2.0&sigma; Gaussian Boundary Only
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 8,
          }}>
            {[...overboughtCoins, ...oversoldCoins]
              .filter(item => !filterExtremeOnly || (item.sigmaMetrics && item.sigmaMetrics.isExtremeGaussian))
              .map((item, idx) => {
              const isOB = item.territory === 'OVERBOUGHT';
              const tvUrl = `https://www.tradingview.com/chart/?symbol=BYBIT:${item.symbol}.P`;
              const isExtreme = item.sigmaMetrics?.isExtremeGaussian;
              return (
                <div
                  key={`${item.symbol}-${item.timeframe}-${idx}`}
                  style={{
                    background: '#0d0d0d',
                    border: `1px solid ${isExtreme ? '#38bdf8' : isOB ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                    borderRadius: 5,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {item.displaySymbol}
                      </span>
                      <span style={{
                        fontSize: '0.62rem',
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: '#1a1a1a',
                        color: '#38bdf8',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {item.timeframe.toUpperCase()}
                      </span>
                      {item.sigmaMetrics && (
                        <span style={{
                          fontSize: '0.60rem',
                          padding: '1px 5px',
                          borderRadius: 3,
                          fontWeight: 800,
                          background: isExtreme ? 'rgba(56, 189, 248, 0.25)' : '#171717',
                          color: isExtreme ? '#38bdf8' : '#888',
                          border: isExtreme ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid #222',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {item.sigmaMetrics.zScoreText} ({item.sigmaMetrics.gaussianPct}% Gauss)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: '#777', marginTop: 3 }}>
                      Spot: ${Number(item.price).toFixed(item.price < 1 ? 4 : 2)} &middot; Mean: ${Number(item.sigmaMetrics?.mean || 0).toFixed(item.price < 1 ? 4 : 2)} {item.divergence ? `• ${item.divergence.label}` : ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '0.86rem',
                      fontWeight: 900,
                      color: isOB ? '#f87171' : '#4ade80',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      RSI {item.rsi}
                    </div>
                    <a
                      href={tvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.60rem',
                        color: '#38bdf8',
                        textDecoration: 'none',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      Chart &rarr;
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '14px',
          background: '#090909',
          borderRadius: 6,
          border: '1px solid #141414',
          color: '#666',
          fontSize: '0.72rem',
          fontFamily: 'var(--font-mono)',
        }}>
          🧘 All 55 altcoins are currently inside normal RSI range (30 &lt; RSI &lt; 70). No extreme exhaustion detected.
        </div>
      )}
    </div>
  );
}

