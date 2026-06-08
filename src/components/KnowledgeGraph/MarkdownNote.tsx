'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import { cn } from '@/lib/utils';

interface MarkdownNoteProps {
  children?: string | null;
  className?: string;
}

export function MarkdownNote({ children, className }: MarkdownNoteProps) {
  return (
    <div className={cn('prose prose-slate prose-sm max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          img: ({ className: imageClassName, alt, ...props }) => (
            <img
              {...props}
              alt={alt || ''}
              loading="lazy"
              className={cn(
                'my-3 max-h-72 w-auto rounded-md border border-slate-200 object-contain shadow-sm',
                imageClassName,
              )}
            />
          ),
          mark: ({ children: markChildren }) => (
            <mark className="rounded bg-amber-200/75 px-0.5 text-slate-950">
              {markChildren}
            </mark>
          ),
          u: ({ children: underlineChildren }) => (
            <u className="decoration-blue-500 decoration-2 underline-offset-4">
              {underlineChildren}
            </u>
          ),
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
