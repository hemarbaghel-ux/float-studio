import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import {
  History, Sparkles, Tag, Calendar, Search,
  ChevronRight, ArrowRight, CheckCircle2, Shield, GitBranch, Cpu, Code2
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ChangelogItem {
  id: string;
  milestone: string;
  version: string;
  date: string;
  title: string;
  category: 'AI & Models' | 'Editor & UX' | 'Agent Platform' | 'Git & Source Control' | 'Security & Governance';
  summary: string;
  highlights: string[];
  technicalDetails?: string[];
}

export const CHANGELOG_ENTRIES: ChangelogItem[] = [
  {
    id: 'milestone-10',
    milestone: 'Milestone 10',
    version: 'v1.4.0',
    date: 'October 2026',
    title: 'Workspace Hardening, Keyboard Navigation & In-Transcript Find',
    category: 'Editor & UX',
    summary: 'Fine-tuned developer interaction parity: in-transcript Cmd+F search bar, Cmd/Ctrl+Up/Down keyboard message navigation, minimized Plan pills, and copy table as markdown.',
    highlights: [
      'In-transcript find bar with Cmd+F / Ctrl+F, yellow match highlights, and match index counter',
      'Keyboard message navigation: Cmd/Ctrl+Up/Down jump across user prompts; Cmd/Ctrl+Shift+Up/Down jump across assistant turns',
      'Minimized Plan pills above the composer with expand and dismiss controls',
      'One-click "Copy Table as Markdown" on all rendered tables in chat',
      'Windows extensionless script resolution (.ps1, .bat, .cmd, .exe) in lifecycle hooks',
      'File-pattern scoped rule matching preventing irrelevant token consumption'
    ],
    technicalDetails: [
      'Implemented checkToolLoop in AgentRunner to detect identical repeated calls and inject recovery nudges',
      'Added parent-child hierarchy tracking and recursive cascading cancellation in MultiAgentCoordinator',
      'Human-readable execution policy reasons for outside-workspace and protected-file modifications'
    ]
  },
  {
    id: 'milestone-9',
    milestone: 'Milestone 9',
    version: 'v1.3.0',
    date: 'October 2026',
    title: 'Cursor-Class Parity, Rules Engine & Multi-Agent Architecture',
    category: 'Agent Platform',
    summary: 'Comprehensive parity program introducing .cursorrules discovery, Model Context Protocol (MCP), lifecycle hooks, and parallel subagents.',
    highlights: [
      'Automatic discovery of .cursorrules alongside .float/rules/ with file-pattern precedence',
      'Model Context Protocol (MCP) tool integration and schema validation',
      'Lifecycle hooks supporting pre-edit and post-apply shell scripts',
      'Parallel subagent coordinator with isolated worktrees and progress streaming',
      'Authoritative execution policies with safe, review, allowlist, and sandboxed modes'
    ],
    technicalDetails: [
      'Staged proposal review immutability guarantees: zero file writes without explicit human approval',
      'Comprehensive multi-provider adapters for Gemini 3.1 Flash Lite, Claude 3.5 Sonnet, GPT-4o, and Grok 4.7'
    ]
  },
  {
    id: 'milestone-8',
    milestone: 'Milestone 8',
    version: 'v1.2.0',
    date: 'October 2026',
    title: 'Advanced AI Context Intelligence & Retrieval Orchestration',
    category: 'AI & Models',
    summary: 'Multi-file codebase reasoning, import-dependency graph boosting, and smart context budgeting for large repositories.',
    highlights: [
      'Import-graph dependency boosting: automatically includes imported utilities and interfaces',
      'Dynamic token budgeting: prevents prompt overflows while preserving highest-ranking code blocks',
      'Explainable context badges showing exact files, character counts, and exclusion reasons',
      'Direct # pull request mentions and suggestions inside prompt composer alongside @'
    ],
    technicalDetails: [
      'AST-based import extraction and BFS dependency weighting algorithm',
      'Sliding window rate limiters and multi-provider fallback resilience'
    ]
  },
  {
    id: 'milestone-7',
    milestone: 'Milestone 7',
    version: 'v1.1.0',
    date: 'September 2026',
    title: 'Full Source Control, Git Worktrees & PR Workflows',
    category: 'Git & Source Control',
    summary: 'Production Git integration enabling clean-room worktrees, branch switching, commit staging, and GitHub PR creation.',
    highlights: [
      'Isolated Git worktrees allowing background agents to work in separate checkouts without disrupting the user',
      'Staged proposal review modal with side-by-side Monaco diff viewer and live conflict detection',
      'GitHub OAuth linking, branch management, and remote repository sync',
      'Security audit: strict path boundary guards preventing ../ traversal escapes'
    ],
    technicalDetails: [
      'SHA-256 pre/post content hashing to prevent applying proposals on top of conflicting file changes',
      'Unified 45-suite verification framework validating security and agent loops'
    ]
  },
  {
    id: 'milestone-6',
    milestone: 'Milestone 6',
    version: 'v1.0.0',
    date: 'September 2026',
    title: 'Persistent Background Agents & Task Recovery',
    category: 'Agent Platform',
    summary: 'Enterprise agent reliability: tasks survive browser reloads, network disconnects, and server restarts.',
    highlights: [
      'Firestore-backed task queues and distributed lease heartbeats',
      'Automatic resume and reattachment when user reconnects to active agent session',
      'Graceful cancellation propagation across background tasks',
      'Agent events timeline in chat transcript showing real-time thought progress'
    ]
  },
  {
    id: 'milestone-5',
    milestone: 'Milestone 5',
    version: 'v0.9.0',
    date: 'August 2026',
    title: 'Codebase Indexing & Symbol Search',
    category: 'Editor & UX',
    summary: 'Fast in-memory AST symbol indexing, fuzzy search, and @symbol context referencing.',
    highlights: [
      'Trigram fuzzy codebase indexing for instantaneous file and symbol lookups',
      'Extraction of TypeScript/Python functions, classes, and type definitions',
      'Fuzzy symbol scoring with path distance weighting'
    ]
  },
  {
    id: 'milestone-4',
    milestone: 'Milestone 4',
    version: 'v0.8.0',
    date: 'August 2026',
    title: 'Structured Plan Mode with Human Approval Gates',
    category: 'AI & Models',
    summary: 'Dedicated Plan workflow: generate multi-step DAG implementation plans before executing code changes.',
    highlights: [
      'Interactive PlanCard with editable title, step descriptions, and execution badges',
      'Approval gates requiring user confirmation before agent begins mutating files',
      'Granular step status tracking (pending, executing, completed, failed, cancelled)'
    ]
  },
  {
    id: 'milestone-3',
    milestone: 'Milestone 3',
    version: 'v0.7.0',
    date: 'July 2026',
    title: 'Inline AI Assistance & Monaco Ghost-Text Completions',
    category: 'Editor & UX',
    summary: 'In-editor AI editing via Ctrl+K / Cmd+K and real-time tab autocomplete.',
    highlights: [
      'Monaco inline completions provider delivering ghost-text suggestions as you type',
      'Ctrl+K inline prompt modal with floating diff review and one-click accept/reject',
      'Selection-aware prompts and localized replacements'
    ]
  },
  {
    id: 'milestone-1-2',
    milestone: 'Milestones 1 & 2',
    version: 'v0.5.0',
    date: 'June 2026',
    title: 'Core Web IDE Foundation & Dynamic @Context Picker',
    category: 'Editor & UX',
    summary: 'The initial foundation of FLOAT AI: Monaco editor, virtual filesystem, dark/light theme, and @context picker.',
    highlights: [
      'Full Monaco editor integration with language highlighting and minimap',
      'Virtual file tree supporting project creation, file upload, and editing',
      'Dynamic @context picker for attaching @file, @folder, and active selections into chat'
    ]
  }
];

export function ChangelogPage() {
  React.useEffect(() => {
    document.title = 'Release notes & Changelog — FLOAT';
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = ['All', 'AI & Models', 'Editor & UX', 'Agent Platform', 'Git & Source Control', 'Security & Governance'];

  const filteredEntries = useMemo(() => {
    return CHANGELOG_ENTRIES.filter(entry => {
      const matchesCategory = selectedCategory === 'All' || entry.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        entry.title.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.milestone.toLowerCase().includes(q) ||
        entry.highlights.some(h => h.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/changelog" />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-28 text-left">
        {/* Header Section */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-medium mb-4">
            <History size={13} />
            <span>Product Evolution &amp; Milestone Changelog</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-slate-900 dark:text-white">
            Release Notes
          </h1>
          <p className="text-base text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
            Verified milestones and feature additions shipped to the FLOAT AI developer workspace. Track our architecture advancements across AI intelligence, agent reliability, source control, and editor experience.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-12 pb-6 border-b border-slate-200 dark:border-white/10">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer",
                  selectedCategory === cat
                    ? "bg-slate-900 text-white dark:bg-white dark:text-black font-semibold shadow-xs"
                    : "bg-slate-200/70 dark:bg-white/5 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter release notes..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-purple-500 transition-colors"
            />
          </div>
        </div>

        {/* Timeline Entries */}
        <div className="space-y-12 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-200 dark:before:bg-white/10 before:hidden sm:before:block">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-sm">No release notes matching your search filter.</p>
              <button
                type="button"
                onClick={() => { setSelectedCategory('All'); setSearchQuery(''); }}
                className="mt-3 text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filteredEntries.map(entry => (
              <article
                key={entry.id}
                className="relative sm:pl-10 space-y-4 group"
              >
                {/* Timeline node */}
                <div
                  className="hidden sm:flex absolute left-0 top-1 w-6 h-6 rounded-full bg-white dark:bg-[#12110D] border-2 border-purple-600 dark:border-purple-400 items-center justify-center -translate-x-[9px] shadow-sm"
                  aria-hidden="true"
                >
                  <div className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-400" />
                </div>

                {/* Entry Header */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                    {entry.version}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
                    {entry.milestone}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E] flex items-center gap-1">
                    <Calendar size={12} />
                    <span>{entry.date}</span>
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-medium">
                    {entry.category}
                  </span>
                </div>

                {/* Entry Title & Summary */}
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                    {entry.title}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-[#C9D1D9] leading-relaxed">
                    {entry.summary}
                  </p>
                </div>

                {/* Highlights Card */}
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15130F] p-5 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-purple-600 dark:text-purple-400" />
                    <span>Shipped Capabilities</span>
                  </h3>
                  <ul className="space-y-2">
                    {entry.highlights.map((item, idx) => (
                      <li key={idx} className="text-xs text-slate-700 dark:text-[#E6EDF3] flex items-start gap-2.5 leading-relaxed">
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Technical details if present */}
                  {entry.technicalDetails && entry.technicalDetails.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/5 space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Architecture &amp; Safety:</span>
                      {entry.technicalDetails.map((td, tIdx) => (
                        <div key={tIdx} className="text-[11px] text-slate-500 dark:text-[#8B949E] pl-2 border-l border-purple-500/30">
                          {td}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </main>

      <ResourcesFooter />
    </div>
  );
}
