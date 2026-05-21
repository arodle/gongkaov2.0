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
      let nodes = await getNodesByUser();

      if (nodes.length === 0) {
        const result = await seedInitialData();
        nodes = await getNodesByUser();
        set({ questionBank: result.questionBank });
      } else {
        const { SAMPLE_QUESTION_BANK } = await import('@/lib/sample-data');
        // 确保所有题目都有images字段
        const questionBankWithImages = SAMPLE_QUESTION_BANK.map(q => ({
          ...q,
          images: q.images || []
        }));
        set({ questionBank: questionBankWithImages });
      }

      const records = await db.practice_records.where('user_id').equals(CURRENT_USER_ID).toArray();
      const history = await db.ps_history.where('user_id').equals(CURRENT_USER_ID).toArray();

      set({
        nodes,
        practiceRecords: records,
        psHistory: history,
        isInitialized: true,
      });
    } catch (error) {
      console.error('Failed to initialize app state:', error);
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

  // 确保所有题目都有images字段
  const bankItems: QuestionBankItem[] = SAMPLE_QUESTION_BANK.map(item => ({
    ...item,
    images: item.images || [],
    createdAt: item.createdAt,
  }));

  return { questionBank: bankItems };
}
