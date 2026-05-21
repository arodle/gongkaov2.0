'use client';

import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef } from 'react';
import type { KnowledgeNode, PracticeSet, AnswerRecord, ExamResult, QuestionBankItem } from './types';
import { SAMPLE_MIND_MAP, SAMPLE_PRACTICE_SETS, SAMPLE_QUESTION_BANK } from './sample-data';

interface AppState {
  mindMap: KnowledgeNode;
  practiceSets: PracticeSet[];
  questionBank: QuestionBankItem[];
  answerRecords: AnswerRecord[];
  examResults: ExamResult[];
  nodeStats: Record<string, { correctCount: number; wrongCount: number }>;
}

type Action =
  | { type: 'SET_MIND_MAP'; payload: KnowledgeNode }
  | { type: 'ADD_PRACTICE_SET'; payload: PracticeSet }
  | { type: 'UPDATE_PRACTICE_SET'; payload: PracticeSet }
  | { type: 'DELETE_PRACTICE_SET'; payload: string }
  | { type: 'ADD_QUESTION_BANK_ITEMS'; payload: QuestionBankItem[] }
  | { type: 'REMOVE_QUESTION_BANK_ITEM'; payload: string }
  | { type: 'ADD_ANSWER_RECORD'; payload: AnswerRecord }
  | { type: 'ADD_EXAM_RESULT'; payload: ExamResult }
  | { type: 'UPDATE_NODE_STATS'; payload: Record<string, { correctCount: number; wrongCount: number }> }
  | { type: 'LOAD_STATE'; payload: AppState };

const STORAGE_KEY = 'civil-exam-app-state';

function buildNodeStats(
  mindMap: KnowledgeNode,
  answerRecords: AnswerRecord[],
  questionBank?: QuestionBankItem[],
): Record<string, { correctCount: number; wrongCount: number }> {
  const stats: Record<string, { correctCount: number; wrongCount: number }> = {};

  function traverse(node: KnowledgeNode): void {
    stats[node.id] = { correctCount: 0, wrongCount: 0 };
    for (const child of node.children) {
      traverse(child);
    }
  }
  traverse(mindMap);

  // Map 1: angleId -> Set of inline question IDs (from mind map node.questions)
  const angleQuestionMap: Record<string, Set<string>> = {};
  function mapQuestions(node: KnowledgeNode): void {
    if (!angleQuestionMap[node.id]) angleQuestionMap[node.id] = new Set();
    for (const q of node.questions) {
      angleQuestionMap[node.id].add(q.id);
    }
    for (const child of node.children) {
      mapQuestions(child);
    }
  }
  mapQuestions(mindMap);

  for (const record of answerRecords) {
    // Strategy 1: If record has linkedAngleId, use it directly
    if (record.linkedAngleId && stats[record.linkedAngleId]) {
      if (record.isCorrect) {
        stats[record.linkedAngleId].correctCount++;
      } else {
        stats[record.linkedAngleId].wrongCount++;
      }
      continue;
    }
    // Strategy 2: Match by questionId in angleQuestionMap (inline questions)
    let matched = false;
    for (const [angleId, questionIds] of Object.entries(angleQuestionMap)) {
      if (questionIds.has(record.questionId) && stats[angleId]) {
        if (record.isCorrect) {
          stats[angleId].correctCount++;
        } else {
          stats[angleId].wrongCount++;
        }
        matched = true;
      }
    }
    // Strategy 3: Match by questionId in questionBank (bank questions have linkedAngleId)
    if (!matched && questionBank) {
      const bankItem = questionBank.find((q: QuestionBankItem) => q.id === record.questionId);
      if (bankItem?.linkedAngleId && stats[bankItem.linkedAngleId]) {
        if (record.isCorrect) {
          stats[bankItem.linkedAngleId].correctCount++;
        } else {
          stats[bankItem.linkedAngleId].wrongCount++;
        }
      }
    }
  }

  return stats;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MIND_MAP': {
      const nodeStats = buildNodeStats(action.payload, state.answerRecords, state.questionBank);
      return { ...state, mindMap: action.payload, nodeStats };
    }
    case 'ADD_PRACTICE_SET':
      return { ...state, practiceSets: [...state.practiceSets, action.payload] };
    case 'UPDATE_PRACTICE_SET':
      return {
        ...state,
        practiceSets: state.practiceSets.map((ps) =>
          ps.id === action.payload.id ? action.payload : ps,
        ),
      };
    case 'DELETE_PRACTICE_SET':
      return {
        ...state,
        practiceSets: state.practiceSets.filter((ps) => ps.id !== action.payload),
      };
    case 'ADD_QUESTION_BANK_ITEMS':
      return { ...state, questionBank: [...state.questionBank, ...action.payload] };
    case 'REMOVE_QUESTION_BANK_ITEM':
      return {
        ...state,
        questionBank: state.questionBank.filter((q) => q.id !== action.payload),
      };
    case 'ADD_ANSWER_RECORD': {
      const newRecords = [...state.answerRecords, action.payload];
      const nodeStats = buildNodeStats(state.mindMap, newRecords, state.questionBank);
      return { ...state, answerRecords: newRecords, nodeStats };
    }
    case 'ADD_EXAM_RESULT':
      return { ...state, examResults: [...state.examResults, action.payload] };
    case 'UPDATE_NODE_STATS':
      return { ...state, nodeStats: action.payload };
    case 'LOAD_STATE': {
      const loaded = action.payload as AppState;
      // Rebuild nodeStats from scratch using current mindMap + answerRecords
      // This fixes stale nodeStats from old localStorage data
      // and handles records that may lack linkedAngleId
      const nodeStats = buildNodeStats(loaded.mindMap, loaded.answerRecords || [], loaded.questionBank || []);
      return { ...loaded, nodeStats };
    }
    default:
      return state;
  }
}

const initialState: AppState = {
  mindMap: SAMPLE_MIND_MAP,
  practiceSets: SAMPLE_PRACTICE_SETS,
  questionBank: SAMPLE_QUESTION_BANK,
  answerRecords: [],
  examResults: [],
  nodeStats: {},
};

function checkPathLitUp(
  node: KnowledgeNode,
  nodeStats: Record<string, { correctCount: number; wrongCount: number }>,
): boolean {
  const stats = nodeStats[node.id];
  if (stats && stats.correctCount > 0) return true;
  return node.children.some((child) => checkPathLitUp(child, nodeStats));
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  getNodeStats: (nodeId: string) => { correctCount: number; wrongCount: number };
  isPathLitUp: (node: KnowledgeNode) => boolean;
  addAnswerRecord: (record: AnswerRecord) => void;
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<void>;
  cloudSyncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: string | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const isInitialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        if (!parsed.questionBank) parsed.questionBank = SAMPLE_QUESTION_BANK;
        dispatch({ type: 'LOAD_STATE', payload: parsed });
      } else {
        const nodeStats = buildNodeStats(SAMPLE_MIND_MAP, [], SAMPLE_QUESTION_BANK);
        dispatch({ type: 'UPDATE_NODE_STATS', payload: nodeStats });
      }
    } catch {
      // Ignore parse errors
    }
    isInitialized.current = true;
  }, []);

  // Save to localStorage on state change
  useEffect(() => {
    if (!isInitialized.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [state]);

  // Cloud sync: push local data to Supabase
  const syncToCloud = useCallback(async () => {
    setCloudSyncStatus('syncing');
    try {
      const res = await fetch('/api/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mindMap: state.mindMap,
          questionBank: state.questionBank,
          answerRecords: state.answerRecords,
          practiceSets: state.practiceSets,
          examResults: state.examResults,
        }),
      });
      if (!res.ok) throw new Error('Sync failed');
      const now = new Date().toISOString();
      setLastSyncTime(now);
      setCloudSyncStatus('success');
      // Reset status after 3s
      setTimeout(() => setCloudSyncStatus('idle'), 3000);
    } catch {
      setCloudSyncStatus('error');
      setTimeout(() => setCloudSyncStatus('idle'), 3000);
    }
  }, [state]);

  // Cloud sync: pull data from Supabase
  const syncFromCloud = useCallback(async () => {
    setCloudSyncStatus('syncing');
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      if (data && data.mindMap) {
        dispatch({ type: 'LOAD_STATE', payload: data as AppState });
        const now = new Date().toISOString();
        setLastSyncTime(now);
      }
      setCloudSyncStatus('success');
      setTimeout(() => setCloudSyncStatus('idle'), 3000);
    } catch {
      setCloudSyncStatus('error');
      setTimeout(() => setCloudSyncStatus('idle'), 3000);
    }
  }, []);

  const getNodeStats = useCallback(
    (nodeId: string) => {
      return state.nodeStats[nodeId] || { correctCount: 0, wrongCount: 0 };
    },
    [state.nodeStats],
  );

  const isPathLitUp = useCallback(
    (node: KnowledgeNode): boolean => checkPathLitUp(node, state.nodeStats),
    [state.nodeStats],
  );

  const addAnswerRecord = useCallback(
    (record: AnswerRecord) => {
      dispatch({ type: 'ADD_ANSWER_RECORD', payload: record });
    },
    [],
  );

  return (
    <AppContext.Provider value={{
      state, dispatch, getNodeStats, isPathLitUp, addAnswerRecord,
      syncToCloud, syncFromCloud, cloudSyncStatus, lastSyncTime,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

/** Get all angle nodes from a knowledge tree with their path */
export function getAllAngles(mindMap: KnowledgeNode): Array<{ id: string; name: string; path: string }> {
  const result: Array<{ id: string; name: string; path: string }> = [];
  function traverse(node: KnowledgeNode, pathParts: string[]): void {
    const currentPath = [...pathParts, node.name];
    if (node.type === 'angle') {
      result.push({ id: node.id, name: node.name, path: currentPath.join(' / ') });
    }
    for (const child of node.children) {
      traverse(child, currentPath);
    }
  }
  traverse(mindMap, []);
  return result;
}

/** Get all nodes at a specific depth level for selection */
export function getNodesByLevel(mindMap: KnowledgeNode, level: number): Array<{ id: string; name: string; parentPath: string }> {
  const result: Array<{ id: string; name: string; parentPath: string }> = [];
  function traverse(node: KnowledgeNode, depth: number, pathParts: string[]): void {
    if (depth === level) {
      result.push({ id: node.id, name: node.name, parentPath: pathParts.join(' / ') });
      return;
    }
    for (const child of node.children) {
      traverse(child, depth + 1, [...pathParts, node.name]);
    }
  }
  traverse(mindMap, 0, []);
  return result;
}

/** Get all descendant angles of a node */
export function getDescendantAngles(node: KnowledgeNode): Array<{ id: string; name: string; path: string }> {
  const result: Array<{ id: string; name: string; path: string }> = [];
  function traverse(n: KnowledgeNode, pathParts: string[]): void {
    const currentPath = [...pathParts, n.name];
    if (n.type === 'angle') {
      result.push({ id: n.id, name: n.name, path: currentPath.join(' / ') });
    }
    for (const child of n.children) {
      traverse(child, currentPath);
    }
  }
  traverse(node, []);
  return result;
}

/** Find a node by ID */
export function findNodeById(root: KnowledgeNode, id: string): KnowledgeNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}
