'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import { KnowledgeGraph } from '@/components/KnowledgeGraph/KnowledgeGraph';
import { MindMapEditor } from '@/components/KnowledgeGraph/MindMapEditor';
import { PracticeSelector, PracticeSession } from '@/components/Practice/PracticeComponents';
import { ReportDashboard } from '@/components/Report/ReportComponents';
import { CenterDashboard } from '@/components/Center/CenterComponents';
import { WrongAnswerNotebook } from '@/components/WrongAnswerNotebook/WrongAnswerNotebook';
import { QuestionBankManager } from '@/components/QuestionBank/QuestionBankManager';
import { cn } from '@/lib/utils';
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
  Target,
  Settings,
  Map,
  Pencil,
  BookMarked,
  Menu,
  X,
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
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

function AppContent() {
  const {
    isInitialized,
    isOnline,
    syncStatus,
    nodes,
    questionBank,
    getWeakNodes,
    getNodeStats,
    getQuestionByAngleId,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<AppTab>('mindmap');
  const [practiceMode, setPracticeMode] = useState<PracticeMode | null>(null);
  const [isPracticeActive, setIsPracticeActive] = useState(false);
  const [mindmapView, setMindmapView] = useState<'graph' | 'editor'>('graph');
  const [practiceTargetNodeId, setPracticeTargetNodeId] = useState<string | null>(null);
  const [practiceCount, setPracticeCount] = useState<number>(0);
  const [answerMode, setAnswerMode] = useState<'instant' | 'batch'>('instant');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const tabs: Array<{ id: AppTab; label: string; icon: React.ElementType }> = [
    { id: 'mindmap', label: '知识导图', icon: GitBranch },
    { id: 'practice', label: '智能练习', icon: BookOpen },
    { id: 'bank', label: '题库管理', icon: Target },
    { id: 'wrongbook', label: '错题本', icon: BookMarked },
    { id: 'report', label: '数据报告', icon: BarChart3 },
    { id: 'center', label: '个人中心', icon: User },
  ];

  const handleStartPractice = (mode: 'sequence' | 'random' | 'targeted' | 'exam') => {
    setPracticeMode(mode);
    setIsPracticeActive(true);
    setIsMobileMenuOpen(false);
  };

  const handlePracticeComplete = (results: any) => {
    // User will exit via button
  };

  const handleExitPractice = () => {
    setIsPracticeActive(false);
    setPracticeMode(null);
    setPracticeTargetNodeId(null);
  };

  const handleTargetedPracticeFromNode = (nodeId: string) => {
    setPracticeTargetNodeId(nodeId);
    setPracticeMode('targeted');
    setIsPracticeActive(true);
    setActiveTab('practice');
  };

  const getPracticeQuestions = useCallback((): QuestionBankItem[] => {
    let questions: QuestionBankItem[];
    
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
  }, [practiceMode, questionBank, weakNodes, practiceTargetNodeId, getQuestionByAngleId, practiceCount]);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <header className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20"
          >
            <GitBranch className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </motion.div>
          <div className="hidden sm:block">
            <h1 className="text-sm sm:text-base font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              智能公考学习平台
            </h1>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-muted/50 rounded-xl p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-slate-800/50',
                )}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {weakCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:hover:bg-red-900/30 hidden sm:flex"
                    onClick={() => setActiveTab('mindmap')}
                  >
                    <Target className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-red-600 dark:text-red-400 font-semibold text-xs">{weakCount}</span>
                    <span className="text-red-600/70 dark:text-red-400/70 text-xs">薄弱点</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>点击查看薄弱知识点</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <div className={cn(
            'flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs',
            syncStatus === 'syncing' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            syncStatus === 'success' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            syncStatus === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            syncStatus === 'idle' && 'bg-muted text-muted-foreground',
          )}>
            {syncStatus === 'syncing' && <Loader2 className="h-3 w-3 animate-spin" />}
            {syncStatus === 'success' && <CheckCircle2 className="h-3 w-3" />}
            {syncStatus === 'error' && <CloudOff className="h-3 w-3" />}
            {syncStatus === 'idle' && (isOnline ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />)}
            <span className="hidden sm:inline">
              {syncStatus === 'syncing' && '同步中'}
              {syncStatus === 'success' && '已同步'}
              {syncStatus === 'error' && '同步失败'}
              {syncStatus === 'idle' && (isOnline ? '已连接' : '离线')}
            </span>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  'flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-medium',
                  isOnline
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                )}>
                  {isOnline ? (
                    <>
                      <Wifi className="h-3 w-3" />
                      <span className="hidden sm:inline">在线</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" />
                      <span className="hidden sm:inline">离线可用</span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isOnline ? '已连接网络' : '离线模式，所有功能正常'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="outline" size="icon" className="ml-1">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[240px] sm:w-[280px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-blue-500" />
                  菜单导航
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
              <div className="mt-8 p-4 rounded-xl bg-muted/50">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold">{nodes.length}</div>
                    <div className="text-xs text-muted-foreground">知识点</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{questionBank.length}</div>
                    <div className="text-xs text-muted-foreground">题库</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-500">{weakCount}</div>
                    <div className="text-xs text-muted-foreground">薄弱点</div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
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
                <div className="p-2 sm:p-3 border-b bg-white/50 dark:bg-slate-900/50 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant={mindmapView === 'graph' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMindmapView('graph')}
                        className="text-xs sm:text-sm"
                      >
                        <Map className="h-3.5 w-3.5 mr-1" />
                        导图视图
                      </Button>
                      <Button
                        variant={mindmapView === 'editor' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMindmapView('editor')}
                        className="text-xs sm:text-sm"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        编辑模式
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
                  {mindmapView === 'graph' ? (
                    <KnowledgeGraph onTargetedPractice={handleTargetedPracticeFromNode} />
                  ) : (
                    <MindMapEditor />
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
                    <div className="hidden sm:flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#DC2626]" />
                        <span>薄弱</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#EA580C]" />
                        <span>需加强</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#CA8A04]" />
                        <span>学习中</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#0891B2]" />
                        <span>熟练</span>
                      </div>
                    </div>
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

                  <PracticeSelector onSelectMode={handleStartPractice} />

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
              <QuestionBankManager />
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
                  <WrongAnswerNotebook />
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
        </AnimatePresence>
      </main>

      <footer className="border-t bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3 sm:px-4 py-2 shrink-0">
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
          <div className="flex items-center gap-3 sm:gap-4">
            <span>知识点：{nodes.length}</span>
            <span>题库：{questionBank.length} 题</span>
            <span>薄弱点：{weakCount}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  const { initialize } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <TooltipProvider>
      <AppContent />
    </TooltipProvider>
  );
}
