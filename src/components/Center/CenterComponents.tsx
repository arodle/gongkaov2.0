'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import { backupService } from '@/lib/services/backupService';
import { getRecentDeletions, removeRecentDeletion, type RecentDeletionItem } from '@/lib/recent-deletions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  Upload,
  Cloud,
  RefreshCw,
  Trash2,
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  BookOpen,
  Search,
  Map,
  Dumbbell,
  ClipboardList,
  BarChart3,
  ShieldCheck,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { AppTab } from '@/types';

export function ExportPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { nodes, practiceRecords, psHistory } = useAppStore();

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus('idle');

    try {
      await backupService.exportToFile();
      setExportStatus('success');
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          导出数据
        </CardTitle>
        <CardDescription>
          将所有学习数据导出为压缩文件备份
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <div className="text-2xl font-bold">{nodes.length}</div>
            <div className="text-xs text-muted-foreground">知识点</div>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <div className="text-2xl font-bold">{practiceRecords.length}</div>
            <div className="text-xs text-muted-foreground">练习记录</div>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <div className="text-2xl font-bold">{psHistory.length}</div>
            <div className="text-xs text-muted-foreground">PS 历史</div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-medium">导出内容</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              知识点数据（包含 PS 分数）
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              练习答题记录
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              PS 历史时间序列（CSV）
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              备份配置文件
            </li>
          </ul>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full" disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  正在导出...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  导出全部数据
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认导出数据</AlertDialogTitle>
              <AlertDialogDescription>
                将下载一个 ZIP 文件，包含你的所有学习数据。请妥善保管备份文件。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleExport}>
                确认导出
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AnimatePresence>
          {exportStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              导出成功！
            </motion.div>
          )}
          {exportStatus === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              导出失败，请重试
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export function RestorePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { initialize } = useAppStore();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setRestoreStatus('idle');

    try {
      const success = await backupService.restoreFromFile(file);
      if (success) {
        setRestoreStatus('success');
        await initialize();
      } else {
        setRestoreStatus('error');
      }
    } catch (error) {
      console.error('Restore failed:', error);
      setRestoreStatus('error');
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          从备份恢复
        </CardTitle>
        <CardDescription>
          导入之前导出的备份文件恢复数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              选择备份文件
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                警告：数据将被覆盖
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>此操作将用备份文件中的数据<strong>完全替换</strong>当前所有数据。</p>
                <p className="text-destructive font-medium">
                  当前数据将无法恢复，请确保已导出当前数据。
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => fileInputRef.current?.click()}>
                继续选择文件
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="text-xs text-muted-foreground">
          支持 .zip 或 .json 格式的备份文件
        </div>

        <AnimatePresence>
          {isRestoring && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-sm"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              正在恢复数据...
            </motion.div>
          )}

          {restoreStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              恢复成功！页面将自动刷新。
            </motion.div>
          )}

          {restoreStatus === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              恢复失败，请检查文件格式
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export function SnapshotPanel() {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSnapshots = useCallback(async () => {
    setIsLoading(true);
    try {
      const { db } = await import('@/lib/db/database');
      const allSnapshots = await db.snapshots.orderBy('created_at').reverse().limit(10).toArray();
      setSnapshots(allSnapshots.map(s => ({
        id: s.id,
        created_at: s.created_at,
        data: JSON.parse(s.data),
      })));
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleRestore = async (snapshotId: string) => {
    try {
      const { restoreSnapshot } = await import('@/lib/db/database');
      const success = await restoreSnapshot(snapshotId);
      if (success) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          安全快照
        </CardTitle>
        <CardDescription>
          自动创建的操作前备份，可随时恢复
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-sm">
          <p className="text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            进入高风险操作时，系统会自动创建快照
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>暂无快照记录</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {new Date(snapshot.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {snapshot.data.reason || '自动快照'}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        恢复
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认恢复快照</AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作将恢复至 {new Date(snapshot.created_at).toLocaleString('zh-CN')} 的状态，
                          当前数据将被替换。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRestore(snapshot.id)}>
                          确认恢复
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentDeletionPanel() {
  const [items, setItems] = useState<RecentDeletionItem[]>([]);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const addQuestion = useAppStore(state => state.addQuestion);

  const loadItems = useCallback(() => {
    setItems(getRecentDeletions());
  }, []);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleRestore = async (item: RecentDeletionItem) => {
    setIsRestoring(item.id);
    try {
      if (item.kind === 'question' && item.payload.question) {
        addQuestion(item.payload.question);
        removeRecentDeletion(item.id);
        loadItems();
        return;
      }

      if (item.kind === 'mindmap-nodes' && item.payload.mindMapId && item.payload.nodes?.length) {
        const sortedNodes = [...item.payload.nodes].sort((a, b) => (
          (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0)
        ));
        const restoredIdByOldId = new Map<string, string>();

        for (const node of sortedNodes) {
          const parentId = node.parent_id ? restoredIdByOldId.get(node.parent_id) || null : null;
          const response = await fetch('/api/mindmap/node', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mind_map_id: item.payload.mindMapId,
              parent_id: parentId,
              name: node.name,
              content: node.content,
              markdown: node.markdown,
              node_type: node.node_type,
              color_tag: node.color_tag,
              pos_x: node.pos_x,
              pos_y: node.pos_y,
              width: node.width,
              height: node.height,
              expanded: node.expanded,
            }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'restore failed');
          restoredIdByOldId.set(node.id, result.id);
        }

        removeRecentDeletion(item.id);
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to restore recent deletion:', error);
      window.alert('恢复失败，请稍后重试。');
    } finally {
      setIsRestoring(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          最近删除
        </CardTitle>
        <CardDescription>
          保留最近 20 次删除的题目和导图节点，可在误删后快速恢复。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无最近删除记录
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.kind === 'question' ? '题目' : '导图节点'}</Badge>
                      <span className="truncate text-sm font-medium">{item.title}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.summary}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(item.deletedAt).toLocaleString('zh-CN')}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!isRestoring}
                    onClick={() => void handleRestore(item)}
                  >
                    {isRestoring === item.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                    恢复
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function BackupConfigPanel() {
  const [serverUrl, setServerUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await backupService.setServerUrl(serverUrl);
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResult('idle');

    try {
      const success = await backupService.syncToServer();
      setSyncResult(success ? 'success' : 'error');
    } catch (error) {
      setSyncResult('error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          云端备份配置
        </CardTitle>
        <CardDescription>
          配置远程备份服务器，实现数据自动同步
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="server-url">备份服务器地址</Label>
          <div className="flex gap-2">
            <Input
              id="server-url"
              placeholder="https://your-backup-server.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            <Button
              onClick={handleSaveConfig}
              disabled={!serverUrl || isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-medium">手动同步</h4>
          <Button
            variant="outline"
            onClick={handleManualSync}
            disabled={!serverUrl || isSyncing}
            className="w-full"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                同步中...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                立即同步到服务器
              </>
            )}
          </Button>

          <AnimatePresence>
            {syncResult === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm"
              >
                同步成功！
              </motion.div>
            )}
            {syncResult === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm"
              >
                同步失败，请检查服务器地址
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

export function ManualPanel({ onNavigate }: { onNavigate?: (tab: AppTab) => void }) {
  const [query, setQuery] = useState('');

  const manualSections = [
    {
      id: 'mindcanvas',
      title: 'MindCanvas 知识学习',
      icon: Map,
      targetTab: 'mindmap' as AppTab,
      actionLabel: '进入 MindCanvas',
      summary: '浏览知识结构、搜索节点、筛选薄弱点和高频考点。',
      steps: [
        '在画布中拖动画面，使用缩放按钮调整视野。',
        '通过顶部搜索框定位知识点；选择“仅看薄弱点”可聚焦红色需加强分支。',
        '选择真题套卷后，系统会高亮该套卷覆盖的知识点。',
        '点击知识点节点，可查看说明并进入针对性练习。',
      ],
    },
    {
      id: 'practice',
      title: '智能练习',
      icon: Dumbbell,
      targetTab: 'practice' as AppTab,
      actionLabel: '开始练习',
      summary: '按顺序、随机、薄弱点或套卷开始刷题。',
      steps: [
        '选择练习数量和答题模式后开始练习。',
        '逐题模式会即时反馈；整卷模式适合模拟考试。',
        '练习过程中可高亮、圈选、划掉选项或记录备注。',
        '提交后系统会更新练习记录、错题和知识点掌握状态。',
      ],
    },
    {
      id: 'wrongbook',
      title: '错题本复盘',
      icon: ClipboardList,
      targetTab: 'wrongbook' as AppTab,
      actionLabel: '查看错题本',
      summary: '查看错题、补充笔记，并回到知识点复习。',
      steps: [
        '按知识点或题目列表查看历史错题。',
        '打开题目后查看答案、解析和自己的作答记录。',
        '给错题补充原因、技巧或提醒。',
        '复盘后回到 MindCanvas 处理对应薄弱知识点。',
      ],
    },
    {
      id: 'report',
      title: '数据报告',
      icon: BarChart3,
      targetTab: 'report' as AppTab,
      actionLabel: '查看报告',
      summary: '查看能力雷达、PS 趋势、全景图和做题行为回放。',
      steps: [
        '能力雷达用于观察言语、数量、判断、资料、常识等维度。',
        'PS 趋势用于观察掌握度是否随练习提升。',
        '全景图用于快速发现薄弱区和熟练区。',
        '做题记录可查看答题时间、修改答案和标注行为。',
      ],
    },
    {
      id: 'data',
      title: '数据与备份',
      icon: ShieldCheck,
      targetTab: 'center' as AppTab,
      actionLabel: '去个人中心',
      summary: '导出学习数据、从备份恢复，并查看最近删除。',
      steps: [
        '在个人中心导出数据，可获得当前学习数据备份。',
        '从备份恢复会覆盖当前数据，操作前请确认备份来源。',
        '安全快照可用于恢复到之前的本地状态。',
        '最近删除保留近期误删的题目和导图节点，可尝试恢复。',
      ],
    },
  ];

  const quickStarts = [
    '先在 MindCanvas 找到薄弱知识点',
    '进入智能练习完成一组针对训练',
    '练习后到错题本补充错因',
    '最后在数据报告查看掌握度变化',
  ];

  const goalCards = [
    {
      title: '我要快速提分',
      description: '优先筛选薄弱点，做针对练习，再看报告确认是否改善。',
      tab: 'mindmap' as AppTab,
    },
    {
      title: '我要整理错题',
      description: '进入错题本补充错因，把错题重新绑定到正确知识点。',
      tab: 'wrongbook' as AppTab,
    },
    {
      title: '我要维护题库',
      description: '在桌面端进入题库管理，新增题目、套卷和知识点绑定。',
      tab: 'bank' as AppTab,
    },
    {
      title: '我要保护数据',
      description: '先导出备份，再执行恢复、批量维护或大规模编辑。',
      tab: 'center' as AppTab,
    },
  ];

  const faqs = [
    {
      question: '为什么有些题显示未绑定知识点？',
      answer: '通常是题目导入时没有关联知识点，或知识点 ID 与当前导图不一致。可以在题库管理里重新绑定。',
    },
    {
      question: '为什么选择套卷后 MindCanvas 没有高亮？',
      answer: '请检查题目是否已归入同一套卷，并确认这些题目已经绑定到知识点。',
    },
    {
      question: '为什么做题记录没有行为回放？',
      answer: '只有做题时使用高亮、圈选、划掉选项、修改答案或备注等操作，才会生成可回放的行为事件。',
    },
    {
      question: '手机端适合做什么？',
      answer: '手机端更适合浏览知识点、刷题、查看错题和报告；题库维护和大规模导图编辑建议在桌面端完成。',
    },
    {
      question: '我应该每天按什么顺序使用？',
      answer: '建议先看薄弱点，再完成一组针对练习，随后处理错题笔记，最后用数据报告确认掌握度是否提升。',
    },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = normalizedQuery
    ? manualSections.filter(section => (
      section.title.toLowerCase().includes(normalizedQuery)
      || section.summary.toLowerCase().includes(normalizedQuery)
      || section.steps.some(step => step.toLowerCase().includes(normalizedQuery))
    ))
    : manualSections;
  const filteredFaqs = normalizedQuery
    ? faqs.filter(faq => (
      faq.question.toLowerCase().includes(normalizedQuery)
      || faq.answer.toLowerCase().includes(normalizedQuery)
    ))
    : faqs;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              帮助中心
            </div>
            <CardTitle className="text-xl">平台用户手册</CardTitle>
            <CardDescription className="mt-2">
              面向正式用户的使用指南：从知识学习、刷题复盘到数据报告和备份恢复，按实际使用流程组织。
            </CardDescription>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索手册内容"
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-4 text-sm text-cyan-950">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4" />
            推荐使用路径
          </div>
          <p className="leading-6">
            每次学习建议按“找薄弱点、针对练习、错题复盘、查看报告”的闭环进行。题库管理和 Mind 编辑属于维护型功能，批量操作前建议先导出备份。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {quickStarts.map((item, index) => (
            <div key={item} className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </div>
              <div className="text-sm font-medium leading-5">{item}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {goalCards.map(card => (
            <button
              key={card.title}
              type="button"
              disabled={!onNavigate}
              onClick={() => onNavigate?.(card.tab)}
              className="rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-background"
            >
              <div className="text-sm font-semibold">{card.title}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
              {onNavigate && (
                <div className="mt-3 flex items-center text-xs font-medium text-primary">
                  进入相关功能
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-3 text-sm font-medium">章节目录</div>
            <div className="space-y-1">
              {manualSections.map(section => {
                const Icon = section.icon;
                return (
                  <a
                    key={section.id}
                    href={`#manual-${section.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{section.title}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                );
              })}
            </div>
          </div>

          <ScrollArea className="h-[430px] rounded-lg border bg-background">
            <div className="space-y-3 p-4">
              {filteredSections.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <Search className="mb-2 h-6 w-6" />
                  没有找到匹配内容
                </div>
              ) : (
                filteredSections.map(section => {
                  const Icon = section.icon;
                  return (
                    <section key={section.id} id={`manual-${section.id}`} className="rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold">{section.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
                          <ol className="mt-3 space-y-2">
                            {section.steps.map((step, index) => (
                              <li key={step} className="flex gap-2 text-sm leading-6">
                                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                                  {index + 1}
                                </span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                          {onNavigate && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-4"
                              onClick={() => onNavigate(section.targetTab)}
                            >
                              {section.actionLabel}
                              <ChevronRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <HelpCircle className="h-4 w-4" />
            常见问题
          </div>
          {filteredFaqs.length === 0 ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">没有找到匹配的问题</div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {filteredFaqs.map((faq, index) => (
                <AccordionItem key={faq.question} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left text-sm">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CenterDashboard() {
  const { nodes, practiceRecords, psHistory } = useAppStore();

  const weakCount = nodes.filter(n => n.ps_score < 80).length;
  const mediumCount = nodes.filter(n => n.ps_score >= 80 && n.ps_score < 150).length;
  const strongCount = nodes.filter(n => n.ps_score >= 150).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-2">
        <h2 className="text-2xl font-bold tracking-tight">个人中心</h2>
        <p className="text-muted-foreground">
          管理你的学习数据和安全设置
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 pt-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">{weakCount}</div>
                <div className="text-sm text-muted-foreground">薄弱知识点</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{mediumCount}</div>
                <div className="text-sm text-muted-foreground">学习中</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 border-cyan-200 dark:border-cyan-800">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{strongCount}</div>
                <div className="text-sm text-muted-foreground">熟练掌握</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold">{practiceRecords.length}</div>
                <div className="text-sm text-muted-foreground">总练习次数</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ExportPanel />
            <RestorePanel />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SnapshotPanel />
            <BackupConfigPanel />
          </div>

          <RecentDeletionPanel />
        </div>
      </ScrollArea>
    </div>
  );
}
