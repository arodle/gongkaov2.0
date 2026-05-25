import { NextResponse } from 'next/server';
import { initTables } from '@/lib/db/migrations';

export async function GET() {
  try {
    await initTables();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Init tables error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
