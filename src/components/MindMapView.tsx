'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { KnowledgeNode, NodeType, Question, QuestionBankItem } from '@/lib/types';
import { useAppState } from '@/lib/store';
import { getWrongColor, getWrongTextColor } from '@/lib/color-utils';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Brain,
  Target,
  Lightbulb,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ImageIcon,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// --- Node type config ---
const NODE_TYPE_CONFIG: Record<
  NodeType,
  { label: string; icon: React.ElementType; defaultBg: string; defaultBorder: string }
> = {
  subject: {
    label: '科目',
    icon: BookOpen,
    defaultBg: 'bg-blue-50 dark:bg-blue-950',
    defaultBorder: 'border-blue-300 dark:border-blue-700',
  },
  knowledge: {
    label: '知识点',
    icon: Brain,
    defaultBg: 'bg-indigo-50 dark:bg-indigo-950',
    defaultBorder: 'border-indigo-300 dark:border-indigo-700',
  },
  subknowledge: {
    label: '子知识点',
    icon: Target,
    defaultBg: 'bg-violet-50 dark:bg-violet-950',
    defaultBorder: 'border-violet-300 dark:border-violet-700',
  },
  angle: {
    label: '出题角度',
    icon: Lightbulb,
    defaultBg: 'bg-amber-50 dark:bg-amber-950',
    defaultBorder: 'border-amber-300 dark:border-amber-700',
  },
};

// --- Interactive Question Card ---
function InteractiveQuestionCard({
  question,
  angleNodeId,
}: {
  question: Question;
  angleNodeId: string;
}) {
  const { addAnswerRecord, state } = useAppState();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  // Check if this question was already answered correctly in records
  const alreadyAnsweredCorrectly = useMemo(
    () =>
      state.answerRecords.some(
        (r) => r.questionId === question.id && r.isCorrect,
      ),
    [state.answerRecords, question.id],
  );

  // Check if this question was answered (any)
  const previousAnswer = useMemo(() => {
    const record = state.answerRecords.find((r) => r.questionId === question.id);
    return record ? record.selectedAnswer : null;
  }, [state.answerRecords, question.id]);

  const isCorrect = selectedOption === question.correctAnswer;

  const handleSelectOption = useCallback(
    (label: string) => {
      if (showResult) return; // Already answered
      setSelectedOption(label);
      setShowResult(true);

      const correct = label === question.correctAnswer;
      addAnswerRecord({
        questionId: question.id,
        practiceSetId: 'mindmap-inline',
        selectedAnswer: label,
        isCorrect: correct,
        timestamp: Date.now(),
        linkedAngleId: angleNodeId,
        source: 'mindmap',
      });
    },
    [showResult, question, addAnswerRecord],
  );

  // If already answered correctly before, show completed state
  if (alreadyAnsweredCorrectly && !showResult) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 p-3 text-left shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-[11px] font-medium text-green-700 dark:text-green-400">已完成</span>
        </div>
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
          {question.content}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {question.options.map((opt) => (
            <div
              key={opt.label}
              className={cn(
                'text-[11px] px-2 py-1 rounded',
                opt.label === question.correctAnswer
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
              )}
            >
              {opt.label}. {opt.text}
            </div>
          ))}
        </div>
        {question.explanation && (
          <button
            type="button"
            className="mt-2 text-[11px] text-blue-500 hover:text-blue-700 dark:text-blue-400"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            {showExplanation ? '收起解析' : '查看解析'}
          </button>
        )}
        {showExplanation && (
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {question.explanation}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-left shadow-sm transition-colors',
        showResult
          ? isCorrect
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
      )}
    >
      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
        {question.content}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {question.options.map((opt) => {
          let optClass = 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400';

          if (showResult) {
            if (opt.label === question.correctAnswer) {
              optClass = 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium';
            } else if (opt.label === selectedOption && !isCorrect) {
              optClass = 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium line-through';
            } else {
              optClass = 'bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500';
            }
          } else if (selectedOption === opt.label) {
            optClass = 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-medium';
          }

          return (
            <button
              key={opt.label}
              type="button"
              className={cn('text-[11px] px-2 py-1 rounded text-left transition-colors', optClass)}
              onClick={() => handleSelectOption(opt.label)}
              disabled={showResult}
            >
              {opt.label}. {opt.text}
            </button>
          );
        })}
      </div>

      {showResult && (
        <div className="mt-2 flex items-center gap-2">
          {isCorrect ? (
            <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> 回答正确！
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-medium">
              <XCircle className="h-3.5 w-3.5" /> 回答错误，正确答案：{question.correctAnswer}
            </span>
          )}
        </div>
      )}

      {showResult && question.explanation && (
        <>
          <button
            type="button"
            className="mt-1 text-[11px] text-blue-500 hover:text-blue-700 dark:text-blue-400"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            {showExplanation ? '收起解析' : '查看解析'}
          </button>
          {showExplanation && (
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              {question.explanation}
            </p>
          )}
        </>
      )}

      {previousAnswer && !showResult && (
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          上次选择：{previousAnswer}
        </div>
      )}
    </div>
  );
}

// --- Wrong Question List for Popover ---
function WrongQuestionList({ angleId, angleName }: { angleId: string; angleName: string }) {
  const { state } = useAppState();
  const bank = state.questionBank ?? [];

  // Find wrong questions for this angle from answer records
  const wrongQuestions = useMemo(() => {
    const wrongQIds = new Set<string>();
    for (const record of state.answerRecords) {
      if (!record.isCorrect) {
        wrongQIds.add(record.questionId);
      }
    }
    return bank.filter((q: QuestionBankItem) => q.linkedAngleId === angleId && wrongQIds.has(q.id));
  }, [state.answerRecords, bank, angleId]);

  if (wrongQuestions.length === 0) {
    return <p className="text-xs text-gray-500">暂无错题记录</p>;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
        <XCircle className="h-3.5 w-3.5" />
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

// --- Tree Node Component ---
interface TreeNodeProps {
  node: KnowledgeNode;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  highlightedPath?: Set<string>;
  showQuestions: boolean;
  depth: number;
}

function TreeNodeComponent({
  node,
  expandedNodes,
  onToggleExpand,
  highlightedPath,
  showQuestions,
  depth,
}: TreeNodeProps) {
  const { getNodeStats, isPathLitUp } = useAppState();
  const [showDetails, setShowDetails] = useState(false);
  const hasChildren = node.children.length > 0;
  const hasQuestions = node.questions.length > 0;
  const hasContent = !!(node.content || node.annotation || (node.images && node.images.length > 0));
  const isExpanded = expandedNodes.has(node.id);
  const stats = getNodeStats(node.id);
  const config = NODE_TYPE_CONFIG[node.type];
  const IconComponent = config.icon;

  const isOnHighlightedPath = highlightedPath ? highlightedPath.has(node.id) : false;
  const litUp = isPathLitUp(node);
  const wrongColor = getWrongColor(stats.wrongCount);
  const wrongTextColor = getWrongTextColor(stats.wrongCount);

  // Determine node style
  let nodeBg = config.defaultBg;
  let nodeBorder = config.defaultBorder;
  let nodeTextColor = '';

  if (wrongColor && node.type === 'angle') {
    nodeBg = '';
    nodeBorder = '';
    nodeTextColor = wrongTextColor;
  } else if (litUp && !wrongColor) {
    nodeBg = 'bg-yellow-100 dark:bg-yellow-900';
    nodeBorder = 'border-yellow-400 dark:border-yellow-600';
  }

  if (isOnHighlightedPath) {
    nodeBg = 'bg-yellow-100 dark:bg-yellow-900';
    nodeBorder = 'border-yellow-400 dark:border-yellow-600';
    nodeTextColor = '';
  }

  return (
    <div className="flex flex-col items-center">
      {/* Node rectangle */}
      <div
        className={cn(
          'relative flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 min-w-[110px] max-w-[280px] text-center cursor-pointer transition-all duration-300 hover:shadow-lg select-none',
          nodeBg,
          nodeBorder,
        )}
        style={wrongColor && node.type === 'angle' ? { backgroundColor: wrongColor, borderColor: wrongColor, color: nodeTextColor } : undefined}
        onClick={() => {
          if (hasChildren || hasQuestions) {
            onToggleExpand(node.id);
          }
        }}
      >
        <IconComponent className="h-4 w-4 shrink-0 opacity-70" style={wrongColor && node.type === 'angle' ? { color: nodeTextColor } : undefined} />
        <span
          className="text-sm font-semibold leading-tight truncate"
          style={wrongColor && node.type === 'angle' ? { color: nodeTextColor } : isOnHighlightedPath ? { color: '#92400e' } : undefined}
        >
          {node.name}
        </span>
        {(hasChildren || hasQuestions) && (
          <span className="shrink-0 ml-0.5">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            )}
          </span>
        )}
        {/* Detail toggle button */}
        {hasContent && (
          <button
            type="button"
            className="shrink-0 ml-0.5 hover:opacity-100 opacity-60 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails(!showDetails);
            }}
            title="查看详情"
          >
            {showDetails ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        {stats.wrongCount > 0 && node.type === 'angle' && (
          <Popover>
            <PopoverTrigger asChild>
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 min-w-[20px] text-[10px] px-1 cursor-pointer hover:scale-110 transition-transform"
                onClick={(e) => e.stopPropagation()}
              >
                错{stats.wrongCount}
              </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] max-h-[300px] overflow-auto p-3" side="right" align="start">
              <WrongQuestionList angleId={node.id} angleName={node.name} />
            </PopoverContent>
          </Popover>
        )}
        {stats.correctCount > 0 && litUp && !(wrongColor && node.type === 'angle') && (
          <CheckCircle2 className="absolute -top-2 -right-2 h-5 w-5 text-green-500 bg-white dark:bg-gray-900 rounded-full" />
        )}
      </div>

      {/* Detail panel: content, annotation, images */}
      {showDetails && hasContent && (
        <>
          <div className="w-px h-2 bg-gray-300 dark:bg-gray-600" />
          <div className="w-full max-w-[360px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-left shadow-sm space-y-2">
            {/* Content */}
            {node.content && (
              <div className="flex gap-2">
                <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                  {node.content}
                </p>
              </div>
            )}
            {/* Annotation */}
            {node.annotation && (
              <div className="flex gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed italic">
                  {node.annotation}
                </p>
              </div>
            )}
            {/* Images */}
            {node.images && node.images.length > 0 && (
              <div className="space-y-2">
                {node.images.map((imgUrl, idx) => (
                  <div key={idx} className="relative rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                    <ImageIcon className="absolute top-1 right-1 h-3 w-3 text-gray-400" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imgUrl}
                      alt={`${node.name} - 图${idx + 1}`}
                      className="w-full h-auto max-h-[200px] object-contain bg-gray-50 dark:bg-gray-700"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Expanded content: children tree */}
      {hasChildren && isExpanded && (
        <>
          {/* Vertical connector from parent */}
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

          {/* Children row */}
          <div className="flex">
            {node.children.map((child, index) => (
              <div
                key={child.id}
                className="relative pt-5 px-3"
              >
                {/* Horizontal connector line segments */}
                {node.children.length > 1 && (
                  <div
                    className="absolute top-0 h-px bg-gray-300 dark:bg-gray-600"
                    style={{
                      left: index === 0 ? '50%' : 0,
                      right: index === node.children.length - 1 ? '50%' : 0,
                    }}
                  />
                )}
                {/* Vertical connector to child */}
                <div className="absolute top-0 left-1/2 w-px h-5 bg-gray-300 dark:bg-gray-600 -translate-x-1/2" />

                <TreeNodeComponent
                  node={child}
                  expandedNodes={expandedNodes}
                  onToggleExpand={onToggleExpand}
                  highlightedPath={highlightedPath}
                  showQuestions={showQuestions}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Expanded content: interactive questions */}
      {hasQuestions && isExpanded && showQuestions && (
        <>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
          <div className="w-full max-w-[360px] space-y-2">
            {node.questions.map((q) => (
              <InteractiveQuestionCard
                key={q.id}
                question={q}
                angleNodeId={node.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main Mind Map View ---
interface MindMapViewProps {
  highlightedPath?: Set<string>;
  showQuestions?: boolean;
  collapsedByDefault?: boolean;
  onNodeClick?: (node: KnowledgeNode) => void;
}

export default function MindMapView({
  highlightedPath,
  showQuestions = true,
  collapsedByDefault = false,
  onNodeClick,
}: MindMapViewProps) {
  const { state } = useAppState();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    if (collapsedByDefault) return new Set<string>();
    // Default: expand all
    const expanded = new Set<string>();
    function traverse(node: KnowledgeNode): void {
      if (node.children.length > 0 || node.questions.length > 0) {
        expanded.add(node.id);
      }
      node.children.forEach(traverse);
    }
    traverse(state.mindMap);
    return expanded;
  });

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(
    (expand: boolean) => {
      if (expand) {
        const all = new Set<string>();
        function traverse(node: KnowledgeNode): void {
          if (node.children.length > 0 || node.questions.length > 0) {
            all.add(node.id);
          }
          node.children.forEach(traverse);
        }
        traverse(state.mindMap);
        setExpandedNodes(all);
      } else {
        setExpandedNodes(new Set());
      }
    },
    [state.mindMap],
  );

  // Count stats
  const totalAngles = useMemo(() => {
    let count = 0;
    function traverse(node: KnowledgeNode): void {
      if (node.type === 'angle') count++;
      node.children.forEach(traverse);
    }
    traverse(state.mindMap);
    return count;
  }, [state.mindMap]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">知识点导图</h2>
          <Badge variant="outline" className="text-[11px]">
            {totalAngles} 个出题角度
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleToggleAll(true)}
          >
            全部展开
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleToggleAll(false)}
          >
            全部收起
          </button>
        </div>
      </div>

      {/* Tree container */}
      <ScrollArea className="flex-1">
        <div className="p-8 min-w-max">
          <TreeNodeComponent
            node={state.mindMap}
            expandedNodes={expandedNodes}
            onToggleExpand={(nodeId) => {
              if (onNodeClick) {
                function findNode(n: KnowledgeNode): KnowledgeNode | null {
                  if (n.id === nodeId) return n;
                  for (const child of n.children) {
                    const found = findNode(child);
                    if (found) return found;
                  }
                  return null;
                }
                const found = findNode(state.mindMap);
                if (found) onNodeClick(found);
              }
              handleToggleExpand(nodeId);
            }}
            highlightedPath={highlightedPath}
            showQuestions={showQuestions}
            depth={0}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
