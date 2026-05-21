'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import { backupService } from '@/lib/services/backupService';
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
  Database,
  Cloud,
  RefreshCw,
  Trash2,
  History,
  Server,
  Settings,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  HardDrive,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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

      <ScrollArea className="h-[calc(100vh-120px)]">
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
        </div>
      </ScrollArea>
    </div>
  );
}
