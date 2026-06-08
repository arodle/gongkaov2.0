import { create } from 'zustand';
import type {
  KnowledgeNodeRecord,
  PracticeRecord,
  PSHistoryRecord,
  QuestionBankItem,
  AnswerRecord,
  BehaviorEventRecord,
  ExamResult,
  ExamPaper,
} from '@/types';
import {
  db,
  CURRENT_USER_ID,
  getNodesByUser,
  updateNodePS,
  addPracticeRecord,
  addPSHistory,
  createSnapshot,
  getPSHistory,
} from '@/lib/db/database';
import { normalizeBehaviorEvent } from '@/lib/behavior-events';
import { createExamPaperId, normalizeExamPaperName } from '@/lib/exam-papers';
import { filterInlineImageUrls } from '@/lib/image-storage';
import { buildKnowledgeBindingIndex, normalizeKnowledgeNodeId, normalizeQuestionBinding } from '@/lib/question-binding';
import { calculatePS, SCENARIO_COEFFICIENTS } from '@/lib/services/psCalculator';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  currentUserId: string;
  nodes: KnowledgeNodeRecord[];
  practiceRecords: PracticeRecord[];
  psHistory: PSHistoryRecord[];
  questionBank: QuestionBankItem[];
  answerRecords: AnswerRecord[];
  behaviorEvents: BehaviorEventRecord[];
  examResults: ExamResult[];
  examPapers: ExamPaper[];
  isInitialized: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';

  initialize: () => Promise<void>;
  loadBehaviorEventsForQuestion: (questionId: string) => Promise<void>;
  flushBehaviorEvents: () => Promise<void>;
  updateNodePSScore: (nodeId: string, isCorrect: boolean, scenario?: number) => Promise<void>;
  addAnswer: (record: AnswerRecord) => void;
  recordBehaviorEvent: (event: Omit<BehaviorEventRecord, 'id' | 'userId'> & { userId?: string }) => void;
  setOnlineStatus: (isOnline: boolean) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'success' | 'error') => void;
  createSafetySnapshot: (reason: string) => Promise<string>;
  getNodeById: (nodeId: string) => KnowledgeNodeRecord | undefined;
  getWeakNodes: (threshold?: number) => KnowledgeNodeRecord[];
  getNodePSHistory: (nodeId: string) => Promise<PSHistoryRecord[]>;
  getQuestionByAngleId: (angleId: string) => QuestionBankItem[];
  getNodeStats: (nodeId: string) => { correct: number; wrong: number };
  getWrongAnswersByNodeId: (nodeId: string) => PracticeRecord[];
  addQuestion: (question: QuestionBankItem) => void;
  updateQuestion: (question: QuestionBankItem) => void;
  deleteQuestion: (questionId: string) => void;
  addExamPaper: (paper: ExamPaper) => void;
  deleteExamPaper: (paperId: string) => void;
  updateNode: (node: Partial<KnowledgeNodeRecord> & { id: string }) => void;
  addNode: (node: Omit<KnowledgeNodeRecord, 'user_id' | 'updated_at' | 'ps_score' | 'last_practiced_at' | 'color_tag'>) => void;
  deleteNode: (nodeId: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUserId: CURRENT_USER_ID,
  nodes: [],
  practiceRecords: [],
  psHistory: [],
  questionBank: [],
  answerRecords: [],
  behaviorEvents: [],
  examResults: [],
  examPapers: [],
  isInitialized: false,
  isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
  syncStatus: 'idle',

  initialize: async () => {
    try {
      await ensureServerTablesInitialized();
      const currentUserId = await getClientUserId();
      await ensureLocalUserBoundary(currentUserId);

      let nodes = await getNodesByUser(currentUserId);
      let questionBankItems: QuestionBankItem[] = [];

      const neonResult = await fetchFromNeon(currentUserId);

      if (neonResult.nodes.length > 0) {
        if (nodes.length > 0) {
          const existingIds = new Set(nodes.map(n => n.id));
          const neonIds = new Set(neonResult.nodes.map(n => n.id));
          const hasDifferentData = neonResult.nodes.some(n => !existingIds.has(n.id))
            || nodes.some(n => !neonIds.has(n.id));

          if (hasDifferentData) {
            await db.knowledge_nodes.where('user_id').equals(currentUserId).delete();
            await db.knowledge_nodes.bulkAdd(neonResult.nodes);
            nodes = neonResult.nodes;
          }
        } else {
          nodes = neonResult.nodes;
        }
        questionBankItems = neonResult.questionBank;
      } else if (nodes.length === 0) {
        const result = await seedInitialData(currentUserId);
        nodes = await getNodesByUser(currentUserId);
        questionBankItems = result.questionBank;
      } else {
        const { SAMPLE_QUESTION_BANK } = await import('@/lib/sample-data');
        questionBankItems = SAMPLE_QUESTION_BANK.map(q => ({
          ...q,
          images: q.images || []
        }));
      }

      const records = await db.practice_records.where('user_id').equals(currentUserId).toArray();
      const history = await db.ps_history.where('user_id').equals(currentUserId).toArray();
      const behaviorEvents = (await db.behavior_events.where('userId').equals(currentUserId).toArray())
        .map(normalizeBehaviorEvent);
      questionBankItems = normalizeQuestionLinks(questionBankItems, nodes);
      const examPapers = neonResult.examPapers.length > 0
        ? neonResult.examPapers
        : deriveExamPapersFromQuestions(questionBankItems);

      set({
        currentUserId,
        nodes,
        questionBank: questionBankItems,
        examPapers,
        practiceRecords: records,
        psHistory: history,
        behaviorEvents,
        isInitialized: true,
      });
      await get().flushBehaviorEvents();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to initialize app state:', msg, error);
      set({ isInitialized: true });
    }
  },

  updateNodePSScore: async (nodeId: string, isCorrect: boolean, scenario = SCENARIO_COEFFICIENTS.PRACTICE) => {
    const state = get();
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const lastPracticed = node.last_practiced_at ? new Date(node.last_practiced_at) : null;
    const newPS = calculatePS({
      currentPS: node.ps_score,
      isCorrect,
      scenarioCoefficient: scenario,
      lastPracticedAt: lastPracticed,
    });

    await updateNodePS(nodeId, newPS, state.currentUserId);
    void syncNodeToNeon({
      id: nodeId,
      user_id: state.currentUserId,
      name: node.name,
      ps_score: newPS,
    });

    const historyRecord: PSHistoryRecord = {
      id: uuidv4(),
      node_id: nodeId,
      ps_score: newPS,
      recorded_at: new Date().toISOString(),
      user_id: state.currentUserId,
    };
    await addPSHistory(historyRecord);

    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId
          ? { ...n, ps_score: newPS, last_practiced_at: new Date().toISOString() }
          : n
      ),
      psHistory: [...state.psHistory, historyRecord],
    }));
  },

  addAnswer: (record: AnswerRecord) => {
    const currentUserId = get().currentUserId;
    const dbRecord: PracticeRecord = {
      id: uuidv4(),
      user_id: currentUserId,
      question_id: record.questionId,
      is_correct: record.isCorrect,
      answer_time: Date.now() - record.timestamp,
      source_node_ids: record.linkedAngleId ? [record.linkedAngleId] : [],
      updated_at: new Date().toISOString(),
    };

    addPracticeRecord(dbRecord).catch(console.error);
    void syncAnswerToNeon(record);

    set(state => ({
      answerRecords: [...state.answerRecords, record],
      practiceRecords: [...state.practiceRecords, dbRecord],
    }));
  },

  loadBehaviorEventsForQuestion: async (questionId: string) => {
    const currentUserId = get().currentUserId;

    try {
      const response = await fetch(`/api/behavior-events?questionId=${encodeURIComponent(questionId)}`);
      if (response.ok) {
        const json = await response.json();
        const remoteEvents = Array.isArray(json.events) ? json.events as BehaviorEventRecord[] : [];
        if (remoteEvents.length > 0) {
          await db.behavior_events.bulkPut(remoteEvents.map(event => ({
            ...event,
            userId: currentUserId,
            sync_status: 'synced' as const,
            created_at: event.startTime,
          })));
        }
      }
    } catch (err) {
      console.warn('Failed to load behavior events for question:', err);
    }

    const events = await db.behavior_events
      .where('questionId')
      .equals(questionId)
      .filter(event => event.userId === currentUserId)
      .toArray();

    set(state => {
      const otherEvents = state.behaviorEvents.filter(event => event.questionId !== questionId);
      return {
        behaviorEvents: [...otherEvents, ...events].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    });
  },

  flushBehaviorEvents: async () => {
    const currentUserId = get().currentUserId;
    const pendingEvents = await db.behavior_events
      .where('sync_status')
      .equals('pending')
      .filter(event => event.userId === currentUserId)
      .toArray();

    if (pendingEvents.length === 0) return;
    const synced = await syncBehaviorEventsToNeon(pendingEvents);
    if (!synced) return;

    await db.behavior_events.bulkPut(pendingEvents.map(event => ({
      ...event,
      sync_status: 'synced' as const,
    })));
    set(state => ({
      behaviorEvents: state.behaviorEvents.map(event => (
        pendingEvents.some(pending => pending.id === event.id)
          ? { ...event, sync_status: 'synced' as const }
          : event
      )),
    }));
  },

  recordBehaviorEvent: (event) => {
    const currentUserId = get().currentUserId;
    const behaviorEvent: BehaviorEventRecord = {
      id: uuidv4(),
      schemaVersion: 1,
      userId: event.userId || currentUserId,
      questionId: event.questionId,
      eventType: event.eventType,
      target: event.target,
      startTime: event.startTime,
      endTime: event.endTime,
      metadata: event.metadata || {},
    };
    const normalizedEvent = normalizeBehaviorEvent(behaviorEvent);

    void db.behavior_events.put({
      ...normalizedEvent,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    }).then(() => get().flushBehaviorEvents());

    set(state => ({
      behaviorEvents: [...state.behaviorEvents, normalizedEvent],
    }));
  },

  setOnlineStatus: (isOnline: boolean) => {
    set({ isOnline });
    if (isOnline) void get().flushBehaviorEvents();
  },

  setSyncStatus: (syncStatus: 'idle' | 'syncing' | 'success' | 'error') => set({ syncStatus }),

  createSafetySnapshot: async (reason: string) => {
    return createSnapshot(reason);
  },

  getNodeById: (nodeId: string) => {
    return get().nodes.find(n => n.id === nodeId);
  },

  getWeakNodes: (threshold = 80) => {
    return get().nodes.filter(n => n.ps_score < threshold);
  },

  getNodePSHistory: async (nodeId: string) => {
    return getPSHistory(nodeId);
  },

  getQuestionByAngleId: (angleId: string) => {
    return get().questionBank.filter(q => q.linkedAngleId === angleId);
  },

  getNodeStats: (nodeId: string) => {
    const records = get().practiceRecords.filter(r =>
      r.source_node_ids.includes(nodeId)
    );
    return {
      correct: records.filter(r => r.is_correct).length,
      wrong: records.filter(r => !r.is_correct).length,
    };
  },

  getWrongAnswersByNodeId: (nodeId: string) => {
    return get().practiceRecords.filter(r =>
      r.source_node_ids.includes(nodeId) && !r.is_correct
    );
  },

  addQuestion: (question: QuestionBankItem) => {
    const sanitizedQuestion = sanitizeQuestionImages(question);
    set(state => ({
      questionBank: [...state.questionBank, sanitizedQuestion],
    }));
  },

  updateQuestion: (question: QuestionBankItem) => {
    const sanitizedQuestion = sanitizeQuestionImages(question);
    set(state => ({
      questionBank: state.questionBank.map(q =>
        q.id === sanitizedQuestion.id ? sanitizedQuestion : q
      ),
    }));
  },

  deleteQuestion: (questionId: string) => {
    set(state => ({
      questionBank: state.questionBank.filter(q => q.id !== questionId),
    }));
  },

  addExamPaper: (paper: ExamPaper) => {
    set(state => ({
      examPapers: [...state.examPapers, paper],
    }));
  },

  deleteExamPaper: (paperId: string) => {
    set(state => ({
      examPapers: state.examPapers.filter(p => p.id !== paperId),
    }));
  },

  updateNode: (node) => {
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === node.id ? { ...n, ...node } : n
      ),
    }));
  },

  addNode: (node) => {
    const currentUserId = get().currentUserId;
    const newNode: KnowledgeNodeRecord = {
      ...node,
      user_id: currentUserId,
      ps_score: 50,
      last_practiced_at: null,
      color_tag: 'default',
      updated_at: new Date().toISOString(),
    };
    set(state => ({
      nodes: [...state.nodes, newNode],
    }));
  },

  deleteNode: (nodeId: string) => {
    set(state => {
      const childIds = new Set<string>();
      
      const collectChildren = (id: string) => {
        state.nodes.forEach(n => {
          if (n.parent_id === id) {
            childIds.add(n.id);
            collectChildren(n.id);
          }
        });
      };
      collectChildren(nodeId);
      
      const keepIds = new Set(state.nodes.map(n => n.id));
      keepIds.delete(nodeId);
      childIds.forEach(id => keepIds.delete(id));
      
      return {
        nodes: state.nodes.filter(n => keepIds.has(n.id)),
      };
    });
  },
}));

interface NeonSyncNode {
  id: string;
  user_id: string;
  name: string;
  node_type: string;
  content?: string;
  annotation?: string;
  parent_id: string | null;
  pos_x: number;
  pos_y: number;
  ps_score: number;
  last_practiced_at: string | null;
  color_tag: string;
}

interface NeonSyncQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation?: string;
  knowledge_path?: string;
  linked_angle_id?: string;
  source?: string;
  type?: string;
  reference?: string;
  exam_paper?: string;
}

interface NeonSyncExamPaper {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  question_count?: number;
  question_ids?: string[];
  created_at?: string;
}

interface SampleMindMapNode {
  id: string;
  name: string;
  type: KnowledgeNodeRecord['node_type'];
  content?: string;
  annotation?: string;
  children?: SampleMindMapNode[];
}

function normalizeQuestionNodeId(id?: string | null) {
  return normalizeKnowledgeNodeId(id);
}

function sanitizeQuestionImages<T extends QuestionBankItem>(question: T): T {
  const { images } = filterInlineImageUrls(question.images);
  return { ...question, images };
}

function deriveExamPapersFromQuestions(questions: QuestionBankItem[]): ExamPaper[] {
  const byName = new Map<string, ExamPaper>();

  questions.forEach(question => {
    const name = normalizeExamPaperName(question.examPaper);
    if (!name) return;

    const existing = byName.get(name);
    if (existing) {
      existing.questions.push(question.id);
      existing.questionCount = existing.questions.length;
      return;
    }

    byName.set(name, {
      id: createExamPaperId(name),
      name,
      description: '',
      type: question.type === 'simulated' ? 'simulated' : 'real',
      questions: [question.id],
      questionCount: 1,
      createdAt: question.createdAt || new Date().toISOString(),
      completedCount: 0,
      avgScore: 0,
    });
  });

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeQuestionLinks(questions: QuestionBankItem[], nodes: KnowledgeNodeRecord[]) {
  if (questions.length === 0 || nodes.length === 0) return questions;
  const bindingIndex = buildKnowledgeBindingIndex(nodes);
  return questions.map(question => normalizeQuestionBinding(question, bindingIndex));

  const byId = new Map<string, KnowledgeNodeRecord>();
  const byName = new Map<string, KnowledgeNodeRecord>();
  const byPath = new Map<string, KnowledgeNodeRecord>();
  const pathById = new Map<string, string>();

  nodes.forEach(node => {
    byId.set(node.id, node);
    byId.set(normalizeQuestionNodeId(node.id), node);
    byId.set(`mn_${normalizeQuestionNodeId(node.id)}`, node);
    if (!byName.has(node.name)) byName.set(node.name, node);
  });

  const getPath = (nodeId: string) => {
    const parts: string[] = [];
    let current = byId.get(nodeId) || byId.get(normalizeQuestionNodeId(nodeId));
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      parts.unshift(current.name);
      current = current.parent_id
        ? byId.get(current.parent_id) || byId.get(normalizeQuestionNodeId(current.parent_id))
        : undefined;
    }

    return parts.join('》');
  };

  nodes.forEach(node => {
    const path = getPath(node.id);
    pathById.set(node.id, path);
    pathById.set(normalizeQuestionNodeId(node.id), path);
    if (path) byPath.set(path, node);
  });

  return questions.map(question => {
    const normalizedId = normalizeQuestionNodeId(question.linkedAngleId);
    const path = question.knowledgePath?.trim();
    const lastPathName = path?.split(/[》>\/]/).map(part => part.trim()).filter(Boolean).at(-1);
    const linkedNode = (normalizedId && (byId.get(normalizedId) || byId.get(`mn_${normalizedId}`)))
      || (path && byPath.get(path))
      || (lastPathName && byName.get(lastPathName))
      || (question.linkedAngleName && byName.get(question.linkedAngleName));

    if (!linkedNode) {
      return {
        ...question,
        linkedAngleId: normalizedId,
      };
    }

    return {
      ...question,
      linkedAngleId: normalizeQuestionNodeId(linkedNode.id),
      linkedAngleName: linkedNode.name,
      knowledgePath: pathById.get(linkedNode.id) || question.knowledgePath || linkedNode.name,
    };
  });
}

async function getClientUserId() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) return CURRENT_USER_ID;
    const json = await response.json();
    return typeof json.user?.id === 'string' ? json.user.id : CURRENT_USER_ID;
  } catch {
    return CURRENT_USER_ID;
  }
}

async function ensureServerTablesInitialized() {
  const initVersion = '2026-06-04-question-soft-delete';
  const storageKey = 'gongkao.serverInitVersion';

  if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === initVersion) {
    return;
  }

  const response = await fetch('/api/init');
  if (!response.ok) return;

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, initVersion);
  }
}

async function ensureLocalUserBoundary(userId: string) {
  if (typeof window === 'undefined') return;

  const storageKey = 'gongkao.currentUserId';
  const lastUserId = window.localStorage.getItem(storageKey);
  if (!lastUserId || lastUserId === userId) {
    window.localStorage.setItem(storageKey, userId);
    return;
  }

  await db.transaction('rw', [
    db.knowledge_nodes,
    db.practice_records,
    db.ps_history,
    db.behavior_events,
  ], async () => {
    await db.knowledge_nodes.clear();
    await db.practice_records.clear();
    await db.ps_history.clear();
    await db.behavior_events.clear();
  });
  window.localStorage.setItem(storageKey, userId);
}

async function fetchFromNeon(currentUserId = CURRENT_USER_ID) {
  try {
    const response = await fetch('/api/sync');
    if (!response.ok) {
      return {
        nodes: [] as KnowledgeNodeRecord[],
        questionBank: [] as QuestionBankItem[],
        examPapers: [] as ExamPaper[],
      };
    }

    const json = await response.json();
    if (!json.success) {
      return {
        nodes: [] as KnowledgeNodeRecord[],
        questionBank: [] as QuestionBankItem[],
        examPapers: [] as ExamPaper[],
      };
    }

    const knowledgeNodes: NeonSyncNode[] = json.data?.knowledgeNodes ?? [];
    const questions: NeonSyncQuestion[] = json.data?.questions ?? [];
    const examPaperRecords: NeonSyncExamPaper[] = json.data?.examPapers ?? [];

    const nodes: KnowledgeNodeRecord[] = knowledgeNodes.map(n => ({
      id: n.id,
      user_id: n.user_id || currentUserId,
      name: n.name,
      parent_id: n.parent_id,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      ps_score: n.ps_score,
      last_practiced_at: n.last_practiced_at,
      color_tag: n.color_tag || 'default',
      node_type: n.node_type as 'subject' | 'knowledge' | 'subknowledge' | 'angle',
      content: n.content,
      annotation: n.annotation,
      updated_at: new Date().toISOString(),
    }));

    const questionBankItems: QuestionBankItem[] = questions.map(q => ({
      id: q.id,
      content: q.question_text,
      options: [
        { label: 'A', text: q.option_a || '' },
        { label: 'B', text: q.option_b || '' },
        { label: 'C', text: q.option_c || '' },
        { label: 'D', text: q.option_d || '' },
      ],
      correctAnswer: q.correct_answer,
      explanation: q.explanation || '',
      images: [],
      linkedAngleId: normalizeQuestionNodeId(q.linked_angle_id),
      linkedAngleName: '',
      knowledgePath: q.knowledge_path,
      source: q.source,
      type: (q.type as 'real' | 'simulated') || (q.source as 'real' | 'simulated'),
      reference: q.reference,
      examPaper: normalizeExamPaperName(q.exam_paper),
      createdAt: new Date().toISOString(),
    }));

    const examPapers: ExamPaper[] = examPaperRecords.map(paper => {
      const name = normalizeExamPaperName(paper.name);
      const questions = Array.isArray(paper.question_ids) ? paper.question_ids : [];

      return {
        id: paper.id || createExamPaperId(name),
        name,
        description: paper.description || '',
        type: paper.type === 'simulated' ? 'simulated' as const : 'real' as const,
        questions,
        questionCount: Number(paper.question_count || questions.length) || questions.length,
        createdAt: paper.created_at || new Date().toISOString(),
        completedCount: 0,
        avgScore: 0,
      };
    }).filter(paper => paper.name);

    return { nodes, questionBank: questionBankItems, examPapers };
  } catch {
    return {
      nodes: [] as KnowledgeNodeRecord[],
      questionBank: [] as QuestionBankItem[],
      examPapers: [] as ExamPaper[],
    };
  }
}

export async function syncNodeToNeon(node: {
  id: string;
  user_id: string;
  name?: string;
  parent_id?: string | null;
  pos_x?: number;
  pos_y?: number;
  ps_score?: number;
  node_type?: string;
  content?: string;
  annotation?: string;
}) {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knowledgeNode: {
          id: node.id,
          name: node.name,
          parent_id: node.parent_id,
          pos_x: node.pos_x,
          pos_y: node.pos_y,
          ps_score: node.ps_score,
          node_type: node.node_type,
          content: node.content,
          annotation: node.annotation,
        },
      }),
    });
    const json = await response.json();
    return json.success;
  } catch (err) {
    console.error('Failed to sync node to Neon:', err);
    return false;
  }
}

export async function syncNodeDeleteToNeon(_userId: string, nodeIds: string[]) {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteNodeIds: nodeIds }),
    });
    const json = await response.json();
    return json.success;
  } catch (err) {
    console.error('Failed to sync node delete to Neon:', err);
    return false;
  }
}

async function syncAnswerToNeon(record: AnswerRecord) {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{
          question_id: record.questionId,
          selected_answer: record.selectedAnswer,
          is_correct: record.isCorrect,
          practice_mode: record.source || 'practice',
          practice_set_id: record.practiceSetId,
        }],
      }),
    });
    const json = await response.json();
    return json.success;
  } catch (err) {
    console.error('Failed to sync answer to Neon:', err);
    return false;
  }
}

async function syncBehaviorEventsToNeon(events: BehaviorEventRecord[]) {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ behaviorEvents: events }),
    });
    const json = await response.json();
    return json.success;
  } catch (err) {
    console.error('Failed to sync behavior events to Neon:', err);
    return false;
  }
}

async function seedInitialData(userId = CURRENT_USER_ID) {
  const { SAMPLE_MIND_MAP } = await import('@/lib/sample-data');
  const { SAMPLE_QUESTION_BANK } = await import('@/lib/sample-data');

  const nodesToAdd: KnowledgeNodeRecord[] = [];

  function traverseTree(node: SampleMindMapNode, parentId: string | null = null, depth = 0) {
    const x = depth * 200;
    const y = 0;

    nodesToAdd.push({
      id: node.id,
      user_id: userId,
      name: node.name,
      parent_id: parentId,
      pos_x: x,
      pos_y: y,
      ps_score: 50,
      last_practiced_at: null,
      color_tag: 'default',
      node_type: node.type,
      content: node.content,
      annotation: node.annotation,
      updated_at: new Date().toISOString(),
    });

    if (node.children) {
      node.children.forEach((child) => {
        traverseTree(child, node.id, depth + 1);
      });
    }
  }

  traverseTree(SAMPLE_MIND_MAP as SampleMindMapNode);

  await db.knowledge_nodes.bulkAdd(nodesToAdd);

  const bankItems: QuestionBankItem[] = SAMPLE_QUESTION_BANK.map(item => ({
    ...item,
    images: item.images || [],
    createdAt: item.createdAt,
  }));

  return { questionBank: bankItems };
}
