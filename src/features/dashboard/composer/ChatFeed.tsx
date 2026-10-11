import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Loader2,
  User,
  Bot,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { FeedMessage, ReasoningBlock } from './types';

interface ChatFeedProps {
  messages: FeedMessage[];
  onApplyDiff?: (code: string, filename?: string) => void;
  className?: string;
}

function extractCodeBlocks(content: string): { lang: string; code: string; filename?: string }[] {
  const blocks: { lang: string; code: string; filename?: string }[] = [];
  const re = /```([\w.+-]*)?(?:\s*\/\/\s*(.+?))?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const lang = (m[1] || '').trim();
    const maybePath = (m[2] || '').trim();
    const code = m[3] || '';
    // Prefer path from first line comment like // src/foo.ts
    let filename = maybePath || undefined;
    const firstLine = code.split('\n')[0]?.trim();
    if (!filename && firstLine?.startsWith('//') && firstLine.includes('/')) {
      filename = firstLine.replace(/^\/\/\s*/, '').trim();
    }
    if (!filename && firstLine?.startsWith('#') && firstLine.includes('/')) {
      filename = firstLine.replace(/^#\s*/, '').trim();
    }
    blocks.push({ lang, code: code.replace(/^\/\/.*?\n/, '').replace(/^#.*?\n/, ''), filename });
  }
  return blocks;
}

function ReasoningAccordion({ blocks }: { blocks: ReasoningBlock[] }) {
  const [open, setOpen] = useState(true);
  const done = blocks.every((b) => b.status === 'done' || b.status === 'error');
  const active = blocks.find((b) => b.status === 'active');

  return (
    <div className="mb-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 dark:text-[#8B949E] hover:bg-slate-100/80 dark:hover:bg-white/5 cursor-pointer"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {!done && active ? (
          <>
            <Loader2 size={12} className="animate-spin text-blue-500" />
            <span className="font-medium text-slate-800 dark:text-slate-200">{active.title}</span>
          </>
        ) : (
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {done ? 'Reasoning complete' : 'Reasoning...'}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-200/60 dark:border-white/5">
          {blocks.map((b) => (
            <div key={b.id} className="pt-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                {b.status === 'active' && <Loader2 size={11} className="animate-spin text-blue-500" />}
                {b.status === 'done' && <Check size={11} className="text-emerald-500" />}
                {b.title}
                {typeof b.durationSeconds === 'number' && (
                  <span className="font-normal text-slate-400 ml-1">{b.durationSeconds.toFixed(1)}s</span>
                )}
              </div>
              <pre className="text-[11px] text-slate-500 dark:text-[#8B949E] whitespace-pre-wrap font-sans leading-relaxed">
                {b.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeBlock({
  code,
  lang,
  filename,
  onApply,
}: {
  code: string;
  lang?: string;
  filename?: string;
  onApply?: (code: string, filename?: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="my-3 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-white/5 text-[11px]">
        <div className="flex items-center gap-1.5 text-[#8B949E]">
          <FileCode2 size={12} />
          <span>{filename || lang || 'code'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            className="px-2 py-0.5 rounded text-[#8B949E] hover:text-white hover:bg-white/10 cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onApply && (
            <button
              type="button"
              onClick={() => onApply(code, filename)}
              className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-medium cursor-pointer"
            >
              Apply Diff
            </button>
          )}
        </div>
      </div>
      <pre className="p-3 text-[12px] leading-relaxed overflow-x-auto font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MessageBody({
  content,
  isStreaming,
  onApplyDiff,
}: {
  content: string;
  isStreaming?: boolean;
  onApplyDiff?: (code: string, filename?: string) => void;
}) {
  // Split markdown around fenced code for custom rendering
  const parts: React.ReactNode[] = [];
  const re = /```([\w.+-]*)?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      const md = content.slice(last, m.index);
      parts.push(
        <div key={`md-${key++}`} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:hidden">
          <ReactMarkdown>{md}</ReactMarkdown>
        </div>
      );
    }
    const lang = (m[1] || '').trim();
    let code = m[2] || '';
    let filename: string | undefined;
    const first = code.split('\n')[0]?.trim();
    if (first?.startsWith('//') && /[\/\\]/.test(first)) {
      filename = first.replace(/^\/\/\s*/, '');
      code = code.split('\n').slice(1).join('\n');
    } else if (first?.startsWith('#') && /[\/\\]/.test(first)) {
      filename = first.replace(/^#\s*/, '');
      code = code.split('\n').slice(1).join('\n');
    }
    parts.push(
      <CodeBlock key={`code-${key++}`} code={code} lang={lang} filename={filename} onApply={onApplyDiff} />
    );
    last = m.index + m[0].length;
  }

  if (last < content.length) {
    const md = content.slice(last);
    parts.push(
      <div key={`md-${key++}`} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2">
        <ReactMarkdown>{md}</ReactMarkdown>
        {isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-blue-500 animate-pulse align-middle" />}
      </div>
    );
  } else if (isStreaming && parts.length === 0) {
    parts.push(
      <span key="cursor" className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse" />
    );
  }

  return <div className="text-sm text-slate-800 dark:text-[#E6EDF3] leading-relaxed">{parts}</div>;
}

export function ChatFeed({ messages, onApplyDiff, className = '' }: ChatFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full text-sm text-slate-400 ${className}`}>
        Start a conversation with FLOAT
      </div>
    );
  }

  return (
    <div className={`px-4 py-6 space-y-6 max-w-3xl mx-auto w-full ${className}`}>
      {messages.map((msg) => (
        <div key={msg.id} className="flex gap-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              msg.role === 'user'
                ? 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200'
                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
            }`}
          >
            {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-[#8B949E] mb-1.5 uppercase tracking-wide">
              {msg.role === 'user' ? 'You' : 'FLOAT'}
            </div>

            {msg.pills && msg.pills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {msg.pills.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#8B949E] border border-slate-200/80 dark:border-white/10"
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            )}

            {msg.reasoningBlocks && msg.reasoningBlocks.length > 0 && (
              <ReasoningAccordion blocks={msg.reasoningBlocks} />
            )}

            <MessageBody
              content={msg.content}
              isStreaming={msg.isStreaming}
              onApplyDiff={onApplyDiff}
            />

            {msg.error && (
              <div className="mt-2 text-xs text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded-lg">
                {msg.error}
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
