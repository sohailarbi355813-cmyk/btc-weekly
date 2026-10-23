# 🐺 Wolf Tape Read

> **Trading the tape, with precision.**  
> Institutional Bitcoin key levels, dynamic auction price ladder, and statistical historical patterns (2021–present).

---

## Features

- **Wolf Key Levels (Yellow Terminal Aesthetic):**
  - **Dynamic Price Ladder:** Ordered auction levels (`PDH`, `PDL`, `PDC`, `DO`, `pPOC`, `pVAH`, `pVAL`, `WO`, `PWH`, `PWL`, `PWC`, `MO`, `PMH`, `PML`, `YO`).
  - **Highlighted Live Spot Bar:** Instant visual orientation showing spot price slotted cleanly between nearest Resistance and Support with real-time percentage distances.
  - **Previous Week Range Gauge:** Visual range bar tracking where current price sits between PWL (0%) and PWH (100%).
  - **Multi-Timeframe Filters:** Easily toggle between All Levels, Daily, Weekly, and Monthly anchors.

- **Week Sequence Pattern Matcher:**
  - Scans 300+ historical trading weeks (from Jan 2021 to present).
  - Matches current week's trajectory against past weeks by directional flow, return magnitude, and shape.
  - Generates day-by-day probabilistic forecasts for current and subsequent weeks.

- **Statistical Trading Bias Engine:**
  - Day-of-week win rates, average returns, median returns, and streaks.
  - Monday 00:00 UTC Weekly Open anchor analysis.
  - 12-month calendar seasonality profile.
  - Multi-factor composite confidence meter.

- **Sleek & Mobile-First Design:**
  - Pure SVG icons (no cheap emojis).
  - High-contrast obsidian & cyber yellow aesthetic.
  - Horizontal swipeable week timeline with snap alignment for smartphones and tablets.
  - Custom vector favicon (`/icon.svg`).

---

## Getting Started

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Deploy on Vercel

The app is built with Next.js App Router and is fully optimized for one-click deployment on [Vercel](https://vercel.com).
