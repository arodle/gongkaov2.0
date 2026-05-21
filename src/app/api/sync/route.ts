import { NextRequest, NextResponse } from 'next/server';
import {
  getMindMaps,
  upsertMindMap,
  getQuestions,
  upsertQuestions,
  getAnswerRecords,
  insertAnswerRecords,
  getPracticeSets,
  upsertPracticeSets,
} from '@/lib/db/neon-service';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default';

    const [mindMaps, questions, answers, practiceSets] = await Promise.all([
      getMindMaps(userId),
      getQuestions(userId),
      getAnswerRecords(userId),
      getPracticeSets(userId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        mindMaps: mindMaps ?? [],
        questions: questions ?? [],
        answers: answers ?? [],
        practiceSets: practiceSets ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sync GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default';
    const body = await request.json();
    const { mindMap, questions, answers, practiceSets } = body as {
      mindMap?: { id?: string; name?: string; data: unknown };
      questions?: Array<Record<string, unknown>>;
      answers?: Array<Record<string, unknown>>;
      practiceSets?: Array<Record<string, unknown>>;
    };

    const results: Record<string, unknown> = {};

    if (mindMap) {
      const mindMapId = await upsertMindMap(userId, mindMap);
      results.mindMapId = mindMapId;
    }

    if (questions && questions.length > 0) {
      const questionCount = await upsertQuestions(userId, questions);
      results.questionCount = questionCount;
    }

    if (answers && answers.length > 0) {
      const answerCount = await insertAnswerRecords(userId, answers);
      results.answerCount = answerCount;
    }

    if (practiceSets && practiceSets.length > 0) {
      const practiceSetCount = await upsertPracticeSets(userId, practiceSets);
      results.practiceSetCount = practiceSetCount;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sync POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
