'use client';

import { useState, useEffect } from 'react';
import { IconBlackFlag } from './Icons';

export default function BootIntroSequence({ onComplete }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([
    'WOLF TAPE TERMINAL // INSTITUTIONAL DESK OS v3.4',
    'INITIALIZING SECURE WEBSOCKET TELEMETRY...',
  ]);

  useEffect(() => {
    const logSteps = [
      'INITIALIZING SECURE WEBSOCKET TELEMETRY...',
      'CONNECTING BYBIT & BINANCE L2 LIQUIDITY STREAMS... [OK]',
      'CALCULATING 8-PIVOT VALUE AREA MATRIX (55 ASSETS)... [OK]',
      'STREAMING TOP TRADER WHALE L/S & COINMETRICS MVRV... [OK]',
      'SYNCING DAILY SPOT BITCOIN ETF FLOWS (12 ISSUERS)... [OK]',
      'SYSTEM CALIBRATED // WOLF TAPE PROTOCOL ARMED',
    ];

    let curStep = 0;
    const interval = setInterval(() => {
      curStep++;
      if (curStep < logSteps.length) {
        setStep(curStep);
        setLogs((prev) => [...prev, logSteps[curStep]]);
        setProgress(Math.min(100, Math.round((curStep / (logSteps.length - 1)) * 100)));
      } else {
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 400);
      }
    }, 280);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="boot-terminal-overlay">
      {/* Laser Scanline */}
      <div className="boot-scanline" />

      {/* Cyber Reticle & Logo */}
      <div className="boot-center-hud">
        <div className="boot-radar-ring">
          <div className="boot-radar-sweep" />
          <div className="boot-flag-wrapper">
            <IconBlackFlag size={44} />
          </div>
        </div>

        <div className="boot-terminal-title">
          WOLF TAPE READER
        </div>
        <div className="boot-terminal-sub">
          INSTITUTIONAL TAPE READING &middot; KEY LEVELS &middot; ALTS &middot; ON-CHAIN
        </div>

        {/* Progress Bar */}
        <div className="boot-progress-track">
          <div className="boot-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="boot-progress-pct">
          {progress}% LOADED
        </div>

        {/* Diagnostic Logs Stream */}
        <div className="boot-logs-box">
          {logs.map((log, i) => (
            <div key={i} className="boot-log-line">
              <span className="boot-log-prompt">&gt;</span> {log}
            </div>
          ))}
        </div>

        {/* Skip button */}
        <button
          className="boot-skip-btn"
          onClick={() => {
            if (onComplete) onComplete();
          }}
        >
          [ SKIP INTRO &gt;&gt; ]
        </button>
      </div>
    </div>
  );
}
