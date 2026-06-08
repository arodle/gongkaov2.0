import { NextRequest, NextResponse } from 'next/server';
import { getBehaviorEvents } from '@/lib/db/neon-service';
import { VALID_BEHAVIOR_EVENT_TYPES, normalizeBehaviorEvent } from '@/lib/behavior-events';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

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
    const eventRows = rows as Array<{ id: string; question_id: string; event_type: string; target: string; start_time: Date; end_time: Date; metadata: Record<string, unknown> | null }>;
    const events = eventRows
      .filter(row => VALID_BEHAVIOR_EVENT_TYPES.has(row.event_type as never))
      .map(row => {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeBehaviorEvent({
          id: row.id,
          userId,
          questionId: row.question_id,
          eventType: row.event_type as never,
          target: row.target,
          startTime: new Date(row.start_time).toISOString(),
          endTime: new Date(row.end_time).toISOString(),
          metadata,
        });
      });

    return NextResponse.json({ success: true, events });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
