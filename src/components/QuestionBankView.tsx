'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import type { KnowledgeNode, QuestionBankItem, QuestionOption } from '@/lib/types';
import { useAppState, getAllAngles } from '@/lib/store';
import { createId } from '@/lib/sample-data';
import { cn } from '@/lib/utils';
import {
  Database,
  Upload,
  Trash2,
  Search,
  BookOpen,
  Brain,
  Target,
  Lightbulb,
  ChevronRight,
  ChevronDown,
  Plus,
  FileJson,
  FileSpreadsheet,
  Filter,
  Download,
  X,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

// Build a path name map: nodeId -> path name like "行测/言语理解与表达/逻辑填空"
function buildPathNameMap(
  node: KnowledgeNode,
  parentPath: string,
  map: Record<string, string>,
) {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  map[node.id] = currentPath;
  for (const child of node.children) {
    buildPathNameMap(child, currentPath, map);
  }
}

// Get all descendant IDs of a node (including itself)
function getDescendantIds(node: KnowledgeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...getDescendantIds(child));
  }
  return ids;
}

// Find a node by ID
function findNodeById(
  root: KnowledgeNode,
  id: string,
): KnowledgeNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

// --- Knowledge Tree Filter ---
function KnowledgeFilter({
  mindMap,
  selectedNodeId,
  onNodeSelect,
  questionCounts,
}: {
  mindMap: KnowledgeNode;
  selectedNodeId: string | null;
  onNodeSelect: (id: string | null) => void;
  questionCounts: Record<string, number>;
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add(mindMap.id);
    // Auto-expand first level
    for (const child of mindMap.children) {
      s.add(child.id);
    }
    return s;
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function renderNode(node: KnowledgeNode, depth: number) {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const count = questionCounts[node.id] || 0;

    const typeIcons: Record<string, React.ElementType> = {
      subject: BookOpen,
      knowledge: Brain,
      subknowledge: Target,
      angle: Lightbulb,
    };
    const Icon = typeIcons[node.type] || BookOpen;

    return (
      <div key={node.id}>
        <button
          type="button"
          className={cn(
            'w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors',
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium ring-1 ring-blue-200'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            onNodeSelect(isSelected ? null : node.id);
            if (node.children.length > 0 && !isExpanded) toggleExpand(node.id);
          }}
        >
          {node.children.length > 0 ? (
            <span
              className="text-gray-400 text-xs w-4 shrink-0 cursor-pointer hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate flex-1">{node.name}</span>
          {count > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] h-5 px-1.5 shrink-0 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-semibold"
            >
              {count}
            </Badge>
          )}
        </button>
        {isExpanded && node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {/* "All" button */}
        <button
          type="button"
          className={cn(
            'w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors',
            selectedNodeId === null
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
          )}
          onClick={() => onNodeSelect(null)}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate flex-1">全部题目</span>
          <Badge
            variant="secondary"
            className="text-[10px] h-5 px-1.5 shrink-0 bg-gray-100 text-gray-600 font-semibold"
          >
            {questionCounts[mindMap.id] || 0}
          </Badge>
        </button>
        {renderNode(mindMap, 0)}
      </div>
    </ScrollArea>
  );
}

// --- Single question detail card ---
function QuestionDetailCard({
  item,
  onDelete,
}: {
  item: QuestionBankItem;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-3 transition-all hover:shadow-sm">
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <button type="button" className="mt-0.5 shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
            {item.content}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] h-5">
              {item.linkedAngleName || item.knowledgePath}
            </Badge>
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] h-5',
                item.source === 'mindmap-inline' && 'bg-purple-50 text-purple-700',
                item.source === 'upload' && 'bg-green-50 text-green-700',
                item.source === 'practice' && 'bg-blue-50 text-blue-700',
                item.source === 'exam' && 'bg-orange-50 text-orange-700',
              )}
            >
              {item.source === 'mindmap-inline' && '导图例题'}
              {item.source === 'upload' && '上传'}
              {item.source === 'practice' && '练习'}
              {item.source === 'exam' && '套卷'}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-red-400 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {item.options.map((opt) => (
              <div
                key={opt.label}
                className={cn(
                  'text-xs px-2 py-1.5 rounded',
                  opt.label === item.correctAnswer
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 font-medium'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500',
                )}
              >
                {opt.label}. {opt.text}
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            正确答案：<span className="text-green-600 font-medium">{item.correctAnswer}</span>
          </div>
          {item.explanation && (
            <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2">
              {item.explanation}
            </div>
          )}
          <div className="text-[10px] text-gray-400">
            路径：{item.knowledgePath} · 添加时间：{item.createdAt}
          </div>
        </div>
      )}
    </Card>
  );
}

// --- CSV Template Download & Upload ---
const CSV_TEMPLATE = `题目内容,选项A,选项B,选项C,选项D,正确答案,解析,知识点路径
这是一道例题的题目内容,选项A的内容,选项B的内容,选项C的内容,选项D的内容,A,这是解析内容,行测/言语理解与表达/片段阅读/主旨概括题
另一道题目内容,选项A,选项B,选项C,选项D,C,解析说明,行测/数量关系/数学运算/行程问题`;

function downloadCsvTemplate() {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '题库导入模板.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvToQuestions(csvText: string, pathNameMap: Record<string, string>): QuestionBankItem[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Skip header row
  const items: QuestionBankItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 6 || !cols[0] || !cols[1] || !cols[2]) continue;

    const content = cols[0];
    const optA = cols[1];
    const optB = cols[2];
    const optC = cols[3] || '';
    const optD = cols[4] || '';
    const correctAnswer = cols[5].toUpperCase();
    const explanation = cols[6] || '';
    const knowledgePath = cols[7] || '';

    const options: QuestionOption[] = [
      { label: 'A', text: optA },
      { label: 'B', text: optB },
    ];
    if (optC) options.push({ label: 'C', text: optC });
    if (optD) options.push({ label: 'D', text: optD });

    // Try to find matching angle by knowledgePath
    let linkedAngleId = '';
    let linkedAngleName = '';
    if (knowledgePath) {
      for (const [nodeId, nodePath] of Object.entries(pathNameMap)) {
        if (nodePath === knowledgePath) {
          // This is a direct match - check if it's an angle node
          const pathParts = nodePath.split('/');
          linkedAngleId = nodeId;
          linkedAngleName = pathParts[pathParts.length - 1];
          break;
        }
      }
      // If no direct match, try to find the deepest matching angle
      if (!linkedAngleId) {
        let bestMatch = '';
        let bestMatchId = '';
        let bestMatchName = '';
        for (const [nodeId, nodePath] of Object.entries(pathNameMap)) {
          if (knowledgePath.startsWith(nodePath) && nodePath.length > bestMatch.length) {
            bestMatch = nodePath;
            bestMatchId = nodeId;
            bestMatchName = nodePath.split('/').pop() || '';
          }
        }
        linkedAngleId = bestMatchId;
        linkedAngleName = bestMatchName;
      }
    }

    items.push({
      id: createId('qb'),
      content,
      options,
      correctAnswer,
      explanation,
      linkedAngleId,
      linkedAngleName,
      knowledgePath,
      source: 'upload' as const,
      createdAt: new Date().toISOString(),
    });
  }
  return items;
}

// --- Add question form ---
function AddQuestionForm({
  mindMap,
  onSubmit,
  onCancel,
}: {
  mindMap: KnowledgeNode;
  onSubmit: (item: QuestionBankItem) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [explanation, setExplanation] = useState('');
  const [selectedAngleId, setSelectedAngleId] = useState('');
  const [selectedAngleName, setSelectedAngleName] = useState('');
  const [knowledgePath, setKnowledgePath] = useState('');

  const angles = useMemo(() => getAllAngles(mindMap), [mindMap]);

  const handleAngleSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setSelectedAngleId(id);
      const angle = angles.find((a) => a.id === id);
      if (angle) {
        setSelectedAngleName(angle.name);
        function findPath(node: KnowledgeNode, target: string, path: string[]): string[] | null {
          if (node.id === target) return [...path, node.name];
          for (const child of node.children) {
            const result = findPath(child, target, [...path, node.name]);
            if (result) return result;
          }
          return null;
        }
        const p = findPath(mindMap, id, []);
        setKnowledgePath(p ? p.join('/') : '');
      }
    },
    [angles, mindMap],
  );

  const handleSubmit = useCallback(() => {
    if (!content || !optionA || !optionB || !selectedAngleId) return;

    const options: QuestionOption[] = [
      { label: 'A', text: optionA },
      { label: 'B', text: optionB },
    ];
    if (optionC) options.push({ label: 'C', text: optionC });
    if (optionD) options.push({ label: 'D', text: optionD });

    onSubmit({
      id: createId(),
      content,
      options,
      correctAnswer,
      explanation,
      linkedAngleId: selectedAngleId,
      linkedAngleName: selectedAngleName,
      knowledgePath,
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
  }, [content, optionA, optionB, optionC, optionD, correctAnswer, explanation, selectedAngleId, selectedAngleName, knowledgePath, onSubmit]);

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">手动添加题目</h3>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">题目内容</label>
        <textarea
          className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 min-h-[60px] resize-y"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入题目内容..."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">选项A</label>
          <Input value={optionA} onChange={(e) => setOptionA(e.target.value)} placeholder="选项A" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">选项B</label>
          <Input value={optionB} onChange={(e) => setOptionB(e.target.value)} placeholder="选项B" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">选项C</label>
          <Input value={optionC} onChange={(e) => setOptionC(e.target.value)} placeholder="可选" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">选项D</label>
          <Input value={optionD} onChange={(e) => setOptionD(e.target.value)} placeholder="可选" />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1 block">正确答案</label>
          <select
            className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
        <div className="flex-[2]">
          <label className="text-xs text-gray-500 mb-1 block">关联考点</label>
          <select
            className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
            value={selectedAngleId}
            onChange={handleAngleSelect}
          >
            <option value="">选择考点...</option>
            {angles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">解析</label>
        <textarea
          className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 min-h-[40px] resize-y"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="输入题目解析..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          size="sm"
          disabled={!content || !optionA || !optionB || !selectedAngleId}
          onClick={handleSubmit}
        >
          添加到题库
        </Button>
      </div>
    </Card>
  );
}

// --- Main Question Bank View ---
export default function QuestionBankView() {
  const { state, dispatch } = useAppState();
  const bank = state.questionBank ?? [];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Build path name map for matching
  const pathNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    buildPathNameMap(state.mindMap, '', map);
    return map;
  }, [state.mindMap]);

  // Count questions under each node (using both linkedAngleId and knowledgePath matching)
  const questionCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    function countForNode(node: KnowledgeNode): number {
      const nodePath = pathNameMap[node.id] || '';
      // Match by linkedAngleId (direct match) or by knowledgePath prefix
      let total = bank.filter((q: QuestionBankItem) => {
        if (q.linkedAngleId === node.id) return true;
        // Also match by knowledgePath: if question's path starts with this node's path
        if (nodePath && q.knowledgePath) {
          return q.knowledgePath === nodePath || q.knowledgePath.startsWith(nodePath + '/');
        }
        return false;
      }).length;
      // But don't double-count - the above already includes children's questions
      // because knowledgePath of children starts with parent path.
      // We actually want: questions DIRECTLY under this node, not under children.
      // So let's count only directly linked questions, then recurse for children.

      // Actually for the tree badge, we want TOTAL count including children.
      // Let's use a different approach: just count linkedAngleId matches
      // plus all children's counts.
      total = bank.filter((q: QuestionBankItem) => q.linkedAngleId === node.id).length;
      for (const child of node.children) {
        total += countForNode(child);
      }
      counts[node.id] = total;
      return total;
    }

    countForNode(state.mindMap);
    return counts;
  }, [state.mindMap, bank]);

  // Filter questions based on selected node, source, and search
  const filteredQuestions = useMemo(() => {
    let result = [...bank];

    // Filter by selected knowledge tree node
    if (selectedNodeId) {
      const selectedNode = findNodeById(state.mindMap, selectedNodeId);
      if (selectedNode) {
        const descendantIds = new Set(getDescendantIds(selectedNode));
        const nodePath = pathNameMap[selectedNodeId] || '';

        result = result.filter((q: QuestionBankItem) => {
          // Match by linkedAngleId being a descendant of selected node
          if (q.linkedAngleId && descendantIds.has(q.linkedAngleId)) return true;
          // Fallback: match by knowledgePath prefix
          if (nodePath && q.knowledgePath) {
            return q.knowledgePath === nodePath || q.knowledgePath.startsWith(nodePath + '/');
          }
          return false;
        });
      }
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      result = result.filter((q: QuestionBankItem) => q.source === sourceFilter);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (q: QuestionBankItem) =>
          q.content.toLowerCase().includes(query) ||
          q.knowledgePath.toLowerCase().includes(query) ||
          (q.linkedAngleName || '').toLowerCase().includes(query),
      );
    }

    return result;
  }, [bank, selectedNodeId, sourceFilter, searchQuery, state.mindMap, pathNameMap]);

  // Selected node display name
  const selectedNodeName = useMemo(() => {
    if (!selectedNodeId) return null;
    return pathNameMap[selectedNodeId] || null;
  }, [selectedNodeId, pathNameMap]);

  const handleDelete = useCallback(
    (id: string) => {
      dispatch({ type: 'REMOVE_QUESTION_BANK_ITEM', payload: id });
    },
    [dispatch],
  );

  const handleAddQuestion = useCallback(
    (item: QuestionBankItem) => {
      dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: [item] });
      setShowAddForm(false);
    },
    [dispatch],
  );

  // Upload JSON
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Upload CSV
  const handleCsvUploadClick = useCallback(() => {
    csvInputRef.current?.click();
  }, []);

  const handleCsvFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          const items = parseCsvToQuestions(text, pathNameMap);

          if (items.length === 0) {
            alert('未找到有效的题目数据。请确保CSV格式正确，包含：题目内容、选项A-D、正确答案、解析、知识点路径。');
            return;
          }

          dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: items });
          alert(`成功导入 ${items.length} 道题目！`);
        } catch {
          alert('CSV解析失败，请检查文件格式。');
        }
      };
      reader.readAsText(file, 'UTF-8');
      e.target.value = '';
    },
    [dispatch, pathNameMap],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          const data = JSON.parse(text);

          let items: QuestionBankItem[] = [];
          if (Array.isArray(data)) {
            items = data;
          } else if (data.questions && Array.isArray(data.questions)) {
            items = data.questions;
          }

          const validItems = items.filter(
            (item: QuestionBankItem) =>
              item.content && item.options && item.correctAnswer,
          );

          if (validItems.length === 0) {
            alert('未找到有效的题目数据。请确保JSON格式正确，包含 content、options、correctAnswer 字段。');
            return;
          }

          const tagged = validItems.map((item: QuestionBankItem) => ({
            ...item,
            id: item.id || createId(),
            source: item.source || 'upload',
            createdAt: item.createdAt || new Date().toISOString(),
          }));

          dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: tagged });
          alert(`成功导入 ${tagged.length} 道题目！`);
        } catch {
          alert('JSON解析失败，请检查文件格式。');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [dispatch],
  );

  // Export question bank
  const handleExport = useCallback(() => {
    const data = JSON.stringify(bank, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question-bank.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [bank]);

  // Source distribution
  const sourceStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const q of bank) {
      stats[q.source] = (stats[q.source] || 0) + 1;
    }
    return stats;
  }, [bank]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white dark:bg-gray-900 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">题库管理</h2>
          </div>
          <Badge variant="outline" className="text-xs">
            共 {bank.length} 题
          </Badge>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(sourceStats).map(([source, count]) => (
            <Badge
              key={source}
              variant="secondary"
              className={cn(
                'text-[10px]',
                source === 'mindmap-inline' && 'bg-purple-50 text-purple-700',
                source === 'upload' && 'bg-green-50 text-green-700',
                source === 'practice' && 'bg-blue-50 text-blue-700',
                source === 'exam' && 'bg-orange-50 text-orange-700',
              )}
            >
              {source === 'mindmap-inline' && '导图例题'}
              {source === 'upload' && '上传题目'}
              {source === 'practice' && '练习添加'}
              {source === 'exam' && '套卷添加'}
              {' '}{count}
            </Badge>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {showAddForm ? '收起表单' : '手动添加'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleUploadClick}>
            <FileJson className="h-3.5 w-3.5 mr-1" />
            上传JSON
          </Button>
          <Button size="sm" variant="outline" onClick={handleCsvUploadClick}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
            上传CSV
          </Button>
          <Button size="sm" variant="outline" onClick={downloadCsvTemplate}>
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV模板
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1" />
            导出题库
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvFileUpload}
          />
        </div>

        {/* Add question form */}
        {showAddForm && (
          <AddQuestionForm
            mindMap={state.mindMap}
            onSubmit={handleAddQuestion}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Search and filter */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="pl-8 text-sm"
              placeholder="搜索题目内容、知识点..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="border rounded-md px-2 py-1.5 text-xs bg-white dark:bg-gray-800 dark:border-gray-700"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">全部来源</option>
            <option value="mindmap-inline">导图例题</option>
            <option value="upload">上传题目</option>
            <option value="practice">练习添加</option>
            <option value="exam">套卷添加</option>
          </select>
        </div>

        {/* Selected path display */}
        {selectedNodeName && (
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-1.5">
            <Filter className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-blue-600 dark:text-blue-400">筛选：</span>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              {selectedNodeName}
            </span>
            <span className="text-xs text-blue-500 ml-1">({filteredQuestions.length}题)</span>
            <button
              type="button"
              className="ml-auto text-blue-500 hover:text-blue-700"
              onClick={() => setSelectedNodeId(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main content: filter tree + question list */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Knowledge filter tree */}
        <div className="w-56 border-r bg-white dark:bg-gray-900 shrink-0 flex flex-col">
          <div className="px-3 py-2 border-b shrink-0">
            <p className="text-xs font-medium text-gray-500">按知识点筛选</p>
          </div>
          <div className="flex-1 overflow-auto">
            <KnowledgeFilter
              mindMap={state.mindMap}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
              questionCounts={questionCounts}
            />
          </div>
        </div>

        {/* Right: Question list */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2 max-w-3xl mx-auto">
            {filteredQuestions.length === 0 ? (
              <div className="text-center py-12">
                <Database className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {bank.length === 0
                    ? '题库暂无题目，点击"手动添加"或"上传JSON"添加题目'
                    : '没有匹配的题目，请调整筛选条件'}
                </p>
                {selectedNodeId && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2"
                    onClick={() => setSelectedNodeId(null)}
                  >
                    清除筛选查看全部
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-2">
                  显示 {filteredQuestions.length} / {bank.length} 题
                </p>
                {filteredQuestions.map((q: QuestionBankItem) => (
                  <QuestionDetailCard key={q.id} item={q} onDelete={handleDelete} />
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
