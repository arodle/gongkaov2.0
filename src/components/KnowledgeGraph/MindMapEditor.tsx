'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import type { KnowledgeNodeRecord, QuestionBankItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  Edit3,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronRightIcon,
  Search,
  Pin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Download,
  Upload,
  Folder,
  FolderOpen,
  Eye,
  EyeOff,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  GripVertical,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MindMapEditorProps {
  className?: string;
}

interface NodeTreeItemProps {
  node: KnowledgeNodeRecord;
  children: KnowledgeNodeRecord[];
  allNodes: KnowledgeNodeRecord[];
  level: number;
  expandedNodes: Set<string>;
  isPinned: boolean;
  onToggleExpand: (nodeId: string) => void;
  onSelect: (node: KnowledgeNodeRecord) => void;
  onEdit: (node: KnowledgeNodeRecord) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onCopy: (node: KnowledgeNodeRecord) => void;
  selectedNodeId?: string;
}

function NodeTreeItem({
  node,
  children,
  allNodes,
  level,
  expandedNodes,
  isPinned,
  onToggleExpand,
  onSelect,
  onEdit,
  onDelete,
  onAddChild,
  onCopy,
  selectedNodeId,
}: NodeTreeItemProps) {
  const hasChildren = children.length > 0;
  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedNodes.has(node.id);
  const { getNodeStats } = useAppStore();
  const stats = getNodeStats(node.id);

  return (
    <div className="select-none">
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group',
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted',
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onSelect(node)}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(node);
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
          className="p-0.5 hover:bg-muted rounded"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>

        <span className={cn(
          'w-2 h-2 rounded-full',
          node.ps_score < 0 ? 'bg-red-500' :
          node.ps_score < 80 ? 'bg-orange-500' :
          node.ps_score < 150 ? 'bg-yellow-500' :
          'bg-cyan-500'
        )} />

        {isPinned && <Pin className="h-3 w-3 text-amber-500" />}

        <span className="flex-1 truncate text-sm font-medium">
          {node.name}
        </span>

        <Badge variant="outline" className="text-[10px] h-5 px-1">
          {node.ps_score}
        </Badge>

        {stats.correct > 0 && (
          <span className="text-[10px] text-green-600 dark:text-green-400">
            +{stats.correct}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onEdit(node)}>
              <Edit3 className="h-4 w-4 mr-2" />
              编辑节点
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddChild(node.id)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              添加子节点
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCopy(node)}>
              <Copy className="h-4 w-4 mr-2" />
              复制节点
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(node.id)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除节点
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children.map((child) => (
              <NodeTreeItem
                key={child.id}
                node={child}
                children={allNodes.filter(n => n.parent_id === child.id)}
                allNodes={allNodes}
                level={level + 1}
                expandedNodes={expandedNodes}
                isPinned={false}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onCopy={onCopy}
                selectedNodeId={selectedNodeId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MindMapEditor({ className }: MindMapEditorProps) {
  const {
    nodes,
    questionBank,
    isInitialized,
    createSafetySnapshot,
    getNodeById,
  } = useAppStore();

  const [selectedNode, setSelectedNode] = useState<KnowledgeNodeRecord | null>(null);
  const [editingNode, setEditingNode] = useState<KnowledgeNodeRecord | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    content: '',
    annotation: '',
  });
  const [addForm, setAddForm] = useState({
    name: '',
    type: 'subknowledge' as 'subject' | 'knowledge' | 'subknowledge' | 'angle',
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [showOnlyWeak, setShowOnlyWeak] = useState(false);

  useEffect(() => {
    if (nodes.length > 0 && expandedNodes.size === 0) {
      const rootNodes = nodes.filter(n => !n.parent_id);
      setExpandedNodes(new Set(rootNodes.map(n => n.id)));
    }
  }, [nodes.length]);

  const filteredNodes = useMemo(() => {
    let result = nodes;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        n => n.name.toLowerCase().includes(query) ||
          n.content?.toLowerCase().includes(query)
      );
    }

    if (showOnlyWeak) {
      result = result.filter(n => n.ps_score < 80);
    }

    return result;
  }, [nodes, searchQuery, showOnlyWeak]);

  const rootNodes = useMemo(() => {
    return filteredNodes.filter(n => !n.parent_id);
  }, [filteredNodes]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = nodes.map(n => n.id);
    setExpandedNodes(new Set(allIds));
  }, [nodes]);

  const collapseAll = useCallback(() => {
    const rootIds = nodes.filter(n => !n.parent_id).map(n => n.id);
    setExpandedNodes(new Set(rootIds));
  }, [nodes]);

  const handleSelectNode = useCallback((node: KnowledgeNodeRecord) => {
    setSelectedNode(node);

    if (node.parent_id && !expandedNodes.has(node.id)) {
      const parentChain: string[] = [];
      let currentId: string | null = node.parent_id;
      while (currentId) {
        parentChain.push(currentId);
        const parent = nodes.find(n => n.id === currentId);
        currentId = parent?.parent_id || null;
      }
      setExpandedNodes(prev => {
        const next = new Set(prev);
        parentChain.forEach(id => next.add(id));
        return next;
      });
    }
  }, [expandedNodes, nodes]);

  const handleEditNode = useCallback((node: KnowledgeNodeRecord) => {
    setEditingNode(node);
    setEditForm({
      name: node.name,
      content: node.content || '',
      annotation: node.annotation || '',
    });
    setShowEditDialog(true);
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setAddParentId(parentId);
    setAddForm({
      name: '',
      type: 'subknowledge',
    });
    setShowAddDialog(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingNode) return;

    try {
      const { db } = await import('@/lib/db/database');
      await db.knowledge_nodes.update(editingNode.id, {
        name: editForm.name,
        content: editForm.content || undefined,
        annotation: editForm.annotation || undefined,
        updated_at: new Date().toISOString(),
      });

      await useAppStore.getState().initialize();
      setShowEditDialog(false);
      setEditingNode(null);
    } catch (error) {
      console.error('Failed to update node:', error);
    }
  }, [editingNode, editForm]);

  const handleSaveAdd = useCallback(async () => {
    if (!addForm.name.trim()) return;

    try {
      const { db, CURRENT_USER_ID } = await import('@/lib/db/database');
      const parentNode = addParentId ? nodes.find(n => n.id === addParentId) : null;

      const newNode: KnowledgeNodeRecord = {
        id: `${addForm.type}_${Date.now()}`,
        user_id: CURRENT_USER_ID,
        name: addForm.name,
        parent_id: addParentId,
        pos_x: parentNode ? parentNode.pos_x + 200 : 0,
        pos_y: parentNode ? parentNode.pos_y + 100 : 0,
        ps_score: 50,
        last_practiced_at: null,
        color_tag: 'default',
        node_type: addForm.type,
        updated_at: new Date().toISOString(),
      };

      await db.knowledge_nodes.add(newNode);

      await createSafetySnapshot('添加节点');

      if (addParentId) {
        setExpandedNodes(prev => new Set([...prev, addParentId]));
      }

      await useAppStore.getState().initialize();
      setShowAddDialog(false);
      setAddParentId(null);
    } catch (error) {
      console.error('Failed to add node:', error);
    }
  }, [addForm, addParentId, nodes, createSafetySnapshot]);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (!confirm('确定要删除这个节点吗？子节点也会被删除。')) return;

    try {
      await createSafetySnapshot('删除节点');

      const { db } = await import('@/lib/db/database');
      const toDelete = new Set<string>();

      const collectChildren = (id: string) => {
        toDelete.add(id);
        nodes.filter(n => n.parent_id === id).forEach(n => collectChildren(n.id));
      };
      collectChildren(nodeId);

      await db.knowledge_nodes.bulkDelete(Array.from(toDelete));
      await useAppStore.getState().initialize();

      if (selectedNode && toDelete.has(selectedNode.id)) {
        setSelectedNode(null);
      }
    } catch (error) {
      console.error('Failed to delete node:', error);
    }
  }, [nodes, selectedNode, createSafetySnapshot]);

  const handleCopyNode = useCallback(async (node: KnowledgeNodeRecord) => {
    setAddForm({
      name: `${node.name} (副本)`,
      type: node.node_type as any,
    });
    setAddParentId(node.parent_id);
    setShowAddDialog(true);
  }, []);

  const nodeQuestions = useMemo(() => {
    if (!selectedNode) return [];
    return questionBank.filter(q => q.linkedAngleId === selectedNode.id);
  }, [selectedNode, questionBank]);

  const getNodePath = useCallback((nodeId: string): string => {
    const parts: string[] = [];
    let current: KnowledgeNodeRecord | undefined = nodes.find(n => n.id === nodeId);

    while (current) {
      parts.unshift(current.name);
      current = current.parent_id ? nodes.find(n => n.id === current!.parent_id) : undefined;
    }

    return parts.join(' / ');
  }, [nodes]);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin">
          <RefreshCw className="h-6 w-6" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full', className)}>
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-r bg-background flex flex-col"
          >
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索节点..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowOnlyWeak(!showOnlyWeak)}
                  className={cn(showOnlyWeak && 'bg-red-100 text-red-600')}
                >
                  {showOnlyWeak ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={expandAll}>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  展开
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={collapseAll}>
                  <ChevronRight className="h-3 w-3 mr-1" />
                  折叠
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleAddChild(null!)}>
                  <FolderPlus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2">
                {rootNodes.map((node) => (
                  <NodeTreeItem
                    key={node.id}
                    node={node}
                    children={nodes.filter(n => n.parent_id === node.id)}
                    allNodes={nodes}
                    level={0}
                    expandedNodes={expandedNodes}
                    isPinned={pinnedNodes.has(node.id)}
                    onToggleExpand={toggleExpand}
                    onSelect={handleSelectNode}
                    onEdit={handleEditNode}
                    onDelete={handleDeleteNode}
                    onAddChild={handleAddChild}
                    onCopy={handleCopyNode}
                    selectedNodeId={selectedNode?.id}
                  />
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            <span className="text-sm font-medium">
              {selectedNode ? getNodePath(selectedNode.id) : '选择节点查看详情'}
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            {selectedNode ? (
              <div className="max-w-3xl mx-auto space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-xl">{selectedNode.name}</CardTitle>
                        <Badge variant="outline">{selectedNode.node_type}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditNode(selectedNode)}
                        >
                          <Edit3 className="h-4 w-4 mr-1" />
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddChild(selectedNode.id)}
                        >
                          <FolderPlus className="h-4 w-4 mr-1" />
                          添加子节点
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedNode.content && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">内容</h4>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{selectedNode.content}</p>
                      </div>
                    )}

                    {selectedNode.annotation && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">学习笔记</h4>
                        </div>
                        <p className="text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap break-words">{selectedNode.annotation}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-4">
                      <div className="p-3 rounded-lg bg-muted text-center">
                        <div className="text-2xl font-bold">{selectedNode.ps_score}</div>
                        <div className="text-xs text-muted-foreground">PS分数</div>
                      </div>
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {useAppStore.getState().getNodeStats(selectedNode.id).correct}
                        </div>
                        <div className="text-xs text-green-600/70">正确次数</div>
                      </div>
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {useAppStore.getState().getNodeStats(selectedNode.id).wrong}
                        </div>
                        <div className="text-xs text-red-600/70">错误次数</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted text-center">
                        <div className="text-2xl font-bold text-muted-foreground">
                          {nodes.filter(n => n.parent_id === selectedNode.id).length}
                        </div>
                        <div className="text-xs text-muted-foreground">子节点数</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {nodeQuestions.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        相关题目 ({nodeQuestions.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {nodeQuestions.slice(0, 5).map((q) => (
                          <div
                            key={q.id}
                            className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                          >
                            <p className="text-sm line-clamp-2">{q.content}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {(q.knowledgePath || '').split('/').pop()}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Folder className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">选择节点</h3>
                <p className="text-sm text-muted-foreground">
                  点击左侧列表中的节点，查看详情
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑节点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">节点名称</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入节点名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">内容说明</label>
              <Textarea
                value={editForm.content}
                onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="输入内容说明（可选）"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">学习笔记</label>
              <Textarea
                value={editForm.annotation}
                onChange={(e) => setEditForm(prev => ({ ...prev, annotation: e.target.value }))}
                placeholder="输入学习笔记（可选）"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加{addParentId ? '子' : ''}节点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">节点名称</label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入节点名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">节点类型</label>
              <div className="flex gap-2">
                {(['subject', 'knowledge', 'subknowledge', 'angle'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={addForm.type === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAddForm(prev => ({ ...prev, type }))}
                  >
                    {type === 'subject' ? '科目' :
                     type === 'knowledge' ? '知识' :
                     type === 'subknowledge' ? '子知识' : '角度'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveAdd}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function useMindMapEditor() {
  const { nodes, updateNodePSScore, addAnswer, questionBank } = useAppStore();

  const getNodeQuestions = useCallback((nodeId: string): QuestionBankItem[] => {
    return questionBank.filter(q => q.linkedAngleId === nodeId);
  }, [questionBank]);

  const practiceNode = useCallback(async (nodeId: string, questionId: string, isCorrect: boolean) => {
    addAnswer({
      questionId,
      practiceSetId: `mindmap_${nodeId}`,
      selectedAnswer: '',
      isCorrect,
      timestamp: Date.now(),
      linkedAngleId: nodeId,
      source: 'mindmap',
    });

    await updateNodePSScore(nodeId, isCorrect);
  }, [addAnswer, updateNodePSScore]);

  return {
    getNodeQuestions,
    practiceNode,
  };
}
