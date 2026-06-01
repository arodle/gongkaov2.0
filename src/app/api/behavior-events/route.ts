import { NextRequest, NextResponse } from 'next/server';
import { getBehaviorEvents } from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';
import type { BehaviorEventType } from '@/types';

const VALID_EVENT_TYPES = new Set<BehaviorEventType>([
  'highlight',
  'circle',
  'strike',
  'answer_select',
  'answer_change',
  'note',
]);

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get('questionId');
    const requestedLimit = Number(searchParams.get('limit') || '300');
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 300;

    if (!questionId) {
      return NextResponse.json({ success: false, message: 'questionId is required' }, { status: 400 });
    }

    const rows = await getBehaviorEvents(userId, limit, questionId);
    const events = rows
      .filter(row => VALID_EVENT_TYPES.has(row.event_type as BehaviorEventType))
      .map(row => ({
        id: row.id,
        userId,
        questionId: row.question_id,
        eventType: row.event_type,
        target: row.target,
        startTime: new Date(row.start_time).toISOString(),
        endTime: new Date(row.end_time).toISOString(),
        metadata: row.metadata || {},
      }));

    return NextResponse.json({ success: true, events });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
