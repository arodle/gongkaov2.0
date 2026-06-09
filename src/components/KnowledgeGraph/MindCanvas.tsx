﻿'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Minus as MinusIcon,
  CornerDownRight as CornerIcon,
  ChevronDown,
  ChevronRight,
  FileText,
  X,
  BookOpen,
  Search,
  ListTree,
  Loader2,
  Target,
  GitBranch,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MarkdownNote } from '@/components/KnowledgeGraph/MarkdownNote';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/stores/appStore';
import { estimateRetentionRate } from '@/lib/services/psCalculator';
import type { KnowledgeNodeRecord, MindMapRecord, MapNodeRecord } from '@/types';

interface MindCanvasProps {
  mindMap?: MindMapRecord;
  nodes?: MapNodeRecord[];
  readOnly?: boolean;
  focusNodeId?: string | null;
  onSelectNode?: (node: MapNodeRecord) => void;
  onNodesChange?: (nodes: MapNodeRecord[]) => void;
  onTargetedPractice?: (nodeId: string) => void;
}

interface TreeNode {
  node: MapNodeRecord;
  children: TreeNode[];
}

interface PositionedNode {
  node: MapNodeRecord;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EdgeData {
  from: PositionedNode;
  to: PositionedNode;
}

interface ResizeState {
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
}

type LayoutDirection = 'right' | 'left' | 'both' | 'down';
type EdgeStyle = 'curve' | 'straight' | 'elbow';
type FocusFilterMode = 'all' | 'weak' | 'frequent';

const DEFAULT_MIND_CANVAS_SETTINGS: MindCanvasLocalSettings = {
  layoutDirection: 'right',
  edgeStyle: 'curve',
  edgeWidth: 2,
  edgeColor: '#64748B',
};

const MINI_MAP_WIDTH = 220;
const MINI_MAP_HEIGHT = 140;
const EDGE_COLORS = ['#64748B', '#2563EB', '#DC2626', '#059669', '#D97706'];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string; hoverBg: string }> = {
  subject: { bg: '#F0F6FF', border: '#3B82F6', text: '#1E40AF', dot: '#3B82F6', hoverBg: '#DBEAFE' },
  knowledge: { bg: '#FFFBEB', border: '#F59E0B', text: '#B45309', dot: '#F59E0B', hoverBg: '#FEF3C7' },
  subknowledge: { bg: '#ECFDF5', border: '#10B981', text: '#065F46', dot: '#10B981', hoverBg: '#D1FAE5' },
  angle: { bg: '#FDF2F8', border: '#EC4899', text: '#9D174D', dot: '#EC4899', hoverBg: '#FCE7F3' },
  topic: { bg: '#F9FAFB', border: '#6B7280', text: '#374151', dot: '#6B7280', hoverBg: '#F3F4F6' },
};

type MasteryStatus = 'weak' | 'learning' | 'mastered' | 'pending';

interface MasteryView {
  status: MasteryStatus;
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  hoverBg: string;
  questionCount: number;
  practicedCount: number;
  wrongCount: number;
  effectivePS: number | null;
  lastPracticedAt: string | null;
}

const MASTERY_COLORS: Record<MasteryStatus, Pick<MasteryView, 'bg' | 'border' | 'text' | 'dot' | 'hoverBg' | 'label'>> = {
  weak: { label: '\u8584\u5f31\u9700\u52a0\u5f3a', bg: '#FEF2F2', border: '#DC2626', text: '#991B1B', dot: '#DC2626', hoverBg: '#FEE2E2' },
  learning: { label: '\u5b66\u4e60\u4e2d', bg: '#FFFBEB', border: '#D97706', text: '#92400E', dot: '#D97706', hoverBg: '#FEF3C7' },
  mastered: { label: '\u719f\u7ec3', bg: '#ECFDF5', border: '#059669', text: '#065F46', dot: '#059669', hoverBg: '#D1FAE5' },
  pending: { label: '\u5f85\u5b66\u4e60', bg: '#F8FAFC', border: '#64748B', text: '#334155', dot: '#64748B', hoverBg: '#F1F5F9' },
};

function getLegacyNodeId(mapNodeId: string): string {
  return mapNodeId.startsWith('mn_') ? mapNodeId.slice(3) : mapNodeId;
}

function getDaysSince(dateText: string | null | undefined): number | null {
  if (!dateText) return null;
  const timestamp = new Date(dateText).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function getEffectivePS(node: KnowledgeNodeRecord | undefined): number | null {
  if (!node) return null;
  const daysSincePractice = getDaysSince(node.last_practiced_at);
  if (daysSincePractice === null) return Math.round(node.ps_score);
  return Math.round(node.ps_score * estimateRetentionRate(node.ps_score, daysSincePractice));
}

function formatLastPractice(dateText: string | null): string {
  const days = getDaysSince(dateText);
  if (days === null) return '\u5c1a\u672a\u7ec3\u4e60';
  if (days < 1) return '\u4eca\u5929\u7ec3\u8fc7';
  if (days < 2) return '\u6628\u5929\u7ec3\u8fc7';
  return `${Math.floor(days)} \u5929\u672a\u7ec3`;
}

interface MindCanvasLocalSettings {
  layoutDirection: LayoutDirection;
  edgeStyle: EdgeStyle;
  edgeWidth: number;
  edgeColor: string;
}

export function MindCanvas({
  mindMap: initialMindMap,
  nodes: initialNodes,
  focusNodeId,
  onSelectNode,
  onNodesChange,
  onTargetedPractice,
}: MindCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoFitKeyRef = useRef('');
  const focusFilterFitKeyRef = useRef('');
  const settingsReadyMapIdRef = useRef<string | null>(null);
  const lastSavedSettingsJsonRef = useRef('');
  const previousLayoutDirectionRef = useRef<LayoutDirection | null>(null);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>(DEFAULT_MIND_CANVAS_SETTINGS.layoutDirection);
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(DEFAULT_MIND_CANVAS_SETTINGS.edgeStyle);
  const [edgeWidth, setEdgeWidth] = useState(DEFAULT_MIND_CANVAS_SETTINGS.edgeWidth);
  const [edgeColor, setEdgeColor] = useState(DEFAULT_MIND_CANVAS_SETTINGS.edgeColor);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<MapNodeRecord | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [nodes, setNodes] = useState<MapNodeRecord[]>(initialNodes || []);
  const [mindMap, setMindMap] = useState<MindMapRecord | undefined>(initialMindMap);
  const [showNotebook, setShowNotebook] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExamPaper, setSelectedExamPaper] = useState('');
  const [focusFilterMode, setFocusFilterMode] = useState<FocusFilterMode>('all');
  const [isLoading, setIsLoading] = useState(!initialNodes?.length);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const knowledgeNodes = useAppStore(state => state.nodes);
  const questionBank = useAppStore(state => state.questionBank);
  const practiceRecords = useAppStore(state => state.practiceRecords);

  useEffect(() => {
    if (typeof window === 'undefined' || !mindMap?.id) return;

    const storageKey = `mindcanvas.settings.${mindMap.id}`;
    try {
      const dbSettings = mindMap.settings as Partial<MindCanvasLocalSettings> | null | undefined;
      const rawSettings = window.localStorage.getItem(storageKey);
      const settings = rawSettings
        ? JSON.parse(rawSettings) as Partial<MindCanvasLocalSettings>
        : dbSettings;

      if (!settings) {
        lastSavedSettingsJsonRef.current = JSON.stringify(DEFAULT_MIND_CANVAS_SETTINGS);
        settingsReadyMapIdRef.current = mindMap.id;
        return;
      }

      if (settings.layoutDirection) setLayoutDirection(settings.layoutDirection);
      if (settings.edgeStyle) setEdgeStyle(settings.edgeStyle);
      if (typeof settings.edgeWidth === 'number') setEdgeWidth(settings.edgeWidth);
      if (typeof settings.edgeColor === 'string') setEdgeColor(settings.edgeColor);
      lastSavedSettingsJsonRef.current = JSON.stringify({
        layoutDirection: settings.layoutDirection || DEFAULT_MIND_CANVAS_SETTINGS.layoutDirection,
        edgeStyle: settings.edgeStyle || DEFAULT_MIND_CANVAS_SETTINGS.edgeStyle,
        edgeWidth: typeof settings.edgeWidth === 'number' ? settings.edgeWidth : DEFAULT_MIND_CANVAS_SETTINGS.edgeWidth,
        edgeColor: settings.edgeColor || DEFAULT_MIND_CANVAS_SETTINGS.edgeColor,
      });
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    settingsReadyMapIdRef.current = mindMap.id;
  }, [mindMap?.id, mindMap?.settings]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mindMap?.id) return;
    if (settingsReadyMapIdRef.current !== mindMap.id) return;

    const settings: MindCanvasLocalSettings = {
      layoutDirection,
      edgeStyle,
      edgeWidth,
      edgeColor,
    };
    window.localStorage.setItem(`mindcanvas.settings.${mindMap.id}`, JSON.stringify(settings));
  }, [edgeColor, edgeStyle, edgeWidth, layoutDirection, mindMap?.id]);

  useEffect(() => {
    if (!mindMap?.id) return;
    if (settingsReadyMapIdRef.current !== mindMap.id) return;

    const settings: MindCanvasLocalSettings = {
      layoutDirection,
      edgeStyle,
      edgeWidth,
      edgeColor,
    };
    const settingsJson = JSON.stringify(settings);
    if (lastSavedSettingsJsonRef.current === settingsJson) return;

    const timer = window.setTimeout(() => {
      void fetch('/api/mindmap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mindMap.id,
          name: mindMap.name,
          description: mindMap.description,
          category: mindMap.category,
          settings,
        }),
      }).then(() => {
        lastSavedSettingsJsonRef.current = settingsJson;
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [edgeColor, edgeStyle, edgeWidth, layoutDirection, mindMap]);

  // 数据初始化与监听
  useEffect(() => {
    if (nodes.length && expandedNodes.size === 0) {
      const rootIds = nodes.filter(n => !n.parent_id).map(n => n.id);
      const firstLevelIds = nodes.filter(n => rootIds.includes(n.parent_id || '')).map(n => n.id);
      setExpandedNodes(new Set([...rootIds, ...firstLevelIds]));
    }
  }, [expandedNodes.size, nodes]);

  useEffect(() => {
    if (initialNodes) {
      setNodes(initialNodes);
      setIsLoading(false);
      setLoadError(null);
    }
    if (initialMindMap) setMindMap(initialMindMap);
  }, [initialNodes, initialMindMap]);

  useEffect(() => {
    onNodesChange?.(nodes);
  }, [nodes, onNodesChange]);

  useEffect(() => {
    const loadMindMap = async () => {
      if (initialNodes?.length) return;
      
      try {
        setIsLoading(true);
        setLoadError(null);
        const response = await fetch('/api/mindmap');
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
          const latestMap = result.data[0];
          const mapResponse = await fetch(`/api/mindmap?id=${latestMap.id}`);
          const mapResult = await mapResponse.json();
          if (mapResult.success) {
            setMindMap(mapResult.data.mindMap);
            setNodes(mapResult.data.nodes);
          }
        } else {
          setNodes([]);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '导图加载失败');
        setLoadError(error instanceof Error ? error.message : '导图加载失败');
      } finally {
        setIsLoading(false);
      }
    };

    loadMindMap();
  }, [initialNodes]);

  const treeData = useMemo((): TreeNode[] => {
    if (!nodes.length) return [];
    const nodeMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    nodes.forEach(node => nodeMap.set(node.id, { node, children: [] }));
    nodes.forEach(node => {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(treeNode);
      } else {
        rootNodes.push(treeNode);
      }
    });
    return rootNodes;
  }, [nodes]);

  const nodeById = useMemo(() => {
    return new Map(nodes.map(node => [node.id, node]));
  }, [nodes]);

  const childCountById = useMemo(() => {
    const counts = new Map<string, number>();
    nodes.forEach(node => {
      if (!node.parent_id) return;
      counts.set(node.parent_id, (counts.get(node.parent_id) || 0) + 1);
    });
    return counts;
  }, [nodes]);

  const nodeDepthById = useMemo(() => {
    const depths = new Map<string, number>();
    const traverse = (treeNode: TreeNode, depth: number) => {
      depths.set(treeNode.node.id, depth);
      treeNode.children.forEach(child => traverse(child, depth + 1));
    };

    treeData.forEach(root => traverse(root, 0));
    return depths;
  }, [treeData]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return nodes.filter(node => {
      return [
        node.name,
        node.content || '',
        node.markdown || '',
        node.node_type,
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [nodes, searchQuery]);

  const searchResultIds = useMemo(() => {
    return new Set(searchResults.map(node => node.id));
  }, [searchResults]);

  const knowledgeNodeById = useMemo(() => {
    return new Map(knowledgeNodes.map(node => [node.id, node]));
  }, [knowledgeNodes]);

  const questionCountByNodeId = useMemo(() => {
    const counts = new Map<string, number>();
    questionBank.forEach(question => {
      counts.set(question.linkedAngleId, (counts.get(question.linkedAngleId) || 0) + 1);
    });
    return counts;
  }, [questionBank]);

  const examPaperOptions = useMemo(() => {
    return Array.from(new Set(questionBank.map(question => question.examPaper).filter(Boolean) as string[])).sort();
  }, [questionBank]);

  const highlightedNodeIdsByExamPaper = useMemo(() => {
    if (!selectedExamPaper) return new Set<string>();

    const ids = new Set<string>();
    questionBank.forEach(question => {
      if (question.examPaper !== selectedExamPaper || !question.linkedAngleId) return;
      ids.add(question.linkedAngleId);
      ids.add(`mn_${question.linkedAngleId}`);
      if (question.linkedAngleId.startsWith('mn_')) {
        ids.add(question.linkedAngleId.slice(3));
      }
    });
    return ids;
  }, [questionBank, selectedExamPaper]);

  const practiceStatsByNodeId = useMemo(() => {
    const stats = new Map<string, { practicedCount: number; wrongCount: number; latestAt: string | null; latestCorrect: boolean | null }>();

    practiceRecords.forEach(record => {
      record.source_node_ids.forEach(nodeId => {
        const current = stats.get(nodeId) || {
          practicedCount: 0,
          wrongCount: 0,
          latestAt: null,
          latestCorrect: null,
        };
        const isNewer = !current.latestAt || new Date(record.updated_at).getTime() >= new Date(current.latestAt).getTime();
        stats.set(nodeId, {
          practicedCount: current.practicedCount + 1,
          wrongCount: current.wrongCount + (record.is_correct ? 0 : 1),
          latestAt: isNewer ? record.updated_at : current.latestAt,
          latestCorrect: isNewer ? record.is_correct : current.latestCorrect,
        });
      });
    });

    return stats;
  }, [practiceRecords]);

  const getMasteryView = useCallback((mapNode: MapNodeRecord): MasteryView => {
    const legacyNodeId = getLegacyNodeId(mapNode.id);
    const knowledgeNode = knowledgeNodeById.get(legacyNodeId);
    const questionCount = questionCountByNodeId.get(legacyNodeId) || 0;
    const stats = practiceStatsByNodeId.get(legacyNodeId);
    const practicedCount = stats?.practicedCount || 0;
    const wrongCount = stats?.wrongCount || 0;
    const effectivePS = getEffectivePS(knowledgeNode);
    const lastPracticedAt = knowledgeNode?.last_practiced_at || stats?.latestAt || null;
    const daysSincePractice = getDaysSince(lastPracticedAt);

    let status: MasteryStatus = 'pending';
    if ((stats?.latestCorrect === false) || wrongCount > 0 || (effectivePS !== null && effectivePS < 80) || (questionCount > 0 && practicedCount === 0)) {
      status = 'weak';
    } else if ((daysSincePractice !== null && daysSincePractice >= 14) || (effectivePS !== null && effectivePS < 150)) {
      status = 'learning';
    } else if (effectivePS !== null && effectivePS >= 150) {
      status = 'mastered';
    }

    return {
      ...MASTERY_COLORS[status],
      status,
      questionCount,
      practicedCount,
      wrongCount,
      effectivePS,
      lastPracticedAt,
    };
  }, [knowledgeNodeById, practiceStatsByNodeId, questionCountByNodeId]);

  const highFrequencyThreshold = useMemo(() => {
    const counts = nodes
      .map(node => questionCountByNodeId.get(getLegacyNodeId(node.id)) || 0)
      .filter(count => count > 0)
      .sort((a, b) => b - a);

    if (!counts.length) return 0;

    const topQuartileIndex = Math.max(0, Math.ceil(counts.length * 0.25) - 1);
    const topQuartileCount = counts[topQuartileIndex] || counts[0];
    return counts[0] >= 3 ? Math.max(3, topQuartileCount) : topQuartileCount;
  }, [nodes, questionCountByNodeId]);

  const weakNodeIds = useMemo(() => {
    return new Set(nodes.filter(node => getMasteryView(node).status === 'weak').map(node => node.id));
  }, [nodes, getMasteryView]);

  const highFrequencyNodeIds = useMemo(() => {
    if (highFrequencyThreshold <= 0) return new Set<string>();

    return new Set(nodes.filter(node => (
      (questionCountByNodeId.get(getLegacyNodeId(node.id)) || 0) >= highFrequencyThreshold
    )).map(node => node.id));
  }, [highFrequencyThreshold, nodes, questionCountByNodeId]);

  const focusTargetIds = useMemo(() => {
    if (focusFilterMode === 'weak') return weakNodeIds;
    if (focusFilterMode === 'frequent') return highFrequencyNodeIds;
    return new Set<string>();
  }, [focusFilterMode, highFrequencyNodeIds, weakNodeIds]);

  const focusVisibleNodeIds = useMemo(() => {
    if (focusFilterMode === 'all') return null;

    const ids = new Set<string>();
    focusTargetIds.forEach(nodeId => {
      let current = nodeById.get(nodeId);
      while (current) {
        ids.add(current.id);
        current = current.parent_id ? nodeById.get(current.parent_id) : undefined;
      }
    });
    return ids;
  }, [focusFilterMode, focusTargetIds, nodeById]);

  const focusFilterKey = useMemo(() => {
    if (focusFilterMode === 'all') return 'all';
    return `${focusFilterMode}:${Array.from(focusTargetIds).sort().join(',')}`;
  }, [focusFilterMode, focusTargetIds]);

  const isFocusFilterExpanded = useMemo(() => {
    if (focusFilterMode === 'all' || !focusVisibleNodeIds?.size) return false;
    return Array.from(focusVisibleNodeIds).every(nodeId => expandedNodes.has(nodeId));
  }, [expandedNodes, focusFilterMode, focusVisibleNodeIds]);

  const weakCount = weakNodeIds.size;
  const highFrequencyCount = highFrequencyNodeIds.size;

  const expandPathToNode = useCallback((nodeId: string) => {
    const ids = new Set<string>();
    let current = nodeById.get(nodeId);

    while (current?.parent_id) {
      ids.add(current.parent_id);
      current = nodeById.get(current.parent_id);
    }

    setExpandedNodes(prev => new Set([...prev, ...ids]));
  }, [nodeById]);

  const focusNode = useCallback((node: MapNodeRecord) => {
    expandPathToNode(node.id);
    const depth = nodeDepthById.get(node.id) ?? 0;
    setScale(current => Math.max(current, getMinimumScaleForDepth(depth)));
    setSelectedNode(node);
    setShowNotebook(false);
  }, [expandPathToNode, nodeDepthById]);

const HORIZONTAL_GAP = 80; 
const VERTICAL_GAP = 32;   
const MIN_NODE_WIDTH = 140;
const MAX_NODE_WIDTH = 320;
const MIN_NODE_HEIGHT = 44;

function getVisibleDepthForScale(currentScale: number): number {
  if (currentScale < 0.62) return 1;
  if (currentScale < 0.86) return 2;
  if (currentScale < 1.08) return 3;
  if (currentScale < 1.32) return 4;
  if (currentScale < 1.58) return 5;
  if (currentScale < 1.9) return 6;
  return Number.POSITIVE_INFINITY;
}

function getMinimumScaleForDepth(depth: number): number {
  if (depth <= 0) return 0.62;
  if (depth === 1) return 0.86;
  if (depth === 2) return 1.08;
  if (depth === 3) return 1.32;
  if (depth === 4) return 1.58;
  if (depth === 5) return 1.9;
  return 2.25;
}

const calculateNodeDimensions = useCallback((node: MapNodeRecord, currentScale: number): { width: number; height: number } => {
  // 根据标题长度和操作区预留空间估算节点宽度。
  const textLen = node.name.length;
  const textWidth = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, textLen * 12 + 60));
  const width = Math.max(textWidth, node.width || MIN_NODE_WIDTH);

  // 缩放较小时只保留标题单行高度，避免节点占屏过多。
  if (currentScale <= 0.7) {
    return { width, height: Math.max(MIN_NODE_HEIGHT, node.height || MIN_NODE_HEIGHT) };
  }
  
  // 根据标题折行、内容和笔记预览估算节点高度。
  const charsPerLine = Math.floor((width - 60) / 12);
  const titleLines = Math.min(3, Math.max(1, Math.ceil(textLen / charsPerLine)));
  let totalHeight = titleLines * 20 + 24;

  if (node.content) {
    totalHeight += 54;
  }
  
  if (node.markdown && !showNotebook) {
    totalHeight += 48; // 给 Markdown 预览留出固定空间。
  }
  
  return { width, height: Math.max(totalHeight, MIN_NODE_HEIGHT, node.height || MIN_NODE_HEIGHT) };
}, [showNotebook]);

  const visibleTreeData = useMemo((): TreeNode[] => {
    const cloneToDepth = (treeNode: TreeNode, depth: number, maxDepth: number): TreeNode | null => {
      if (focusVisibleNodeIds && !focusVisibleNodeIds.has(treeNode.node.id)) return null;

      const canShowChildren = depth < maxDepth && expandedNodes.has(treeNode.node.id);

      return {
        node: treeNode.node,
        children: canShowChildren
          ? treeNode.children
            .map(child => cloneToDepth(child, depth + 1, maxDepth))
            .filter((child): child is TreeNode => child !== null)
          : [],
      };
    };

    return treeData
      .map(root => cloneToDepth(root, 0, getVisibleDepthForScale(scale)))
      .filter((root): root is TreeNode => root !== null);
  }, [treeData, expandedNodes, focusVisibleNodeIds, scale]);

  const visibleChildCountById = useMemo(() => {
    const counts = new Map<string, number>();
    const traverse = (treeNode: TreeNode) => {
      counts.set(treeNode.node.id, treeNode.children.length);
      treeNode.children.forEach(traverse);
    };
    visibleTreeData.forEach(traverse);
    return counts;
  }, [visibleTreeData]);

  const calculateNodePositions = useMemo((): Map<string, PositionedNode> => {
    const positions = new Map<string, PositionedNode>();
    let currentY = 60;
    let currentX = 60;

    const calculateSubtreeHeight = (treeNode: TreeNode): number => {
      if (treeNode.children.length === 0) {
        return calculateNodeDimensions(treeNode.node, scale).height + VERTICAL_GAP;
      }
      const childrenSum = treeNode.children.reduce((sum, child) => sum + calculateSubtreeHeight(child), 0);
      const selfHeight = calculateNodeDimensions(treeNode.node, scale).height + VERTICAL_GAP;
      return Math.max(selfHeight, childrenSum);
    };

    const calculateSubtreeWidth = (treeNode: TreeNode): number => {
      const nodeDims = calculateNodeDimensions(treeNode.node, scale);
      if (treeNode.children.length === 0) {
        return nodeDims.width + HORIZONTAL_GAP;
      }
      const childrenSum = treeNode.children.reduce((sum, child) => sum + calculateSubtreeWidth(child), 0);
      return Math.max(nodeDims.width + HORIZONTAL_GAP, childrenSum);
    };

    const layoutHorizontal = (treeNode: TreeNode, startX: number, topY: number, direction: 'right' | 'left') => {
      const totalHeight = calculateSubtreeHeight(treeNode);
      const nodeDims = calculateNodeDimensions(treeNode.node, scale);
      const nodeY = topY + (totalHeight - VERTICAL_GAP) / 2 - nodeDims.height / 2;

      positions.set(treeNode.node.id, {
        node: treeNode.node,
        x: startX,
        y: nodeY,
        width: nodeDims.width,
        height: nodeDims.height,
      });

      if (treeNode.children.length > 0) {
        const nextX = direction === 'right'
          ? startX + nodeDims.width + HORIZONTAL_GAP
          : startX - HORIZONTAL_GAP - MAX_NODE_WIDTH;
        let nextY = topY;
        treeNode.children.forEach(child => {
          layoutHorizontal(child, nextX, nextY, direction);
          nextY += calculateSubtreeHeight(child);
        });
      }
    };

    const layoutDown = (treeNode: TreeNode, leftX: number, startY: number) => {
      const totalWidth = calculateSubtreeWidth(treeNode);
      const nodeDims = calculateNodeDimensions(treeNode.node, scale);
      const nodeX = leftX + (totalWidth - HORIZONTAL_GAP) / 2 - nodeDims.width / 2;

      positions.set(treeNode.node.id, {
        node: treeNode.node,
        x: nodeX,
        y: startY,
        width: nodeDims.width,
        height: nodeDims.height,
      });

      if (treeNode.children.length > 0) {
        let childX = leftX;
        const nextY = startY + nodeDims.height + VERTICAL_GAP * 2;
        treeNode.children.forEach(child => {
          layoutDown(child, childX, nextY);
          childX += calculateSubtreeWidth(child);
        });
      }
    };

    visibleTreeData.forEach(root => {
      if (layoutDirection === 'down') {
        layoutDown(root, currentX, 60);
        currentX += calculateSubtreeWidth(root) + 40;
        return;
      }

      if (layoutDirection === 'both') {
        const leftChildren = root.children.filter((_, index) => index % 2 === 0);
        const rightChildren = root.children.filter((_, index) => index % 2 !== 0);
        const rootDims = calculateNodeDimensions(root.node, scale);
        const leftRoot = { ...root, children: leftChildren };
        const rightRoot = { ...root, children: rightChildren };
        const totalHeight = Math.max(calculateSubtreeHeight(leftRoot), calculateSubtreeHeight(rightRoot));
        const rootY = currentY + (totalHeight - VERTICAL_GAP) / 2 - rootDims.height / 2;

        positions.set(root.node.id, {
          node: root.node,
          x: 220,
          y: rootY,
          width: rootDims.width,
          height: rootDims.height,
        });

        let leftY = currentY;
        leftChildren.forEach(child => {
          layoutHorizontal(child, 220 - HORIZONTAL_GAP - MAX_NODE_WIDTH, leftY, 'left');
          leftY += calculateSubtreeHeight(child);
        });

        let rightY = currentY;
        rightChildren.forEach(child => {
          layoutHorizontal(child, 220 + rootDims.width + HORIZONTAL_GAP, rightY, 'right');
          rightY += calculateSubtreeHeight(child);
        });

        currentY += totalHeight + 40;
        return;
      }

      const startX = layoutDirection === 'left' ? 520 : 60;
      layoutHorizontal(root, startX, currentY, layoutDirection);
      currentY += calculateSubtreeHeight(root) + 40;
    });

    return positions;
  }, [visibleTreeData, scale, calculateNodeDimensions, layoutDirection]);

  // 5. 杩炵嚎鐢熸垚
  const generateEdges = useMemo((): EdgeData[] => {
    const result: EdgeData[] = [];
    const traverse = (node: TreeNode) => {
      node.children.forEach(child => {
        const source = calculateNodePositions.get(node.node.id);
        const target = calculateNodePositions.get(child.node.id);
        if (source && target) {
          result.push({ from: source, to: target });
        }
        traverse(child);
      });
    };
    visibleTreeData.forEach(root => traverse(root));
    return result;
  }, [visibleTreeData, calculateNodePositions]);

  const getEdgePath = useCallback((edge: EdgeData) => {
    let fx: number;
    let fy: number;
    let tx: number;
    let ty: number;

    if (layoutDirection === 'down') {
      fx = edge.from.x + edge.from.width / 2;
      fy = edge.from.y + edge.from.height;
      tx = edge.to.x + edge.to.width / 2;
      ty = edge.to.y;
    } else if (edge.to.x < edge.from.x) {
      fx = edge.from.x;
      fy = edge.from.y + edge.from.height / 2;
      tx = edge.to.x + edge.to.width;
      ty = edge.to.y + edge.to.height / 2;
    } else {
      fx = edge.from.x + edge.from.width;
      fy = edge.from.y + edge.from.height / 2;
      tx = edge.to.x;
      ty = edge.to.y + edge.to.height / 2;
    }

    if (edgeStyle === 'straight') {
      return `M ${fx} ${fy} L ${tx} ${ty}`;
    }

    if (edgeStyle === 'elbow') {
      if (layoutDirection === 'down') {
        const midY = fy + (ty - fy) / 2;
        return `M ${fx} ${fy} V ${midY} H ${tx} V ${ty}`;
      }
      const midX = fx + (tx - fx) / 2;
      return `M ${fx} ${fy} H ${midX} V ${ty} H ${tx}`;
    }

    if (layoutDirection === 'down') {
      const controlOffset = Math.min(Math.abs(ty - fy) * 0.55, 120);
      return `M ${fx} ${fy} C ${fx} ${fy + controlOffset}, ${tx} ${ty - controlOffset}, ${tx} ${ty}`;
    }

    const direction = tx >= fx ? 1 : -1;
    const controlOffset = Math.min(Math.abs(tx - fx) * 0.55, 120);
    return `M ${fx} ${fy} C ${fx + direction * controlOffset} ${fy}, ${tx - direction * controlOffset} ${ty}, ${tx} ${ty}`;
  }, [edgeStyle, layoutDirection]);

  const isShowDetail = useMemo(() => scale > 0.7, [scale]);
  const isCompactMode = useMemo(() => scale < 0.5, [scale]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 使用平滑缩放系数，让滚轮缩放更稳定。
    const zoomFactor = 1.15;
    const nextScale = e.deltaY < 0 
      ? Math.min(3.0, scale * zoomFactor) 
      : Math.max(0.2, scale / zoomFactor);

    if (nextScale === scale) return;

    setPosition(prev => ({
      x: mouseX - (mouseX - prev.x) * (nextScale / scale),
      y: mouseY - (mouseY - prev.y) * (nextScale / scale),
    }));
    setScale(nextScale);
  }, [scale]);

  // 7. 画布拖拽事件
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (e.button === 0 && !target.closest('.mindmap-node')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (resizeState) {
      const deltaX = (e.clientX - resizeState.startClientX) / scale;
      const deltaY = (e.clientY - resizeState.startClientY) / scale;
      const nextWidth = Math.max(MIN_NODE_WIDTH, resizeState.startWidth + deltaX);
      const nextHeight = Math.max(MIN_NODE_HEIGHT, resizeState.startHeight + deltaY);

      setNodes(prev => prev.map(node => (
        node.id === resizeState.nodeId
          ? { ...node, width: Math.round(nextWidth), height: Math.round(nextHeight), updated_at: new Date().toISOString() }
          : node
      )));
      return;
    }

    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart, resizeState, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setResizeState(null);
  }, []);

  const handleZoomIn = useCallback(() => setScale(s => Math.min(3, s * 1.2)), []);
  const handleZoomOut = useCallback(() => setScale(s => Math.max(0.2, s / 1.2)), []);
  const handleFitView = useCallback(() => {
    if (!containerRef.current || calculateNodePositions.size === 0) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const positionedNodes = Array.from(calculateNodePositions.values());
    const minX = Math.min(...positionedNodes.map(node => node.x));
    const minY = Math.min(...positionedNodes.map(node => node.y));
    const maxX = Math.max(...positionedNodes.map(node => node.x + node.width));
    const maxY = Math.max(...positionedNodes.map(node => node.y + node.height));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const padding = 96;
    const nextScale = Math.max(
      0.25,
      Math.min(1.4, Math.min((rect.width - padding) / contentWidth, (rect.height - padding) / contentHeight)),
    );

    setScale(nextScale);
    setPosition({
      x: (rect.width - contentWidth * nextScale) / 2 - minX * nextScale,
      y: (rect.height - contentHeight * nextScale) / 2 - minY * nextScale,
    });
    setSelectedNode(null);
    setShowNotebook(false);
  }, [calculateNodePositions]);

  const expandAll = useCallback(() => {
    setFocusFilterMode('all');
    setExpandedNodes(new Set(nodes.map(node => node.id)));
  }, [nodes]);

  const collapseToRoots = useCallback(() => {
    setFocusFilterMode('all');
    setExpandedNodes(new Set(nodes.filter(node => !node.parent_id).map(node => node.id)));
    setSelectedNode(null);
    setShowNotebook(false);
  }, [nodes]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      const shouldExpand = !newSet.has(nodeId);
      if (shouldExpand) newSet.add(nodeId);
      else newSet.delete(nodeId);

      if (shouldExpand) {
        const depth = nodeDepthById.get(nodeId) ?? 0;
        const minimumScale = getMinimumScaleForDepth(depth + 1);
        setScale(current => Math.max(current, minimumScale));
      }

      return newSet;
    });
  }, [nodeDepthById]);

  const toggleSelectedNode = useCallback(() => {
    if (!selectedNode || !childCountById.has(selectedNode.id)) return;
    toggleExpand(selectedNode.id);
  }, [selectedNode, childCountById, toggleExpand]);

  const handleNodeClick = useCallback((node: MapNodeRecord) => {
    setSelectedNode(node);
    onSelectNode?.(node);
    setShowNotebook(!!(node.markdown && scale > 0.7));
  }, [scale, onSelectNode]);

  const startResize = useCallback((e: React.MouseEvent, pos: PositionedNode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedNode(pos.node);
    setShowNotebook(false);
    setIsDragging(false);
    setResizeState({
      nodeId: pos.node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWidth: pos.width,
      startHeight: pos.height,
    });
  }, []);

  useEffect(() => {
    if (!isLoading && nodes.length > 0) {
      const autoFitKey = `${mindMap?.id || 'local'}:${nodes.length}`;
      if (autoFitKeyRef.current === autoFitKey) return;
      autoFitKeyRef.current = autoFitKey;

      const timer = window.setTimeout(handleFitView, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isLoading, nodes.length, mindMap?.id, handleFitView]);

  useEffect(() => {
    if (focusFilterMode === 'all') return;

    if (!focusVisibleNodeIds?.size) {
      setExpandedNodes(new Set(nodes.filter(node => !node.parent_id).map(node => node.id)));
      setSelectedNode(null);
      setShowNotebook(false);
      return;
    }

    setExpandedNodes(new Set(focusVisibleNodeIds));
    setSelectedNode(current => (current && focusVisibleNodeIds.has(current.id) ? current : null));
    setShowNotebook(false);
  }, [focusFilterMode, focusVisibleNodeIds, nodes]);

  useEffect(() => {
    if (focusFilterMode === 'all') {
      focusFilterFitKeyRef.current = 'all';
      return;
    }
    if (!focusVisibleNodeIds?.size) return;
    if (!isFocusFilterExpanded) return;
    if (focusFilterFitKeyRef.current === focusFilterKey) return;

    focusFilterFitKeyRef.current = focusFilterKey;
    const timer = window.setTimeout(handleFitView, 80);
    return () => window.clearTimeout(timer);
  }, [focusFilterKey, focusFilterMode, focusVisibleNodeIds?.size, handleFitView, isFocusFilterExpanded]);

  useEffect(() => {
    if (isLoading || nodes.length === 0) return;
    if (previousLayoutDirectionRef.current === null) {
      previousLayoutDirectionRef.current = layoutDirection;
      return;
    }
    if (previousLayoutDirectionRef.current === layoutDirection) return;
    previousLayoutDirectionRef.current = layoutDirection;

    const timer = window.setTimeout(handleFitView, 50);
    return () => window.clearTimeout(timer);
  }, [handleFitView, isLoading, layoutDirection, nodes.length]);

  useEffect(() => {
    if (!focusNodeId) return;
    const node = nodeById.get(focusNodeId);
    if (!node) return;

    expandPathToNode(node.id);
    setScale(current => Math.max(current, getMinimumScaleForDepth(nodeDepthById.get(node.id) ?? 0)));
    setSelectedNode(node);
    setShowNotebook(false);
  }, [focusNodeId, nodeById, nodeDepthById, expandPathToNode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape') {
        setSelectedNode(null);
        setShowNotebook(false);
        setResizeState(null);
        searchInputRef.current?.blur();
        return;
      }

      if (isTyping) return;

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        handleZoomIn();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        handleZoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        handleFitView();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleSelectedNode();
      } else if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        expandAll();
      } else if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        collapseToRoots();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleFitView, toggleSelectedNode, expandAll, collapseToRoots]);

  const miniMapData = useMemo(() => {
    const positionedNodes = Array.from(calculateNodePositions.values());
    if (!positionedNodes.length) return null;

    const minX = Math.min(...positionedNodes.map(node => node.x));
    const minY = Math.min(...positionedNodes.map(node => node.y));
    const maxX = Math.max(...positionedNodes.map(node => node.x + node.width));
    const maxY = Math.max(...positionedNodes.map(node => node.y + node.height));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const miniScale = Math.min((MINI_MAP_WIDTH - 20) / contentWidth, (MINI_MAP_HEIGHT - 20) / contentHeight);
    const offsetX = (MINI_MAP_WIDTH - contentWidth * miniScale) / 2;
    const offsetY = (MINI_MAP_HEIGHT - contentHeight * miniScale) / 2;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const viewport = containerRect
      ? {
          x: offsetX + ((-position.x / scale) - minX) * miniScale,
          y: offsetY + ((-position.y / scale) - minY) * miniScale,
          width: (containerRect.width / scale) * miniScale,
          height: (containerRect.height / scale) * miniScale,
        }
      : null;

    return {
      minX,
      minY,
      miniScale,
      offsetX,
      offsetY,
      viewport,
      nodes: positionedNodes.map(pos => ({
        id: pos.node.id,
        x: offsetX + (pos.x - minX) * miniScale,
        y: offsetY + (pos.y - minY) * miniScale,
        width: Math.max(2, pos.width * miniScale),
        height: Math.max(2, pos.height * miniScale),
      })),
    };
  }, [calculateNodePositions, position.x, position.y, scale]);

  const handleMiniMapClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!miniMapData || !containerRef.current) return;

    const miniRect = event.currentTarget.getBoundingClientRect();
    const canvasRect = containerRef.current.getBoundingClientRect();
    const miniX = event.clientX - miniRect.left;
    const miniY = event.clientY - miniRect.top;
    const worldX = miniMapData.minX + (miniX - miniMapData.offsetX) / miniMapData.miniScale;
    const worldY = miniMapData.minY + (miniY - miniMapData.offsetY) / miniMapData.miniScale;

    setPosition({
      x: canvasRect.width / 2 - worldX * scale,
      y: canvasRect.height / 2 - worldY * scale,
    });
  }, [miniMapData, scale]);

  const selectedMastery = selectedNode ? getMasteryView(selectedNode) : null;
  const selectedLegacyNodeId = selectedNode ? getLegacyNodeId(selectedNode.id) : null;

  return (
    <TooltipProvider>
      <div 
        ref={containerRef}
        className={cn(
          "relative h-full w-full overflow-hidden bg-slate-50 select-none shadow-inner dark:from-slate-900 dark:to-slate-800 md:rounded-xl md:border md:border-slate-200/60",
          isDragging ? 'cursor-grabbing' : 'cursor-default'
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-30 flex items-start justify-between gap-3 md:left-4 md:right-4 md:top-4">
          <div className="pointer-events-auto w-full rounded-lg border border-slate-200/80 bg-white/88 p-2 shadow-sm backdrop-blur-md md:max-w-[54rem]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b84a6]" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-md border-slate-200 bg-slate-50/90 pl-8 pr-9 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-[#a49aff] md:text-sm"
                  placeholder="搜索知识点"
                />
                {searchQuery && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#8b84a6] md:text-xs">
                    {searchResults.length}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                {([
                  ['all', null, '全部', nodes.length],
                  ['weak', AlertTriangle, '薄弱', weakCount],
                  ['frequent', Flame, '高频', highFrequencyCount],
                ] as const).map(([value, Icon, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={focusFilterMode === value}
                    onClick={() => {
                      if (value === 'all') {
                        setFocusFilterMode('all');
                        return;
                      }
                      setFocusFilterMode(current => current === value ? 'all' : value);
                    }}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors',
                      focusFilterMode === value
                        ? value === 'weak'
                          ? 'bg-red-50 text-red-700 shadow-sm ring-1 ring-red-200'
                          : value === 'frequent'
                            ? 'bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200'
                            : 'bg-white text-[#5e5394] shadow-sm'
                        : 'text-slate-500 hover:bg-white hover:text-slate-700'
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    <span>{label}</span>
                    <span className={cn(
                      'rounded px-1 text-[10px]',
                      focusFilterMode === value ? 'bg-white/80 text-current' : 'bg-white text-slate-400'
                    )}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
              <select
                value={selectedExamPaper}
                onChange={(event) => setSelectedExamPaper(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50/90 px-2 text-xs text-slate-600 outline-none focus:border-[#a49aff] sm:max-w-[13rem]"
                aria-label="按真题套卷高亮知识点"
              >
                <option value="">全部知识点</option>
                {examPaperOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <Button variant="outline" size="icon" className="hidden h-8 w-8 rounded-md border-slate-200 bg-white text-slate-500 hover:text-[#5e5394] md:inline-flex" onClick={expandAll} aria-label="展开全部">
                <ListTree className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="hidden h-8 w-8 rounded-md border-slate-200 bg-white text-slate-500 hover:text-[#5e5394] md:inline-flex" onClick={collapseToRoots} aria-label="收起到根层级">
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 hidden flex-wrap items-center gap-2 sm:flex">
              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {([
                ['right', ArrowRight, '向右展开'],
                ['left', ArrowLeft, '向左展开'],
                ['both', ArrowLeftRight, '左右展开'],
                ['down', ArrowDown, '向下展开'],
              ] as const).map(([value, Icon, label]) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={layoutDirection === value ? 'default' : 'outline'}
                      size="icon"
                      className={cn(
                        "h-7 w-7 rounded border-0 shadow-none",
                        layoutDirection === value ? "bg-[#a49aff] text-white" : "bg-transparent text-slate-500 hover:bg-white"
                      )}
                      onClick={() => setLayoutDirection(value)}
                      aria-label={label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
              </div>

              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {([
                ['curve', GitBranch, '曲线'],
                ['straight', MinusIcon, '直线'],
                ['elbow', CornerIcon, '折线'],
              ] as const).map(([value, Icon, label]) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={edgeStyle === value ? 'default' : 'outline'}
                      size="icon"
                      className={cn(
                        "h-7 w-7 rounded border-0 shadow-none",
                        edgeStyle === value ? "bg-[#a49aff] text-white" : "bg-transparent text-slate-500 hover:bg-white"
                      )}
                      onClick={() => setEdgeStyle(value)}
                      aria-label={label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
              </div>

              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {[2, 3, 4].map(width => (
                <Tooltip key={width}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={edgeWidth === width ? 'default' : 'outline'}
                      size="icon"
                      className={cn(
                        "h-7 w-7 rounded border-0 shadow-none",
                        edgeWidth === width ? "bg-[#a49aff] text-white" : "bg-transparent text-slate-500 hover:bg-white"
                      )}
                      onClick={() => setEdgeWidth(width)}
                      aria-label={`${width}px`}
                    >
                      <span className="block w-4 rounded-full bg-current" style={{ height: width }} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{width}px</TooltipContent>
                </Tooltip>
              ))}
              </div>

              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {EDGE_COLORS.map(color => (
                <Tooltip key={color}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "h-7 w-7 rounded border border-transparent bg-transparent p-1 hover:bg-white",
                        edgeColor === color && "bg-white ring-1 ring-[#a49aff]"
                      )}
                      onClick={() => setEdgeColor(color)}
                      aria-label={color}
                    >
                      <span className="block h-full w-full rounded" style={{ backgroundColor: color }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{color}</TooltipContent>
                </Tooltip>
              ))}
              </div>
            </div>
            {searchQuery && searchResults.length > 0 && (
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5 md:mt-2 md:pb-1">
                {searchResults.slice(0, 10).map(node => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => focusNode(node)}
                    className={cn(
                      "shrink-0 rounded-md border border-[#eee7ff] bg-[#fbfaff] px-2 py-1 text-xs text-[#5e5394] hover:bg-[#f4efff]",
                      selectedNode?.id === node.id && "border-[#a49aff] bg-[#f4efff] text-[#5e5394]"
                    )}
                  >
                    {node.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {(isLoading || loadError || (!isLoading && nodes.length === 0)) && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-50/90 backdrop-blur-sm">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
              {isLoading ? (
                <>
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-slate-700">正在加载导图</p>
                </>
              ) : loadError ? (
                <>
                  <p className="text-sm font-medium text-red-600">导图加载失败</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-500">{loadError}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">暂无导图数据</p>
                  <p className="mt-1 text-xs text-slate-500">请先在 MindEditor 中创建或导入节点。</p>
                </>
              )}
            </div>
          </div>
        )}
        {/* 鑳屾櫙缃戞牸鐐?*/}
        <div 
          className="absolute inset-0 pointer-events-none transition-all"
          style={{
            backgroundImage: 'radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)',
            backgroundSize: `${24 * scale}px ${24 * scale}px`,
            transform: `translate(${position.x}px, ${position.y}px)`,
          }}
        />

        {/* SVG 杩炵嚎鐢诲竷 */}
        <div className="absolute inset-0 pointer-events-none" style={{ transformOrigin: '0 0' }}>
          <div style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}>
            <svg className="absolute pointer-events-none" style={{ width: '20000px', height: '20000px' }}>
              {generateEdges.map((edge, i) => {
                return (
                  <path 
                    key={i} 
                    d={getEdgePath(edge)} 
                    stroke={edgeColor} 
                    strokeWidth={edgeWidth} 
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none" 
                    className="opacity-70"
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* 节点娓叉煋鏍?*/}
        <div className="absolute inset-0 pointer-events-none" style={{ transformOrigin: '0 0' }}>
          <div style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}>
            {Array.from(calculateNodePositions.values()).map(pos => {
              const { node, x, y, width, height } = pos;
              const c = getMasteryView(node);
              const hasChild = (childCountById.get(node.id) || 0) > 0;
              const expanded = (visibleChildCountById.get(node.id) || 0) > 0;
              const selected = selectedNode?.id === node.id;
              const searchMatched = searchResultIds.has(node.id);
              const legacyNodeId = getLegacyNodeId(node.id);
              const isExamPaperMode = !!selectedExamPaper;
              const examPaperMatched = highlightedNodeIdsByExamPaper.has(node.id) || highlightedNodeIdsByExamPaper.has(legacyNodeId);
              const focusMatched = focusFilterMode !== 'all' && focusTargetIds.has(node.id);
              const isFocusPathOnly = focusFilterMode !== 'all' && !focusMatched;
              const nodeBg = isFocusPathOnly
                ? '#FFFFFF'
                : focusFilterMode === 'frequent' && focusMatched
                  ? '#FFFBEB'
                  : isExamPaperMode
                ? examPaperMatched
                  ? '#FEF3C7'
                  : '#FFFFFF'
                : c.bg;
              const nodeHoverBg = isFocusPathOnly
                ? '#F8FAFC'
                : focusFilterMode === 'frequent' && focusMatched
                  ? '#FEF3C7'
                  : isExamPaperMode
                ? examPaperMatched
                  ? '#FDE68A'
                  : '#F8FAFC'
                : c.hoverBg;
              const nodeBorder = isFocusPathOnly
                ? '#CBD5E1'
                : focusFilterMode === 'frequent' && focusMatched
                  ? '#D97706'
                  : isExamPaperMode
                ? examPaperMatched
                  ? '#D97706'
                  : '#E2E8F0'
                : c.border;

              return (
                <motion.div 
                  key={node.id} 
                  className={cn(
                    "group absolute rounded-xl pointer-events-auto mindmap-node border border-slate-200/80 shadow-sm",
                    "cursor-pointer",
                    selected && "ring-2 ring-blue-500 ring-offset-2",
                    searchMatched && !selected && "ring-2 ring-amber-400 ring-offset-1",
                    c.status === 'weak' && !selected && !isExamPaperMode && "ring-1 ring-red-200",
                    examPaperMatched && !selected && "ring-2 ring-amber-300 ring-offset-1",
                    focusFilterMode === 'weak' && focusMatched && !selected && "ring-2 ring-red-400 ring-offset-2",
                    focusFilterMode === 'frequent' && focusMatched && !selected && "ring-2 ring-amber-400 ring-offset-2",
                    isFocusPathOnly && "opacity-80"
                  )}
                  style={{ 
                    left: x, 
                    top: y, 
                    width, 
                    height, 
                    backgroundColor: selected ? "#EFF6FF" : nodeBg, 
                    borderLeft: `4px solid ${nodeBorder}`,
                  }}
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  whileHover={{ 
                    scale: 1.015,
                    backgroundColor: selected ? "#EFF6FF" : nodeHoverBg,
                    boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.12)'
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 20 }}
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleNodeClick(node); }}
                >
                  <div className="h-full flex flex-col justify-start p-3 overflow-hidden select-none">
                    <div className="flex items-start gap-2 w-full">
                      {hasChild && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                          className="p-0.5 hover:bg-slate-200/50 rounded-md transition-colors flex-shrink-0 mt-0.5"
                        >
                          {expanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </button>
                      )}
                      {!hasChild && <span className="w-4 flex-shrink-0" />}
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: c.dot }} />
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn("font-medium break-words whitespace-normal leading-tight block", isCompactMode ? "text-xs" : "text-[14px]")}
                          style={{ color: c.text }}
                        >
                          {node.name}
                        </span>
                      </div>
                      {!isCompactMode && (
                        <Badge
                          variant="outline"
                          className="ml-auto text-[10px] px-1.5 py-0 flex-shrink-0 mt-0.5"
                          style={{ borderColor: c.border, color: c.text, backgroundColor: c.bg }}
                        >
                          {c.label}
                        </Badge>
                      )}
                      {node.markdown && !isCompactMode && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50/80 text-blue-600 border-blue-200 flex-shrink-0 mt-0.5">
                          <FileText className="w-3 h-3 mr-0.5" />笔记
                        </Badge>
                      )}
                    </div>

                    {isShowDetail && node.content && !isCompactMode && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 pl-6">
                        <p className="text-xs text-slate-500 font-normal leading-relaxed break-words line-clamp-3">
                          {node.content}
                        </p>
                      </motion.div>
                    )}

                    {isShowDetail && node.markdown && !showNotebook && !isCompactMode && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 pl-6 overflow-hidden">
                        <div className="text-[11px] text-slate-400 bg-slate-100/70 dark:bg-slate-800/50 rounded-lg p-2 max-h-12 overflow-hidden border border-slate-200/30">
                          {node.markdown.substring(0, 60) + (node.markdown.length > 60 ? '...' : '')}
                        </div>
                      </motion.div>
                    )}
                    {isShowDetail && !isCompactMode && c.questionCount > 0 && (
                      <div className="mt-auto flex items-center justify-between gap-2 pl-6 pt-2 text-[11px]" style={{ color: c.text }}>
                        <span>{c.questionCount} 题</span>
                        <span>{c.effectivePS === null ? 'PS -' : `PS ${c.effectivePS}`}</span>
                      </div>
                    )}
                  </div>
                  {onTargetedPractice && c.questionCount > 0 && (
                    <button
                      type="button"
                      aria-label="进入节点练习"
                      className="absolute bottom-1.5 left-2 h-6 w-6 rounded-md bg-white/85 text-slate-500 opacity-0 shadow-sm transition-opacity hover:text-blue-600 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTargetedPractice(legacyNodeId);
                      }}
                    >
                      <Target className="mx-auto h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="调整节点大小"
                    className={cn(
                      "absolute bottom-0 right-0 h-7 w-7 cursor-nwse-resize rounded-br-xl rounded-tl-md opacity-0 transition-opacity",
                      "bg-white/80 hover:bg-blue-50 group-hover:opacity-100",
                      (selected || resizeState?.nodeId === node.id) && "opacity-100"
                    )}
                    onMouseDown={(e) => startResize(e, pos)}
                  >
                    <span className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-slate-400" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 左上角浮动控制台 */}
        <div className="absolute top-28 left-4 flex flex-col gap-1.5 z-20">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={handleZoomIn} className="w-9 h-9 bg-white/90 border border-slate-200 shadow-sm hover:bg-white rounded-lg">
                <ZoomIn className="w-4 h-4 text-slate-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">放大视图</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={handleZoomOut} className="w-9 h-9 bg-white/90 border border-slate-200 shadow-sm hover:bg-white rounded-lg">
                <ZoomOut className="w-4 h-4 text-slate-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">缩小视图</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={handleFitView} className="w-9 h-9 bg-white/90 border border-slate-200 shadow-sm hover:bg-white rounded-lg">
                <Maximize2 className="w-4 h-4 text-slate-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">还原视图</TooltipContent>
          </Tooltip>
        </div>
        <div className="absolute bottom-4 left-4 z-20 hidden items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm backdrop-blur-sm dark:bg-slate-800/90 sm:flex">
          <span>缩放: {Math.round(scale * 100)}%</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>{isCompactMode ? '紧凑模式' : isShowDetail ? '详细预览' : '标准模式'}</span>
        </div>

        {miniMapData && (
          <div className="absolute bottom-4 right-4 z-20 hidden overflow-hidden rounded-lg border border-slate-200/80 bg-white/95 shadow-sm backdrop-blur md:block">
            <button
              type="button"
              className="block cursor-crosshair"
              style={{ width: MINI_MAP_WIDTH, height: MINI_MAP_HEIGHT }}
              onClick={handleMiniMapClick}
              aria-label="小地图导航"
            >
              <div className="relative h-full w-full bg-slate-50">
                {miniMapData.nodes.map(node => (
                  <span
                    key={node.id}
                    className={cn(
                      "absolute rounded-[2px] bg-slate-300",
                      selectedNode?.id === node.id && "bg-blue-500",
                      searchResultIds.has(node.id) && "bg-amber-400"
                    )}
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                    }}
                  />
                ))}
                {miniMapData.viewport && (
                  <span
                    className="absolute rounded border-2 border-blue-500/80 bg-blue-500/10"
                    style={{
                      left: miniMapData.viewport.x,
                      top: miniMapData.viewport.y,
                      width: miniMapData.viewport.width,
                      height: miniMapData.viewport.height,
                    }}
                  />
                )}
                <span className="absolute left-2 top-1.5 text-[10px] font-medium text-slate-500">导航</span>
              </div>
            </button>
          </div>
        )}

        {/* 侧面 Markdown 笔记面板 */}
        <AnimatePresence>
          {selectedNode && showNotebook && selectedNode.markdown && (
            <motion.div
              className="absolute inset-x-2 bottom-2 top-12 z-30 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:bg-slate-900 md:inset-4 md:rounded-2xl"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between border-b bg-slate-50/80 p-3 backdrop-blur sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">{selectedNode.name}</h3>
                    <p className="text-xs text-slate-400">结构知识专属笔记</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full w-8 h-8" onClick={() => { setShowNotebook(false); setSelectedNode(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 bg-white p-4 dark:bg-slate-900 sm:p-6">
                <MarkdownNote className="dark:prose-invert">{selectedNode.markdown}</MarkdownNote>
              </ScrollArea>
              {selectedNode.content && (
                <div className="border-t bg-slate-50/50 p-3 dark:bg-slate-800/30 sm:p-4">
                  <h4 className="text-xs font-semibold text-slate-400 mb-1">内容核心摘要</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{selectedNode.content}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 节点详情面板 */}
        <AnimatePresence>
          {selectedNode && !showNotebook && (
            <motion.div 
              className="absolute inset-x-2 bottom-2 top-auto z-30 flex max-h-[52%] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md dark:bg-slate-900/95 md:bottom-4 md:left-auto md:right-4 md:top-4 md:max-h-none md:w-80"
              initial={{ opacity: 0, x: 40 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <div className="flex items-center justify-between border-b bg-slate-50/50 p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedMastery?.dot || (COLOR_MAP[selectedNode.node_type] || COLOR_MAP.topic).dot }} />
                  <span className="font-semibold text-sm text-slate-800 truncate max-w-[200px]">{selectedNode.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="w-7 h-7 rounded-full" onClick={() => setSelectedNode(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 p-4">
                {selectedMastery && (
                  <div className="mb-4 rounded-xl border p-3" style={{ borderColor: selectedMastery.border, backgroundColor: selectedMastery.bg }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge variant="outline" style={{ borderColor: selectedMastery.border, color: selectedMastery.text, backgroundColor: '#FFFFFFCC' }}>
                        {selectedMastery.label}
                      </Badge>
                      <span className="text-xs font-medium" style={{ color: selectedMastery.text }}>
                        {formatLastPractice(selectedMastery.lastPracticedAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-white/75 px-2 py-2">
                        <div className="font-semibold text-slate-800">{selectedMastery.effectivePS ?? '-'}</div>
                        <div className="mt-0.5 text-slate-500">PS</div>
                      </div>
                      <div className="rounded-lg bg-white/75 px-2 py-2">
                        <div className="font-semibold text-slate-800">{selectedMastery.questionCount}</div>
                        <div className="mt-0.5 text-slate-500">题目</div>
                      </div>
                      <div className="rounded-lg bg-white/75 px-2 py-2">
                        <div className="font-semibold text-slate-800">{selectedMastery.wrongCount}</div>
                        <div className="mt-0.5 text-slate-500">错题</div>
                      </div>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      disabled={!onTargetedPractice || !selectedLegacyNodeId || selectedMastery.questionCount === 0}
                      onClick={() => selectedLegacyNodeId && onTargetedPractice?.(selectedLegacyNodeId)}
                    >
                      <Target className="mr-1.5 h-4 w-4" />
                      节点练习
                    </Button>
                  </div>
                )}
                {selectedNode.content && (
                  <div className="mb-4 bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                    <h4 className="text-[11px] font-bold tracking-wide text-slate-400 uppercase mb-1.5">详细核心概念</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed break-all">{selectedNode.content}</p>
                  </div>
                )}
                {selectedNode.markdown && (
                  <div className="mb-4">
                    <h4 className="text-[11px] font-bold tracking-wide text-slate-400 uppercase mb-1.5">相关笔记</h4>
                    <div className="bg-amber-50/30 dark:bg-slate-800 border border-amber-100/50 p-3 rounded-xl text-xs text-slate-700 dark:text-slate-300">
                      <MarkdownNote>{selectedNode.markdown}</MarkdownNote>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-[11px] font-bold tracking-wide text-slate-400 uppercase mb-1.5">知识层级结构</h4>
                  <Badge variant="outline" className="text-xs font-normal" style={{ borderColor: (COLOR_MAP[selectedNode.node_type] || COLOR_MAP.topic).border, color: (COLOR_MAP[selectedNode.node_type] || COLOR_MAP.topic).text }}>
                    {selectedNode.node_type}
                  </Badge>
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
