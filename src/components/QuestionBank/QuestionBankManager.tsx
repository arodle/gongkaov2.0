'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/stores/appStore';
import type { QuestionBankItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { saveRecentDeletion } from '@/lib/recent-deletions';
import { createExamPaperId } from '@/lib/exam-papers';
import {
  filterInlineImageUrls,
  formatBytes,
  INLINE_IMAGE_MAX_BYTES,
  isAllowedInlineImageFile,
  QUESTION_IMAGES_MAX_COUNT,
} from '@/lib/image-storage';
import {
  buildKnowledgeBindingIndex,
  DEFAULT_KNOWLEDGE_ALIAS_ENTRIES,
  inspectQuestionBinding,
  normalizeKnowledgeNodeId,
  normalizeQuestionBinding,
  recommendKnowledgePathCandidates,
  runKnowledgeBindingAudit,
  type KnowledgeBindingAuditReport,
  type KnowledgeAliasEntry,
} from '@/lib/question-binding';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  Upload,
  Download,
  Search,
  Edit3,
  Trash2,
  FileText,
  BookOpen,
  X,
  Check,
  Layers,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedPaperData, PaperParserProvider } from '@/lib/paper-parser';
import {
  generatedExplanationToText,
  type GeneratedQuestionExplanation,
} from '@/lib/question-explanation';

interface QuestionFormData {
  content: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  images: string[];
  linkedAngleId: string;
  linkedAngleName: string;
  knowledgePath: string;
  type: 'real' | 'simulated';
  reference: string;
  examPaper: string;
}

const initialFormData: QuestionFormData = {
  content: '',
  options: [
    { label: 'A', text: '' },
    { label: 'B', text: '' },
    { label: 'C', text: '' },
    { label: 'D', text: '' },
  ],
  correctAnswer: '',
  explanation: '',
  images: [],
  linkedAngleId: '',
  linkedAngleName: '',
  knowledgePath: '',
  type: 'real',
  reference: '',
  examPaper: '',
};

interface ExamPaperFormData {
  name: string;
  description: string;
  type: 'real' | 'simulated';
  questions: string[];
}

interface UploadedPaperQuestion {
  id?: string;
  content: string;
  options?: { label: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
  images?: string[];
  linkedAngleId?: string;
  linkedAngleName?: string;
  knowledgePath?: string;
  questionType?: string;
  reference?: string;
  confidence?: number;
  reviewStatus?: Array<'missing_options' | 'missing_answer' | 'missing_explanation' | 'missing_binding' | 'low_confidence'>;
  generatedExplanation?: GeneratedQuestionExplanation;
}

interface UploadedPaperData {
  name?: string;
  description?: string;
  type?: 'real' | 'simulated';
  questions?: UploadedPaperQuestion[];
  parser?: ParsedPaperData['parser'];
  quality?: ParsedPaperData['quality'];
}

type PaperDraftFilter = 'all' | 'ready' | 'missing-answer' | 'missing-explanation' | 'missing-binding' | 'low-confidence' | 'duplicate';

const BINDING_AUDIT_REPORT_STORAGE_KEY = 'gongkao:knowledgeBindingAuditReport';
const BINDING_AUDIT_LAST_AT_STORAGE_KEY = 'gongkao:lastKnowledgeBindingAuditAt';
const BINDING_AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const KNOWLEDGE_ALIAS_STORAGE_KEY = 'gongkao:knowledgeAliasEntries';
const QUESTION_TYPE_PRESETS = ['言语理解', '判断推理', '数量关系', '资料分析', '常识判断'];

interface QuestionLinkLike {
  linkedAngleId?: string;
  linkedAngleName?: string;
  knowledgePath?: string;
}

function normalizeNodeId(id?: string | null) {
  return normalizeKnowledgeNodeId(id);
}

function loadStoredBindingAuditReport(): KnowledgeBindingAuditReport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BINDING_AUDIT_REPORT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredBindingAuditReport(report: KnowledgeBindingAuditReport) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BINDING_AUDIT_REPORT_STORAGE_KEY, JSON.stringify(report));
  window.localStorage.setItem(BINDING_AUDIT_LAST_AT_STORAGE_KEY, report.generatedAt);
}

function loadCustomKnowledgeAliasEntries(): KnowledgeAliasEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_ALIAS_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(entry => entry?.alias && entry?.target);
  } catch {
    return [];
  }
}

function saveCustomKnowledgeAliasEntries(entries: KnowledgeAliasEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KNOWLEDGE_ALIAS_STORAGE_KEY, JSON.stringify(entries));
}

function normalizeExamPaperName(name?: string | null) {
  const compact = (name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（）]/g, match => match === '（' ? '(' : ')');

  if (!compact) return '';

  return compact
    .replace(/^(\d{4})国考/, '$1年国考')
    .replace(/^(\d{4})公务员考试/, '$1年国考')
    .replace(/副省$/, '副省级');
}

function isUploadedQuestionReady(question: UploadedPaperQuestion) {
  return (
    (question.options?.length || 0) >= 4
    && !!question.correctAnswer?.trim()
    && !!question.explanation?.trim()
    && (!!question.linkedAngleId || !!question.knowledgePath)
    && (typeof question.confidence !== 'number' || question.confidence >= 0.7)
  );
}

function normalizeQuestionTextForSimilarity(text: string) {
  return Array.from(text.toLowerCase())
    .filter(char => /[a-z0-9]/.test(char) || char.charCodeAt(0) > 127)
    .join('')
    .slice(0, 500);
}

function textSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 18) return 0;
  const leftSet = new Set<string>();
  const rightSet = new Set<string>();
  for (let i = 0; i < left.length - 1; i += 1) leftSet.add(left.slice(i, i + 2));
  for (let i = 0; i < right.length - 1; i += 1) rightSet.add(right.slice(i, i + 2));
  let overlap = 0;
  leftSet.forEach(part => {
    if (rightSet.has(part)) overlap += 1;
  });
  const union = leftSet.size + rightSet.size - overlap;
  if (union === 0) {
    return 0;
  }
  return overlap / union;
}

export function QuestionBankManager() {
  const { questionBank, nodes, answerRecords, practiceRecords, examPapers, addQuestion, updateQuestion, deleteQuestion, addExamPaper } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'real' | 'simulated' | 'binding-error' | 'similar'>('all');
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [showPaperDialog, setShowPaperDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  const [formData, setFormData] = useState<QuestionFormData>(initialFormData);
  const [paperFormData, setPaperFormData] = useState<ExamPaperFormData>({
    name: '',
    description: '',
    type: 'real',
    questions: [],
  });
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [batchExamPaper, setBatchExamPaper] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [paperCreationMode, setPaperCreationMode] = useState<'select' | 'upload'>('select');
  const [uploadedPaper, setUploadedPaper] = useState<UploadedPaperData | null>(null);
  const [paperRawText, setPaperRawText] = useState('');
  const [paperParserProvider, setPaperParserProvider] = useState<PaperParserProvider>('rule');
  const [paperParserModel, setPaperParserModel] = useState('deepseek-chat');
  const [paperParserBaseUrl, setPaperParserBaseUrl] = useState('');
  const [paperParserApiKey, setPaperParserApiKey] = useState('');
  const [explanationProvider, setExplanationProvider] = useState<Exclude<PaperParserProvider, 'rule'>>('deepseek');
  const [explanationModel, setExplanationModel] = useState('deepseek-chat');
  const [explanationBaseUrl, setExplanationBaseUrl] = useState('');
  const [explanationApiKey, setExplanationApiKey] = useState('');
  const [isParsingPaper, setIsParsingPaper] = useState(false);
  const [paperParseError, setPaperParseError] = useState('');
  const [paperDraftFilter, setPaperDraftFilter] = useState<PaperDraftFilter>('all');
  const [batchDraftKnowledgePath, setBatchDraftKnowledgePath] = useState('');
  const [batchDraftQuestionType, setBatchDraftQuestionType] = useState('');
  const [importReadyOnly, setImportReadyOnly] = useState(false);
  const [skipDuplicateDrafts, setSkipDuplicateDrafts] = useState(true);
  const [generatingExplanationIndex, setGeneratingExplanationIndex] = useState<number | null>(null);
  const [bindingAuditReport, setBindingAuditReport] = useState<KnowledgeBindingAuditReport | null>(() => loadStoredBindingAuditReport());
  const [customKnowledgeAliases, setCustomKnowledgeAliases] = useState<KnowledgeAliasEntry[]>(() => loadCustomKnowledgeAliasEntries());
  const [newKnowledgeAlias, setNewKnowledgeAlias] = useState('');
  const [newKnowledgeAliasTarget, setNewKnowledgeAliasTarget] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const paperInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const nodeLookup = useMemo(() => {
    const byId = new Map<string, typeof nodes[number]>();
    const pathById = new Map<string, string>();
    const byName = new Map<string, typeof nodes[number]>();
    const byPath = new Map<string, typeof nodes[number]>();

    nodes.forEach(node => {
      byId.set(node.id, node);
      byId.set(normalizeNodeId(node.id), node);
      byId.set(`mn_${normalizeNodeId(node.id)}`, node);
      if (!byName.has(node.name)) byName.set(node.name, node);
    });

    const getNodePath = (nodeId: string): string[] => {
      const parts: string[] = [];
      let current = byId.get(nodeId) || byId.get(normalizeNodeId(nodeId));
      const visited = new Set<string>();

      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        parts.unshift(current.name);
        current = current.parent_id
          ? byId.get(current.parent_id) || byId.get(normalizeNodeId(current.parent_id))
          : undefined;
      }

      return parts;
    };

    nodes.forEach(node => {
      const path = getNodePath(node.id).join('》');
      pathById.set(node.id, path);
      pathById.set(normalizeNodeId(node.id), path);
      if (path) byPath.set(path, node);
    });

    return { byId, byName, byPath, pathById, getNodePath };
  }, [nodes]);

  const knowledgePathsForParser = useMemo(() => (
    Array.from(new Set(Array.from(nodeLookup.pathById.values()).filter(Boolean))).sort()
  ), [nodeLookup]);

  const knowledgeAliasEntries = useMemo(() => (
    [...DEFAULT_KNOWLEDGE_ALIAS_ENTRIES, ...customKnowledgeAliases]
      .filter(entry => entry.alias.trim() && entry.target.trim())
  ), [customKnowledgeAliases]);

  const bindingIndex = useMemo(() => buildKnowledgeBindingIndex(nodes), [nodes]);
  const inspectBinding = useCallback((question: QuestionLinkLike) => {
    return inspectQuestionBinding(question, bindingIndex);
  }, [bindingIndex]);

  const resolveLinkedNode = useCallback((question: QuestionLinkLike) => {
    return inspectBinding(question).node;

    const normalizedId = normalizeNodeId(question.linkedAngleId);
    if (normalizedId) {
      const node = nodeLookup.byId.get(normalizedId) || nodeLookup.byId.get(`mn_${normalizedId}`);
      if (node) return node;
    }

    const path = question.knowledgePath?.trim() || '';
    if (path) {
      const node = nodeLookup.byPath.get(path);
      if (node) return node;

      const lastName = path.split(/[》>\/]/).map(part => part.trim()).filter(Boolean).at(-1);
      if (lastName) {
        const byName = nodeLookup.byName.get(lastName || '');
        if (byName) return byName;
      }
    }

    const linkedName = question.linkedAngleName?.trim() || '';
    return linkedName ? nodeLookup.byName.get(linkedName) : undefined;
  }, [inspectBinding, nodeLookup]);

  const normalizeQuestionLink = useCallback(<T extends QuestionLinkLike>(question: T): T => {
    return normalizeQuestionBinding(question, bindingIndex);

    const linkedNode = resolveLinkedNode(question);
    if (!linkedNode) {
      return {
        ...question,
        linkedAngleId: normalizeNodeId(question.linkedAngleId),
      };
    }

    return {
      ...question,
      linkedAngleId: normalizeNodeId(linkedNode!.id),
      linkedAngleName: linkedNode!.name,
      knowledgePath: nodeLookup.pathById.get(linkedNode!.id) || question.knowledgePath || linkedNode!.name,
    };
  }, [bindingIndex, nodeLookup.pathById, resolveLinkedNode]);

  const hasBindingIssue = useCallback((question: QuestionBankItem) => {
    return inspectBinding(question).status !== 'ok';
  }, [inspectBinding]);

  const runBindingAudit = useCallback(() => {
    const report = runKnowledgeBindingAudit(questionBank, nodes);
    setBindingAuditReport(report);
    saveStoredBindingAuditReport(report);
    return report;
  }, [nodes, questionBank]);

  useEffect(() => {
    if (typeof window === 'undefined' || questionBank.length === 0 || nodes.length === 0) return;
    const lastAuditAt = window.localStorage.getItem(BINDING_AUDIT_LAST_AT_STORAGE_KEY);
    const lastAuditTime = lastAuditAt ? Date.parse(lastAuditAt) : 0;
    if (!lastAuditTime || Date.now() - lastAuditTime > BINDING_AUDIT_INTERVAL_MS) {
      runBindingAudit();
    }
  }, [nodes.length, questionBank.length, runBindingAudit]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    let rejected = 0;

    files.forEach((file) => {
      if (formData.images.length >= QUESTION_IMAGES_MAX_COUNT || !isAllowedInlineImageFile(file)) {
        rejected += 1;
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setFormData(prev => ({
          ...prev,
          images: filterInlineImageUrls([...prev.images, result]).images
        }));
      };
      reader.readAsDataURL(file);
    });
    if (rejected > 0) {
      alert(`已跳过 ${rejected} 张图片。单张图片需小于 ${formatBytes(INLINE_IMAGE_MAX_BYTES)}，每题最多 ${QUESTION_IMAGES_MAX_COUNT} 张。`);
    }
    e.target.value = '';
  }, [formData.images.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  }, []);

  const similarQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    const normalized = questionBank.map(question => ({
      id: question.id,
      text: normalizeQuestionTextForSimilarity(question.content),
    }));

    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        const similarity = textSimilarity(normalized[i].text, normalized[j].text);
        if (similarity >= 0.92) {
          ids.add(normalized[i].id);
          ids.add(normalized[j].id);
        }
      }
    }

    return ids;
  }, [questionBank]);

  const filteredQuestions = useMemo(() => {
    let result = questionBank;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        q => q.content.toLowerCase().includes(query) ||
          q.explanation.toLowerCase().includes(query)
      );
    }

    if (filterType === 'binding-error') {
      result = result.filter(hasBindingIssue);
    } else if (filterType === 'similar') {
      result = result.filter(question => similarQuestionIds.has(question.id));
    } else if (filterType !== 'all') {
      result = result.filter(q => q.type === filterType);
    }

    return result;
  }, [questionBank, searchQuery, filterType, hasBindingIssue, similarQuestionIds]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const pageQuestions = useMemo(() => {
    return filteredQuestions.slice(pageStartIndex, pageStartIndex + pageSize);
  }, [filteredQuestions, pageSize, pageStartIndex]);
  const pageQuestionIds = useMemo(() => pageQuestions.map(question => question.id), [pageQuestions]);
  const filteredQuestionIds = useMemo(() => filteredQuestions.map(question => question.id), [filteredQuestions]);
  const pageSelectedCount = pageQuestionIds.filter(id => selectedQuestions.has(id)).length;
  const filteredSelectedCount = filteredQuestionIds.filter(id => selectedQuestions.has(id)).length;
  const allPageSelected = pageQuestionIds.length > 0 && pageSelectedCount === pageQuestionIds.length;
  const allFilteredSelected = filteredQuestionIds.length > 0 && filteredSelectedCount === filteredQuestionIds.length;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const examPaperOptions = useMemo(() => {
    return Array.from(new Set([
      ...examPapers.map(paper => paper.name),
      ...questionBank.map(q => q.examPaper),
    ].map(name => normalizeExamPaperName(name)).filter(Boolean) as string[])).sort();
  }, [examPapers, questionBank]);

  const parsePaperText = useCallback(async (rawText: string, sourceName?: string) => {
    if (!rawText.trim()) {
      setPaperParseError('请先上传文本文件或粘贴试卷文本');
      return;
    }

    setIsParsingPaper(true);
    setPaperParseError('');
    try {
      const response = await fetch('/api/paper-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          paperName: paperFormData.name || sourceName?.replace(/\.[^.]+$/, '') || '待审核套卷',
          paperType: paperFormData.type,
          provider: paperParserProvider,
          model: paperParserModel,
          baseUrl: paperParserBaseUrl,
          apiKey: paperParserApiKey,
          knowledgePaths: knowledgePathsForParser,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '解析失败');

      const data = result.data as ParsedPaperData;
      setUploadedPaper(data);
      setPaperFormData(prev => ({
        ...prev,
        name: normalizeExamPaperName(data.name),
        type: data.type || prev.type,
        description: data.description || prev.description,
      }));
    } catch (error) {
      setPaperParseError(error instanceof Error ? error.message : '解析失败');
    } finally {
      setIsParsingPaper(false);
    }
  }, [
    knowledgePathsForParser,
    paperFormData.name,
    paperFormData.type,
    paperParserApiKey,
    paperParserBaseUrl,
    paperParserModel,
    paperParserProvider,
  ]);

  const uploadedPaperQuality = useMemo(() => {
    const questions = uploadedPaper?.questions || [];
    const missingAnswer = questions.filter(question => !question.correctAnswer?.trim()).length;
    const missingExplanation = questions.filter(question => !question.explanation?.trim()).length;
    const missingBinding = questions.filter(question => !question.linkedAngleId && !question.knowledgePath).length;
    const lowConfidence = questions.filter(question => typeof question.confidence === 'number' && question.confidence < 0.7).length;
    const ready = questions.filter(isUploadedQuestionReady).length;

    return {
      total: questions.length,
      ready,
      missingAnswer,
      missingExplanation,
      missingBinding,
      lowConfidence,
    };
  }, [uploadedPaper]);

  const duplicateDraftIndexes = useMemo(() => {
    const duplicateIndexes = new Set<number>();
    const existingQuestions = questionBank.map(question => ({
      id: question.id,
      text: normalizeQuestionTextForSimilarity(question.content),
    }));
    const draftQuestions = (uploadedPaper?.questions || []).map((question, index) => ({
      index,
      text: normalizeQuestionTextForSimilarity(question.content),
    }));

    draftQuestions.forEach(draft => {
      if (!draft.text) return;
      const duplicatesExisting = existingQuestions.some(existing => (
        textSimilarity(draft.text, existing.text) >= 0.92
      ));
      if (duplicatesExisting) duplicateIndexes.add(draft.index);
    });

    for (let i = 0; i < draftQuestions.length; i += 1) {
      for (let j = i + 1; j < draftQuestions.length; j += 1) {
        if (textSimilarity(draftQuestions[i].text, draftQuestions[j].text) >= 0.92) {
          duplicateIndexes.add(draftQuestions[i].index);
          duplicateIndexes.add(draftQuestions[j].index);
        }
      }
    }

    return duplicateIndexes;
  }, [questionBank, uploadedPaper]);

  const isLowQualityDraftQuestion = useCallback((question: UploadedPaperQuestion, index: number) => (
    !question.content?.trim()
    || (question.options?.length || 0) < 4
    || !question.correctAnswer?.trim()
    || (typeof question.confidence === 'number' && question.confidence < 0.7)
    || duplicateDraftIndexes.has(index)
  ), [duplicateDraftIndexes]);

  const filteredUploadedQuestions = useMemo(() => {
    const questions = uploadedPaper?.questions || [];
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question, index }) => {
        if (paperDraftFilter === 'ready') return isUploadedQuestionReady(question);
        if (paperDraftFilter === 'missing-answer') return !question.correctAnswer?.trim();
        if (paperDraftFilter === 'missing-explanation') return !question.explanation?.trim();
        if (paperDraftFilter === 'missing-binding') return !question.linkedAngleId && !question.knowledgePath;
        if (paperDraftFilter === 'low-confidence') return typeof question.confidence === 'number' && question.confidence < 0.7;
        if (paperDraftFilter === 'duplicate') return duplicateDraftIndexes.has(index);
        return true;
      });
  }, [duplicateDraftIndexes, paperDraftFilter, uploadedPaper]);

  const filteredLowQualityDraftCount = useMemo(() => (
    filteredUploadedQuestions.filter(({ question, index }) => isLowQualityDraftQuestion(question, index)).length
  ), [filteredUploadedQuestions, isLowQualityDraftQuestion]);

  const draftKnowledgeRecommendations = useMemo(() => {
    const recommendations = new Map<number, ReturnType<typeof recommendKnowledgePathCandidates>>();
    (uploadedPaper?.questions || []).forEach((question, index) => {
      const candidates = recommendKnowledgePathCandidates(
        {
          content: question.content,
          options: question.options || [],
          explanation: question.explanation || '',
        },
        knowledgePathsForParser,
        { limit: 3, aliases: knowledgeAliasEntries }
      );
      if (candidates.length > 0) recommendations.set(index, candidates);
    });
    return recommendations;
  }, [knowledgeAliasEntries, knowledgePathsForParser, uploadedPaper]);

  const handleAddKnowledgeAlias = useCallback(() => {
    const alias = newKnowledgeAlias.trim();
    const target = newKnowledgeAliasTarget.trim();
    if (!alias || !target) return;
    const next = [
      ...customKnowledgeAliases.filter(entry => entry.alias !== alias),
      { alias, target },
    ];
    setCustomKnowledgeAliases(next);
    saveCustomKnowledgeAliasEntries(next);
    setNewKnowledgeAlias('');
    setNewKnowledgeAliasTarget('');
  }, [customKnowledgeAliases, newKnowledgeAlias, newKnowledgeAliasTarget]);

  const handleDeleteKnowledgeAlias = useCallback((alias: string) => {
    const next = customKnowledgeAliases.filter(entry => entry.alias !== alias);
    setCustomKnowledgeAliases(next);
    saveCustomKnowledgeAliasEntries(next);
  }, [customKnowledgeAliases]);

  const updateUploadedQuestion = useCallback((index: number, patch: Partial<UploadedPaperQuestion>) => {
    setUploadedPaper(prev => {
      if (!prev?.questions) return prev;
      return {
        ...prev,
        questions: prev.questions.map((question, questionIndex) => (
          questionIndex === index ? { ...question, ...patch } : question
        )),
      };
    });
  }, []);

  const removeUploadedQuestion = useCallback((index: number) => {
    setUploadedPaper(prev => {
      if (!prev?.questions) return prev;
      return {
        ...prev,
        questions: prev.questions.filter((_, questionIndex) => questionIndex !== index),
      };
    });
  }, []);

  const handleBatchApplyDraftKnowledgePath = useCallback(() => {
    const knowledgePath = batchDraftKnowledgePath.trim();
    if (!knowledgePath || filteredUploadedQuestions.length === 0) return;

    const targetIndexes = new Set(filteredUploadedQuestions.map(item => item.index));
    setUploadedPaper(prev => {
      if (!prev?.questions) return prev;
      return {
        ...prev,
        questions: prev.questions.map((question, index) => (
          targetIndexes.has(index) ? { ...question, knowledgePath } : question
        )),
      };
    });
  }, [batchDraftKnowledgePath, filteredUploadedQuestions]);

  const handleBatchApplyDraftQuestionType = useCallback(() => {
    const questionType = batchDraftQuestionType.trim();
    if (!questionType || filteredUploadedQuestions.length === 0) return;

    const targetIndexes = new Set(filteredUploadedQuestions.map(item => item.index));
    setUploadedPaper(prev => {
      if (!prev?.questions) return prev;
      return {
        ...prev,
        questions: prev.questions.map((question, index) => (
          targetIndexes.has(index) ? { ...question, questionType } : question
        )),
      };
    });
  }, [batchDraftQuestionType, filteredUploadedQuestions]);

  const handleDeleteLowQualityDrafts = useCallback(() => {
    const targetIndexes = new Set(
      filteredUploadedQuestions
        .filter(({ question, index }) => isLowQualityDraftQuestion(question, index))
        .map(item => item.index)
    );

    if (targetIndexes.size === 0) return;
    if (!window.confirm(`将删除当前筛选下 ${targetIndexes.size} 道低质量草稿题，删除后不可恢复。确认继续？`)) return;

    setUploadedPaper(prev => {
      if (!prev?.questions) return prev;
      return {
        ...prev,
        questions: prev.questions.filter((_, index) => !targetIndexes.has(index)),
      };
    });
  }, [filteredUploadedQuestions, isLowQualityDraftQuestion]);

  const handleAutoBindDraftKnowledgePath = useCallback(() => {
    const targetIndexes = new Set(filteredUploadedQuestions.map(item => item.index));
    let applied = 0;
    setUploadedPaper(prev => {
      if (!prev?.questions) return prev;
      return {
        ...prev,
        questions: prev.questions.map((question, index) => {
          if (!targetIndexes.has(index) || question.knowledgePath || question.linkedAngleId) return question;
          const recommendation = draftKnowledgeRecommendations.get(index)?.[0];
          if (!recommendation) return question;
          applied += 1;
          return { ...question, knowledgePath: recommendation.path };
        }),
      };
    });
    if (applied === 0) {
      alert('当前筛选结果中没有可自动匹配的知识点。');
    }
  }, [draftKnowledgeRecommendations, filteredUploadedQuestions]);

  const handleGenerateDraftExplanation = useCallback(async (index: number) => {
    const question = uploadedPaper?.questions?.[index];
    if (!question) return;

    setGeneratingExplanationIndex(index);
    try {
      const response = await fetch('/api/question-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: explanationProvider,
          model: explanationModel,
          baseUrl: explanationBaseUrl,
          apiKey: explanationApiKey,
          content: question.content,
          options: question.options || [],
          correctAnswer: question.correctAnswer || '',
          knowledgePath: question.knowledgePath || '',
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '生成失败');

      const generated = result.data as GeneratedQuestionExplanation;
      updateUploadedQuestion(index, {
        generatedExplanation: generated,
        explanation: generatedExplanationToText(generated),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGeneratingExplanationIndex(null);
    }
  }, [
    explanationApiKey,
    explanationBaseUrl,
    explanationModel,
    explanationProvider,
    updateUploadedQuestion,
    uploadedPaper,
  ]);

  const realQuestions = useMemo(() => {
    return questionBank.filter(q => q.type === 'real');
  }, [questionBank]);

  const simulatedQuestions = useMemo(() => {
    return questionBank.filter(q => q.type === 'simulated');
  }, [questionBank]);

  const handleOpenQuestionDialog = useCallback((question?: QuestionBankItem) => {
    if (question) {
      const normalizedQuestion = normalizeQuestionLink(question);
      setEditingQuestion(question);
      setFormData({
        content: normalizedQuestion.content,
        options: [...normalizedQuestion.options],
        correctAnswer: normalizedQuestion.correctAnswer,
        explanation: normalizedQuestion.explanation,
        images: normalizedQuestion.images || [],
        linkedAngleId: normalizedQuestion.linkedAngleId || '',
        linkedAngleName: normalizedQuestion.linkedAngleName || '',
        knowledgePath: normalizedQuestion.knowledgePath || '',
        type: normalizedQuestion.type || 'real',
        reference: normalizedQuestion.reference || '',
        examPaper: normalizeExamPaperName(normalizedQuestion.examPaper),
      });
    } else {
      setEditingQuestion(null);
      setFormData(initialFormData);
    }
    setShowQuestionDialog(true);
  }, [normalizeQuestionLink]);

  const handleSaveQuestion = useCallback(async () => {
    if (!formData.content || !formData.correctAnswer) return;

    const imageResult = filterInlineImageUrls(formData.images);
    if (imageResult.dropped > 0) {
      alert(`已跳过 ${imageResult.dropped} 张过大或超出数量限制的图片。`);
    }

    const questionData: QuestionBankItem = normalizeQuestionLink({
      id: editingQuestion?.id || `q_${Date.now()}`,
      content: formData.content,
      options: formData.options.filter(o => o.text),
      correctAnswer: formData.correctAnswer,
      explanation: formData.explanation,
      images: imageResult.images,
      linkedAngleId: formData.linkedAngleId,
      linkedAngleName: formData.linkedAngleName,
      knowledgePath: formData.knowledgePath,
      type: formData.type,
      source: formData.type,
      reference: formData.reference,
      examPaper: normalizeExamPaperName(formData.examPaper),
      createdAt: editingQuestion?.createdAt || new Date().toISOString(),
    });

    if (editingQuestion) {
      updateQuestion(questionData);
    } else {
      addQuestion(questionData);
    }

    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: [{
          id: questionData.id,
          question_text: questionData.content,
          option_a: questionData.options[0]?.text || '',
          option_b: questionData.options[1]?.text || '',
          option_c: questionData.options[2]?.text || '',
          option_d: questionData.options[3]?.text || '',
          correct_answer: questionData.correctAnswer,
          explanation: questionData.explanation,
          knowledge_path: questionData.knowledgePath,
          linked_angle_id: questionData.linkedAngleId,
          source: questionData.type,
          type: questionData.type,
          reference: questionData.reference,
          exam_paper: questionData.examPaper,
        }],
      }),
    }).catch(err => console.error('Failed to sync question to Neon:', err));

    setShowQuestionDialog(false);
    setFormData(initialFormData);
    setEditingQuestion(null);
  }, [formData, editingQuestion, addQuestion, normalizeQuestionLink, updateQuestion]);

  const handleDeleteQuestion = useCallback((id: string) => {
    const question = questionBank.find(item => item.id === id);
    const answerCount = answerRecords.filter(record => record.questionId === id).length;
    const practiceCount = practiceRecords.filter(record => record.question_id === id).length;
    const impactLines = [
      `题目：${question?.content?.slice(0, 42) || id}`,
      `历史答题记录：${answerCount + practiceCount} 条`,
      question?.examPaper ? `所属套卷：${question.examPaper}` : '所属套卷：无',
      question?.linkedAngleName || question?.linkedAngleId ? `绑定知识点：${question.linkedAngleName || question.linkedAngleId}` : '绑定知识点：无',
      '',
      '删除后历史报告、错题回顾和套卷覆盖可能出现引用缺口。确认继续？',
    ];

    if (confirm(impactLines.join('\n'))) {
      if (question) {
        saveRecentDeletion({
          kind: 'question',
          title: question.content.slice(0, 48) || '已删除题目',
          summary: [
            question.examPaper ? `套卷：${question.examPaper}` : '未归入套卷',
            question.linkedAngleName ? `知识点：${question.linkedAngleName}` : '未绑定知识点',
          ].join('；'),
          payload: { question },
        });
      }
      deleteQuestion(id);
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteQuestionIds: [id] }),
      }).catch(err => console.error('Failed to soft delete question in Neon:', err));
    }
  }, [answerRecords, deleteQuestion, practiceRecords, questionBank]);

  const handleDeleteSelectedQuestions = useCallback(() => {
    const ids = Array.from(selectedQuestions);
    if (ids.length === 0) return;
    if (!window.confirm(`确认删除已选的 ${ids.length} 道题？删除后可在个人中心“最近删除”中尝试恢复。`)) return;

    ids.forEach(id => {
      const question = questionBank.find(item => item.id === id);
      if (question) {
        saveRecentDeletion({
          kind: 'question',
          title: question.content.slice(0, 48) || '已删除题目',
          summary: [
            question.examPaper ? `套卷：${question.examPaper}` : '未归入套卷',
            question.linkedAngleName ? `知识点：${question.linkedAngleName}` : '未绑定知识点',
          ].join('；'),
          payload: { question },
        });
      }
      deleteQuestion(id);
    });

    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteQuestionIds: ids }),
    }).catch(err => console.error('Failed to soft delete selected questions in Neon:', err));
    setSelectedQuestions(new Set());
  }, [deleteQuestion, questionBank, selectedQuestions]);

  const syncQuestionsToNeon = useCallback((questions: QuestionBankItem[]) => {
    if (questions.length === 0) return;

    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: questions.map(question => {
          const normalizedQuestion = normalizeQuestionLink(question);
          return {
            id: normalizedQuestion.id,
            question_text: normalizedQuestion.content,
            option_a: normalizedQuestion.options[0]?.text || '',
            option_b: normalizedQuestion.options[1]?.text || '',
            option_c: normalizedQuestion.options[2]?.text || '',
            option_d: normalizedQuestion.options[3]?.text || '',
            correct_answer: normalizedQuestion.correctAnswer,
            explanation: normalizedQuestion.explanation,
            knowledge_path: normalizedQuestion.knowledgePath,
            linked_angle_id: normalizedQuestion.linkedAngleId,
            source: normalizedQuestion.type,
            type: normalizedQuestion.type,
            reference: normalizedQuestion.reference,
            exam_paper: normalizedQuestion.examPaper,
          };
        }),
      }),
    }).catch(err => console.error('Failed to sync questions to Neon:', err));
  }, [normalizeQuestionLink]);

  const handleBatchApplyExamPaper = useCallback(() => {
    const examPaper = normalizeExamPaperName(batchExamPaper);
    if (!examPaper || selectedQuestions.size === 0) return;

    const updatedQuestions = questionBank
      .filter(question => selectedQuestions.has(question.id))
      .map(question => normalizeQuestionLink({
        ...question,
        type: 'real' as const,
        source: 'real',
        examPaper,
      }));

    updatedQuestions.forEach(updateQuestion);
    syncQuestionsToNeon(updatedQuestions);
    setBatchExamPaper('');
    setSelectedQuestions(new Set());
  }, [batchExamPaper, normalizeQuestionLink, questionBank, selectedQuestions, syncQuestionsToNeon, updateQuestion]);

  const handleImportJSON = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          let droppedImages = 0;
          data.forEach((item: QuestionBankItem) => {
            if (item.content && item.options && item.correctAnswer) {
              const imageResult = filterInlineImageUrls(item.images);
              droppedImages += imageResult.dropped;
              addQuestion(normalizeQuestionLink({
                ...item,
                id: item.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                images: imageResult.images,
              }));
            }
          });
          if (droppedImages > 0) {
            alert(`导入时已跳过 ${droppedImages} 张过大或超出数量限制的图片。`);
          }
          alert(`成功导入 ${data.length} 道题目`);
        }
      } catch {
        alert('导入失败，请检查文件格式');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [addQuestion, normalizeQuestionLink]);

  const handleExportQuestions = useCallback(() => {
    const dataStr = JSON.stringify(filteredQuestions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `questions_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredQuestions]);

  const handleExportBindingAuditReport = useCallback(() => {
    if (!bindingAuditReport) return;
    const dataStr = JSON.stringify({
      generatedAt: bindingAuditReport.generatedAt,
      totalQuestions: bindingAuditReport.totalQuestions,
      counts: bindingAuditReport.counts,
      issues: bindingAuditReport.issues.map(item => ({
        questionId: item.question.id,
        content: item.question.content,
        linkedAngleId: item.question.linkedAngleId,
        linkedAngleName: item.question.linkedAngleName,
        knowledgePath: item.question.knowledgePath,
        status: item.inspection.status,
        reason: item.inspection.reason,
        normalizedId: item.inspection.normalizedId,
        normalizedPath: item.inspection.normalizedPath,
      })),
    }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `knowledge_binding_audit_${new Date(bindingAuditReport.generatedAt).toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [bindingAuditReport]);

  const handleToggleQuestionSelection = useCallback((id: string) => {
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleCurrentPageSelection = useCallback(() => {
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      const shouldSelect = pageQuestionIds.some(id => !next.has(id));
      pageQuestionIds.forEach(id => {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }, [pageQuestionIds]);

  const handleSelectFilteredQuestions = useCallback(() => {
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      filteredQuestionIds.forEach(id => {
        if (allFilteredSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, [allFilteredSelected, filteredQuestionIds]);

  const handlePaperUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.docx')) {
      void (async () => {
        try {
          setPaperParseError('');
          setIsParsingPaper(true);
          const { extractTextFromDocxFile } = await import('@/lib/paper-file-reader');
          const text = await extractTextFromDocxFile(file);
          setPaperRawText(text);
          await parsePaperText(text, file.name);
        } catch (error) {
          setPaperParseError(error instanceof Error ? error.message : 'Word 文件读取失败');
        } finally {
          setIsParsingPaper(false);
          e.target.value = '';
        }
      })();
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        let data: UploadedPaperData | undefined;
        
        if (lowerName.endsWith('.json')) {
          data = JSON.parse(content);
        } else if (lowerName.endsWith('.csv')) {
          // 简单的 CSV 解析
          const lines = content.split('\n').filter(line => line.trim());
          data = {
            name: '上传的套卷',
            type: 'real',
            description: '通过文件上传的套卷',
            questions: []
          };
          
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length >= 5) {
              (data.questions ||= []).push({
                id: `upload_q_${Date.now()}_${i}`,
                content: values[0].trim(),
                options: [
                  { label: 'A', text: values[1].trim() },
                  { label: 'B', text: values[2].trim() },
                  { label: 'C', text: values[3].trim() },
                  { label: 'D', text: values[4].trim() }
                ],
                correctAnswer: values[5]?.trim() || 'A',
                explanation: values[6]?.trim() || '',
                reference: values[7]?.trim() || ''
              });
            }
          }
        } else {
          const text = lowerName.endsWith('.html') || lowerName.endsWith('.htm')
            ? (await import('@/lib/paper-file-reader')).extractTextFromHtml(content)
            : content;
          setPaperRawText(text);
          await parsePaperText(text, file.name);
          return;
        }
        
        if (!data) return;
        setUploadedPaper(data);
        
        // 自动填充表单
        if (data.name) {
          setPaperFormData({
            ...paperFormData,
            name: normalizeExamPaperName(data.name),
            type: data.type || 'real',
            description: data.description || ''
          });
        }
      } catch (error) {
        alert('文件解析失败，请检查格式是否正确');
        console.error(error);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [paperFormData, parsePaperText]);

  const handleCreatePaper = useCallback(() => {
    if (!paperFormData.name) return;
    
    let questionIds: string[] = [];
    const uploadedQuestions: QuestionBankItem[] = [];
    let importedDraftKeys = new Set<string>();
    
    if (paperCreationMode === 'select') {
      if (selectedQuestions.size === 0) return;
      questionIds = Array.from(selectedQuestions);
    } else {
      // 上传模式：将题目添加到题库并记录ID
      if (!uploadedPaper?.questions?.length) {
        alert('请先上传套卷文件');
        return;
      }

      const questionsToImport = importReadyOnly
        ? uploadedPaper.questions.filter(isUploadedQuestionReady)
        : uploadedPaper.questions;
      const finalQuestionsToImport = skipDuplicateDrafts
        ? questionsToImport.filter(question => {
          const index = uploadedPaper.questions?.indexOf(question) ?? -1;
          return !duplicateDraftIndexes.has(index);
        })
        : questionsToImport;
      importedDraftKeys = new Set(finalQuestionsToImport.map(question => question.id || `${question.content}::${question.correctAnswer || ''}`));

      if (questionsToImport.length > 0 && finalQuestionsToImport.length === 0) {
        alert('当前可导入草稿均为疑似重复题。可关闭“跳过疑似重复草稿”后再导入。');
        return;
      }

      if (finalQuestionsToImport.length === 0) {
        alert('当前没有可入库的草稿题。');
        return;
      }

      const missingAnswerCount = finalQuestionsToImport.filter(q => !q.correctAnswer?.trim()).length;
      const missingOptionsCount = finalQuestionsToImport.filter(q => (q.options?.length || 0) < 4).length;
      const missingExplanationCount = finalQuestionsToImport.filter(q => !q.explanation?.trim()).length;
      const missingBindingCount = finalQuestionsToImport.filter(q => !q.linkedAngleId && !q.knowledgePath).length;

      if (missingAnswerCount > 0 || missingOptionsCount > 0) {
        alert(`还有 ${missingAnswerCount} 道题缺答案、${missingOptionsCount} 道题选项不足，不能进入正式题库。请先补齐。`);
        return;
      }

      if ((missingExplanationCount > 0 || missingBindingCount > 0) && !window.confirm(`还有 ${missingExplanationCount} 道题缺解析、${missingBindingCount} 道题未绑定知识点。可以先入库，但建议后续补齐。确认继续？`)) {
        return;
      }
      
      questionIds = [];
      let droppedImages = 0;
      
      finalQuestionsToImport.forEach((q) => {
        const imageResult = filterInlineImageUrls(q.images);
        droppedImages += imageResult.dropped;
        const newQuestion: QuestionBankItem = normalizeQuestionLink({
          id: q.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: q.content,
          options: q.options || [
            { label: 'A', text: '' },
            { label: 'B', text: '' },
            { label: 'C', text: '' },
            { label: 'D', text: '' }
          ],
          correctAnswer: q.correctAnswer || 'A',
          explanation: q.explanation || '',
          images: imageResult.images,
          linkedAngleId: q.linkedAngleId || '',
          linkedAngleName: q.linkedAngleName || '',
          knowledgePath: q.knowledgePath || '',
          type: paperFormData.type,
          questionType: q.questionType || '',
          reference: q.reference || '',
          examPaper: normalizeExamPaperName(paperFormData.name),
          source: 'upload',
          createdAt: new Date().toISOString(),
        });
        
        addQuestion(newQuestion);
        uploadedQuestions.push(newQuestion);
        questionIds.push(newQuestion.id);
      });
      if (droppedImages > 0) {
        alert(`套卷导入时已跳过 ${droppedImages} 张过大或超出数量限制的图片。`);
      }
    }

    const selectedModeQuestions = paperCreationMode === 'select'
      ? questionBank
          .filter(question => questionIds.includes(question.id))
          .map(question => normalizeQuestionLink({
            ...question,
            type: paperFormData.type,
            source: paperFormData.type,
            examPaper: normalizeExamPaperName(paperFormData.name),
          }))
      : [];

    selectedModeQuestions.forEach(updateQuestion);
    if (selectedModeQuestions.length > 0) syncQuestionsToNeon(selectedModeQuestions);
    if (uploadedQuestions.length > 0) syncQuestionsToNeon(uploadedQuestions);

    const normalizedPaperName = normalizeExamPaperName(paperFormData.name);
    const paperPayload = {
      id: createExamPaperId(normalizedPaperName),
      name: normalizedPaperName,
      description: paperFormData.description,
      type: paperFormData.type,
      questions: questionIds,
      questionCount: questionIds.length,
      createdAt: new Date().toISOString(),
      completedCount: 0,
      avgScore: 0,
    };

    addExamPaper(paperPayload);
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examPapers: [{
          id: paperPayload.id,
          name: paperPayload.name,
          description: paperPayload.description,
          type: paperPayload.type,
          question_ids: paperPayload.questions,
          question_count: paperPayload.questionCount,
        }],
      }),
    }).catch(err => console.error('Failed to sync exam paper to Neon:', err));

    if (paperCreationMode === 'upload' && importReadyOnly && uploadedPaper?.questions?.length) {
      const remainingQuestions = uploadedPaper.questions.filter(question => (
        !importedDraftKeys.has(question.id || `${question.content}::${question.correctAnswer || ''}`)
      ));

      if (remainingQuestions.length === 0) {
        setShowPaperDialog(false);
        setPaperFormData({
          name: '',
          description: '',
          type: 'real',
          questions: [],
        });
        setUploadedPaper(null);
        setPaperCreationMode('select');
        alert(`已导入 ${questionIds.length} 道可入库题，套卷创建成功！`);
        return;
      }

      setUploadedPaper({
        ...uploadedPaper,
        questions: remainingQuestions,
      });
      alert(`已导入 ${questionIds.length} 道可入库题，剩余 ${remainingQuestions.length} 道草稿继续保留。`);
      return;
    }

    setShowPaperDialog(false);
    setPaperFormData({
      name: '',
      description: '',
      type: 'real',
      questions: [],
    });
    setSelectedQuestions(new Set());
    setUploadedPaper(null);
    setPaperCreationMode('select');
    alert('套卷创建成功！');
  }, [paperFormData, selectedQuestions, paperCreationMode, uploadedPaper, importReadyOnly, addExamPaper, addQuestion, normalizeQuestionLink, questionBank, syncQuestionsToNeon, updateQuestion]);

  const getQuestionKnowledgeLabel = useCallback((question: QuestionLinkLike) => {
    const linkedNode = resolveLinkedNode(question);
    if (linkedNode) {
      return nodeLookup.pathById.get(linkedNode.id) || linkedNode.name;
    }
    return question.knowledgePath || question.linkedAngleName || '未绑定知识点';
  }, [nodeLookup.pathById, resolveLinkedNode]);

  const stats = useMemo(() => ({
    total: questionBank.length,
    real: realQuestions.length,
    simulated: simulatedQuestions.length,
    bindingErrors: questionBank.filter(hasBindingIssue).length,
    similar: similarQuestionIds.size,
  }), [hasBindingIssue, questionBank, realQuestions, similarQuestionIds.size, simulatedQuestions]);

  const nextBindingAuditAt = useMemo(() => {
    if (!bindingAuditReport?.generatedAt) return null;
    const lastTime = Date.parse(bindingAuditReport.generatedAt);
    if (!Number.isFinite(lastTime)) return null;
    return new Date(lastTime + BINDING_AUDIT_INTERVAL_MS);
  }, [bindingAuditReport]);

  return (
    <div className="h-full flex flex-col w-full overflow-x-hidden">
      <div className="border-b bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <BookOpen className="h-4 sm:h-5 w-4 sm:w-5" />
              题库管理
            </h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>全部 {stats.total}</span>
                <span>真题 {stats.real}</span>
                <span>模拟题 {stats.simulated}</span>
                <span className={cn(stats.bindingErrors > 0 && 'text-amber-700')}>绑定异常 {stats.bindingErrors}</span>
                <span className={cn(stats.similar > 0 && 'text-red-700')}>相似题 {stats.similar}</span>
                <span>筛选 {filteredQuestions.length}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={runBindingAudit}>
                <Check className="mr-1.5 h-4 w-4" />
                绑定巡检
              </Button>
              <Button variant="outline" size="sm" onClick={handleImportJSON}>
                <Upload className="mr-1.5 h-4 w-4" />
                导入
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportQuestions} disabled={filteredQuestions.length === 0}>
                <Download className="mr-1.5 h-4 w-4" />
                导出
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPaperDialog(true)}>
                <Layers className="mr-1.5 h-4 w-4" />
                套卷
              </Button>
              <Button size="sm" onClick={() => handleOpenQuestionDialog()}>
                <Plus className="mr-1.5 h-4 w-4" />
                添加
              </Button>
            </div>
          </div>

          {bindingAuditReport && (
            <div className="grid gap-2 rounded-lg border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-950 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <span>知识点绑定巡检：异常 {bindingAuditReport.issues.length} / {bindingAuditReport.totalQuestions}</span>
                  <Badge variant="outline" className="border-amber-200 bg-white text-amber-700">自动每日</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-amber-800">
                  <span>未绑定 {bindingAuditReport.counts.missing}</span>
                  <span>无法解析 {bindingAuditReport.counts.unresolved}</span>
                  <span>同名歧义 {bindingAuditReport.counts['ambiguous-name']}</span>
                  <span>上次巡检 {new Date(bindingAuditReport.generatedAt).toLocaleString()}</span>
                  {nextBindingAuditAt && <span>下次自动 {nextBindingAuditAt.toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white"
                  disabled={bindingAuditReport.issues.length === 0}
                  onClick={() => setFilterType('binding-error')}
                >
                  查看异常题
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white"
                  onClick={handleExportBindingAuditReport}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  导出报告
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-cyan-950">知识点别名库</div>
                <p className="mt-1 text-xs leading-5 text-cyan-800">
                  自动绑定只会推荐现有 MindCanvas 路径；别名用于把常见叫法映射到标准知识点。
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="bg-white">默认 {DEFAULT_KNOWLEDGE_ALIAS_ENTRIES.length}</Badge>
                  <Badge variant="outline" className="bg-white">自定义 {customKnowledgeAliases.length}</Badge>
                </div>
              </div>
              <div className="grid w-full gap-2 lg:max-w-2xl lg:grid-cols-[minmax(120px,0.85fr)_minmax(180px,1.35fr)_auto]">
                <Input
                  value={newKnowledgeAlias}
                  onChange={(e) => setNewKnowledgeAlias(e.target.value)}
                  placeholder="别名，如：加强削弱"
                  className="bg-white"
                />
                <Input
                  value={newKnowledgeAliasTarget}
                  list="knowledge-alias-target-options"
                  onChange={(e) => setNewKnowledgeAliasTarget(e.target.value)}
                  placeholder="目标知识点路径或名称"
                  className="bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="bg-white"
                  disabled={!newKnowledgeAlias.trim() || !newKnowledgeAliasTarget.trim()}
                  onClick={handleAddKnowledgeAlias}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  添加
                </Button>
              </div>
            </div>
            <datalist id="knowledge-alias-target-options">
              {knowledgePathsForParser.map(path => (
                <option key={path} value={path} />
              ))}
            </datalist>
            {customKnowledgeAliases.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {customKnowledgeAliases.map(entry => (
                  <div key={entry.alias} className="flex max-w-full items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs text-slate-700">
                    <span className="font-medium text-cyan-800">{entry.alias}</span>
                    <span className="max-w-[260px] truncate text-slate-500">→ {entry.target}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => handleDeleteKnowledgeAlias(entry.alias)}
                      aria-label={`删除别名 ${entry.alias}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto]">
            <div className="relative min-w-0">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="搜索题干、解析"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'real' | 'simulated' | 'binding-error' | 'similar')}
              className="h-9 rounded-md border bg-white px-2 text-sm"
            >
              <option value="all">全部类型</option>
              <option value="real">真题</option>
              <option value="simulated">模拟题</option>
              <option value="binding-error">绑定异常</option>
              <option value="similar">相似/重复题</option>
            </select>
          </div>

          {selectedQuestions.size > 0 && (
            <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 sm:grid-cols-[auto_minmax(180px,1fr)_auto] sm:items-center">
              <div className="text-xs font-medium text-amber-900">
                {selectedQuestions.size} 题归入套卷
              </div>
              <Input
                value={batchExamPaper}
                onChange={(event) => setBatchExamPaper(event.target.value)}
                placeholder="例如：2026国考副省级"
                list="exam-paper-options"
                className="h-8 bg-white text-xs sm:text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleBatchApplyExamPaper} disabled={!batchExamPaper.trim()}>
                  应用
                </Button>
                <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={handleDeleteSelectedQuestions}>
                  删除所选
                </Button>
              </div>
              <datalist id="exam-paper-options">
                {examPaperOptions.map(option => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          )}
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />

      <ScrollArea className="flex-1 min-h-0 w-full max-w-full">
        <div className="p-2 sm:p-3 w-full max-w-full box-border">
          {filteredQuestions.length > 0 ? (
            <div className="space-y-2 sm:space-y-3 w-full max-w-full">
              {pageQuestions.map((question) => (
                <Card
                  key={question.id}
                  className={cn(
                    'w-full max-w-full cursor-pointer border-slate-200 shadow-none transition-colors hover:border-slate-400',
                    selectedQuestions.has(question.id) && 'border-blue-400 bg-blue-50/60'
                  )}
                  onClick={() => handleToggleQuestionSelection(question.id)}
                >
                  <CardContent className="w-full max-w-full p-3">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-3 w-full max-w-full">
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2 w-full">
                          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                            <span className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border bg-white',
                              selectedQuestions.has(question.id) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'
                            )}>
                              {selectedQuestions.has(question.id) && <Check className="h-3 w-3" />}
                            </span>
                            <Badge
                              variant={question.type === 'real' ? 'default' : 'secondary'}
                              className="text-xs px-1.5 py-0.5 flex-shrink-0"
                            >
                              {question.type === 'real' ? '真题' : '模拟题'}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[150px]" title={getQuestionKnowledgeLabel(question)}>
                              {getQuestionKnowledgeLabel(question)}
                            </span>
                            {question.examPaper && (
                              <Badge variant="outline" className="max-w-[160px] truncate border-amber-300 bg-amber-50 text-xs text-amber-800">
                                {question.examPaper}
                              </Badge>
                            )}
                            {similarQuestionIds.has(question.id) && (
                              <Badge variant="outline" className="border-red-200 bg-red-50 text-xs text-red-700">
                                疑似重复
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 sm:hidden" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenQuestionDialog(question)}
                              className="h-7 w-7"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteQuestion(question.id)}
                              className="h-7 w-7"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <p className="mb-2 line-clamp-2 w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 word-break-all sm:line-clamp-3">{question.content}</p>
                        {hasBindingIssue(question) && (
                          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            绑定异常：{inspectBinding(question).reason}
                          </div>
                        )}
                        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 sm:hidden">
                          <span className="rounded bg-[#b7e3ff]/45 px-1.5 py-0.5 font-medium text-[#5e5394]">
                            答案 {question.correctAnswer || '-'}
                          </span>
                          {question.options.length > 0 && (
                            <span>{question.options.length} 个选项</span>
                          )}
                          {question.explanation && <span>有解析</span>}
                          {question.images && question.images.length > 0 && <span>{question.images.length} 图</span>}
                        </div>
                        <div className="hidden w-full flex-wrap gap-1 text-xs text-slate-500 sm:flex">
                          {question.options.map((opt) => (
                            <span
                              key={opt.label}
                              className={cn(
                                'max-w-full rounded bg-slate-100 px-1.5 py-0.5 text-xs break-words word-break-all',
                                opt.label === question.correctAnswer && 'bg-[#b7e3ff]/45 text-[#5e5394] dark:bg-violet-900/30 dark:text-violet-200'
                              )}
                            >
                              {opt.label}. {opt.text}
                            </span>
                          ))}
                        </div>
                        
                        {question.explanation && (
                          <div className="mt-2 hidden w-full border-t border-dashed pt-2 sm:block">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                              <Lightbulb className="h-3 w-3" />
                              <span>解析</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words word-break-all">{question.explanation}</p>
                          </div>
                        )}
                        
                        {question.reference && (
                          <div className="mt-2 hidden w-full border-t border-dashed pt-2 sm:block">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <FileText className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">题目出处：{question.reference}</span>
                            </div>
                          </div>
                        )}
                        
                        {question.images && question.images.length > 0 && (
                          <div className="mt-2 hidden w-full border-t border-dashed pt-2 sm:block">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                              <ImageIcon className="h-3 w-3" />
                              <span>解析图片</span>
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto pb-1.5">
                              {question.images.map((img, idx) => (
                                <div key={idx} className="relative group cursor-pointer flex-shrink-0" onClick={() => setPreviewImage(img)}>
                                  <Image
                                    src={img}
                                    alt={`解析图 ${idx + 1}`}
                                    width={160}
                                    height={96}
                                    unoptimized
                                    className="h-16 w-auto rounded border object-contain sm:h-20"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded border flex items-center justify-center">
                                    <ZoomIn className="h-4 sm:h-5 w-4 sm:w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="hidden sm:flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenQuestionDialog(question)}
                          className="h-7 w-7"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteQuestion(question.id)}
                          className="h-7 w-7"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <div className="flex flex-col gap-2 rounded-md border bg-white p-2 sm:p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex h-8 items-center gap-2 rounded-md border bg-white px-2 font-medium">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={handleToggleCurrentPageSelection}
                    />
                    当前页
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={handleSelectFilteredQuestions}>
                    {allFilteredSelected ? '取消筛选全选' : '全选筛选结果'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedQuestions(new Set())}
                    disabled={selectedQuestions.size === 0}
                  >
                    清空
                  </Button>
                  <div className="text-slate-500">
                    已选 {selectedQuestions.size} · 共 {filteredQuestions.length}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <div className="text-xs text-slate-500">
                    第 {safeCurrentPage}/{totalPages} 页 · {pageStartIndex + 1}-{Math.min(pageStartIndex + pageQuestions.length, filteredQuestions.length)} / {filteredQuestions.length}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={safeCurrentPage === 1}
                        aria-label="首页"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                        disabled={safeCurrentPage === 1}
                        aria-label="上一页"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="min-w-16 text-center text-xs text-muted-foreground">
                        {safeCurrentPage} / {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                        disabled={safeCurrentPage === totalPages}
                        aria-label="下一页"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={safeCurrentPage === totalPages}
                        aria-label="末页"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-8 rounded-md border bg-white px-2 text-xs"
                    aria-label="每页题目数量"
                  >
                    <option value={10}>10题/页</option>
                    <option value={50}>50题/页</option>
                    <option value={100}>100题/页</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
              <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无题目</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery ? '没有找到符合条件的题目' : '点击上方按钮添加题目或导入题库'}
              </p>
              <Button onClick={() => handleOpenQuestionDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                添加题目
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? '编辑题目' : '添加题目'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">题目类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="type"
                    value="real"
                    checked={formData.type === 'real'}
                    onChange={() => setFormData({ ...formData, type: 'real' })}
                  />
                  真题
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="type"
                    value="simulated"
                    checked={formData.type === 'simulated'}
                    onChange={() => setFormData({ ...formData, type: 'simulated' })}
                  />
                  模拟题
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">关联知识点</label>
              <select
                value={formData.linkedAngleId}
                onChange={(e) => {
                  const selectedNodeId = e.target.value;
                  const selectedNode = nodes.find(n => n.id === selectedNodeId);
                  
                  if (selectedNode) {
                    const getNodePath = (nodeId: string): string[] => {
                      const parts: string[] = [];
                      let current = nodes.find(n => n.id === nodeId);
                      while (current) {
                        parts.unshift(current.name);
                        current = current.parent_id
                          ? nodes.find(n => n.id === current!.parent_id)
                          : undefined;
                      }
                      return parts;
                    };
                    
                    const pathParts = getNodePath(selectedNodeId);
                    const knowledgePath = pathParts.join('》');
                    
                    setFormData({ 
                      ...formData, 
                      linkedAngleId: selectedNodeId,
                      linkedAngleName: selectedNode.name,
                      knowledgePath: knowledgePath
                    });
                  }
                }}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">请选择知识点</option>
                {nodes
                  .filter(node => node.node_type === 'angle')
                  .map(node => {
                    const getNodePath = (nodeId: string): string[] => {
                      const parts: string[] = [];
                      let current = nodes.find(n => n.id === nodeId);
                      while (current) {
                        parts.unshift(current.name);
                        current = current.parent_id
                          ? nodes.find(n => n.id === current!.parent_id)
                          : undefined;
                      }
                      return parts;
                    };
                    const pathParts = getNodePath(node.id);
                    const displayPath = pathParts.join('》');
                    
                    return (
                      <option key={node.id} value={node.id}>
                        {displayPath}
                      </option>
                    );
                  })
                }
              </select>
              {formData.knowledgePath && (
                <p className="text-xs text-muted-foreground mt-1">
                  完整路径：{formData.knowledgePath}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">题目内容</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="请输入题目内容..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">选项</label>
              <div className="space-y-2">
                {formData.options.map((option, index) => (
                  <div key={option.label} className="flex items-center gap-2">
                    <span className="w-6 font-medium">{option.label}.</span>
                    <Input
                      value={option.text}
                      onChange={(e) => {
                        const newOptions = [...formData.options];
                        newOptions[index].text = e.target.value;
                        setFormData({ ...formData, options: newOptions });
                      }}
                      placeholder={`选项 ${option.label}`}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">正确答案</label>
              <select
                value={formData.correctAnswer}
                onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">请选择正确答案</option>
                {formData.options.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label}. {option.text || '(未填写)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">解析</label>
              <Textarea
                value={formData.explanation}
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                placeholder="请输入题目解析..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">题目出处</label>
              <div className="text-sm font-medium">真题套卷</div>
              <Input
                value={formData.examPaper}
                onChange={(e) => setFormData({ ...formData, examPaper: e.target.value })}
                placeholder="例如：2026国考副省级"
                list="exam-paper-options"
              />
              <p className="text-xs text-muted-foreground">MindCanvas 可按这个套卷高亮相关知识点。</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">题目出处</label>
              <Input
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                placeholder="例如：人民日报、新华社、2023年国考真题..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">解析图片</label>
                <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4 mr-1" />
                  添加图片
                </Button>
              </div>
              <input
                type="file"
                ref={imageInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                multiple
                className="hidden"
              />
              {formData.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {formData.images.map((image, index) => (
                    <div key={index} className="relative group">
                      <Image
                        src={image}
                        alt={`解析图片 ${index + 1}`}
                        width={220}
                        height={120}
                        unoptimized
                        className="h-24 w-full rounded border object-cover"
                      />
                      <button
                        onClick={() => handleRemoveImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuestionDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveQuestion}>
              <Check className="h-4 w-4 mr-1" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaperDialog} onOpenChange={setShowPaperDialog}>
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 !z-50 !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 !rounded-none flex flex-col overflow-hidden bg-slate-50 p-0 sm:!max-w-none">
          <DialogHeader className="shrink-0 border-b bg-white px-6 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-6 pr-10">
              <div>
                <DialogTitle className="text-xl">套卷导入工作台</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  从题库组卷，或上传 Word/文本资料后解析、审核并入库。
                </p>
              </div>
              <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
                <Badge variant="outline">题库 {questionBank.length}</Badge>
                <Badge variant="outline">套卷 {examPaperOptions.length}</Badge>
                {paperCreationMode === 'select' ? (
                  <Badge variant="outline">已选 {selectedQuestions.size}</Badge>
                ) : (
                  <Badge variant="outline">草稿 {uploadedPaperQuality.total}</Badge>
                )}
              </div>
            </div>
          </DialogHeader>
          
          {/* 标签页切换 */}
          <div className="shrink-0 border-b bg-white px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border bg-slate-100 p-1">
            <button
              onClick={() => {
                setPaperCreationMode('select');
                setUploadedPaper(null);
              }}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                paperCreationMode === 'select'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              从题库选择
            </button>
            <button
              onClick={() => {
                setPaperCreationMode('upload');
                setSelectedQuestions(new Set());
              }}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                paperCreationMode === 'upload'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              资料解析与审核
            </button>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">1. 选择来源</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">2. 解析拆题</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">3. 审核修正</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">4. 创建入库</span>
              </div>
            </div>
          </div>
          
          <div className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-5 p-5 lg:p-6">
            <div className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1.4fr)_220px]">
              <div className="space-y-2">
                <label className="text-sm font-medium">套卷名称</label>
                <Input
                  value={paperFormData.name}
                  onChange={(e) => setPaperFormData({ ...paperFormData, name: e.target.value })}
                  placeholder="例如：2024年国考行测真题"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">套卷类型</label>
                <select
                  value={paperFormData.type}
                  onChange={(e) => setPaperFormData({ ...paperFormData, type: e.target.value as 'real' | 'simulated' })}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="real">真题套卷</option>
                  <option value="simulated">模拟题套卷</option>
                </select>
              </div>
            </div>

            {/* 从题库选择模式 */}
            {paperCreationMode === 'select' && (
              <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">选择题目（已选 {selectedQuestions.size} 题）</label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const availableQuestions = paperFormData.type === 'real' ? realQuestions : simulatedQuestions;
                        setSelectedQuestions(new Set(availableQuestions.map(q => q.id)));
                      }}
                    >
                      全选当前类型
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedQuestions(new Set())}
                    >
                      清空
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-[520px] rounded-lg border bg-slate-50">
                  <div className="p-2 space-y-1">
                    {(paperFormData.type === 'real' ? realQuestions : simulatedQuestions).length > 0 ? (
                      (paperFormData.type === 'real' ? realQuestions : simulatedQuestions).map((question) => (
                        <div
                          key={question.id}
                          className={cn(
                            'rounded-md border border-transparent bg-white p-3 cursor-pointer transition-colors',
                            selectedQuestions.has(question.id)
                              ? 'border-primary bg-primary/10'
                              : 'hover:border-slate-200 hover:bg-slate-50'
                          )}
                          onClick={() => handleToggleQuestionSelection(question.id)}
                        >
                          <p className="text-sm line-clamp-2 whitespace-pre-wrap break-words">{question.content}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            正确答案: {question.correctAnswer}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        暂无{paperFormData.type === 'real' ? '真题' : '模拟题'}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* 上传整张套卷模式 */}
            {paperCreationMode === 'upload' && (
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
                  <label className="text-sm font-medium">上传或解析套卷资料</label>
                  <div
                    onClick={() => paperInputRef.current?.click()}
                    className="flex min-h-[180px] items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center cursor-pointer transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    {uploadedPaper ? (
                      <div>
                        <Check className="mx-auto mb-2 h-12 w-12 text-[#a49aff]" />
                        <p className="text-sm font-medium">已上传：{uploadedPaper.name}</p>
                        <p className="text-xs text-muted-foreground">
                          共 {uploadedPaper.questions?.length || 0} 道题目
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedPaper(null);
                          }}
                        >
                          重新上传
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">点击上传资料文件</p>
                        <p className="text-xs text-muted-foreground">
                          支持 JSON、CSV、Word(.docx)、TXT、Markdown、HTML
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={paperInputRef}
                    onChange={handlePaperUpload}
                    accept=".json,.csv,.txt,.md,.markdown,.docx,.html,.htm"
                    className="hidden"
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON/CSV 会按固定格式读取；Word(.docx)、TXT/Markdown、HTML 或网页文本会进入解析预览。
                  </p>
                  <p className="text-xs text-muted-foreground">
                    老版 .doc 和扫描版 PDF 建议先转换为 .docx 或复制文字；后续可单独接 PDF/OCR 解析。
                  </p>
                </div>

                <div className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="h-4 w-4 text-amber-600" />
                      拆题解析方式
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {paperParserProvider === 'rule' ? '无需密钥' : '模型辅助'}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">模型供应商</label>
                      <select
                        value={paperParserProvider}
                        onChange={(e) => setPaperParserProvider(e.target.value as PaperParserProvider)}
                        className="h-9 w-full rounded-md border bg-white px-2 text-sm"
                      >
                        <option value="rule">规则解析（无需模型）</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="qwen">通义千问</option>
                        <option value="openai">OpenAI</option>
                        <option value="openai-compatible">OpenAI 兼容接口</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">模型名称</label>
                      <Input
                        value={paperParserModel}
                        onChange={(e) => setPaperParserModel(e.target.value)}
                        placeholder="deepseek-chat / qwen-plus / gpt-4.1-mini"
                        disabled={paperParserProvider === 'rule'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                      <Input
                        value={paperParserBaseUrl}
                        onChange={(e) => setPaperParserBaseUrl(e.target.value)}
                        placeholder="留空使用供应商默认地址"
                        disabled={paperParserProvider === 'rule'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">临时 API Key</label>
                      <Input
                        type="password"
                        value={paperParserApiKey}
                        onChange={(e) => setPaperParserApiKey(e.target.value)}
                        placeholder="可留空，优先使用服务端环境变量"
                        disabled={paperParserProvider === 'rule'}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">AI补解析模型</div>
                      <Badge variant="outline">用于单题生成结构化解析</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">模型供应商</label>
                        <select
                          value={explanationProvider}
                          onChange={(e) => setExplanationProvider(e.target.value as Exclude<PaperParserProvider, 'rule'>)}
                          className="h-9 w-full rounded-md border bg-white px-2 text-sm"
                        >
                          <option value="deepseek">DeepSeek</option>
                          <option value="qwen">通义千问</option>
                          <option value="openai">OpenAI</option>
                          <option value="openai-compatible">OpenAI 兼容接口</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">模型名称</label>
                        <Input
                          value={explanationModel}
                          onChange={(e) => setExplanationModel(e.target.value)}
                          placeholder="deepseek-chat / qwen-plus / gpt-4.1-mini"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                        <Input
                          value={explanationBaseUrl}
                          onChange={(e) => setExplanationBaseUrl(e.target.value)}
                          placeholder="留空使用供应商默认地址"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">临时 API Key</label>
                        <Input
                          type="password"
                          value={explanationApiKey}
                          onChange={(e) => setExplanationApiKey(e.target.value)}
                          placeholder="可留空，优先使用服务端环境变量"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">粘贴试卷文本</label>
                    <Textarea
                      className="min-h-[132px] bg-white"
                      value={paperRawText}
                      onChange={(e) => setPaperRawText(e.target.value)}
                      placeholder="可以上传 Word(.docx)，也可以从网页、公众号或飞书复制题目文本到这里，再点击解析。"
                      rows={7}
                    />
                  </div>
                  {paperParseError && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                      {paperParseError}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      模型解析不会直接入库，需先在预览中确认题干、答案、解析和知识点。
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isParsingPaper || !paperRawText.trim()}
                      onClick={() => void parsePaperText(paperRawText)}
                    >
                      {isParsingPaper ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-1 h-4 w-4" />}
                      解析文本
                    </Button>
                  </div>
                </div>
                </div>

                {/* 预览上传的题目 */}
                {!!uploadedPaper?.questions?.length && (
                  <div className="min-w-0 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <label className="text-sm font-semibold">草稿审核台</label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            解析结果先作为草稿处理，补齐答案、解析和知识点后再入库。
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">共 {uploadedPaperQuality.total} 题</Badge>
                          <Badge variant="outline">可入库 {uploadedPaperQuality.ready}</Badge>
                          <Badge variant="outline">缺答案 {uploadedPaperQuality.missingAnswer}</Badge>
                          <Badge variant="outline">缺解析 {uploadedPaperQuality.missingExplanation}</Badge>
                          <Badge variant="outline">待绑定 {uploadedPaperQuality.missingBinding}</Badge>
                          <Badge variant="outline">低置信 {uploadedPaperQuality.lowConfidence}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['all', '全部草稿', uploadedPaperQuality.total],
                          ['missing-answer', '缺答案', uploadedPaperQuality.missingAnswer],
                          ['missing-explanation', '缺解析', uploadedPaperQuality.missingExplanation],
                          ['missing-binding', '待绑定', uploadedPaperQuality.missingBinding],
                          ['low-confidence', '低置信', uploadedPaperQuality.lowConfidence],
                          ['duplicate', '疑似重复', duplicateDraftIndexes.size],
                          ['ready', '可入库', uploadedPaperQuality.ready],
                        ].map(([value, label, count]) => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            variant={paperDraftFilter === value ? 'default' : 'outline'}
                            onClick={() => setPaperDraftFilter(value as PaperDraftFilter)}
                          >
                            {label}
                            <span className="ml-1 text-xs opacity-75">{count}</span>
                          </Button>
                        ))}
                      </div>
                      <div className="grid gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">批量绑定当前筛选结果</label>
                          <Input
                            value={batchDraftKnowledgePath}
                            list="paper-knowledge-path-options"
                            onChange={(e) => setBatchDraftKnowledgePath(e.target.value)}
                            placeholder="选择知识点路径，应用到当前筛选下的草稿题"
                          />
                        </div>
                        <Button
                          type="button"
                          className="self-end"
                          variant="outline"
                          disabled={!batchDraftKnowledgePath.trim() || filteredUploadedQuestions.length === 0}
                          onClick={handleBatchApplyDraftKnowledgePath}
                        >
                          应用到 {filteredUploadedQuestions.length} 题
                        </Button>
                      </div>
                      <div className="grid gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">批量设置当前筛选题型</label>
                          <Input
                            value={batchDraftQuestionType}
                            list="paper-question-type-options"
                            onChange={(e) => setBatchDraftQuestionType(e.target.value)}
                            placeholder="选择或输入题型，例如：资料分析"
                          />
                        </div>
                        <Button
                          type="button"
                          className="self-end"
                          variant="outline"
                          disabled={!batchDraftQuestionType.trim() || filteredUploadedQuestions.length === 0}
                          onClick={handleBatchApplyDraftQuestionType}
                        >
                          应用题型
                        </Button>
                        <Button
                          type="button"
                          className="self-end"
                          variant="outline"
                          disabled={filteredLowQualityDraftCount === 0}
                          onClick={handleDeleteLowQualityDrafts}
                        >
                          删除低质量 {filteredLowQualityDraftCount}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-cyan-50/50 p-3">
                        <div>
                          <div className="text-xs font-medium text-cyan-950">自动匹配知识点</div>
                          <p className="mt-1 text-xs text-cyan-800">
                            根据题干、选项和解析，从现有 MindCanvas 知识点路径中推荐；只会填充当前筛选下尚未绑定的草稿题。
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleAutoBindDraftKnowledgePath}
                          disabled={filteredUploadedQuestions.length === 0}
                        >
                          自动匹配当前筛选
                        </Button>
                      </div>
                    </div>
                    <datalist id="paper-knowledge-path-options">
                      {knowledgePathsForParser.map(path => (
                        <option key={path} value={path} />
                      ))}
                    </datalist>
                    <datalist id="paper-question-type-options">
                      {QUESTION_TYPE_PRESETS.map(type => (
                        <option key={type} value={type} />
                      ))}
                    </datalist>
                    <ScrollArea className="h-[650px] rounded-lg border bg-slate-50">
                      <div className="p-3 space-y-3">
                        {filteredUploadedQuestions.length === 0 ? (
                          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed bg-white text-sm text-muted-foreground">
                            当前筛选下没有草稿题
                          </div>
                        ) : filteredUploadedQuestions.map(({ question: q, index: idx }) => (
                          <div key={idx} className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                              <div className="text-sm font-semibold">第 {idx + 1} 题</div>
                              <div className="flex flex-wrap gap-1">
                                {(q.options?.length || 0) < 4 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">选项不足</Badge>}
                                {!q.correctAnswer && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">缺答案</Badge>}
                                {!q.explanation && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">缺解析</Badge>}
                                {!q.linkedAngleId && !q.knowledgePath && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">待绑定</Badge>}
                                {duplicateDraftIndexes.has(idx) && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">疑似重复</Badge>}
                                {q.questionType && <Badge variant="outline">题型 {q.questionType}</Badge>}
                                {typeof q.confidence === 'number' && (
                                  <Badge variant="outline">置信度 {Math.round(q.confidence * 100)}%</Badge>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  disabled={generatingExplanationIndex !== null}
                                  onClick={() => void handleGenerateDraftExplanation(idx)}
                                >
                                  {generatingExplanationIndex === idx ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Lightbulb className="mr-1 h-3 w-3" />}
                                  AI生成解析
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => removeUploadedQuestion(idx)}
                                >
                                  移除
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              className="bg-white"
                              value={q.content}
                              onChange={(e) => updateUploadedQuestion(idx, { content: e.target.value })}
                              rows={3}
                              placeholder="题干"
                            />
                            {!!q.generatedExplanation?.stemStructure?.length && (
                              <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-3">
                                <div className="mb-2 text-xs font-medium text-cyan-900">题干结构划分</div>
                                <div className="space-y-2">
                                  {q.generatedExplanation.stemStructure.map((part, partIndex) => (
                                    <div key={`${part.label}-${partIndex}`} className="grid gap-2 rounded-md bg-white p-2 text-xs sm:grid-cols-[80px_minmax(0,1fr)]">
                                      <div className="font-medium text-cyan-800">{part.label} {part.role}</div>
                                      <div className="leading-5 text-slate-700">{part.text}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="grid gap-2 md:grid-cols-2">
                              {(['A', 'B', 'C', 'D'] as const).map((label, optionIndex) => {
                                const option = q.options?.find(item => item.label === label) || q.options?.[optionIndex] || { label, text: '' };
                                return (
                                <div key={`${idx}-${option.label}-${optionIndex}`} className="flex items-center gap-2">
                                  <Badge variant="outline" className="w-8 justify-center">{label}</Badge>
                                  <Input
                                    className="bg-white"
                                    value={option.text}
                                    onChange={(e) => {
                                      const nextOptions = [...(q.options || [])];
                                      const existingIndex = nextOptions.findIndex(item => item.label === label);
                                      if (existingIndex >= 0) {
                                        nextOptions[existingIndex] = { label, text: e.target.value };
                                      } else {
                                        nextOptions[optionIndex] = { label, text: e.target.value };
                                      }
                                      updateUploadedQuestion(idx, { options: nextOptions });
                                    }}
                                    placeholder={`选项 ${label}`}
                                  />
                                </div>
                                );
                              })}
                            </div>
                            <div className="grid gap-2 md:grid-cols-[140px_180px_minmax(0,1fr)]">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">答案</label>
                                <select
                                  value={q.correctAnswer || ''}
                                  onChange={(e) => updateUploadedQuestion(idx, { correctAnswer: e.target.value })}
                                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                >
                                  <option value="">待补</option>
                                  <option value="A">A</option>
                                  <option value="B">B</option>
                                  <option value="C">C</option>
                                  <option value="D">D</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">题型</label>
                                <Input
                                  className="bg-white"
                                  value={q.questionType || ''}
                                  list="paper-question-type-options"
                                  onChange={(e) => updateUploadedQuestion(idx, { questionType: e.target.value })}
                                  placeholder="如：言语理解"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">知识点路径</label>
                                <Input
                                  className="bg-white"
                                  value={q.knowledgePath || ''}
                                  list="paper-knowledge-path-options"
                                  onChange={(e) => updateUploadedQuestion(idx, { knowledgePath: e.target.value })}
                                  placeholder="选择或输入知识点路径"
                                />
                              </div>
                            </div>
                            {!q.knowledgePath && !q.linkedAngleId && !!draftKnowledgeRecommendations.get(idx)?.length && (
                              <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-2">
                                <div className="mb-2 text-xs font-medium text-cyan-950">候选知识点</div>
                                <div className="grid gap-2 lg:grid-cols-3">
                                  {(draftKnowledgeRecommendations.get(idx) || []).map((candidate, candidateIndex) => (
                                    <button
                                      key={`${idx}-${candidate.path}`}
                                      type="button"
                                      className="rounded-md border bg-white p-2 text-left text-xs transition hover:border-cyan-300 hover:bg-cyan-50"
                                      onClick={() => updateUploadedQuestion(idx, { knowledgePath: candidate.path })}
                                    >
                                      <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="font-medium text-cyan-950">候选 {candidateIndex + 1}</span>
                                        <span className="text-cyan-700">{Math.round(candidate.score * 100)}%</span>
                                      </div>
                                      <div className="line-clamp-2 leading-5 text-slate-700">{candidate.path}</div>
                                      {candidate.matchedAliases.length > 0 && (
                                        <div className="mt-1 text-[11px] text-amber-700">
                                          别名命中：{candidate.matchedAliases.join('、')}
                                        </div>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <Textarea
                              className="bg-white"
                              value={q.explanation || ''}
                              onChange={(e) => updateUploadedQuestion(idx, { explanation: e.target.value })}
                              rows={2}
                              placeholder="解析，可后续补齐"
                            />
                            {q.generatedExplanation && (
                              <div className="grid gap-3 md:grid-cols-2">
                                {q.generatedExplanation.corePitfall && (
                                  <div className="rounded-lg border bg-slate-50 p-3">
                                    <div className="mb-1 text-xs font-semibold text-slate-700">核心考点必挖坑</div>
                                    <p className="text-xs leading-5 text-slate-600">{q.generatedExplanation.corePitfall}</p>
                                  </div>
                                )}
                                {(q.generatedExplanation.routines.correct.length > 0 || q.generatedExplanation.routines.wrong.length > 0) && (
                                  <div className="rounded-lg border bg-slate-50 p-3">
                                    <div className="mb-1 text-xs font-semibold text-slate-700">四大出题套路</div>
                                    <div className="grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
                                      <div>
                                        <div className="font-medium text-green-700">正确模板</div>
                                        {q.generatedExplanation.routines.correct.map((item, itemIndex) => <p key={itemIndex}>{item}</p>)}
                                      </div>
                                      <div>
                                        <div className="font-medium text-red-700">错误模板</div>
                                        {q.generatedExplanation.routines.wrong.map((item, itemIndex) => <p key={itemIndex}>{item}</p>)}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {q.generatedExplanation.extension && (
                                  <div className="rounded-lg border bg-slate-50 p-3">
                                    <div className="mb-1 text-xs font-semibold text-slate-700">延伸考法</div>
                                    <p className="text-xs leading-5 text-slate-600">{q.generatedExplanation.extension}</p>
                                  </div>
                                )}
                                {q.generatedExplanation.confusions.length > 0 && (
                                  <div className="rounded-lg border bg-slate-50 p-3">
                                    <div className="mb-1 text-xs font-semibold text-slate-700">易混成对辨析</div>
                                    <div className="space-y-1 text-xs leading-5 text-slate-600">
                                      {q.generatedExplanation.confusions.map((item, itemIndex) => <p key={itemIndex}>{item}</p>)}
                                    </div>
                                  </div>
                                )}
                                {(q.generatedExplanation.highlights.absoluteWords.length > 0 || q.generatedExplanation.highlights.keywords.length > 0) && (
                                  <div className="rounded-lg border bg-slate-50 p-3 md:col-span-2">
                                    <div className="mb-2 text-xs font-semibold text-slate-700">绝对词与关键词高亮</div>
                                    <div className="flex flex-wrap gap-2">
                                      {q.generatedExplanation.highlights.absoluteWords.map(word => (
                                        <Badge key={`abs-${word}`} variant="outline" className="border-red-200 bg-red-50 text-red-700">{word}</Badge>
                                      ))}
                                      {q.generatedExplanation.highlights.keywords.map(word => (
                                        <Badge key={`kw-${word}`} variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">{word}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
                {!uploadedPaper?.questions?.length && (
                  <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed bg-white p-8 text-center shadow-sm">
                    <div className="max-w-md space-y-3">
                      <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">等待解析草稿</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          上传 Word/TXT/HTML，或在上方粘贴试卷文本并点击解析。解析结果会在这里进入审核台，可补答案、解析和知识点后再创建套卷。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="shrink-0 border-t bg-white px-6 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.06)]">
            <div className="mr-auto hidden items-center gap-4 text-xs text-muted-foreground md:flex">
              {paperCreationMode === 'select' ? (
                <span>已选择 {selectedQuestions.size} 道题</span>
              ) : (
                <span>草稿 {uploadedPaperQuality.total} 道，可入库 {uploadedPaperQuality.ready} 道</span>
              )}
              {paperCreationMode === 'upload' && (
                <>
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={importReadyOnly}
                      onChange={(e) => setImportReadyOnly(e.target.checked)}
                    />
                    只导入可入库题
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={skipDuplicateDrafts}
                      onChange={(e) => setSkipDuplicateDrafts(e.target.checked)}
                    />
                    跳过疑似重复草稿
                  </label>
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setShowPaperDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreatePaper}
              disabled={
                !paperFormData.name || 
                (paperCreationMode === 'select' && selectedQuestions.size === 0) ||
                (paperCreationMode === 'upload' && !uploadedPaper?.questions?.length)
              }
            >
              <Check className="h-4 w-4 mr-1" />
              创建套卷
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <Image
                src={previewImage}
                alt="预览图片"
                width={1280}
                height={720}
                unoptimized
                className="max-h-[90vh] max-w-full rounded-lg object-contain"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
