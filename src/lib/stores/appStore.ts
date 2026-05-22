import { create } from 'zustand';
import type {
  KnowledgeNodeRecord,
  PracticeRecord,
  PSHistoryRecord,
  QuestionBankItem,
  AnswerRecord,
  ExamResult,
  ExamPaper,
  Question,
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
  getBackupConfig,
  updateBackupConfig,
} from '@/lib/db/database';
import { calculatePS, SCENARIO_COEFFICIENTS } from '@/lib/services/psCalculator';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  nodes: KnowledgeNodeRecord[];
  practiceRecords: PracticeRecord[];
  psHistory: PSHistoryRecord[];
  questionBank: QuestionBankItem[];
  answerRecords: AnswerRecord[];
  examResults: ExamResult[];
  examPapers: ExamPaper[];
  isInitialized: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';

  initialize: () => Promise<void>;
  updateNodePSScore: (nodeId: string, isCorrect: boolean, scenario?: number) => Promise<void>;
  addAnswer: (record: AnswerRecord) => void;
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
  nodes: [],
  practiceRecords: [],
  psHistory: [],
  questionBank: [],
  answerRecords: [],
  examResults: [],
  examPapers: [],
  isInitialized: false,
  isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
  syncStatus: 'idle',

  initialize: async () => {
    try {
      await fetch('/api/init');

      let nodes = await getNodesByUser();
      let questionBankItems: QuestionBankItem[] = [];

      const neonResult = await fetchFromNeon();

      if (neonResult.nodes.length > 0) {
        if (nodes.length > 0) {
          const existingIds = new Set(nodes.map(n => n.id));
          const neonIds = new Set(neonResult.nodes.map(n => n.id));
          const hasDifferentData = neonResult.nodes.some(n => !existingIds.has(n.id))
            || nodes.some(n => !neonIds.has(n.id));

          if (hasDifferentData) {
            await db.knowledge_nodes.clear();
            await db.knowledge_nodes.bulkAdd(neonResult.nodes);
            nodes = neonResult.nodes;
          }
        } else {
          nodes = neonResult.nodes;
        }
        questionBankItems = neonResult.questionBank;
      } else if (nodes.length === 0) {
        const result = await seedInitialData();
        nodes = await getNodesByUser();
        questionBankItems = result.questionBank;
      } else {
        const { SAMPLE_QUESTION_BANK } = await import('@/lib/sample-data');
        questionBankItems = SAMPLE_QUESTION_BANK.map(q => ({
          ...q,
          images: q.images || []
        }));
      }

      const records = await db.practice_records.where('user_id').equals(CURRENT_USER_ID).toArray();
      const history = await db.ps_history.where('user_id').equals(CURRENT_USER_ID).toArray();

      set({
        nodes,
        questionBank: questionBankItems,
        practiceRecords: records,
        psHistory: history,
        isInitialized: true,
      });
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

    await updateNodePS(nodeId, newPS);

    const historyRecord: PSHistoryRecord = {
      id: uuidv4(),
      node_id: nodeId,
      ps_score: newPS,
      recorded_at: new Date().toISOString(),
      user_id: CURRENT_USER_ID,
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
    const dbRecord: PracticeRecord = {
      id: uuidv4(),
      user_id: CURRENT_USER_ID,
      question_id: record.questionId,
      is_correct: record.isCorrect,
      answer_time: Date.now() - record.timestamp,
      source_node_ids: record.linkedAngleId ? [record.linkedAngleId] : [],
      updated_at: new Date().toISOString(),
    };

    addPracticeRecord(dbRecord).catch(console.error);

    set(state => ({
      answerRecords: [...state.answerRecords, record],
      practiceRecords: [...state.practiceRecords, dbRecord],
    }));
  },

  setOnlineStatus: (isOnline: boolean) => set({ isOnline }),

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
    set(state => ({
      questionBank: [...state.questionBank, question],
    }));
  },

  updateQuestion: (question: QuestionBankItem) => {
    set(state => ({
      questionBank: state.questionBank.map(q =>
        q.id === question.id ? question : q
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
    const newNode: KnowledgeNodeRecord = {
      ...node,
      user_id: CURRENT_USER_ID,
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
}

async function fetchFromNeon() {
  try {
    const response = await fetch('/api/sync');
    if (!response.ok) return { nodes: [] as KnowledgeNodeRecord[], questionBank: [] as QuestionBankItem[] };

    const json = await response.json();
    if (!json.success) return { nodes: [] as KnowledgeNodeRecord[], questionBank: [] as QuestionBankItem[] };

    const knowledgeNodes: NeonSyncNode[] = json.data?.knowledgeNodes ?? [];
    const questions: NeonSyncQuestion[] = json.data?.questions ?? [];

    const nodes: KnowledgeNodeRecord[] = knowledgeNodes.map(n => ({
      id: n.id,
      user_id: n.user_id || CURRENT_USER_ID,
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
      linkedAngleId: q.linked_angle_id || '',
      linkedAngleName: '',
      knowledgePath: q.knowledge_path,
      source: q.source,
      reference: q.reference,
      createdAt: new Date().toISOString(),
    }));

    return { nodes, questionBank: questionBankItems };
  } catch {
    return { nodes: [] as KnowledgeNodeRecord[], questionBank: [] as QuestionBankItem[] };
  }
}

export async function syncNodeToNeon(node: {
  id: string;
  user_id: string;
  name: string;
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
      headers: { 'Content-Type': 'application/json', 'x-user-id': node.user_id },
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

export async function syncNodeDeleteToNeon(userId: string, nodeIds: string[]) {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ deleteNodeIds: nodeIds }),
    });
    const json = await response.json();
    return json.success;
  } catch (err) {
    console.error('Failed to sync node delete to Neon:', err);
    return false;
  }
}

async function seedInitialData() {
  const { SAMPLE_MIND_MAP } = await import('@/lib/sample-data');
  const { SAMPLE_QUESTION_BANK } = await import('@/lib/sample-data');

  const nodesToAdd: KnowledgeNodeRecord[] = [];

  function traverseTree(node: any, parentId: string | null = null, depth = 0) {
    const x = depth * 200;
    const y = 0;

    nodesToAdd.push({
      id: node.id,
      user_id: CURRENT_USER_ID,
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
      let childIndex = 0;
      node.children.forEach((child: any) => {
        traverseTree(child, node.id, depth + 1);
        childIndex++;
      });
    }
  }

  traverseTree(SAMPLE_MIND_MAP);

  await db.knowledge_nodes.bulkAdd(nodesToAdd);

  const bankItems: QuestionBankItem[] = SAMPLE_QUESTION_BANK.map(item => ({
    ...item,
    images: item.images || [],
    createdAt: item.createdAt,
  }));

  return { questionBank: bankItems };
}
