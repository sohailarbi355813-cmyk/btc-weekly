import { NextResponse } from 'next/server';
import { scanAltsMarketStructure } from '@/lib/marketStructureEngine';

export async function GET() {
  try {
    const data = await scanAltsMarketStructure();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Market Structure API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        totalCoins: 0,
        bullishCount: 0,
        bearishCount: 0,
        neutralCount: 0,
        coins: [],
      },
      { status: 500 }
    );
  }
}
