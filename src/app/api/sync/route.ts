import { NextRequest, NextResponse } from 'next/server';
import {
  getMindMaps,
  getKnowledgeNodes,
  upsertMindMap,
  upsertKnowledgeNode,
  deleteKnowledgeNodes,
  getQuestions,
  upsertQuestions,
  softDeleteQuestions,
  getExamPapers,
  upsertExamPapers,
  getAnswerRecords,
  insertAnswerRecords,
  getPracticeSets,
  upsertPracticeSets,
  getBehaviorEvents,
  insertBehaviorEvents,
} from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';
import { isValidBehaviorEvent, normalizeBehaviorEvent } from '@/lib/behavior-events';

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    const includeBehaviorEvents = request.nextUrl.searchParams.get('includeBehaviorEvents') === '1';

    const [mindMaps, knowledgeNodes, questions, examPapers, answers, practiceSets] = await Promise.all([
      getMindMaps(userId),
      getKnowledgeNodes(userId),
      getQuestions(userId),
      getExamPapers(userId),
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
        examPapers: examPapers ?? [],
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
    const { mindMap, knowledgeNode, deleteNodeIds, deleteQuestionIds, questions, examPapers, answers, practiceSets, behaviorEvents } = body as {
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
      deleteQuestionIds?: string[];
      questions?: Array<Record<string, unknown>>;
      examPapers?: Array<Record<string, unknown>>;
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

    if (deleteQuestionIds && deleteQuestionIds.length > 0) {
      const deletedQuestionCount = await softDeleteQuestions(userId, deleteQuestionIds);
      results.questionsDeleted = deletedQuestionCount;
    }

    if (questions && questions.length > 0) {
      const questionCount = await upsertQuestions(userId, questions);
      results.questionCount = questionCount;
    }

    if (examPapers && examPapers.length > 0) {
      const examPaperCount = await upsertExamPapers(userId, examPapers);
      results.examPaperCount = examPaperCount;
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
      const validBehaviorEvents = behaviorEvents
        .map(event => normalizeBehaviorEvent({ ...event, userId } as never))
        .filter(isValidBehaviorEvent);
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
