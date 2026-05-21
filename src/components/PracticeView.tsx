'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { KnowledgeNode, QuestionBankItem } from '@/lib/types';
import { useAppState, getAllAngles, findNodeById } from '@/lib/store';
import { createId } from '@/lib/sample-data';
import { getWrongColor, getWrongTextColor } from '@/lib/color-utils';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Brain,
  Target,
  Lightbulb,
  ArrowLeft,
  Play,
  Eye,
  LightbulbIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Build a path name map: nodeId -> path name
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
function getDescendantIdsList(node: KnowledgeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...getDescendantIdsList(child));
  }
  return ids;
}

// --- Knowledge Tree Selector (single node selection with question counts) ---
function KnowledgeSelector({
  mindMap,
  selectedNodeId,
  onNodeSelect,
  questionBank,
}: {
  mindMap: KnowledgeNode;
  selectedNodeId: string | null;
  onNodeSelect: (id: string | null) => void;
  questionBank: QuestionBankItem[];
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add(mindMap.id);
    for (const child of mindMap.children) {
      s.add(child.id);
    }
    return s;
  });

  // Build path name map for knowledgePath matching
  const pathNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    buildPathNameMap(mindMap, '', map);
    return map;
  }, [mindMap]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Count questions under each node (using linkedAngleId AND knowledgePath matching)
  const questionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    function countForNode(node: KnowledgeNode): number {
      const nodePath = pathNameMap[node.id] || '';
      let directCount = questionBank.filter((q: QuestionBankItem) => {
        if (q.linkedAngleId === node.id) return true;
        if (nodePath && q.knowledgePath) {
          return q.knowledgePath === nodePath || q.knowledgePath.startsWith(nodePath + '/');
        }
        return false;
      }).length;
      // But to avoid double-counting children, only count questions directly at this node
      // plus children's counts
      directCount = questionBank.filter((q: QuestionBankItem) => q.linkedAngleId === node.id).length;
      let childCount = 0;
      for (const child of node.children) {
        childCount += countForNode(child);
      }
      counts[node.id] = directCount + childCount;
      return directCount + childCount;
    }
    countForNode(mindMap);
    return counts;
  }, [mindMap, questionBank, pathNameMap]);

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
              {count}题
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
    <ScrollArea className="h-[400px]">
      <div className="py-1">
        {renderNode(mindMap, 0)}
      </div>
    </ScrollArea>
  );
}

// --- Node type config for result mind map ---
const NODE_TYPE_CONFIG_RESULT: Record<string, { icon: React.ElementType; defaultBg: string; defaultBorder: string }> = {
  subject: { icon: BookOpen, defaultBg: 'bg-blue-50 dark:bg-blue-950', defaultBorder: 'border-blue-300 dark:border-blue-700' },
  knowledge: { icon: Brain, defaultBg: 'bg-indigo-50 dark:bg-indigo-950', defaultBorder: 'border-indigo-300 dark:border-indigo-700' },
  subknowledge: { icon: Target, defaultBg: 'bg-violet-50 dark:bg-violet-950', defaultBorder: 'border-violet-300 dark:border-violet-700' },
  angle: { icon: Lightbulb, defaultBg: 'bg-amber-50 dark:bg-amber-950', defaultBorder: 'border-amber-300 dark:border-amber-700' },
};

// --- Result Mind Map with rectangle nodes (like MindMapView) ---
function ResultMindMapRect({
  node,
  depth,
  wrongAngleIds,
  wrongCounts,
  litUpIds,
  wrongQuestionsMap,
}: {
  node: KnowledgeNode;
  depth: number;
  wrongAngleIds: Set<string>;
  wrongCounts: Record<string, number>;
  litUpIds: Set<string>;
  wrongQuestionsMap: Record<string, QuestionBankItem[]>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isWrong = wrongAngleIds.has(node.id);
  const isLitUp = litUpIds.has(node.id);
  const hasRelevantChild = node.children.some((c) =>
    wrongAngleIds.has(c.id) || litUpIds.has(c.id) || hasRelevantDescendant(c, wrongAngleIds, litUpIds),
  );

  // Only render nodes that are relevant or ancestors of relevant nodes
  if (depth > 0 && !isWrong && !isLitUp && !hasRelevantChild) return null;

  const config = NODE_TYPE_CONFIG_RESULT[node.type] || NODE_TYPE_CONFIG_RESULT.subject;
  const IconComponent = config.icon;
  const wrongCount = wrongCounts[node.id] || 0;
  const wrongColor = isWrong && node.type === 'angle' && wrongCount > 0 ? getWrongColor(wrongCount) : null;
  const wrongTextColorVal = isWrong && node.type === 'angle' && wrongCount > 0 ? getWrongTextColor(wrongCount) : null;

  let nodeBg = config.defaultBg;
  let nodeBorder = config.defaultBorder;
  let nodeTextColor = '';

  if (wrongColor && node.type === 'angle') {
    nodeBg = '';
    nodeBorder = '';
    nodeTextColor = wrongTextColorVal || '';
  } else if (isLitUp && !isWrong) {
    nodeBg = 'bg-yellow-100 dark:bg-yellow-900';
    nodeBorder = 'border-yellow-400 dark:border-yellow-600';
  }

  const hasChildren = node.children.length > 0;
  const angleWrongQuestions = wrongQuestionsMap[node.id] || [];

  return (
    <div className="flex flex-col items-center">
      {/* Rectangle node */}
      <div
        className={cn(
          'relative flex items-center gap-2 px-3 py-2 rounded-xl border-2 min-w-[100px] max-w-[260px] text-center cursor-pointer transition-all duration-300 hover:shadow-lg select-none',
          nodeBg,
          nodeBorder,
        )}
        style={wrongColor ? { backgroundColor: wrongColor, borderColor: wrongColor, color: nodeTextColor } : undefined}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
        }}
      >
        <IconComponent className="h-4 w-4 shrink-0 opacity-70" style={wrongColor ? { color: nodeTextColor } : undefined} />
        <span
          className="text-sm font-semibold leading-tight truncate"
          style={wrongColor ? { color: nodeTextColor } : isLitUp && !isWrong ? { color: '#92400e' } : undefined}
        >
          {node.name}
        </span>
        {hasChildren && (
          <span className="shrink-0 ml-0.5">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 opacity-50" /> : <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
          </span>
        )}
        {/* Wrong count badge - clickable to show wrong questions */}
        {wrongCount > 0 && node.type === 'angle' && (
          <Popover>
            <PopoverTrigger asChild>
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 min-w-[20px] text-[10px] px-1 cursor-pointer hover:scale-110 transition-transform"
                onClick={(e) => e.stopPropagation()}
              >
                错{wrongCount}
              </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] max-h-[300px] overflow-auto p-3" side="right" align="start">
              <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" />
                「{node.name}」错题列表
              </h4>
              <div className="space-y-2">
                {angleWrongQuestions.map((q, idx) => (
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
            </PopoverContent>
          </Popover>
        )}
        {/* Correct badge */}
        {isLitUp && !isWrong && node.type === 'angle' && (
          <CheckCircle2 className="absolute -top-2 -right-2 h-5 w-5 text-green-500 bg-white dark:bg-gray-900 rounded-full" />
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
          <div className="flex flex-wrap justify-center gap-3">
            {node.children.map((child) => (
              <ResultMindMapRect
                key={child.id}
                node={child}
                depth={depth + 1}
                wrongAngleIds={wrongAngleIds}
                wrongCounts={wrongCounts}
                litUpIds={litUpIds}
                wrongQuestionsMap={wrongQuestionsMap}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function hasRelevantDescendant(
  node: KnowledgeNode,
  wrongAngleIds: Set<string>,
  litUpIds: Set<string>,
): boolean {
  if (wrongAngleIds.has(node.id) || litUpIds.has(node.id)) return true;
  return node.children.some((c) => hasRelevantDescendant(c, wrongAngleIds, litUpIds));
}

// --- Question Card for Practice ---
function PracticeQuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  onSelectAnswer,
  showResult,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  mindMap,
}: {
  question: QuestionBankItem;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | null;
  onSelectAnswer: (answer: string) => void;
  showResult: boolean;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  mindMap: KnowledgeNode;
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    function expandPath(node: KnowledgeNode): boolean {
      if (node.id === question.linkedAngleId) {
        expanded.add(node.id);
        return true;
      }
      for (const child of node.children) {
        if (expandPath(child)) {
          expanded.add(node.id);
          return true;
        }
      }
      return false;
    }
    expandPath(mindMap);
    return expanded;
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isCorrect = selectedAnswer === question.correctAnswer;

  // Build knowledge path display
  const pathParts = question.knowledgePath.split(' / ');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            第 {questionNumber} / {totalQuestions} 题
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {question.linkedAngleName}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onPrev} disabled={!hasPrev}>
            上一题
          </Button>
          <Button variant="ghost" size="sm" onClick={onNext} disabled={!hasNext}>
            下一题
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Knowledge path breadcrumb */}
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
            <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mb-1">知识点路径</p>
            <div className="flex items-center flex-wrap gap-1">
              {pathParts.map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />}
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium',
                      i === pathParts.length - 1
                        ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400',
                    )}
                  >
                    {part}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Question content */}
          <Card className="p-4">
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
              {question.content}
            </p>
          </Card>

          {/* Options */}
          <div className="space-y-2">
            {question.options.map((opt) => {
              const isSelected = selectedAnswer === opt.label;
              const isCorrectOption = opt.label === question.correctAnswer;

              let optionStyle = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300';
              if (showResult) {
                if (isCorrectOption) {
                  optionStyle = 'bg-green-50 dark:bg-green-900/30 border-green-400';
                } else if (isSelected && !isCorrect) {
                  optionStyle = 'bg-red-50 dark:bg-red-900/30 border-red-400';
                }
              } else if (isSelected) {
                optionStyle = 'bg-blue-50 dark:bg-blue-900/30 border-blue-400';
              }

              return (
                <button
                  key={opt.label}
                  type="button"
                  className={cn(
                    'w-full text-left p-3 rounded-lg border-2 transition-all duration-200',
                    optionStyle,
                    showResult && 'cursor-default',
                  )}
                  onClick={() => !showResult && onSelectAnswer(opt.label)}
                  disabled={showResult}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold',
                        isSelected
                          ? showResult
                            ? isCorrect
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-red-500 bg-red-500 text-white'
                            : 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 dark:border-gray-600',
                      )}
                    >
                      {opt.label}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">{opt.text}</span>
                    {showResult && isCorrectOption && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto shrink-0" />
                    )}
                    {showResult && isSelected && !isCorrect && (
                      <XCircle className="h-5 w-5 text-red-500 ml-auto shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Result feedback */}
          {showResult && (
            <div
              className={cn(
                'rounded-lg p-4',
                isCorrect
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200',
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                {isCorrect ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span
                  className={cn(
                    'text-sm font-semibold',
                    isCorrect ? 'text-green-700' : 'text-red-700',
                  )}
                >
                  {isCorrect ? '回答正确！' : '回答错误'}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {question.explanation}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Question navigation dots */}
      <div className="border-t bg-white dark:bg-gray-900 p-3 shrink-0">
        <div className="flex flex-wrap gap-1.5 justify-center">
          {Array.from({ length: totalQuestions }, (_, i) => i).map((i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'w-7 h-7 rounded-md text-xs font-medium transition-colors',
                i === questionNumber - 1 && 'ring-2 ring-blue-500',
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main Practice View ---
type PracticePhase = 'select' | 'quiz' | 'result';

export default function PracticeView() {
  const { state, addAnswerRecord, dispatch } = useAppState();
  const bank = state.questionBank ?? [];
  const [phase, setPhase] = useState<PracticePhase>('select');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState<Record<string, boolean>>({});
  const [practiceQuestions, setPracticeQuestions] = useState<QuestionBankItem[]>([]);

  // Build path name map
  const pathNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    buildPathNameMap(state.mindMap, '', map);
    return map;
  }, [state.mindMap]);

  // Get questions for selected knowledge node
  const availableQuestions = useMemo(() => {
    if (!selectedNodeId) return [];

    const selectedNode = findNodeById(state.mindMap, selectedNodeId);
    if (!selectedNode) return [];

    const nodePath = pathNameMap[selectedNodeId] || '';
    const descendantIds = new Set(getDescendantIdsList(selectedNode));

    return bank.filter((q: QuestionBankItem) => {
      // Match by linkedAngleId being a descendant of selected node
      if (q.linkedAngleId && descendantIds.has(q.linkedAngleId)) return true;
      // Fallback: match by knowledgePath prefix
      if (nodePath && q.knowledgePath) {
        return q.knowledgePath === nodePath || q.knowledgePath.startsWith(nodePath + '/');
      }
      return false;
    });
  }, [selectedNodeId, state.mindMap, bank, pathNameMap]);

  const handleStartPractice = useCallback(() => {
    // Shuffle and pick questions
    const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(questionCount, shuffled.length));
    setPracticeQuestions(picked);
    setCurrentQIndex(0);
    setAnswers({});
    setShowResults({});
    setPhase('quiz');
  }, [availableQuestions, questionCount]);

  const handleSelectAnswer = useCallback(
    (answer: string) => {
      const q = practiceQuestions[currentQIndex];
      if (!q) return;

      setAnswers((prev) => ({ ...prev, [q.id]: answer }));
      const isCorrect = answer === q.correctAnswer;
      addAnswerRecord({
        questionId: q.id,
        practiceSetId: 'practice-knowledge',
        selectedAnswer: answer,
        isCorrect,
        timestamp: Date.now(),
        linkedAngleId: q.linkedAngleId,
        source: 'practice',
      });
      setShowResults((prev) => ({ ...prev, [q.id]: true }));
    },
    [practiceQuestions, currentQIndex, addAnswerRecord],
  );

  // Result computation
  const resultData = useMemo(() => {
    if (practiceQuestions.length === 0) return null;
    const wrongAngleIds = new Set<string>();
    const litUpIds = new Set<string>();
    const wrongCounts: Record<string, number> = {};
    const wrongQuestionsMap: Record<string, QuestionBankItem[]> = {};

    for (const q of practiceQuestions) {
      const userAnswer = answers[q.id];
      if (userAnswer === q.correctAnswer) {
        // Light up the path
        litUpIds.add(q.linkedAngleId);
      } else if (userAnswer !== undefined) {
        wrongAngleIds.add(q.linkedAngleId);
        wrongCounts[q.linkedAngleId] = (wrongCounts[q.linkedAngleId] || 0) + 1;
        if (!wrongQuestionsMap[q.linkedAngleId]) {
          wrongQuestionsMap[q.linkedAngleId] = [];
        }
        wrongQuestionsMap[q.linkedAngleId].push(q);
      }
    }

    // Propagate lit-up status up the tree
    function propagateLitUp(node: KnowledgeNode): boolean {
      let hasLit = litUpIds.has(node.id);
      for (const child of node.children) {
        if (propagateLitUp(child)) {
          hasLit = true;
        }
      }
      if (hasLit) litUpIds.add(node.id);
      return hasLit;
    }
    propagateLitUp(state.mindMap);

    // Propagate wrong status up the tree for display
    function propagateWrong(node: KnowledgeNode): boolean {
      let hasWrong = wrongAngleIds.has(node.id);
      for (const child of node.children) {
        if (propagateWrong(child)) hasWrong = true;
      }
      if (hasWrong) wrongAngleIds.add(node.id);
      return hasWrong;
    }
    propagateWrong(state.mindMap);

    const totalAnswered = Object.keys(answers).length;
    const correctCount = practiceQuestions.filter(
      (q) => answers[q.id] === q.correctAnswer,
    ).length;

    return { wrongAngleIds, wrongCounts, wrongQuestionsMap, litUpIds, totalAnswered, correctCount };
  }, [practiceQuestions, answers, state.mindMap]);

  // --- Select Phase ---
  if (phase === 'select') {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">真题练习</h2>
          <Badge variant="outline">{bank.length} 题</Badge>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          从知识点树中选择要练习的考点，系统会从题库中抽取对应题目。点击节点即可选择，支持按科目、知识点、子知识点、出题角度逐级选择。
        </p>

        {/* Knowledge selector + Start button side by side */}
        <div className="flex gap-4">
          {/* Left: Knowledge selector */}
          <Card className="p-4 flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">选择知识点</h3>
              <Badge variant="outline" className="text-[10px]">
                {bank.length} 题库总量
              </Badge>
            </div>
            <KnowledgeSelector
              mindMap={state.mindMap}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
              questionBank={bank}
            />
          </Card>

          {/* Right: Controls panel */}
          <div className="w-[260px] shrink-0 space-y-3">
            {/* Question count selector */}
            {availableQuestions.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">题目数量</h3>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={Math.min(availableQuestions.length, 20)}
                    value={Math.min(questionCount, availableQuestions.length)}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400 w-12 text-center">
                    {Math.min(questionCount, availableQuestions.length)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  可用 {availableQuestions.length} 道
                </p>
              </Card>
            )}

            {/* Start button - always visible and prominent */}
            <Button
              className={cn(
                'w-full text-base font-bold h-14',
                availableQuestions.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                  : '',
              )}
              size="lg"
              disabled={availableQuestions.length === 0}
              onClick={handleStartPractice}
            >
              <Play className="h-5 w-5 mr-2" />
              {availableQuestions.length > 0
                ? `开始练习 (${Math.min(questionCount, availableQuestions.length)} 题)`
                : '请先选择有题目的知识点'}
            </Button>
            {availableQuestions.length === 0 && selectedNodeId && (
              <p className="text-xs text-center text-orange-500">
                该知识点下暂无题目，请选择其他知识点或前往题库添加
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Quiz Phase ---
  if (phase === 'quiz' && practiceQuestions.length > 0) {
    const currentQ = practiceQuestions[currentQIndex];
    const allAnswered = practiceQuestions.every((q) => answers[q.id] !== undefined);

    return (
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-900 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setPhase('select')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回选题
          </Button>
          <span className="text-sm font-medium text-gray-600">
            {pathNameMap[selectedNodeId || ''] || '已选择知识点'}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {Object.keys(answers).length}/{practiceQuestions.length} 已答
            </Badge>
            {allAnswered && (
              <Button
                size="sm"
                onClick={() => setPhase('result')}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                查看结果
              </Button>
            )}
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 overflow-hidden">
          <PracticeQuestionCard
            question={currentQ}
            questionNumber={currentQIndex + 1}
            totalQuestions={practiceQuestions.length}
            selectedAnswer={answers[currentQ.id] || null}
            onSelectAnswer={handleSelectAnswer}
            showResult={showResults[currentQ.id] || false}
            onPrev={() => setCurrentQIndex((i) => Math.max(0, i - 1))}
            onNext={() =>
              setCurrentQIndex((i) => Math.min(practiceQuestions.length - 1, i + 1))
            }
            hasPrev={currentQIndex > 0}
            hasNext={currentQIndex < practiceQuestions.length - 1}
            mindMap={state.mindMap}
          />
        </div>

        {/* Question navigation */}
        <div className="border-t bg-white dark:bg-gray-900 p-3 shrink-0">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {practiceQuestions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              const isCurrent = i === currentQIndex;
              const isCorrect = showResults[q.id] && answers[q.id] === q.correctAnswer;
              const isWrong = showResults[q.id] && answers[q.id] !== q.correctAnswer;

              return (
                <button
                  key={q.id}
                  type="button"
                  className={cn(
                    'w-7 h-7 rounded-md text-xs font-medium transition-colors',
                    isCurrent && 'ring-2 ring-blue-500',
                    isCorrect && 'bg-green-100 text-green-700',
                    isWrong && 'bg-red-100 text-red-700',
                    isAnswered && !isCorrect && !isWrong && 'bg-blue-100 text-blue-700',
                    !isAnswered && !isCurrent && 'bg-gray-100 text-gray-500',
                  )}
                  onClick={() => setCurrentQIndex(i)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- Result Phase ---
  if (phase === 'result' && resultData) {
    const { wrongAngleIds, wrongCounts, wrongQuestionsMap, litUpIds, correctCount } = resultData;
    const totalQuestions = practiceQuestions.length;
    const wrongCount = totalQuestions - correctCount;

    return (
      <div className="flex flex-col h-full">
        {/* Result Header */}
        <div className="p-6 text-center bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900 shrink-0">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">练习完成</h2>
          <div className="mt-3 flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{correctCount}</p>
              <p className="text-xs text-gray-500">正确</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-500">{wrongCount}</p>
              <p className="text-xs text-gray-500">错误</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-600">{totalQuestions}</p>
              <p className="text-xs text-gray-500">总题数</p>
            </div>
          </div>
        </div>

        {/* Mind Map with rectangle color changes */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                知识点变色图
                <Badge variant="secondary" className="text-[10px]">黄色=做对 · 红/黑渐变=做错 · 点击错题数字查看详情</Badge>
              </h3>
              <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900 overflow-x-auto">
                <ResultMindMapRect
                  node={state.mindMap}
                  depth={0}
                  wrongAngleIds={wrongAngleIds}
                  wrongCounts={wrongCounts}
                  litUpIds={litUpIds}
                  wrongQuestionsMap={wrongQuestionsMap}
                />
              </div>
            </Card>

            {/* Wrong questions detail */}
            {wrongCount > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-red-600 flex items-center gap-2 mb-3">
                  <XCircle className="h-4 w-4" />
                  错题详解
                </h3>
                <div className="space-y-3">
                  {practiceQuestions
                    .filter((q) => answers[q.id] !== q.correctAnswer)
                    .map((q) => (
                      <div key={q.id} className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 space-y-2">
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{q.content}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {q.options.map((opt) => (
                            <div
                              key={opt.label}
                              className={cn(
                                'text-xs px-2 py-1.5 rounded',
                                opt.label === q.correctAnswer
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 font-medium'
                                  : opt.label === answers[q.id]
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 line-through'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500',
                              )}
                            >
                              {opt.label}. {opt.text}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">
                          你的答案：<span className="text-red-500 font-medium">{answers[q.id]}</span>
                          {' | '}正确答案：<span className="text-green-500 font-medium">{q.correctAnswer}</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded p-2">
                          {q.explanation}
                        </p>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="border-t bg-white dark:bg-gray-900 p-4 flex justify-center gap-3 shrink-0">
          <Button variant="outline" onClick={() => setPhase('select')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            重新选题
          </Button>
          <Button onClick={handleStartPractice}>
            再练一组
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
