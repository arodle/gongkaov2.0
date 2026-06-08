import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  db,
  createSnapshot,
  exportAllData,
  importAllData,
  getBackupConfig,
  updateBackupConfig,
} from '@/lib/db/database';

export interface BackupData {
  version: number;
  exported_at: string;
  user_ids?: string[];
  knowledge_nodes: any[];
  practice_records: any[];
  ps_history: any[];
  behavior_events?: any[];
}

export class BackupService {
  private serverUrl: string | null = null;
  private autoSyncInterval: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    const config = await getBackupConfig();
    if (config?.server_url) {
      this.serverUrl = config.server_url;
    }
  }

  async setServerUrl(url: string): Promise<void> {
    this.serverUrl = url;
    await updateBackupConfig({
      server_url: url,
      auto_sync_enabled: true,
    });
  }

  async syncToServer(): Promise<boolean> {
    if (!this.serverUrl) return false;

    try {
      const data = await exportAllData();

      const response = await fetch(`${this.serverUrl}/api/backup/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        await updateBackupConfig({
          last_sync_at: new Date().toISOString(),
        });
        return true;
      }
    } catch (error) {
      console.error('Backup sync failed:', error);
    }
    return false;
  }

  async restoreFromServer(): Promise<boolean> {
    if (!this.serverUrl) return false;

    try {
      const response = await fetch(`${this.serverUrl}/api/backup/restore`);
      if (!response.ok) return false;

      const data = await response.json();
      this.validateBackupData(data);
      await createSnapshot('恢复服务器备份前自动快照');
      await importAllData({
        knowledge_nodes: data.knowledge_nodes,
        practice_records: data.practice_records,
        ps_history: data.ps_history,
        behavior_events: data.behavior_events,
      });
      return true;
    } catch (error) {
      console.error('Restore from server failed:', error);
      return false;
    }
  }

  startAutoSync(intervalMs: number = 5 * 60 * 1000): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    this.autoSyncInterval = setInterval(() => {
      this.syncToServer().catch(console.error);
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  async exportToFile(): Promise<void> {
    const zip = new JSZip();

    const data = await exportAllData();
    const userIds = this.collectUserIds(data);

    const backupData: BackupData = {
      version: 1,
      exported_at: new Date().toISOString(),
      user_ids: userIds,
      ...data,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    zip.file(
      `skillmap_backup_${dateStr}.json`,
      JSON.stringify(backupData, null, 2)
    );

    if (data.ps_history.length > 0) {
      const csvContent = this.generatePSCSV(data.ps_history);
      zip.file('ps_timeline.csv', csvContent);
    }

    const config = await getBackupConfig();
    zip.file('backup_config.json', JSON.stringify(config || {}, null, 2));

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `skillmap_backup_${dateStr}.zip`);
  }

  async restoreFromFile(file: File): Promise<boolean> {
    try {
      const data = await this.readBackupFile(file);
      this.validateBackupData(data);
      await createSnapshot('恢复文件备份前自动快照');

      await importAllData({
        knowledge_nodes: data.knowledge_nodes,
        practice_records: data.practice_records,
        ps_history: data.ps_history,
        behavior_events: data.behavior_events,
      });

      return true;
    } catch (error) {
      console.error('Restore from file failed:', error);
      return false;
    }
  }

  private async readBackupFile(file: File): Promise<BackupData> {
    if (file.name.toLowerCase().endsWith('.json')) {
      return JSON.parse(await file.text()) as BackupData;
    }

    const zip = await JSZip.loadAsync(file);
    const jsonFile = Object.keys(zip.files).find(
      f => f.endsWith('.json') && f.includes('backup')
    );

    if (!jsonFile) {
      throw new Error('Invalid backup file format');
    }

    const content = await zip.file(jsonFile)?.async('string');
    return JSON.parse(content || '{}') as BackupData;
  }

  private validateBackupData(data: BackupData) {
    if (!data || data.version !== 1) {
      throw new Error('Unsupported backup version');
    }

    if (!Array.isArray(data.knowledge_nodes)
      || !Array.isArray(data.practice_records)
      || !Array.isArray(data.ps_history)) {
      throw new Error('Invalid backup file structure');
    }

    if (data.behavior_events && !Array.isArray(data.behavior_events)) {
      throw new Error('Invalid behavior event backup structure');
    }

    const userIds = data.user_ids?.length ? data.user_ids : this.collectUserIds(data);
    if (userIds.length > 1) {
      throw new Error('Backup contains multiple user datasets');
    }

    const hasInvalidNode = data.knowledge_nodes.some(item => !item?.id || !item?.user_id);
    const hasInvalidRecord = data.practice_records.some(item => !item?.id || !item?.user_id || !item?.question_id);
    const hasInvalidHistory = data.ps_history.some(item => !item?.id || !item?.user_id || !item?.node_id);
    if (hasInvalidNode || hasInvalidRecord || hasInvalidHistory) {
      throw new Error('Backup contains incomplete records');
    }
  }

  private collectUserIds(data: Partial<BackupData>): string[] {
    const ids = new Set<string>();
    data.knowledge_nodes?.forEach(item => { if (item?.user_id) ids.add(String(item.user_id)); });
    data.practice_records?.forEach(item => { if (item?.user_id) ids.add(String(item.user_id)); });
    data.ps_history?.forEach(item => { if (item?.user_id) ids.add(String(item.user_id)); });
    data.behavior_events?.forEach(item => { if (item?.userId) ids.add(String(item.userId)); });
    return Array.from(ids).sort();
  }

  private generatePSCSV(history: any[]): string {
    const headers = ['节点ID', 'PS分数', '记录时间', '用户ID'];
    const rows = history.map(h => [
      h.node_id,
      h.ps_score,
      h.recorded_at,
      h.user_id,
    ].map(v => `"${v}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }
}

export const backupService = new BackupService();
