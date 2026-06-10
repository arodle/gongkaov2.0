'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/stores/appStore';
import type { KnowledgeNodeRecord, QuestionBankItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  FileText,
  Search,
  Tag,
  Edit3,
  Save,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ListTodo,
  StickyNote,
  PanelRightClose,
  PanelRightOpen,
  Lightbulb,
  Repeat2,
  ClipboardCheck,
  ArrowUpRight,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { generatedExplanationToText } from '@/lib/question-explanation';
import {
  QUANTITY_STRATEGY_LABELS,
  WRONG_REASON_LABELS,
  advanceReviewMeta,
  createDefaultReviewMeta,
  getQuestionTypeLabel,
  isReviewDue,
  type QuantityStrategyTag,
  type QuestionReviewMeta,
  type WrongReasonTag,
} from '@/lib/practice-insights';

const STORAGE_KEY = 'wrong_answer_notes';
const EXPANDED_KEY = 'wrong_answer_expanded';
const REVIEW_META_STORAGE_KEY = 'gongkao:question-review-meta';
const REVIEW_NOTE_TEMPLATE = `【错因】

【正确思路】

【易错点】

【下次提醒】
`;

type ReviewFilter = 'all' | 'priority' | 'repeat' | 'unreviewed' | 'due' | 'mastered' | 'no-note' | 'recent';

interface WrongAnswerNote {
  id: string;
  questionId: string;
  questionContent: string;
  correctAnswer: string;
  userAnswer: string;
  nodePath: string;
  linkedAngleId: string | null;
  linkedAngleName: string;
  note: string;
  createdAt: string;
  explanation: string;
  images: string[];
  repeatCount: number;
  priorityScore: number;
  questionType: string;
  reviewMeta?: QuestionReviewMeta;
}

interface WrongAnswerNotebookProps {
  onJumpToNode?: (nodeId: string) => void;
  onStartReasonPractice?: (reason: { tag: WrongReasonTag; label: string; questions: QuestionBankItem[] }) => void;
}

function hasReviewWork(item: WrongAnswerNote) {
  return Boolean(
    item.note.trim()
    || item.reviewMeta?.reasonTags.length
    || item.reviewMeta?.strategyTags.length
  );
}

function isMastered(item: WrongAnswerNote) {
  return item.reviewMeta?.mastered === true;
}

function isPendingSecondReview(item: WrongAnswerNote) {
  return !isMastered(item) && isReviewDue(item.reviewMeta);
}

interface WrongAnswerItemProps {
  item: WrongAnswerNote;
  isSelected: boolean;
  onSelect: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function WrongAnswerItem({ item, isSelected, onSelect, isExpanded, onToggle }: WrongAnswerItemProps) {
  return (
    <div
      className={cn(
        'border-b transition-colors cursor-pointer',
        isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/50'
      )}
    >
      <div
        className="flex items-center justify-between p-3"
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm line-clamp-1">{item.questionContent}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                <XCircle className="h-2.5 w-2.5 mr-0.5" />
                错
              </Badge>
              {item.repeatCount > 1 && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                  <Repeat2 className="mr-0.5 h-2.5 w-2.5" />
                  x{item.repeatCount}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground truncate">
                {item.nodePath.split(' / ').pop()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 space-y-2 bg-muted/30">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">你的答案：</span>
                  <Badge variant="outline" className="text-red-500 border-red-200 ml-1">
                    {item.userAnswer}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">正确答案：</span>
                  <Badge variant="outline" className="text-green-500 border-green-200 ml-1">
                    {item.correctAnswer}
                  </Badge>
                </div>
              </div>
              
              {item.explanation && (
                <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/30 p-2 rounded">
                  <span className="font-medium">解析：</span>
                  {item.explanation}
                </div>
              )}
              
              {item.images && item.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {item.images.map((img, idx) => (
                    <img key={idx} src={img} alt={`解析图 ${idx + 1}`} className="max-h-24 object-contain rounded border" />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

function ReviewMetaPanel({
  item,
  onUpdate,
}: {
  item: WrongAnswerNote;
  onUpdate: (questionId: string, updater: (meta: QuestionReviewMeta) => QuestionReviewMeta) => void;
}) {
  const meta = item.reviewMeta || createDefaultReviewMeta();
  const isQuantity = item.questionType.includes('数量');

  return (
    <div className="space-y-4 rounded-lg border bg-slate-50 p-3">
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">错因标签</div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(WRONG_REASON_LABELS) as WrongReasonTag[]).map(tag => {
            const active = meta.reasonTags.includes(tag);
            return (
              <Button
                key={tag}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => onUpdate(item.questionId, current => ({
                  ...current,
                  reasonTags: active
                    ? current.reasonTags.filter(value => value !== tag)
                    : [...current.reasonTags, tag],
                  updatedAt: new Date().toISOString(),
                }))}
              >
                {WRONG_REASON_LABELS[tag]}
              </Button>
            );
          })}
        </div>
      </div>

      {isQuantity && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">数量关系策略</div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(QUANTITY_STRATEGY_LABELS) as QuantityStrategyTag[]).map(tag => {
              const active = meta.strategyTags.includes(tag);
              return (
                <Button
                  key={tag}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => onUpdate(item.questionId, current => ({
                    ...current,
                    strategyTags: active
                      ? current.strategyTags.filter(value => value !== tag)
                      : [...current.strategyTags, tag],
                    updatedAt: new Date().toISOString(),
                  }))}
                >
                  {QUANTITY_STRATEGY_LABELS[tag]}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="text-xs text-muted-foreground">
          下次二刷：{meta.nextReviewAt ? new Date(meta.nextReviewAt).toLocaleDateString() : '待安排'}
          <span className="ml-2">阶段 {meta.reviewStage + 1}/3</span>
          {meta.mastered && <Badge className="ml-2 bg-emerald-600 text-white">已掌握</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate(item.questionId, current => advanceReviewMeta(current))}>
            完成本轮二刷
          </Button>
          <Button
            type="button"
            variant={meta.mastered ? 'default' : 'outline'}
            size="sm"
            onClick={() => onUpdate(item.questionId, current => ({
              ...current,
              mastered: !current.mastered,
              updatedAt: new Date().toISOString(),
            }))}
          >
            {meta.mastered ? '取消掌握' : '标记已掌握'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function loadReviewMetaMap(): Record<string, QuestionReviewMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(REVIEW_META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReviewMetaMap(meta: Record<string, QuestionReviewMeta>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REVIEW_META_STORAGE_KEY, JSON.stringify(meta));
}

export function WrongAnswerNotebook({ onJumpToNode, onStartReasonPractice }: WrongAnswerNotebookProps = {}) {
  const { practiceRecords, nodes, questionBank, updateQuestion } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNode, setFilterNode] = useState<string>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [editingNote, setEditingNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [generatingExplanationId, setGeneratingExplanationId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [localNotes, setLocalNotes] = useState<{ [key: string]: string }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [reviewMetaByQuestion, setReviewMetaByQuestion] = useState<Record<string, QuestionReviewMeta>>(() => loadReviewMetaMap());
  const notePanelRef = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(searchQuery, 100);

  const nodePathMap = useMemo(() => {
    const map = new Map<string, string>();
    
    const getNodePath = (nodeId: string): string => {
      if (map.has(nodeId)) {
        return map.get(nodeId)!;
      }
      
      const parts: string[] = [];
      let current = nodes.find(n => n.id === nodeId);
      while (current) {
        parts.unshift(current.name);
        current = current.parent_id
          ? nodes.find(n => n.id === current!.parent_id)
          : undefined;
      }
      
      const path = parts.join(' / ');
      map.set(nodeId, path);
      return path;
    };

    nodes.forEach(node => {
      getNodePath(node.id);
    });

    return map;
  }, [nodes]);

  const repeatCountByQuestion = useMemo(() => {
    const counts = new Map<string, number>();
    practiceRecords
      .filter(record => !record.is_correct)
      .forEach(record => {
        counts.set(record.question_id, (counts.get(record.question_id) || 0) + 1);
      });
    return counts;
  }, [practiceRecords]);

  const wrongAnswers = useMemo(() => {
    const wrongRecords = practiceRecords.filter(r => !r.is_correct);

    return wrongRecords.map(record => {
      const question = questionBank.find(q => q.id === record.question_id);
      const linkedAngleId = question?.linkedAngleId || null;
      const linkedNode = linkedAngleId
        ? nodes.find(n => n.id === linkedAngleId)
        : null;
      const repeatCount = repeatCountByQuestion.get(record.question_id) || 1;
      const createdAt = record.updated_at;
      const note = localNotes[record.id] || '';
      const isRecent = Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
      const priorityScore =
        repeatCount * 3
        + (note.trim() ? 0 : 2)
        + (isRecent ? 1 : 0)
        + (linkedNode && linkedNode.ps_score < 80 ? 2 : 0)
        + (question?.explanation ? 0 : 1);

      return {
        id: record.id,
        questionId: record.question_id,
        questionContent: question?.content || '题目内容已不存在',
        correctAnswer: question?.correctAnswer || '未知',
        userAnswer: (record as any).selected_answer || '未记录',
        nodePath: linkedNode ? (nodePathMap.get(linkedNode.id) || '未分类') : '未分类',
        linkedAngleId,
        linkedAngleName: linkedNode?.name || '未分类',
        note,
        createdAt,
        explanation: question?.explanation || '',
        images: question?.images || [],
        repeatCount,
        priorityScore,
        questionType: getQuestionTypeLabel(question),
        reviewMeta: question ? reviewMetaByQuestion[question.id] : undefined,
      } as WrongAnswerNote;
    }).reverse();
  }, [practiceRecords, questionBank, nodes, localNotes, nodePathMap, repeatCountByQuestion, reviewMetaByQuestion]);

  const priorityWrongAnswers = useMemo(() => {
    return [...wrongAnswers]
      .sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 20);
  }, [wrongAnswers]);

  const filteredWrongAnswers = useMemo(() => {
    let result = wrongAnswers;
    const priorityIds = new Set(priorityWrongAnswers.map(item => item.id));

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter(
        item =>
          item.questionContent.toLowerCase().includes(query) ||
          item.nodePath.toLowerCase().includes(query) ||
          item.linkedAngleName.toLowerCase().includes(query)
      );
    }

    if (filterNode !== 'all') {
      result = result.filter(item => item.linkedAngleId === filterNode);
    }

    if (reviewFilter === 'priority') {
      result = result.filter(item => priorityIds.has(item.id));
    } else if (reviewFilter === 'repeat') {
      result = result.filter(item => item.repeatCount > 1);
    } else if (reviewFilter === 'unreviewed') {
      result = result.filter(item => !hasReviewWork(item));
    } else if (reviewFilter === 'due') {
      result = result.filter(item => isPendingSecondReview(item));
    } else if (reviewFilter === 'mastered') {
      result = result.filter(item => isMastered(item));
    } else if (reviewFilter === 'no-note') {
      result = result.filter(item => !item.note.trim());
    } else if (reviewFilter === 'recent') {
      result = result.filter(item => {
        const date = new Date(item.createdAt);
        const diff = Date.now() - date.getTime();
        return diff < 7 * 24 * 60 * 60 * 1000;
      });
    }

    return result;
  }, [wrongAnswers, priorityWrongAnswers, debouncedSearch, filterNode, reviewFilter]);

  const selectedItem = useMemo(() => {
    return filteredWrongAnswers.find(item => item.id === selectedId);
  }, [filteredWrongAnswers, selectedId]);

  const weakNodes = useMemo(() => {
    return nodes.filter(n => n.ps_score < 80);
  }, [nodes]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id];
      
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save expanded items:', e);
      }
      
      return next;
    });
  }, []);

  const handleExportWrongAnswers = useCallback(() => {
    const exportData = filteredWrongAnswers.map(item => ({
      '题目内容': item.questionContent,
      '正确答案': item.correctAnswer,
      '你的答案': item.userAnswer,
      '知识点路径': item.nodePath,
      '知识点名称': item.linkedAngleName,
      '笔记': item.note,
      '错题时间': item.createdAt,
    }));

    if (exportData.length === 0) {
      toast.info('没有可导出的数据');
      return;
    }

    const headers = Object.keys(exportData[0]);
    const csvContent = [
      headers.join(','),
      ...exportData.map(row =>
        headers.map(h => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wrong_answers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredWrongAnswers]);

  const handleSaveNote = useCallback(() => {
    if (!selectedId) return;
    
    const newNotes = { ...localNotes, [selectedId]: editingNote };
    setLocalNotes(newNotes);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newNotes));
    } catch (e) {
      console.error('Failed to save notes:', e);
    }
    
    setIsEditing(false);
  }, [selectedId, editingNote, localNotes]);

  const updateQuestionReviewMeta = useCallback((questionId: string, updater: (meta: QuestionReviewMeta) => QuestionReviewMeta) => {
    setReviewMetaByQuestion(prev => {
      const base = prev[questionId] || createDefaultReviewMeta();
      const next = { ...prev, [questionId]: updater(base) };
      saveReviewMetaMap(next);
      return next;
    });
  }, []);

  const handleApplyNoteTemplate = useCallback(() => {
    const current = editingNote.trim() || selectedItem?.note.trim() || '';
    if (current.includes('【错因】') && current.includes('【下次提醒】')) {
      setIsEditing(true);
      return;
    }
    setEditingNote(current ? `${current}\n\n${REVIEW_NOTE_TEMPLATE}` : REVIEW_NOTE_TEMPLATE);
    setIsEditing(true);
  }, [editingNote, selectedItem]);

  const handleGenerateAIExplanation = useCallback(async () => {
    if (!selectedItem) return;
    const question = questionBank.find(item => item.id === selectedItem.questionId);
    if (!question) {
      toast.error('题目不存在，无法生成解析');
      return;
    }

    setGeneratingExplanationId(question.id);
    try {
      const response = await fetch('/api/question-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'deepseek',
          content: question.content,
          options: question.options,
          correctAnswer: question.correctAnswer,
          knowledgePath: question.knowledgePath || selectedItem.nodePath,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'AI 解析生成失败');
      }

      const text = generatedExplanationToText(json.data);
      updateQuestion({
        ...question,
        explanation: `${text}\n\n（AI 解析，仅供参考）`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 解析生成失败';
      toast.error(message);
    } finally {
      setGeneratingExplanationId(null);
    }
  }, [questionBank, selectedItem, updateQuestion]);

  const handleSelectItem = useCallback((id: string) => {
    setSelectedId(id);
    const item = wrongAnswers.find(w => w.id === id);
    if (item) {
      setEditingNote(item.note);
      setIsEditing(false);
    }
    if (!showNotePanel) {
      setShowNotePanel(true);
    }
  }, [wrongAnswers, showNotePanel]);

  const stats = useMemo(() => {
    return {
      total: wrongAnswers.length,
      withNotes: wrongAnswers.filter(w => w.note).length,
      repeated: wrongAnswers.filter(w => w.repeatCount > 1).length,
      unreviewed: wrongAnswers.filter(w => !hasReviewWork(w)).length,
      due: wrongAnswers.filter(w => isPendingSecondReview(w)).length,
      mastered: wrongAnswers.filter(w => isMastered(w)).length,
      noNote: wrongAnswers.filter(w => !w.note.trim()).length,
      thisWeek: wrongAnswers.filter(w => {
        const date = new Date(w.createdAt);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        return diff < 7 * 24 * 60 * 60 * 1000;
      }).length,
    };
  }, [wrongAnswers]);

  const reasonStats = useMemo(() => {
    const counts = new Map<WrongReasonTag, number>();
    wrongAnswers.forEach(item => {
      item.reviewMeta?.reasonTags.forEach(tag => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return (Object.keys(WRONG_REASON_LABELS) as WrongReasonTag[])
      .map(tag => ({ tag, label: WRONG_REASON_LABELS[tag], count: counts.get(tag) || 0 }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [wrongAnswers]);

  const questionsByReason = useMemo(() => {
    const questionById = new Map(questionBank.map(question => [question.id, question]));
    const grouped = new Map<WrongReasonTag, QuestionBankItem[]>();
    const seenByReason = new Map<WrongReasonTag, Set<string>>();

    wrongAnswers.forEach(item => {
      const question = questionById.get(item.questionId);
      if (!question) return;
      item.reviewMeta?.reasonTags.forEach(tag => {
        const seen = seenByReason.get(tag) || new Set<string>();
        if (seen.has(question.id)) return;
        seen.add(question.id);
        seenByReason.set(tag, seen);
        grouped.set(tag, [...(grouped.get(tag) || []), question]);
      });
    });

    return grouped;
  }, [questionBank, wrongAnswers]);

  const reviewFilters: Array<{ id: ReviewFilter; label: string; count: number }> = [
    { id: 'all', label: '全部', count: stats.total },
    { id: 'priority', label: '优先复盘', count: priorityWrongAnswers.length },
    { id: 'repeat', label: '重复错', count: stats.repeated },
    { id: 'unreviewed', label: '未复盘', count: stats.unreviewed },
    { id: 'due', label: '待二刷', count: stats.due },
    { id: 'mastered', label: '已掌握', count: stats.mastered },
    { id: 'no-note', label: '未写笔记', count: stats.noNote },
    { id: 'recent', label: '近7天', count: stats.thisWeek },
  ];

  useEffect(() => {
    if (selectedId && !expandedItems.includes(selectedId)) {
      const newExpanded = [...expandedItems, selectedId];
      setExpandedItems(newExpanded);
      
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(newExpanded));
      } catch (e) {
        console.error('Failed to save expanded items:', e);
      }
    }
  }, [selectedId, expandedItems]);

  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row overflow-hidden">
      <Sheet open={showDrawer} onOpenChange={setShowDrawer}>
        <SheetContent side="left" className="w-[320px] sm:w-[360px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              错题列表
              <Badge variant="outline" className="text-xs">{stats.total}</Badge>
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索错题..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>

            <select
              value={filterNode}
              onChange={(e) => setFilterNode(e.target.value)}
              className="w-full text-xs border rounded px-2 py-1.5 bg-background"
            >
              <option value="all">全部知识点</option>
              {weakNodes.map(node => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-amber-50/70 p-2 text-amber-800">
                <div className="flex items-center gap-1 text-[11px] font-medium">
                  <ClipboardCheck className="h-3 w-3" />
                  优先复盘
                </div>
                <div className="mt-1 text-lg font-semibold">{priorityWrongAnswers.length}</div>
              </div>
              <div className="rounded-lg border bg-rose-50/70 p-2 text-rose-700">
                <div className="flex items-center gap-1 text-[11px] font-medium">
                  <Repeat2 className="h-3 w-3" />
                  重复错
                </div>
                <div className="mt-1 text-lg font-semibold">{stats.repeated}</div>
              </div>
            </div>

            {reasonStats.length > 0 && (
              <div className="rounded-lg border bg-white p-2">
                <div className="mb-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <BarChart3 className="h-3 w-3" />
                  错因统计
                </div>
                <p className="mb-2 text-[10px] text-muted-foreground">点击错因开始专项训练</p>
                <div className="flex flex-wrap gap-1">
                  {reasonStats.slice(0, 4).map(item => (
                    <Button
                      key={item.tag}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 bg-white px-2 text-[10px]"
                      disabled={!onStartReasonPractice || (questionsByReason.get(item.tag)?.length || 0) === 0}
                      onClick={() => onStartReasonPractice?.({
                        tag: item.tag,
                        label: item.label,
                        questions: questionsByReason.get(item.tag) || [],
                      })}
                    >
                      {item.label} {item.count}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {reviewFilters.map(filter => (
                <Button
                  key={filter.id}
                  type="button"
                  variant={reviewFilter === filter.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setReviewFilter(filter.id)}
                >
                  {filter.label} {filter.count}
                </Button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={handleExportWrongAnswers} className="w-full h-8 text-xs">
              <Download className="h-3 w-3 mr-1" />
              导出错题
            </Button>
          </div>

          <ScrollArea className="mt-4 h-[calc(100%-140px)]">
            {filteredWrongAnswers.length > 0 ? (
              <div className="py-2">
                {filteredWrongAnswers.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      handleSelectItem(item.id);
                      setShowDrawer(false);
                    }}
                    className={cn(
                      'p-3 cursor-pointer border-b transition-colors',
                      selectedId === item.id ? 'bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <p className="text-sm line-clamp-2">{item.questionContent}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{item.linkedAngleName}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <CheckCircle2 className="h-12 w-12 text-green-500/30 mb-3" />
                <h3 className="text-base font-medium mb-1">太棒了！</h3>
                <p className="text-xs text-muted-foreground">
                  {debouncedSearch || filterNode !== 'all'
                    ? '没有找到符合条件的错题'
                    : '暂无错题记录，继续保持！'}
                </p>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <div className="hidden lg:flex flex-col w-[42%] xl:w-1/2 border-r">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              <h3 className="font-semibold text-sm">错题列表</h3>
              <Badge variant="outline" className="text-xs">{stats.total}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportWrongAnswers} className="h-7 text-xs">
              <Download className="h-3 w-3 mr-1" />
              导出
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索错题..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>

          <select
            value={filterNode}
            onChange={(e) => setFilterNode(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1.5 bg-background"
          >
            <option value="all">全部知识点</option>
            {weakNodes.map(node => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-amber-50/70 p-2 text-amber-800">
              <div className="flex items-center gap-1 text-[11px] font-medium">
                <ClipboardCheck className="h-3 w-3" />
                优先
              </div>
              <div className="mt-1 text-lg font-semibold">{priorityWrongAnswers.length}</div>
            </div>
            <div className="rounded-lg border bg-rose-50/70 p-2 text-rose-700">
              <div className="flex items-center gap-1 text-[11px] font-medium">
                <Repeat2 className="h-3 w-3" />
                重复
              </div>
              <div className="mt-1 text-lg font-semibold">{stats.repeated}</div>
            </div>
            <div className="rounded-lg border bg-sky-50/70 p-2 text-sky-700">
              <div className="text-[11px] font-medium">未写笔记</div>
              <div className="mt-1 text-lg font-semibold">{stats.noNote}</div>
            </div>
          </div>

          {reasonStats.length > 0 && (
            <div className="rounded-lg border bg-white p-2">
              <div className="mb-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <BarChart3 className="h-3 w-3" />
                错因统计
              </div>
              <p className="mb-2 text-[10px] text-muted-foreground">点击错因开始专项训练</p>
              <div className="grid grid-cols-2 gap-1">
                {reasonStats.slice(0, 4).map(item => (
                  <button
                    key={item.tag}
                    type="button"
                    disabled={!onStartReasonPractice || (questionsByReason.get(item.tag)?.length || 0) === 0}
                    onClick={() => onStartReasonPractice?.({
                      tag: item.tag,
                      label: item.label,
                      questions: questionsByReason.get(item.tag) || [],
                    })}
                    className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-left text-[11px] transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {reviewFilters.map(filter => (
              <Button
                key={filter.id}
                type="button"
                variant={reviewFilter === filter.id ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setReviewFilter(filter.id)}
              >
                {filter.label} {filter.count}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {filteredWrongAnswers.length > 0 ? (
            <div>
              {filteredWrongAnswers.map((item) => (
                <WrongAnswerItem
                  key={item.id}
                  item={item}
                  isSelected={selectedId === item.id}
                  onSelect={() => handleSelectItem(item.id)}
                  isExpanded={expandedItems.includes(item.id)}
                  onToggle={() => toggleExpand(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <CheckCircle2 className="h-12 w-12 text-green-500/30 mb-3" />
              <h3 className="text-base font-medium mb-1">太棒了！</h3>
              <p className="text-xs text-muted-foreground">
                {debouncedSearch || filterNode !== 'all'
                  ? '没有找到符合条件的错题'
                  : '暂无错题记录，继续保持！'}
              </p>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col w-full max-w-full overflow-hidden px-0 md:px-0">
        {selectedItem ? (
          <>
            <div className="flex items-center justify-between p-3 border-b lg:hidden">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setShowDrawer(true)} className="h-8 w-8">
                  <ListTodo className="h-4 w-4" />
                </Button>
                <h3 className="font-semibold text-sm">错题笔记</h3>
              </div>
              <Button
                variant={isEditing ? 'default' : 'ghost'}
                size="sm"
                onClick={() => isEditing ? handleSaveNote() : setIsEditing(true)}
                className="h-7 text-xs"
              >
                {isEditing ? (
                  <>
                    <Save className="h-3 w-3 mr-1" />
                    保存
                  </>
                ) : (
                  <>
                    <Edit3 className="h-3 w-3 mr-1" />
                    编辑
                  </>
                )}
              </Button>
            </div>

            <div className="hidden lg:flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                <h3 className="font-semibold text-sm">错题笔记</h3>
              </div>
              <Button
                variant={isEditing ? 'default' : 'ghost'}
                size="sm"
                onClick={() => isEditing ? handleSaveNote() : setIsEditing(true)}
                className="h-7 text-xs"
              >
                {isEditing ? (
                  <>
                    <Save className="h-3 w-3 mr-1" />
                    保存
                  </>
                ) : (
                  <>
                    <Edit3 className="h-3 w-3 mr-1" />
                    编辑
                  </>
                )}
              </Button>
            </div>

            <Tabs defaultValue="question" className="flex-1 min-h-0 w-full max-w-full">
              <div className="hidden lg:block p-3 border-b">
                <TabsList>
                  <TabsTrigger value="question" className="text-xs">题目</TabsTrigger>
                  <TabsTrigger value="note" className="text-xs">笔记</TabsTrigger>
                  <TabsTrigger value="review" className="text-xs">复盘</TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 min-h-0 w-full max-w-full">
                <TabsContent value="question" className="p-0 w-full max-w-full">
                  <div className="p-2 sm:p-3 space-y-2 sm:space-y-3 w-full max-w-full box-border">
                    <div className="p-2 sm:p-3 rounded-lg bg-muted/50 w-full max-w-full">
                      <p className="text-xs sm:text-sm text-muted-foreground break-words word-break-all">
                        {selectedItem.questionContent}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">你的：</span>
                        <Badge variant="outline" className="text-red-500 border-red-200 text-xs">
                          {selectedItem.userAnswer}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">正确：</span>
                        <Badge variant="outline" className="text-green-500 border-green-200 text-xs">
                          {selectedItem.correctAnswer}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Tag className="h-3 w-3" />
                      <span className="truncate">{selectedItem.nodePath}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!selectedItem.linkedAngleId || !onJumpToNode}
                        onClick={() => selectedItem.linkedAngleId && onJumpToNode?.(selectedItem.linkedAngleId)}
                      >
                        <ArrowUpRight className="mr-1 h-3 w-3" />
                        回到知识点
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={generatingExplanationId === selectedItem.questionId}
                        onClick={handleGenerateAIExplanation}
                      >
                        {generatingExplanationId === selectedItem.questionId ? (
                          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1 h-3 w-3" />
                        )}
                        {selectedItem.explanation ? '重新生成 AI 解析' : 'AI 补全解析'}
                      </Button>
                    </div>

                    {selectedItem.explanation && (
                      <div className="p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 w-full max-w-full">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="h-3 w-3 text-amber-600" />
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">解析</span>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap break-words word-break-all">
                          {selectedItem.explanation}
                        </p>
                        {selectedItem.images && selectedItem.images.length > 0 && (
                          <div className="mt-2 sm:mt-3 grid grid-cols-1 gap-2 w-full">
                            {selectedItem.images.map((img, idx) => (
                              <img key={idx} src={img} alt={`解析图 ${idx + 1}`} className="max-h-40 sm:max-h-48 w-full object-contain rounded-lg border" />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="lg:hidden space-y-2 w-full">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          笔记内容
                        </label>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleApplyNoteTemplate}>
                          <FileText className="mr-1 h-3 w-3" />
                          复盘模板
                        </Button>
                      </div>
                      {isEditing ? (
                        <Textarea
                          value={editingNote}
                          onChange={(e) => setEditingNote(e.target.value)}
                          placeholder="记录解题思路、相关知识点、易错点..."
                          rows={4}
                          className="resize-none text-xs sm:text-sm"
                          autoFocus
                        />
                      ) : (
                        <div
                          className={cn(
                            'min-h-[80px] sm:min-h-[100px] p-2 sm:p-3 rounded-lg border cursor-text',
                            editingNote || selectedItem.note
                              ? 'bg-muted border-transparent'
                              : 'bg-muted/30 border-dashed text-muted-foreground'
                          )}
                          onClick={() => setIsEditing(true)}
                        >
                          <p className="text-xs sm:text-sm whitespace-pre-wrap">
                            {editingNote || selectedItem.note || '点击此处编辑笔记...'}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(selectedItem.createdAt).toLocaleDateString()}
                    </div>

                    <div className="lg:hidden">
                      <ReviewMetaPanel item={selectedItem} onUpdate={updateQuestionReviewMeta} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="note" className="p-0 hidden lg:block w-full">
                  <div className="p-4 space-y-4 w-full">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          笔记内容
                        </label>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleApplyNoteTemplate}>
                          <FileText className="mr-1 h-3 w-3" />
                          套用复盘模板
                        </Button>
                      </div>
                      {isEditing ? (
                        <Textarea
                          value={editingNote}
                          onChange={(e) => setEditingNote(e.target.value)}
                          placeholder="记录解题思路、相关知识点、易错点..."
                          rows={8}
                          className="resize-none text-sm"
                          autoFocus
                        />
                      ) : (
                        <div
                          className={cn(
                            'min-h-[160px] p-3 rounded-lg border cursor-text',
                            editingNote || selectedItem.note
                              ? 'bg-muted border-transparent'
                              : 'bg-muted/30 border-dashed text-muted-foreground'
                          )}
                          onClick={() => setIsEditing(true)}
                        >
                          <p className="text-sm whitespace-pre-wrap">
                            {editingNote || selectedItem.note || '点击此处编辑笔记...'}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(selectedItem.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {selectedItem.linkedAngleName}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="review" className="p-0 hidden lg:block w-full">
                  <div className="p-4">
                    <ReviewMetaPanel item={selectedItem} onUpdate={updateQuestionReviewMeta} />
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6">
            <BookOpen className="h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground/30 mb-2 sm:mb-3" />
            <h3 className="text-sm sm:text-base font-medium mb-1">选择一道错题</h3>
            <p className="text-xs text-muted-foreground">
              在左侧列表中选择一道错题查看详情和笔记
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDrawer(true)}
              className="mt-3 sm:mt-4 lg:hidden"
            >
              <ListTodo className="h-3 w-3 mr-1" />
              打开错题列表
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
