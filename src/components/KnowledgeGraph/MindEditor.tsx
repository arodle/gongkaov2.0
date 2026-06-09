'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
  Monitor,
  Plus,
  Quote,
  Save,
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { saveRecentDeletion } from '@/lib/recent-deletions';
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

export function MindEditor({ mindMap: initialMindMap, nodes: initialNodes, edges: initialEdges, onSave, onTargetedPractice }: MindEditorProps) {
  const practiceRecords = useAppStore(state => state.practiceRecords);
  const [mindMap, setMindMap] = useState<MindMapRecord | null>(initialMindMap || null);
  const [nodes, setNodes] = useState<MapNodeRecord[]>(initialNodes || []);
  const [edges, setEdges] = useState<MapEdgeRecord[]>(initialEdges || []);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [touchDragNodeId, setTouchDragNodeId] = useState<string | null>(null);
  const [touchDropTargetId, setTouchDropTargetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialNodes?.length);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [deletedNodeIds, setDeletedNodeIds] = useState<string[]>([]);
  const [deletedEdgeIds, setDeletedEdgeIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<Array<{ nodes: MapNodeRecord[]; edges: MapEdgeRecord[]; deletedNodeIds: string[]; deletedEdgeIds: string[] }>>([]);
  const [showManual, setShowManual] = useState(false);
  const [textEditorMode, setTextEditorMode] = useState<'write' | 'preview'>('write');
  const [isTextEditorCollapsed, setIsTextEditorCollapsed] = useState(false);
  const [mobilePane, setMobilePane] = useState<'outline' | 'canvas' | 'text'>('canvas');
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialMindMap) setMindMap(initialMindMap);
    if (initialNodes) setNodes(initialNodes);
    if (initialEdges) setEdges(initialEdges);
    setDeletedNodeIds([]);
    setDeletedEdgeIds([]);
  }, [initialMindMap, initialNodes, initialEdges]);

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
    setHasChanges(true);
  }, [editingNodeId, editingTitle]);

  const updateSelectedNode = useCallback((patch: Partial<MapNodeRecord>) => {
    if (!selectedNodeId) return;

    setNodes(prev => prev.map(node => (
      node.id === selectedNodeId
        ? { ...node, ...patch, updated_at: new Date().toISOString() }
        : node
    )));
    setHasChanges(true);
  }, [selectedNodeId]);

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
      window.alert('截图过大，请先压缩到 2MB 以内再插入。');
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
    setHasChanges(true);
  }, [mindMap]);

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
    setHasChanges(true);
  }, [selectedNode, nodes, pushUndo]);

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
    setHasChanges(true);
  }, [selectedNode, nodes, pushUndo]);

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
    setHasChanges(true);
  }, [selectedNode, nodes, mindMap, pushUndo]);

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
    setHasChanges(true);
  }, [selectedNode, nodes, mindMap, pushUndo]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setDeletedNodeIds(snapshot.deletedNodeIds);
      setDeletedEdgeIds(snapshot.deletedEdgeIds);
      return prev.slice(0, -1);
    });
  }, []);

  const moveNode = useCallback((nodeId: string, nextParentId: string | null) => {
    if (nodeId === nextParentId) return;
    if (nextParentId && isDescendant(nodes, nodeId, nextParentId)) return;

    pushUndo();

    const currentNode = nodes.find(node => node.id === nodeId);
    if (currentNode?.parent_id && currentNode.parent_id !== nextParentId) {
      setDeletedEdgeIds(prev => Array.from(new Set([...prev, `me_${currentNode.parent_id}_${nodeId}`])));
    }

    setNodes(prev => {
      const nextNodes = prev.map(node => (
        node.id === nodeId
          ? { ...node, parent_id: nextParentId, updated_at: new Date().toISOString() }
          : node
      ));
      setEdges(rebuildParentEdges(mindMap?.id || 'default', nextNodes));
      return nextNodes;
    });
    setHasChanges(true);
  }, [mindMap, nodes]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = nodes.find(item => item.id === nodeId);
    if (!node) return;

    const ids = collectNodeAndDescendants(nodes, nodeId);
    const legacyIds = new Set(Array.from(ids).map(id => id.startsWith('mn_') ? id.slice(3) : id));
    const relatedPracticeCount = practiceRecords.filter(record => (
      record.source_node_ids.some(id => ids.has(id) || legacyIds.has(id))
    )).length;
    const confirmed = window.confirm([
      `删除「${node.name}」及其 ${ids.size - 1} 个子节点？`,
      `关联练习/错题记录：${relatedPracticeCount} 条`,
      '',
      '删除后报告、错题本和靶向练习可能出现引用缺口。确认继续？',
    ].join('\n'));
    if (!confirmed) return;

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
    setHasChanges(true);
  }, [edges, mindMap, nodes, practiceRecords, selectedNodeId]);

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
      if (changed) setHasChanges(true);
      return nextNodes;
    });
  }, []);

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

  const saveToNeon = useCallback(async () => {
    if (!mindMap) return;

    setIsSaving(true);
    try {
      const currentEdges = rebuildParentEdges(mindMap.id, nodes);
      const response = await fetch('/api/mindmap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mindMap.id,
          name: mindMap.name,
          description: mindMap.description,
          category: mindMap.category,
          nodes,
          edges: currentEdges,
          deleteNodeIds: deletedNodeIds,
          deleteEdgeIds: deletedEdgeIds,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || '保存失败');

      setEdges(currentEdges);
      setDeletedNodeIds([]);
      setDeletedEdgeIds([]);
      setHasChanges(false);
      onSave?.({ mindMap, nodes, edges: currentEdges });
    } finally {
      setIsSaving(false);
    }
  }, [deletedEdgeIds, deletedNodeIds, mindMap, nodes, onSave]);

  const handleGripDragStart = useCallback((nodeId: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTouchDragNodeId(nodeId);
    setTouchDropTargetId(null);
    const node = nodes.find(n => n.id === nodeId);
    if (node) selectNode(node);
  }, [nodes]);

  const handleContainerDragMove = useCallback((e: React.PointerEvent) => {
    if (!touchDragNodeId) return;
    e.preventDefault();

    // Find the row element under the pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-node-id]') as HTMLElement | null;
    const targetId = row?.dataset.nodeId || null;

    if (targetId && targetId !== touchDragNodeId) {
      setTouchDropTargetId(targetId);
    } else {
      setTouchDropTargetId(null);
    }
  }, [touchDragNodeId]);

  const handleContainerDragEnd = useCallback((e: React.PointerEvent) => {
    if (!touchDragNodeId) return;

    // Final check: what's under the pointer right now?
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-node-id]') as HTMLElement | null;
    const targetId = row?.dataset.nodeId || null;

    if (targetId && targetId !== touchDragNodeId) {
      const draggedNode = nodes.find(n => n.id === touchDragNodeId);
      const targetNode = nodes.find(n => n.id === targetId);
      if (draggedNode && targetNode) {
        if (draggedNode.parent_id === targetNode.parent_id) {
          // Same parent: reorder (insert after target)
          pushUndo();
          const targetOrder = targetNode.sort_order ?? 0;
          setNodes(prev => prev.map(n => {
            if (n.id === touchDragNodeId) return { ...n, sort_order: targetOrder + 1, updated_at: new Date().toISOString() };
            if (n.parent_id === draggedNode.parent_id && (n.sort_order ?? 0) > targetOrder && n.id !== touchDragNodeId) return { ...n, sort_order: (n.sort_order ?? 0) + 1 };
            return n;
          }));
          setHasChanges(true);
        } else {
          // Different parent: make child of target
          moveNode(touchDragNodeId, targetId);
        }
      }
    } else if (!targetId) {
      // Dropped on empty area (root zone): promote to root
      moveNode(touchDragNodeId, null);
    }

    setTouchDragNodeId(null);
    setTouchDropTargetId(null);
  }, [touchDragNodeId, nodes, moveNode, pushUndo]);

  const renderNode = (treeNode: TreeNode, depth: number): React.ReactNode => {
    const { node, children } = treeNode;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const isEditing = editingNodeId === node.id;
    const isTouchDragging = touchDragNodeId === node.id;
    const isTouchDropTarget = touchDropTargetId === node.id;

    return (
      <div key={node.id}>
        <div
          data-node-id={node.id}
          className={cn(
            'group flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-slate-100',
            isSelected && 'bg-blue-50 text-blue-700',
            isTouchDragging && 'opacity-40',
            isTouchDropTarget && 'bg-blue-100 ring-2 ring-blue-400',
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => selectNode(node)}
        >
          <span
            onPointerDown={handleGripDragStart(node.id)}
            className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1 -ml-1 touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <button
            type="button"
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
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditingNodeId(node.id);
                setEditingTitle(node.name);
              }}
            >
              {node.name}
            </button>
          )}

          {node.markdown && <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
          <button
            type="button"
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white md:flex-row md:rounded-xl md:border md:border-slate-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 md:hidden">
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
                if (value === 'text') setIsTextEditorCollapsed(false);
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
        <Button size="sm" onClick={saveToNeon} disabled={isSaving || !mindMap} className={cn('h-8 shrink-0 px-2', hasChanges && 'bg-amber-600 hover:bg-amber-700')}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 md:hidden">
        <div className="flex items-start gap-2">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Mind 编辑属于运营功能，新增节点、批量改结构和长笔记维护建议在桌面端操作。</span>
        </div>
      </div>

      <aside className={cn(
        "h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-slate-50/70 md:flex md:w-[360px] md:border-r md:border-slate-200",
        mobilePane === 'outline' || mobilePane === 'text' ? 'flex' : 'hidden'
      )}>
        <div className="hidden shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 md:flex">
          <div className="min-w-0">
            <Input
              value={mindMap?.name || '未命名导图'}
              className="h-8 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none"
              onChange={(event) => {
                setMindMap(prev => prev ? { ...prev, name: event.target.value } : prev);
                setHasChanges(true);
              }}
            />
          </div>
          <Button size="sm" onClick={saveToNeon} disabled={isSaving || !mindMap} className={hasChanges ? 'bg-amber-600 hover:bg-amber-700' : undefined}>
            {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            保存
          </Button>
        </div>

        <div className={cn(
          "grid shrink-0 grid-cols-3 gap-1.5 border-b border-slate-200 p-2 md:gap-2 md:p-3",
          mobilePane !== 'outline' && "hidden md:grid"
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
          "md:block md:flex-[1_1_42%]"
        )}>
          <div
            className="p-2 min-h-[60px]"
            onPointerMove={handleContainerDragMove}
            onPointerUp={handleContainerDragEnd}
            onPointerLeave={handleContainerDragEnd}
          >
            {treeData.map(root => renderNode(root, 0))}
          </div>
        </ScrollArea>

        <div className={cn(
          "min-h-0 flex-col border-t border-slate-200 bg-white",
          mobilePane === 'text' ? "flex flex-1" : "hidden",
          "md:flex",
          isTextEditorCollapsed ? "md:shrink-0" : "md:flex-[1.35_1_58%]"
        )}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="text-sm font-semibold text-slate-800">文本编辑器</div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsTextEditorCollapsed(value => !value)}
                aria-label={isTextEditorCollapsed ? '展开文本编辑器' : '收起文本编辑器'}
              >
                {isTextEditorCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              {selectedNode && !isTextEditorCollapsed && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedNodeId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {!isTextEditorCollapsed && selectedNode ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-500">标题</span>
                  <Input
                    value={selectedNode.name}
                    onChange={(event) => updateSelectedNode({ name: event.target.value })}
                    className="h-8"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-500">类型</span>
                  <select
                    value={selectedNode.node_type}
                    onChange={(event) => updateSelectedNode({ node_type: event.target.value })}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="subject">subject</option>
                    <option value="knowledge">knowledge</option>
                    <option value="subknowledge">subknowledge</option>
                    <option value="angle">angle</option>
                    <option value="topic">topic</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-500">摘要内容</span>
                  <Textarea
                    value={selectedNode.content || ''}
                    onChange={(event) => updateSelectedNode({ content: event.target.value })}
                    className="min-h-20 resize-none text-sm"
                    placeholder="节点卡片上展示的简短说明"
                  />
                </label>

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

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">宽度</span>
                    <Input
                      type="number"
                      min={120}
                      value={Math.round(selectedNode.width || 160)}
                      onChange={(event) => updateSelectedNode({ width: Number(event.target.value) || 160 })}
                      className="h-8"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">高度</span>
                    <Input
                      type="number"
                      min={40}
                      value={Math.round(selectedNode.height || 48)}
                      onChange={(event) => updateSelectedNode({ height: Number(event.target.value) || 48 })}
                      className="h-8"
                    />
                  </label>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => deleteNode(selectedNode.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  删除当前节点及子级
                </Button>
              </div>
            </ScrollArea>
          ) : !isTextEditorCollapsed ? (
            <div className="min-h-0 flex-1 p-4 text-sm text-slate-500">
              选择左侧大纲或右侧画布节点后，可以编辑标题、摘要、正文、类型和节点尺寸。
            </div>
          ) : null}
        </div>
      </aside>

      <main className={cn(
        "relative min-h-0 min-w-0 flex-1 bg-slate-100 md:block",
        mobilePane === 'canvas' ? "block" : "hidden"
      )}>
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-11 z-50 h-8 w-8 rounded-full bg-white/95 shadow-sm md:right-4 md:top-4 md:h-9 md:w-auto md:rounded-md md:px-3"
          onClick={() => setShowManual(true)}
          aria-label="用户手册"
        >
          <HelpCircle className="h-3.5 w-3.5 md:h-4 md:w-4" />
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
                  <h3 className="mb-2 font-semibold text-slate-900">文本编辑器</h3>
                  <p>选中节点后，左下编辑区可修改标题、摘要和 Markdown 正文；工具栏支持标题、加粗、斜体、列表、引用、代码和预览。修改后点击保存写入 Neon。</p>
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
                  <p>大纲改名、拖拽层级、删除节点和画布调整大小后，左上角保存按钮会变色。点击保存后写入 Neon。</p>
                </section>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        <MindCanvas
          mindMap={mindMap || undefined}
          nodes={nodes}
          readOnly={false}
          focusNodeId={selectedNodeId}
          onSelectNode={selectNode}
          onNodesChange={handleCanvasNodesChange}
          onTargetedPractice={onTargetedPractice}
        />
      </main>
    </div>
  );
}
