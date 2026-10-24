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
  IconBlackFlag,
} from './Icons';
import { playAlertChime } from '@/lib/alertSound';
import TwinPatternScanner from './TwinPatternScanner';
import RsiDivergenceScanner from './RsiDivergenceScanner';

const STORAGE_KEY_ALERTS = 'wolf_tape_reader_alerts_v1';
const STORAGE_KEY_SOUND = 'wolf_tape_reader_sound_muted';
const STORAGE_KEY_AUTO_ALERT = 'wolf_tape_auto_alert_support_res';

let globalToastCounter = 0;

export default function AltsTapeReader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);


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

  const handleQuickSetAlert = (alertData) => {
    const newAlert = {
      id: Date.now().toString(),
      symbol: alertData.symbol,
      fullSymbol: alertData.fullSymbol || (alertData.symbol + 'USDT.P'),
      targetPrice: alertData.targetPrice,
      type: alertData.condition || 'price_above',
      note: alertData.note || 'Twin Pattern Match',
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [newAlert, ...alerts];
    setAlerts(updated);
    try {
      localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(updated));
    } catch (e) {}
    showToast(`Alert set for ${alertData.symbol} at ${alertData.targetPrice}`);
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

  // Sub-Tabs: 'bull' (Bullish States) | 'bear' (Bearish States) | 'full' (Full 55 Alts Scan) | 'twin' | 'alerts'
  const [activeTab, setActiveTab] = useState('bull');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundMuted, setSoundMuted] = useState(false);

  // Advanced Confluence & Trap Filters
  const [confluenceFilter, setConfluenceFilter] = useState('all');
  const [timeframeFilter, setTimeframeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('closest');
  const [sortDir, setSortDir] = useState('desc'); // 'asc' or 'desc'

  const handleHeaderSort = (key) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'symbol' || key === 'closest' || key === 'sma200' ? 'asc' : 'desc');
    }
  };

  // Helper: Format turnover volume
  const formatTurnover = (usd) => {
    if (!usd) return '--';
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
    if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
    return `$${usd}`;
  };

  // Dynamic filter counts
  const filterCounts = useMemo(() => {
    if (!data) return {};
    const bull = data.bullishStates || [];
    const bear = data.bearishStates || [];
    const all = data.allCoins || [];

    return {
      bullAll: bull.length,
      bullConfirmed: bull.filter((x) => x.change24h >= 0).length,
      bullBleed: bull.filter((x) => x.isBleeding).length,
      bullSweet: bull.filter((x) => x.minAbsDist <= 1.5).length,
      bullMomentum: bull.filter((x) => x.change24h >= 3.0).length,
      bullVol: bull.filter((x) => (x.turnover24h || 0) >= 50000000).length,
      bullSma1to3: bull.filter((x) => x.isNear4HSma200).length,
      bullSma3: bull.filter((x) => x.isAt4HSma200).length,
      bullDiv: bull.filter((x) => x.hasBullishDiv).length,

      bearAll: bear.length,
      bearConfirmed: bear.filter((x) => x.change24h <= 0).length,
      bearSqueeze: bear.filter((x) => x.isPumping).length,
      bearSweet: bear.filter((x) => x.minAbsDist <= 1.5).length,
      bearBreakdown: bear.filter((x) => x.change24h <= -3.0).length,
      bearVol: bear.filter((x) => (x.turnover24h || 0) >= 50000000).length,
      bearSma1to3: bear.filter((x) => x.isNear4HSma200).length,
      bearSma3: bear.filter((x) => x.isAt4HSma200).length,
      bearDiv: bear.filter((x) => x.hasBearishDiv).length,

      fullAll: all.length,
      fullBull: all.filter((x) => x.state === 'BULL').length,
      fullBear: all.filter((x) => x.state === 'BEAR').length,
      fullBleed: all.filter((x) => x.isBleeding).length,
      fullGainers: all.filter((x) => x.change24h >= 2.0).length,
      fullBleeders: all.filter((x) => x.change24h <= -2.0).length,
      fullVol: all.filter((x) => (x.turnover24h || 0) >= 50000000).length,
      fullSma1to3: all.filter((x) => x.isNear4HSma200).length,
      fullSma3: all.filter((x) => x.isAt4HSma200).length,
      fullBullDiv: all.filter((x) => x.hasBullishDiv).length,
      fullBearDiv: all.filter((x) => x.hasBearishDiv).length,
    };
  }, [data]);

  // Tab switcher with filter reset
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setConfluenceFilter('all');
    setTimeframeFilter('all');
  };

  // Filter current active list by Confluence, Timeframe, Search query & Sort
  const currentList = useMemo(() => {
    if (!data) return [];
    let list = [];
    if (activeTab === 'bull') {
      list = [...(data.bullishStates || [])];
    } else if (activeTab === 'bear') {
      list = [...(data.bearishStates || [])];
    } else if (activeTab === 'full') {
      list = [...(data.allCoins || [])];
    }

    // 1. Confluence / Trap Filter
    if (confluenceFilter !== 'all') {
      if (confluenceFilter === 'confirmed') {
        list = list.filter(item => activeTab === 'bull' ? item.change24h >= 0 : item.change24h <= 0);
      } else if (confluenceFilter === 'bleed_trap') {
        list = list.filter(item => item.isBleeding || item.grade === 'BLEED_TRAP');
      } else if (confluenceFilter === 'squeeze_trap') {
        list = list.filter(item => item.isPumping || item.grade === 'SQUEEZE_TRAP');
      } else if (confluenceFilter === 'sweet_spot') {
        list = list.filter(item => item.minAbsDist <= 1.5);
      } else if (confluenceFilter === 'momentum') {
        list = list.filter(item => item.change24h >= 3.0);
      } else if (confluenceFilter === 'breakdown') {
        list = list.filter(item => item.change24h <= -3.0);
      } else if (confluenceFilter === 'volume' || confluenceFilter === 'massive_vol') {
        list = list.filter(item => (item.turnover24h || 0) >= 50000000);
      } else if (confluenceFilter === 'sma200_1_3') {
        list = list.filter(item => item.isNear4HSma200);
      } else if (confluenceFilter === 'sma200_3') {
        list = list.filter(item => item.isAt4HSma200);
      } else if (confluenceFilter === 'bull_div') {
        list = list.filter(item => item.hasBullishDiv);
      } else if (confluenceFilter === 'bear_div') {
        list = list.filter(item => item.hasBearishDiv);
      } else if (confluenceFilter === 'bull_only') {
        list = list.filter(item => item.state === 'BULL');
      } else if (confluenceFilter === 'bear_only') {
        list = list.filter(item => item.state === 'BEAR');
      } else if (confluenceFilter === 'gainers') {
        list = list.filter(item => item.change24h >= 2.0);
      } else if (confluenceFilter === 'bleeders') {
        list = list.filter(item => item.change24h <= -2.0);
      }
    }

    // 2. Timeframe Filter
    if (timeframeFilter !== 'all') {
      list = list.filter(item => item.tfType === timeframeFilter);
    }

    // 3. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
    }

    // 4. Sort (Support ascending/descending, volume, and 4H 200 SMA proximity ranking)
    list.sort((a, b) => {
      let res = 0;
      if (sortBy === 'volume' || sortBy === 'turnover24h') {
        res = (b.turnover24h || 0) - (a.turnover24h || 0);
      } else if (sortBy === 'gainers' || sortBy === 'change24h') {
        res = (b.change24h || 0) - (a.change24h || 0);
      } else if (sortBy === 'bleeders') {
        res = (a.change24h || 0) - (b.change24h || 0);
      } else if (sortBy === 'symbol') {
        res = a.symbol.localeCompare(b.symbol);
      } else if (sortBy === 'sma200') {
        const distA = a.distSma200_4h !== null && a.distSma200_4h !== undefined ? Math.abs(a.distSma200_4h) : 999;
        const distB = b.distSma200_4h !== null && b.distSma200_4h !== undefined ? Math.abs(b.distSma200_4h) : 999;
        res = distA - distB;
      } else {
        res = (a.minAbsDist || 0) - (b.minAbsDist || 0);
      }
      return sortDir === 'asc' ? -res : res;
    });

    return list;
  }, [data, activeTab, confluenceFilter, timeframeFilter, sortBy, sortDir, searchQuery]);

  return (
    <div className="va-terminal-wrapper" style={{ background: '#000000', minHeight: '80vh' }}>
      {/* ── Sub-Navigation: Bullish vs Bearish vs Full Scan vs Twin vs Alerts ── */}
      <div className="va-tabs-bar" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
        <div className="va-tab-group">
          <button
            className={`va-tab-btn tab-bull ${activeTab === 'bull' ? 'active' : ''}`}
            onClick={() => handleTabChange('bull')}
          >
            <span>Bullish States</span>
            <span className="va-tab-count" style={{ color: activeTab === 'bull' ? '#22c55e' : '#888888' }}>
              {data?.bullishStates?.length || 0}
            </span>
          </button>

          <button
            className={`va-tab-btn tab-bear ${activeTab === 'bear' ? 'active' : ''}`}
            onClick={() => handleTabChange('bear')}
          >
            <span>Bearish States</span>
            <span className="va-tab-count" style={{ color: activeTab === 'bear' ? '#ef4444' : '#888888' }}>
              {data?.bearishStates?.length || 0}
            </span>
          </button>

          <button
            className={`va-tab-btn ${activeTab === 'full' ? 'active' : ''}`}
            onClick={() => handleTabChange('full')}
            style={{
              borderColor: activeTab === 'full' ? '#38bdf8' : undefined,
              color: activeTab === 'full' ? '#38bdf8' : undefined,
            }}
          >
            <span>Full Scan (55 Alts)</span>
            <span className="va-tab-count" style={{ color: activeTab === 'full' ? '#38bdf8' : '#888888' }}>
              {data?.allCoins?.length || 55}
            </span>
          </button>

          <button
            className={`va-tab-btn ${activeTab === 'div' ? 'active' : ''}`}
            onClick={() => handleTabChange('div')}
            style={{
              borderColor: activeTab === 'div' ? '#38bdf8' : undefined,
              color: activeTab === 'div' ? '#38bdf8' : undefined,
            }}
          >
            <IconRadar size={14} color={activeTab === 'div' ? '#38bdf8' : undefined} />
            <span>RSI Divergences</span>
            <span style={{
              background: '#22c55e',
              color: '#000000',
              fontSize: '0.62rem',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: 3,
            }}>
              PRO
            </span>
          </button>

          <button
            className={`va-tab-btn ${activeTab === 'twin' ? 'active' : ''}`}
            onClick={() => handleTabChange('twin')}
            style={{
              borderColor: activeTab === 'twin' ? '#38bdf8' : undefined,
              color: activeTab === 'twin' ? '#38bdf8' : undefined,
            }}
          >
            <IconZap size={14} color={activeTab === 'twin' ? '#38bdf8' : undefined} />
            <span>Twin Scanner</span>
            <span style={{
              background: '#38bdf8',
              color: '#000000',
              fontSize: '0.62rem',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: 3,
            }}>
              AI
            </span>
          </button>

          <button
            className={`va-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => handleTabChange('alerts')}
          >
            <IconBell size={14} />
            <span>Alerts</span>
            <span className="va-tab-count">{alerts.length}</span>
          </button>
        </div>

        <div className="va-controls-bar">
          {/* Auto-Alert Toggle */}
          <button
            className="va-tab-btn"
            style={{
              color: autoAlertEnabled ? '#38bdf8' : '#888888',
              background: autoAlertEnabled ? '#0c1322' : '#000000',
              border: `1px solid ${autoAlertEnabled ? '#38bdf8' : '#222222'}`,
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
              style={{ color: '#38bdf8', border: '1px solid #38bdf8' }}
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
            <span style={{ fontSize: '0.78rem', color: discordWebhook ? '#38bdf8' : '#888888' }}>
              {discordWebhook ? 'Webhook Linked' : 'Webhook'}
            </span>
          </button>

          <button
            className="va-tab-btn"
            onClick={toggleSound}
            style={{ padding: '0.55rem 0.75rem' }}
            title={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {soundMuted ? <IconVolumeMute size={14} color="#888888" /> : <IconVolume size={14} color="#38bdf8" />}
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

      {/* ── RSI DIVERGENCE SCANNER VIEW ── */}
      {activeTab === 'div' ? (
        <RsiDivergenceScanner onSetAlert={handleQuickSetAlert} />
      ) : activeTab === 'twin' ? (
        <TwinPatternScanner onSetAlert={handleQuickSetAlert} />
      ) : activeTab === 'alerts' ? (
        <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
          <div className="vyaps-card-header" style={{ borderColor: '#161616' }}>
            <span className="vyaps-brand" style={{ color: '#38bdf8' }}>
              <IconBlackFlag size={18} />
              Wolf Tape Reader
            </span>
            <span className="vyaps-title">Unlimited Alerts Manager</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="va-tab-btn active"
                style={{ color: '#38bdf8', borderColor: '#38bdf8' }}
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
                    border: `1px solid ${alert.triggered ? '#22c55e' : '#1c1c1c'}`,
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
        /* ── BLUE / GREEN / RED PITCH BLACK TABLE (BULLISH, BEARISH OR FULL SCAN) ── */
        <div className="vyaps-card" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
          <div className="vyaps-card-header" style={{ borderColor: '#161616', flexWrap: 'wrap', gap: 10 }}>
            <span className="vyaps-brand" style={{ color: '#38bdf8' }}>
              <IconBlackFlag size={18} />
              Wolf Tape Reader
            </span>
            <span className="vyaps-title">
              {activeTab === 'bull' ? 'Bullish States' : activeTab === 'bear' ? 'Bearish States' : 'Full 55 Alts Scanner'}
            </span>
            <div className="vyaps-meta">
              <span>
                {activeTab === 'bull'
                  ? 'Above all VALs • Testing Support • Bleed Traps Screened'
                  : activeTab === 'bear'
                  ? 'Below all VAHs • Testing Resistance • Squeeze Traps Screened'
                  : '55 Whitelisted Alts • Complete Value Area & Momentum Telemetry'}
              </span>
              <span>&bull;</span>
              <span>Synced {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
            </div>
          </div>

          {/* ── Advanced Confluence & Trap Quick-Filter Bar ── */}
          <div style={{
            background: '#040404',
            borderBottom: '1px solid #161616',
            padding: '10px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            {/* Filter Pills */}
            <div className="wolf-filter-pills-scroll">
              {activeTab === 'bull' && (
                <>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('all')}
                  >
                    All Bullish ({filterCounts.bullAll || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'confirmed' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('confirmed')}
                    title="Filter out all bleeding coins - only show coins with positive 24h change"
                  >
                    <span style={{ color: '#22c55e' }}>●</span> Confirmed Green ({filterCounts.bullConfirmed || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bleed_trap' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bleed_trap')}
                    style={{
                      borderColor: confluenceFilter === 'bleed_trap' ? '#ef4444' : undefined,
                      color: confluenceFilter === 'bleed_trap' ? '#f87171' : undefined
                    }}
                    title="Warning: Coins above VAL pivots but currently bleeding negative on the day"
                  >
                    Bleed Warning ⚠️ ({filterCounts.bullBleed || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'sma200_1_3' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('sma200_1_3')}
                    style={{
                      borderColor: confluenceFilter === 'sma200_1_3' ? '#eab308' : undefined,
                      color: confluenceFilter === 'sma200_1_3' ? '#fde047' : undefined
                    }}
                    title="Scan bullish coins within ±1-3% buffer from 4H 200 SMA"
                  >
                    🎯 4H 200 SMA (±1-3%) ({filterCounts.bullSma1to3 || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bull_div' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bull_div')}
                    style={{
                      borderColor: confluenceFilter === 'bull_div' ? '#22c55e' : undefined,
                      color: confluenceFilter === 'bull_div' ? '#22c55e' : undefined
                    }}
                    title="Scan coins printing active Bullish Divergence on 4H (Price Lower Low, RSI Higher Low)"
                  >
                    🟢 Bull Div ({filterCounts.bullDiv || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'sweet_spot' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('sweet_spot')}
                  >
                    Sweet Spot (&lt;1.5%) ({filterCounts.bullSweet || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'momentum' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('momentum')}
                  >
                    Momentum (+3%) ({filterCounts.bullMomentum || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'volume' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('volume')}
                    style={{
                      borderColor: confluenceFilter === 'volume' ? '#38bdf8' : undefined,
                      color: confluenceFilter === 'volume' ? '#38bdf8' : undefined
                    }}
                    title="Filter coins gaining massive volume (Over $50M+ 24h turnover)"
                  >
                    🔥 Massive Vol ($50M+) ({filterCounts.bullVol || 0})
                  </button>
                </>
              )}

              {activeTab === 'bear' && (
                <>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('all')}
                  >
                    All Bearish ({filterCounts.bearAll || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'confirmed' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('confirmed')}
                  >
                    <span style={{ color: '#ef4444' }}>●</span> Confirmed Dump ({filterCounts.bearConfirmed || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'squeeze_trap' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('squeeze_trap')}
                    style={{
                      borderColor: confluenceFilter === 'squeeze_trap' ? '#f59e0b' : undefined,
                      color: confluenceFilter === 'squeeze_trap' ? '#f59e0b' : undefined
                    }}
                    title="Warning: Coins below VAH pivots but currently pumping on the day"
                  >
                    Squeeze Trap ⚠️ ({filterCounts.bearSqueeze || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'sma200_1_3' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('sma200_1_3')}
                    style={{
                      borderColor: confluenceFilter === 'sma200_1_3' ? '#eab308' : undefined,
                      color: confluenceFilter === 'sma200_1_3' ? '#fde047' : undefined
                    }}
                    title="Scan bearish coins within ±1-3% buffer from 4H 200 SMA"
                  >
                    🎯 4H 200 SMA (±1-3%) ({filterCounts.bearSma1to3 || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bear_div' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bear_div')}
                    style={{
                      borderColor: confluenceFilter === 'bear_div' ? '#ef4444' : undefined,
                      color: confluenceFilter === 'bear_div' ? '#ef4444' : undefined
                    }}
                    title="Scan coins printing active Bearish Divergence on 4H (Price Higher High, RSI Lower High)"
                  >
                    🔴 Bear Div ({filterCounts.bearDiv || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'sweet_spot' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('sweet_spot')}
                  >
                    Sweet Spot Short ({filterCounts.bearSweet || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'breakdown' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('breakdown')}
                  >
                    Heavy Breakdown (-3%) ({filterCounts.bearBreakdown || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'volume' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('volume')}
                    style={{
                      borderColor: confluenceFilter === 'volume' ? '#38bdf8' : undefined,
                      color: confluenceFilter === 'volume' ? '#38bdf8' : undefined
                    }}
                    title="Filter coins gaining massive volume (Over $50M+ 24h turnover)"
                  >
                    🔥 Massive Vol ($50M+) ({filterCounts.bearVol || 0})
                  </button>
                </>
              )}

              {activeTab === 'full' && (
                <>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('all')}
                  >
                    All 55 Alts ({filterCounts.fullAll || 55})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'sma200_1_3' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('sma200_1_3')}
                    style={{
                      borderColor: confluenceFilter === 'sma200_1_3' ? '#eab308' : undefined,
                      color: confluenceFilter === 'sma200_1_3' ? '#fde047' : undefined
                    }}
                    title="Scan all coins within ±1-3% buffer from 4H 200 SMA"
                  >
                    🎯 4H 200 SMA (±1-3%) ({filterCounts.fullSma1to3 || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'sma200_3' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('sma200_3')}
                    style={{
                      borderColor: confluenceFilter === 'sma200_3' ? '#eab308' : undefined,
                      color: confluenceFilter === 'sma200_3' ? '#fde047' : undefined
                    }}
                    title="Scan all coins within ±3% of 4H 200 SMA (touch & buffer)"
                  >
                    🎯 Near 4H SMA (≤3%) ({filterCounts.fullSma3 || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bull_div' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bull_div')}
                    style={{
                      borderColor: confluenceFilter === 'bull_div' ? '#22c55e' : undefined,
                      color: confluenceFilter === 'bull_div' ? '#22c55e' : undefined
                    }}
                    title="Filter all coins with active Bullish Divergence on 4H"
                  >
                    🟢 Bull Div ({filterCounts.fullBullDiv || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bear_div' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bear_div')}
                    style={{
                      borderColor: confluenceFilter === 'bear_div' ? '#ef4444' : undefined,
                      color: confluenceFilter === 'bear_div' ? '#ef4444' : undefined
                    }}
                    title="Filter all coins with active Bearish Divergence on 4H"
                  >
                    🔴 Bear Div ({filterCounts.fullBearDiv || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bull_only' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bull_only')}
                  >
                    Bullish ({filterCounts.fullBull || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bear_only' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bear_only')}
                  >
                    Bearish ({filterCounts.fullBear || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bleed_trap' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bleed_trap')}
                    style={{
                      borderColor: confluenceFilter === 'bleed_trap' ? '#ef4444' : undefined,
                      color: confluenceFilter === 'bleed_trap' ? '#f87171' : undefined
                    }}
                  >
                    Bleed Traps ⚠️ ({filterCounts.fullBleed || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'gainers' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('gainers')}
                  >
                    Top Gainers ({filterCounts.fullGainers || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'bleeders' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('bleeders')}
                  >
                    Top Bleeders ({filterCounts.fullBleeders || 0})
                  </button>
                  <button
                    className={`wolf-filter-btn ${confluenceFilter === 'volume' ? 'active' : ''}`}
                    onClick={() => setConfluenceFilter('volume')}
                    style={{
                      borderColor: confluenceFilter === 'volume' ? '#38bdf8' : undefined,
                      color: confluenceFilter === 'volume' ? '#38bdf8' : undefined
                    }}
                    title="Filter coins gaining massive volume (Over $50M+ 24h turnover)"
                  >
                    🔥 Massive Vol ($50M+) ({filterCounts.fullVol || 0})
                  </button>
                </>
              )}
            </div>

            {/* Timeframe & Sorting Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={timeframeFilter}
                onChange={(e) => setTimeframeFilter(e.target.value)}
                style={{
                  background: '#0e0e0e',
                  color: '#ffffff',
                  border: '1px solid #282828',
                  padding: '5px 8px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                }}
              >
                <option value="all">All Pivots</option>
                <option value="weekly">Weekly (pW/W)</option>
                <option value="monthly">Monthly (pM/M)</option>
                <option value="macro">Macro (pQ/Q/pY/Y)</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => {
                  const val = e.target.value;
                  setSortBy(val);
                  setSortDir(val === 'closest' || val === 'symbol' || val === 'sma200' ? 'asc' : 'desc');
                }}
                style={{
                  background: '#0e0e0e',
                  color: '#ffffff',
                  border: '1px solid #282828',
                  padding: '5px 8px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                }}
              >
                <option value="volume">🔥 Sort: Massive Volume ($USD)</option>
                <option value="sma200">🎯 Sort: Closest to 4H 200 SMA</option>
                <option value="closest">Sort: Closest to Pivot</option>
                <option value="gainers">Sort: 24h Gainers (%)</option>
                <option value="bleeders">Sort: 24h Bleeders (%)</option>
                <option value="symbol">Sort: Symbol (A-Z)</option>
              </select>
            </div>
          </div>

          {loading && !data ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#666666' }}>
              <IconRefresh size={26} className="spin" style={{ marginBottom: '0.5rem' }} />
              <p>Filtering coins by Value Area structure &amp; 24h momentum...</p>
            </div>
          ) : (
            <div className="vyaps-table-wrapper" style={{ background: '#000000' }}>
              <table className="vyaps-table" style={{ background: '#000000' }}>
                <thead>
                  <tr>
                    <th
                      onClick={() => handleHeaderSort('symbol')}
                      style={{ cursor: 'pointer', userSelect: 'none', transition: 'color 0.15s ease' }}
                      title="Click to sort by Symbol"
                    >
                      Symbol {sortBy === 'symbol' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      onClick={() => handleHeaderSort('change24h')}
                      style={{ cursor: 'pointer', userSelect: 'none', transition: 'color 0.15s ease' }}
                      title="Click to sort by 24h % Return"
                    >
                      24h % {(sortBy === 'change24h' || sortBy === 'gainers' || sortBy === 'bleeders') ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      onClick={() => handleHeaderSort('volume')}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: sortBy === 'volume' ? '#38bdf8' : undefined,
                        transition: 'color 0.15s ease',
                      }}
                      title="Click to sort by 24h Turnover Volume"
                    >
                      🔥 24h Vol {sortBy === 'volume' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      onClick={() => handleHeaderSort('sma200')}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: sortBy === 'sma200' ? '#eab308' : undefined,
                        transition: 'color 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                      title="Click to sort by distance to 4H 200 SMA"
                    >
                      🎯 4H 200 SMA {sortBy === 'sma200' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Signal / Trap</th>
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
                      <td colSpan="14" style={{ padding: '3rem', textAlign: 'center', color: '#666666' }}>
                        No coins currently match the selected filter criteria.
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
                            <div>
                              <span className="vyaps-symbol-name">{row.symbol}</span>
                              <span style={{ fontSize: '0.62rem', color: '#666666', display: 'block', fontFamily: 'var(--font-mono)' }}>
                                ${row.spot}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. 24h % */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: row.change24h >= 0 ? '#38bdf8' : '#ef4444'
                            }}>
                              {row.change24h >= 0 ? '+' : ''}{row.change24h}%
                            </span>
                            {row.isBleeding && row.state === 'BULL' && (
                              <span style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                fontSize: '0.58rem',
                                padding: '1px 3px',
                                borderRadius: 2,
                                fontWeight: 800,
                                letterSpacing: '0.04em'
                              }}>
                                BLEED ⚠️
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. 24h Vol */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                            <span style={{ color: (row.turnover24h || 0) >= 50000000 ? '#ffffff' : '#aaaaaa', fontWeight: (row.turnover24h || 0) >= 50000000 ? 700 : 400 }}>
                              {formatTurnover(row.turnover24h)}
                            </span>
                            {(row.turnover24h || 0) >= 100000000 ? (
                              <span style={{
                                background: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                fontSize: '0.58rem',
                                fontWeight: 800,
                                padding: '1px 4px',
                                borderRadius: 3,
                              }}>
                                🐋 $100M+
                              </span>
                            ) : (row.turnover24h || 0) >= 50000000 ? (
                              <span style={{
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                fontSize: '0.58rem',
                                fontWeight: 800,
                                padding: '1px 4px',
                                borderRadius: 3,
                              }}>
                                🔥 $50M+
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* 4. 4H 200 SMA */}
                        <td>
                          {row.sma200_4h ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                              <span
                                className={`pivot-pill ${
                                  row.isNear4HSma200
                                    ? 'val-pos'
                                    : row.isAt4HSma200
                                      ? 'val-pos'
                                      : (row.distSma200_4h >= 0 ? 'val-pos' : 'val-neg')
                                } ${row.isAt4HSma200 ? 'is-close' : ''}`}
                                style={{
                                  fontSize: '0.66rem',
                                  padding: '2px 5px',
                                  fontWeight: row.isAt4HSma200 ? 800 : 500,
                                  borderColor: row.isNear4HSma200
                                    ? '#eab308'
                                    : row.isAt4HSma200
                                      ? '#38bdf8'
                                      : undefined,
                                  color: row.isNear4HSma200
                                    ? '#fde047'
                                    : row.isAt4HSma200
                                      ? '#38bdf8'
                                      : undefined,
                                  background: row.isNear4HSma200
                                    ? 'rgba(234, 179, 8, 0.15)'
                                    : row.isAt4HSma200
                                      ? 'rgba(56, 189, 248, 0.12)'
                                      : undefined,
                                }}
                                title={`4H 200 SMA: $${row.sma200_4h} | Spot: $${row.spot} | Distance: ${row.distSma200Text}`}
                              >
                                {row.isNear4HSma200 ? '🎯 ' : ''}{row.distSma200Text}
                              </span>
                              <span style={{ fontSize: '0.58rem', color: '#666666', fontFamily: 'var(--font-mono)' }}>
                                ${row.sma200_4h}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#444444', fontSize: '0.7rem' }}>--</span>
                          )}
                        </td>

                        {/* 5. Confluence / Trap Grade */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 3,
                              display: 'inline-block',
                              background: row.grade === 'BLEED_TRAP' ? 'rgba(239, 68, 68, 0.15)' :
                                          row.grade === 'SWEET_SPOT' || row.grade === 'SWEET_SPOT_SHORT' ? 'rgba(56, 189, 248, 0.15)' :
                                          row.grade === 'MOMENTUM_LEADER' || row.grade === 'MOMENTUM_RUNNER' ? 'rgba(34, 197, 94, 0.15)' :
                                          row.grade === 'SQUEEZE_TRAP' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              color: row.grade === 'BLEED_TRAP' ? '#ef4444' :
                                     row.grade === 'SWEET_SPOT' || row.grade === 'SWEET_SPOT_SHORT' ? '#38bdf8' :
                                     row.grade === 'MOMENTUM_LEADER' || row.grade === 'MOMENTUM_RUNNER' ? '#22c55e' :
                                     row.grade === 'SQUEEZE_TRAP' ? '#f59e0b' : '#aaaaaa',
                              border: `1px solid ${
                                row.grade === 'BLEED_TRAP' ? 'rgba(239, 68, 68, 0.35)' :
                                row.grade === 'SWEET_SPOT' || row.grade === 'SWEET_SPOT_SHORT' ? 'rgba(56, 189, 248, 0.35)' :
                                row.grade === 'MOMENTUM_LEADER' || row.grade === 'MOMENTUM_RUNNER' ? 'rgba(34, 197, 94, 0.35)' :
                                row.grade === 'SQUEEZE_TRAP' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(255, 255, 255, 0.1)'
                              }`
                            }}>
                              {row.gradeLabel}
                            </span>
                            {row.hasBullishDiv && (
                              <span
                                style={{
                                  background: 'rgba(34, 197, 94, 0.18)',
                                  color: '#22c55e',
                                  border: '1px solid rgba(34, 197, 94, 0.4)',
                                  fontSize: '0.58rem',
                                  padding: '1px 4px',
                                  borderRadius: 2,
                                  fontWeight: 800,
                                  letterSpacing: '0.02em',
                                }}
                                title={`Bullish Divergence: ${row.primaryDiv?.label || 'Price LL, RSI HL'}`}
                              >
                                🟢 Bull Div
                              </span>
                            )}
                            {row.hasBearishDiv && (
                              <span
                                style={{
                                  background: 'rgba(239, 68, 68, 0.18)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  fontSize: '0.58rem',
                                  padding: '1px 4px',
                                  borderRadius: 2,
                                  fontWeight: 800,
                                  letterSpacing: '0.02em',
                                }}
                                title={`Bearish Divergence: ${row.primaryDiv?.label || 'Price HH, RSI LH'}`}
                              >
                                🔴 Bear Div
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. pY */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pY?.isPos ? 'val-pos' : 'val-neg'} ${row.pY?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pY: $${row.pY?.level} | Spot: $${row.spot} | Dist: ${row.pY?.text}%`}
                          >
                            {row.pY?.text || '--'}
                          </span>
                        </td>

                        {/* 6. Y */}
                        <td>
                          <span
                            className={`pivot-pill ${row.Y?.isPos ? 'val-pos' : 'val-neg'} ${row.Y?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Y: $${row.Y?.level} | Spot: $${row.spot} | Dist: ${row.Y?.text}%`}
                          >
                            {row.Y?.text || '--'}
                          </span>
                        </td>

                        {/* 7. pQ */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pQ?.isPos ? 'val-pos' : 'val-neg'} ${row.pQ?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pQ: $${row.pQ?.level} | Spot: $${row.spot} | Dist: ${row.pQ?.text}%`}
                          >
                            {row.pQ?.text || '--'}
                          </span>
                        </td>

                        {/* 8. Q */}
                        <td>
                          <span
                            className={`pivot-pill ${row.Q?.isPos ? 'val-pos' : 'val-neg'} ${row.Q?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`Q: $${row.Q?.level} | Spot: $${row.spot} | Dist: ${row.Q?.text}%`}
                          >
                            {row.Q?.text || '--'}
                          </span>
                        </td>

                        {/* 9. pM */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pM?.isPos ? 'val-pos' : 'val-neg'} ${row.pM?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pM: $${row.pM?.level} | Spot: $${row.spot} | Dist: ${row.pM?.text}%`}
                          >
                            {row.pM?.text || '--'}
                          </span>
                        </td>

                        {/* 10. M */}
                        <td>
                          <span
                            className={`pivot-pill ${row.M?.isPos ? 'val-pos' : 'val-neg'} ${row.M?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`M: $${row.M?.level} | Spot: $${row.spot} | Dist: ${row.M?.text}%`}
                          >
                            {row.M?.text || '--'}
                          </span>
                        </td>

                        {/* 11. pW */}
                        <td>
                          <span
                            className={`pivot-pill ${row.pW?.isPos ? 'val-pos' : 'val-neg'} ${row.pW?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`pW: $${row.pW?.level} | Spot: $${row.spot} | Dist: ${row.pW?.text}%`}
                          >
                            {row.pW?.text || '--'}
                          </span>
                        </td>

                        {/* 12. W */}
                        <td>
                          <span
                            className={`pivot-pill ${row.W?.isPos ? 'val-pos' : 'val-neg'} ${row.W?.isClose ? (row.state === 'BULL' ? 'is-close' : 'is-close-bear') : ''}`}
                            title={`W: $${row.W?.level} | Spot: $${row.spot} | Dist: ${row.W?.text}%`}
                          >
                            {row.W?.text || '--'}
                          </span>
                        </td>

                        {/* 13. State */}
                        <td>
                          <span className={`vyaps-state-badge ${row.state === 'BULL' ? 'bull' : row.state === 'BEAR' ? 'bear' : ''}`}>
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
            Full confluence &amp; trap filtering enabled. Never get trapped in a bleeding altcoin when historical bias is bullish.
          </div>
        </div>
      )}

      {/* ── Discord / Telegram Webhook Modal ── */}
      {showWebhookSettings && (
        <div className="alts-modal-overlay" onClick={() => setShowWebhookSettings(false)}>
          <div className="alts-modal" onClick={(e) => e.stopPropagation()} style={{ background: '#0a0a0a', border: '1px solid #222222' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: '#38bdf8' }}>
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
                style={{ flex: 1, justifyContent: 'center', background: '#38bdf8', color: '#000000', fontWeight: 700 }}
                onClick={() => {
                  if (discordWebhook && discordWebhook.startsWith('http')) {
                    fetch(discordWebhook, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: '🚩 **Wolf Tape Reader Pivot Alert Engine Active!** Ready to send Value Area alerts to your phone!',
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
              <span className="modal-title" style={{ color: '#38bdf8' }}>
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
                  style={{ flex: 1, justifyContent: 'center', background: '#38bdf8', color: '#000000', fontWeight: 700 }}
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
          <div key={toast.id} className="alert-toast" style={{ background: '#0a0a0a', borderColor: '#38bdf8' }}>
            <IconBell size={18} color="#38bdf8" />
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{toast.title}</strong>
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
