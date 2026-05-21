import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  db,
  exportAllData,
  importAllData,
  getBackupConfig,
  updateBackupConfig,
} from '@/lib/db/database';

export interface BackupData {
  version: number;
  exported_at: string;
  knowledge_nodes: any[];
  practice_records: any[];
  ps_history: any[];
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
      await importAllData(data);
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

    const backupData: BackupData = {
      version: 1,
      exported_at: new Date().toISOString(),
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
      const zip = await JSZip.loadAsync(file);

      const jsonFile = Object.keys(zip.files).find(
        f => f.endsWith('.json') && f.includes('backup')
      );

      if (!jsonFile) {
        throw new Error('Invalid backup file format');
      }

      const content = await zip.file(jsonFile)?.async('string');
      const data: BackupData = JSON.parse(content!);

      if (!data.version || !data.knowledge_nodes) {
        throw new Error('Invalid backup file structure');
      }

      await importAllData({
        knowledge_nodes: data.knowledge_nodes,
        practice_records: data.practice_records,
        ps_history: data.ps_history,
      });

      return true;
    } catch (error) {
      console.error('Restore from file failed:', error);
      return false;
    }
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
