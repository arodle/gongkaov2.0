import { NextResponse } from 'next/server';
import { initTables } from '@/lib/db/migrations';

let initialized = false;

export async function GET() {
  if (initialized) {
    return NextResponse.json({ success: true, cached: true });
  }

  try {
    await initTables();
    initialized = true;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Init tables error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
