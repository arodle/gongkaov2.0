'use client';

import React, { useEffect, useRef } from 'react';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeight?: string;
}

const TOOL_BUTTON_CLASS = 'h-8 w-8 shrink-0';

const MarkdownHighlight = Highlight.extend({
  markdownTokenizer: {
    name: 'highlight',
    level: 'inline',
    start: (source) => source.indexOf('=='),
    tokenize: (source, _tokens, lexer) => {
      const match = /^==([^=]+)==/.exec(source);
      if (!match) return undefined;
      return {
        type: 'highlight',
        raw: match[0],
        text: match[1],
        tokens: lexer.inlineTokens(match[1]),
      };
    },
  },
  parseMarkdown: (token, helpers) => (
    helpers.applyMark('highlight', helpers.parseInline(token.tokens || []))
  ),
  renderMarkdown: (node, helpers) => `==${helpers.renderChildren(node.content || [])}==`,
});

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function RichTextEditor({ value, onChange, className, minHeight = '12rem' }: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastEmittedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
        },
      }),
      MarkdownHighlight,
      Image.configure({ allowBase64: true }),
      Placeholder.configure({
        placeholder: '直接输入正文，选中文字后可使用上方工具栏排版……',
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: true,
        },
      }),
    ],
    content: value || '',
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'tiptap min-h-full px-3 py-3 text-sm leading-6 text-slate-800 outline-none',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = currentEditor.getMarkdown();
      lastEmittedValueRef.current = nextValue;
      onChangeRef.current(nextValue);
    },
  });

  useEffect(() => {
    if (!editor || value === lastEmittedValueRef.current) return;
    const currentValue = editor.getMarkdown();
    if (value === currentValue) {
      lastEmittedValueRef.current = value;
      return;
    }
    editor.commands.setContent(value || '', { contentType: 'markdown', emitUpdate: false });
    lastEmittedValueRef.current = value;
  }, [editor, value]);

  const insertImages = async (files: FileList | File[]) => {
    if (!editor) return;
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    if (imageFiles.some(file => file.size > 2 * 1024 * 1024)) {
      toast.warning('图片过大，请先压缩到 2MB 以内再插入');
      return;
    }

    try {
      const images = await Promise.all(imageFiles.map(async file => ({
        src: await readFileAsDataUrl(file),
        alt: file.name || '图片',
      })));
      const chain = editor.chain().focus();
      images.forEach(image => chain.setImage(image));
      chain.run();
    } catch {
      toast.error('图片读取失败，请重试');
    }
  };

  const setLink = () => {
    if (!editor) return;
    const previousUrl = String(editor.getAttributes('link').href || '');
    const url = window.prompt('输入链接地址', previousUrl || 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  if (!editor) {
    return <div className={cn('animate-pulse bg-slate-50', className)} style={{ minHeight }} />;
  }

  return (
    <div className={cn('overflow-hidden rounded-md border border-slate-200 bg-white', className)}>
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-50/80 p-1.5">
        <select
          aria-label="段落样式"
          value={editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph'}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'h2') editor.chain().focus().setHeading({ level: 2 }).run();
            else if (value === 'h3') editor.chain().focus().setHeading({ level: 3 }).run();
            else editor.chain().focus().setParagraph().run();
          }}
          className="h-8 w-[5.5rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#a49aff]"
        >
          <option value="paragraph">正文</option>
          <option value="h2">标题</option>
          <option value="h3">小标题</option>
        </select>
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        <Button type="button" variant={editor.isActive('bold') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="加粗" title="加粗">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('italic') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体" title="斜体">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('underline') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="下划线" title="下划线">
          <Underline className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('strike') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="删除线" title="删除线">
          <Strikethrough className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('highlight') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleHighlight().run()} aria-label="高亮" title="高亮">
          <Highlighter className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        <Button type="button" variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="项目符号" title="项目符号">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="编号列表" title="编号列表">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="引用" title="引用">
          <Quote className="h-4 w-4" />
        </Button>
        <Button type="button" variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="icon" className={TOOL_BUTTON_CLASS} onClick={setLink} aria-label="链接" title="链接">
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={TOOL_BUTTON_CLASS} onClick={() => imageInputRef.current?.click()} aria-label="插入图片" title="插入图片">
          <ImagePlus className="h-4 w-4" />
        </Button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void insertImages(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        <Button type="button" variant="ghost" size="icon" className={TOOL_BUTTON_CLASS} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} aria-label="清除格式" title="清除格式">
          <Eraser className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={TOOL_BUTTON_CLASS} disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()} aria-label="撤销" title="撤销">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={TOOL_BUTTON_CLASS} disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()} aria-label="重做" title="重做">
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
      <div
        className={cn(
          'overflow-y-auto bg-white',
          '[&_.tiptap_p]:my-1.5 [&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:mt-4 [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-semibold',
          '[&_.tiptap_h3]:mb-1.5 [&_.tiptap_h3]:mt-3 [&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold',
          '[&_.tiptap_ul]:my-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:my-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6',
          '[&_.tiptap_blockquote]:my-2 [&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-[#b7e3ff] [&_.tiptap_blockquote]:bg-slate-50 [&_.tiptap_blockquote]:px-3 [&_.tiptap_blockquote]:py-1',
          '[&_.tiptap_mark]:rounded-sm [&_.tiptap_mark]:bg-[#ffccf1] [&_.tiptap_mark]:px-0.5',
          '[&_.tiptap_a]:text-blue-600 [&_.tiptap_a]:underline [&_.tiptap_img]:my-3 [&_.tiptap_img]:max-h-72 [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded-md [&_.tiptap_img]:border',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-slate-400 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
        )}
        style={{ minHeight, maxHeight: minHeight === '12rem' ? '24rem' : undefined }}
        onPasteCapture={(event) => {
          const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
          if (!files.length) return;
          event.preventDefault();
          void insertImages(files);
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
