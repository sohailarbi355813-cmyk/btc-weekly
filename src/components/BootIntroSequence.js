'use client';

import { useState, useEffect, useRef } from 'react';
import { IconBlackFlag } from './Icons';

export default function BootIntroSequence({ onComplete }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [cipherText, setCipherText] = useState('INITIALIZING WOLF TELEMETRY...');
  const canvasRef = useRef(null);

  const logSteps = [
    'INITIALIZING SECURE WEBSOCKET TELEMETRY...',
    'CONNECTING BYBIT & BINANCE L2 LIQUIDITY STREAMS... [OK]',
    'CALCULATING 8-PIVOT VALUE AREA MATRIX (55 ASSETS)... [OK]',
    'STREAMING TOP TRADER WHALE L/S & COINMETRICS MVRV... [OK]',
    'INGESTING DAILY SPOT BITCOIN ETF FLOWS (12 ISSUERS)... [OK]',
    'COMPUTING HISTORICAL SEQUENCE & WEEKLY FORECASTS... [OK]',
    'SYSTEM CALIBRATED // WOLF TAPE PROTOCOL ARMED',
  ];

  const [logs, setLogs] = useState([
    'WOLF TAPE TERMINAL // INSTITUTIONAL DESK OS v3.4',
    logSteps[0],
  ]);

  // Dynamic cipher scramble effect on title
  useEffect(() => {
    const chars = 'ABCDEF0123456789!@#$%^&*<>[]{}~/\\|';
    const target = logSteps[step] || 'WOLF TAPE PROTOCOL ARMED';
    let iter = 0;
    const scrambleInterval = setInterval(() => {
      setCipherText(
        target
          .split('')
          .map((char, index) => {
            if (index < iter) return target[index];
            if (char === ' ') return ' ';
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('')
      );
      if (iter >= target.length) {
        clearInterval(scrambleInterval);
      }
      iter += 2;
    }, 25);

    return () => clearInterval(scrambleInterval);
  }, [step]);

  // Main progress and step runner
  useEffect(() => {
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
        }, 500);
      }
    }, 380);

    return () => clearInterval(interval);
  }, [onComplete]);

  // Interactive Animated Canvas: Cyber Grid, Floating Data Tickers & Particle Constellation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Floating telemetry packets
    const tickers = [
      'BTC $81,304.0', 'VAL $80,940', 'VAH $84,249', 'POC $81,311',
      'ETH $2,641', 'SOL $178.5', 'ETF INFLOW +$318M', 'MVRV 2.14',
      'WHALE L/S 1.48', 'BYBIT L2 STREAM', 'BINANCE SPOT'
    ];

    const dataPackets = Array.from({ length: 14 }, () => ({
      text: tickers[Math.floor(Math.random() * tickers.length)],
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speedY: -0.4 - Math.random() * 0.6,
      opacity: 0.15 + Math.random() * 0.35,
      size: 9 + Math.floor(Math.random() * 3),
    }));

    // Neural particles
    const particleCount = 45;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 1.8 + 0.8,
      color: Math.random() > 0.3 ? '#38bdf8' : '#22c55e',
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw floating data packets
      ctx.font = '10px "JetBrains Mono", monospace';
      dataPackets.forEach((p) => {
        ctx.fillStyle = `rgba(56, 189, 248, ${p.opacity})`;
        ctx.fillText(p.text, p.x, p.y);
        p.y += p.speedY;
        if (p.y < -20) {
          p.y = canvas.height + 20;
          p.x = Math.random() * canvas.width;
          p.text = tickers[Math.floor(Math.random() * tickers.length)];
        }
      });

      // 2. Draw particle constellation
      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Connect nearby particles
        for (let j = idx + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.18 * (1 - dist / 110)})`;
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="boot-terminal-overlay">
      {/* Dynamic Animated Particle Canvas */}
      <canvas ref={canvasRef} className="boot-canvas-bg" />

      {/* Laser Scanline */}
      <div className="boot-scanline" />

      {/* Floating HUD Holographic Container */}
      <div className="boot-center-hud">
        {/* Top Telemetry Status Badges */}
        <div className="boot-hud-top-bar">
          <div className="boot-hud-pill">
            <span className="boot-live-dot" />
            <span>DESK OS v3.4</span>
          </div>
          <div className="boot-hud-pill">
            <span>FEED: 2,400 MSG/S</span>
          </div>
          <div className="boot-hud-pill">
            <span>LATENCY: 14MS</span>
          </div>
        </div>

        {/* Dual Gyroscope Radar Reticle with Waving Black Flag */}
        <div className="boot-radar-gyro">
          {/* Sonar Expanding Waves */}
          <div className="boot-sonar-wave sonar-1" />
          <div className="boot-sonar-wave sonar-2" />
          <div className="boot-sonar-wave sonar-3" />

          {/* Outer Segmented Degree Ring */}
          <div className="boot-gyro-outer">
            <span className="gyro-tick tick-n">0°</span>
            <span className="gyro-tick tick-e">90°</span>
            <span className="gyro-tick tick-s">180°</span>
            <span className="gyro-tick tick-w">270°</span>
          </div>

          {/* Inner Counter-Rotating Reticle */}
          <div className="boot-gyro-inner" />

          {/* Sweeping Radar Beam */}
          <div className="boot-radar-beam" />

          {/* Laser Crosshairs */}
          <div className="boot-crosshair-h" />
          <div className="boot-crosshair-v" />

          {/* Hologram Base Beam & Waving Black Flag */}
          <div className="boot-flag-wrapper">
            <IconBlackFlag size={48} />
          </div>
          <div className="boot-holo-pedestal" />
        </div>

        {/* Title & Animated Cipher Decryptor */}
        <div className="boot-terminal-title">
          WOLF TAPE READER
        </div>
        <div className="boot-cipher-scramble">
          &gt; {cipherText}
        </div>

        {/* Active Oscilloscope / Audio Spectrum Equalizer Waveform */}
        <div className="boot-audio-visualizer" title="Real-time orderflow tape telemetry">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="boot-eq-bar"
              style={{
                animationDelay: `${(i * 0.08) % 1.2}s`,
                animationDuration: `${0.8 + (i % 5) * 0.15}s`,
              }}
            />
          ))}
        </div>

        {/* Glowing Progress Bar */}
        <div className="boot-progress-track">
          <div className="boot-progress-fill" style={{ width: `${progress}%` }}>
            <span className="boot-progress-glow-head" />
          </div>
        </div>
        <div className="boot-progress-row">
          <span className="boot-progress-label">SYNCHRONIZING DESK PIPELINES</span>
          <span className="boot-progress-pct">{progress}%</span>
        </div>

        {/* Diagnostic Logs Stream */}
        <div className="boot-logs-box">
          {logs.map((log, i) => (
            <div key={i} className="boot-log-line">
              <span className="boot-log-prompt">&gt;</span> {log}
            </div>
          ))}
        </div>

        {/* High-Tech Bypass Button */}
        <button
          className="boot-skip-btn"
          onClick={() => {
            if (onComplete) onComplete();
          }}
        >
          [ SKIP INTRO &amp; ENTER DESK &gt;&gt; ]
        </button>
      </div>
    </div>
  );
}
