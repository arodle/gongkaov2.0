import type { PracticeRecord, QuestionBankItem } from '@/types';

export type WrongReasonTag = 'careless' | 'knowledge' | 'misread' | 'calculation' | 'time';
export type QuantityStrategyTag = 'give-up' | 'estimate' | 'formula' | 'substitution';

export interface QuestionReviewMeta {
  reasonTags: WrongReasonTag[];
  strategyTags: QuantityStrategyTag[];
  nextReviewAt?: string;
  reviewStage: number;
  mastered?: boolean;
  updatedAt: string;
}

export interface DailyTrainingPlanSummary {
  total: number;
  dueReview: number;
  wrongReview: number;
  fresh: number;
  linkedKnowledge: number;
}

export const WRONG_REASON_LABELS: Record<WrongReasonTag, string> = {
  careless: '粗心',
  knowledge: '知识点不会',
  misread: '审题错误',
  calculation: '计算错误',
  time: '时间不足',
};

export const QUANTITY_STRATEGY_LABELS: Record<QuantityStrategyTag, string> = {
  'give-up': '放弃',
  estimate: '估算',
  formula: '列式',
  substitution: '代入',
};

const REVIEW_INTERVAL_DAYS = [1, 3, 7];

export function getNextReviewDate(stage: number, now = new Date()) {
  const days = REVIEW_INTERVAL_DAYS[Math.min(Math.max(stage, 0), REVIEW_INTERVAL_DAYS.length - 1)];
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function createDefaultReviewMeta(now = new Date()): QuestionReviewMeta {
  return {
    reasonTags: [],
    strategyTags: [],
    nextReviewAt: getNextReviewDate(0, now),
    reviewStage: 0,
    mastered: false,
    updatedAt: now.toISOString(),
  };
}

export function advanceReviewMeta(meta?: QuestionReviewMeta, now = new Date()): QuestionReviewMeta {
  const base = meta || createDefaultReviewMeta(now);
  const nextStage = Math.min(base.reviewStage + 1, REVIEW_INTERVAL_DAYS.length - 1);
  return {
    ...base,
    reviewStage: nextStage,
    nextReviewAt: getNextReviewDate(nextStage, now),
    mastered: false,
    updatedAt: now.toISOString(),
  };
}

export function recordReviewAttempt(
  meta: QuestionReviewMeta | undefined,
  isCorrect: boolean,
  now = new Date()
): QuestionReviewMeta {
  const base = meta || createDefaultReviewMeta(now);

  if (!isCorrect) {
    return {
      ...base,
      nextReviewAt: getNextReviewDate(0, now),
      reviewStage: 0,
      mastered: false,
      updatedAt: now.toISOString(),
    };
  }

  if (base.reviewStage >= REVIEW_INTERVAL_DAYS.length - 1) {
    return {
      ...base,
      nextReviewAt: undefined,
      mastered: true,
      updatedAt: now.toISOString(),
    };
  }

  return advanceReviewMeta(base, now);
}

export function isReviewDue(meta?: QuestionReviewMeta, now = new Date()) {
  if (meta?.mastered) return false;
  if (!meta?.nextReviewAt) return true;
  return new Date(meta.nextReviewAt).getTime() <= now.getTime();
}

export function getQuestionTypeLabel(question?: Pick<QuestionBankItem, 'questionType' | 'knowledgePath'>) {
  return question?.questionType?.trim()
    || question?.knowledgePath?.split(/[》>\/]/).map(part => part.trim()).filter(Boolean).at(-1)
    || '未分类';
}

export function getAverageAnswerTimeByType(
  questionBank: QuestionBankItem[],
  practiceRecords: PracticeRecord[]
) {
  const questionById = new Map(questionBank.map(question => [question.id, question]));
  const aggregate = new Map<string, { total: number; count: number }>();

  practiceRecords.forEach(record => {
    const question = questionById.get(record.question_id);
    if (!question || !Number.isFinite(record.answer_time) || record.answer_time <= 0) return;
    const type = getQuestionTypeLabel(question);
    const current = aggregate.get(type) || { total: 0, count: 0 };
    aggregate.set(type, {
      total: current.total + record.answer_time,
      count: current.count + 1,
    });
  });

  const averages = new Map<string, number>();
  aggregate.forEach((value, key) => {
    if (value.count > 0) averages.set(key, value.total / value.count);
  });
  return averages;
}

export function buildDailyTrainingPlan(
  questionBank: QuestionBankItem[],
  practiceRecords: PracticeRecord[],
  reviewMetaByQuestion: Record<string, QuestionReviewMeta>,
  limit = 15,
  now = new Date()
) {
  return scoreDailyTrainingPlan(questionBank, practiceRecords, reviewMetaByQuestion, now)
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(item => item.question);
}

export function buildDailyTrainingPlanSummary(
  planQuestions: QuestionBankItem[],
  practiceRecords: PracticeRecord[],
  reviewMetaByQuestion: Record<string, QuestionReviewMeta>,
  now = new Date()
): DailyTrainingPlanSummary {
  const answeredIds = new Set(practiceRecords.map(record => record.question_id));
  const wrongIds = new Set(practiceRecords.filter(record => !record.is_correct).map(record => record.question_id));
  const dueIds = new Set(
    Object.entries(reviewMetaByQuestion)
      .filter(([, meta]) => isReviewDue(meta, now))
      .map(([questionId]) => questionId)
  );

  return planQuestions.reduce<DailyTrainingPlanSummary>((summary, question) => ({
    total: summary.total + 1,
    dueReview: summary.dueReview + (dueIds.has(question.id) ? 1 : 0),
    wrongReview: summary.wrongReview + (wrongIds.has(question.id) ? 1 : 0),
    fresh: summary.fresh + (!answeredIds.has(question.id) ? 1 : 0),
    linkedKnowledge: summary.linkedKnowledge + (question.linkedAngleId ? 1 : 0),
  }), {
    total: 0,
    dueReview: 0,
    wrongReview: 0,
    fresh: 0,
    linkedKnowledge: 0,
  });
}

function scoreDailyTrainingPlan(
  questionBank: QuestionBankItem[],
  practiceRecords: PracticeRecord[],
  reviewMetaByQuestion: Record<string, QuestionReviewMeta>,
  now = new Date()
) {
  const answeredIds = new Set(practiceRecords.map(record => record.question_id));
  const wrongIds = new Set(practiceRecords.filter(record => !record.is_correct).map(record => record.question_id));
  const dueIds = new Set(
    Object.entries(reviewMetaByQuestion)
      .filter(([, meta]) => isReviewDue(meta, now))
      .map(([questionId]) => questionId)
  );

  const scored = questionBank.map(question => {
    let score = 0;
    if (dueIds.has(question.id)) score += 80;
    if (wrongIds.has(question.id)) score += 50;
    if (!answeredIds.has(question.id)) score += 20;
    if (question.linkedAngleId) score += 5;
    return { question, score };
  });
  return scored;
}
