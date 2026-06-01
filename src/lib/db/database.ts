import Dexie, { Table } from 'dexie';
import type {
  BehaviorEventRecord,
  KnowledgeNodeRecord,
  PracticeRecord,
  PSHistoryRecord,
  Snapshot,
  BackupConfig,
} from '@/types';

export type LocalBehaviorEventRecord = BehaviorEventRecord & {
  sync_status: 'pending' | 'synced';
  created_at: string;
};

class ExamDB extends Dexie {
  knowledge_nodes!: Table<KnowledgeNodeRecord>;
  practice_records!: Table<PracticeRecord>;
  ps_history!: Table<PSHistoryRecord>;
  snapshots!: Table<Snapshot>;
  backup_config!: Table<BackupConfig>;
  behavior_events!: Table<LocalBehaviorEventRecord>;

  constructor() {
    super('CivilExamDB');

    this.version(1).stores({
      knowledge_nodes: 'id, user_id, parent_id, ps_score, updated_at',
      practice_records: 'id, user_id, question_id, updated_at',
      ps_history: 'id, node_id, user_id, recorded_at',
      snapshots: 'id, created_at',
      backup_config: 'id',
    });

    this.version(2).stores({
      knowledge_nodes: 'id, user_id, parent_id, ps_score, updated_at',
      practice_records: 'id, user_id, question_id, updated_at',
      ps_history: 'id, node_id, user_id, recorded_at',
      snapshots: 'id, created_at',
      backup_config: 'id',
      behavior_events: 'id, userId, questionId, eventType, sync_status, created_at',
    });
  }
}

export const db = new ExamDB();

export const CURRENT_USER_ID = 'user_me';

export async function getNodesByUser(userId: string = CURRENT_USER_ID): Promise<KnowledgeNodeRecord[]> {
  return db.knowledge_nodes.where('user_id').equals(userId).toArray();
}

export async function getNodeById(id: string): Promise<KnowledgeNodeRecord | undefined> {
  return db.knowledge_nodes.get(id);
}

export async function getWeakNodes(threshold: number = 80, userId: string = CURRENT_USER_ID): Promise<KnowledgeNodeRecord[]> {
  return db.knowledge_nodes
    .where('user_id')
    .equals(userId)
    .filter(node => node.ps_score < threshold)
    .toArray();
}

export async function updateNodePS(
  nodeId: string,
  psScore: number,
  userId: string = CURRENT_USER_ID
): Promise<void> {
  const node = await db.knowledge_nodes.get(nodeId);
  if (!node || node.user_id !== userId) return;

  await db.knowledge_nodes.update(nodeId, {
    ps_score: psScore,
    last_practiced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function addPracticeRecord(record: PracticeRecord): Promise<void> {
  await db.practice_records.add(record);
}

export async function addPSHistory(record: PSHistoryRecord): Promise<void> {
  await db.ps_history.add(record);
}

export async function getPSHistory(
  nodeId: string,
  userId: string = CURRENT_USER_ID
): Promise<PSHistoryRecord[]> {
  return db.ps_history
    .where(['node_id', 'user_id'])
    .equals([nodeId, userId])
    .sortBy('recorded_at');
}

export async function createSnapshot(reason: string): Promise<string> {
  const nodes = await db.knowledge_nodes.toArray();
  const records = await db.practice_records.toArray();
  const history = await db.ps_history.toArray();
  const behaviorEvents = await db.behavior_events.toArray();

  const id = `snapshot_${Date.now()}`;
  const snapshot: Snapshot = {
    id,
    created_at: new Date().toISOString(),
    data: JSON.stringify({
      knowledge_nodes: nodes,
      practice_records: records,
      ps_history: history,
      behavior_events: behaviorEvents,
      reason,
    }),
  };

  await db.snapshots.add(snapshot);
  return id;
}

export async function restoreSnapshot(id: string): Promise<boolean> {
  try {
    const snapshot = await db.snapshots.get(id);
    if (!snapshot) return false;

    const data = JSON.parse(snapshot.data);

    await db.transaction('rw', [db.knowledge_nodes, db.practice_records, db.ps_history, db.behavior_events], async () => {
      await db.knowledge_nodes.clear();
      await db.practice_records.clear();
      await db.ps_history.clear();
      await db.behavior_events.clear();

      if (data.knowledge_nodes?.length) {
        await db.knowledge_nodes.bulkAdd(data.knowledge_nodes);
      }
      if (data.practice_records?.length) {
        await db.practice_records.bulkAdd(data.practice_records);
      }
      if (data.ps_history?.length) {
        await db.ps_history.bulkAdd(data.ps_history);
      }
      if (data.behavior_events?.length) {
        await db.behavior_events.bulkAdd(data.behavior_events);
      }
    });

    return true;
  } catch {
    return false;
  }
}

export async function getLatestSnapshot(): Promise<Snapshot | undefined> {
  return db.snapshots.orderBy('created_at').reverse().first();
}

export async function getBackupConfig(): Promise<BackupConfig | undefined> {
  return db.backup_config.get('default');
}

export async function updateBackupConfig(config: Partial<BackupConfig>): Promise<void> {
  const existing = await getBackupConfig();
  if (existing) {
    await db.backup_config.update('default', config);
  } else {
    await db.backup_config.add({
      id: 'default',
      server_url: null,
      last_sync_at: null,
      auto_sync_enabled: false,
      ...config,
    });
  }
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [
    db.knowledge_nodes,
    db.practice_records,
    db.ps_history,
    db.snapshots,
    db.behavior_events,
  ], async () => {
    await db.knowledge_nodes.clear();
    await db.practice_records.clear();
    await db.ps_history.clear();
    await db.snapshots.clear();
    await db.behavior_events.clear();
  });
}

export async function exportAllData(): Promise<{
  knowledge_nodes: KnowledgeNodeRecord[];
  practice_records: PracticeRecord[];
  ps_history: PSHistoryRecord[];
  behavior_events: LocalBehaviorEventRecord[];
}> {
  const [nodes, records, history, behaviorEvents] = await Promise.all([
    db.knowledge_nodes.toArray(),
    db.practice_records.toArray(),
    db.ps_history.toArray(),
    db.behavior_events.toArray(),
  ]);

  return { knowledge_nodes: nodes, practice_records: records, ps_history: history, behavior_events: behaviorEvents };
}

export async function importAllData(data: {
  knowledge_nodes?: KnowledgeNodeRecord[];
  practice_records?: PracticeRecord[];
  ps_history?: PSHistoryRecord[];
  behavior_events?: LocalBehaviorEventRecord[];
}): Promise<void> {
  await db.transaction('rw', [
    db.knowledge_nodes,
    db.practice_records,
    db.ps_history,
    db.behavior_events,
  ], async () => {
    await db.knowledge_nodes.clear();
    await db.practice_records.clear();
    await db.ps_history.clear();
    await db.behavior_events.clear();

    if (data.knowledge_nodes?.length) {
      await db.knowledge_nodes.bulkPut(data.knowledge_nodes);
    }
    if (data.practice_records?.length) {
      await db.practice_records.bulkPut(data.practice_records);
    }
    if (data.ps_history?.length) {
      await db.ps_history.bulkPut(data.ps_history);
    }
    if (data.behavior_events?.length) {
      await db.behavior_events.bulkPut(data.behavior_events);
    }
  });
}
