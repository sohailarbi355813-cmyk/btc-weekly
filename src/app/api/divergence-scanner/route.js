import { NextResponse } from 'next/server';
import { scanAltsDivergences } from '@/lib/divergenceEngine';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tf = searchParams.get('timeframe') || '4h';
    const cleanTf = tf === '1h' ? '1h' : '4h';

    const data = await scanAltsDivergences(cleanTf);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Divergence scanner API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        bullishCount: 0,
        bearishCount: 0,
        bullishCoins: [],
        bearishCoins: [],
        allCoins: [],
      },
      { status: 500 }
    );
  }
}
