import { NextResponse } from 'next/server';
import { initTables } from '@/lib/db/migrations';
import { authErrorResponse, ensureAuthTables, requireCurrentUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    await requireCurrentUser(request);
    await initTables();
    await ensureAuthTables();
    return NextResponse.json({ success: true });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Init tables error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
