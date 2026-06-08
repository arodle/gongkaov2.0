'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import type { BehaviorEventRecord, BehaviorEventType, QuestionBankItem } from '@/types';
import { normalizeBehaviorEvent } from '@/lib/behavior-events';
import {
  QUANTITY_STRATEGY_LABELS,
  WRONG_REASON_LABELS,
  advanceReviewMeta,
  buildDailyTrainingPlan,
  createDefaultReviewMeta,
  getAverageAnswerTimeByType,
  getQuestionTypeLabel,
  recordReviewAttempt,
  type DailyTrainingPlanSummary,
  type QuantityStrategyTag,
  type QuestionReviewMeta,
  type WrongReasonTag,
} from '@/lib/practice-insights';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Lightbulb,
  AlertTriangle,
  BookOpen,
  ArrowLeft,
  Send,
  Timer,
  Highlighter,
  Circle,
  Ban,
  StickyNote,
} from 'lucide-react';

interface TextSelectionInfo {
  text: string;
  start: number;
  end: number;
}

interface TextMark {
  id: string;
  type: 'highlight' | 'circle';
  start: number;
  end: number;
  text: string;
}

const REVIEW_META_STORAGE_KEY = 'gongkao:question-review-meta';

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

function formatDurationMs(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return '--';
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

function getSelectionInfo(container: HTMLElement | null): TextSelectionInfo | null {
  if (!container) return null;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let start: number | null = null;
  let end: number | null = null;
  let current = walker.nextNode();

  while (current) {
    const length = current.textContent?.length || 0;
    if (current === range.startContainer) start = offset + range.startOffset;
    if (current === range.endContainer) end = offset + range.endOffset;
    offset += length;
    current = walker.nextNode();
  }

  if (start === null || end === null || end <= start) return null;
  return { text: range.toString(), start, end };
}

function renderMarkedText(text: string, marks: TextMark[]) {
  const sorted = [...marks]
    .filter(mark => mark.start >= 0 && mark.end <= text.length && mark.end > mark.start)
    .sort((a, b) => a.start - b.start);
  const result: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach(mark => {
    if (mark.start < cursor) return;
    if (mark.start > cursor) result.push(text.slice(cursor, mark.start));

    const content = text.slice(mark.start, mark.end);
    result.push(
      <span
        key={mark.id}
        className={[
          mark.type === 'highlight'
            ? 'rounded bg-yellow-200/80 px-0.5'
            : 'rounded-full border-2 border-red-400 px-1',
        ].join(' ')}
      >
        {content}
      </span>
    );
    cursor = mark.end;
  });

  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function restoreQuestionBehaviorEvents(events: BehaviorEventRecord[], textLength: number) {
  const marks: TextMark[] = [];
  const struckOptions = new Set<string>();
  let latestNote = '';
  let maxOrder = 0;

  const sorted = events.map(normalizeBehaviorEvent).sort((a, b) => {
    const orderA = typeof a.metadata?.order === 'number' ? a.metadata.order : 0;
    const orderB = typeof b.metadata?.order === 'number' ? b.metadata.order : 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.startTime.localeCompare(b.startTime);
  });

  sorted.forEach(event => {
    const order = typeof event.metadata?.order === 'number' ? event.metadata.order : 0;
    maxOrder = Math.max(maxOrder, order);

    if (event.eventType === 'highlight' || event.eventType === 'circle') {
      const startOffset = event.metadata?.startOffset;
      const endOffset = event.metadata?.endOffset;
      if (typeof startOffset === 'number' && typeof endOffset === 'number' && endOffset <= textLength) {
        marks.push({
          id: event.id || `${event.eventType}_${startOffset}_${endOffset}`,
          type: event.eventType,
          start: startOffset,
          end: endOffset,
          text: typeof event.metadata?.selectedText === 'string' ? event.metadata.selectedText : '',
        });
      }
    }

    if (event.eventType === 'strike') {
      const optionLabel = typeof event.metadata?.optionLabel === 'string'
        ? event.metadata.optionLabel
        : event.target.replace('option:', '');
      const active = event.metadata?.active !== false;
      if (active) struckOptions.add(optionLabel);
      else struckOptions.delete(optionLabel);
    }

    if (event.eventType === 'note' && typeof event.metadata?.note === 'string') {
      latestNote = event.metadata.note;
    }
  });

  return { marks, struckOptions, latestNote, maxOrder };
}

interface QuestionCardProps {
  question: QuestionBankItem;
  questionNumber: number;
  totalQuestions: number;
  onAnswer?: (selectedAnswer: string, isCorrect: boolean, answerTime: number) => void;
  showDrawing?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  onExit?: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  isLastQuestion: boolean;
  hasAnswered: boolean;
  elapsedTime: number;
  answerMode?: 'instant' | 'batch';
  userAnswer?: string;
  onSelectAnswer?: (answer: string) => void;
}

export function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  onPrev,
  onNext,
  onSubmit,
  onExit,
  canGoPrev,
  isLastQuestion,
  hasAnswered,
  elapsedTime,
  answerMode = 'instant',
  userAnswer,
  onSelectAnswer,
}: QuestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [startTime, setStartTime] = useState(() => Date.now());
  const [showExplanation, setShowExplanation] = useState(false);
  const [textMarks, setTextMarks] = useState<TextMark[]>([]);
  const [struckOptions, setStruckOptions] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState('');
  const questionTextRef = useRef<HTMLParagraphElement | null>(null);
  const noteStartTimeRef = useRef<string | null>(null);
  const eventOrderRef = useRef(0);
  const recordBehaviorEvent = useAppStore(state => state.recordBehaviorEvent);
  const behaviorEvents = useAppStore(state => state.behaviorEvents);
  const loadBehaviorEventsForQuestion = useAppStore(state => state.loadBehaviorEventsForQuestion);
  const questionBehaviorEvents = useMemo(
    () => behaviorEvents.filter(event => event.questionId === question.id),
    [behaviorEvents, question.id],
  );
  useEffect(() => {
    setSelectedOption(userAnswer || null);
    setShowResult(!!userAnswer);
    setStartTime(Date.now());
    setShowExplanation(false);
    setTextMarks([]);
    setStruckOptions(new Set());
    setNoteDraft('');
    noteStartTimeRef.current = null;
    eventOrderRef.current = 0;
  }, [question.id, userAnswer]);

  useEffect(() => {
    void loadBehaviorEventsForQuestion(question.id);
  }, [loadBehaviorEventsForQuestion, question.id]);

  useEffect(() => {
    const restored = restoreQuestionBehaviorEvents(questionBehaviorEvents, question.content.length);
    setTextMarks(restored.marks);
    setStruckOptions(restored.struckOptions);
    setNoteDraft(restored.latestNote);
    eventOrderRef.current = restored.maxOrder;
  }, [question.content.length, questionBehaviorEvents]);

  const recordEvent = useCallback((
    eventType: BehaviorEventType,
    target: string,
    metadata: Record<string, unknown>,
    startTimeValue?: string,
  ) => {
    const now = new Date().toISOString();
    eventOrderRef.current += 1;
    recordBehaviorEvent({
      questionId: question.id,
      eventType,
      target,
      startTime: startTimeValue || now,
      endTime: now,
      metadata: {
        order: eventOrderRef.current,
        elapsedMs: Date.now() - startTime,
        ...metadata,
      },
    });
  }, [question.id, recordBehaviorEvent, startTime]);

  const handleTextMark = useCallback((type: 'highlight' | 'circle') => {
    const selectionInfo = getSelectionInfo(questionTextRef.current);
    if (!selectionInfo) return;

    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setTextMarks(prev => [...prev, { id, type, ...selectionInfo }]);
    recordEvent(type, 'question_text', {
      selectedText: selectionInfo.text,
      startOffset: selectionInfo.start,
      endOffset: selectionInfo.end,
    });
    window.getSelection()?.removeAllRanges();
  }, [recordEvent]);

  const handleStrikeOption = useCallback((label: string, optionText: string) => {
    setStruckOptions(prev => {
      const next = new Set(prev);
      const nextState = !next.has(label);
      if (nextState) next.add(label);
      else next.delete(label);
      recordEvent('strike', `option:${label}`, {
        optionLabel: label,
        optionText,
        active: nextState,
      });
      return next;
    });
  }, [recordEvent]);

  const handleSaveNote = useCallback(() => {
    const note = noteDraft.trim();
    if (!note) return;

    recordEvent('note', 'question_note', { note }, noteStartTimeRef.current || undefined);
    setNoteDraft('');
    noteStartTimeRef.current = null;
  }, [noteDraft, recordEvent]);

  const handleSelectOption = useCallback((label: string) => {
    const previousAnswer = selectedOption || userAnswer;
    if (previousAnswer && previousAnswer !== label) {
      recordEvent('answer_change', `option:${label}`, {
        from: previousAnswer,
        to: label,
      });
    } else if (!previousAnswer) {
      recordEvent('answer_select', `option:${label}`, { selectedAnswer: label });
    }

    if (answerMode === 'batch') {
      setSelectedOption(label);
      onSelectAnswer?.(label);
      return;
    }

    if (showResult) return;

    setSelectedOption(label);
    setShowResult(true);

    const isCorrect = label === question.correctAnswer;
    const answerTime = Date.now() - startTime;

    onSelectAnswer?.(label);
    onAnswer?.(label, isCorrect, answerTime);
  }, [answerMode, userAnswer, selectedOption, showResult, question, startTime, onAnswer, onSelectAnswer, recordEvent]);

  const isCorrect = answerMode === 'batch' ? false : (selectedOption || userAnswer) === question.correctAnswer;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const shouldShowResult = 
    answerMode === 'instant' 
      ? showResult 
      : hasAnswered;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between px-1 sm:px-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExit} className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" />
            退出
          </Button>
          <Badge variant="outline" className="text-sm">
            第 {questionNumber} / {totalQuestions} 题
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
          <Timer className="h-4 w-4" />
          <span className="font-mono">{formatTime(elapsedTime)}</span>
        </div>
      </div>

      <Progress
        value={(questionNumber / totalQuestions) * 100}
        className="h-1"
      />

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border bg-white/80 p-1.5 shadow-sm sm:flex-wrap sm:gap-2 sm:rounded-xl sm:p-2">
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2 sm:h-9 sm:px-3" onClick={() => handleTextMark('highlight')} aria-label="高亮选中文字">
          <Highlighter className="h-4 w-4" />
          <span className="hidden sm:inline">高亮</span>
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2 sm:h-9 sm:px-3" onClick={() => handleTextMark('circle')} aria-label="圈选选中文字">
          <Circle className="h-4 w-4" />
          <span className="hidden sm:inline">圈选</span>
        </Button>
        <Badge variant="secondary" className="shrink-0 text-[11px] sm:text-xs">
          选中题干文字后使用
        </Badge>
      </div>

      <Card className={`border-2 transition-colors ${
        answerMode === 'batch' && !hasAnswered
          ? 'border-transparent'
          : shouldShowResult
          ? isCorrect
            ? 'border-[#b7e3ff] bg-[#b7e3ff]/30 dark:bg-violet-900/20'
            : 'border-red-500 bg-red-50 dark:bg-red-900/20'
          : (answerMode === 'batch' && userAnswer)
          ? 'border-primary bg-primary/5'
          : 'border-transparent'
      }`}>
        <CardContent className="p-4 sm:p-6">
          <p
            ref={questionTextRef}
            className="text-base sm:text-lg leading-relaxed whitespace-pre-line"
          >
            {renderMarkedText(question.content, textMarks)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:gap-3">
        {question.options.map((option) => {
          let optionClass = 'border-2 hover:border-primary hover:bg-accent transition-all';
          const currentAnswer = answerMode === 'batch' ? userAnswer : selectedOption;

          if (answerMode === 'batch' && !hasAnswered) {
            if (currentAnswer === option.label) {
              optionClass = 'border-primary bg-primary/10';
            }
          } else if (shouldShowResult) {
            if (option.label === question.correctAnswer) {
              optionClass = 'border-[#b7e3ff] bg-[#b7e3ff]/35 text-[#5e5394] dark:bg-violet-900/30 dark:text-violet-200';
            } else if (option.label === currentAnswer && !isCorrect) {
              optionClass = 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 line-through';
            } else {
              optionClass = 'border-gray-200 dark:border-gray-700 opacity-50';
            }
          } else if (currentAnswer === option.label) {
            optionClass = 'border-primary bg-primary/10';
          }

          const isStruck = struckOptions.has(option.label);

          return (
            <div
              key={option.label}
              className="flex items-stretch gap-2 rounded-xl"
            >
              <Button
                type="button"
                variant={isStruck ? 'destructive' : 'outline'}
                size="icon"
                className="mt-1 h-9 w-9 shrink-0"
                onClick={() => handleStrikeOption(option.label, option.text)}
                aria-label={`划掉选项 ${option.label}`}
              >
                <Ban className="h-4 w-4" />
              </Button>
              <motion.button
                whileHover={!shouldShowResult ? { scale: 1.01 } : {}}
                whileTap={!shouldShowResult ? { scale: 0.99 } : {}}
                onClick={() => handleSelectOption(option.label)}
                disabled={shouldShowResult}
                className={`w-full p-3 sm:p-4 rounded-xl text-left flex items-start gap-2 sm:gap-3 ${optionClass} ${isStruck ? 'opacity-60' : ''}`}
              >
                <span className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center font-semibold text-sm">
                  {option.label}
                </span>
                <span className={`flex-1 pt-0.5 sm:pt-1 text-sm sm:text-base ${isStruck ? 'line-through decoration-2' : ''}`}>{option.text}</span>
                {answerMode !== 'batch' && shouldShowResult && option.label === question.correctAnswer && (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[#a49aff] sm:h-6 sm:w-6" />
                )}
                {answerMode !== 'batch' && shouldShowResult && option.label === currentAnswer && !isCorrect && (
                  <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-500 flex-shrink-0" />
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-white/80 p-2.5 shadow-sm sm:rounded-xl sm:p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4" />
          简短备注
        </div>
        <div className="flex gap-2">
          <input
            value={noteDraft}
            onFocus={() => {
              noteStartTimeRef.current ||= new Date().toISOString();
            }}
            onChange={(event) => setNoteDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSaveNote();
            }}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="记录一句思路或疑问"
          />
          <Button type="button" size="sm" onClick={handleSaveNote} disabled={!noteDraft.trim()} aria-label="保存备注">
            <span className="hidden sm:inline">保存</span>
            <span className="sm:hidden">存</span>
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {shouldShowResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            <div className={`p-3 sm:p-4 rounded-xl flex items-center gap-2 sm:gap-3 ${
              isCorrect
                ? 'bg-[#b7e3ff]/35 text-[#5e5394] dark:bg-violet-900/30 dark:text-violet-200'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {isCorrect ? (
                <>
                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="font-semibold text-sm sm:text-base">回答正确！</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="font-semibold text-sm sm:text-base">回答错误，正确答案是 {question.correctAnswer}</span>
                </>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExplanation(!showExplanation)}
              >
                <Lightbulb className="h-4 w-4 mr-2" />
                {showExplanation ? '收起解析' : '查看解析'}
              </Button>
            </div>

            {showExplanation && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800"
              >
                <p className="text-sm leading-relaxed">
                  {question.explanation}
                </p>
                {question.images && question.images.length > 0 && (
                  <div className="mt-3 sm:mt-4 grid grid-cols-1 gap-2">
                    {question.images.map((img, idx) => (
                      <Image
                        key={idx}
                        src={img}
                        alt={`解析图片 ${idx + 1}`}
                        width={720}
                        height={360}
                        unoptimized
                        className="h-auto max-h-48 w-auto rounded-lg border object-contain sm:max-h-64"
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky-bottom-bar p-3 sm:p-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <Button
            variant="outline"
            onClick={onPrev}
            disabled={!canGoPrev}
            className="flex-1 sm:flex-none sm:w-auto"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一题
          </Button>

          <div className="flex gap-2 sm:gap-3">
            {!isLastQuestion ? (
              <Button
                variant="default"
                onClick={onNext}
                disabled={!userAnswer}
                className="flex-1 sm:flex-none sm:w-auto"
              >
                下一题
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={onSubmit}
                className="flex-1 sm:flex-none sm:w-auto"
                disabled={!userAnswer || (answerMode === 'batch' ? !hasAnswered : false)}
              >
                <Send className="h-4 w-4 mr-1" />
                提交整卷
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface PracticeSelectorProps {
  onSelectMode: (mode: 'sequence' | 'random' | 'targeted' | 'exam') => void;
  onSelectExamPaper?: (paperName: string) => void;
  onStartDailyPlan?: () => void;
  examPapers?: Array<{ name: string; questionCount: number }>;
  dailyPlanCount?: number;
  dailyPlanSummary?: DailyTrainingPlanSummary;
}

export function PracticeSelector({
  onSelectMode,
  onSelectExamPaper,
  onStartDailyPlan,
  examPapers = [],
  dailyPlanCount = 0,
  dailyPlanSummary,
}: PracticeSelectorProps) {
  const { nodes, getWeakNodes } = useAppStore();
  const weakNodes = getWeakNodes();

  const modeCards = [
    {
      mode: 'sequence' as const,
      icon: BookOpen,
      title: '顺序练习',
      description: '按知识图谱层级依次练习，从基础开始稳步提升',
      badge: `${nodes.length} 个知识点`,
      bgColor: 'bg-sky-50 dark:bg-sky-900/30',
      iconColor: 'text-sky-600 dark:text-sky-400',
    },
    {
      mode: 'random' as const,
      icon: Target,
      title: '随机练习',
      description: '从全部题库随机抽取，全面覆盖各个知识点',
      badge: '随机打乱',
      bgColor: 'bg-violet-50 dark:bg-violet-900/30',
      iconColor: 'text-violet-500 dark:text-violet-300',
    },
    {
      mode: 'targeted' as const,
      icon: AlertTriangle,
      title: '靶向练习',
      description: '专注练习 PS < 80 的薄弱知识点，针对性强化',
      badge: '针对薄弱点',
      badgeVariant: 'destructive' as const,
      bgColor: 'bg-rose-50 dark:bg-rose-900/30',
      iconColor: 'text-rose-500 dark:text-rose-300',
      weakCount: weakNodes.length,
    },
    {
      mode: 'exam' as const,
      icon: Clock,
      title: '套卷练习',
      description: '完整试卷定时模拟，检验整体学习效果',
      badge: '计时模式',
      bgColor: 'bg-[#ffccff]/45 dark:bg-violet-900/30',
      iconColor: 'text-[#8f83f5] dark:text-violet-300',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {modeCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.mode}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full"
            >
              <Card
                className="h-full cursor-pointer border-white/70 bg-white/86 shadow-[0_16px_40px_rgba(31,80,96,0.06)] transition-colors hover:border-primary/35 hover:bg-white"
                onClick={() => onSelectMode(card.mode)}
              >
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className={`p-2 rounded-lg ${card.bgColor}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                    <div className="space-y-1 sm:space-y-2 flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base md:text-lg">{card.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                        {card.description}
                      </p>
                      <Badge variant={card.badgeVariant || 'secondary'} className="text-[10px] sm:text-xs">
                        {card.badge}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Card className="border-cyan-100 bg-cyan-50/60">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-cyan-950">每日训练计划</div>
                <p className="mt-1 text-xs leading-5 text-cyan-800">
                  自动混合到期二刷、错题和未练题，建议每天完成 10-20 题。
                </p>
              </div>
              <Badge variant="outline" className="bg-white text-cyan-700">{dailyPlanCount} 题</Badge>
            </div>
            {dailyPlanSummary && dailyPlanSummary.total > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['到期二刷', dailyPlanSummary.dueReview],
                  ['错题回炉', dailyPlanSummary.wrongReview],
                  ['未练新题', dailyPlanSummary.fresh],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-md border border-cyan-100 bg-white px-2 py-1.5 text-center">
                    <div className="text-[11px] text-cyan-800">{label}</div>
                    <div className="mt-0.5 text-sm font-semibold text-cyan-950">{count}</div>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" size="sm" onClick={onStartDailyPlan} disabled={!onStartDailyPlan || dailyPlanCount === 0}>
              开始今日计划
            </Button>
          </CardContent>
        </Card>

        <Card className="border-violet-100 bg-white">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-950">选择套卷完整作答</div>
                <p className="mt-1 text-xs text-muted-foreground">按同一套真题完整进入整卷提交模式。</p>
              </div>
              <Badge variant="outline">{examPapers.length} 套</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {examPapers.slice(0, 6).map(paper => (
                <button
                  key={paper.name}
                  type="button"
                  className="rounded-lg border bg-slate-50 p-3 text-left transition hover:border-violet-200 hover:bg-violet-50"
                  onClick={() => onSelectExamPaper?.(paper.name)}
                >
                  <div className="line-clamp-1 text-sm font-medium">{paper.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{paper.questionCount} 题 · 整卷提交</div>
                </button>
              ))}
              {examPapers.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2">
                  暂无已归类套卷，先在题库管理中给题目绑定套卷。
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface PracticeSessionProps {
  questions: QuestionBankItem[];
  mode: 'sequence' | 'random' | 'targeted' | 'exam';
  answerMode?: 'instant' | 'batch';
  sessionTitle?: string;
  onComplete: (results: { correct: number; wrong: number; details: PracticeAnswerResult[] }) => void;
  onExit: () => void;
}

interface PracticeAnswerResult {
  question: QuestionBankItem;
  selectedAnswer: string;
  isCorrect: boolean;
  answerTime: number;
  timestamp: number;
  averageTime?: number;
}

export function PracticeSession({ questions, mode, answerMode = 'instant', sessionTitle, onComplete, onExit }: PracticeSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<PracticeAnswerResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: string }>({});
  const [isRunning, setIsRunning] = useState(true);
  const { updateNodePSScore, addAnswer, practiceRecords, questionBank } = useAppStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const averageTimeByType = useMemo(() => (
    getAverageAnswerTimeByType(questionBank, practiceRecords)
  ), [practiceRecords, questionBank]);

  useEffect(() => {
    if (!isRunning || questions.length === 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, questions.length]);

  const currentQuestion = questions[currentIndex];
  const currentUserAnswer = userAnswers[currentIndex];
  const hasAnsweredCurrent = currentUserAnswer !== undefined;
  const hasAnsweredAll = Object.keys(userAnswers).length === questions.length;

  const handleAnswer = useCallback(async (selectedAnswer: string, isCorrect: boolean, answerTime: number) => {
    if (!currentQuestion) return;

    setUserAnswers(prev => ({ ...prev, [currentIndex]: selectedAnswer }));

    const answer = {
      question: currentQuestion,
      selectedAnswer,
      isCorrect,
      answerTime,
      timestamp: Date.now(),
      averageTime: averageTimeByType.get(getQuestionTypeLabel(currentQuestion)),
    };

    setAnswers(prev => [...prev, answer]);

    addAnswer({
      questionId: currentQuestion.id,
      practiceSetId: `practice_${mode}`,
      selectedAnswer,
      isCorrect,
      timestamp: Date.now(),
      linkedAngleId: currentQuestion.linkedAngleId,
      source: 'practice',
    });

    if (currentQuestion.linkedAngleId) {
      await updateNodePSScore(currentQuestion.linkedAngleId, isCorrect);
    }
  }, [averageTimeByType, currentQuestion, currentIndex, mode, addAnswer, updateNodePSScore]);

  const handleSelectAnswer = useCallback((selectedAnswer: string) => {
    setUserAnswers(prev => ({ ...prev, [currentIndex]: selectedAnswer }));
  }, [currentIndex]);

  const handleSubmit = useCallback(async () => {
    setIsRunning(false);

    const unanswered = questions.some((_, i) => !userAnswers[i]);
    if (unanswered) {
      setIsRunning(true);
      alert('请完成所有题目再提交！');
      return;
    }

    const allAnswers = questions.map((q, idx) => {
      const selectedAnswer = userAnswers[idx];
      const isCorrect = selectedAnswer === q.correctAnswer;
      return {
        question: q,
        selectedAnswer,
        isCorrect,
        answerTime: answerMode === 'batch'
          ? elapsedTime / questions.length * 1000
          : answers.find(answer => answer.question.id === q.id)?.answerTime || 0,
        timestamp: Date.now(),
        averageTime: averageTimeByType.get(getQuestionTypeLabel(q)),
      };
    });

    if (answerMode === 'batch') {
      for (const answer of allAnswers) {
        if (answer.question.linkedAngleId) {
          await updateNodePSScore(answer.question.linkedAngleId, answer.isCorrect);
        }
        addAnswer({
          questionId: answer.question.id,
          practiceSetId: `practice_${mode}`,
          selectedAnswer: answer.selectedAnswer || '',
          isCorrect: answer.isCorrect,
          timestamp: Date.now(),
          linkedAngleId: answer.question.linkedAngleId,
          source: 'practice',
        });
      }

      setAnswers(allAnswers);
      setIsComplete(true);
      onComplete({
        correct: allAnswers.filter(a => a.isCorrect).length,
        wrong: allAnswers.filter(a => !a.isCorrect).length,
        details: allAnswers,
      });
    } else {
      setIsComplete(true);
      onComplete({
        correct: allAnswers.filter(a => a.isCorrect).length,
        wrong: allAnswers.filter(a => !a.isCorrect).length,
        details: allAnswers,
      });
    }
  }, [answerMode, questions, userAnswers, elapsedTime, averageTimeByType, updateNodePSScore, addAnswer, mode, answers, onComplete]);

  const handleExitConfirm = useCallback(() => {
    setIsRunning(false);
    onExit();
  }, [onExit]);

  const handleQuestionJump = useCallback((idx: number) => {
    if (currentUserAnswer) {
      setUserAnswers(prev => ({ ...prev, [currentIndex]: currentUserAnswer }));
    }
    setCurrentIndex(idx);
  }, [currentIndex, currentUserAnswer]);

  const handleNext = useCallback(() => {
    if (currentUserAnswer) {
      setUserAnswers(prev => ({ ...prev, [currentIndex]: currentUserAnswer }));
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, questions.length, currentUserAnswer]);

  const handlePrev = useCallback(() => {
    if (currentUserAnswer) {
      setUserAnswers(prev => ({ ...prev, [currentIndex]: currentUserAnswer }));
    }
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, currentUserAnswer]);

  if (!questions || questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-6 sm:p-8 text-center">
            <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-amber-500" />
            <h3 className="text-base sm:text-lg font-semibold mb-2">暂无练习题目</h3>
            <p className="text-sm text-muted-foreground">
              题库为空或没有符合当前筛选条件的题目
            </p>
            <Button variant="outline" className="mt-3 sm:mt-4" onClick={onExit}>
              返回练习选择
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return <PracticeComplete results={answers} onExit={onExit} elapsedTime={elapsedTime} />;
  }

  return (
    <div className="px-3 sm:px-4">
      <div className="mb-4">
        {sessionTitle && (
          <div className="mb-3 rounded-lg border bg-white/80 p-3">
            <div className="text-sm font-semibold">{sessionTitle}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {mode === 'exam' ? '套卷完整作答 · 整卷提交后统一看结果' : '训练会话'}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">题目进度</span>
          <div className="flex-1 flex question-progress-scroll gap-1 pb-2">
            {questions.map((_, idx) => {
              const isAnswered = userAnswers[idx] !== undefined;
              return (
                <Button
                  key={idx}
                  variant={idx === currentIndex ? 'default' : isAnswered ? 'secondary' : 'outline'}
                  size="sm"
                  className="min-w-[2rem] sm:min-w-[2.5rem] flex-shrink-0 text-xs sm:text-sm"
                  onClick={() => handleQuestionJump(idx)}
                >
                  {idx + 1}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
      
      <QuestionCard
        question={currentQuestion}
        questionNumber={currentIndex + 1}
        totalQuestions={questions.length}
        onAnswer={handleAnswer}
        showDrawing={mode === 'exam'}
        onPrev={handlePrev}
        onNext={handleNext}
        onSubmit={handleSubmit}
        onExit={handleExitConfirm}
        canGoPrev={currentIndex > 0}
        canGoNext={currentIndex < questions.length - 1}
        isLastQuestion={currentIndex === questions.length - 1}
        hasAnswered={answerMode === 'batch' ? hasAnsweredAll : hasAnsweredCurrent}
        elapsedTime={elapsedTime}
        answerMode={answerMode}
        userAnswer={currentUserAnswer}
        onSelectAnswer={handleSelectAnswer}
      />
    </div>
  );
}

function PracticeComplete({ results, onExit, elapsedTime }: { results: PracticeAnswerResult[]; onExit: () => void; elapsedTime: number }) {
  const correctCount = results.filter(r => r.isCorrect).length;
  const totalCount = results.length;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [reviewMetaByQuestion, setReviewMetaByQuestion] = useState<Record<string, QuestionReviewMeta>>(() => loadReviewMetaMap());

  const updateReviewMeta = useCallback((questionId: string, updater: (meta: QuestionReviewMeta) => QuestionReviewMeta) => {
    setReviewMetaByQuestion(prev => {
      const base = prev[questionId] || createDefaultReviewMeta();
      const next = { ...prev, [questionId]: updater(base) };
      saveReviewMetaMap(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setReviewMetaByQuestion(prev => {
      let changed = false;
      const next = { ...prev };
      results.forEach(result => {
        const existing = next[result.question.id];
        if (result.isCorrect && !existing) return;
        const updated = recordReviewAttempt(existing, result.isCorrect);
        if (JSON.stringify(existing) !== JSON.stringify(updated)) {
          next[result.question.id] = updated;
          changed = true;
        }
      });
      if (changed) saveReviewMetaMap(next);
      return changed ? next : prev;
    });
  }, [results]);

  const reviewProgress = useMemo(() => {
    return results.reduce(
      (summary, result) => {
        const meta = reviewMetaByQuestion[result.question.id];
        if (!meta) return summary;
        if (!result.isCorrect) {
          return { ...summary, rescheduled: summary.rescheduled + 1 };
        }
        if (meta.mastered) {
          return { ...summary, mastered: summary.mastered + 1 };
        }
        if (meta.reviewStage > 0) {
          return { ...summary, advanced: summary.advanced + 1 };
        }
        return summary;
      },
      { advanced: 0, mastered: 0, rescheduled: 0 }
    );
  }, [results, reviewMetaByQuestion]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6"
    >
      <Card className="border-2 border-primary">
        <CardContent className="p-4 sm:p-8 text-center space-y-4 sm:space-y-6">
          <div className="text-4xl sm:text-6xl font-bold text-primary">{accuracy}%</div>
          <p className="text-base sm:text-lg">正确率</p>
          <div className="flex justify-center gap-4 sm:gap-8">
            <div className="text-center">
              <div className="text-xl font-bold text-[#a49aff] sm:text-3xl">{correctCount}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">正确</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-3xl font-bold text-red-500">{totalCount - correctCount}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">错误</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-3xl font-bold text-blue-500">{formatTime(elapsedTime)}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">用时</div>
            </div>
          </div>

          <Progress value={accuracy} className="h-2 sm:h-3" />

          {(reviewProgress.advanced > 0 || reviewProgress.mastered > 0 || reviewProgress.rescheduled > 0) && (
            <div className="grid gap-2 rounded-lg border bg-slate-50 p-3 text-left sm:grid-cols-3">
              <div className="rounded-md bg-white px-3 py-2">
                <div className="text-xs text-muted-foreground">二刷推进</div>
                <div className="mt-1 text-lg font-semibold text-cyan-700">{reviewProgress.advanced}</div>
              </div>
              <div className="rounded-md bg-white px-3 py-2">
                <div className="text-xs text-muted-foreground">新掌握</div>
                <div className="mt-1 text-lg font-semibold text-emerald-700">{reviewProgress.mastered}</div>
              </div>
              <div className="rounded-md bg-white px-3 py-2">
                <div className="text-xs text-muted-foreground">重排二刷</div>
                <div className="mt-1 text-lg font-semibold text-amber-700">{reviewProgress.rescheduled}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-base sm:text-lg">答题详情</h3>
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                全部 ({totalCount})
              </Button>
              <Button
                variant={filter === 'wrong' ? 'default' : 'outline'}
                size="sm"
                className={filter === 'wrong' ? 'bg-red-500 hover:bg-red-600' : ''}
                onClick={() => setFilter('wrong')}
              >
                只看错题 ({totalCount - correctCount})
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2">
            {results.map((result, idx) => {
              const isCorrect = result.isCorrect;
              if (filter === 'wrong' && isCorrect) return null;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedQuestion(selectedQuestion === idx ? null : idx)}
                  className={`
                    aspect-square rounded-lg flex items-center justify-center font-semibold text-xs sm:text-sm
                    transition-all hover:scale-105
                    ${isCorrect 
                      ? 'bg-[#b7e3ff]/45 text-[#5e5394] hover:bg-[#b7e3ff]/65 dark:bg-violet-900/30 dark:text-violet-200' 
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200'
                    }
                    ${selectedQuestion === idx ? 'ring-2 ring-primary scale-105' : ''}
                  `}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm justify-center">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-[#a49aff]"></div>
              <span>正确</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500"></div>
              <span>错误</span>
            </div>
          </div>

          {selectedQuestion !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="border-t pt-4 mt-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">
                  第 {selectedQuestion + 1} 题
                  <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                    results[selectedQuestion].isCorrect 
                      ? 'bg-[#b7e3ff]/45 text-[#5e5394] dark:bg-violet-900/30 dark:text-violet-200' 
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {results[selectedQuestion].isCorrect ? '正确' : '错误'}
                  </span>
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedQuestion(null)}
                >
                  关闭
                </Button>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm font-medium">题目内容：</p>
                <p className="text-sm whitespace-pre-line">{results[selectedQuestion].question?.content}</p>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">选项：</p>
                  {results[selectedQuestion].question?.options.map((opt) => {
                    const isCorrectOption = opt.label === results[selectedQuestion].question?.correctAnswer;
                    const isUserAnswer = opt.label === results[selectedQuestion].selectedAnswer;
                    
                    return (
                      <div 
                        key={opt.label}
                        className={`p-3 rounded-lg border ${
                          isCorrectOption 
                            ? 'border-[#b7e3ff] bg-[#b7e3ff]/35 dark:bg-violet-900/20' 
                            : isUserAnswer && !results[selectedQuestion].isCorrect
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 line-through'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <span className="font-semibold text-sm">{opt.label}.</span> {opt.text}
                        {isCorrectOption && <span className="ml-2 text-xs text-[#6d63c9]">✓ 正确答案</span>}
                        {isUserAnswer && !isCorrectOption && <span className="ml-2 text-red-600 text-xs">✗ 你的答案</span>}
                      </div>
                    );
                  })}
                </div>

                {results[selectedQuestion].question?.explanation && (
                  <div className="p-3 sm:p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">解析</span>
                    </div>
                    <p className="text-sm">{results[selectedQuestion].question?.explanation}</p>
                  </div>
                )}

                <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 text-sm md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">耗时对比</div>
                    <div className="mt-1 font-semibold">
                      本题 {formatDurationMs(results[selectedQuestion].answerTime)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        同类均值 {formatDurationMs(results[selectedQuestion].averageTime)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      分类：{getQuestionTypeLabel(results[selectedQuestion].question)}
                    </div>
                  </div>

                  {!results[selectedQuestion].isCorrect && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">错因标签</div>
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(WRONG_REASON_LABELS) as WrongReasonTag[]).map(tag => {
                          const questionId = results[selectedQuestion].question.id;
                          const active = reviewMetaByQuestion[questionId]?.reasonTags.includes(tag);
                          return (
                            <Button
                              key={tag}
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              className="h-7 px-2 text-xs"
                              onClick={() => updateReviewMeta(questionId, meta => ({
                                ...meta,
                                reasonTags: active
                                  ? meta.reasonTags.filter(item => item !== tag)
                                  : [...meta.reasonTags, tag],
                                updatedAt: new Date().toISOString(),
                              }))}
                            >
                              {WRONG_REASON_LABELS[tag]}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {getQuestionTypeLabel(results[selectedQuestion].question).includes('数量') && (
                    <div className="space-y-2 md:col-span-2">
                      <div className="text-xs font-medium text-muted-foreground">数量关系策略</div>
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(QUANTITY_STRATEGY_LABELS) as QuantityStrategyTag[]).map(tag => {
                          const questionId = results[selectedQuestion].question.id;
                          const active = reviewMetaByQuestion[questionId]?.strategyTags.includes(tag);
                          return (
                            <Button
                              key={tag}
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              className="h-7 px-2 text-xs"
                              onClick={() => updateReviewMeta(questionId, meta => ({
                                ...meta,
                                strategyTags: active
                                  ? meta.strategyTags.filter(item => item !== tag)
                                  : [...meta.strategyTags, tag],
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

                  {!results[selectedQuestion].isCorrect && (
                    <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
                      <div className="text-xs text-muted-foreground">
                        下次二刷：{reviewMetaByQuestion[results[selectedQuestion].question.id]?.nextReviewAt
                          ? new Date(reviewMetaByQuestion[results[selectedQuestion].question.id].nextReviewAt!).toLocaleDateString()
                          : '待安排'}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateReviewMeta(results[selectedQuestion].question.id, meta => advanceReviewMeta(meta))}
                      >
                        推进二刷间隔
                      </Button>
                    </div>
                  )}
                </div>

                {(results[selectedQuestion]?.question?.images?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">解析图片：</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {results[selectedQuestion]?.question?.images?.map((img: string, idx: number) => (
                        <Image
                          key={idx} 
                          src={img} 
                          alt={`解析图片 ${idx + 1}`} 
                          width={640}
                          height={320}
                          unoptimized
                          className="h-auto max-h-40 w-auto rounded-lg border object-contain sm:max-h-48"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 sm:gap-4 justify-center">
        <Button size="lg" onClick={onExit}>
          返回练习选择
        </Button>
      </div>
    </motion.div>
  );
}
