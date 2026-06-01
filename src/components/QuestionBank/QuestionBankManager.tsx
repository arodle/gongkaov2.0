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
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  reference?: string;
}

interface UploadedPaperData {
  name?: string;
  description?: string;
  type?: 'real' | 'simulated';
  questions?: UploadedPaperQuestion[];
}

interface QuestionLinkLike {
  linkedAngleId?: string;
  linkedAngleName?: string;
  knowledgePath?: string;
}

function normalizeNodeId(id?: string | null) {
  if (!id) return '';
  return id.startsWith('mn_') ? id.slice(3) : id;
}

export function QuestionBankManager() {
  const { questionBank, nodes, addQuestion, updateQuestion, deleteQuestion, addExamPaper } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'real' | 'simulated'>('all');
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

  const resolveLinkedNode = useCallback((question: QuestionLinkLike) => {
    const normalizedId = normalizeNodeId(question.linkedAngleId);
    if (normalizedId) {
      const node = nodeLookup.byId.get(normalizedId) || nodeLookup.byId.get(`mn_${normalizedId}`);
      if (node) return node;
    }

    const path = question.knowledgePath?.trim();
    if (path) {
      const node = nodeLookup.byPath.get(path);
      if (node) return node;

      const lastName = path.split(/[》>\/]/).map(part => part.trim()).filter(Boolean).at(-1);
      if (lastName) {
        const byName = nodeLookup.byName.get(lastName);
        if (byName) return byName;
      }
    }

    const linkedName = question.linkedAngleName?.trim();
    return linkedName ? nodeLookup.byName.get(linkedName) : undefined;
  }, [nodeLookup]);

  const normalizeQuestionLink = useCallback(<T extends QuestionLinkLike>(question: T): T => {
    const linkedNode = resolveLinkedNode(question);
    if (!linkedNode) {
      return {
        ...question,
        linkedAngleId: normalizeNodeId(question.linkedAngleId),
      };
    }

    return {
      ...question,
      linkedAngleId: normalizeNodeId(linkedNode.id),
      linkedAngleName: linkedNode.name,
      knowledgePath: nodeLookup.pathById.get(linkedNode.id) || question.knowledgePath || linkedNode.name,
    };
  }, [nodeLookup.pathById, resolveLinkedNode]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, result]
        }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  }, []);

  const filteredQuestions = useMemo(() => {
    let result = questionBank;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        q => q.content.toLowerCase().includes(query) ||
          q.explanation.toLowerCase().includes(query)
      );
    }

    if (filterType !== 'all') {
      result = result.filter(q => q.type === filterType);
    }

    return result;
  }, [questionBank, searchQuery, filterType]);

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
    return Array.from(new Set(questionBank.map(q => q.examPaper).filter(Boolean) as string[])).sort();
  }, [questionBank]);

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
        examPaper: normalizedQuestion.examPaper || '',
      });
    } else {
      setEditingQuestion(null);
      setFormData(initialFormData);
    }
    setShowQuestionDialog(true);
  }, [normalizeQuestionLink]);

  const handleSaveQuestion = useCallback(async () => {
    if (!formData.content || !formData.correctAnswer) return;

    const questionData: QuestionBankItem = normalizeQuestionLink({
      id: editingQuestion?.id || `q_${Date.now()}`,
      content: formData.content,
      options: formData.options.filter(o => o.text),
      correctAnswer: formData.correctAnswer,
      explanation: formData.explanation,
      images: formData.images,
      linkedAngleId: formData.linkedAngleId,
      linkedAngleName: formData.linkedAngleName,
      knowledgePath: formData.knowledgePath,
      type: formData.type,
      source: formData.type,
      reference: formData.reference,
      examPaper: formData.examPaper.trim(),
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
    if (confirm('确定要删除这道题目吗？')) {
      deleteQuestion(id);
    }
  }, [deleteQuestion]);

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
    const examPaper = batchExamPaper.trim();
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
          data.forEach((item: QuestionBankItem) => {
            if (item.content && item.options && item.correctAnswer) {
              addQuestion(normalizeQuestionLink({
                ...item,
                id: item.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              }));
            }
          });
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

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let data: UploadedPaperData | undefined;
        
        if (file.name.endsWith('.json')) {
          data = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
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
        }
        
        if (!data) return;
        setUploadedPaper(data);
        
        // 自动填充表单
        if (data.name) {
          setPaperFormData({
            ...paperFormData,
            name: data.name,
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
  }, [paperFormData]);

  const handleCreatePaper = useCallback(() => {
    if (!paperFormData.name) return;
    
    let questionIds: string[] = [];
    const uploadedQuestions: QuestionBankItem[] = [];
    
    if (paperCreationMode === 'select') {
      if (selectedQuestions.size === 0) return;
      questionIds = Array.from(selectedQuestions);
    } else {
      // 上传模式：将题目添加到题库并记录ID
      if (!uploadedPaper?.questions?.length) {
        alert('请先上传套卷文件');
        return;
      }
      
      questionIds = [];
      
      uploadedPaper.questions.forEach((q) => {
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
          images: q.images || [],
          linkedAngleId: q.linkedAngleId || '',
          linkedAngleName: q.linkedAngleName || '',
          knowledgePath: q.knowledgePath || '',
          type: paperFormData.type,
          reference: q.reference || '',
          examPaper: paperFormData.name.trim(),
          source: 'upload',
          createdAt: new Date().toISOString(),
        });
        
        addQuestion(newQuestion);
        uploadedQuestions.push(newQuestion);
        questionIds.push(newQuestion.id);
      });
    }

    const selectedModeQuestions = paperCreationMode === 'select'
      ? questionBank
          .filter(question => questionIds.includes(question.id))
          .map(question => normalizeQuestionLink({
            ...question,
            type: paperFormData.type,
            source: paperFormData.type,
            examPaper: paperFormData.name.trim(),
          }))
      : [];

    selectedModeQuestions.forEach(updateQuestion);
    if (selectedModeQuestions.length > 0) syncQuestionsToNeon(selectedModeQuestions);
    if (uploadedQuestions.length > 0) syncQuestionsToNeon(uploadedQuestions);

    addExamPaper({
      id: `paper_${Date.now()}`,
      name: paperFormData.name,
      description: paperFormData.description,
      type: paperFormData.type,
      questions: questionIds,
      createdAt: new Date().toISOString(),
      completedCount: 0,
      avgScore: 0,
    });

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
  }, [paperFormData, selectedQuestions, paperCreationMode, uploadedPaper, addExamPaper, addQuestion, normalizeQuestionLink, questionBank, syncQuestionsToNeon, updateQuestion]);

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
  }), [questionBank, realQuestions, simulatedQuestions]);

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
                <span>筛选 {filteredQuestions.length}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto_auto]">
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
              onChange={(e) => setFilterType(e.target.value as 'all' | 'real' | 'simulated')}
              className="h-9 rounded-md border bg-white px-2 text-sm"
            >
              <option value="all">全部类型</option>
              <option value="real">真题</option>
              <option value="simulated">模拟题</option>
            </select>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-md border bg-white px-2 text-sm"
              aria-label="每页题目数量"
            >
              <option value={10}>10题/页</option>
              <option value={50}>50题/页</option>
              <option value={100}>100题/页</option>
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
              <Button size="sm" onClick={handleBatchApplyExamPaper} disabled={!batchExamPaper.trim()}>
                应用
              </Button>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>创建套卷</DialogTitle>
          </DialogHeader>
          
          {/* 标签页切换 */}
          <div className="flex border-b mb-4">
            <button
              onClick={() => {
                setPaperCreationMode('select');
                setUploadedPaper(null);
              }}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                paperCreationMode === 'select'
                  ? 'border-b-2 border-primary text-primary'
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
                'px-4 py-2 text-sm font-medium transition-colors',
                paperCreationMode === 'upload'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              上传整张套卷
            </button>
          </div>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="real">真题套卷</option>
                  <option value="simulated">模拟题套卷</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={paperFormData.description}
                onChange={(e) => setPaperFormData({ ...paperFormData, description: e.target.value })}
                placeholder="套卷描述..."
                rows={2}
              />
            </div>

            {/* 从题库选择模式 */}
            {paperCreationMode === 'select' && (
              <div className="space-y-2">
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
                <ScrollArea className="h-[300px] border rounded">
                  <div className="p-2 space-y-1">
                    {(paperFormData.type === 'real' ? realQuestions : simulatedQuestions).length > 0 ? (
                      (paperFormData.type === 'real' ? realQuestions : simulatedQuestions).map((question) => (
                        <div
                          key={question.id}
                          className={cn(
                            'p-2 rounded cursor-pointer transition-colors',
                            selectedQuestions.has(question.id)
                              ? 'bg-primary/10 border border-primary'
                              : 'hover:bg-muted'
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">上传套卷文件</label>
                  <div
                    onClick={() => paperInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
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
                        <p className="text-sm font-medium">点击上传套卷文件</p>
                        <p className="text-xs text-muted-foreground">
                          支持 JSON 或 CSV 格式
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={paperInputRef}
                    onChange={handlePaperUpload}
                    accept=".json,.csv"
                    className="hidden"
                  />
                </div>

                {/* 格式说明 */}
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
                  <p className="font-medium mb-1">JSON 格式示例：</p>
                  <pre className="text-xs overflow-x-auto">
                    {`{
  "name": "2024年国考真题",
  "type": "real",
  "description": "真题解析",
  "questions": [
    {
      "content": "题目内容",
      "options": [
        {"label": "A", "text": "选项A"},
        {"label": "B", "text": "选项B"},
        {"label": "C", "text": "选项C"},
        {"label": "D", "text": "选项D"}
      ],
      "correctAnswer": "A",
      "explanation": "解析内容",
      "reference": "题目出处"
    }
  ]
}`}
                  </pre>
                  <p className="font-medium mt-3 mb-1">CSV 格式示例：</p>
                  <pre className="text-xs overflow-x-auto">
                    题目内容,选项A,选项B,选项C,选项D,正确答案,解析,出处
                    1+1=?,1,2,3,4,B,1+1=2,数学题
                  </pre>
                </div>

                {/* 预览上传的题目 */}
                {!!uploadedPaper?.questions?.length && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">题目预览</label>
                    <ScrollArea className="h-[200px] border rounded">
                      <div className="p-2 space-y-2">
                        {uploadedPaper.questions?.map((q, idx) => (
                          <div key={idx} className="p-2 bg-muted rounded">
                            <p className="text-sm line-clamp-1">{idx + 1}. {q.content}</p>
                            <p className="text-xs text-muted-foreground">
                              正确答案: {q.correctAnswer}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
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
