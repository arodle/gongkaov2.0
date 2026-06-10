'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import { MindCanvas } from '@/components/KnowledgeGraph/MindCanvas';
import { MindEditor } from '@/components/KnowledgeGraph/MindEditor';
import { PracticeSelector, PracticeSession } from '@/components/Practice/PracticeComponents';
import { ReportDashboard } from '@/components/Report/ReportComponents';
import { CenterDashboard, ManualPanel } from '@/components/Center/CenterComponents';
import { WrongAnswerNotebook } from '@/components/WrongAnswerNotebook/WrongAnswerNotebook';
import { QuestionBankManager } from '@/components/QuestionBank/QuestionBankManager';
import { AuthGate } from '@/components/AuthGate';
import { cn } from '@/lib/utils';
import {
  buildDailyTrainingPlan,
  buildDailyTrainingPlanSummary,
  type DailyTrainingPlanSummary,
  type QuestionReviewMeta,
  type WrongReasonTag,
} from '@/lib/practice-insights';
import type { AppTab, QuestionBankItem, PracticeMode } from '@/types';
import {
  GitBranch,
  BookOpen,
  BarChart3,
  User,
  Cloud,
  CloudOff,
  Loader2,
  CheckCircle2,
  Wifi,
  WifiOff,
  Settings,
  BookMarked,
  Database,
  Monitor,
  HelpCircle,
  Sparkles,
  Repeat2,
  ListChecks,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function MobileOperatorGate({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 px-4 py-8 md:hidden">
      <div className="w-full max-w-sm rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <Monitor className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <Button type="button" className="mt-4 w-full" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function AppContent() {
  const {
    isInitialized,
    isOnline,
    syncStatus,
    initialize,
    nodes,
    questionBank,
    practiceRecords,
    getWeakNodes,
    getQuestionByAngleId,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<AppTab>('mindmap');
  const [practiceMode, setPracticeMode] = useState<PracticeMode | null>(null);
  const [isPracticeActive, setIsPracticeActive] = useState(false);
  const [mindmapView, setMindmapView] = useState<'canvas' | 'mindeditor'>('mindeditor');
  const [mindmapFocusNodeId, setMindmapFocusNodeId] = useState<string | null>(null);
  const [practiceTargetNodeId, setPracticeTargetNodeId] = useState<string | null>(null);
  const [practiceCount, setPracticeCount] = useState<number>(0);
  const [answerMode, setAnswerMode] = useState<'instant' | 'batch'>('instant');
  const [customPracticeQueue, setCustomPracticeQueue] = useState<QuestionBankItem[] | null>(null);
  const [practiceSessionTitle, setPracticeSessionTitle] = useState('');

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const handleOnline = () => useAppStore.getState().setOnlineStatus(true);
    const handleOffline = () => useAppStore.getState().setOnlineStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const weakNodes = getWeakNodes();
  const weakCount = weakNodes.length;
  const smartPracticeCards = useMemo(() => {
    const weakIds = new Set(weakNodes.map(node => node.id));
    const practicedIds = new Set(practiceRecords.map(record => record.question_id));
    const wrongRecordIds = new Set(
      practiceRecords
        .filter(record => !record.is_correct)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map(record => record.question_id)
    );

    const dedupe = (items: QuestionBankItem[]) => {
      const seen = new Set<string>();
      return items.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };

    const weakQuestions = questionBank.filter(question => weakIds.has(question.linkedAngleId));
    const wrongQuestions = questionBank.filter(question => wrongRecordIds.has(question.id));
    const freshQuestions = questionBank.filter(question => !practicedIds.has(question.id));
    const mixedQuestions = dedupe([...wrongQuestions, ...weakQuestions, ...freshQuestions, ...questionBank]);

    return [
      {
        id: 'rescue',
        title: '薄弱点抢救',
        description: '优先练 PS 偏低知识点，适合每天开局先补短板。',
        icon: Flame,
        tone: 'border-red-200 bg-red-50/70 text-red-700',
        questions: dedupe([...wrongQuestions, ...weakQuestions]),
        mode: 'targeted' as PracticeMode,
      },
      {
        id: 'wrong',
        title: '错题回炉',
        description: '只拉近期错过的题，复盘同类失误更快。',
        icon: Repeat2,
        tone: 'border-amber-200 bg-amber-50/80 text-amber-700',
        questions: wrongQuestions,
        mode: 'targeted' as PracticeMode,
      },
      {
        id: 'fresh',
        title: '未练新题',
        description: '补齐题库覆盖面，避免一直刷熟题。',
        icon: ListChecks,
        tone: 'border-sky-200 bg-sky-50/80 text-sky-700',
        questions: freshQuestions,
        mode: 'sequence' as PracticeMode,
      },
      {
        id: 'mixed',
        title: '综合平衡',
        description: '错题、薄弱点、新题混合，适合一轮完整训练。',
        icon: Sparkles,
        tone: 'border-violet-200 bg-violet-50/80 text-violet-700',
        questions: mixedQuestions,
        mode: 'random' as PracticeMode,
      },
    ];
  }, [practiceRecords, questionBank, weakNodes]);

  const reviewMetaByQuestion = useMemo<Record<string, QuestionReviewMeta>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('gongkao:question-review-meta');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [practiceRecords.length, questionBank.length]);

  const dailyTrainingQuestions = useMemo(() => (
    buildDailyTrainingPlan(questionBank, practiceRecords, reviewMetaByQuestion, 15)
  ), [practiceRecords, questionBank, reviewMetaByQuestion]);

  const dailyTrainingSummary = useMemo<DailyTrainingPlanSummary>(() => (
    buildDailyTrainingPlanSummary(dailyTrainingQuestions, practiceRecords, reviewMetaByQuestion)
  ), [dailyTrainingQuestions, practiceRecords, reviewMetaByQuestion]);

  const examPaperPracticeOptions = useMemo(() => {
    const map = new Map<string, number>();
    questionBank.forEach(question => {
      const name = question.examPaper?.trim();
      if (!name) return;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, questionCount]) => ({ name, questionCount }))
      .sort((left, right) => right.questionCount - left.questionCount);
  }, [questionBank]);

  const tabs: Array<{ id: AppTab; label: string; shortLabel: string; group: string; icon: React.ElementType; description: string }> = [
    { id: 'mindmap', label: 'MindCanvas', shortLabel: '导图', group: '学习', icon: GitBranch, description: '知识学习、节点练习与套卷高亮' },
    { id: 'practice', label: '智能练习', shortLabel: '练习', group: '学习', icon: BookOpen, description: '按模式刷题并采集做题行为' },
    { id: 'wrongbook', label: '错题本', shortLabel: '错题', group: '学习', icon: BookMarked, description: '错题复盘、笔记和知识点回看' },
    { id: 'bank', label: '题库管理', shortLabel: '题库', group: '运营', icon: Database, description: '题目、套卷、知识点绑定管理' },
    { id: 'report', label: '数据报告', shortLabel: '报告', group: '分析', icon: BarChart3, description: '学习表现、薄弱点和做题记录回放' },
    { id: 'center', label: '个人中心', shortLabel: '我的', group: '系统', icon: User, description: '账号、同步和个人数据' },
    { id: 'manual', label: '平台用户手册', shortLabel: '手册', group: '系统', icon: HelpCircle, description: '查看平台使用流程和常见问题' },
  ];
  const mobileTabs = tabs.filter(tab => tab.id !== 'bank' && tab.id !== 'manual');
  const activeTabMeta = tabs.find(tab => tab.id === activeTab) || tabs[0];
  const isMobileOperatorTab = activeTab === 'bank';

  const handleStartPractice = (mode: 'sequence' | 'random' | 'targeted' | 'exam') => {
    if (mode === 'exam' && examPaperPracticeOptions[0]) {
      const paperName = examPaperPracticeOptions[0].name;
      const questions = questionBank.filter(question => question.examPaper === paperName);
      setCustomPracticeQueue(questions);
      setPracticeSessionTitle(paperName);
      setAnswerMode('batch');
      setPracticeMode('exam');
      setPracticeTargetNodeId(null);
      setIsPracticeActive(true);
      return;
    }
    setCustomPracticeQueue(null);
    setPracticeSessionTitle('');
    setPracticeMode(mode);
    setIsPracticeActive(true);
  };

  const handleStartSmartPractice = (mode: PracticeMode, questions: QuestionBankItem[]) => {
    const limitedQuestions = practiceCount > 0 ? questions.slice(0, practiceCount) : questions;
    setCustomPracticeQueue(limitedQuestions);
    setPracticeSessionTitle('');
    setPracticeMode(mode);
    setPracticeTargetNodeId(null);
    setIsPracticeActive(true);
  };

  const handleStartDailyPlan = useCallback(() => {
    const limitedQuestions = practiceCount > 0 ? dailyTrainingQuestions.slice(0, practiceCount) : dailyTrainingQuestions;
    setCustomPracticeQueue(limitedQuestions);
    setPracticeSessionTitle('每日训练计划');
    setPracticeMode('targeted');
    setPracticeTargetNodeId(null);
    setIsPracticeActive(true);
  }, [dailyTrainingQuestions, practiceCount]);

  const handleStartExamPaper = useCallback((paperName: string) => {
    const questions = questionBank.filter(question => question.examPaper === paperName);
    setCustomPracticeQueue(questions);
    setPracticeSessionTitle(paperName);
    setAnswerMode('batch');
    setPracticeMode('exam');
    setPracticeTargetNodeId(null);
    setIsPracticeActive(true);
  }, [questionBank]);

  const handleStartReasonPractice = useCallback((reason: { tag: WrongReasonTag; label: string; questions: QuestionBankItem[] }) => {
    const limitedQuestions = practiceCount > 0 ? reason.questions.slice(0, practiceCount) : reason.questions;
    setCustomPracticeQueue(limitedQuestions);
    setPracticeSessionTitle(`错因专项：${reason.label}`);
    setAnswerMode('instant');
    setPracticeMode('targeted');
    setPracticeTargetNodeId(null);
    setActiveTab('practice');
    setIsPracticeActive(true);
  }, [practiceCount]);

  const handlePracticeComplete = () => {
    // User will exit via button
  };

  const handleExitPractice = () => {
    setIsPracticeActive(false);
    setPracticeMode(null);
    setPracticeTargetNodeId(null);
    setCustomPracticeQueue(null);
    setPracticeSessionTitle('');
  };

  const handleTargetedPracticeFromNode = (nodeId: string) => {
    setPracticeTargetNodeId(nodeId);
    setCustomPracticeQueue(null);
    setPracticeSessionTitle('');
    setPracticeMode('targeted');
    setIsPracticeActive(true);
    setActiveTab('practice');
  };

  const handleJumpToMindNode = useCallback((nodeId: string) => {
    setMindmapFocusNodeId(nodeId);
    setMindmapView('canvas');
    setActiveTab('mindmap');
  }, []);

  const getPracticeQuestions = useCallback((): QuestionBankItem[] => {
    let questions: QuestionBankItem[];

    if (customPracticeQueue) {
      return customPracticeQueue;
    }
    
    if (!practiceMode || practiceMode === 'exam') {
      questions = questionBank;
    } else if (practiceMode === 'targeted') {
      if (practiceTargetNodeId) {
        questions = getQuestionByAngleId(practiceTargetNodeId);
      } else {
        const weakIds = new Set(weakNodes.map(n => n.id));
        questions = questionBank.filter(q => weakIds.has(q.linkedAngleId));
      }
    } else if (practiceMode === 'sequence') {
      questions = [...questionBank].sort((a, b) => a.linkedAngleId.localeCompare(b.linkedAngleId));
    } else {
      questions = [...questionBank].sort(() => Math.random() - 0.5);
    }
    
    if (practiceCount > 0 && questions.length > practiceCount) {
      return questions.slice(0, practiceCount);
    }
    
    return questions;
  }, [practiceMode, questionBank, weakNodes, practiceTargetNodeId, getQuestionByAngleId, practiceCount, customPracticeQueue]);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-[linear-gradient(180deg,#f8fcff_0%,#f4fbf7_100%)] dark:from-slate-900 dark:to-slate-800">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_18px_42px_rgba(20,184,166,0.24)]">
            <GitBranch className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">正在加载知识图谱...</h2>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>初始化数据</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      <aside className="hidden w-[76px] shrink-0 border-r border-[#eee7ff] bg-white/92 shadow-[8px_0_28px_rgba(76,68,128,0.04)] md:flex md:flex-col lg:w-[236px]">
        <div className="flex h-16 items-center justify-center gap-3 border-b border-border/70 px-3 lg:justify-start lg:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-[0_12px_28px_rgba(20,184,166,0.22)]">
            <GitBranch className="h-5 w-5" />
          </div>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate text-sm font-semibold text-foreground">公考学习工作台</div>
            <div className="text-xs text-muted-foreground">MindCanvas</div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-5 p-3">
            {Array.from(new Set(tabs.map(tab => tab.group))).map(group => (
              <div key={group}>
                <div className="hidden px-2 pb-1.5 text-[11px] font-medium text-muted-foreground/70 lg:block">{group}</div>
                <div className="space-y-1">
                  {tabs.filter(tab => tab.group === group).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'flex h-9 w-full items-center justify-center gap-2 rounded-lg px-2 text-left text-sm transition-colors lg:justify-start',
                          isActive
                            ? 'liquid-active text-white'
                            : 'text-muted-foreground hover:bg-[#f4efff]/80 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="hidden min-w-0 flex-1 truncate lg:block">{tab.label}</span>
                        {tab.id === 'mindmap' && weakCount > 0 && (
                          <span className={cn('absolute ml-7 mt-[-1.25rem] rounded px-1 py-0.5 text-[9px] lg:static lg:ml-0 lg:mt-0 lg:px-1.5 lg:text-[10px]', isActive ? 'bg-white/15 text-white' : 'bg-red-50 text-red-600')}>
                            {weakCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="hidden border-t border-border/70 p-3 lg:block">
          <div className="liquid-control grid grid-cols-3 gap-1 rounded-xl p-2 text-center">
            <div>
              <div className="text-sm font-semibold">{nodes.length}</div>
              <div className="text-[10px] text-muted-foreground">知识点</div>
            </div>
            <div>
              <div className="text-sm font-semibold">{questionBank.length}</div>
              <div className="text-[10px] text-muted-foreground">题库</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-red-600">{weakCount}</div>
              <div className="text-[10px] text-muted-foreground">薄弱</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#eee7ff] bg-white/90 px-3 backdrop-blur-md md:h-16 md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-foreground md:text-base">{activeTabMeta.label}</h1>
                {weakCount > 0 && (
                  <Badge variant="outline" className="hidden border-red-200 bg-red-50 text-red-700 sm:inline-flex">
                    {weakCount} 薄弱点
                  </Badge>
                )}
              </div>
              <p className="hidden truncate text-xs text-muted-foreground lg:block">{activeTabMeta.description}</p>
            </div>

            {activeTab === 'mindmap' && (
              <div className="ml-1 grid grid-cols-2 rounded-md bg-[#f4efff] p-0.5 md:hidden">
                <button
                  type="button"
                  onClick={() => setMindmapView('canvas')}
                  className={cn(
                    'h-7 rounded px-2 text-xs font-medium',
                    mindmapView === 'canvas' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  导图
                </button>
                <button
                  type="button"
                  onClick={() => setMindmapView('mindeditor')}
                  className={cn(
                    'h-7 rounded px-2 text-xs font-medium',
                    mindmapView === 'mindeditor' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  编辑
                </button>
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 px-2 md:flex lg:px-5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs',
                  syncStatus === 'syncing' && 'border-blue-200 bg-blue-50 text-blue-700',
                  syncStatus === 'success' && 'border-[#d8ccff] bg-[#f4efff] text-[#6d63c9]',
                  syncStatus === 'error' && 'border-red-200 bg-red-50 text-red-700',
                  syncStatus === 'idle' && 'border-slate-200 bg-white text-slate-500',
                )}>
                  {syncStatus === 'syncing' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {syncStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {syncStatus === 'error' && <CloudOff className="h-3.5 w-3.5" />}
                  {syncStatus === 'idle' && (isOnline ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />)}
                  {syncStatus === 'syncing' && '同步中'}
                  {syncStatus === 'success' && '已同步'}
                  {syncStatus === 'error' && '同步失败'}
                  {syncStatus === 'idle' && (isOnline ? '已连接' : '离线')}
                </div>
              </TooltipTrigger>
              <TooltipContent>数据同步状态</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs',
                  isOnline ? 'border-[#d8ccff] bg-[#f4efff] text-[#6d63c9]' : 'border-amber-200 bg-amber-50 text-amber-700',
                )}>
                  {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {isOnline ? '在线' : '离线可用'}
                </div>
              </TooltipTrigger>
              <TooltipContent>{isOnline ? '已连接网络' : '离线模式，所有功能正常'}</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setActiveTab('center')}
              aria-label="打开个人中心"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className={cn(
          "min-h-0 flex-1 overflow-hidden bg-transparent p-0 md:p-2 lg:p-3",
          !isPracticeActive && "pb-16 md:pb-2 lg:pb-3"
        )}>
          <div className="h-full min-h-0 overflow-hidden bg-white shadow-[0_12px_36px_rgba(76,68,128,0.06)] md:rounded-xl md:border md:border-[#eee7ff]">
        <AnimatePresence mode="wait">
          {activeTab === 'mindmap' && (
            <motion.div
              key="mindmap"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full min-h-0"
            >
              <div className="h-full flex flex-col min-h-0">
                <div className="hidden shrink-0 border-b bg-white/50 p-2 dark:bg-slate-900/50 md:block md:p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant={mindmapView === 'canvas' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMindmapView('canvas')}
                        className="text-xs sm:text-sm"
                      >
                        <GitBranch className="h-3.5 w-3.5 mr-1" />
                        MindCanvas
                      </Button>
                      <Button
                        variant={mindmapView === 'mindeditor' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMindmapView('mindeditor')}
                        className="text-xs sm:text-sm"
                      >
                        <BookOpen className="h-3.5 w-3.5 mr-1" />
                        Mind编辑
                      </Button>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                        <span>薄弱</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                        <span>需加强</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#CA8A04]" />
                        <span>学习中</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0891B2]" />
                        <span>熟练</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  {mindmapView === 'canvas' ? (
                    <MindCanvas
                      focusNodeId={mindmapFocusNodeId}
                      onTargetedPractice={handleTargetedPracticeFromNode}
                    />
                  ) : (
                    <>
                      <MobileOperatorGate
                        title="Mind 编辑建议在桌面端操作"
                        description="新增节点、调整层级、批量维护正文和截图属于运营维护动作，小屏容易误触。"
                        actionLabel="返回导图"
                        onAction={() => setMindmapView('canvas')}
                      />
                      <div className="hidden h-full md:block">
                        <MindEditor onTargetedPractice={handleTargetedPracticeFromNode} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'practice' && !isPracticeActive && (
            <motion.div
              key="practice-selector"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full flex flex-col min-h-0"
            >
              <ScrollArea className="flex-1 min-h-0">
                <div className="max-w-4xl mx-auto py-6 sm:py-8 px-3 sm:px-4">
                  <div className="text-center mb-6 sm:mb-8">
                    <h2 className="text-xl sm:text-2xl font-bold mb-2">刷题模式</h2>
                  </div>

                  <div className="mb-6 sm:mb-8">
                    <div className="flex flex-row items-center justify-center gap-2 sm:gap-6">
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <label className="text-xs sm:text-sm font-medium">练习题数</label>
                        <div className="flex flex-wrap justify-center gap-1">
                          <Button
                            variant={practiceCount === 0 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPracticeCount(0)}
                            className="text-xs"
                          >
                            全部
                          </Button>
                          <Button
                            variant={practiceCount === 5 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPracticeCount(5)}
                            className="text-xs"
                          >
                            5
                          </Button>
                          <Button
                            variant={practiceCount === 10 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPracticeCount(10)}
                            className="text-xs"
                          >
                            10
                          </Button>
                          <Button
                            variant={practiceCount === 15 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPracticeCount(15)}
                            className="text-xs"
                          >
                            15
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <label className="text-xs sm:text-sm font-medium">答题模式</label>
                        <div className="flex flex-wrap justify-center gap-1">
                          <Button
                            variant={answerMode === 'instant' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setAnswerMode('instant')}
                            className="text-xs"
                          >
                            逐题作答
                          </Button>
                          <Button
                            variant={answerMode === 'batch' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setAnswerMode('batch')}
                            className="text-xs"
                          >
                            整卷提交
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 rounded-xl border border-[#e8ecf7] bg-white p-3 shadow-[0_12px_32px_rgba(76,68,128,0.06)] sm:p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-600" />
                        <h3 className="text-sm font-semibold text-slate-950">智能推荐训练</h3>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        按薄弱点、错题、未练题自动组卷
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {smartPracticeCards.map(card => {
                        const Icon = card.icon;
                        const disabled = card.questions.length === 0;
                        return (
                          <button
                            key={card.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleStartSmartPractice(card.mode, card.questions)}
                            className={cn(
                              'flex min-h-[116px] flex-col justify-between rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45',
                              card.tone
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 shrink-0" />
                                  <span className="text-sm font-semibold">{card.title}</span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                                  {card.description}
                                </p>
                              </div>
                              <Badge variant="secondary" className="shrink-0 text-[11px]">
                                {card.questions.length} 题
                              </Badge>
                            </div>
                            <span className="mt-3 text-xs font-medium">
                              {disabled ? '暂无可练题' : '开始推荐训练'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <PracticeSelector
                    onSelectMode={handleStartPractice}
                    onSelectExamPaper={handleStartExamPaper}
                    onStartDailyPlan={handleStartDailyPlan}
                    examPapers={examPaperPracticeOptions}
                    dailyPlanCount={dailyTrainingQuestions.length}
                    dailyPlanSummary={dailyTrainingSummary}
                  />

                  <div className="mt-6 sm:mt-8 p-3 sm:p-4 rounded-xl bg-muted/50 text-center">
                    <p className="text-sm text-muted-foreground">
                      当前题库共 <span className="font-semibold text-foreground">{questionBank.length}</span> 道题目
                      {weakCount > 0 && (
                        <>，其中 <span className="font-semibold text-red-500">{weakCount}</span> 个薄弱知识点</>
                      )}
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </motion.div>
          )}

          {activeTab === 'practice' && isPracticeActive && practiceMode && (
            <motion.div
              key="practice-session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col min-h-0"
            >
              <ScrollArea className="flex-1 min-h-0 pb-24">
                <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
                  <PracticeSession
                    questions={getPracticeQuestions()}
                    mode={practiceMode}
                    answerMode={answerMode}
                    sessionTitle={practiceSessionTitle}
                    onComplete={handlePracticeComplete}
                    onExit={handleExitPractice}
                  />
                </div>
              </ScrollArea>
            </motion.div>
          )}

          {activeTab === 'bank' && (
            <motion.div
              key="bank"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col min-h-0"
            >
              {isMobileOperatorTab && (
                <MobileOperatorGate
                  title="题库管理建议在桌面端操作"
                  description="新增题目、批量导入、套卷维护和知识点重绑都需要较大的操作空间。"
                  actionLabel="去练习"
                  onAction={() => setActiveTab('practice')}
                />
              )}
              {isMobileOperatorTab && (
                <div className="hidden">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>题库管理属于运营功能，批量编辑和套卷维护建议在桌面端操作。</span>
                </div>
              )}
              <div className="hidden h-full md:block">
                <QuestionBankManager />
              </div>
            </motion.div>
          )}

          {activeTab === 'wrongbook' && (
            <motion.div
              key="wrongbook"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col min-h-0"
            >
              <div className="flex flex-col h-full min-h-0">
                <div className="p-2 sm:p-3 border-b bg-white/50 dark:bg-slate-900/50 shrink-0">
                  <h3 className="font-semibold text-sm sm:text-base">双栏错题本</h3>
                  <p className="text-xs text-muted-foreground">左侧展示错题，右侧编辑笔记，绑定完整知识层级标签</p>
                </div>
                <div className="flex-1 overflow-hidden">
                  <WrongAnswerNotebook
                    onJumpToNode={handleJumpToMindNode}
                    onStartReasonPractice={handleStartReasonPractice}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col min-h-0"
            >
              <ReportDashboard />
            </motion.div>
          )}

          {activeTab === 'center' && (
            <motion.div
              key="center"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col min-h-0"
            >
              <CenterDashboard />
            </motion.div>
          )}

          {activeTab === 'manual' && (
            <motion.div
              key="manual"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full min-h-0 overflow-auto p-6"
            >
              <ManualPanel onNavigate={setActiveTab} />
            </motion.div>
          )}
        </AnimatePresence>
          </div>
        </main>
      </div>

      {!isPracticeActive && (
        <nav className="!fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-[#eee7ff] bg-white/94 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(76,68,128,0.08)] backdrop-blur-md md:hidden">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className={cn(
                  'flex h-7 w-9 items-center justify-center rounded-lg',
                  isActive ? 'liquid-active text-white' : 'text-muted-foreground'
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </AuthGate>
  );
}
