import type { KnowledgeNodeRecord, QuestionBankItem } from '@/types';

export interface QuestionBindingLike {
  linkedAngleId?: string;
  linkedAngleName?: string;
  knowledgePath?: string;
}

export type QuestionBindingStatus = 'ok' | 'missing' | 'unresolved' | 'ambiguous-name';

export interface QuestionBindingInspection {
  status: QuestionBindingStatus;
  node?: KnowledgeNodeRecord;
  reason: string;
  normalizedId: string;
  normalizedPath?: string;
}

export interface KnowledgeBindingIndex {
  byId: Map<string, KnowledgeNodeRecord>;
  byName: Map<string, KnowledgeNodeRecord>;
  duplicateNames: Set<string>;
  byPath: Map<string, KnowledgeNodeRecord>;
  pathById: Map<string, string>;
}

export interface KnowledgeAliasEntry {
  alias: string;
  target: string;
}

export interface KnowledgePathCandidate {
  path: string;
  score: number;
  matchedAliases: string[];
}

export interface KnowledgeBindingAuditIssue {
  question: QuestionBankItem;
  inspection: QuestionBindingInspection;
}

export interface KnowledgeBindingAuditReport {
  generatedAt: string;
  totalQuestions: number;
  issues: KnowledgeBindingAuditIssue[];
  counts: Record<QuestionBindingStatus, number>;
}

export const DEFAULT_KNOWLEDGE_ALIAS_ENTRIES: KnowledgeAliasEntry[] = [
  { alias: '削弱加强', target: '削弱论证' },
  { alias: '加强削弱', target: '削弱论证' },
  { alias: '论证削弱', target: '削弱论证' },
  { alias: '论证加强', target: '加强论证' },
  { alias: '主旨题', target: '主旨概括题' },
  { alias: '中心理解', target: '主旨概括题' },
  { alias: '意图题', target: '意图判断题' },
  { alias: '实词', target: '实词辨析' },
  { alias: '成语', target: '成语辨析' },
  { alias: '行程', target: '行程问题' },
  { alias: '工程', target: '工程问题' },
  { alias: '同比增长', target: '同比/环比增长' },
  { alias: '环比增长', target: '同比/环比增长' },
];

export function normalizeKnowledgeNodeId(id?: string | null) {
  if (!id) return '';
  return id.startsWith('mn_') ? id.slice(3) : id;
}

export function splitKnowledgePath(path?: string | null) {
  return (path || '')
    .split(/[》>\/]/)
    .map(part => part.trim())
    .filter(Boolean);
}

export function normalizeKnowledgeText(text?: string | null) {
  return Array.from((text || '').toLowerCase())
    .filter(char => /[a-z0-9]/.test(char) || char.charCodeAt(0) > 127)
    .join('');
}

export function textSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 2) return 0;

  const leftSet = new Set<string>();
  const rightSet = new Set<string>();
  const windowSize = Math.min(2, left.length, right.length);

  for (let i = 0; i <= left.length - windowSize; i += 1) leftSet.add(left.slice(i, i + windowSize));
  for (let i = 0; i <= right.length - windowSize; i += 1) rightSet.add(right.slice(i, i + windowSize));

  let overlap = 0;
  leftSet.forEach(part => {
    if (rightSet.has(part)) overlap += 1;
  });

  const union = leftSet.size + rightSet.size - overlap;
  return union > 0 ? overlap / union : 0;
}

function buildAliasMap(aliasEntries: KnowledgeAliasEntry[]) {
  const map = new Map<string, string>();
  aliasEntries.forEach(entry => {
    const alias = normalizeKnowledgeText(entry.alias);
    const target = normalizeKnowledgeText(entry.target);
    if (alias && target) map.set(alias, target);
  });
  return map;
}

export function buildKnowledgeBindingIndex(nodes: KnowledgeNodeRecord[]): KnowledgeBindingIndex {
  const byId = new Map<string, KnowledgeNodeRecord>();
  const byName = new Map<string, KnowledgeNodeRecord>();
  const duplicateNames = new Set<string>();
  const byPath = new Map<string, KnowledgeNodeRecord>();
  const pathById = new Map<string, string>();

  nodes.forEach(node => {
    const normalizedId = normalizeKnowledgeNodeId(node.id);
    byId.set(node.id, node);
    byId.set(normalizedId, node);
    byId.set(`mn_${normalizedId}`, node);

    if (byName.has(node.name)) duplicateNames.add(node.name);
    if (!byName.has(node.name)) byName.set(node.name, node);
  });

  const getPathParts = (nodeId: string) => {
    const parts: string[] = [];
    let current = byId.get(nodeId) || byId.get(normalizeKnowledgeNodeId(nodeId));
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      parts.unshift(current.name);
      current = current.parent_id
        ? byId.get(current.parent_id) || byId.get(normalizeKnowledgeNodeId(current.parent_id))
        : undefined;
    }

    return parts;
  };

  nodes.forEach(node => {
    const normalizedId = normalizeKnowledgeNodeId(node.id);
    const path = getPathParts(node.id).join('》');
    pathById.set(node.id, path);
    pathById.set(normalizedId, path);
    pathById.set(`mn_${normalizedId}`, path);
    if (path) byPath.set(path, node);
  });

  return { byId, byName, duplicateNames, byPath, pathById };
}

export function inspectQuestionBinding(
  question: QuestionBindingLike,
  index: KnowledgeBindingIndex
): QuestionBindingInspection {
  const normalizedId = normalizeKnowledgeNodeId(question.linkedAngleId);
  const hasAnyBinding = !!(normalizedId || question.linkedAngleName || question.knowledgePath);

  if (!hasAnyBinding) {
    return {
      status: 'missing',
      reason: '未填写知识点 ID、名称或路径',
      normalizedId: '',
    };
  }

  if (normalizedId) {
    const node = index.byId.get(normalizedId) || index.byId.get(`mn_${normalizedId}`);
    if (node) {
      return {
        status: 'ok',
        node,
        reason: '通过知识点 ID 命中',
        normalizedId: normalizeKnowledgeNodeId(node.id),
        normalizedPath: index.pathById.get(node.id),
      };
    }
  }

  const path = question.knowledgePath?.trim();
  if (path) {
    const exactNode = index.byPath.get(path);
    if (exactNode) {
      return {
        status: 'ok',
        node: exactNode,
        reason: '通过完整知识路径命中',
        normalizedId: normalizeKnowledgeNodeId(exactNode.id),
        normalizedPath: index.pathById.get(exactNode.id),
      };
    }

    const lastName = splitKnowledgePath(path).at(-1);
    if (lastName && index.byName.has(lastName)) {
      const node = index.byName.get(lastName);
      return {
        status: index.duplicateNames.has(lastName) ? 'ambiguous-name' : 'ok',
        node,
        reason: index.duplicateNames.has(lastName)
          ? `路径末级名称“${lastName}”重复，已暂按首个同名节点匹配`
          : '通过路径末级名称命中',
        normalizedId: node ? normalizeKnowledgeNodeId(node.id) : normalizedId,
        normalizedPath: node ? index.pathById.get(node.id) : undefined,
      };
    }
  }

  const linkedName = question.linkedAngleName?.trim();
  if (linkedName && index.byName.has(linkedName)) {
    const node = index.byName.get(linkedName);
    return {
      status: index.duplicateNames.has(linkedName) ? 'ambiguous-name' : 'ok',
      node,
      reason: index.duplicateNames.has(linkedName)
        ? `知识点名称“${linkedName}”重复，已暂按首个同名节点匹配`
        : '通过知识点名称命中',
      normalizedId: node ? normalizeKnowledgeNodeId(node.id) : normalizedId,
      normalizedPath: node ? index.pathById.get(node.id) : undefined,
    };
  }

  return {
    status: 'unresolved',
    reason: '绑定信息无法匹配当前导图节点',
    normalizedId,
  };
}

export function normalizeQuestionBinding<T extends QuestionBindingLike>(
  question: T,
  index: KnowledgeBindingIndex
): T {
  const inspection = inspectQuestionBinding(question, index);
  if (!inspection.node) {
    return {
      ...question,
      linkedAngleId: inspection.normalizedId,
    };
  }

  return {
    ...question,
    linkedAngleId: normalizeKnowledgeNodeId(inspection.node.id),
    linkedAngleName: inspection.node.name,
    knowledgePath: inspection.normalizedPath || question.knowledgePath || inspection.node.name,
  };
}

export function recommendKnowledgePathCandidates(
  question: Pick<QuestionBankItem, 'content' | 'options' | 'explanation'>,
  knowledgePaths: string[],
  options: {
    aliases?: KnowledgeAliasEntry[];
    limit?: number;
    minScore?: number;
  } = {}
): KnowledgePathCandidate[] {
  const aliases = options.aliases ?? DEFAULT_KNOWLEDGE_ALIAS_ENTRIES;
  const aliasMap = buildAliasMap(aliases);
  const limit = Math.max(1, Math.min(options.limit ?? 3, 3));
  const minScore = options.minScore ?? 0.25;
  const questionText = normalizeKnowledgeText([
    question.content,
    ...(question.options || []).map(option => option.text),
    question.explanation || '',
  ].join(''));

  if (!questionText) return [];

  return knowledgePaths
    .map(path => {
      const parts = splitKnowledgePath(path);
      const pathText = normalizeKnowledgeText(parts.join(''));
      const matchedAliases: string[] = [];
      let score = textSimilarity(questionText, pathText);

      parts.forEach((part, index) => {
        const normalizedPart = normalizeKnowledgeText(part);
        if (!normalizedPart) return;
        if (questionText.includes(normalizedPart)) {
          score += index === parts.length - 1 ? 0.45 : 0.2;
        }
      });

      aliasMap.forEach((target, alias) => {
        if (!questionText.includes(alias)) return;
        const targetMatched = parts.some(part => normalizeKnowledgeText(part).includes(target));
        if (!targetMatched && !pathText.includes(target)) return;
        matchedAliases.push(aliases.find(entry => normalizeKnowledgeText(entry.alias) === alias)?.alias || alias);
        score += 0.5;
      });

      return { path, score, matchedAliases };
    })
    .filter(candidate => candidate.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function findQuestionBindingIssues(
  questions: QuestionBankItem[],
  nodes: KnowledgeNodeRecord[]
) {
  const index = buildKnowledgeBindingIndex(nodes);
  return questions
    .map(question => ({ question, inspection: inspectQuestionBinding(question, index) }))
    .filter(item => item.inspection.status !== 'ok');
}

export function runKnowledgeBindingAudit(
  questions: QuestionBankItem[],
  nodes: KnowledgeNodeRecord[],
  generatedAt = new Date().toISOString()
): KnowledgeBindingAuditReport {
  const index = buildKnowledgeBindingIndex(nodes);
  const counts: Record<QuestionBindingStatus, number> = {
    ok: 0,
    missing: 0,
    unresolved: 0,
    'ambiguous-name': 0,
  };
  const issues: KnowledgeBindingAuditIssue[] = [];

  questions.forEach(question => {
    const inspection = inspectQuestionBinding(question, index);
    counts[inspection.status] += 1;
    if (inspection.status !== 'ok') issues.push({ question, inspection });
  });

  return {
    generatedAt,
    totalQuestions: questions.length,
    issues,
    counts,
  };
}
