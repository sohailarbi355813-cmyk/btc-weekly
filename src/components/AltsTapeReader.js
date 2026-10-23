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

let globalToastCounter = 0;

export default function AltsTapeReader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Sub-Tabs: 'bull' (Bullish States - Above all VALs) | 'bear' (Bearish States - Below all VAHs) | 'alerts'
  const [activeTab, setActiveTab] = useState('bull');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundMuted, setSoundMuted] = useState(false);

  // Auto-Alert on Support / Resistance Hits (Sends notification when ANY coin hits VAL or VAH)
  const [autoAlertEnabled, setAutoAlertEnabled] = useState(true);
  const notifiedPivotsRef = useRef(new Set());

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
          body: 'Desktop Alerts Enabled! Real-time Support (VAL) and Resistance (VAH) alerts active.',
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

  // Fixed unique toast ID generator to eliminate React duplicate key errors
  const addToast = (toast) => {
    const uniqueId = `toast_${Date.now()}_${++globalToastCounter}_${Math.random().toString(36).substr(2, 6)}`;
    const newToast = { ...toast, id: uniqueId };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== uniqueId));
    }, 8000);
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

      // Automated Support / Resistance Pivot Scanner
      runAutoPivotScanner(json.bullishStates, json.bearishStates);

      // Check Custom User Alerts
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
          const body = `${coin.symbol} testing ${coin.closest?.label} at $${coin.closest?.level} (Spot: $${coin.spot}, ${coin.closest?.text}% dist).`;

          addToast({ title, message: body });

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(title, { body, icon: '/icon.svg', requireInteraction: true });
            } catch (e) {}
          }

          if (!soundMuted) playAlertChime();
          flashTabTitle(`🎯 [${coin.symbol}] AT ${coin.closest?.label}!`);

          if (discordWebhook && discordWebhook.startsWith('http')) {
            try {
              fetch(discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: `🐺 **Wolf Tape Reader Pivot Alert!**\n**Setup**: \`${coin.type}\`\n**Asset**: \`$${coin.symbol}\`\n**Level**: \`${coin.closest?.label}\` at \`$${coin.closest?.level}\`\n**Spot**: \`$${coin.spot}\` (${coin.closest?.text}%)`,
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
        triggerMsg = `${coin.symbol} testing ${coin.closest?.label} ($${coin.closest?.level})`;
      }

      if (isTriggered) {
        triggeredAny = true;
        addToast({
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

  // Filter current active list (Bullish or Bearish) by search query
  const currentList = useMemo(() => {
    if (!data) return [];
    let list = activeTab === 'bull' ? [...(data.bullishStates || [])] : [...(data.bearishStates || [])];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
    }
    return list;
  }, [data, activeTab, searchQuery]);

  return (
    <div className="va-terminal-wrapper" style={{ background: '#000000', minHeight: '80vh' }}>
      {/* ── Sub-Navigation: Bullish States vs Bearish States vs Alerts ── */}
      <div className="va-tabs-bar" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
        <div className="va-tab-group">
          <button
            className={`va-tab-btn tab-bull ${activeTab === 'bull' ? 'active' : ''}`}
            onClick={() => setActiveTab('bull')}
          >
            <span>Bullish States</span>
            <span className="va-tab-count" style={{ color: activeTab === 'bull' ? '#facc15' : '#888888' }}>
              {data?.bullishStates?.length || 0}
            </span>
          </button>

          <button
            className={`va-tab-btn tab-bear ${activeTab === 'bear' ? 'active' : ''}`}
            onClick={() => setActiveTab('bear')}
          >
            <span>Bearish States</span>
            <span className="va-tab-count" style={{ color: activeTab === 'bear' ? '#ffffff' : '#888888' }}>
              {data?.bearishStates?.length || 0}
            </span>
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
          {/* Auto-Alert Toggle */}
          <button
            className="va-tab-btn"
            style={{
              color: autoAlertEnabled ? '#facc15' : '#888888',
              background: autoAlertEnabled ? '#141414' : '#000000',
              border: `1px solid ${autoAlertEnabled ? '#facc15' : '#222222'}`,
            }}
            onClick={toggleAutoAlert}
            title="Automatically send notification whenever a coin reaches support or resistance"
          >
            <IconZap size={14} />
            <span>Auto-Alert: {autoAlertEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="va-search-input"
              placeholder="Search symbol (e.g. INJ)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#888888',
                  cursor: 'pointer',
                }}
              >
                <IconX size={12} />
              </button>
            )}
          </div>

          {notifPermission !== 'granted' && (
            <button
              className="va-tab-btn"
              style={{ color: '#facc15', border: '1px solid #facc15' }}
              onClick={requestDesktopPermission}
              title="Enable Windows Desktop Popups"
            >
              <IconBell size={13} />
              <span>Desktop Alerts</span>
            </button>
          )}

          <button
            className="va-tab-btn"
            onClick={() => setShowWebhookSettings(true)}
            title="Configure Telegram / Discord Webhook for Mobile Phone Alerts"
          >
            <span style={{ fontSize: '0.78rem', color: discordWebhook ? '#facc15' : '#888888' }}>
              {discordWebhook ? 'Webhook Linked' : 'Webhook'}
            </span>
          </button>

          <button
            className="va-tab-btn"
            onClick={toggleSound}
            style={{ padding: '0.55rem 0.75rem' }}
            title={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {soundMuted ? <IconVolumeMute size={14} color="#888888" /> : <IconVolume size={14} color="#facc15" />}
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
        <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
          <div className="vyaps-card-header" style={{ borderColor: '#161616' }}>
            <span className="vyaps-brand" style={{ color: '#facc15' }}>Wolf Tape Reader</span>
            <span className="vyaps-title">Unlimited Alerts Manager</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="va-tab-btn active"
                style={{ color: '#facc15', borderColor: '#facc15' }}
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
            <div style={{ padding: '3rem', textAlign: 'center', color: '#666666' }}>
              <IconBell size={28} style={{ marginBottom: '0.5rem' }} />
              <p>No active alerts. Click any coin row in the table to set an alert!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    background: '#090909',
                    border: `1px solid ${alert.triggered ? '#facc15' : '#1c1c1c'}`,
                    borderRadius: '6px',
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
                        <span style={{ color: '#ffffff', fontWeight: 700 }}>{alert.symbol}</span>
                        <span
                          className={`pivot-pill ${alert.triggered ? 'is-close' : ''}`}
                          style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                        >
                          {alert.triggered ? 'TRIGGERED ' + alert.triggeredAt : 'ACTIVE'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#888888', marginTop: '0.15rem' }}>
                        {alert.type === 'price_above' ? 'Price >= $' : 'Price <= $'}
                        {alert.targetPrice} {alert.note && <span> &bull; &ldquo;{alert.note}&rdquo;</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    style={{ background: 'none', border: 'none', color: '#666666', cursor: 'pointer', padding: '0.4rem' }}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── TWO-COLOR PITCH BLACK TABLE (BULLISH OR BEARISH) ── */
        <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
          <div className="vyaps-card-header" style={{ borderColor: '#161616' }}>
            <span className="vyaps-brand" style={{ color: '#facc15' }}>Wolf Tape Reader</span>
            <span className="vyaps-title">
              {activeTab === 'bull' ? 'Bullish States' : 'Bearish States'}
            </span>
            <div className="vyaps-meta">
              <span>{activeTab === 'bull' ? 'Above all VALs &bull; Testing Support' : 'Below all VAHs &bull; Testing Resistance'}</span>
              <span>&bull;</span>
              <span>Synced {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
            </div>
          </div>

          {loading && !data ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#666666' }}>
              <IconRefresh size={26} className="spin" style={{ marginBottom: '0.5rem' }} />
              <p>Filtering coins by Value Area structure...</p>
            </div>
          ) : (
            <div className="vyaps-table-wrapper" style={{ background: '#000000' }}>
              <table className="vyaps-table" style={{ background: '#000000' }}>
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
                      <td colSpan="10" style={{ padding: '3rem', textAlign: 'center', color: '#666666' }}>
                        No coins currently qualify for this state.
                      </td>
                    </tr>
                  ) : (
                    currentList.map((row) => (
                      <tr
                        key={row.symbol}
                        className="vyaps-row"
                        onClick={() => openAlertModalFor(row, row.spot)}
                        title={`Click to set alert for ${row.symbol} (Spot: $${row.spot})`}
                      >
                        {/* 1. Symbol */}
                        <td>
                          <div className="vyaps-symbol-cell">
                            <div className="vyaps-coin-icon">
                              {row.symbol.slice(0, 3)}
                            </div>
                            <span className="vyaps-symbol-name">{row.symbol}</span>
                          </div>
                        </td>

                        {/* 2. pY */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pY.isPos ? 'val-pos' : 'val-neg'} ${row.pY.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pY ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pY.level} | Spot: $${row.spot} | Dist: ${row.pY.text}%`}
                          >
                            {row.pY.text}
                          </span>
                        </td>

                        {/* 3. Y */}
                        <td>
                          <span
                            className={`pivot-pill ${row.Y.isPos ? 'val-pos' : 'val-neg'} ${row.Y.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Y ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.Y.level} | Spot: $${row.spot} | Dist: ${row.Y.text}%`}
                          >
                            {row.Y.text}
                          </span>
                        </td>

                        {/* 4. pQ */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pQ.isPos ? 'val-pos' : 'val-neg'} ${row.pQ.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pQ ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pQ.level} | Spot: $${row.spot} | Dist: ${row.pQ.text}%`}
                          >
                            {row.pQ.text}
                          </span>
                        </td>

                        {/* 5. Q */}
                        <td>
                          <span
                            className={`pivot-pill ${row.Q.isPos ? 'val-pos' : 'val-neg'} ${row.Q.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Q ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.Q.level} | Spot: $${row.spot} | Dist: ${row.Q.text}%`}
                          >
                            {row.Q.text}
                          </span>
                        </td>

                        {/* 6. pM */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pM.isPos ? 'val-pos' : 'val-neg'} ${row.pM.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pM ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pM.level} | Spot: $${row.spot} | Dist: ${row.pM.text}%`}
                          >
                            {row.pM.text}
                          </span>
                        </td>

                        {/* 7. M */}
                        <td>
                          <span
                            className={`pivot-pill ${row.M.isPos ? 'val-pos' : 'val-neg'} ${row.M.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`M ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.M.level} | Spot: $${row.spot} | Dist: ${row.M.text}%`}
                          >
                            {row.M.text}
                          </span>
                        </td>

                        {/* 8. pW */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pW.isPos ? 'val-pos' : 'val-neg'} ${row.pW.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pW ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.pW.level} | Spot: $${row.spot} | Dist: ${row.pW.text}%`}
                          >
                            {row.pW.text}
                          </span>
                        </td>

                        {/* 9. W */}
                        <td>
                          <span
                            className={`pivot-pill ${row.W.isPos ? 'val-pos' : 'val-neg'} ${row.W.isClose ? (activeTab === 'bull' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`W ${activeTab === 'bull' ? 'VAL' : 'VAH'}: $${row.W.level} | Spot: $${row.spot} | Dist: ${row.W.text}%`}
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
            Filtered strictly for assets above all VAL pivots (Bullish State) or below all VAH pivots (Bearish State).
          </div>
        </div>
      )}

      {/* ── Discord / Telegram Webhook Modal ── */}
      {showWebhookSettings && (
        <div className="alts-modal-overlay" onClick={() => setShowWebhookSettings(false)}>
          <div className="alts-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#0a0a0a', border: '1px solid #222222' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: '#facc15' }}>
                <IconZap size={18} />
                Mobile Phone Webhook Alerts
              </span>
              <button className="modal-close-btn" onClick={() => setShowWebhookSettings(false)}>
                <IconX size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#888888', lineHeight: 1.4 }}>
              Want your phone to buzz whenever a coin reaches support or resistance?
              Paste your Discord or Telegram webhook URL below. Wolf Tape Reader will push instant alerts straight to your phone!
            </p>

            <div className="modal-form-group">
              <label className="modal-form-label" style={{ color: '#888888' }}>Webhook URL</label>
              <input
                type="url"
                className="modal-input"
                style={{ background: '#000000', color: '#ffffff', borderColor: '#222222' }}
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhook}
                onChange={(e) => saveWebhook(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
              <button
                className="alts-btn"
                style={{ flex: 1, justifyContent: 'center', background: '#facc15', color: '#000000', fontWeight: 700 }}
                onClick={() => {
                  if (discordWebhook && discordWebhook.startsWith('http')) {
                    fetch(discordWebhook, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: '🐺 **Wolf Tape Reader Pivot Alert Engine Active!** Ready to send Value Area alerts to your phone!',
                      }),
                    }).then(() => {
                      addToast({ title: 'Webhook Test Sent', message: 'Check your phone channel!' });
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
          <div className="alts-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#0a0a0a', border: '1px solid #222222' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: '#facc15' }}>
                <IconBell size={18} />
                Set Alert &bull; {selectedCoinForAlert.symbol}
              </span>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateAlert} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="modal-form-group">
                <label className="modal-form-label" style={{ color: '#888888' }}>Condition</label>
                <select
                  className="modal-select"
                  style={{ background: '#000000', color: '#ffffff', borderColor: '#222222' }}
                  value={alertConditionType}
                  onChange={(e) => setAlertConditionType(e.target.value)}
                >
                  <option value="price_above">Price crosses ABOVE target</option>
                  <option value="price_below">Price drops BELOW target</option>
                  <option value="at_val">Touches Value Area Support (VAL)</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" style={{ color: '#888888' }}>
                  Target Price (Spot: ${selectedCoinForAlert.spot})
                </label>
                <input
                  type="number"
                  step="any"
                  className="modal-input"
                  style={{ background: '#000000', color: '#ffffff', borderColor: '#222222' }}
                  placeholder="Target price..."
                  value={alertTargetPrice}
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label" style={{ color: '#888888' }}>Custom Note (Optional)</label>
                <input
                  type="text"
                  className="modal-input"
                  style={{ background: '#000000', color: '#ffffff', borderColor: '#222222' }}
                  placeholder="e.g. Look for VAL support bounce entry..."
                  value={alertNote}
                  onChange={(e) => setAlertNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  className="alts-btn"
                  style={{ flex: 1, justifyContent: 'center', background: '#facc15', color: '#000000', fontWeight: 700 }}
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

      {/* ── Toast Floating Notifications (Guaranteed Unique Keys) ── */}
      <div className="alert-toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="alert-toast" style={{ background: '#0a0a0a', borderColor: '#facc15' }}>
            <IconBell size={18} color="#facc15" />
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#facc15', fontSize: '0.85rem' }}>{toast.title}</strong>
              <div style={{ color: '#ffffff', fontSize: '0.78rem', marginTop: '0.1rem' }}>{toast.message}</div>
              {toast.note && (
                <div style={{ color: '#888888', fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  &ldquo;{toast.note}&rdquo;
                </div>
              )}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              style={{ background: 'none', border: 'none', color: '#888888', cursor: 'pointer' }}
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
