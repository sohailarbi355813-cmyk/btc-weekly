import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';


const ISSUER_METADATA = {
  IBIT: { name: 'BlackRock iShares', full: 'iShares Bitcoin Trust', sponsor: 'BlackRock' },
  FBTC: { name: 'Fidelity', full: 'Fidelity Wise Origin Bitcoin Fund', sponsor: 'Fidelity' },
  BITB: { name: 'Bitwise', full: 'Bitwise Bitcoin ETF', sponsor: 'Bitwise' },
  ARKB: { name: 'ARK 21Shares', full: 'ARK 21Shares Bitcoin ETF', sponsor: 'ARK / 21Shares' },
  BTCO: { name: 'Invesco Galaxy', full: 'Invesco Galaxy Bitcoin ETF', sponsor: 'Invesco' },
  EZBC: { name: 'Franklin Templeton', full: 'Franklin Bitcoin ETF', sponsor: 'Franklin Templeton' },
  BRRR: { name: 'Valkyrie / CoinShares', full: 'Valkyrie Bitcoin Fund', sponsor: 'CoinShares' },
  HODL: { name: 'VanEck', full: 'VanEck Bitcoin Trust', sponsor: 'VanEck' },
  BTCW: { name: 'WisdomTree', full: 'WisdomTree Bitcoin Fund', sponsor: 'WisdomTree' },
  MSBT: { name: 'Mini Bitcoin Trust', full: 'Mini Bitcoin Trust', sponsor: 'Issuer Mini' },
  GBTC: { name: 'Grayscale (GBTC)', full: 'Grayscale Bitcoin Trust', sponsor: 'Grayscale' },
  BTC: { name: 'Grayscale Mini (BTC)', full: 'Grayscale Bitcoin Mini Trust', sponsor: 'Grayscale' }
};

export async function GET() {
  try {
    let csvContent = '';

    // Try fetching latest live updates from automated GitHub repository with 3s timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://raw.githubusercontent.com/haturatu/crypto-etf-flow/main/etf_btc.csv', {
        signal: controller.signal,
        headers: { 'User-Agent': 'WolfTapeReader/1.0' },
        next: { revalidate: 300 }
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        csvContent = await res.text();
      }
    } catch {
      // Fallback to local snapshot
    }

    if (!csvContent || csvContent.trim().length === 0) {
      const localPath = path.join(process.cwd(), 'src', 'lib', 'etf_btc.csv');
      if (fs.existsSync(localPath)) {
        csvContent = fs.readFileSync(localPath, 'utf8');
      }
    }

    if (!csvContent) {
      throw new Error('Unable to read ETF flow data');
    }

    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Invalid CSV structure');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const issuerKeys = headers.filter(h => h !== 'Date' && h !== 'Total');

    const rawRows = [];
    const cumulativeByIssuer = {};
    issuerKeys.forEach(k => { cumulativeByIssuer[k] = 0; });
    let totalAllTimeCumulative = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < headers.length) continue;

      const dateStr = cols[0];
      const row = { date: dateStr, issuers: {}, total: 0, hasData: false };

      let computedTotal = 0;
      let nonZeroCount = 0;

      headers.forEach((h, idx) => {
        if (h === 'Date') return;
        const valStr = cols[idx];
        const val = valStr !== '' && !isNaN(parseFloat(valStr)) ? parseFloat(valStr) : 0;
        
        if (h === 'Total') {
          row.total = val;
        } else {
          row.issuers[h] = val;
          if (val !== 0) {
            nonZeroCount++;
            computedTotal += val;
            cumulativeByIssuer[h] += val;
          }
        }
      });

      // If official Total was missing or 0 but issuers had values, use computedTotal
      if (row.total === 0 && computedTotal !== 0) {
        row.total = parseFloat(computedTotal.toFixed(1));
      }

      row.hasData = nonZeroCount > 0 || row.total !== 0;
      if (row.hasData) {
        totalAllTimeCumulative += row.total;
      }
      rawRows.push(row);
    }

    // Sort newest date first
    const sortedRows = [...rawRows].reverse();

    // Latest completed reporting date
    const latestActiveRow = sortedRows.find(r => r.hasData) || sortedRows[0];

    // Compute rolling 7-day and 30-day totals from active rows
    const activeRows = sortedRows.filter(r => r.hasData);
    const last7DaysTotal = activeRows.slice(0, 7).reduce((acc, r) => acc + r.total, 0);
    const last30DaysTotal = activeRows.slice(0, 30).reduce((acc, r) => acc + r.total, 0);

    // Format cumulative sums rounded to 1 decimal
    const cumulativeFormatted = {};
    issuerKeys.forEach(k => {
      cumulativeFormatted[k] = parseFloat(cumulativeByIssuer[k].toFixed(1));
    });

    return NextResponse.json({
      success: true,
      lastUpdated: new Date().toISOString(),
      metadata: ISSUER_METADATA,
      issuerKeys,
      stats: {
        totalDays: activeRows.length,
        latestDate: latestActiveRow.date,
        latestDayTotal: latestActiveRow.total,
        last7DaysTotal: parseFloat(last7DaysTotal.toFixed(1)),
        last30DaysTotal: parseFloat(last30DaysTotal.toFixed(1)),
        allTimeNetTotal: parseFloat(totalAllTimeCumulative.toFixed(1)),
        cumulativeByIssuer: cumulativeFormatted
      },
      daily: sortedRows
    });
  } catch (error) {
    console.error('Failed to parse ETF flows:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
