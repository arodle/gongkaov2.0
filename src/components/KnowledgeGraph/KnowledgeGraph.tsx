'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Graph, type GraphData, type NodeData, type EdgeData } from '@antv/g6';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import { getPSColor, getPSColorWithFocus } from '@/lib/utils/colors';
import type { KnowledgeNodeRecord } from '@/types';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Target,
  Eye,
  EyeOff,
  RefreshCw,
  Info,
  X,
  List,
  BookOpen,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface FlyingDot {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  targetNodeId: string;
}

interface WrongAnswerListProps {
  nodeId: string;
  onClose: () => void;
}

interface GraphNodeData {
  label: string;
  psScore: number;
  nodeType: string;
  color: string;
  borderColor: string;
  textColor: string;
  pulse: boolean;
  opacity: number;
  stats: { correct: number; wrong: number };
  wrongCount: number;
  hasAnswered: boolean;
}

const SIZE_MAP: Record<string, number> = {
  subject: 60,
  knowledge: 50,
  subknowledge: 40,
  example: 35,
};

const GLASS_STYLE = 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-lg';

function WrongAnswerList({ nodeId, onClose }: WrongAnswerListProps) {
  const { getWrongAnswersByNodeId, questionBank, getNodeById } = useAppStore();
  const wrongAnswers = getWrongAnswersByNodeId(nodeId);
  const node = getNodeById(nodeId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute right-4 top-4 bottom-4 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border overflow-hidden flex flex-col z-50"
    >
      <div className="p-4 border-b flex items-center justify-between bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <List className="h-5 w-5 text-slate-500" />
          <span className="font-semibold">{node?.name} - 错题列表</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭错题列表">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {wrongAnswers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>暂无错题记录</p>
            </div>
          ) : (
            wrongAnswers.map((record) => {
              const question = questionBank.find(q => q.id === record.question_id);
              return (
                <div key={record.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border">
                  <p className="text-sm mb-2 line-clamp-3">{question?.content || '题目已删除'}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(record.updated_at).toLocaleDateString()}</span>
                    <span>{Math.floor(record.answer_time / 1000)}s</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}

function WrongQuestionList({ angleId, angleName }: { angleId: string; angleName: string }) {
  const { questionBank, practiceRecords } = useAppStore();

  const wrongQuestions = useMemo(() => {
    const wrongQIds = new Set<string>();
    practiceRecords.forEach(record => {
      if (!record.is_correct) {
        wrongQIds.add(record.question_id);
      }
    });
    return questionBank.filter(q => q.linkedAngleId === angleId && wrongQIds.has(q.id));
  }, [practiceRecords, questionBank, angleId]);

  if (wrongQuestions.length === 0) {
    return <p className="text-xs text-gray-500">暂无错题记录</p>;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
        <X className="h-3.5 w-3.5" />
        「{angleName}」错题列表
      </h4>
      {wrongQuestions.map((q, idx) => (
        <div key={q.id} className="p-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 space-y-1.5">
          <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 whitespace-pre-line">
            {idx + 1}. {q.content}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {q.options.map((opt) => (
              <div
                key={opt.label}
                className={cn(
                  'text-[10px] px-1.5 py-1 rounded',
                  opt.label === q.correctAnswer
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 font-medium'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500',
                )}
              >
                {opt.label}. {opt.text}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500">正确答案：<span className="text-green-600 font-medium">{q.correctAnswer}</span></p>
          {q.explanation && (
            <p className="text-[10px] text-gray-400 italic">{q.explanation}</p>
          )}
        </div>
      ))}
    </div>
  );
}

interface KnowledgeGraphProps {
  onNodeSelect?: (node: KnowledgeNodeRecord) => void;
  onTargetedPractice?: (nodeId: string) => void;
  autoShowWrongAnswer?: boolean;
}

export function KnowledgeGraph({ onNodeSelect, onTargetedPractice, autoShowWrongAnswer = false }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodesRef = useRef<KnowledgeNodeRecord[]>([]);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNodeRecord | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [flyingDots, setFlyingDots] = useState<FlyingDot[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [showWrongAnswerList, setShowWrongAnswerList] = useState<string | null>(null);

  const { nodes, isInitialized, updateNodePSScore, getNodeStats, getWrongAnswersByNodeId, psHistory, practiceRecords } = useAppStore();

  nodesRef.current = nodes;

  const nodeStatsCache = useMemo(() => {
    const cache = new Map<string, { correct: number; wrong: number; wrongCount: number; hasAnswered: boolean }>();
    
    nodes.forEach(node => {
      const stats = getNodeStats(node.id);
      const wrongCount = getWrongAnswersByNodeId(node.id).length;
      const hasAnswered = practiceRecords.some(r => r.source_node_ids.includes(node.id));
      cache.set(node.id, { ...stats, wrongCount, hasAnswered });
    });
    
    return cache;
  }, [nodes, getNodeStats, getWrongAnswersByNodeId, practiceRecords]);

  const getNodeWrongCount = useCallback((nodeId: string): number => {
    return nodeStatsCache.get(nodeId)?.wrongCount ?? 0;
  }, [nodeStatsCache]);

  const hasNodeAnswered = useCallback((nodeId: string): boolean => {
    return nodeStatsCache.get(nodeId)?.hasAnswered ?? false;
  }, [nodeStatsCache]);

  const getNodeStatsData = useCallback((nodeId: string) => {
    return nodeStatsCache.get(nodeId) ?? { correct: 0, wrong: 0, wrongCount: 0, hasAnswered: false };
  }, [nodeStatsCache]);

  const graphData = useMemo((): GraphData => {
    if (!nodes.length) return { nodes: [], edges: [] };

    const graphNodes: any[] = nodes.map(node => {
      const cachedStats = nodeStatsCache.get(node.id);
      const hasAnswered = cachedStats?.hasAnswered ?? false;
      const wrongCount = cachedStats?.wrongCount ?? 0;
      const colorConfig = focusMode
        ? getPSColorWithFocus(node.ps_score, focusMode, hasAnswered)
        : getPSColor(node.ps_score, hasAnswered);

      return {
        id: node.id,
        data: {
          label: node.name,
          psScore: node.ps_score,
          nodeType: node.node_type,
          color: colorConfig.background,
          borderColor: colorConfig.border,
          textColor: colorConfig.text,
          pulse: colorConfig.pulse,
          opacity: colorConfig.opacity,
          stats: { correct: cachedStats?.correct ?? 0, wrong: cachedStats?.wrong ?? 0 },
          wrongCount,
          hasAnswered,
        },
      };
    });

    const graphEdges: EdgeData[] = nodes
      .filter(node => node.parent_id !== null)
      .map(node => ({
        id: `${node.parent_id}-${node.id}`,
        source: node.parent_id!,
        target: node.id,
        data: {
          stroke: '#94a3b8',
          lineWidth: 1,
        },
      }));

    return { nodes: graphNodes, edges: graphEdges };
  }, [nodes, focusMode, nodeStatsCache]);

  const structureChanged = useMemo(() => {
    return nodes.length > 0;
  }, [nodes.length]);

  useEffect(() => {
    if (!containerRef.current || !isInitialized || nodes.length === 0) return;

    let mounted = true;
    let isInitializing = false;

    const initGraph = async () => {
      if (isInitializing) return;
      isInitializing = true;

      try {
        const { Graph } = await import('@antv/g6');

        if (!mounted || !containerRef.current) return;

        try {
          if (graphRef.current) {
            graphRef.current.destroy();
            graphRef.current = null;
          }
        } catch (e) {
          console.warn('Failed to destroy previous graph:', e);
        }

        const graph = new Graph({
          container: containerRef.current,
          data: graphData,
          node: {
            style: {
              size: (d: any) => {
                const type = d.data?.nodeType;
                return SIZE_MAP[type] ?? 32;
              },
              fill: (d: any) => d.data?.color || '#3b82f6',
              stroke: (d: any) => d.data?.borderColor || '#2563eb',
              lineWidth: 2,
              radius: 8,
              labelText: (d: any) => d.data?.label || '',
              labelFill: (d: any) => d.data?.textColor || '#ffffff',
              labelFontSize: 11,
              labelFontWeight: 600,
              labelMaxWidth: 100,
              labelWordWrap: true,
              opacity: (d: any) => d.data?.opacity ?? 1,
              shadowColor: 'rgba(0,0,0,0.2)',
              shadowBlur: 8,
              shadowOffsetY: 2,
            },
            state: {
              hover: {
                lineWidth: 3,
                shadowBlur: 12,
              },
              selected: {
                lineWidth: 4,
                shadowBlur: 16,
                shadowColor: '#fbbf24',
              },
            },
          },
          edge: {
            style: {
              stroke: '#94a3b8',
              lineWidth: 1.5,
            },
          },
          layout: {
            type: 'dagre',
            rankdir: 'LR',
            nodesep: 40,
            ranksep: 90,
          },
          behaviors: ['drag-canvas', 'zoom-canvas'],
          autoFit: 'view',
          padding: 60,
        });

        graph.on('node:click', (event: any) => {
          const nodeId = (event as any)?.target?.id;
          if (!nodeId) return;

          const latestNodes = nodesRef.current;
          const node = latestNodes.find(n => n.id === nodeId);
          if (node) {
            setSelectedNode(node);
            onNodeSelect?.(node);
          }
        });

        graphRef.current = graph;
        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize graph:', error);
      } finally {
        isInitializing = false;
      }
    };

    initGraph();

    return () => {
      mounted = false;
      try {
        if (graphRef.current) {
          graphRef.current.destroy();
          graphRef.current = null;
        }
      } catch (e) {
        console.warn('Failed to destroy graph on cleanup:', e);
      }
    };
  }, [isInitialized, nodes.length]);

  useEffect(() => {
    if (graphRef.current && isReady) {
      try {
        if (structureChanged) {
          graphRef.current.setData(graphData);
          graphRef.current.render();
        } else {
          const nodeData = graphData.nodes;
          if (nodeData && nodeData.length > 0) {
            graphRef.current.updateNodeData(
              nodeData.map(n => ({ id: n.id, data: n.data }))
            );
            graphRef.current.draw();
          }
        }
      } catch (error) {
        console.error('Failed to update graph:', error);
      }
    }
  }, [graphData, isReady, structureChanged]);

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const zoom = graphRef.current.getZoom();
      graphRef.current.zoomTo(zoom * 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const zoom = graphRef.current.getZoom();
      graphRef.current.zoomTo(zoom / 1.2);
    }
  }, []);

  const handleFitView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.fitView();
    }
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  const triggerFlyingDot = useCallback((targetNodeId: string) => {
    if (!graphRef.current || !containerRef.current) return;

    try {
      const viewportCenter = graphRef.current.getViewportCenter() as any;
      const nodeModel = (graphRef.current as any).getElementModel(targetNodeId);
      
      if (!nodeModel) return;

      const endPoint = (graphRef.current as any).getCanvasByClient({
        x: (viewportCenter as any).x + ((nodeModel as any).style?.x ?? 0) * (graphRef.current as any).getZoom(),
        y: (viewportCenter as any).y + ((nodeModel as any).style?.y ?? 0) * (graphRef.current as any).getZoom(),
      });

      const rect = containerRef.current.getBoundingClientRect();
      
      const dot: FlyingDot = {
        id: `dot-${Date.now()}`,
        startX: rect.width / 2,
        startY: rect.height / 2,
        endX: (viewportCenter as any).x,
        endY: (viewportCenter as any).y,
        targetNodeId,
      };

      setFlyingDots(prev => [...prev, dot]);

      setTimeout(() => {
        setFlyingDots(prev => prev.filter(d => d.id !== dot.id));
      }, 1000);
    } catch (error) {
      console.warn('Failed to trigger flying dot:', error);
    }
  }, []);

  const weakNodes = useMemo(() => {
    return nodes.filter(n => n.ps_score < 80);
  }, [nodes]);

  const handleTargetedPractice = useCallback(() => {
    if (selectedNode) {
      onTargetedPractice?.(selectedNode.id);
    }
  }, [selectedNode, onTargetedPractice]);

  const handleViewHistory = useCallback(() => {
    if (selectedNode) {
      setShowWrongAnswerList(selectedNode.id);
      setSelectedNode(null);
    }
  }, [selectedNode]);

  const selectedNodeStats = useMemo(() => {
    if (!selectedNode) return null;
    return getNodeStatsData(selectedNode.id);
  }, [selectedNode, getNodeStatsData]);

  return (
    <TooltipProvider>
    <div className="relative w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      <AnimatePresence>
        {flyingDots.map(dot => (
          <FlyingDotAnimation
            key={dot.id}
            startX={dot.startX}
            startY={dot.startY}
            endX={dot.endX}
            endY={dot.endY}
            onComplete={() => {
              setFlyingDots(prev => prev.filter(d => d.id !== dot.id));
              if (graphRef.current) {
                try {
                  graphRef.current.setElementState(dot.targetNodeId, ['selected']);
                  setTimeout(() => {
                    graphRef.current?.setElementState(dot.targetNodeId, []);
                  }, 500);
                } catch (e) {
                  console.warn('Failed to set element state:', e);
                }
              }
            }}
          />
        ))}
      </AnimatePresence>

      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              onClick={handleZoomIn}
              className={GLASS_STYLE}
              aria-label="放大"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>放大</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              onClick={handleZoomOut}
              className={GLASS_STYLE}
              aria-label="缩小"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>缩小</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              onClick={handleFitView}
              className={GLASS_STYLE}
              aria-label="适应视图"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>适应视图</TooltipContent>
        </Tooltip>
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={focusMode ? 'default' : 'secondary'}
              onClick={toggleFocusMode}
              className={cn('shadow-lg', focusMode && 'bg-amber-500 hover:bg-amber-600')}
              aria-label={focusMode ? '退出焦点模式' : '进入焦点模式'}
            >
              {focusMode ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{focusMode ? '退出焦点模式' : '进入焦点模式'}</TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className={cn(GLASS_STYLE, 'relative')}
              aria-label="查看薄弱知识点"
            >
              <Target className="h-4 w-4" />
              {weakNodes.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {weakNodes.length > 9 ? '9+' : weakNodes.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">薄弱知识点</h4>
              <p className="text-xs text-muted-foreground">
                共 {weakNodes.length} 个知识点掌握度不足
              </p>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {weakNodes.slice(0, 10).map(node => (
                    <button
                      key={node.id}
                      onClick={() => {
                        setSelectedNode(node);
                        if (graphRef.current) {
                          try {
                            graphRef.current.focusElement(node.id);
                          } catch (e) {
                            console.warn('Failed to focus element:', e);
                          }
                        }
                      }}
                      className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                    >
                      <span className="font-medium">{node.name}</span>
                      <Badge variant="destructive" className="ml-2 text-[10px]">
                        PS: {node.ps_score}
                      </Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className={cn('absolute bottom-4 left-4 flex items-center gap-4 rounded-lg px-4 py-2 z-10', GLASS_STYLE)}>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#e5e7eb]" />
          <span className="text-xs text-muted-foreground">未作答</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#DC2626]" />
          <span className="text-xs text-muted-foreground">薄弱</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#EA580C]" />
          <span className="text-xs text-muted-foreground">需加强</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#CA8A04]" />
          <span className="text-xs text-muted-foreground">学习中</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#0891B2]" />
          <span className="text-xs text-muted-foreground">熟练</span>
        </div>
      </div>

      {selectedNode && (
        <Sheet open={!!selectedNode} onOpenChange={(open) => !open && setSelectedNode(null)}>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 relative">
                <span>{selectedNode.name}</span>
                <Badge
                  variant="outline"
                  style={{
                    backgroundColor: getPSColor(selectedNode.ps_score, hasNodeAnswered(selectedNode.id)).background,
                    color: getPSColor(selectedNode.ps_score, hasNodeAnswered(selectedNode.id)).text,
                  }}
                >
                  PS: {selectedNode.ps_score}
                </Badge>
                {selectedNode.node_type === 'angle' && getNodeWrongCount(selectedNode.id) > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 min-w-[20px] text-[10px] px-1 cursor-pointer hover:scale-110 transition-transform"
                      >
                        {getNodeWrongCount(selectedNode.id)}
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] max-h-[300px] overflow-auto p-3" side="right" align="start">
                      <WrongAnswerList nodeId={selectedNode.id} onClose={() => setShowWrongAnswerList(selectedNode.id)} />
                    </PopoverContent>
                  </Popover>
                )}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">掌握进度</h4>
                <Progress
                  value={(selectedNode.ps_score / 200) * 100}
                  className="h-2"
                  style={{
                    '--progress-foreground': getPSColor(selectedNode.ps_score, hasNodeAnswered(selectedNode.id)).background,
                  } as React.CSSProperties}
                />
                <p className="text-xs text-muted-foreground">
                  {!hasNodeAnswered(selectedNode.id)
                    ? '未作答，点击开始练习'
                    : selectedNode.ps_score < 80
                    ? '需要加强练习'
                    : selectedNode.ps_score < 150
                    ? '持续练习中'
                    : '已熟练掌握'}
                </p>
              </div>

              {selectedNode.content && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">知识点说明</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedNode.content}
                  </p>
                </div>
              )}

              {selectedNode.annotation && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">学习笔记</h4>
                  <p className="text-sm text-amber-600 dark:text-amber-400 italic">
                    {selectedNode.annotation}
                  </p>
                </div>
              )}

              {selectedNodeStats && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {selectedNodeStats.correct}
                    </div>
                    <div className="text-xs text-green-600/70">正确次数</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {selectedNodeStats.wrong}
                    </div>
                    <div className="text-xs text-red-600/70">错误次数</div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-medium">操作</h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleTargetedPractice}
                    aria-label="开始靶向练习"
                  >
                    <Target className="h-4 w-4 mr-2" />
                    靶向练习
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewHistory}
                    aria-label="查看错题列表"
                  >
                    <List className="h-4 w-4 mr-2" />
                    查看错题
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AnimatePresence>
        {showWrongAnswerList && typeof showWrongAnswerList === 'string' && (
          <WrongAnswerList
            nodeId={showWrongAnswerList}
            onClose={() => setShowWrongAnswerList(null)}
          />
        )}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  );
}

interface FlyingDotAnimationProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  onComplete: () => void;
}

function FlyingDotAnimation({ startX, startY, endX, endY, onComplete }: FlyingDotAnimationProps) {
  return (
    <motion.div
      className="absolute w-4 h-4 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-lg pointer-events-none"
      initial={{ x: startX, y: startY, scale: 1, opacity: 1 }}
      animate={{
        x: endX,
        y: endY,
        scale: [1, 1.5, 0.5],
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: 0.8,
        ease: 'easeOut',
      }}
      onAnimationComplete={() => onComplete()}
      style={{
        transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 20px rgba(251, 191, 36, 0.6)',
      }}
    />
  );
}

