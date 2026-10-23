'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IconRadar,
  IconTrendUp,
  IconTrendDown,
  IconRefresh,
  IconBell,
  IconRocket,
  IconRock,
  IconSearch,
  IconTrash,
  IconVolume,
  IconVolumeMute,
  IconX,
  IconCheck,
  IconTarget,
  IconZap,
  IconBitcoin,
} from './Icons';
import { playAlertChime } from '@/lib/alertSound';

const STORAGE_KEY_ALERTS = 'wolf_tape_reader_alerts_v1';
const STORAGE_KEY_SOUND = 'wolf_tape_reader_sound_muted';

export default function AltsTapeReader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters & State
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'rock' | 'rocket' | 'yo' | 'pump' | 'bleed' | 'alerts'
  const [searchQuery, setSearchQuery] = useState('');
  const [marketSimulation, setMarketSimulation] = useState('auto'); // 'auto' | 'dip' | 'pump'
  const [soundMuted, setSoundMuted] = useState(false);

  // Alerts Management (Unlimited stored in localStorage)
  const [alerts, setAlerts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCoinForAlert, setSelectedCoinForAlert] = useState(null);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertConditionType, setAlertConditionType] = useState('price_above'); // 'price_above' | 'price_below' | 'touches_yo' | 'rock_holder'
  const [alertNote, setAlertNote] = useState('');
  const [toasts, setToasts] = useState([]);
  const [notifPermission, setNotifPermission] = useState('default');
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [showWebhookSettings, setShowWebhookSettings] = useState(false);

  // Load sound, webhook & saved alerts on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission);
      }
      const savedMuted = localStorage.getItem(STORAGE_KEY_SOUND);
      if (savedMuted !== null) setSoundMuted(savedMuted === 'true');

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
          body: 'Desktop Alerts Enabled! You will be notified even with the tab minimized.',
          icon: '/icon.svg',
        });
        playAlertChime();
      }
    }
  };

  const saveWebhook = (url) => {
    setDiscordWebhook(url);
    try {
      localStorage.setItem('wolf_tape_discord_webhook', url);
    } catch (e) {}
  };

  // Save alerts to localStorage
  const saveAlerts = useCallback((newAlerts) => {
    setAlerts(newAlerts);
    try {
      localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(newAlerts));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, []);

  // Toggle Sound Mute
  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem(STORAGE_KEY_SOUND, next ? 'true' : 'false');
    if (!next) {
      playAlertChime();
    }
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

      // Check alerts against live data
      checkAlerts(json.alts, json.btcBenchmark);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto refresh interval (every 12 seconds)
  useEffect(() => {
    fetchTapeData();
    const interval = setInterval(fetchTapeData, 12000);
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

  // Alert Evaluation Engine
  const checkAlerts = (altsList, btc) => {
    if (!altsList || !alerts.length) return;

    let triggeredAny = false;
    const updated = alerts.map((a) => {
      if (a.triggered) return a; // already fired

      const alt = altsList.find((x) => x.symbol === a.symbol || x.displaySymbol === a.displaySymbol);
      if (!alt) return a;

      let isTriggered = false;
      let triggerMsg = '';

      if (a.type === 'price_above' && alt.lastPrice >= a.targetPrice) {
        isTriggered = true;
        triggerMsg = `${alt.displaySymbol} crossed ABOVE $${a.targetPrice}`;
      } else if (a.type === 'price_below' && alt.lastPrice <= a.targetPrice) {
        isTriggered = true;
        triggerMsg = `${alt.displaySymbol} dropped BELOW $${a.targetPrice}`;
      } else if (a.type === 'touches_yo' && alt.absPctFromYO <= 0.6) {
        isTriggered = true;
        triggerMsg = `${alt.displaySymbol} touched YEARLY OPEN at $${alt.yoFormatted} (Dist: ${alt.pctFromYO}%)`;
      } else if (a.type === 'rock_holder' && (alt.tapeCategory === 'rock_holder' || alt.btcDelta >= 2.5)) {
        isTriggered = true;
        triggerMsg = `${alt.displaySymbol} is HOLDING LIKE A ROCK vs BTC (Delta: +${alt.btcDelta}%)`;
      }

      if (isTriggered) {
        triggeredAny = true;
        // 1. In-app toast banner
        addToast({
          id: Date.now() + Math.random(),
          title: `ALERT TRIGGERED: ${alt.displaySymbol}`,
          message: triggerMsg,
          note: a.note,
        });

        // 2. Native Desktop Notification (Windows popup even if tab minimized)
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`🚨 WOLF ALERT: ${alt.displaySymbol}`, {
              body: `${triggerMsg}${a.note ? `\nNote: ${a.note}` : ''}`,
              icon: '/icon.svg',
              requireInteraction: true,
            });
          } catch (err) {}
        }

        // 3. Flashing browser tab title
        flashTabTitle(`🚨 [TRIGGERED] ${alt.displaySymbol}!`);

        // 4. Discord / Telegram Webhook dispatch
        if (discordWebhook && discordWebhook.startsWith('http')) {
          try {
            fetch(discordWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `🐺 **Wolf Tape Reader Alert Triggered!**\n**Asset**: \`${alt.displaySymbol}\`\n**Condition**: ${triggerMsg}\n**Current Spot**: \`${alt.priceFormatted}\` | **Yearly Open**: \`${alt.yoFormatted}\`${a.note ? `\n**Note**: _${a.note}_` : ''}`,
              }),
            }).catch(() => {});
          } catch (err) {}
        }

        return { ...a, triggered: true, triggeredAt: new Date().toLocaleTimeString() };
      }
      return a;
    });

    if (triggeredAny) {
      if (!soundMuted) {
        playAlertChime();
      }
      saveAlerts(updated);
    }
  };

  const addToast = (toast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 8000);
  };

  // Add a new alert (Unlimited!)
  const handleCreateAlert = (e) => {
    e.preventDefault();
    if (!selectedCoinForAlert) return;

    const targetPriceNum = parseFloat(alertTargetPrice);
    if ((alertConditionType === 'price_above' || alertConditionType === 'price_below') && (!targetPriceNum || isNaN(targetPriceNum))) {
      alert('Please enter a valid numeric target price');
      return;
    }

    const newAlert = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      symbol: selectedCoinForAlert.symbol,
      displaySymbol: selectedCoinForAlert.displaySymbol,
      name: selectedCoinForAlert.name,
      type: alertConditionType,
      targetPrice: targetPriceNum || selectedCoinForAlert.lastPrice,
      yo: selectedCoinForAlert.yo,
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
      message: `Watching ${newAlert.displaySymbol} for ${alertConditionType.replace('_', ' ')}`,
    });
  };

  const handleDeleteAlert = (id) => {
    const updated = alerts.filter((a) => a.id !== id);
    saveAlerts(updated);
  };

  const handleClearTriggered = () => {
    const updated = alerts.filter((a) => !a.triggered);
    saveAlerts(updated);
  };

  const openAlertModalFor = (coin, condition = 'price_above') => {
    setSelectedCoinForAlert(coin);
    setAlertConditionType(condition);
    if (condition === 'touches_yo') {
      setAlertTargetPrice(coin.yo.toString());
    } else {
      setAlertTargetPrice(coin.lastPrice.toString());
    }
    setShowAddModal(true);
  };

  // Filter and sort the watchlist
  const filteredAlts = useMemo(() => {
    if (!data?.alts) return [];

    let list = [...data.alts];

    // Market simulation adjustments
    const isDippingMode = marketSimulation === 'dip' || (marketSimulation === 'auto' && data.btcBenchmark.isDipping);
    const isPumpingMode = marketSimulation === 'pump' || (marketSimulation === 'auto' && data.btcBenchmark.isPumping);

    // Apply Tab Filter
    if (activeFilter === 'rock') {
      // Coins holding strong / absorption
      list = list.filter((a) => a.tapeCategory === 'rock_holder' || a.btcDelta >= 1.5 || (isDippingMode && a.change24h > 0));
      list.sort((a, b) => b.btcDelta - a.btcDelta);
    } else if (activeFilter === 'rocket') {
      // Coins pulling hardest upside / bounce velocity
      list = list.filter((a) => a.bounceVelocity >= 2.5 || a.tapeCategory === 'rocket_pull');
      list.sort((a, b) => b.bounceVelocity - a.bounceVelocity);
    } else if (activeFilter === 'yo') {
      // Screener: Coins at/near Yearly Open (closest to YO at the top)
      list.sort((a, b) => a.absPctFromYO - b.absPctFromYO);
    } else if (activeFilter === 'pump') {
      // Pump multipliers
      list = list.filter((a) => a.btcDelta >= 1.5 && a.change24h > 1.0);
      list.sort((a, b) => b.btcDelta - a.btcDelta);
    } else if (activeFilter === 'bleed') {
      // Bleeders / Weak hands
      list = list.filter((a) => a.btcDelta <= -1.5 || a.change24h < -1.0);
      list.sort((a, b) => a.btcDelta - b.btcDelta);
    } else {
      // Default: sort by Relative Delta vs BTC
      list.sort((a, b) => b.btcDelta - a.btcDelta);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => a.displaySymbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
    }

    return list;
  }, [data, activeFilter, searchQuery, marketSimulation]);

  // Counts for Badges
  const counts = useMemo(() => {
    if (!data?.alts) return { rock: 0, rocket: 0, yo: 0, pump: 0, bleed: 0 };
    return {
      rock: data.alts.filter((a) => a.tapeCategory === 'rock_holder' || a.btcDelta >= 1.5).length,
      rocket: data.alts.filter((a) => a.bounceVelocity >= 2.5 || a.tapeCategory === 'rocket_pull').length,
      yo: data.alts.filter((a) => a.absPctFromYO <= 2.5).length,
      pump: data.alts.filter((a) => a.btcDelta >= 1.5 && a.change24h > 1.0).length,
      bleed: data.alts.filter((a) => a.btcDelta <= -1.5 || a.change24h < -1.0).length,
    };
  }, [data]);

  return (
    <div className="alts-container">
      {/* ── Top Hero: Live BTC Benchmark & Relative Tape Controller ── */}
      <div className="alts-hero">
        <div className="alts-hero-grid">
          <div className="alts-hero-left">
            <div className="alts-hero-title-row">
              <span className="alts-hero-title">
                <IconRadar size={22} color="var(--wolf-yellow-bright)" />
                Alts Relative Tape &amp; Yearly Open Screener
              </span>
              <span className="badge-yo-target" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                Strict Whitelist &bull; 55 Perps
              </span>
            </div>
            <p className="alts-hero-desc">
              Real-time institutional relative strength scanner. Pinpoints which altcoins hold like a rock during Bitcoin dips,
              which launch with explosive upside momentum on bounces, and which coins are testing their 2026 Yearly Open line.
            </p>
          </div>

          <div className="alts-hero-actions">
            <button
              className="alts-btn alts-btn-yellow"
              onClick={() => {
                if (data?.alts?.length) {
                  openAlertModalFor(data.alts[0]);
                }
              }}
              title="Add Unlimited Custom Alert"
            >
              <IconBell size={15} />
              <span>+ Add Alert</span>
            </button>

            {notifPermission !== 'granted' ? (
              <button
                className="alts-btn alts-btn-yellow"
                onClick={requestDesktopPermission}
                title="Enable Native Browser Desktop Notifications"
              >
                <IconBell size={15} />
                <span>Enable Desktop Alerts</span>
              </button>
            ) : (
              <button
                className="alts-btn alts-btn-ghost"
                style={{ color: 'var(--bullish)', borderColor: 'rgba(34, 197, 94, 0.35)' }}
                onClick={() => {
                  new Notification('🐺 Wolf Tape Reader', { body: 'Desktop alerts are active!' });
                  playAlertChime();
                }}
                title="Desktop Alerts Active (Click to test chime)"
              >
                <IconCheck size={14} color="var(--bullish)" />
                <span>Desktop Alerts Active</span>
              </button>
            )}

            <button
              className="alts-btn alts-btn-ghost"
              onClick={() => setShowWebhookSettings(true)}
              title="Configure Discord Webhook for Mobile Alerts"
            >
              <IconZap size={14} color={discordWebhook ? 'var(--wolf-yellow-bright)' : 'var(--text-muted)'} />
              <span>{discordWebhook ? 'Webhook Linked' : 'Webhook'}</span>
            </button>

            <button className="alts-btn alts-btn-ghost" onClick={toggleSound} title="Mute/Unmute audio alert chime">
              {soundMuted ? <IconVolumeMute size={15} color="var(--bearish)" /> : <IconVolume size={15} color="var(--wolf-yellow-bright)" />}
              <span>{soundMuted ? 'Muted' : 'Sound On'}</span>
            </button>

            <button className="alts-btn alts-btn-ghost" onClick={fetchTapeData} title="Instant Refresh">
              <IconRefresh size={14} />
              <span>Sync</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Live Market Benchmark Cards ── */}
      <div className="alts-benchmark-bar">
        <div className="benchmark-card" style={{ borderColor: 'rgba(250, 204, 21, 0.3)' }}>
          <div className="benchmark-label">
            <IconBitcoin size={14} color="var(--gold)" />
            <span>BTC Benchmark (Spot)</span>
          </div>
          <div className="benchmark-val">{data?.btcBenchmark?.priceFormatted || '--'}</div>
          <div
            className="benchmark-sub"
            style={{ color: (data?.btcBenchmark?.change24h || 0) >= 0 ? 'var(--bullish)' : 'var(--bearish)' }}
          >
            {(data?.btcBenchmark?.change24h || 0) >= 0 ? '+' : ''}
            {data?.btcBenchmark?.change24h}% (24h)
          </div>
        </div>

        <div className="benchmark-card">
          <div className="benchmark-label">
            <IconRock size={14} color="var(--wolf-yellow-bright)" />
            <span>Holding Like a Rock</span>
          </div>
          <div className="benchmark-val" style={{ color: 'var(--wolf-yellow-bright)' }}>
            {counts.rock}
          </div>
          <div className="benchmark-sub" style={{ color: 'var(--text-muted)' }}>
            Institutional Bid Absorption
          </div>
        </div>

        <div className="benchmark-card">
          <div className="benchmark-label">
            <IconRocket size={14} color="#38bdf8" />
            <span>Rocket Bouncers</span>
          </div>
          <div className="benchmark-val" style={{ color: '#38bdf8' }}>
            {counts.rocket}
          </div>
          <div className="benchmark-sub" style={{ color: 'var(--text-muted)' }}>
            Hardest Pull Upside off Lows
          </div>
        </div>

        <div className="benchmark-card">
          <div className="benchmark-label">
            <IconTarget size={14} color="#ffe600" />
            <span>Near Yearly Open</span>
          </div>
          <div className="benchmark-val" style={{ color: '#ffe600' }}>
            {counts.yo}
          </div>
          <div className="benchmark-sub" style={{ color: 'var(--text-muted)' }}>
            Within &plusmn;2.5% of 2026 Open
          </div>
        </div>

        <div className="benchmark-card">
          <div className="benchmark-label">
            <IconBell size={14} color={alerts.length > 0 ? 'var(--wolf-yellow-bright)' : 'var(--text-muted)'} />
            <span>Active Alerts</span>
          </div>
          <div className="benchmark-val" style={{ color: alerts.length > 0 ? 'var(--wolf-yellow-bright)' : '#fff' }}>
            {alerts.length}
          </div>
          <div className="benchmark-sub" style={{ color: 'var(--text-muted)' }}>
            Unlimited Stored Alerts
          </div>
        </div>
      </div>

      {/* ── Context Simulation Bar ── */}
      <div className="alts-context-bar">
        <div className="context-label">
          <IconZap size={15} color="var(--wolf-yellow)" />
          <span>
            Tape Lens: <strong>{marketSimulation === 'auto' ? 'Auto-Detect Live Tape' : marketSimulation === 'dip' ? 'Simulating BTC Dip' : 'Simulating BTC Pump'}</strong>
          </span>
        </div>
        <div className="context-pills">
          <button
            className={`context-pill ${marketSimulation === 'auto' ? 'active' : ''}`}
            onClick={() => setMarketSimulation('auto')}
            title="Auto detect based on live market conditions"
          >
            Auto Live
          </button>
          <button
            className={`context-pill ${marketSimulation === 'dip' ? 'active' : ''}`}
            onClick={() => setMarketSimulation('dip')}
            title="Focus on Rock Holders & absorption during dumps"
          >
            BTC Dip Scenario
          </button>
          <button
            className={`context-pill ${marketSimulation === 'pump' ? 'active' : ''}`}
            onClick={() => setMarketSimulation('pump')}
            title="Focus on Pump Multipliers & upside leaders"
          >
            BTC Pump Scenario
          </button>
        </div>
      </div>

      {/* ── Sub-Tabs & Search Filter Bar ── */}
      <div className="alts-filters-bar">
        <div className="alts-filter-tabs">
          <button
            className={`alts-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            <span>All Watchlist</span>
            <span className="alts-filter-count">{data?.alts?.length || 55}</span>
          </button>

          <button
            className={`alts-filter-btn ${activeFilter === 'rock' ? 'active' : ''}`}
            onClick={() => setActiveFilter('rock')}
            title="Coins holding like a rock when BTC dips"
          >
            <IconRock size={13} color="var(--wolf-yellow-bright)" />
            <span>Rock Holders</span>
            <span className="alts-filter-count">{counts.rock}</span>
          </button>

          <button
            className={`alts-filter-btn ${activeFilter === 'rocket' ? 'active' : ''}`}
            onClick={() => setActiveFilter('rocket')}
            title="Coins pulling hardest upside"
          >
            <IconRocket size={13} color="#38bdf8" />
            <span>Rocket Bouncers</span>
            <span className="alts-filter-count">{counts.rocket}</span>
          </button>

          <button
            className={`alts-filter-btn ${activeFilter === 'yo' ? 'active' : ''}`}
            onClick={() => setActiveFilter('yo')}
            title="Coins at or nearest to their Yearly Open"
          >
            <IconTarget size={13} color="#ffe600" />
            <span>At Yearly Open</span>
            <span className="alts-filter-count">{counts.yo}</span>
          </button>

          <button
            className={`alts-filter-btn ${activeFilter === 'pump' ? 'active' : ''}`}
            onClick={() => setActiveFilter('pump')}
            title="Leading upside during pumps"
          >
            <IconTrendUp size={13} color="var(--bullish)" />
            <span>Pump Multipliers</span>
            <span className="alts-filter-count">{counts.pump}</span>
          </button>

          <button
            className={`alts-filter-btn ${activeFilter === 'bleed' ? 'active' : ''}`}
            onClick={() => setActiveFilter('bleed')}
            title="Dumping harder or diverging weak"
          >
            <IconTrendDown size={13} color="var(--bearish)" />
            <span>Bleeders</span>
            <span className="alts-filter-count">{counts.bleed}</span>
          </button>

          <button
            className={`alts-filter-btn ${activeFilter === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveFilter('alerts')}
            title="Manage unlimited alerts"
          >
            <IconBell size={13} color="var(--wolf-yellow-bright)" />
            <span>My Alerts</span>
            <span className="alts-filter-count">{alerts.length}</span>
          </button>
        </div>

        <div className="alts-search-box">
          <IconSearch size={14} color="var(--text-muted)" />
          <input
            type="text"
            className="alts-search-input"
            placeholder="Search coin (e.g. SOL, HYPE, PENGU)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <IconX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── VIEW: MY ALERTS MANAGER ── */}
      {activeFilter === 'alerts' ? (
        <div className="alts-table-wrap" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: 'var(--wolf-yellow-bright)', fontSize: '1.1rem', fontWeight: 800 }}>
              Unlimited Watchlist Alerts ({alerts.length})
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="alts-btn alts-btn-yellow"
                onClick={() => {
                  if (data?.alts?.length) openAlertModalFor(data.alts[0]);
                }}
              >
                <IconBell size={14} />
                <span>+ Create Alert</span>
              </button>
              {alerts.some((a) => a.triggered) && (
                <button className="alts-btn alts-btn-ghost" onClick={handleClearTriggered}>
                  <IconTrash size={14} />
                  <span>Clear Fired Alerts</span>
                </button>
              )}
            </div>
          </div>

          {alerts.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <IconBell size={32} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
              <p>No active alerts set yet.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Click &ldquo;+ Add Alert&rdquo; or click the bell icon on any coin to set unlimited alerts!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    background: alert.triggered ? 'rgba(250, 204, 21, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${alert.triggered ? 'var(--wolf-yellow)' : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: '10px',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: alert.triggered ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconBell size={18} color={alert.triggered ? 'var(--wolf-yellow-bright)' : 'var(--text-secondary)'} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{alert.displaySymbol}</strong>
                        <span
                          className={`tape-badge ${alert.triggered ? 'badge-yo-target' : 'badge-neutral'}`}
                          style={{ fontSize: '0.65rem' }}
                        >
                          {alert.triggered ? 'TRIGGERED ' + alert.triggeredAt : 'ACTIVE'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        Condition:{' '}
                        <strong style={{ color: 'var(--wolf-yellow-bright)' }}>
                          {alert.type === 'price_above'
                            ? `Price >= $${alert.targetPrice}`
                            : alert.type === 'price_below'
                            ? `Price <= $${alert.targetPrice}`
                            : alert.type === 'touches_yo'
                            ? `Touches Yearly Open ($${alert.yo})`
                            : 'Holding Like A Rock vs BTC'}
                        </strong>
                        {alert.note && <span> &bull; Note: &ldquo;{alert.note}&rdquo;</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0.4rem',
                    }}
                    title="Delete Alert"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── VIEW: MAIN ALTS RADAR TABLE ── */
        <div className="alts-table-wrap">
          {loading && !data ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <IconRefresh size={28} className="spin" style={{ marginBottom: '0.5rem' }} />
              <p>Scanning 55 Bybit Linear Perpetual Tickers &amp; Calculating Yearly Opens...</p>
            </div>
          ) : (
            <table className="alts-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Last Price</th>
                  <th>24h Change</th>
                  <th>vs BTC Delta</th>
                  <th>Bounce off Low</th>
                  <th>2026 Yearly Open</th>
                  <th>Tape Read</th>
                  <th style={{ textAlign: 'right' }}>Alert</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlts.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No matching coins found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredAlts.map((alt) => {
                    const isPos = alt.change24h >= 0;
                    const isDeltaPos = alt.btcDelta >= 0;

                    return (
                      <tr key={alt.symbol}>
                        {/* 1. Symbol */}
                        <td>
                          <div className="alt-symbol-cell">
                            <span className="alt-symbol-name">{alt.displaySymbol}</span>
                            <span className="alt-symbol-sub">{alt.name}</span>
                          </div>
                        </td>

                        {/* 2. Price */}
                        <td>
                          <span className="alt-price-cell">{alt.priceFormatted}</span>
                        </td>

                        {/* 3. 24h Change */}
                        <td>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: isPos ? 'var(--bullish)' : 'var(--bearish)',
                            }}
                          >
                            {isPos ? '+' : ''}
                            {alt.change24h}%
                          </span>
                        </td>

                        {/* 4. Relative Delta vs BTC */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className={`delta-val ${isDeltaPos ? 'delta-pos' : 'delta-neg'}`}>
                              {isDeltaPos ? '+' : ''}
                              {alt.btcDelta}%
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {isDeltaPos ? 'Outperforming' : 'Lagging'} BTC
                            </span>
                          </div>
                        </td>

                        {/* 5. Bounce Velocity off Low */}
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                            +{alt.bounceVelocity}%
                          </span>
                        </td>

                        {/* 6. Yearly Open */}
                        <td>
                          <div className="yo-cell">
                            <span className="yo-price">{alt.yoFormatted}</span>
                            <span
                              className="yo-diff"
                              style={{
                                color: alt.isAtYO
                                  ? 'var(--wolf-yellow-bright)'
                                  : alt.pctFromYO >= 0
                                  ? 'var(--bullish)'
                                  : 'var(--bearish)',
                              }}
                            >
                              {alt.isAtYO ? '🎯 AT YO' : `${alt.pctFromYO > 0 ? '+' : ''}${alt.pctFromYO}%`}
                            </span>
                          </div>
                        </td>

                        {/* 7. Tape Read Badge */}
                        <td>
                          {alt.isAtYO ? (
                            <span className="tape-badge badge-yo-target" title="Trading right at 2026 Yearly Open">
                              🎯 AT YEARLY OPEN
                            </span>
                          ) : alt.tapeCategory === 'rock_holder' ? (
                            <span className="tape-badge badge-rock" title={alt.tapeReason}>
                              🛡️ ROCK HOLDER
                            </span>
                          ) : alt.tapeCategory === 'rocket_pull' ? (
                            <span className="tape-badge badge-rocket" title={alt.tapeReason}>
                              🚀 ROCKET PULL
                            </span>
                          ) : alt.tapeCategory === 'pump_leader' ? (
                            <span className="tape-badge badge-pump" title={alt.tapeReason}>
                              ⚡ PUMP LEADER
                            </span>
                          ) : alt.tapeCategory === 'bleeder' ? (
                            <span className="tape-badge badge-bleeder" title={alt.tapeReason}>
                              🩸 BLEEDER
                            </span>
                          ) : (
                            <span className="tape-badge badge-neutral">SYNC BTC</span>
                          )}
                        </td>

                        {/* 8. Quick Alert Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            <button
                              className="alts-btn alts-btn-ghost"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
                              onClick={() => openAlertModalFor(alt, 'touches_yo')}
                              title={`Set Alert at Yearly Open ($${alt.yo})`}
                            >
                              <IconTarget size={12} color="#ffe600" />
                              <span>YO Alert</span>
                            </button>
                            <button
                              className="alts-btn alts-btn-ghost"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
                              onClick={() => openAlertModalFor(alt, 'price_above')}
                              title="Set Custom Price Alert"
                            >
                              <IconBell size={12} color="var(--wolf-yellow-bright)" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Unlimited Alert Creation Modal ── */}
      {showAddModal && selectedCoinForAlert && (
        <div className="alts-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="alts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                <IconBell size={18} color="var(--wolf-yellow-bright)" />
                Create Unlimited Alert
              </span>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateAlert} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="modal-form-group">
                <label className="modal-form-label">Asset</label>
                <select
                  className="modal-select"
                  value={selectedCoinForAlert.symbol}
                  onChange={(e) => {
                    const match = data?.alts?.find((x) => x.symbol === e.target.value);
                    if (match) setSelectedCoinForAlert(match);
                  }}
                >
                  {data?.alts?.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.displaySymbol} - {c.name} (${c.priceFormatted})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-form-label">Condition</label>
                <select
                  className="modal-select"
                  value={alertConditionType}
                  onChange={(e) => {
                    const type = e.target.value;
                    setAlertConditionType(type);
                    if (type === 'touches_yo') {
                      setAlertTargetPrice(selectedCoinForAlert.yo.toString());
                    }
                  }}
                >
                  <option value="price_above">Price crosses ABOVE target</option>
                  <option value="price_below">Price drops BELOW target</option>
                  <option value="touches_yo">Touches 2026 Yearly Open (${selectedCoinForAlert.yo})</option>
                  <option value="rock_holder">Holds Like A Rock during BTC dip (+2.5% Delta)</option>
                </select>
              </div>

              {alertConditionType !== 'touches_yo' && alertConditionType !== 'rock_holder' && (
                <div className="modal-form-group">
                  <label className="modal-form-label">
                    Target Price (Current: {selectedCoinForAlert.priceFormatted})
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="modal-input"
                    placeholder="e.g. 150.00"
                    value={alertTargetPrice}
                    onChange={(e) => setAlertTargetPrice(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="modal-form-group">
                <label className="modal-form-label">Custom Note (Optional)</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Look for SFP rejection, enter swing long..."
                  value={alertNote}
                  onChange={(e) => setAlertNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button type="submit" className="alts-btn alts-btn-yellow" style={{ flex: 1, justifyContent: 'center' }}>
                  <IconCheck size={16} />
                  <span>Save Alert</span>
                </button>
                <button
                  type="button"
                  className="alts-btn alts-btn-ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Discord / Telegram Webhook Modal ── */}
      {showWebhookSettings && (
        <div className="alts-modal-overlay" onClick={() => setShowWebhookSettings(false)}>
          <div className="alts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                <IconZap size={18} color="var(--wolf-yellow-bright)" />
                Mobile Alerts Webhook (Discord / Telegram)
              </span>
              <button className="modal-close-btn" onClick={() => setShowWebhookSettings(false)}>
                <IconX size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Want your phone to buzz when an alert triggers while you are away from the computer? Paste a Discord channel webhook URL.
              Wolf Tape Reader will dispatch an instant embed directly to your Discord/Telegram channel!
            </p>

            <div className="modal-form-group">
              <label className="modal-form-label">Discord Webhook URL</label>
              <input
                type="url"
                className="modal-input"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhook}
                onChange={(e) => saveWebhook(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
              <button
                className="alts-btn alts-btn-yellow"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  if (discordWebhook && discordWebhook.startsWith('http')) {
                    fetch(discordWebhook, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: '🐺 **Wolf Tape Reader Test Notification**: Your mobile alerts are active and ready!',
                      }),
                    }).then(() => {
                      addToast({ id: Date.now(), title: 'Webhook Test Sent', message: 'Check your Discord/Telegram channel!' });
                    }).catch(() => {
                      alert('Could not dispatch to webhook URL. Please check the URL.');
                    });
                  }
                  setShowWebhookSettings(false);
                }}
              >
                <IconCheck size={16} />
                <span>Save &amp; Test Webhook</span>
              </button>
              <button className="alts-btn alts-btn-ghost" onClick={() => setShowWebhookSettings(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Floating Notifications ── */}
      <div className="alert-toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="alert-toast">
            <IconBell size={20} color="var(--wolf-yellow-bright)" />
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--wolf-yellow-bright)', fontSize: '0.85rem' }}>{toast.title}</strong>
              <div style={{ color: '#fff', fontSize: '0.78rem', marginTop: '0.1rem' }}>{toast.message}</div>
              {toast.note && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  &ldquo;{toast.note}&rdquo;
                </div>
              )}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
