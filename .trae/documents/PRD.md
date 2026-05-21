# 智能公考知识图谱学习平台 - 产品需求文档（PRD）

## 1. 产品概述与愿景

### 1.1 产品定位
个人公考备考知识图谱学习平台，采用 Local-First 架构，将知识可视化与 AI 辅助学习深度融合，打造沉浸式、高效的个人学习闭环。

### 1.2 核心价值主张
- **本地优先**：所有数据本地存储，离线可用，永不丢失
- **知识可视化**：动态知识导图配合 PS 热力图，让薄弱点一目了然
- **精准靶向**：基于遗忘曲线算法的智能复习系统，科学对抗遗忘
- **零延迟反馈**：乐观更新机制，答题即见效果

### 1.3 设计美学方向
采用「深邃极客」风格——深色背景配合冰蓝/暖橙/深红等知识温度色系，营造专注学习氛围。动效追求「冷静克制中的惊喜」：微妙的脉动、流畅的过渡、有意义的飞入轨迹。

---

## 2. 目标用户画像

| 维度 | 描述 |
|------|------|
| 用户 | 单一用户自用，未来可能扩展至 5 人以内熟人圈 |
| 用户 ID | 硬编码，隔离所有数据 |
| 使用场景 | 碎片时间刷题、系统复习、模拟考试、复盘报告 |
| 设备 | 桌面端为主，移动端辅助（平板/手机） |

---

## 3. 功能架构

### 3.1 核心功能模块

```
┌─────────────────────────────────────────────────────────────┐
│                    智能公考学习平台                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 知识导图  │  │ 智能练习  │  │ 数据报告  │  │ 个人中心  │    │
│  │          │  │          │  │          │  │          │    │
│  │ • 树形布局│  │ • 顺序练习│  │ • 雷达图 │  │ • 数据导出│    │
│  │ • 热力图 │  │ • 随机练习│  │ • 趋势图 │  │ • 数据恢复│    │
│  │ • 焦点模式│  │ • 靶向练习│  │ • 套卷报告│  │ • 备份配置│    │
│  │ • 飞入动效│  │ • 套卷模考│  │ • 全景图 │  │ • 快照管理│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    三层备份保障系统                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ 本地持久化│  │ 服务端备份│  │ 文件导出 │                  │
│  │ (Dexie) │  │ (可选)    │  │ (ZIP)   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 页面路由结构

```
/                     # 首页/仪表盘（显示今日任务、薄弱点提醒）
/mindmap              # 知识导图（核心页面）
/practice             # 练习入口
  /practice/sequence  # 顺序练习
  /practice/random    # 随机练习
  /practice/targeted  # 靶向练习（薄弱点）
  /practice/exam      # 套卷模考
/report               # 数据报告
  /report/radar       # 能力雷达图
  /report/trend       # PS 趋势曲线
  /report/exam/:id    # 套卷复盘报告
/center               # 个人中心
  /center/export      # 数据导出
  /center/backup      # 备份恢复
  /center/settings    # 系统设置
```

---

## 4. 详细功能规格

### 4.1 动态知识导图（核心模块）

#### 4.1.1 树形布局
- 使用 AntV G6 渲染树形思维导图
- 从 `knowledge_nodes` 表读取节点数据
- 支持 500+ 节点渲染，虚拟化优化保持 30fps+
- 节点层级：科目 → 知识点 → 子知识点 → 出题角度

#### 4.1.2 热力颜色映射
根据 PS 分数实时渲染节点颜色：

| PS 分数范围 | 颜色 | 特效 | 状态含义 |
|------------|------|------|----------|
| PS < 0 | 深红 `#DC2626` | 脉动动画（Framer Motion） | 极度薄弱 |
| 0 ≤ PS < 80 | 橙色 `#EA580C` | 温和脉动 | 薄弱 |
| 80 ≤ PS < 150 | 黄色 `#CA8A04` | 静态 | 掌握中 |
| PS ≥ 150 | 冰蓝 `#0891B2` / 深绿 `#059669` | 静态 | 熟练 |

#### 4.1.3 焦点模式
- 一键切换，将 PS ≥ 80 的节点变为半透明（opacity: 0.3）置灰
- 只保留薄弱节点（红/橙）高亮和脉动
- 帮助用户聚焦复习重点

#### 4.1.4 节点交互
- **点击节点**：右侧抽屉滑出，展示：
  - 节点详情（名称、类型、内容）
  - PS 分数和历史曲线
  - 专项行动卡（快速进入该知识点练习）
- **右键菜单**：
  - "只看薄弱点" → 触发焦点模式
  - "查看历史掌握曲线" → 弹出 ECharts 折线图
  - "加入今日计划" → 添加到今日练习队列

#### 4.1.5 错题飞入动效
- 答题提交错题时：
  1. 页面中心弹出一个光点（Framer Motion）
  2. 沿贝塞尔曲线飞向对应薄弱知识点节点
  3. 节点触发一次高亮闪烁动画
  4. PS 颜色即时更新

### 4.2 智能练习系统

#### 4.2.1 四种练习模式
| 模式 | 说明 | 题目来源 |
|------|------|----------|
| 顺序练习 | 按知识图谱层级依次练习 | 当前展开分支 |
| 随机练习 | 从题库随机抽取 | 全部题库 |
| 靶向练习 | 只练习薄弱点（PS < 80） | 薄弱知识点 |
| 套卷模考 | 完整试卷定时模拟 | 预设/自选套卷 |

#### 4.2.2 答题界面
- **基础功能**：选项高亮、计时器、进度条、提交按钮
- **资料分析特殊**：画笔工具（高亮、下划线、矩形框选）
  - 数据暂存 SessionStorage
- **出题思路面板**：标签页切换
  - 文字思路
  - 常见陷阱
  - 技巧关联（内容为静态示例）

#### 4.2.3 乐观更新流程
```
答题提交 → 即时更新 UI → 后台计算 PS → 校准颜色
    ↓
┌─────────────────┐
│ 1. 立即预估 PS 变化量        │
│ 2. 直接重绘导图颜色（零延迟）  │
│ 3. 异步请求真实 PS 计算       │
│ 4. 若差值 > 5pts，微调颜色   │
└─────────────────┘
```

### 4.3 PS 掌握度算法

#### 4.3.1 算法公式
```typescript
function calculatePS(currentPS: number, isCorrect: boolean, scenarioCoefficient: number): number {
  // 遗忘半衰期计算
  const H = 3 + (Math.min(currentPS, 150) / 150) * 12;

  // 艾宾浩斯遗忘曲线
  const elapsedDays = getDaysSinceLastPractice(nodeId);
  const retentionRate = Math.pow(0.5, elapsedDays / H);

  // 基础 PS 更新
  let newPS = currentPS * retentionRate;

  // 根据正确率和场景系数调整
  if (isCorrect) {
    newPS += scenarioCoefficient * 20 * (1 - retentionRate);
  } else {
    newPS -= scenarioCoefficient * 15 * retentionRate;
  }

  // 边界约束
  return Math.max(0, Math.min(200, Math.round(newPS)));
}
```

#### 4.3.2 场景系数（D）
| 场景 | 系数 | 说明 |
|------|------|------|
| 看了一眼 | 0.5 | 仅浏览未作答 |
| 练习 | 1.0 | 正常练习 |
| 模拟考试 | 1.5 | 计时模拟 |
| 真题考试 | 2.0 | 高强度实战 |

#### 4.3.3 半衰期参考表
| 当前 PS | 半衰期 H | 含义 |
|--------|----------|------|
| 0 | 3 天 | 刚学习的知识遗忘很快 |
| 50 | 7 天 | 中等掌握 |
| 80 | ~9.4 天 | 较好掌握 |
| 150+ | 15 天 | 接近永久记忆 |

### 4.4 数据报告模块

#### 4.4.1 套卷复盘报告
- 本次得分、总题数、正确率
- 错题列表（按知识点分类）
- 本次暴露薄弱节点高亮导图

#### 4.4.2 周期报告图表
- **能力矩阵雷达图**：6 个维度（言语、数量、判断、资料、常识、综合）
- **PS 趋势曲线图**：
  - 横轴：时间
  - 纵轴：PS 分数
  - 从 `ps_history` 表读取数据
  - 使用 ECharts 平滑曲线

#### 4.4.3 游戏化全景图（知识扫雷）
- 蜂窝网格布局
- 每个格子 = 一个知识点
- 颜色映射同热力图
- 点击格子查看详情

### 4.5 个人中心与数据管理

#### 4.5.1 数据导出
导出按钮生成 ZIP 包：
```
skillmap_backup_YYYY-MM-DD.zip
├── skillmap_backup_YYYY-MM-DD.json   # 三表全量数据
├── ps_timeline.csv                    # PS 历史时间序列
├── question_bank_export.csv          # 题库（可选）
└── backup_config.json                 # 备份配置
```

#### 4.5.2 数据恢复
- 从备份文件恢复（上传 JSON/ZIP）
- 从服务器恢复（可选，需配置备份服务器）
- 二次确认对话框防误操作

#### 4.5.3 快照管理
- 进入高风险页面（知识图谱编辑器、批量导入）自动快照
- 快照命名：`snapshot_before_edit_YYYYMMDDHHMMSS`
- 设置页面提供"恢复上一次快照"按钮

---

## 5. 数据模型

### 5.1 IndexedDB 表结构（Dexie.js）

```typescript
// knowledge_nodes - 知识节点表
interface KnowledgeNode {
  id: string;           // 主键
  user_id: string;      // 用户ID隔离
  name: string;
  parent_id: string | null;
  pos_x: number;
  pos_y: number;
  ps_score: number;      // PS 掌握度 [0, 200]
  last_practiced_at: string | null;
  color_tag: string;    // 颜色标签
  updated_at: string;
}

// practice_records - 练习记录表
interface PracticeRecord {
  id: string;
  user_id: string;
  question_id: string;
  is_correct: boolean;
  answer_time: number;  // 答题耗时（毫秒）
  source_node_ids: string[];  // 关联知识点ID数组（用于飞行动效）
  updated_at: string;
}

// ps_history - PS 历史表
interface PSHistory {
  id: string;
  node_id: string;
  ps_score: number;
  recorded_at: string;
  user_id: string;
}

// snapshots - 操作前快照表
interface Snapshot {
  id: string;
  created_at: string;
  data: string;  // JSON 序列化的三表数据
}

// backup_config - 备份配置表
interface BackupConfig {
  id: string;
  server_url: string | null;
  last_sync_at: string | null;
  auto_sync_enabled: boolean;
}
```

### 5.2 索引设计
```javascript
db.version(1).stores({
  knowledge_nodes: 'id, user_id, parent_id, ps_score, updated_at',
  practice_records: 'id, user_id, question_id, updated_at',
  ps_history: 'id, node_id, user_id, recorded_at',
  snapshots: 'id, created_at',
  backup_config: 'id'
});
```

---

## 6. 非功能性要求

### 6.1 性能指标
| 指标 | 目标值 |
|------|--------|
| 首屏导图渲染（500节点） | < 1.5 秒 |
| 答题后 PS 更新到导图刷新 | < 200 毫秒 |
| 脉动及飞行动效帧率 | ≥ 50fps |
| ZIP 文件生成（5000条记录） | < 3 秒 |

### 6.2 响应式要求
- 桌面端（≥ 1024px）：完整功能
- 平板端（768-1023px）：核心功能，简化布局
- 移动端（375px）：导图可手势平移缩放，焦点模式可用

### 6.3 离线保障
- 顶部状态栏显示"在线/离线"徽标
- 断开时显示"离线可用"
- 恢复后显示"同步完成"

---

## 7. 技术栈

### 7.1 前端
- **框架**：React 18 + Vite + TypeScript
- **样式**：Tailwind CSS v4
- **知识导图**：AntV G6
- **图表**：ECharts
- **动效**：Framer Motion
- **本地数据库**：Dexie.js（IndexedDB 封装）
- **状态管理**：React Context + Zustand

### 7.2 后端（可选）
- 轻量 Node.js 服务
- 仅提供数据备份接口（`/api/backup/sync`、`/api/backup/restore`）
- 不执行复杂计算

---

## 8. 明确不实现的功能

- ❌ 多用户权限、登录注册
- ❌ UGC 题目分享、评论、审核
- ❌ 消息队列、定时任务调度、运营后台
- ❌ 申论 AI 批改、面试模拟
- ❌ 勋章系统、排行榜、社交功能
- ❌ PDF 导出（仅支持 JSON/CSV 导出）

---

## 9. 版本规划

### v1.0 MVP
- [ ] Dexie.js 数据库层
- [ ] 基础知识导图（AntV G6）
- [ ] PS 算法与热力图
- [ ] 四种练习模式
- [ ] 乐观更新机制
- [ ] 数据导出功能

### v1.1 增强
- [ ] 焦点模式
- [ ] 错题飞入动效
- [ ] 服务端备份
- [ ] 数据恢复

### v1.2 完整版
- [ ] 能力雷达图
- [ ] PS 趋势曲线
- [ ] 套卷复盘报告
- [ ] 知识扫雷全景图
- [ ] 移动端优化

---

*文档版本：v1.0*
*最后更新：2026-05-11*
