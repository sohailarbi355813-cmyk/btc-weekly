'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  IconRadar,
  IconRefresh,
  IconBell,
  IconSearch,
  IconTrash,
  IconVolume,
  IconVolumeMute,
  IconX,
  IconCheck,
  IconZap,
} from './Icons';
import { playAlertChime } from '@/lib/alertSound';

const STORAGE_KEY_ALERTS = 'wolf_tape_reader_alerts_v1';
const STORAGE_KEY_SOUND = 'wolf_tape_reader_sound_muted';
const STORAGE_KEY_AUTO_ALERT = 'wolf_tape_auto_alert_support_res';

export default function AltsTapeReader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Sub-Tabs: 'bull' (Bullish States - VAL Support) | 'bear' (Bearish States - VAH Resistance) | 'alerts'
  const [activeTab, setActiveTab] = useState('bull');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundMuted, setSoundMuted] = useState(false);

  // Proximity Threshold Filter: 'strike' (≤ 1.2% - Testing level right now) | 'near' (≤ 2.5%) | 'all'
  const [proximityFilter, setProximityFilter] = useState('strike');

  // Auto-Alert on Support / Resistance Hits (Sends notification when ANY coin hits VAL or VAH)
  const [autoAlertEnabled, setAutoAlertEnabled] = useState(true);
  const notifiedPivotsRef = useRef(new Set()); // avoids duplicate spam within session

  // Alerts Management (Unlimited custom stored in localStorage)
  const [alerts, setAlerts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCoinForAlert, setSelectedCoinForAlert] = useState(null);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertConditionType, setAlertConditionType] = useState('price_above');
  const [alertNote, setAlertNote] = useState('');
  const [toasts, setToasts] = useState([]);
  const [notifPermission, setNotifPermission] = useState('default');
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [showWebhookSettings, setShowWebhookSettings] = useState(false);

  // Load sound, webhook, auto-alert & saved alerts on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission);
      }
      const savedMuted = localStorage.getItem(STORAGE_KEY_SOUND);
      if (savedMuted !== null) setSoundMuted(savedMuted === 'true');

      const savedAuto = localStorage.getItem(STORAGE_KEY_AUTO_ALERT);
      if (savedAuto !== null) setAutoAlertEnabled(savedAuto === 'true');

      const savedWebhook = localStorage.getItem('wolf_tape_discord_webhook');
      if (savedWebhook) setDiscordWebhook(savedWebhook);

      const savedAlerts = localStorage.getItem(STORAGE_KEY_ALERTS);
      if (savedAlerts) {
        setAlerts(JSON.parse(savedAlerts));
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, []);

  const requestDesktopPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      setNotifPermission(res);
      if (res === 'granted') {
        new Notification('🐺 Wolf Tape Reader', {
          body: 'Desktop Alerts Enabled! You will be notified whenever coins test VAL support or VAH resistance.',
          icon: '/icon.svg',
        });
        playAlertChime();
      }
    }
  };

  const toggleAutoAlert = () => {
    const next = !autoAlertEnabled;
    setAutoAlertEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_ALERT, next ? 'true' : 'false');
    } catch (e) {}
    if (next) playAlertChime();
  };

  const saveWebhook = (url) => {
    setDiscordWebhook(url);
    try {
      localStorage.setItem('wolf_tape_discord_webhook', url);
    } catch (e) {}
  };

  const saveAlerts = useCallback((newAlerts) => {
    setAlerts(newAlerts);
    try {
      localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(newAlerts));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, []);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem(STORAGE_KEY_SOUND, next ? 'true' : 'false');
    if (!next) playAlertChime();
  };

  // Fetch live tape data from server API
  const fetchTapeData = useCallback(async () => {
    try {
      const res = await fetch('/api/alts-tape');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch');

      setData(json);
      setLastUpdated(new Date());
      setError(null);

      // 1. Run Automated Support / Resistance Pivot Scanner (sends alerts for close levels!)
      runAutoPivotScanner(json.bullishStates, json.bearishStates);

      // 2. Check Custom User Alerts
      checkCustomAlerts(json.bullishStates, json.bearishStates);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [autoAlertEnabled, discordWebhook]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto refresh interval (every 10 seconds)
  useEffect(() => {
    fetchTapeData();
    const interval = setInterval(fetchTapeData, 10000);
    return () => clearInterval(interval);
  }, [fetchTapeData]);

  const flashTabTitle = (msg) => {
    if (typeof window === 'undefined') return;
    const original = 'Wolf Tape Reader';
    let count = 0;
    const timer = setInterval(() => {
      document.title = count % 2 === 0 ? msg : original;
      count++;
      if (count > 16) {
        clearInterval(timer);
        document.title = original;
      }
    }, 750);

    const resetOnFocus = () => {
      clearInterval(timer);
      document.title = original;
      window.removeEventListener('focus', resetOnFocus);
    };
    window.addEventListener('focus', resetOnFocus);
  };

  // Automated Support / Resistance Scanner
  // Sends notification when ANY coin is close to / testing a VAL or VAH level!
  const runAutoPivotScanner = (bullList, bearList) => {
    if (!autoAlertEnabled) return;

    const scanList = [
      ...(bullList || []).map((x) => ({ ...x, type: 'SUPPORT (VAL)' })),
      ...(bearList || []).map((x) => ({ ...x, type: 'RESISTANCE (VAH)' })),
    ];

    scanList.forEach((coin) => {
      if (coin.minAbsDist <= 1.0) {
        const pivotKey = `${coin.symbol}_${coin.closest?.label}`;
        if (!notifiedPivotsRef.current.has(pivotKey)) {
          notifiedPivotsRef.current.add(pivotKey);

          const title = `🎯 ${coin.type}: $${coin.symbol}`;
          const body = `${coin.symbol} is testing ${coin.closest?.label} at $${coin.closest?.level} (Spot: $${coin.spot}, ${coin.closest?.dist}% dist). Watch for reaction!`;

          // In-app toast
          addToast({
            id: Date.now() + Math.random(),
            title,
            message: body,
          });

          // Native Desktop Notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(title, { body, icon: '/icon.svg', requireInteraction: true });
            } catch (e) {}
          }

          // Sound
          if (!soundMuted) playAlertChime();

          // Flashing Tab Title
          flashTabTitle(`🎯 [${coin.symbol}] AT ${coin.closest?.label}!`);

          // Discord Webhook
          if (discordWebhook && discordWebhook.startsWith('http')) {
            try {
              fetch(discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: `🐺 **Wolf Tape Reader Pivot Alert!**\n**Setup**: \`${coin.type}\`\n**Asset**: \`$${coin.symbol}\`\n**Level**: \`${coin.closest?.label}\` at \`$${coin.closest?.level}\`\n**Live Spot**: \`$${coin.spot}\` (Distance: \`${coin.closest?.dist}%\`)`,
                }),
              }).catch(() => {});
            } catch (e) {}
          }
        }
      }
    });
  };

  // Custom User Alerts Evaluation
  const checkCustomAlerts = (bullList, bearList) => {
    if (!alerts.length) return;
    const combined = [...(bullList || []), ...(bearList || [])];

    let triggeredAny = false;
    const updated = alerts.map((a) => {
      if (a.triggered) return a;

      const coin = combined.find((x) => x.symbol === a.symbol || x.fullSymbol === a.displaySymbol);
      if (!coin) return a;

      let isTriggered = false;
      let triggerMsg = '';

      if (a.type === 'price_above' && coin.spot >= a.targetPrice) {
        isTriggered = true;
        triggerMsg = `${coin.symbol} crossed ABOVE $${a.targetPrice}`;
      } else if (a.type === 'price_below' && coin.spot <= a.targetPrice) {
        isTriggered = true;
        triggerMsg = `${coin.symbol} dropped BELOW $${a.targetPrice}`;
      } else if (a.type === 'at_val' && coin.minAbsDist <= 1.0) {
        isTriggered = true;
        triggerMsg = `${coin.symbol} is at ${coin.closest?.label} ($${coin.closest?.level})`;
      }

      if (isTriggered) {
        triggeredAny = true;
        addToast({
          id: Date.now() + Math.random(),
          title: `CUSTOM ALERT: ${coin.symbol}`,
          message: triggerMsg,
          note: a.note,
        });

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`🚨 WOLF ALERT: ${coin.symbol}`, {
              body: `${triggerMsg}${a.note ? `\nNote: ${a.note}` : ''}`,
              icon: '/icon.svg',
              requireInteraction: true,
            });
          } catch (err) {}
        }

        flashTabTitle(`🚨 [ALERT] ${coin.symbol}!`);

        return { ...a, triggered: true, triggeredAt: new Date().toLocaleTimeString() };
      }
      return a;
    });

    if (triggeredAny) {
      if (!soundMuted) playAlertChime();
      saveAlerts(updated);
    }
  };

  const addToast = (toast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 8000);
  };

  const handleCreateAlert = (e) => {
    e.preventDefault();
    if (!selectedCoinForAlert) return;

    const targetPriceNum = parseFloat(alertTargetPrice);
    if (!targetPriceNum || isNaN(targetPriceNum)) {
      alert('Please enter a valid numeric target price');
      return;
    }

    const newAlert = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      symbol: selectedCoinForAlert.symbol,
      displaySymbol: selectedCoinForAlert.fullSymbol || selectedCoinForAlert.symbol,
      name: selectedCoinForAlert.name,
      type: alertConditionType,
      targetPrice: targetPriceNum,
      note: alertNote.trim(),
      createdAt: new Date().toLocaleTimeString(),
      triggered: false,
    };

    saveAlerts([newAlert, ...alerts]);
    setShowAddModal(false);
    setAlertNote('');
    setAlertTargetPrice('');

    addToast({
      id: Date.now(),
      title: 'Alert Created',
      message: `Watching ${newAlert.symbol} at $${newAlert.targetPrice}`,
    });
  };

  const handleDeleteAlert = (id) => {
    saveAlerts(alerts.filter((a) => a.id !== id));
  };

  const handleClearTriggered = () => {
    saveAlerts(alerts.filter((a) => !a.triggered));
  };

  const openAlertModalFor = (coin, targetVal) => {
    setSelectedCoinForAlert(coin);
    setAlertTargetPrice((targetVal || coin.spot).toString());
    setAlertConditionType('price_above');
    setShowAddModal(true);
  };

  // Filter current active list by Proximity Threshold (Strike Zone vs Nearby vs All)
  const currentList = useMemo(() => {
    if (!data) return [];
    let list = activeTab === 'bull' ? [...(data.bullishStates || [])] : [...(data.bearishStates || [])];

    // Filter by Proximity
    if (proximityFilter === 'strike') {
      // Coins testing a level right now (within <= 1.2%)
      list = list.filter((item) => item.hasHighlight || item.minAbsDist <= 1.2);
    } else if (proximityFilter === 'near') {
      // Coins within <= 2.5%
      list = list.filter((item) => item.minAbsDist <= 2.5);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
    }
    return list;
  }, [data, activeTab, proximityFilter, searchQuery]);

  // Counts of coins in strike zone
  const strikeCounts = useMemo(() => {
    if (!data) return { bullStrike: 0, bearStrike: 0 };
    return {
      bullStrike: (data.bullishStates || []).filter((x) => x.hasHighlight || x.minAbsDist <= 1.2).length,
      bearStrike: (data.bearishStates || []).filter((x) => x.hasHighlight || x.minAbsDist <= 1.2).length,
    };
  }, [data]);

  return (
    <div className="va-terminal-wrapper">
      {/* ── Sub-Navigation: Bullish States vs Bearish States vs Alerts ── */}
      <div className="va-tabs-bar">
        <div className="va-tab-group">
          <button
            className={`va-tab-btn tab-bull ${activeTab === 'bull' ? 'active' : ''}`}
            onClick={() => setActiveTab('bull')}
          >
            <span>Bullish States (Support at VAL)</span>
            <span className="va-tab-count">{strikeCounts.bullStrike} at VAL</span>
          </button>

          <button
            className={`va-tab-btn tab-bear ${activeTab === 'bear' ? 'active' : ''}`}
            onClick={() => setActiveTab('bear')}
          >
            <span>Bearish States (Resistance at VAH)</span>
            <span className="va-tab-count">{strikeCounts.bearStrike} at VAH</span>
          </button>

          <button
            className={`va-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            <IconBell size={14} />
            <span>Alerts</span>
            <span className="va-tab-count">{alerts.length}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Auto-Alert on Support / Resistance Hits Toggle */}
          <button
            className="va-tab-btn"
            style={{
              color: autoAlertEnabled ? '#2dd4bf' : '#8b9299',
              background: autoAlertEnabled ? 'rgba(45, 212, 191, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${autoAlertEnabled ? 'rgba(45, 212, 191, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
            }}
            onClick={toggleAutoAlert}
            title="Automatically send notification whenever ANY coin tests a VAL Support or VAH Resistance pivot"
          >
            <IconZap size={14} />
            <span>Auto-Alert on Pivots: {autoAlertEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {notifPermission !== 'granted' && (
            <button
              className="va-tab-btn"
              style={{ color: '#2dd4bf', background: 'rgba(45, 212, 191, 0.1)', border: '1px solid rgba(45, 212, 191, 0.25)' }}
              onClick={requestDesktopPermission}
              title="Enable Windows Desktop Popups"
            >
              <IconBell size={13} />
              <span>Enable Desktop Alerts</span>
            </button>
          )}

          <button
            className="va-tab-btn"
            onClick={() => setShowWebhookSettings(true)}
            title="Configure Telegram / Discord Webhook for Mobile Phone Alerts"
          >
            <span style={{ fontSize: '0.78rem', color: discordWebhook ? '#2dd4bf' : '#8b9299' }}>
              {discordWebhook ? 'Webhook Linked' : 'Webhook'}
            </span>
          </button>

          <button
            className="va-tab-btn"
            onClick={toggleSound}
            style={{ padding: '0.55rem 0.75rem' }}
            title={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {soundMuted ? <IconVolumeMute size={14} color="#f87171" /> : <IconVolume size={14} color="#2dd4bf" />}
          </button>

          <button
            className="va-tab-btn"
            onClick={fetchTapeData}
            style={{ padding: '0.55rem 0.75rem' }}
            title="Refresh Live Data"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {/* ── ALERTS MANAGER VIEW ── */}
      {activeTab === 'alerts' ? (
        <div className="vyaps-card">
          <div className="vyaps-card-header">
            <span className="vyaps-brand">vyaps.xyz</span>
            <span className="vyaps-title">Unlimited Alerts Manager</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="va-tab-btn active"
                onClick={() => {
                  if (data?.bullishStates?.[0]) openAlertModalFor(data.bullishStates[0]);
                }}
              >
                + New Alert
              </button>
              {alerts.some((a) => a.triggered) && (
                <button className="va-tab-btn" onClick={handleClearTriggered}>
                  Clear Fired
                </button>
              )}
            </div>
          </div>

          {alerts.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#636b73' }}>
              <IconBell size={28} style={{ marginBottom: '0.5rem' }} />
              <p>No active alerts. Click any coin row in the table to set an alert!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    background: alert.triggered ? 'rgba(45, 212, 191, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${alert.triggered ? 'rgba(45, 212, 191, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="vyaps-coin-icon">{alert.symbol.slice(0, 3)}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#fff', fontWeight: 700 }}>{alert.symbol}</span>
                        <span
                          className={`pivot-pill ${alert.triggered ? 'is-close' : ''}`}
                          style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                        >
                          {alert.triggered ? 'TRIGGERED ' + alert.triggeredAt : 'ACTIVE'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#8b9299', marginTop: '0.15rem' }}>
                        {alert.type === 'price_above' ? 'Price >= $' : 'Price <= $'}
                        {alert.targetPrice} {alert.note && <span> &bull; &ldquo;{alert.note}&rdquo;</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    style={{ background: 'none', border: 'none', color: '#636b73', cursor: 'pointer', padding: '0.4rem' }}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── EXACT VYAPS.XYZ 8-PIVOT TABLE (FILTERED BY PROXIMITY) ── */
        <div className="vyaps-card">
          <div className="vyaps-card-header">
            <span className="vyaps-brand">vyaps.xyz</span>
            <span className="vyaps-title">
              {activeTab === 'bull' ? 'Bullish States' : 'Bearish States'}
            </span>

            {/* Proximity Filter Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#090a0d', padding: '0.25rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                className={`va-tab-btn ${proximityFilter === 'strike' ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setProximityFilter('strike')}
                title="Show only coins actively testing a level (within <= 1.2% distance)"
              >
                🎯 In Strike Zone ({activeTab === 'bull' ? strikeCounts.bullStrike : strikeCounts.bearStrike})
              </button>
              <button
                className={`va-tab-btn ${proximityFilter === 'near' ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setProximityFilter('near')}
                title="Show coins within <= 2.5% distance"
              >
                Nearby (&le; 2.5%)
              </button>
              <button
                className={`va-tab-btn ${proximityFilter === 'all' ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setProximityFilter('all')}
                title="Show all 55 coins"
              >
                All (55)
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#636b73' }}>
              <IconRefresh size={26} className="spin" style={{ marginBottom: '0.5rem' }} />
              <p>Scanning 55 coins for Value Area Low &amp; High pivots...</p>
            </div>
          ) : (
            <div className="vyaps-table-wrapper">
              <table className="vyaps-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>pY</th>
                    <th>Y</th>
                    <th>pQ</th>
                    <th>Q</th>
                    <th>pM</th>
                    <th>M</th>
                    <th>pW</th>
                    <th>W</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {currentList.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ padding: '3rem', textAlign: 'center', color: '#636b73' }}>
                        No coins currently in strike zone. Switch to &ldquo;Nearby&rdquo; or &ldquo;All (55)&rdquo; to see all distances.
                      </td>
                    </tr>
                  ) : (
                    currentList.map((row) => (
                      <tr
                        key={row.symbol}
                        className="vyaps-row"
                        onClick={() => openAlertModalFor(row, row.spot)}
                        title={`Click to set alert for ${row.symbol} (Closest level: ${row.closest?.label} at $${row.closest?.level})`}
                      >
                        {/* 1. Symbol Cell */}
                        <td>
                          <div className="vyaps-symbol-cell">
                            <div className="vyaps-coin-icon">
                              {row.symbol.slice(0, 3)}
                            </div>
                            <span className="vyaps-symbol-name">{row.symbol}</span>
                          </div>
                        </td>

                        {/* 2. pY (Prior Year) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pY.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Prior Year ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pY.level} | Spot: $${row.spot} | Dist: ${row.pY.text}%`}
                          >
                            {row.pY.text}
                          </span>
                        </td>

                        {/* 3. Y (Current Year) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.Y.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Current Year ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.Y.level} | Spot: $${row.spot} | Dist: ${row.Y.text}%`}
                          >
                            {row.Y.text}
                          </span>
                        </td>

                        {/* 4. pQ (Prior Quarter) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pQ.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Prior Quarter ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pQ.level} | Spot: $${row.spot} | Dist: ${row.pQ.text}%`}
                          >
                            {row.pQ.text}
                          </span>
                        </td>

                        {/* 5. Q (Current Quarter) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.Q.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Current Quarter ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.Q.level} | Spot: $${row.spot} | Dist: ${row.Q.text}%`}
                          >
                            {row.Q.text}
                          </span>
                        </td>

                        {/* 6. pM (Prior Month) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pM.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Prior Month ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pM.level} | Spot: $${row.spot} | Dist: ${row.pM.text}%`}
                          >
                            {row.pM.text}
                          </span>
                        </td>

                        {/* 7. M (Current Month) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.M.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Current Month ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.M.level} | Spot: $${row.spot} | Dist: ${row.M.text}%`}
                          >
                            {row.M.text}
                          </span>
                        </td>

                        {/* 8. pW (Prior Week) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pW.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Prior Week ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pW.level} | Spot: $${row.spot} | Dist: ${row.pW.text}%`}
                          >
                            {row.pW.text}
                          </span>
                        </td>

                        {/* 9. W (Current Week) */}
                        <td>
                          <span
                            className={`pivot-pill ${row.W.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Current Week ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.W.level} | Spot: $${row.spot} | Dist: ${row.W.text}%`}
                          >
                            {row.W.text}
                          </span>
                        </td>

                        {/* 10. State */}
                        <td>
                          <span className={`vyaps-state-badge ${row.state === 'BULL' ? 'bull' : 'bear'}`}>
                            {row.state}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="vyaps-footer-note">
            Displaying coins currently at or close to Value Area Low (VAL) support pivots for bounce entries.
          </div>
        </div>
      )}

      {/* ── Discord / Telegram Webhook Modal ── */}
      {showWebhookSettings && (
        <div className="alts-modal-overlay" onClick={() => setShowWebhookSettings(false)}>
          <div className="alts-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#0e1014', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: '#2dd4bf' }}>
                <IconZap size={18} />
                Mobile Phone Webhook Alerts
              </span>
              <button className="modal-close-btn" onClick={() => setShowWebhookSettings(false)}>
                <IconX size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#8b9299', lineHeight: 1.4 }}>
              Want your phone to buzz whenever an altcoin tests a VAL Support or VAH Resistance pivot?
              Paste your Discord or Telegram webhook URL below. Wolf Tape Reader will push instant alerts straight to your phone lock-screen!
            </p>

            <div className="modal-form-group">
              <label className="modal-form-label" style={{ color: '#8b9299' }}>Webhook URL</label>
              <input
                type="url"
                className="modal-input"
                style={{ background: '#090a0d', color: '#eeefed' }}
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhook}
                onChange={(e) => saveWebhook(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
              <button
                className="alts-btn"
                style={{ flex: 1, justifyContent: 'center', background: '#2dd4bf', color: '#090a0d', fontWeight: 800 }}
                onClick={() => {
                  if (discordWebhook && discordWebhook.startsWith('http')) {
                    fetch(discordWebhook, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: '🐺 **Wolf Tape Reader Pivot Alert Engine Active!** Ready to send Value Area support and resistance hits directly to your phone!',
                      }),
                    }).then(() => {
                      addToast({ id: Date.now(), title: 'Webhook Test Sent', message: 'Check your phone channel!' });
                    }).catch(() => {
                      alert('Could not dispatch to webhook URL. Please check the URL.');
                    });
                  }
                  setShowWebhookSettings(false);
                }}
              >
                <IconCheck size={16} />
                <span>Save &amp; Test</span>
              </button>
              <button className="alts-btn alts-btn-ghost" onClick={() => setShowWebhookSettings(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Alert Modal ── */}
      {showAddModal && selectedCoinForAlert && (
        <div className="alts-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="alts-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#0e1014', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: '#2dd4bf' }}>
                <IconBell size={18} />
                Set Alert &bull; {selectedCoinForAlert.symbol}
              </span>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateAlert} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="modal-form-group">
                <label className="modal-form-label" style={{ color: '#8b9299' }}>Condition</label>
                <select
                  className="modal-select"
                  style={{ background: '#090a0d', color: '#eeefed' }}
                  value={alertConditionType}
                  onChange={(e) => setAlertConditionType(e.target.value)}
                >
                  <option value="price_above">Price crosses ABOVE target</option>
                  <option value="price_below">Price drops BELOW target</option>
                  <option value="at_val">Touches Value Area Low (VAL Support)</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" style={{ color: '#8b9299' }}>
                  Target Price (Current Spot: ${selectedCoinForAlert.spot})
                </label>
                <input
                  type="number"
                  step="any"
                  className="modal-input"
                  style={{ background: '#090a0d', color: '#eeefed' }}
                  placeholder="Target price..."
                  value={alertTargetPrice}
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" style={{ color: '#8b9299' }}>Custom Note (Optional)</label>
                <input
                  type="text"
                  className="modal-input"
                  style={{ background: '#090a0d', color: '#eeefed' }}
                  placeholder="e.g. Look for VAL support bounce entry..."
                  value={alertNote}
                  onChange={(e) => setAlertNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  className="alts-btn"
                  style={{ flex: 1, justifyContent: 'center', background: '#2dd4bf', color: '#090a0d', fontWeight: 800 }}
                >
                  <IconCheck size={16} />
                  <span>Save Alert</span>
                </button>
                <button type="button" className="alts-btn alts-btn-ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast Floating Notifications ── */}
      <div className="alert-toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="alert-toast" style={{ background: '#0e1014', borderColor: '#2dd4bf' }}>
            <IconBell size={20} color="#2dd4bf" />
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#2dd4bf', fontSize: '0.85rem' }}>{toast.title}</strong>
              <div style={{ color: '#eeefed', fontSize: '0.78rem', marginTop: '0.1rem' }}>{toast.message}</div>
              {toast.note && (
                <div style={{ color: '#8b9299', fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  &ldquo;{toast.note}&rdquo;
                </div>
              )}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              style={{ background: 'none', border: 'none', color: '#8b9299', cursor: 'pointer' }}
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
