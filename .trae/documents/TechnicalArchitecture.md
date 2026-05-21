# 智能公考知识图谱学习平台 - 技术架构文档

## 1. 系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端应用层 (React)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ 知识导图  │  │ 练习系统  │  │ 数据报告  │  │ 个人中心  │      │
│  │ (G6)    │  │ (答题器) │  │ (ECharts)│  │ (导出)   │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
├─────────────────────────────────────────────────────────────────┤
│                      动效层 (Framer Motion)                      │
├─────────────────────────────────────────────────────────────────┤
│                     状态管理层 (Zustand + Context)                │
├─────────────────────────────────────────────────────────────────┤
│                      本地数据层 (Dexie.js)                       │
│                     ┌──────────────────┐                        │
│                     │   IndexedDB      │                        │
│                     │  - knowledge_nodes│                       │
│                     │  - practice_records│                       │
│                     │  - ps_history    │                        │
│                     │  - snapshots     │                        │
│                     │  - backup_config │                        │
│                     └──────────────────┘                        │
├─────────────────────────────────────────────────────────────────┤
│                      备份同步层 (可选)                           │
│         ┌────────────────────────────────────────┐             │
│         │  BackupService (静默同步)              │             │
│         │  - /api/backup/sync (POST)             │             │
│         │  - /api/backup/restore (GET)          │             │
│         └────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 技术选型详情

### 2.1 核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| Vite | 5.x | 构建工具 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 4.x | 样式方案 |
| @antv/g6 | 5.x | 知识图谱渲染 |
| echarts | 5.x | 图表组件 |
| framer-motion | 11.x | 动效库 |
| dexie | 4.x | IndexedDB ORM |
| zustand | 4.x | 状态管理 |
| jszip | 3.x | ZIP 文件生成 |
| file-saver | 2.x | 文件下载 |

### 2.2 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # 根布局
│   ├── page.tsx             # 首页
│   ├── mindmap/
│   │   └── page.tsx         # 知识导图页面
│   ├── practice/
│   │   ├── page.tsx        # 练习入口
│   │   ├── [mode]/
│   │   │   └── page.tsx    # 各练习模式
│   ├── report/
│   │   ├── page.tsx        # 报告入口
│   │   └── [type]/
│   │       └── page.tsx    # 各报告类型
│   └── center/
│       ├── page.tsx        # 个人中心
│       └── backup/
│           └── page.tsx    # 备份恢复
├── components/
│   ├── ui/                  # shadcn/ui 组件
│   ├── MindMap/            # 知识导图组件
│   │   ├── KnowledgeGraph.tsx
│   │   ├── NodeRenderer.tsx
│   │   ├── FocusMode.tsx
│   │   └── FlyingDot.tsx   # 飞入动效
│   ├── Practice/           # 练习组件
│   │   ├── QuestionCard.tsx
│   │   ├── AnswerOptions.tsx
│   │   └── DrawingCanvas.tsx # 画笔工具
│   ├── Report/            # 报告组件
│   │   ├── RadarChart.tsx
│   │   ├── TrendChart.tsx
│   │   └── HoneycombMap.tsx
│   └── Center/            # 个人中心组件
│       ├── ExportPanel.tsx
│       └── RestorePanel.tsx
├── lib/
│   ├── db/                 # 数据库层
│   │   ├── database.ts     # Dexie 配置
│   │   ├── schema.ts      # 数据模型
│   │   └── migrations.ts   # 迁移脚本
│   ├── services/           # 业务服务
│   │   ├── psCalculator.ts # PS 算法
│   │   ├── backupService.ts # 备份服务
│   │   └── syncService.ts  # 同步服务
│   ├── hooks/             # 自定义 Hooks
│   │   ├── useKnowledgeMap.ts
│   │   ├── usePSUpdate.ts
│   │   └── useBackup.ts
│   ├── stores/            # Zustand Store
│   │   ├── appStore.ts
│   │   └── mindmapStore.ts
│   └── utils/
│       ├── colors.ts      # 热力颜色工具
│       └── export.ts      # 导出工具
├── types/                  # 类型定义
│   └── index.ts
└── styles/
    └── globals.css        # 全局样式
```

## 3. 数据库设计

### 3.1 Dexie.js 配置

```typescript
// lib/db/database.ts
import Dexie, { Table } from 'dexie';

export interface KnowledgeNodeRecord {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  pos_x: number;
  pos_y: number;
  ps_score: number;
  last_practiced_at: string | null;
  color_tag: string;
  updated_at: string;
}

export interface PracticeRecord {
  id: string;
  user_id: string;
  question_id: string;
  is_correct: boolean;
  answer_time: number;
  source_node_ids: string[];
  updated_at: string;
}

export interface PSHistoryRecord {
  id: string;
  node_id: string;
  ps_score: number;
  recorded_at: string;
  user_id: string;
}

export interface Snapshot {
  id: string;
  created_at: string;
  data: string; // JSON stringified
}

export interface BackupConfig {
  id: string;
  server_url: string | null;
  last_sync_at: string | null;
  auto_sync_enabled: boolean;
}

class ExamDB extends Dexie {
  knowledge_nodes!: Table<KnowledgeNodeRecord>;
  practice_records!: Table<PracticeRecord>;
  ps_history!: Table<PSHistoryRecord>;
  snapshots!: Table<Snapshot>;
  backup_config!: Table<BackupConfig>;

  constructor() {
    super('CivilExamDB');
    this.version(1).stores({
      knowledge_nodes: 'id, user_id, parent_id, ps_score, updated_at',
      practice_records: 'id, user_id, question_id, updated_at',
      ps_history: 'id, node_id, user_id, recorded_at',
      snapshots: 'id, created_at',
      backup_config: 'id'
    });
  }
}

export const db = new ExamDB();
```

### 3.2 数据迁移策略

```typescript
// lib/db/migrations.ts
export const migrations = {
  1: (db: ExamDB) => {
    // 初始化默认知识图谱
  },
  2: (db: ExamDB) => {
    // 添加新的索引
  }
};
```

## 4. PS 算法实现

### 4.1 核心算法

```typescript
// lib/services/psCalculator.ts
export interface PSParams {
  currentPS: number;
  isCorrect: boolean;
  scenarioCoefficient: number; // D: 0.5-2.0
  lastPracticedAt: Date;
}

export function calculatePS(params: PSParams): number {
  const { currentPS, isCorrect, scenarioCoefficient, lastPracticedAt } = params;

  // 计算遗忘半衰期 H
  const H = 3 + (Math.min(currentPS, 150) / 150) * 12;

  // 计算距上次练习的天数
  const elapsedDays = (Date.now() - lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24);

  // 艾宾浩斯遗忘曲线
  const retentionRate = Math.pow(0.5, elapsedDays / H);

  // 基础 PS 更新
  let newPS = currentPS * retentionRate;

  // 根据正确率和场景系数调整
  if (isCorrect) {
    newPS += scenarioCoefficient * 20 * (1 - retentionRate);
  } else {
    newPS -= scenarioCoefficient * 15 * retentionRate;
  }

  // 边界约束 [0, 200]
  return Math.max(0, Math.min(200, Math.round(newPS)));
}

// 场景系数常量
export const SCENARIO_COEFFICIENTS = {
  GLANCE: 0.5,      // 看了一眼
  PRACTICE: 1.0,    // 练习
  MOCK_EXAM: 1.5,   // 模拟考试
  REAL_EXAM: 2.0,   // 真题考试
} as const;
```

## 5. 热力颜色映射

### 5.1 颜色配置

```typescript
// lib/utils/colors.ts
export interface PSColorConfig {
  background: string;
  border: string;
  text: string;
  pulse: boolean;
}

export function getPSColor(ps: number): PSColorConfig {
  if (ps < 0) {
    return {
      background: '#DC2626',
      border: '#B91C1C',
      text: '#FFFFFF',
      pulse: true,
    };
  } else if (ps < 80) {
    return {
      background: '#EA580C',
      border: '#C2410C',
      text: '#FFFFFF',
      pulse: true,
    };
  } else if (ps < 150) {
    return {
      background: '#CA8A04',
      border: '#A16207',
      text: '#FFFFFF',
      pulse: false,
    };
  } else {
    return {
      background: '#0891B2',
      border: '#0E7490',
      text: '#FFFFFF',
      pulse: false,
    };
  }
}

// CSS 变量
export const PS_CSS_VARS = {
  '--ps-critical': '#DC2626',
  '--ps-weak': '#EA580C',
  '--ps-learning': '#CA8A04',
  '--ps-mastered': '#0891B2',
} as const;
```

## 6. 备份服务实现

### 6.1 BackupService 类

```typescript
// lib/services/backupService.ts
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { db } from '../db/database';

export class BackupService {
  private serverUrl: string | null = null;

  async setServerUrl(url: string) {
    this.serverUrl = url;
    await db.backup_config.put({
      id: 'default',
      server_url: url,
      auto_sync_enabled: true,
    });
  }

  // 静默同步到服务器
  async syncToServer(): Promise<boolean> {
    if (!this.serverUrl) return false;

    try {
      const nodes = await db.knowledge_nodes.toArray();
      const records = await db.practice_records.toArray();
      const history = await db.ps_history.toArray();

      const response = await fetch(`${this.serverUrl}/api/backup/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledge_nodes: nodes,
          practice_records: records,
          ps_history: history,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        await db.backup_config.update('default', {
          last_sync_at: new Date().toISOString(),
        });
        return true;
      }
    } catch (error) {
      console.error('Backup sync failed:', error);
    }
    return false;
  }

  // 从服务器恢复
  async restoreFromServer(): Promise<boolean> {
    if (!this.serverUrl) return false;

    try {
      const response = await fetch(`${this.serverUrl}/api/backup/restore`);
      if (!response.ok) return false;

      const data = await response.json();
      await this.restoreData(data);
      return true;
    } catch (error) {
      console.error('Restore from server failed:', error);
      return false;
    }
  }

  // 导出本地文件
  async exportToFile(): Promise<void> {
    const zip = new JSZip();

    const nodes = await db.knowledge_nodes.toArray();
    const records = await db.practice_records.toArray();
    const history = await db.ps_history.toArray();

    // 备份 JSON
    const backupData = {
      version: 1,
      exported_at: new Date().toISOString(),
      knowledge_nodes: nodes,
      practice_records: records,
      ps_history: history,
    };
    zip.file(
      `skillmap_backup_${formatDate(new Date())}.json`,
      JSON.stringify(backupData, null, 2)
    );

    // PS 时间序列 CSV
    const csvContent = this.generatePSCSV(history);
    zip.file('ps_timeline.csv', csvContent);

    // 备份配置
    const config = await db.backup_config.get('default');
    zip.file('backup_config.json', JSON.stringify(config, null, 2));

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `skillmap_backup_${formatDate(new Date())}.zip`);
  }

  // 从备份文件恢复
  async restoreFromFile(file: File): Promise<boolean> {
    try {
      const zip = await JSZip.loadAsync(file);
      const jsonFile = Object.keys(zip.files).find(f => f.endsWith('.json'));

      if (!jsonFile) {
        throw new Error('Invalid backup file');
      }

      const content = await zip.file(jsonFile)?.async('string');
      const data = JSON.parse(content!);

      await this.restoreData(data);
      return true;
    } catch (error) {
      console.error('Restore from file failed:', error);
      return false;
    }
  }

  private async restoreData(data: any): Promise<void> {
    await db.transaction('rw',
      [db.knowledge_nodes, db.practice_records, db.ps_history],
      async () => {
        await db.knowledge_nodes.clear();
        await db.practice_records.clear();
        await db.ps_history.clear();

        if (data.knowledge_nodes) {
          await db.knowledge_nodes.bulkAdd(data.knowledge_nodes);
        }
        if (data.practice_records) {
          await db.practice_records.bulkAdd(data.practice_records);
        }
        if (data.ps_history) {
          await db.ps_history.bulkAdd(data.ps_history);
        }
      }
    );
  }

  private generatePSCSV(history: any[]): string {
    const headers = ['节点ID', 'PS分数', '记录时间', '用户ID'];
    const rows = history.map(h => [
      h.node_id,
      h.ps_score,
      h.recorded_at,
      h.user_id,
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
```

## 7. 快照管理

### 7.1 快照服务

```typescript
// lib/services/snapshotService.ts
import { db } from '../db/database';

export class SnapshotService {
  async createSnapshot(reason: string): Promise<string> {
    const nodes = await db.knowledge_nodes.toArray();
    const records = await db.practice_records.toArray();
    const history = await db.ps_history.toArray();

    const snapshot = {
      created_at: new Date().toISOString(),
      data: JSON.stringify({
        knowledge_nodes: nodes,
        practice_records: records,
        ps_history: history,
        reason,
      }),
    };

    const id = `snapshot_before_${Date.now()}`;
    await db.snapshots.add({ id, ...snapshot });
    return id;
  }

  async getLatestSnapshot(): Promise<any | null> {
    const snapshots = await db.snapshots
      .orderBy('created_at')
      .reverse()
      .first();
    return snapshots ? JSON.parse(snapshots.data) : null;
  }

  async restoreSnapshot(id: string): Promise<boolean> {
    try {
      const snapshot = await db.snapshots.get(id);
      if (!snapshot) return false;

      const data = JSON.parse(snapshot.data);

      await db.transaction('rw',
        [db.knowledge_nodes, db.practice_records, db.ps_history],
        async () => {
          await db.knowledge_nodes.clear();
          await db.practice_records.clear();
          await db.ps_history.clear();

          await db.knowledge_nodes.bulkAdd(data.knowledge_nodes || []);
          await db.practice_records.bulkAdd(data.practice_records || []);
          await db.ps_history.bulkAdd(data.ps_history || []);
        }
      );

      return true;
    } catch (error) {
      console.error('Restore snapshot failed:', error);
      return false;
    }
  }

  async listSnapshots(): Promise<Array<{ id: string; created_at: string; reason: string }>> {
    const snapshots = await db.snapshots.orderBy('created_at').reverse().toArray();
    return snapshots.map(s => {
      const data = JSON.parse(s.data);
      return {
        id: s.id,
        created_at: s.created_at,
        reason: data.reason || '未知',
      };
    });
  }
}
```

## 8. 动效实现

### 8.1 脉动动画配置

```typescript
// lib/utils/animations.ts
import { Variants } from 'framer-motion';

export const PULSE_VARIANTS: Variants = {
  initial: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const GENTLE_PULSE_VARIANTS: Variants = {
  initial: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.02, 1],
    opacity: [1, 0.9, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// 飞入动效
export const FLYING_DOT_VARIANTS: Variants = {
  initial: {
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
  },
  fly: {
    x: 0,
    y: 0,
    scale: [1, 1.5, 0.5],
    opacity: [1, 1, 0],
    transition: {
      duration: 0.8,
      ease: 'easeOut',
    },
  },
};
```

### 8.2 高亮闪烁效果

```typescript
export const HIGHLIGHT_FLASH_VARIANTS: Variants = {
  initial: { filter: 'brightness(1)' },
  flash: {
    filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1.2)'],
    transition: {
      duration: 0.5,
      times: [0, 0.3, 1],
    },
  },
};
```

## 9. API 设计（可选后端）

### 9.1 备份同步接口

```typescript
// POST /api/backup/sync
// Request
interface SyncRequest {
  knowledge_nodes: KnowledgeNodeRecord[];
  practice_records: PracticeRecord[];
  ps_history: PSHistoryRecord[];
  timestamp: string;
}

// Response
interface SyncResponse {
  success: boolean;
  message?: string;
}

// GET /api/backup/restore
// Response
interface RestoreResponse {
  knowledge_nodes: KnowledgeNodeRecord[];
  practice_records: PracticeRecord[];
  ps_history: PSHistoryRecord[];
}
```

## 10. 性能优化策略

### 10.1 知识图谱优化

```typescript
// 节点虚拟化
const VIEWPORT_CONFIG = {
  padding: 50,
  nodeMinSize: 20,
  maxVisibleNodes: 100,
};

// 增量渲染
function renderVisibleNodes(
  nodes: KnowledgeNodeRecord[],
  viewport: { x: number; y: number; width: number; height: number }
): KnowledgeNodeRecord[] {
  return nodes.filter(node =>
    node.pos_x >= viewport.x - VIEWPORT_CONFIG.padding &&
    node.pos_x <= viewport.x + viewport.width + VIEWPORT_CONFIG.padding &&
    node.pos_y >= viewport.y - VIEWPORT_CONFIG.padding &&
    node.pos_y <= viewport.y + viewport.height + VIEWPORT_CONFIG.padding
  );
}
```

### 10.2 IndexedDB 查询优化

```typescript
// 使用复合索引
await db.knowledge_nodes
  .where(['user_id', 'ps_score'])
  .between(['user_1', 0], ['user_1', 80])
  .toArray();

// 批量操作
await db.knowledge_nodes.bulkPut(nodes);
```

---

*文档版本：v1.0*
*最后更新：2026-05-11*
