import { NextResponse } from 'next/server';
import { scanCvdDivergences } from '@/lib/cvdEngine';

export async function GET(request) {
  try {
    let tf = '1h';
    try {
      if (request?.url) {
        const url = new URL(request.url);
        tf = url.searchParams.get('timeframe') || '1h';
      }
    } catch (e) {}

    const cleanTf = ['30m', '1h', '2h', '3h', '4h'].includes(tf) ? tf : '1h';
    const data = await scanCvdDivergences(cleanTf);
    return NextResponse.json(data);
  } catch (error) {
    console.error('CVD divergence scanner API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timeframe: '1h',
        totalScanned: 0,
        bullishCount: 0,
        bearishCount: 0,
        btc: null,
        bullishCoins: [],
        bearishCoins: [],
        allCoins: [],
      },
      { status: 500 }
    );
  }
}
