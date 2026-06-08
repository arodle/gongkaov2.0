import assert from 'node:assert/strict';
import { normalizeBehaviorEvent, isValidBehaviorEvent } from '../../src/lib/behavior-events';
import { createExamPaperId, normalizeExamPaperName } from '../../src/lib/exam-papers';
import { estimateDataUrlBytes, filterInlineImageUrls, INLINE_IMAGE_MAX_BYTES } from '../../src/lib/image-storage';
import {
  buildKnowledgeBindingIndex,
  findQuestionBindingIssues,
  inspectQuestionBinding,
  normalizeKnowledgeNodeId,
  normalizeQuestionBinding,
  recommendKnowledgePathCandidates,
  runKnowledgeBindingAudit,
} from '../../src/lib/question-binding';
import {
  buildDailyTrainingPlan,
  buildDailyTrainingPlanSummary,
  recordReviewAttempt,
  type QuestionReviewMeta,
} from '../../src/lib/practice-insights';
import type { BehaviorEventRecord, KnowledgeNodeRecord, QuestionBankItem } from '../../src/types';

function testBehaviorEvents() {
  const event: BehaviorEventRecord = {
    id: 'be_1',
    userId: 'u1',
    questionId: 'q1',
    eventType: 'highlight',
    target: 'question_text',
    startTime: '2026-06-04T00:00:00.000Z',
    endTime: '2026-06-04T00:00:01.000Z',
    metadata: {
      startOffset: '2',
      endOffset: '5',
      selectedText: 'abc',
      elapsedMs: '1200',
      extra: 'drop-me',
    },
  };

  const normalized = normalizeBehaviorEvent(event);
  assert.equal(normalized.schemaVersion, 1);
  assert.deepEqual(normalized.metadata, {
    schemaVersion: 1,
    elapsedMs: 1200,
    startOffset: 2,
    endOffset: 5,
    selectedText: 'abc',
  });
  assert.equal(isValidBehaviorEvent(normalized), true);
  assert.equal(isValidBehaviorEvent({ ...normalized, metadata: { startOffset: 5, endOffset: 5 } }), false);
}

function testExamPapers() {
  assert.equal(normalizeExamPaperName(' 2026 国考 副省 '), '2026年国考副省级');
  assert.equal(normalizeExamPaperName('2026公务员考试副省'), '2026年国考副省级');
  assert.equal(createExamPaperId('2026年国考副省级'), createExamPaperId(' 2026 国考 副省 '));
}

function testImageStorage() {
  const small = `data:image/png;base64,${'A'.repeat(128)}`;
  const large = `data:image/png;base64,${'A'.repeat((INLINE_IMAGE_MAX_BYTES + 16) * 2)}`;
  const result = filterInlineImageUrls([small, large, 'https://example.com/a.png']);

  assert.equal(estimateDataUrlBytes(small), 96);
  assert.deepEqual(result.images, [small, 'https://example.com/a.png']);
  assert.equal(result.dropped, 1);
}

function testQuestionBinding() {
  const nodes: KnowledgeNodeRecord[] = [
    {
      id: 'root',
      user_id: 'u1',
      name: '行测',
      parent_id: null,
      pos_x: 0,
      pos_y: 0,
      ps_score: 100,
      last_practiced_at: null,
      color_tag: 'default',
      node_type: 'subject',
      updated_at: '2026-06-04T00:00:00.000Z',
    },
    {
      id: 'mn_child',
      user_id: 'u1',
      name: '数量关系',
      parent_id: 'root',
      pos_x: 0,
      pos_y: 0,
      ps_score: 60,
      last_practiced_at: null,
      color_tag: 'default',
      node_type: 'knowledge',
      updated_at: '2026-06-04T00:00:00.000Z',
    },
    {
      id: 'logic',
      user_id: 'u1',
      name: '削弱论证',
      parent_id: 'root',
      pos_x: 0,
      pos_y: 0,
      ps_score: 60,
      last_practiced_at: null,
      color_tag: 'default',
      node_type: 'knowledge',
      updated_at: '2026-06-04T00:00:00.000Z',
    },
  ];
  const index = buildKnowledgeBindingIndex(nodes);

  assert.equal(normalizeKnowledgeNodeId('mn_child'), 'child');
  assert.equal(inspectQuestionBinding({ linkedAngleId: 'child' }, index).status, 'ok');
  assert.equal(inspectQuestionBinding({ knowledgePath: '行测》数量关系' }, index).normalizedId, 'child');

  const normalized = normalizeQuestionBinding({
    linkedAngleId: 'missing',
    linkedAngleName: '',
    knowledgePath: '行测》数量关系',
  }, index);
  assert.equal(normalized.linkedAngleId, 'child');
  assert.equal(normalized.linkedAngleName, '数量关系');
  assert.equal(normalized.knowledgePath, '行测》数量关系');

  const question: QuestionBankItem = {
    id: 'q1',
    content: '题干',
    options: [],
    correctAnswer: 'A',
    explanation: '',
    linkedAngleId: '',
    createdAt: '2026-06-04T00:00:00.000Z',
  };
  assert.equal(findQuestionBindingIssues([question], nodes)[0].inspection.status, 'missing');

  const candidates = recommendKnowledgePathCandidates(
    {
      content: '这是一道削弱加强类逻辑判断题，需要识别论证结构。',
      options: [],
      explanation: '',
    },
    Array.from(index.pathById.values())
  );
  assert.equal(candidates[0]?.path.endsWith('削弱论证'), true);
  assert.equal(candidates[0]?.matchedAliases.includes('削弱加强'), true);

  const customAliasCandidates = recommendKnowledgePathCandidates(
    {
      content: '这道题考水池注水排水问题',
      options: [],
      explanation: '',
    },
    Array.from(index.pathById.values()),
    { aliases: [{ alias: '水池注水', target: '数量关系' }] }
  );
  assert.equal(customAliasCandidates[0]?.matchedAliases.includes('水池注水'), true);

  const audit = runKnowledgeBindingAudit([question], nodes, '2026-06-04T00:00:00.000Z');
  assert.equal(audit.totalQuestions, 1);
  assert.equal(audit.counts.missing, 1);
}

function testPracticeInsights() {
  const questions: QuestionBankItem[] = [
    {
      id: 'q_due_wrong',
      content: '题目1',
      options: [],
      correctAnswer: 'A',
      explanation: '',
      linkedAngleId: 'n1',
      createdAt: '2026-06-04T00:00:00.000Z',
    },
    {
      id: 'q_fresh',
      content: '题目2',
      options: [],
      correctAnswer: 'B',
      explanation: '',
      linkedAngleId: '',
      createdAt: '2026-06-04T00:00:00.000Z',
    },
  ];
  const records = [{
    id: 'r1',
    user_id: 'u1',
    question_id: 'q_due_wrong',
    is_correct: false,
    answer_time: 10,
    source_node_ids: ['n1'],
    updated_at: '2026-06-04T00:00:00.000Z',
  }];
  const reviewMeta: Record<string, QuestionReviewMeta> = {
    q_due_wrong: {
      reasonTags: [],
      strategyTags: [],
      nextReviewAt: '2026-06-04T00:00:00.000Z',
      reviewStage: 0,
      mastered: false,
      updatedAt: '2026-06-04T00:00:00.000Z',
    },
  };

  const now = new Date('2026-06-05T00:00:00.000Z');
  const plan = buildDailyTrainingPlan(questions, records, reviewMeta, 10, now);
  const summary = buildDailyTrainingPlanSummary(plan, records, reviewMeta, now);
  assert.equal(summary.total, 2);
  assert.equal(summary.dueReview, 1);
  assert.equal(summary.wrongReview, 1);
  assert.equal(summary.fresh, 1);
  assert.equal(summary.linkedKnowledge, 1);

  const resetMeta = recordReviewAttempt({
    ...reviewMeta.q_due_wrong,
    reviewStage: 2,
    nextReviewAt: '2026-06-12T00:00:00.000Z',
  }, false, now);
  assert.equal(resetMeta.reviewStage, 0);
  assert.equal(resetMeta.mastered, false);

  const advancedMeta = recordReviewAttempt(reviewMeta.q_due_wrong, true, now);
  assert.equal(advancedMeta.reviewStage, 1);
  assert.equal(advancedMeta.mastered, false);

  const masteredMeta = recordReviewAttempt({
    ...reviewMeta.q_due_wrong,
    reviewStage: 2,
  }, true, now);
  assert.equal(masteredMeta.mastered, true);
  assert.equal(masteredMeta.nextReviewAt, undefined);
}

const tests = [
  ['behavior-events', testBehaviorEvents],
  ['exam-papers', testExamPapers],
  ['image-storage', testImageStorage],
  ['question-binding', testQuestionBinding],
  ['practice-insights', testPracticeInsights],
] as const;

for (const [name, test] of tests) {
  test();
  console.log(`✓ ${name}`);
}

console.log(`✓ ${tests.length} unit suites passed`);
