'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ExamResult, KnowledgeNode, PracticeQuestion, QuestionBankItem } from '@/lib/types';
import { useAppState } from '@/lib/store';
import { createId } from '@/lib/sample-data';
import { getWrongColor, getWrongTextColor } from '@/lib/color-utils';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  RotateCcw,
  Trophy,
  AlertTriangle,
  BookOpen,
  Brain,
  Target,
  Lightbulb,
  ArrowLeft,
  Eye,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type ExamPhase = 'select' | 'running' | 'result';

// --- Node type config for result mind map ---
const NODE_TYPE_CONFIG_EXAM: Record<string, { icon: React.ElementType; defaultBg: string; defaultBorder: string }> = {
  subject: { icon: BookOpen, defaultBg: 'bg-blue-50 dark:bg-blue-950', defaultBorder: 'border-blue-300 dark:border-blue-700' },
  knowledge: { icon: Brain, defaultBg: 'bg-indigo-50 dark:bg-indigo-950', defaultBorder: 'border-indigo-300 dark:border-indigo-700' },
  subknowledge: { icon: Target, defaultBg: 'bg-violet-50 dark:bg-violet-950', defaultBorder: 'border-violet-300 dark:border-violet-700' },
  angle: { icon: Lightbulb, defaultBg: 'bg-amber-50 dark:bg-amber-950', defaultBorder: 'border-amber-300 dark:border-amber-700' },
};

// --- Result Mind Map with rectangle nodes ---
function ExamResultMindMap({
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
  wrongQuestionsMap: Record<string, PracticeQuestion[]>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  function hasRelevantDescendant(n: KnowledgeNode): boolean {
    if (wrongAngleIds.has(n.id) || litUpIds.has(n.id)) return true;
    return n.children.some(hasRelevantDescendant);
  }

  const isWrong = wrongAngleIds.has(node.id);
  const isLitUp = litUpIds.has(node.id);
  const hasRelevant = isWrong || isLitUp || hasRelevantDescendant(node);

  if (depth > 0 && !hasRelevant) return null;

  const config = NODE_TYPE_CONFIG_EXAM[node.type] || NODE_TYPE_CONFIG_EXAM.subject;
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
        {/* Wrong count badge - clickable popover */}
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
                  <div key={idx} className="p-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 space-y-1.5">
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
              <ExamResultMindMap
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

export default function ExamView() {
  const { state, addAnswerRecord, dispatch } = useAppState();
  const [phase, setPhase] = useState<ExamPhase>('select');
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showMindMap, setShowMindMap] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedSet = state.practiceSets.find((ps) => ps.id === selectedSetId);
  const currentQuestion = selectedSet?.questions[currentQuestionIndex];

  // Timer
  useEffect(() => {
    if (phase === 'running' && startTime > 0) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, startTime]);

  const selectedSetRef = useRef(selectedSet);
  selectedSetRef.current = selectedSet;
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartExam = useCallback(() => {
    if (!selectedSetId) return;
    setAnswers({});
    setCurrentQuestionIndex(0);
    setExamResult(null);
    setStartTime(Date.now());
    setElapsed(0);
    setPhase('running');
  }, [selectedSetId]);

  const handleSubmitExam = useCallback(() => {
    const currentSet = selectedSetRef.current;
    const currentAnswers = answersRef.current;
    if (!currentSet) return;

    let score = 0;
    const wrongQuestionIds: string[] = [];
    const now = Date.now();

    for (const q of currentSet.questions) {
      const userAnswer = currentAnswers[q.id];
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) {
        score++;
      } else {
        wrongQuestionIds.push(q.id);
      }
      addAnswerRecord({
        questionId: q.id,
        practiceSetId: currentSet.id,
        selectedAnswer: userAnswer || '',
        isCorrect,
        timestamp: now,
        linkedAngleId: q.linkedAngleId,
        source: 'exam',
      });
    }

    const result: ExamResult = {
      id: createId('exam'),
      practiceSetId: currentSet.id,
      answers: { ...currentAnswers },
      score,
      totalQuestions: currentSet.questions.length,
      completedAt: new Date().toISOString(),
      wrongQuestionIds,
    };

    dispatch({ type: 'ADD_EXAM_RESULT', payload: result });
    setExamResult(result);
    setPhase('result');
  }, [addAnswerRecord, dispatch]);

  const answeredCount = selectedSet
    ? selectedSet.questions.filter((q) => answers[q.id] !== undefined).length
    : 0;

  // Compute mind map coloring for result
  const resultMindMapData = useMemo(() => {
    if (!examResult || !selectedSet) return null;

    const wrongAngleIds = new Set<string>();
    const litUpIds = new Set<string>();
    const wrongCounts: Record<string, number> = {};
    const wrongQuestionsMap: Record<string, PracticeQuestion[]> = {};

    for (const q of selectedSet.questions) {
      const userAnswer = examResult.answers[q.id];
      if (userAnswer === q.correctAnswer) {
        litUpIds.add(q.linkedAngleId);
      } else {
        wrongAngleIds.add(q.linkedAngleId);
        wrongCounts[q.linkedAngleId] = (wrongCounts[q.linkedAngleId] || 0) + 1;
        if (!wrongQuestionsMap[q.linkedAngleId]) {
          wrongQuestionsMap[q.linkedAngleId] = [];
        }
        wrongQuestionsMap[q.linkedAngleId].push(q);
      }
    }

    // Propagate lit-up
    function propagateLitUp(node: KnowledgeNode): boolean {
      let hasLit = litUpIds.has(node.id);
      for (const child of node.children) {
        if (propagateLitUp(child)) hasLit = true;
      }
      if (hasLit) litUpIds.add(node.id);
      return hasLit;
    }
    propagateLitUp(state.mindMap);

    // Propagate wrong
    function propagateWrong(node: KnowledgeNode): boolean {
      let hasWrong = wrongAngleIds.has(node.id);
      for (const child of node.children) {
        if (propagateWrong(child)) hasWrong = true;
      }
      if (hasWrong) wrongAngleIds.add(node.id);
      return hasWrong;
    }
    propagateWrong(state.mindMap);

    return { wrongAngleIds, wrongCounts, wrongQuestionsMap, litUpIds };
  }, [examResult, selectedSet, state.mindMap]);

  // --- Select Phase ---
  if (phase === 'select') {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">套卷模式</h2>
        </div>

        {state.practiceSets.length === 0 ? (
          <Card className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">暂无套题，请先在数据管理中导入套题</p>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              选择一套题目开始考试，完成后提交试卷。错误题目将触发对应知识点角度区域的颜色变化。
            </p>
            {state.practiceSets.map((ps) => {
              const isSelected = selectedSetId === ps.id;
              return (
                <Card
                  key={ps.id}
                  className={cn(
                    'p-4 cursor-pointer transition-all',
                    isSelected
                      ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'hover:shadow-md',
                  )}
                  onClick={() => setSelectedSetId(ps.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {ps.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {ps.questions.length} 道题 · 创建于{' '}
                        {new Date(ps.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                </Card>
              );
            })}

            <Button
              className="w-full mt-4"
              disabled={!selectedSetId}
              onClick={handleStartExam}
            >
              开始考试
            </Button>
          </div>
        )}
      </div>
    );
  }

  // --- Running Phase ---
  if (phase === 'running' && selectedSet && currentQuestion) {
    return (
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-900 shrink-0">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              {answeredCount}/{selectedSet.questions.length} 已答
            </Badge>
            <Progress
              value={(answeredCount / selectedSet.questions.length) * 100}
              className="w-32 h-2"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            {formatTime(elapsed)}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Send className="h-3.5 w-3.5 mr-1" />
                交卷
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认交卷？</AlertDialogTitle>
                <AlertDialogDescription>
                  {answeredCount < selectedSet.questions.length ? (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      还有 {selectedSet.questions.length - answeredCount} 题未作答！
                    </span>
                  ) : (
                    '所有题目已作答。'
                  )}
                  交卷后将无法修改答案。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>继续答题</AlertDialogCancel>
                <AlertDialogAction onClick={handleSubmitExam}>确认交卷</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Question content */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-2xl mx-auto space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  第 {currentQuestionIndex + 1} 题
                </Badge>
                {currentQuestion.linkedAngleName && (
                  <Badge variant="outline" className="text-xs">
                    {currentQuestion.linkedAngleName}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
                {currentQuestion.content}
              </p>
            </Card>

            {/* Options */}
            <div className="space-y-2">
              {currentQuestion.options.map((opt) => {
                const isSelected = answers[currentQuestion.id] === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={cn(
                      'w-full text-left p-3 rounded-lg border-2 transition-all duration-200',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600',
                    )}
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt.label }))
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold',
                          isSelected
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-gray-300 dark:border-gray-600',
                        )}
                      >
                        {opt.label}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">
                        {opt.text}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* Bottom navigation */}
        <div className="border-t bg-white dark:bg-gray-900 p-3 shrink-0">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {selectedSet.questions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              const isCurrent = i === currentQuestionIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  className={cn(
                    'w-7 h-7 rounded-md text-xs font-medium transition-colors',
                    isCurrent && 'ring-2 ring-blue-500',
                    isAnswered && 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
                    !isAnswered && !isCurrent && 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                  )}
                  onClick={() => setCurrentQuestionIndex(i)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
              disabled={currentQuestionIndex === 0}
            >
              上一题
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentQuestionIndex((i) =>
                  Math.min(selectedSet.questions.length - 1, i + 1),
                )
              }
              disabled={currentQuestionIndex === selectedSet.questions.length - 1}
            >
              下一题
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Result Phase ---
  if (phase === 'result' && examResult && selectedSet) {
    const scorePercentage = (examResult.score / examResult.totalQuestions) * 100;

    return (
      <div className="flex flex-col h-full">
        {/* Result Header */}
        <div className="p-6 text-center bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900 shrink-0">
          <Trophy
            className={cn(
              'h-16 w-16 mx-auto mb-3',
              scorePercentage >= 80
                ? 'text-yellow-500'
                : scorePercentage >= 60
                  ? 'text-blue-500'
                  : 'text-gray-400',
            )}
          />
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {scorePercentage >= 80 ? '优秀！' : scorePercentage >= 60 ? '不错！' : '继续加油！'}
          </h2>
          <div className="mt-3 flex items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{examResult.score}</p>
              <p className="text-xs text-gray-500">正确</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-500">
                {examResult.totalQuestions - examResult.score}
              </p>
              <p className="text-xs text-gray-500">错误</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-600">{examResult.totalQuestions}</p>
              <p className="text-xs text-gray-500">总题数</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            用时 {formatTime(elapsed)} · 正确率 {scorePercentage.toFixed(1)}%
          </p>
        </div>

        {/* Mind Map + Wrong questions */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Toggle Mind Map */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  知识点变色图
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMindMap(!showMindMap)}
                >
                  {showMindMap ? '收起' : '展开'}
                </Button>
              </div>
              {showMindMap && resultMindMapData && (
                <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-3 rounded bg-yellow-200 border border-yellow-400" />
                      <span className="text-[10px] text-gray-500">做对点亮</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-3 rounded bg-red-200 border border-red-400" />
                      <span className="text-[10px] text-gray-500">做错变色</span>
                    </div>
                  </div>
                  <ExamResultMindMap
                    node={state.mindMap}
                    depth={0}
                    wrongAngleIds={resultMindMapData.wrongAngleIds}
                    wrongCounts={resultMindMapData.wrongCounts}
                    litUpIds={resultMindMapData.litUpIds}
                    wrongQuestionsMap={resultMindMapData.wrongQuestionsMap}
                  />
                </div>
              )}
            </Card>

            {/* Wrong questions detail */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
                <XCircle className="h-4 w-4 text-red-500" />
                错误题目详解
              </h3>

              {examResult.wrongQuestionIds.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="text-sm text-green-600 dark:text-green-400">全部正确，太棒了！</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedSet.questions
                    .filter((q) => examResult.wrongQuestionIds.includes(q.id))
                    .map((q) => (
                      <div key={q.id} className="p-3 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
                            {q.content}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 ml-6">
                          {q.options.map((opt) => (
                            <div
                              key={opt.label}
                              className={cn(
                                'text-xs px-2 py-1.5 rounded',
                                opt.label === q.correctAnswer
                                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium'
                                  : opt.label === examResult.answers[q.id]
                                    ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 line-through'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                              )}
                            >
                              {opt.label}. {opt.text}
                            </div>
                          ))}
                        </div>
                        <div className="ml-6 space-y-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            你的答案：
                            <span className="text-red-500 font-medium">{examResult.answers[q.id]}</span>
                            {' | '}正确答案：
                            <span className="text-green-500 font-medium">{q.correctAnswer}</span>
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            关联考点：
                            <Badge variant="outline" className="text-[10px] ml-1">
                              {q.linkedAngleName}
                            </Badge>
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2">
                            {q.explanation}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="border-t bg-white dark:bg-gray-900 p-4 flex justify-center gap-3 shrink-0">
          <Button variant="outline" onClick={() => setPhase('select')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回选择
          </Button>
          <Button
            onClick={() => {
              setAnswers({});
              setCurrentQuestionIndex(0);
              setStartTime(Date.now());
              setElapsed(0);
              setExamResult(null);
              setPhase('running');
            }}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            重新考试
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
