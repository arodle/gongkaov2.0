import { NextRequest, NextResponse } from 'next/server';
import {
  getMindMaps,
  getKnowledgeNodes,
  upsertMindMap,
  upsertKnowledgeNode,
  deleteKnowledgeNodes,
  getQuestions,
  upsertQuestions,
  getAnswerRecords,
  insertAnswerRecords,
  getPracticeSets,
  upsertPracticeSets,
  getBehaviorEvents,
  insertBehaviorEvents,
} from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';
import type { BehaviorEventType } from '@/types';

const VALID_BEHAVIOR_EVENT_TYPES = new Set<BehaviorEventType>([
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
    const includeBehaviorEvents = request.nextUrl.searchParams.get('includeBehaviorEvents') === '1';

    const [mindMaps, knowledgeNodes, questions, answers, practiceSets] = await Promise.all([
      getMindMaps(userId),
      getKnowledgeNodes(userId),
      getQuestions(userId),
      getAnswerRecords(userId),
      getPracticeSets(userId),
    ]);

    const behaviorEvents = includeBehaviorEvents ? await getBehaviorEvents(userId, 500) : [];

    return NextResponse.json({
      success: true,
      data: {
        mindMaps: mindMaps ?? [],
        knowledgeNodes: knowledgeNodes ?? [],
        questions: questions ?? [],
        answers: answers ?? [],
        practiceSets: practiceSets ?? [],
        behaviorEvents: behaviorEvents ?? [],
      },
    });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sync GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    const body = await request.json();
    const { mindMap, knowledgeNode, deleteNodeIds, questions, answers, practiceSets, behaviorEvents } = body as {
      mindMap?: { id?: string; name?: string; data: unknown };
      knowledgeNode?: {
        id: string;
        name: string;
        parent_id?: string | null;
        pos_x?: number;
        pos_y?: number;
        ps_score?: number;
        node_type?: string;
        content?: string;
        annotation?: string;
      };
      deleteNodeIds?: string[];
      questions?: Array<Record<string, unknown>>;
      answers?: Array<Record<string, unknown>>;
      practiceSets?: Array<Record<string, unknown>>;
      behaviorEvents?: Array<Record<string, unknown>>;
    };

    const results: Record<string, unknown> = {};

    if (mindMap) {
      const mindMapId = await upsertMindMap(userId, mindMap);
      results.mindMapId = mindMapId;
    }

    if (knowledgeNode) {
      await upsertKnowledgeNode(userId, knowledgeNode);
      results.nodeSaved = true;
    }

    if (deleteNodeIds && deleteNodeIds.length > 0) {
      await deleteKnowledgeNodes(userId, deleteNodeIds);
      results.nodesDeleted = deleteNodeIds.length;
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

    if (behaviorEvents && behaviorEvents.length > 0) {
      const validBehaviorEvents = behaviorEvents.filter(event => (
        typeof event.questionId === 'string'
        && typeof event.eventType === 'string'
        && VALID_BEHAVIOR_EVENT_TYPES.has(event.eventType as BehaviorEventType)
        && typeof event.target === 'string'
        && typeof event.startTime === 'string'
        && typeof event.endTime === 'string'
      ));
      const behaviorEventCount = await insertBehaviorEvents(userId, validBehaviorEvents);
      results.behaviorEventCount = behaviorEventCount;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Sync POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
