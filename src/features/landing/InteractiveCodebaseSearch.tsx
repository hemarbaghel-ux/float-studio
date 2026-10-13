import React, { useState } from 'react';
import { Search, FileCode, BookOpen, Globe, GitBranch, Terminal, Hash, ChevronRight, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ContextTag {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
  sampleMatch: string;
  snippet: string;
}

const CONTEXT_TAGS: ContextTag[] = [
  {
    id: 'files',
    label: '@Files',
    icon: FileCode,
    description: 'Pin specific source files directly into prompt token context',
    sampleMatch: 'src/lib/authSession.ts:42',
    snippet: 'export function validateSessionToken(token: string) { ... }'
  },
  {
    id: 'docs',
    label: '@Docs',
    icon: BookOpen,
    description: 'Index third-party documentation or company wikis on demand',
    sampleMatch: 'docs.stripe.com/api/payment_intents',
    snippet: 'Stripe API Reference: Handling asynchronous webhook confirmations'
  },
  {
    id: 'git',
    label: '@Git',
    icon: GitBranch,
    description: 'Inspect commit history, branch diffs, and uncommitted working tree',
    sampleMatch: 'git diff origin/main..HEAD',
    snippet: '14 files changed, 280 insertions(+), 42 deletions(-)'
  },
  {
    id: 'web',
    label: '@Web',
    icon: Globe,
    description: 'Live real-time search across GitHub issues, StackOverflow, and npm',
    sampleMatch: 'github.com/vercel/next.js/issues/49210',
    snippet: 'Resolved: React Server Component streaming payload deserialization'
  },
  {
    id: 'terminal',
    label: '@Terminal',
    icon: Terminal,
    description: 'Feed current terminal console logs and compiler stderr directly to agent',
    sampleMatch: 'stderr: TypeScript TS2322 in PageHeader.tsx:18',
    snippet: 'Type "string | undefined" is not assignable to type "string"'
  }
];

export function InteractiveCodebaseSearch() {
  const [selectedTag, setSelectedTag] = useState<string>('files');
  const [searchQuery, setSearchQuery] = useState('@Files stripe webhook handler');

  const activeTag = CONTEXT_TAGS.find(t => t.id === selectedTag) || CONTEXT_TAGS[0];

  const handleSelectTag = (tag: ContextTag) => {
    setSelectedTag(tag.id);
    setSearchQuery(`${tag.label} ${tag.id === 'git' ? 'diff origin/main' : tag.id === 'docs' ? 'tanstack query' : tag.id === 'web' ? 'react 19 hydration' : 'auth middleware'}`);
  };

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-[#0E0F14]/90 backdrop-blur-xl shadow-2xl overflow-hidden text-left">
      {/* Context Tags Bar */}
      <div className="p-4 bg-[#13141B] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Semantic Symbols:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {CONTEXT_TAGS.map((tag) => {
              const Icon = tag.icon;
              const isSelected = tag.id === selectedTag;
              return (
                <button
                  key={tag.id}
                  onClick={() => handleSelectTag(tag)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer",
                    isSelected
                      ? "bg-violet-500/20 text-violet-300 border border-violet-500/40 font-semibold"
                      : "bg-white/[0.03] text-zinc-400 hover:text-white border border-white/[0.06] hover:bg-white/[0.06]"
                  )}
                >
                  <Icon size={12} className={isSelected ? "text-violet-400" : "text-zinc-500"} />
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
          Instant Grep: 1.2M lines in 14ms
        </span>
      </div>

      {/* Interactive Search Input Box */}
      <div className="p-4 border-b border-white/[0.06] bg-[#0B0C10]">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
          <Search size={14} className="text-violet-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-white focus:outline-none placeholder-zinc-500 font-mono text-xs"
            placeholder="Type @ to search symbols, files, docs, or web..."
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 text-[10px] font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Results View */}
      <div className="p-5 bg-[#0B0C10] space-y-3">
        <div className="text-xs font-mono text-zinc-400 flex items-center justify-between">
          <span>Active Context Provider: <strong className="text-white">{activeTag.label}</strong></span>
          <span className="text-emerald-400 text-[11px]">Vector Rank: 0.982</span>
        </div>

        {/* Code Snippet Result Card */}
        <div className="rounded-xl border border-white/[0.06] bg-[#12131A] p-4 text-xs font-mono space-y-2">
          <div className="flex items-center justify-between text-zinc-400 border-b border-white/[0.06] pb-2">
            <span className="text-violet-400 flex items-center gap-1.5">
              <FileCode size={13} />
              <span>{activeTag.sampleMatch}</span>
            </span>
            <span className="text-[10px] text-zinc-500">Indexed (100% up-to-date)</span>
          </div>

          <p className="text-zinc-300 leading-relaxed pt-1">
            {activeTag.snippet}
          </p>

          <p className="text-zinc-500 text-[11px] pt-1 border-t border-white/[0.04]">
            {activeTag.description}
          </p>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="px-4 py-2.5 bg-[#101117] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400 font-mono">
        <span>Embeddings: Local ONNX + Server Semantic Index</span>
        <span className="text-zinc-500">Zero data retention</span>
      </div>
    </div>
  );
}
