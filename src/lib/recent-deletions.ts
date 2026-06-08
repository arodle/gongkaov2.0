import type { MapEdgeRecord, MapNodeRecord, QuestionBankItem } from '@/types';

export type RecentDeletionKind = 'question' | 'mindmap-nodes';

export interface RecentDeletionItem {
  id: string;
  kind: RecentDeletionKind;
  title: string;
  deletedAt: string;
  summary: string;
  payload: {
    question?: QuestionBankItem;
    mindMapId?: string;
    nodes?: MapNodeRecord[];
    edges?: MapEdgeRecord[];
  };
}

const STORAGE_KEY = 'gongkao.recent-deletions.v1';
const MAX_ITEMS = 20;

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function getRecentDeletions(): RecentDeletionItem[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function saveRecentDeletion(item: Omit<RecentDeletionItem, 'id' | 'deletedAt'>) {
  if (!canUseStorage()) return;

  const next: RecentDeletionItem = {
    ...item,
    id: `deleted_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deletedAt: new Date().toISOString(),
  };

  const items = [next, ...getRecentDeletions()].slice(0, MAX_ITEMS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function removeRecentDeletion(id: string) {
  if (!canUseStorage()) return;
  const items = getRecentDeletions().filter(item => item.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
