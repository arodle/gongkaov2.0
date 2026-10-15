'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bold,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Code2,
  Edit3,
  Eye,
  FileText,
  GripVertical,
  Heading2,
  Highlighter,
  ImagePlus,
  HelpCircle,
  Italic,
  List,
  Loader2,
  Maximize2,
  Monitor,
  Plus,
  Quote,
  Save,
  Settings2,
  Sigma,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { MindCanvas } from '@/components/KnowledgeGraph/MindCanvas';
import { MarkdownNote } from '@/components/KnowledgeGraph/MarkdownNote';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { saveRecentDeletion } from '@/lib/recent-deletions';
import { normalizeKnowledgeNodeId } from '@/lib/question-binding';
import { useAppStore } from '@/lib/stores/appStore';
import { cn } from '@/lib/utils';
import type { MapEdgeRecord, MapNodeRecord, MindMapRecord } from '@/types';

interface MindEditorProps {
  mindMap?: MindMapRecord;
  nodes?: MapNodeRecord[];
  edges?: MapEdgeRecord[];
  onSave?: (data: { mindMap: MindMapRecord; nodes: MapNodeRecord[]; edges: MapEdgeRecord[] }) => void;
  onTargetedPractice?: (nodeId: string) => void;
}

interface TreeNode {
  node: MapNodeRecord;
  children: TreeNode[];
}

interface ConfirmState {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
}

type DropPosition = 'before' | 'inside' | 'after' | 'root';

const SIDEBAR_WIDTH_STORAGE_KEY = 'gongkao:mindEditorSidebarWidth';
const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 640;

const NODE_TYPE_LABELS: Record<string, string> = {
  subject: '科目',
  knowledge: '知识分类',
  subknowledge: '知识点',
  angle: '考查角度',
  topic: '专题',
  example: '例题',
};

interface DropIndicator {
  targetId: string | null;
  position: DropPosition;
}

function buildTree(nodes: MapNodeRecord[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  nodes.forEach(node => map.set(node.id, { node, children: [] }));
  nodes.forEach(node => {
    const treeNode = map.get(node.id);
    if (!treeNode) return;

    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)?.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  });

  // Sort children by sort_order at every level
  const sortChildren = (treeNodes: TreeNode[]) => {
    treeNodes.sort((a, b) => (a.node.sort_order ?? 0) - (b.node.sort_order ?? 0));
    treeNodes.forEach(tn => sortChildren(tn.children));
  };
  sortChildren(roots);

  return roots;
}

function isDescendant(nodes: MapNodeRecord[], nodeId: string, possibleParentId: string): boolean {
  let current = nodes.find(node => node.id === possibleParentId);

  while (current?.parent_id) {
    if (current.parent_id === nodeId) return true;
    current = nodes.find(node => node.id === current?.parent_id);
  }

  return false;
}

function collectNodeAndDescendants(nodes: MapNodeRecord[], nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parent_id && ids.has(node.parent_id) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }

  return ids;
}

function rebuildParentEdges(mindMapId: string, nodes: MapNodeRecord[]): MapEdgeRecord[] {
  return nodes
    .filter(node => node.parent_id)
    .map(node => ({
      id: `me_${node.parent_id}_${node.id}`,
      mind_map_id: mindMapId,
      source_node_id: node.parent_id as string,
      target_node_id: node.id,
      edge_type: 'parent',
      created_at: new Date().toISOString(),
    }));
}

function createNodeRecord(mindMapId: string, parentId: string | null, name: string, sortOrder: number = 0): MapNodeRecord {
  const now = new Date().toISOString();
  return {
    id: `mn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    mind_map_id: mindMapId,
    parent_id: parentId,
    name,
    content: '',
    markdown: '',
    node_type: parentId ? 'topic' : 'subject',
    color_tag: '#3b82f6',
    ps_score: 50,
    last_practiced_at: null,
    pos_x: 0,
    pos_y: 0,
    width: 160,
    height: 48,
    expanded: true,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

function shouldIgnoreRowDrag(target: EventTarget | null) {
  return Boolean((target as HTMLElement | null)?.closest('input, textarea, select, [data-no-row-drag]'));
}

function getDropIndicatorFromPoint(clientX: number, clientY: number): DropIndicator {
  const el = document.elementFromPoint(clientX, clientY);
  const row = el?.closest('[data-node-id]') as HTMLElement | null;

  if (!row?.dataset.nodeId) {
    return { targetId: null, position: 'root' };
  }

  const rect = row.getBoundingClientRect();
  const y = clientY - rect.top;
  const topZone = rect.height * 0.28;
  const bottomZone = rect.height * 0.72;

  if (y < topZone) return { targetId: row.dataset.nodeId, position: 'before' };
  if (y > bottomZone) return { targetId: row.dataset.nodeId, position: 'after' };
  return { targetId: row.dataset.nodeId, position: 'inside' };
}

function moveNodeWithinTree(
  currentNodes: MapNodeRecord[],
  nodeId: string,
  nextParentId: string | null,
  nextIndex?: number,
) {
  const movingNode = currentNodes.find(node => node.id === nodeId);
  if (!movingNode) return currentNodes;
  if (nodeId === nextParentId) return currentNodes;
  if (nextParentId && isDescendant(currentNodes, nodeId, nextParentId)) return currentNodes;

  const normalized = currentNodes.map(node => ({ ...node }));
  const affectedParentIds = new Set<string | null>([movingNode.parent_id, nextParentId]);
  const siblingsAtTarget = normalized
    .filter(node => node.id !== nodeId && node.parent_id === nextParentId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const insertIndex = Math.max(0, Math.min(nextIndex ?? siblingsAtTarget.length, siblingsAtTarget.length));
  const now = new Date().toISOString();

  return normalized.map(node => {
    if (node.id === nodeId) {
      return {
        ...node,
        parent_id: nextParentId,
        sort_order: insertIndex,
        node_type: nextParentId ? 'topic' : 'subject',
        updated_at: now,
      };
    }

    if (!affectedParentIds.has(node.parent_id)) return node;

    const siblings = normalized
      .filter(item => item.id !== nodeId && item.parent_id === node.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const siblingIndex = siblings.findIndex(item => item.id === node.id);
    const orderOffset = node.parent_id === nextParentId && siblingIndex >= insertIndex ? 1 : 0;

    return siblingIndex >= 0
      ? { ...node, sort_order: siblingIndex + orderOffset }
      : node;
  });
}

export function MindEditor({ mindMap: initialMindMap, nodes: initialNodes, edges: initialEdges, onSave, onTargetedPractice }: MindEditorProps) {
  const practiceRecords = useAppStore(state => state.practiceRecords);
  const questionBank = useAppStore(state => state.questionBank);
  const [mindMap, setMindMap] = useState<MindMapRecord | null>(initialMindMap || null);
  const [nodes, setNodes] = useState<MapNodeRecord[]>(initialNodes || []);
  const [edges, setEdges] = useState<MapEdgeRecord[]>(initialEdges || []);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [touchDragNodeId, setTouchDragNodeId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [isLoading, setIsLoading] = useState(!initialNodes?.length);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [deletedNodeIds, setDeletedNodeIds] = useState<string[]>([]);
  const [deletedEdgeIds, setDeletedEdgeIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<Array<{ nodes: MapNodeRecord[]; edges: MapEdgeRecord[]; deletedNodeIds: string[]; deletedEdgeIds: string[] }>>([]);
  const [showManual, setShowManual] = useState(false);
  const [showFullEditor, setShowFullEditor] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [textEditorMode, setTextEditorMode] = useState<'write' | 'preview'>('write');
  const [mobilePane, setMobilePane] = useState<'outline' | 'canvas' | 'text'>('canvas');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const changeVersionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  const markChanged = useCallback(() => {
    changeVersionRef.current += 1;
    setHasChanges(true);
  }, []);

  useEffect(() => {
    if (initialMindMap) setMindMap(initialMindMap);
    if (initialNodes) setNodes(initialNodes);
    if (initialEdges) setEdges(initialEdges);
    setDeletedNodeIds([]);
    setDeletedEdgeIds([]);
    setHasChanges(false);
    changeVersionRef.current = 0;
  }, [initialMindMap, initialNodes, initialEdges]);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(savedWidth)) return;
    const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, savedWidth));
    sidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
  }, []);

  useEffect(() => {
    if (!isSidebarResizing) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isSidebarResizing]);

  useEffect(() => {
    const loadMindMap = async () => {
      if (initialNodes?.length) return;

      try {
        setIsLoading(true);
        const response = await fetch('/api/mindmap');
        const result = await response.json();
        if (!result.success || !result.data?.length) return;

        const latestMap = result.data[0];
        const mapResponse = await fetch(`/api/mindmap?id=${latestMap.id}`);
        const mapResult = await mapResponse.json();
        if (mapResult.success) {
          setMindMap(mapResult.data.mindMap);
          setNodes(mapResult.data.nodes);
          setEdges(mapResult.data.edges);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadMindMap();
  }, [initialNodes]);

  const treeData = useMemo(() => buildTree(nodes), [nodes]);
  const selectedNode = useMemo(
    () => nodes.find(node => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const selectedNodePath = useMemo(() => {
    if (!selectedNode) return [];
    const path = [selectedNode.name];
    const visited = new Set([selectedNode.id]);
    let parentId = selectedNode.parent_id;

    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodes.find(node => node.id === parentId);
      if (!parent) break;
      path.unshift(parent.name);
      parentId = parent.parent_id;
    }

    return path;
  }, [nodes, selectedNode]);
  const selectedNodeStats = useMemo(() => {
    if (!selectedNode) return { questionCount: 0, practiceCount: 0, descendantCount: 0 };
    const normalizedId = normalizeKnowledgeNodeId(selectedNode.id);
    const questionCount = questionBank.filter(question => (
      normalizeKnowledgeNodeId(question.linkedAngleId) === normalizedId
    )).length;
    const practiceCount = practiceRecords.filter(record => (
      record.source_node_ids.some(id => normalizeKnowledgeNodeId(id) === normalizedId)
    )).length;
    const descendantCount = collectNodeAndDescendants(nodes, selectedNode.id).size - 1;
    return { questionCount, practiceCount, descendantCount };
  }, [nodes, practiceRecords, questionBank, selectedNode]);

  useEffect(() => {
    if (nodes.length && expandedNodes.size === 0) {
      const rootIds = nodes.filter(node => !node.parent_id).map(node => node.id);
      const firstLevelIds = nodes.filter(node => rootIds.includes(node.parent_id || '')).map(node => node.id);
      setExpandedNodes(new Set([...rootIds, ...firstLevelIds]));
    }
  }, [nodes, expandedNodes.size]);

  const expandPathToNode = useCallback((nodeId: string) => {
    const ids = new Set<string>();
    let current = nodes.find(node => node.id === nodeId);

    while (current?.parent_id) {
      ids.add(current.parent_id);
      current = nodes.find(node => node.id === current?.parent_id);
    }

    setExpandedNodes(prev => new Set([...prev, ...ids]));
  }, [nodes]);

  const selectNode = useCallback((node: MapNodeRecord) => {
    setSelectedNodeId(node.id);
    expandPathToNode(node.id);
    setMobilePane('canvas');
  }, [expandPathToNode]);

  const startTitleEdit = useCallback((node: MapNodeRecord) => {
    setSelectedNodeId(node.id);
    expandPathToNode(node.id);
    setEditingNodeId(node.id);
    setEditingTitle(node.name);
  }, [expandPathToNode]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const commitTitle = useCallback(() => {
    if (!editingNodeId) return;
    const name = editingTitle.trim();
    if (!name) return;

    setNodes(prev => prev.map(node => (
      node.id === editingNodeId
        ? { ...node, name, updated_at: new Date().toISOString() }
        : node
    )));
    setEditingNodeId(null);
    setEditingTitle('');
    markChanged();
  }, [editingNodeId, editingTitle, markChanged]);

  const updateSelectedNode = useCallback((patch: Partial<MapNodeRecord>) => {
    if (!selectedNodeId) return;

    setNodes(prev => prev.map(node => (
      node.id === selectedNodeId
        ? { ...node, ...patch, updated_at: new Date().toISOString() }
        : node
    )));
    markChanged();
  }, [markChanged, selectedNodeId]);

  const insertMarkdown = useCallback((before: string, after = '', placeholder = '文本') => {
    if (!selectedNode) return;

    const textarea = markdownTextareaRef.current;
    const current = selectedNode.markdown || '';
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const selectedText = current.slice(start, end) || placeholder;
    const nextText = `${current.slice(0, start)}${before}${selectedText}${after}${current.slice(end)}`;

    updateSelectedNode({ markdown: nextText });
    setTextEditorMode('write');

    window.requestAnimationFrame(() => {
      const cursorStart = start + before.length;
      const cursorEnd = cursorStart + selectedText.length;
      markdownTextareaRef.current?.focus();
      markdownTextareaRef.current?.setSelectionRange(cursorStart, cursorEnd);
    });
  }, [selectedNode, updateSelectedNode]);

  const insertMarkdownAtCursor = useCallback((text: string) => {
    if (!selectedNode) return;

    const textarea = markdownTextareaRef.current;
    const current = selectedNode.markdown || '';
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const nextText = `${current.slice(0, start)}${text}${current.slice(end)}`;

    updateSelectedNode({ markdown: nextText });
    setTextEditorMode('write');

    window.requestAnimationFrame(() => {
      const cursor = start + text.length;
      markdownTextareaRef.current?.focus();
      markdownTextareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }, [selectedNode, updateSelectedNode]);

  const insertImageFiles = useCallback(async (files: FileList | File[]) => {
    if (!selectedNode) return;

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    const oversizedFiles = imageFiles.filter(file => file.size > 2 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.warning('截图过大，请先压缩到 2MB 以内再插入');
      return;
    }

    const snippets = await Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(`\n\n![${file.name || '截图'}](${reader.result})\n\n`);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));

    insertMarkdownAtCursor(snippets.join(''));
  }, [insertMarkdownAtCursor, selectedNode]);

  const addNode = useCallback((parentId: string | null) => {
    if (!mindMap) return;

    const siblingCount = nodes.filter(n => n.parent_id === parentId).length;
    const node = createNodeRecord(mindMap.id, parentId, parentId ? '新子节点' : '新根节点', siblingCount);
    setNodes(prev => [...prev, node]);
    if (parentId) {
      setExpandedNodes(prev => new Set([...prev, parentId]));
    }
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
    setEditingTitle(node.name);
    markChanged();
  }, [markChanged, mindMap]);

  const addSiblingNode = useCallback(() => {
    if (!selectedNode) return;
    addNode(selectedNode.parent_id);
  }, [addNode, selectedNode]);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-49), { nodes: [...nodes], edges: [...edges], deletedNodeIds: [...deletedNodeIds], deletedEdgeIds: [...deletedEdgeIds] }]);
  }, [nodes, edges, deletedNodeIds, deletedEdgeIds]);

  const moveUp = useCallback(() => {
    if (!selectedNode) return;
    const siblings = nodes.filter(n => n.parent_id === selectedNode.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = siblings.findIndex(s => s.id === selectedNode.id);
    if (idx <= 0) return;
    pushUndo();
    const prevSibling = siblings[idx - 1];
    const newOrder = prevSibling.sort_order ?? 0;
    setNodes(prev => prev.map(n => {
      if (n.id === selectedNode.id) return { ...n, sort_order: newOrder, updated_at: new Date().toISOString() };
      if (n.id === prevSibling.id) return { ...n, sort_order: selectedNode.sort_order ?? 0, updated_at: new Date().toISOString() };
      return n;
    }));
    markChanged();
  }, [markChanged, selectedNode, nodes, pushUndo]);

  const moveDown = useCallback(() => {
    if (!selectedNode) return;
    const siblings = nodes.filter(n => n.parent_id === selectedNode.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = siblings.findIndex(s => s.id === selectedNode.id);
    if (idx < 0 || idx >= siblings.length - 1) return;
    pushUndo();
    const nextSibling = siblings[idx + 1];
    const newOrder = nextSibling.sort_order ?? 0;
    setNodes(prev => prev.map(n => {
      if (n.id === selectedNode.id) return { ...n, sort_order: newOrder, updated_at: new Date().toISOString() };
      if (n.id === nextSibling.id) return { ...n, sort_order: selectedNode.sort_order ?? 0, updated_at: new Date().toISOString() };
      return n;
    }));
    markChanged();
  }, [markChanged, selectedNode, nodes, pushUndo]);

  const promoteNode = useCallback(() => {
    if (!selectedNode?.parent_id) return;
    const parent = nodes.find(n => n.id === selectedNode.parent_id);
    if (!parent?.parent_id && !parent) return;
    pushUndo();
    const grandParentId = parent?.parent_id ?? null;
    const parentOrder = parent?.sort_order ?? 0;
    const newNodes = nodes.map(n => {
      if (n.id === selectedNode.id) return { ...n, parent_id: grandParentId, sort_order: parentOrder + 1, updated_at: new Date().toISOString() };
      if (n.parent_id === grandParentId && (n.sort_order ?? 0) > parentOrder) return { ...n, sort_order: (n.sort_order ?? 0) + 1 };
      return n;
    });
    setNodes(newNodes);
    setEdges(rebuildParentEdges(mindMap?.id || 'default', newNodes));
    markChanged();
  }, [markChanged, selectedNode, nodes, mindMap, pushUndo]);

  const demoteNode = useCallback(() => {
    if (!selectedNode) return;
    const siblings = nodes.filter(n => n.parent_id === selectedNode.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = siblings.findIndex(s => s.id === selectedNode.id);
    if (idx <= 0) return;
    const prevSibling = siblings[idx - 1];
    pushUndo();
    const newParentId = prevSibling.id;
    const childCount = nodes.filter(n => n.parent_id === newParentId).length;
    const newNodes = nodes.map(n => {
      if (n.id === selectedNode.id) return { ...n, parent_id: newParentId, sort_order: childCount, updated_at: new Date().toISOString() };
      return n;
    });
    setNodes(newNodes);
    setEdges(rebuildParentEdges(mindMap?.id || 'default', newNodes));
    setExpandedNodes(prev => new Set([...prev, newParentId]));
    markChanged();
  }, [markChanged, selectedNode, nodes, mindMap, pushUndo]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setDeletedNodeIds(snapshot.deletedNodeIds);
      setDeletedEdgeIds(snapshot.deletedEdgeIds);
      markChanged();
      return prev.slice(0, -1);
    });
  }, [markChanged]);

  const moveNode = useCallback((nodeId: string, nextParentId: string | null) => {
    if (nodeId === nextParentId) return;
    if (nextParentId && isDescendant(nodes, nodeId, nextParentId)) return;

    pushUndo();

    const currentNode = nodes.find(node => node.id === nodeId);
    if (currentNode?.parent_id && currentNode.parent_id !== nextParentId) {
      setDeletedEdgeIds(prev => Array.from(new Set([...prev, `me_${currentNode.parent_id}_${nodeId}`])));
    }

    setNodes(prev => {
      const childCount = prev.filter(node => node.id !== nodeId && node.parent_id === nextParentId).length;
      const nextNodes = moveNodeWithinTree(prev, nodeId, nextParentId, childCount);
      setEdges(rebuildParentEdges(mindMap?.id || 'default', nextNodes));
      return nextNodes;
    });
    if (nextParentId) {
      setExpandedNodes(prev => new Set([...prev, nextParentId]));
    }
    markChanged();
  }, [markChanged, mindMap, nodes, pushUndo]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = nodes.find(item => item.id === nodeId);
    if (!node) return;

    const ids = collectNodeAndDescendants(nodes, nodeId);
    const legacyIds = new Set(Array.from(ids).map(id => id.startsWith('mn_') ? id.slice(3) : id));
    const relatedPracticeCount = practiceRecords.filter(record => (
      record.source_node_ids.some(id => ids.has(id) || legacyIds.has(id))
    )).length;
    setConfirmState({
      title: `删除「${node.name}」`,
      description: (
        <div className="space-y-1 text-left">
          <p>将删除该节点及其 {ids.size - 1} 个子节点。</p>
          <p>关联练习/错题记录：{relatedPracticeCount} 条。</p>
          <p>删除后报告、错题本和靶向练习可能出现引用缺口。</p>
        </div>
      ),
      confirmLabel: '删除节点',
      onConfirm: () => {
        pushUndo();

        const deletedNodes = nodes.filter(item => ids.has(item.id));
        const deletedEdges = edges.filter(edge => ids.has(edge.source_node_id) || ids.has(edge.target_node_id));
        saveRecentDeletion({
          kind: 'mindmap-nodes',
          title: node.name,
          summary: `${deletedNodes.length} 个节点，${deletedEdges.length} 条连线`,
          payload: {
            mindMapId: mindMap?.id,
            nodes: deletedNodes,
            edges: deletedEdges,
          },
        });

        setNodes(prev => {
          const nextNodes = prev.filter(item => !ids.has(item.id));
          setEdges(rebuildParentEdges(mindMap?.id || 'default', nextNodes));
          return nextNodes;
        });
        setDeletedNodeIds(prev => Array.from(new Set([...prev, ...ids])));
        setDeletedEdgeIds(prev => {
          const removedEdgeIds = edges
            .filter(edge => ids.has(edge.source_node_id) || ids.has(edge.target_node_id))
            .map(edge => edge.id);
          return Array.from(new Set([...prev, ...removedEdgeIds]));
        });
        setExpandedNodes(prev => {
          const next = new Set(prev);
          ids.forEach(id => next.delete(id));
          return next;
        });
        if (selectedNodeId && ids.has(selectedNodeId)) {
          setSelectedNodeId(null);
        }
        setEditingNodeId(null);
        markChanged();
        toast.success('节点已删除，可在个人中心最近删除中尝试恢复');
      },
    });
  }, [edges, markChanged, mindMap, nodes, practiceRecords, pushUndo, selectedNodeId]);

  const handleCanvasNodesChange = useCallback((nextNodes: MapNodeRecord[]) => {
    setNodes(prev => {
      const changed = prev.length !== nextNodes.length || prev.some((node, index) => {
        const next = nextNodes[index];
        return !next
          || node.id !== next.id
          || node.width !== next.width
          || node.height !== next.height
          || node.pos_x !== next.pos_x
          || node.pos_y !== next.pos_y;
      });
      if (changed) markChanged();
      return nextNodes;
    });
  }, [markChanged]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (isTyping) return;

      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (!selectedNodeId) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteNode, selectedNodeId, undo]);

  const saveToNeon = useCallback(async (showToast = true) => {
    if (!mindMap) return;
    if (saveInFlightRef.current) return saveInFlightRef.current;

    const savedVersion = changeVersionRef.current;
    const savedMindMap = mindMap;
    const savedNodes = nodes;
    const savedDeleteNodeIds = [...deletedNodeIds];
    const savedDeleteEdgeIds = [...deletedEdgeIds];
    const currentEdges = rebuildParentEdges(savedMindMap.id, savedNodes);
    setIsSaving(true);
    const savePromise = (async () => {
      const response = await fetch('/api/mindmap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          id: savedMindMap.id,
          name: savedMindMap.name,
          description: savedMindMap.description,
          category: savedMindMap.category,
          nodes: savedNodes,
          edges: currentEdges,
          deleteNodeIds: savedDeleteNodeIds,
          deleteEdgeIds: savedDeleteEdgeIds,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || `保存失败（HTTP ${response.status}）`);
      }

      setEdges(currentEdges);
      setDeletedNodeIds(current => current.filter(id => !savedDeleteNodeIds.includes(id)));
      setDeletedEdgeIds(current => current.filter(id => !savedDeleteEdgeIds.includes(id)));
      if (changeVersionRef.current === savedVersion) {
        setHasChanges(false);
      }
      onSave?.({ mindMap: savedMindMap, nodes: savedNodes, edges: currentEdges });
    })();
    saveInFlightRef.current = savePromise;

    if (showToast) {
      toast.promise(savePromise, {
        loading: '正在保存 Mind 编辑内容...',
        success: 'Mind 编辑内容已保存',
        error: (error: unknown) => error instanceof Error ? error.message : '保存失败',
      });
    }

    try {
      await savePromise;
    } catch (error) {
      if (!showToast) {
        toast.error(error instanceof Error ? `自动保存失败：${error.message}` : '自动保存失败');
      }
      throw error;
    } finally {
      saveInFlightRef.current = null;
      setIsSaving(false);
    }
  }, [deletedEdgeIds, deletedNodeIds, mindMap, nodes, onSave]);

  useEffect(() => {
    if (!hasChanges || isSaving || !mindMap || editingNodeId) return;

    const timer = window.setTimeout(() => {
      void saveToNeon(false).catch(() => undefined);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [deletedEdgeIds, deletedNodeIds, editingNodeId, hasChanges, isSaving, mindMap, nodes, saveToNeon]);

  useEffect(() => {
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnAboutUnsavedChanges);
    return () => window.removeEventListener('beforeunload', warnAboutUnsavedChanges);
  }, [hasChanges]);

  const handleRowDragStart = useCallback((nodeId: string) => (e: React.PointerEvent) => {
    if (shouldIgnoreRowDrag(e.target)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragStartPos({ x: e.clientX, y: e.clientY, nodeId });
    setDropIndicator(null);
  }, []);

  const handleContainerDragMove = useCallback((e: React.PointerEvent) => {
    let activeDragNodeId = touchDragNodeId;

    if (dragStartPos && !touchDragNodeId) {
      const dx = Math.abs(e.clientX - dragStartPos.x);
      const dy = Math.abs(e.clientY - dragStartPos.y);

      const dragThreshold = e.pointerType === 'touch' ? 10 : 5;
      if (dx <= dragThreshold && dy <= dragThreshold) return;

      e.preventDefault();
      activeDragNodeId = dragStartPos.nodeId;
      setTouchDragNodeId(activeDragNodeId);
      const node = nodes.find(n => n.id === dragStartPos.nodeId);
      if (node) selectNode(node);
    }

    if (!activeDragNodeId) return;
    e.preventDefault();

    const nextIndicator = getDropIndicatorFromPoint(e.clientX, e.clientY);
    if (nextIndicator.targetId === activeDragNodeId) {
      setDropIndicator(null);
      return;
    }

    if (
      nextIndicator.targetId
      && nextIndicator.position === 'inside'
      && isDescendant(nodes, activeDragNodeId, nextIndicator.targetId)
    ) {
      setDropIndicator(null);
      return;
    }

    setDropIndicator(nextIndicator);
  }, [dragStartPos, nodes, selectNode, touchDragNodeId]);

  const handleContainerDragEnd = useCallback((e: React.PointerEvent) => {
    if (dragStartPos && !touchDragNodeId) {
      setDragStartPos(null);
      setDropIndicator(null);
      return;
    }

    if (!touchDragNodeId) return;

    const indicator = dropIndicator || getDropIndicatorFromPoint(e.clientX, e.clientY);
    const draggedNode = nodes.find(node => node.id === touchDragNodeId);

    if (draggedNode && !(indicator.targetId === touchDragNodeId)) {
      const targetNode = indicator.targetId ? nodes.find(node => node.id === indicator.targetId) : null;
      let nextParentId: string | null = null;
      let nextIndex: number | undefined;

      if (indicator.position === 'root' || !targetNode) {
        nextParentId = null;
        nextIndex = nodes.filter(node => node.id !== touchDragNodeId && !node.parent_id).length;
      } else if (indicator.position === 'inside') {
        if (!isDescendant(nodes, touchDragNodeId, targetNode.id)) {
          nextParentId = targetNode.id;
          nextIndex = nodes.filter(node => node.id !== touchDragNodeId && node.parent_id === targetNode.id).length;
        }
      } else {
        nextParentId = targetNode.parent_id;
        const siblings = nodes
          .filter(node => node.id !== touchDragNodeId && node.parent_id === nextParentId)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const targetIndex = siblings.findIndex(node => node.id === targetNode.id);
        nextIndex = targetIndex < 0 ? siblings.length : targetIndex + (indicator.position === 'after' ? 1 : 0);
      }

      const nextNodes = moveNodeWithinTree(nodes, touchDragNodeId, nextParentId, nextIndex);
      if (nextNodes !== nodes) {
        pushUndo();
        if (draggedNode.parent_id && draggedNode.parent_id !== nextParentId) {
          setDeletedEdgeIds(prev => Array.from(new Set([...prev, `me_${draggedNode.parent_id}_${touchDragNodeId}`])));
        }
        setNodes(nextNodes);
        setEdges(rebuildParentEdges(mindMap?.id || 'default', nextNodes));
        if (nextParentId) {
          setExpandedNodes(prev => new Set([...prev, nextParentId]));
        }
        markChanged();
      }
    }

    setTouchDragNodeId(null);
    setDragStartPos(null);
    setDropIndicator(null);
  }, [dragStartPos, dropIndicator, markChanged, mindMap, nodes, pushUndo, touchDragNodeId]);

  const getSidebarWidthLimit = useCallback(() => {
    const shellWidth = editorShellRef.current?.getBoundingClientRect().width || 0;
    if (!shellWidth) return MAX_SIDEBAR_WIDTH;
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, shellWidth * 0.58));
  }, []);

  const updateSidebarWidth = useCallback((width: number, persist = false) => {
    const nextWidth = Math.round(Math.min(getSidebarWidthLimit(), Math.max(MIN_SIDEBAR_WIDTH, width)));
    sidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
    if (persist) {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
    }
  }, [getSidebarWidthLimit]);

  const handleSidebarResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSidebarResizing || !editorShellRef.current) return;
    const shellRect = editorShellRef.current.getBoundingClientRect();
    updateSidebarWidth(event.clientX - shellRect.left);
  }, [isSidebarResizing, updateSidebarWidth]);

  const finishSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSidebarResizing) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsSidebarResizing(false);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthRef.current));
  }, [isSidebarResizing]);

  const renderNode = (treeNode: TreeNode, depth: number): React.ReactNode => {
    const { node, children } = treeNode;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const isEditing = editingNodeId === node.id;
    const isTouchDragging = touchDragNodeId === node.id;
    const rowDropPosition = dropIndicator?.targetId === node.id ? dropIndicator.position : null;

    return (
      <div key={node.id}>
        <div
          data-node-id={node.id}
          className={cn(
            'group relative flex h-10 touch-none items-center gap-1 rounded-md px-2 text-sm hover:bg-slate-100 md:h-8',
            isSelected && 'bg-blue-50 text-blue-700',
            isTouchDragging && 'opacity-40',
            rowDropPosition === 'inside' && 'bg-blue-100 ring-2 ring-blue-400',
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => selectNode(node)}
          onPointerDown={handleRowDragStart(node.id)}
          onDoubleClick={(event) => {
            if (shouldIgnoreRowDrag(event.target)) return;
            event.stopPropagation();
            startTitleEdit(node);
          }}
        >
          {rowDropPosition === 'before' && (
            <span className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded-full bg-blue-500" />
          )}
          {rowDropPosition === 'after' && (
            <span className="pointer-events-none absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-blue-500" />
          )}
          <span
            className="shrink-0 cursor-grab p-1 -ml-1 text-slate-300 group-hover:text-slate-500 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <button
            type="button"
            data-no-row-drag
            className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-slate-200"
            onClick={(event) => {
              event.stopPropagation();
              toggleNode(node.id);
            }}
          >
            {children.length ? (
              isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            )}
          </button>

          {isEditing ? (
            <Input
              autoFocus
              value={editingTitle}
              className="h-6 min-w-0 px-1 text-xs"
              onChange={(event) => setEditingTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTitle();
                if (event.key === 'Escape') {
                  setEditingNodeId(null);
                  setEditingTitle('');
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              title={node.name}
              onDoubleClick={(event) => {
                event.stopPropagation();
                startTitleEdit(node);
              }}
            >
              {node.name}
            </button>
          )}

          {node.markdown && <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
          {!isEditing && (
            <button
              type="button"
              data-no-row-drag
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 opacity-0 hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                startTitleEdit(node);
              }}
              aria-label="编辑节点标题"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            data-no-row-drag
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              deleteNode(node.id);
            }}
            aria-label="删除节点"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {isExpanded && children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载 Mind 编辑器
      </div>
      </div>
    );
  }

  return (
    <div ref={editorShellRef} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white lg:flex-row lg:rounded-xl lg:border lg:border-slate-200 lg:pr-[340px] xl:pr-[400px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 lg:hidden">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
          {([
            ['outline', '大纲'],
            ['canvas', '画布'],
            ['text', '文本'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMobilePane(value);
              }}
              className={cn(
                'h-7 rounded text-xs font-medium transition-colors',
                mobilePane === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void saveToNeon(true)}
          disabled={isSaving || !mindMap}
          aria-label={isSaving ? '正在保存' : hasChanges ? '保存修改' : '内容已保存'}
          className={cn('h-8 shrink-0 px-2', hasChanges && 'bg-amber-600 hover:bg-amber-700')}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 lg:hidden">
        <div className="flex items-start gap-2">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Mind 编辑属于运营功能，新增节点、批量改结构和长笔记维护建议在桌面端操作。</span>
        </div>
      </div>

      <aside className={cn(
        "h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-slate-50/70 lg:flex lg:w-[var(--mind-editor-sidebar-width)] lg:overflow-visible",
        mobilePane === 'outline' || mobilePane === 'text' ? 'flex' : 'hidden'
      )} style={{ '--mind-editor-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        <div className="hidden shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 lg:flex">
          <div className="min-w-0">
            <Input
              value={mindMap?.name || '未命名导图'}
              className="h-8 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none"
              onChange={(event) => {
                setMindMap(prev => prev ? { ...prev, name: event.target.value } : prev);
                markChanged();
              }}
            />
          </div>
          <Button type="button" size="sm" onClick={() => void saveToNeon(true)} disabled={isSaving || !mindMap} className={hasChanges ? 'bg-amber-600 hover:bg-amber-700' : undefined}>
            {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {isSaving ? '保存中' : hasChanges ? '保存' : '已保存'}
          </Button>
        </div>

        <div className={cn(
          "grid shrink-0 grid-cols-3 gap-1.5 border-b border-slate-200 p-2 lg:gap-2 lg:p-3",
          mobilePane !== 'outline' && "hidden lg:grid"
        )}>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addNode(null)} disabled={!mindMap}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">根节点</span>
            <span className="sm:hidden">根</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => selectedNode && addNode(selectedNode.id)} disabled={!selectedNode || !mindMap}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">子节点</span>
            <span className="sm:hidden">子</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addSiblingNode} disabled={!selectedNode || !mindMap}>
            <Plus className="h-3.5 w-3.5" />
            同级
          </Button>
        </div>

        <ScrollArea className={cn(
          "min-h-0",
          mobilePane === 'outline' ? "flex-1" : "hidden",
          "lg:block lg:flex-1"
        )}>
          <div
            className={cn(
              "min-h-[60px] p-2",
              touchDragNodeId && dropIndicator?.position === 'root' && "rounded-lg bg-blue-50/80 ring-2 ring-inset ring-blue-300"
            )}
            onPointerMove={handleContainerDragMove}
            onPointerUp={handleContainerDragEnd}
            onPointerCancel={() => {
              setTouchDragNodeId(null);
              setDragStartPos(null);
              setDropIndicator(null);
            }}
          >
            {touchDragNodeId && dropIndicator?.position === 'root' && (
              <div className="mb-2 rounded-md border border-dashed border-blue-300 bg-white/80 px-2 py-1.5 text-xs font-medium text-blue-700">
                松手后移动为根节点
              </div>
            )}
            {treeData.map(root => renderNode(root, 0))}
          </div>
        </ScrollArea>

        <div className={cn(
          "min-h-0 flex-col border-t border-slate-200 bg-white",
          mobilePane === 'text' ? "flex flex-1" : "hidden",
          "lg:absolute lg:inset-y-0 lg:right-0 lg:z-40 lg:flex lg:w-[340px] lg:border-l lg:border-t-0 lg:border-slate-200 lg:shadow-[-12px_0_32px_rgba(15,23,42,0.06)] xl:w-[400px]"
        )}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">节点编辑</div>
              <div className="truncate text-[11px] text-slate-400">
                {selectedNode ? selectedNode.name : '从大纲或画布选择节点'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                onClick={() => void saveToNeon(true)}
                disabled={isSaving || !mindMap}
                className={cn('hidden h-8 gap-1.5 px-2.5 lg:inline-flex', hasChanges && 'bg-amber-600 hover:bg-amber-700')}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isSaving ? '保存中' : hasChanges ? '保存' : '已保存'}
              </Button>
              {selectedNode && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedNodeId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {selectedNode ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3">
                <div className="truncate text-xs text-slate-400" title={selectedNodePath.join(' / ')}>
                  {selectedNodePath.join(' / ')}
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-500">标题</span>
                  <Input
                    value={selectedNode.name}
                    onChange={(event) => updateSelectedNode({ name: event.target.value })}
                    className="h-8"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>卡片摘要</span>
                    <span className="font-normal text-slate-400">{(selectedNode.content || '').length}/80</span>
                  </span>
                  <Textarea
                    value={selectedNode.content || ''}
                    onChange={(event) => updateSelectedNode({ content: event.target.value })}
                    maxLength={80}
                    className="min-h-20 resize-none text-sm"
                    placeholder="用一两句话概括知识点，显示在画布卡片上"
                  />
                </label>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <div className="text-xs font-medium text-slate-600">知识正文</div>
                    <div className="text-[11px] text-slate-400">详细解释、方法、例题与运营备注</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowFullEditor(true)}
                    aria-label="全屏编辑知识正文"
                    title="全屏编辑"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('## ', '', '小标题')} aria-label="标题">
                        <Heading2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('**', '**')} aria-label="加粗">
                        <Bold className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('*', '*')} aria-label="斜体">
                        <Italic className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('<mark>', '</mark>')} aria-label="高亮">
                        <Highlighter className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('<u>', '</u>')} aria-label="下划线">
                        <Underline className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('- ', '', '列表项')} aria-label="列表">
                        <List className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('> ', '', '引用')} aria-label="引用">
                        <Quote className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('`', '`', '代码')} aria-label="代码">
                        <Code2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('$', '$', 'a=b+c')} aria-label="行内公式">
                        <Sigma className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertMarkdown('\n$$\n', '\n$$\n', '增长率=\\frac{现期量-基期量}{基期量}')} aria-label="块级公式">
                        <span className="text-[11px] font-semibold leading-none">$$</span>
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => imageInputRef.current?.click()} aria-label="插入截图">
                        <ImagePlus className="h-3.5 w-3.5" />
                      </Button>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          if (event.target.files) void insertImageFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </div>
                    <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      <Button
                        type="button"
                        variant={textEditorMode === 'write' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs"
                        onClick={() => setTextEditorMode('write')}
                      >
                        <Edit3 className="h-3 w-3" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant={textEditorMode === 'preview' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs"
                        onClick={() => setTextEditorMode('preview')}
                      >
                        <Eye className="h-3 w-3" />
                        预览
                      </Button>
                    </div>
                  </div>

                  {textEditorMode === 'write' ? (
                    <Textarea
                      ref={markdownTextareaRef}
                      value={selectedNode.markdown || ''}
                      onChange={(event) => updateSelectedNode({ markdown: event.target.value })}
                      onPaste={(event) => {
                        const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
                        if (!files.length) return;
                        event.preventDefault();
                        void insertImageFiles(files);
                      }}
                      className="min-h-48 resize-y rounded-none border-0 bg-white font-mono text-xs shadow-none focus-visible:ring-0"
                      placeholder="在这里写正文、知识点解释、例题方法、运营备注。支持 Markdown、$公式$、高亮、下划线和截图。"
                    />
                  ) : (
                    <div className="min-h-48 bg-white p-3 text-sm">
                      {selectedNode.markdown ? (
                        <MarkdownNote>{selectedNode.markdown}</MarkdownNote>
                      ) : (
                        <div className="text-sm text-slate-400">暂无正文内容</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 border-y border-slate-100 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#f3efff] text-[#7c6ee6]">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-700">练习关联</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {selectedNodeStats.questionCount} 道题 · {selectedNodeStats.practiceCount} 条作答记录
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 px-2.5 text-xs"
                    disabled={!onTargetedPractice || selectedNodeStats.questionCount === 0}
                    onClick={() => onTargetedPractice?.(normalizeKnowledgeNodeId(selectedNode.id))}
                  >
                    节点练习
                  </Button>
                </div>

                <details className="group border-b border-slate-100 pb-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
                    <Settings2 className="h-4 w-4 text-slate-400" />
                    <span>高级设置</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="space-y-3 pb-2 pt-1">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-500">节点类型</span>
                      <select
                        value={selectedNode.node_type}
                        onChange={(event) => updateSelectedNode({ node_type: event.target.value })}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {Object.entries(NODE_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-slate-500">卡片尺寸</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">宽度</span>
                          <Input
                            type="number"
                            min={120}
                            value={Math.round(selectedNode.width || 160)}
                            onChange={(event) => updateSelectedNode({ width: Number(event.target.value) || 160 })}
                            className="h-8"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">高度</span>
                          <Input
                            type="number"
                            min={40}
                            value={Math.round(selectedNode.height || 48)}
                            onChange={(event) => updateSelectedNode({ height: Number(event.target.value) || 48 })}
                            className="h-8"
                          />
                        </label>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-4 text-slate-400">通常无需填写，也可以在画布上拖动节点右下角调整。</p>
                    </div>
                  </div>
                </details>

                <details className="group pb-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-medium text-rose-500 [&::-webkit-details-marker]:hidden">
                    <AlertTriangle className="h-4 w-4" />
                    <span>危险操作</span>
                    <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="space-y-2 rounded-md bg-rose-50 p-3">
                    <p className="text-xs leading-5 text-rose-700">
                      将同时删除当前节点和 {selectedNodeStats.descendantCount} 个子节点，删除前会再次确认。
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => deleteNode(selectedNode.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除节点
                    </Button>
                  </div>
                </details>
              </div>
            </ScrollArea>
          ) : (
            <div className="min-h-0 flex-1 p-4 text-sm text-slate-500">
              选择左侧大纲或画布节点后，可以编辑卡片摘要和知识正文。
            </div>
          )}
        </div>
      </aside>

      <div
        role="separator"
        aria-label="调整大纲栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={Math.round(getSidebarWidthLimit())}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        title="拖动调整大纲栏宽度，双击恢复默认宽度"
        className={cn(
          'group hidden w-2 shrink-0 touch-none cursor-col-resize items-stretch justify-center bg-white outline-none lg:flex',
          'focus-visible:bg-[#f3efff]',
          isSidebarResizing && 'bg-[#f3efff]'
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setIsSidebarResizing(true);
        }}
        onPointerMove={handleSidebarResizeMove}
        onPointerUp={finishSidebarResize}
        onPointerCancel={finishSidebarResize}
        onDoubleClick={() => updateSidebarWidth(DEFAULT_SIDEBAR_WIDTH, true)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          updateSidebarWidth(sidebarWidthRef.current + (event.key === 'ArrowRight' ? 24 : -24), true);
        }}
      >
        <span className={cn(
          'h-full w-px bg-slate-200 transition-colors group-hover:w-0.5 group-hover:bg-[#a49aff]',
          isSidebarResizing && 'w-0.5 bg-[#a49aff]'
        )} />
      </div>

      <main className={cn(
        "relative min-h-0 min-w-0 flex-1 bg-slate-100 lg:block",
        mobilePane === 'canvas' ? "block" : "hidden"
      )}>
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-11 z-50 h-8 w-8 rounded-full bg-white/95 shadow-sm lg:right-4 lg:top-4 lg:h-9 lg:w-auto lg:rounded-md lg:px-3"
          onClick={() => setShowManual(true)}
          aria-label="用户手册"
        >
          <HelpCircle className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
          <span className="hidden sm:inline">用户手册</span>
        </Button>
        <Dialog open={showManual} onOpenChange={setShowManual}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Mind 编辑用户手册</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-5 text-sm leading-6 text-slate-600">
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">左侧大纲</h3>
                  <p>单击节点会在右侧画布定位并选中；双击标题可直接改名；点击箭头可折叠或展开子级。顶部按钮可新增根节点、子节点和同级节点。</p>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">节点编辑器</h3>
                  <p>选中左侧大纲或画布节点后，可在右侧固定面板修改标题、卡片摘要和知识正文；手机端请切换到“文本”。正文支持 Markdown、公式、图片、预览和全屏编辑，练习关联会显示该节点的题目与作答数量。</p>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">高级与删除</h3>
                  <p>节点类型和卡片尺寸收在“高级设置”中，通常无需修改。删除入口位于“危险操作”，确认窗口会显示子节点和关联练习数量。</p>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">调整层级</h3>
                  <p>按住节点左侧拖拽手柄，把节点拖到另一个节点上，它会变成目标节点的子节点。拖到左侧空白区域会变成根节点。</p>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">删除节点</h3>
                  <p>鼠标悬停在左侧节点上，点击删除图标即可删除该节点及全部子节点。也可以选中节点后按 Delete 或 Backspace。</p>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">右侧画布</h3>
                  <p>滚轮缩放，拖动画布移动视图。缩小时只保留主干层级，放大后子级逐步出现。选中节点后，右下角可拖动调整矩形大小，右下小地图可快速导航。</p>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">快捷键</h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li><span className="font-medium">/</span>：聚焦画布搜索</li>
                    <li><span className="font-medium">+ / -</span>：放大或缩小画布</li>
                    <li><span className="font-medium">0</span>：适配视图</li>
                    <li><span className="font-medium">Enter / Space</span>：折叠或展开当前画布节点</li>
                    <li><span className="font-medium">E</span>：展开全部</li>
                    <li><span className="font-medium">C</span>：收起到根层级</li>
                    <li><span className="font-medium">Esc</span>：关闭侧栏、笔记或取消操作</li>
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold text-slate-900">保存</h3>
                  <p>修改后会自动保存，也可点击右侧节点编辑器或左上角的保存按钮立即写入服务器数据库。按钮显示“已保存”代表本次修改已经提交。</p>
                </section>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        <MindCanvas
          mindMap={mindMap || undefined}
          nodes={nodes}
          readOnly={false}
          showNodeDetails={false}
          focusNodeId={selectedNodeId}
          onSelectNode={selectNode}
          onNodesChange={handleCanvasNodesChange}
          onTargetedPractice={onTargetedPractice}
        />
      </main>

      <Dialog open={showFullEditor && !!selectedNode} onOpenChange={setShowFullEditor}>
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0">
                <DialogTitle>编辑知识正文</DialogTitle>
                <p className="mt-1 truncate text-xs text-slate-400">{selectedNodePath.join(' / ')}</p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveToNeon(true)}
                disabled={isSaving || !mindMap}
                className={cn('shrink-0 gap-1.5', hasChanges && 'bg-amber-600 hover:bg-amber-700')}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? '保存中' : hasChanges ? '保存' : '已保存'}
              </Button>
            </div>
          </DialogHeader>
          {selectedNode && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                <p className="text-xs text-slate-400">支持 Markdown、公式、粘贴图片和截图。</p>
                <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  <Button
                    type="button"
                    variant={textEditorMode === 'write' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setTextEditorMode('write')}
                  >
                    <Edit3 className="h-3 w-3" />
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant={textEditorMode === 'preview' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setTextEditorMode('preview')}
                  >
                    <Eye className="h-3 w-3" />
                    预览
                  </Button>
                </div>
              </div>
              {textEditorMode === 'write' ? (
                <Textarea
                  value={selectedNode.markdown || ''}
                  onChange={(event) => updateSelectedNode({ markdown: event.target.value })}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
                    if (!files.length) return;
                    event.preventDefault();
                    void insertImageFiles(files);
                  }}
                  className="min-h-[62vh] flex-1 resize-none font-mono text-sm leading-6"
                  placeholder="在这里编写知识点正文、方法、例题和备注……"
                />
              ) : (
                <ScrollArea className="min-h-[62vh] flex-1 rounded-md border border-slate-200 bg-white p-5">
                  {selectedNode.markdown ? (
                    <MarkdownNote>{selectedNode.markdown}</MarkdownNote>
                  ) : (
                    <div className="text-sm text-slate-400">暂无正文内容</div>
                  )}
                </ScrollArea>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && setConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>{confirmState?.description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const action = confirmState?.onConfirm;
                setConfirmState(null);
                action?.();
              }}
            >
              {confirmState?.confirmLabel || '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
