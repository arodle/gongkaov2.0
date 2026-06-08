import { NextResponse } from 'next/server';
import { initTables } from '@/lib/db/migrations';
import { ensureAuthTables } from '@/lib/server/auth';

export async function GET() {
  try {
    await initTables();
    await ensureAuthTables();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Init tables error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
