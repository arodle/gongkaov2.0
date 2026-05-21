'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import type { KnowledgeNode, PracticeSet, PracticeQuestion, QuestionBankItem, NodeType } from '@/lib/types';
import { useAppState } from '@/lib/store';
import { createId, SAMPLE_MIND_MAP } from '@/lib/sample-data';
import { Upload, Download, FileText, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// --- Find angle path in mind map ---
function findAnglePath(root: KnowledgeNode, angleId: string): string | null {
  function traverse(node: KnowledgeNode, parts: string[]): string | null {
    const currentPath = [...parts, node.name];
    if (node.id === angleId) return currentPath.join(' / ');
    for (const child of node.children) {
      const found = traverse(child, currentPath);
      if (found) return found;
    }
    return null;
  }
  return traverse(root, []);
}

// --- Mind Map Text Format Parser ---
// Supports: name, {content:...}, {@annotation}, {[img]url}
function parseMindMapText(text: string): KnowledgeNode {
  const lines = text.split('\n');
  let stack: Array<{ node: KnowledgeNode; indent: number }> = [];
  let root: KnowledgeNode | null = null;

  function getNodeType(depth: number): NodeType {
    switch (depth) {
      case 0: return 'subject';
      case 1: return 'knowledge';
      case 2: return 'subknowledge';
      default: return 'angle';
    }
  }

  function parseNodeMeta(content: string): {
    name: string;
    contentDesc?: string;
    annotation?: string;
    images?: string[];
  } {
    let name = content;
    let contentDesc: string | undefined;
    let annotation: string | undefined;
    const images: string[] = [];

    // Extract {content:...}
    const contentMatch = name.match(/\{content:(.+?)\}/);
    if (contentMatch) {
      contentDesc = contentMatch[1];
      name = name.replace(contentMatch[0], '').trim();
    }

    // Extract {@annotation}
    const annotationMatch = name.match(/\{@(.+?)\}/);
    if (annotationMatch) {
      annotation = annotationMatch[1];
      name = name.replace(annotationMatch[0], '').trim();
    }

    // Extract {[img]url} (can be multiple)
    const imgRegex = /\{\[img\](.+?)\}/g;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(name)) !== null) {
      images.push(imgMatch[1]);
    }
    name = name.replace(/\{\[img\].+?\}/g, '').trim();

    return { name, contentDesc, annotation, images: images.length > 0 ? images : undefined };
  }

  for (const line of lines) {
    const indent = line.search(/\S/);
    if (indent === -1) continue; // Skip empty lines
    const rawContent = line.trim();
    if (!rawContent) continue;

    // Check if it's a question line: [Q]content|A:opt|B:opt|Ans:X|Exp:...
    const questionMatch = rawContent.match(/^\[Q\](.+?)\|(.+)$/);

    if (questionMatch) {
      const parts = questionMatch[2].split('|');
      const qContent = questionMatch[1];
      const options: Array<{ label: string; text: string }> = [];
      let correctAnswer = '';
      let explanation = '';

      for (const part of parts) {
        const optMatch = part.match(/^([A-D]):(.+)$/);
        if (optMatch) {
          options.push({ label: optMatch[1], text: optMatch[2] });
        } else if (part.startsWith('Ans:')) {
          correctAnswer = part.slice(4);
        } else if (part.startsWith('Exp:')) {
          explanation = part.slice(4);
        }
      }

      const question = {
        id: createId('q'),
        content: qContent,
        options,
        correctAnswer,
        explanation,
      };

      // Add question to the parent node
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        parent.node.questions.push(question);
      }
      continue;
    }

    // Parse node meta (content, annotation, images)
    const meta = parseNodeMeta(rawContent);

    const node: KnowledgeNode = {
      id: createId('node'),
      name: meta.name,
      type: getNodeType(Math.floor(indent / 2)),
      children: [],
      questions: [],
      content: meta.contentDesc,
      annotation: meta.annotation,
      images: meta.images,
    };

    if (!root) {
      root = node;
      stack = [{ node, indent }];
    } else {
      // Find parent: the last node with less indentation
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      parent.node.children.push(node);
      stack.push({ node, indent });
    }
  }

  return root || SAMPLE_MIND_MAP;
}

function serializeMindMapText(node: KnowledgeNode, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let line = prefix + node.name;

  // Append content, annotation, images on same line
  if (node.content) {
    line += ` {content:${node.content}}`;
  }
  if (node.annotation) {
    line += ` {@${node.annotation}}`;
  }
  if (node.images && node.images.length > 0) {
    for (const imgUrl of node.images) {
      line += ` {[img]${imgUrl}}`;
    }
  }

  let result = line + '\n';

  for (const q of node.questions) {
    const optStr = q.options.map((o) => `${o.label}:${o.text}`).join('|');
    result += `${prefix}  [Q]${q.content}|${optStr}|Ans:${q.correctAnswer}|Exp:${q.explanation}\n`;
  }

  for (const child of node.children) {
    result += serializeMindMapText(child, indent + 1);
  }

  return result;
}

// --- Auto-Indent Textarea ---
function AutoIndentTextarea({
  value,
  onChange,
  rows,
  className,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  rows: number;
  className?: string;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Enter: maintain current indentation
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const beforeCursor = value.substring(0, start);

        // Find the indentation of the current line
        const lastNewline = beforeCursor.lastIndexOf('\n');
        const currentLine = beforeCursor.substring(lastNewline + 1);
        const indentMatch = currentLine.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1] : '';

        // If the current line has content (is a node), add one extra indent level for children
        const lineContent = currentLine.trim();
        let newIndent = currentIndent;
        if (lineContent && !lineContent.startsWith('[Q]')) {
          newIndent = currentIndent + '  '; // Add 2 spaces for child level
        }

        const newValue = value.substring(0, start) + '\n' + newIndent + value.substring(end);
        onChange(newValue);

        // Restore cursor position after React re-renders
        requestAnimationFrame(() => {
          const newCursorPos = start + 1 + newIndent.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        });
      }

      // Tab: indent 2 spaces
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        });
      }

      // Shift+Tab: remove 2 spaces of indentation
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const beforeCursor = value.substring(0, start);
        const lastNewline = beforeCursor.lastIndexOf('\n');
        const lineStart = lastNewline + 1;
        const lineContent = value.substring(lineStart);
        if (lineContent.startsWith('  ')) {
          const newValue = value.substring(0, lineStart) + lineContent.substring(2);
          onChange(newValue);
          const newCursorPos = Math.max(lineStart, start - 2);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(newCursorPos, newCursorPos);
          });
        }
      }
    },
    [value, onChange],
  );

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={className}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
    />
  );
}

// --- Practice Set Text Parser ---
function parsePracticeSetText(text: string, mindMap: KnowledgeNode): PracticeSet {
  const questions: PracticeQuestion[] = [];
  const blocks = text.split(/\n(?=\d+[.、)])/).filter((b) => b.trim());

  const allAnglesMemo: Array<{ id: string; name: string }> = [];
  function collectAngles(node: KnowledgeNode): void {
    if (node.type === 'angle') {
      allAnglesMemo.push({ id: node.id, name: node.name });
    }
    node.children.forEach(collectAngles);
  }
  collectAngles(mindMap);

  function autoMatchAngle(questionText: string): { id: string; name: string } {
    for (const angle of allAnglesMemo) {
      if (questionText.includes(angle.name) || angle.name.split('').some((ch) => questionText.includes(ch) && ch.length > 1)) {
        return angle;
      }
    }

    // Keyword matching
    const keywordMap: Record<string, string> = {
      '速度': '行程问题', '公里': '行程问题', '相遇': '行程问题', '追及': '行程问题',
      '工程': '工程问题', '完成': '工程问题', '单独做': '工程问题',
      '增长': '同比/环比增长', '同比': '同比/环比增长', '环比': '同比/环比增长',
      '宪法': '宪法', '法律': '宪法',
      '习近平': '习近平新时代中国特色社会主义思想', '中国特色': '习近平新时代中国特色社会主义思想',
      '填空': '实词辨析', '成语': '成语辨析',
      '主旨': '主旨概括题', '概括': '主旨概括题',
      '意图': '意图判断题',
      '削弱': '削弱论证', '论证': '削弱论证',
      '图形': '位置规律', '平移': '位置规律',
    };

    for (const [keyword, angleName] of Object.entries(keywordMap)) {
      if (questionText.includes(keyword)) {
        const found = allAnglesMemo.find((a) => a.name === angleName);
        if (found) return found;
      }
    }

    return { id: 'unmatched', name: '未匹配' };
  }

  for (const block of blocks) {
    const lines = block.trim().split('\n').filter((l) => l.trim());
    if (lines.length < 2) continue;

    const contentLine = lines[0].replace(/^\d+[.、)]\s*/, '');
    const options: Array<{ label: string; text: string }> = [];
    let correctAnswer = '';
    let explanation = '';

    for (const line of lines.slice(1)) {
      const optMatch = line.match(/^([A-D])[.、:)]\s*(.+)/);
      if (optMatch) {
        options.push({ label: optMatch[1], text: optMatch[2].trim() });
      } else if (line.startsWith('答案') || line.startsWith('Ans')) {
        const ansMatch = line.match(/[A-D]/);
        if (ansMatch) correctAnswer = ansMatch[0];
      } else if (line.startsWith('解析') || line.startsWith('Exp')) {
        explanation = line.replace(/^(解析|Exp)[：:]\s*/, '');
      }
    }

    if (options.length > 0 && correctAnswer) {
      const angle = autoMatchAngle(contentLine);
      questions.push({
        id: createId('pq'),
        content: contentLine,
        options,
        correctAnswer,
        explanation,
        linkedAngleId: angle.id,
        linkedAngleName: angle.name,
      });
    }
  }

  return {
    id: createId('ps'),
    name: `导入套题 ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    questions,
  };
}

// --- Import Export Panel ---
export function ImportExportPanel() {
  const { state, dispatch } = useAppState();
  const [mindMapText, setMindMapText] = useState(() => serializeMindMapText(state.mindMap));
  const [practiceText, setPracticeText] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [practiceDialogOpen, setPracticeDialogOpen] = useState(false);

  const handleImportMindMap = useCallback(() => {
    try {
      const parsed = parseMindMapText(mindMapText);
      dispatch({ type: 'SET_MIND_MAP', payload: parsed });
      setImportDialogOpen(false);
    } catch {
      alert('解析失败，请检查格式');
    }
  }, [mindMapText, dispatch]);

  const handleSaveMindMapText = useCallback(() => {
    try {
      const parsed = parseMindMapText(mindMapText);
      dispatch({ type: 'SET_MIND_MAP', payload: parsed });
      setEditDialogOpen(false);
    } catch {
      alert('解析失败，请检查格式');
    }
  }, [mindMapText, dispatch]);

  const handleImportPractice = useCallback(() => {
    try {
      const parsed = parsePracticeSetText(practiceText, state.mindMap);
      if (parsed.questions.length > 0) {
        dispatch({ type: 'ADD_PRACTICE_SET', payload: parsed });
        // Also add questions to question bank
        const bankItems: QuestionBankItem[] = parsed.questions.map((q) => {
          // Find knowledge path for this angle
          const anglePath = findAnglePath(state.mindMap, q.linkedAngleId);
          return {
            id: `qb_from_ps_${q.id}`,
            content: q.content,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            linkedAngleId: q.linkedAngleId,
            linkedAngleName: q.linkedAngleName,
            knowledgePath: anglePath || q.linkedAngleName,
            source: 'upload',
            createdAt: new Date().toISOString(),
          };
        });
        dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: bankItems });
        setPracticeText('');
        setPracticeDialogOpen(false);
      } else {
        alert('未解析出有效题目，请检查格式');
      }
    } catch {
      alert('解析失败，请检查格式');
    }
  }, [practiceText, state.mindMap, dispatch]);

  const handleExportJSON = useCallback(() => {
    const data = {
      mindMap: state.mindMap,
      practiceSets: state.practiceSets,
      answerRecords: state.answerRecords,
      questionBank: state.questionBank,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'civil-exam-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImportJSON = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.mindMap) {
            dispatch({ type: 'SET_MIND_MAP', payload: data.mindMap });
          }
          if (data.practiceSets) {
            for (const ps of data.practiceSets) {
              dispatch({ type: 'ADD_PRACTICE_SET', payload: ps });
              // Add questions to bank
              const bankItems: QuestionBankItem[] = ps.questions.map((q: PracticeQuestion) => ({
                id: `qb_json_${q.id}_${Date.now()}`,
                content: q.content,
                options: q.options,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                linkedAngleId: q.linkedAngleId,
                linkedAngleName: q.linkedAngleName,
                knowledgePath: findAnglePath(state.mindMap, q.linkedAngleId) || q.linkedAngleName,
                source: 'upload',
                createdAt: new Date().toISOString(),
              }));
              dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: bankItems });
            }
          }
          if (data.questionBank && Array.isArray(data.questionBank)) {
            dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: data.questionBank });
          }
        } catch {
          alert('JSON 解析失败');
        }
      };
      reader.readAsText(file);
    },
    [dispatch],
  );

  const handleResetData = useCallback(() => {
    if (confirm('确定要重置所有数据为初始状态吗？此操作不可撤销。')) {
      localStorage.removeItem('civil-exam-app-state');
      window.location.reload();
    }
  }, []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">数据管理</h3>

      {/* Export */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleExportJSON}
        >
          <Download className="h-4 w-4" />
          导出全部数据 (JSON)
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => {
            const text = serializeMindMapText(state.mindMap);
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindmap.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <FileText className="h-4 w-4" />
          导出思维导图 (文本)
        </Button>
      </div>

      {/* Import JSON */}
      <div>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
            <span>
              <Upload className="h-4 w-4" />
              导入 JSON 数据
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportJSON}
              />
            </span>
          </Button>
        </label>
      </div>

      {/* Import Mind Map Text */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2">
            <FileText className="h-4 w-4" />
            导入思维导图 (文本)
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入思维导图</DialogTitle>
            <DialogDescription className="sr-only">通过文本格式导入思维导图数据</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>格式说明：缩进表示层级（每级2空格），支持以下扩展语法：</p>
              <p>• <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">节点名称</code> — 普通知识点</p>
              <p>• <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">节点名称 {'{content:描述内容}'}</code> — 添加知识点内容</p>
              <p>• <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">节点名称 {'{@注释备注}'}</code> — 添加注释</p>
              <p>• <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">节点名称 {'{[img]图片URL}'}</code> — 添加图片</p>
              <p>• <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">[Q]题目|A:选项|B:选项|Ans:答案|Exp:解析</code> — 添加真题</p>
            </div>
            <AutoIndentTextarea
              value={mindMapText}
              onChange={setMindMapText}
              rows={15}
              className="w-full border rounded-md px-3 py-2 font-mono text-xs resize-y dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
              placeholder={"行测 {content:行政职业能力测验} {@120分钟130-135题}\n  言语理解与表达 {content:考查语言文字运用能力}\n    片段阅读\n      主旨概括题\n        [Q]题目内容|A:选项A|B:选项B|Ans:A|Exp:解析"}
            />
            <Button onClick={handleImportMindMap}>确认导入</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Text Editor */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2">
            <Save className="h-4 w-4" />
            文本编辑模式
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>编辑思维导图</DialogTitle>
            <DialogDescription className="sr-only">以文本方式编辑思维导图内容</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>直接编辑文本修改思维导图。支持自动缩进：Enter 维持当前缩进级别，Tab 增加2空格，Shift+Tab 减少缩进。</p>
              <p>扩展语法：<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{content:内容}'}</code> 知识点内容、<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{@注释}'}</code> 注释、<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{[img]URL}'}</code> 图片</p>
            </div>
            <ScrollArea className="h-[50vh]">
              <AutoIndentTextarea
                value={mindMapText}
                onChange={setMindMapText}
                rows={30}
                className="w-full border rounded-md px-3 py-2 font-mono text-xs resize-y dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
              />
            </ScrollArea>
            <div className="flex gap-2">
              <Button onClick={handleSaveMindMapText}>保存修改</Button>
              <Button
                variant="outline"
                onClick={() => setMindMapText(serializeMindMapText(state.mindMap))}
              >
                重置为当前数据
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Practice Set */}
      <Dialog open={practiceDialogOpen} onOpenChange={setPracticeDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2">
            <Upload className="h-4 w-4" />
            上传套题
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>上传套题与答案</DialogTitle>
            <DialogDescription className="sr-only">上传套题与答案信息，系统自动匹配考点</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              格式：题目编号开头，每行一个选项，答案行以&quot;答案&quot;开头，解析行以&quot;解析&quot;开头。系统将自动匹配知识点考点。
            </p>
            <AutoIndentTextarea
              value={practiceText}
              onChange={setPracticeText}
              rows={15}
              className="w-full border rounded-md px-3 py-2 font-mono text-xs resize-y dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
              placeholder={"1. 题目内容\nA. 选项A\nB. 选项B\nC. 选项C\nD. 选项D\n答案：A\n解析：解析内容\n\n2. 另一道题..."}
            />
            <Button onClick={handleImportPractice}>确认导入</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset */}
      <hr className="my-2" />
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-red-500 hover:text-red-600"
        onClick={handleResetData}
      >
        <RotateCcw className="h-4 w-4" />
        重置所有数据
      </Button>
    </div>
  );
}

// --- Practice Set Angle Matcher ---
export function AngleMatcher({
  practiceSets,
  onUpdatePracticeSet,
  mindMap,
}: {
  practiceSets: PracticeSet[];
  onUpdatePracticeSet: (ps: PracticeSet) => void;
  mindMap: KnowledgeNode;
}) {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);

  const selectedSet = practiceSets.find((ps) => ps.id === selectedSetId);

  const allAngles = useMemo(() => {
    const angles: Array<{ id: string; name: string }> = [];
    function collectAngles(node: KnowledgeNode): void {
      if (node.type === 'angle') {
        angles.push({ id: node.id, name: node.name });
      }
      node.children.forEach(collectAngles);
    }
    collectAngles(mindMap);
    return angles;
  }, [mindMap]);

  const handleAngleChange = useCallback(
    (questionId: string, angleId: string) => {
      if (!selectedSet) return;
      const angle = allAngles.find((a) => a.id === angleId);
      const updated = {
        ...selectedSet,
        questions: selectedSet.questions.map((q) =>
          q.id === questionId
            ? { ...q, linkedAngleId: angleId, linkedAngleName: angle?.name || '未知' }
            : q,
        ),
      };
      onUpdatePracticeSet(updated);
    },
    [selectedSet, allAngles, onUpdatePracticeSet],
  );

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">考点关联管理</h3>

      <select
        className="w-full border rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
        value={selectedSetId || ''}
        onChange={(e) => setSelectedSetId(e.target.value)}
      >
        <option value="">选择套题</option>
        {practiceSets.map((ps) => (
          <option key={ps.id} value={ps.id}>
            {ps.name} ({ps.questions.length}题)
          </option>
        ))}
      </select>

      {selectedSet && (
        <div className="space-y-3">
          {selectedSet.questions.map((q) => (
            <div
              key={q.id}
              className="bg-white dark:bg-gray-800 rounded-lg border p-3 space-y-2"
            >
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                {q.content}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">关联考点:</span>
                <select
                  className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600"
                  value={q.linkedAngleId}
                  onChange={(e) => handleAngleChange(q.id, e.target.value)}
                >
                  <option value="unmatched">未匹配</option>
                  {allAngles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
