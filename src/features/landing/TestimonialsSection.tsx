import React, { useState } from 'react';
import {
  Quote, Star, CheckCircle, ExternalLink, Terminal,
  Code2, Sparkles, Filter, LayoutGrid, MoveHorizontal,
  Github, Twitter, MessageSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TestimonialItem {
  id: string;
  name: string;
  handle: string;
  role: string;
  company: string;
  avatar: string;
  category: 'engineering' | 'ai-agents' | 'productivity' | 'oss';
  content: string;
  highlight: string;
  metrics?: string;
  source: 'Twitter' | 'GitHub' | 'Discord' | 'HackerNews';
  verified: boolean;
  date: string;
  tags: string[];
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    id: 't-1',
    name: 'Elena Rostova',
    handle: '@elena_dev',
    role: 'Principal Engineer',
    company: 'HyperScale Systems',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    category: 'engineering',
    content: "FLOAT's staged diff proposals give our team complete peace of mind. Other tools hallucinate and blindly mutate files, but with FLOAT's human-in-the-loop review and Instant Grep, our refactoring velocity quadrupled without a single broken build.",
    highlight: 'Refactoring velocity quadrupled without a single broken build.',
    metrics: '4x refactoring speed',
    source: 'Twitter',
    verified: true,
    date: '2 days ago',
    tags: ['Diff Review', 'TypeScript', 'Refactoring']
  },
  {
    id: 't-2',
    name: 'Marcus Vance',
    handle: '@marcusv_code',
    role: 'Staff Infrastructure Lead',
    company: 'VectorFlow AI',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    category: 'ai-agents',
    content: "The multi-file agent execution in FLOAT is the closest thing to an autonomous senior engineer. It reads our project structure, parses AST diagnostics, writes unit tests, and validates before handing off.",
    highlight: 'Multi-file agent execution parses AST diagnostics and writes unit tests.',
    metrics: '100% test coverage preserved',
    source: 'GitHub',
    verified: true,
    date: '1 week ago',
    tags: ['Autonomous Agents', 'Test Runners', 'AST']
  },
  {
    id: 't-3',
    name: 'Sarah Chen',
    handle: '@schen_tech',
    role: 'Founder & Full-Stack Architect',
    company: 'OmniDesk',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    category: 'productivity',
    content: "Ctrl+K inline edits and Tab ghost completions in FLOAT feel native and lightning fast. Having Pyodide in-browser runtime plus Monaco side-by-side diffs makes it my primary development environment all day.",
    highlight: 'Ctrl+K inline edits and Tab ghost completions feel native and lightning fast.',
    metrics: 'Saved 12+ hrs/week',
    source: 'Twitter',
    verified: true,
    date: '3 days ago',
    tags: ['Tab Completion', 'Inline Cmd+K', 'Monaco']
  },
  {
    id: 't-4',
    name: 'Devon Kester',
    handle: '@devonkester',
    role: 'Core Maintainer',
    company: 'OpenCanvas SDK',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    category: 'oss',
    content: "We imported our entire open-source repository into FLOAT. Instant codebase indexing across 1,800+ files and accurate @-mention context search meant our contributors resolved tricky issue backlogs in hours instead of days.",
    highlight: 'Indexed 1,800+ files with zero lag. Resolved issue backlogs in hours.',
    metrics: '1,800+ files indexed',
    source: 'GitHub',
    verified: true,
    date: '5 days ago',
    tags: ['Open Source', 'Instant Grep', 'Context Search']
  },
  {
    id: 't-5',
    name: 'Aisha Al-Mansoor',
    handle: '@aisha_codes',
    role: 'Senior Backend Engineer',
    company: 'FinLedger Global',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    category: 'engineering',
    content: "Strict path boundary checks and client-agnostic server provider routing make FLOAT safe enough for our compliance team to approve. No telemetry leaks, no unverified file writes, and clean token accounting.",
    highlight: 'Safe enough for strict compliance approval. Zero telemetry leaks.',
    metrics: 'Enterprise compliant',
    source: 'Discord',
    verified: true,
    date: 'Oct 8',
    tags: ['Security', 'Compliance', 'Privacy']
  },
  {
    id: 't-6',
    name: 'Lucas Thorne',
    handle: '@lucasthorney',
    role: 'Tech Lead',
    company: 'Prism Labs',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&auto=format&fit=crop&q=80',
    category: 'productivity',
    content: "FLOAT isn't just a chatbot tacked onto an editor. It understands whole-project workflows. When I ask it to refactor our authentication flow, it updates the middleware, tests, and mock types in a single coherent turn.",
    highlight: 'Updates middleware, tests, and mock types in a single coherent turn.',
    metrics: '3 files synced simultaneously',
    source: 'HackerNews',
    verified: true,
    date: 'Oct 6',
    tags: ['Multi-file Edit', 'Full-Stack', 'Orchestration']
  },
  {
    id: 't-7',
    name: 'Zackary Powell',
    handle: '@zackpowell_dev',
    role: 'Frontend Architect',
    company: 'HyperU Studio',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80',
    category: 'engineering',
    content: "The Monaco diff review experience is immaculate. Being able to compare original code against the proposed change with granular accept/reject controls turns AI pair programming into a joy.",
    highlight: 'Granular accept/reject controls turn AI pairing into a joy.',
    metrics: '99.4% acceptance rate',
    source: 'Twitter',
    verified: true,
    date: 'Oct 4',
    tags: ['Diff Review', 'Monaco', 'UI/UX']
  },
  {
    id: 't-8',
    name: 'Priya Narayanan',
    handle: '@priya_n',
    role: 'DevOps & Tooling Lead',
    company: 'CloudMatrix',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80',
    category: 'ai-agents',
    content: "FLOAT CLI & validation tooling caught 3 broken import cycles that had slipped through CI. The deterministic orchestrator and checkpoint rollbacks make experimenting with complex refactors risk-free.",
    highlight: 'Deterministic orchestrator and rollback snapshots make refactoring risk-free.',
    metrics: 'Zero regressions',
    source: 'Discord',
    verified: true,
    date: 'Oct 2',
    tags: ['CLI Validation', 'Checkpoints', 'Git']
  }
];

export function TestimonialsSection() {
  const [layoutMode, setLayoutMode] = useState<'marquee' | 'grid'>('marquee');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const categories = [
    { id: 'all', label: 'All Reviews' },
    { id: 'engineering', label: 'Engineering' },
    { id: 'ai-agents', label: 'Autonomous Agents' },
    { id: 'productivity', label: 'Speed & Workflow' },
    { id: 'oss', label: 'Open Source' }
  ];

  const filtered = activeCategory === 'all'
    ? TESTIMONIALS
    : TESTIMONIALS.filter((t) => t.category === activeCategory);

  // Divide testimonials into two tracks for the marquee effect
  const marqueeTrack1 = [...TESTIMONIALS.slice(0, 4), ...TESTIMONIALS.slice(0, 4)];
  const marqueeTrack2 = [...TESTIMONIALS.slice(4, 8), ...TESTIMONIALS.slice(4, 8)];

  return (
    <section className="py-24 max-w-7xl mx-auto px-6 border-t border-slate-200 dark:border-white/5 relative overflow-hidden select-text text-left">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-500/5 dark:bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-12 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles size={12} />
            <span>Developer Testimonials &amp; Social Proof</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Loved by engineers who ship every day
          </h2>
          <p className="mt-3 text-base text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            See how developers, architects, and founders use FLOAT's agentic workflows, tab autocomplete, and safe staged diff reviews to build faster.
          </p>
        </div>

        {/* Layout Mode & Filter Controls */}
        <div className="flex items-center gap-3 shrink-0 self-stretch md:self-auto justify-between md:justify-end">
          {/* Layout Toggle */}
          <div className="inline-flex items-center rounded-xl bg-slate-200/70 dark:bg-white/10 p-1 text-xs font-medium border border-slate-300/60 dark:border-white/5">
            <button
              type="button"
              onClick={() => setLayoutMode('marquee')}
              className={cn(
                "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-medium text-xs",
                layoutMode === 'marquee'
                  ? "bg-white dark:bg-[#1A1813] text-slate-900 dark:text-white shadow-xs font-semibold"
                  : "text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white"
              )}
              title="Continuous marquee scroll"
              aria-label="Marquee layout"
            >
              <MoveHorizontal size={13} />
              <span>Marquee</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={cn(
                "px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-medium text-xs",
                layoutMode === 'grid'
                  ? "bg-white dark:bg-[#1A1813] text-slate-900 dark:text-white shadow-xs font-semibold"
                  : "text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white"
              )}
              title="Full grid layout with categories"
              aria-label="Grid layout"
            >
              <LayoutGrid size={13} />
              <span>Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Pills (Active in Grid mode or for filtering) */}
      {layoutMode === 'grid' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar relative z-10">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <Filter size={12} /> Filter:
          </span>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer border",
                activeCategory === cat.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs"
                  : "bg-white dark:bg-[#14120E] border-slate-200 dark:border-white/10 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Marquee View */}
      {layoutMode === 'marquee' ? (
        <div
          className="relative py-4 space-y-6 overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Gradient Edge Masks for Smooth Edge Fade */}
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-50 dark:from-[#0F0F0B] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-50 dark:from-[#0F0F0B] to-transparent z-10 pointer-events-none" />

          {/* Marquee Row 1 (Left to Right animation) */}
          <div className="flex gap-6 overflow-hidden select-none">
            <div
              className={cn(
                "flex gap-6 shrink-0 float-marquee-track",
                isPaused && "float-marquee-paused"
              )}
            >
              {marqueeTrack1.map((item, idx) => (
                <TestimonialCard key={`track1-${item.id}-${idx}`} item={item} />
              ))}
            </div>
          </div>

          {/* Marquee Row 2 (Reverse direction) */}
          <div className="flex gap-6 overflow-hidden select-none">
            <div
              className={cn(
                "flex gap-6 shrink-0 float-marquee-track-reverse",
                isPaused && "float-marquee-paused"
              )}
            >
              {marqueeTrack2.map((item, idx) => (
                <TestimonialCard key={`track2-${item.id}-${idx}`} item={item} />
              ))}
            </div>
          </div>

          {/* Pause hint */}
          <div className="text-center pt-2 text-[11px] font-mono text-slate-400 dark:text-slate-500">
            Hover cards to pause marquee · Click any card to review feedback
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
          {filtered.map((item) => (
            <TestimonialCard key={item.id} item={item} fullWidth />
          ))}
        </div>
      )}

      {/* Trust Stats Bar */}
      <div className="mt-16 pt-8 border-t border-slate-200 dark:border-white/5 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        <div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">99.4%</div>
          <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-1">Diff Proposal Accuracy</div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-extrabold text-purple-600 dark:text-purple-400">4x Faster</div>
          <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-1">Multi-file Refactoring</div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">0 Silent Writes</div>
          <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-1">Human-in-the-Loop Review</div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">100% Client-Safe</div>
          <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-1">Private Server Routing</div>
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ item, fullWidth }: { item: TestimonialItem; fullWidth?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14120E] p-6 flex flex-col justify-between shadow-xs transition-all hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md",
        fullWidth ? "w-full" : "w-[360px] sm:w-[400px] shrink-0"
      )}
    >
      <div>
        {/* Author info & platform badge */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <img
              src={item.avatar}
              alt={item.name}
              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0"
              loading="lazy"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-slate-900 dark:text-white leading-tight">
                  {item.name}
                </span>
                {item.verified && (
                  <CheckCircle size={13} className="text-blue-500 shrink-0" />
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-[#8B949E] leading-tight">
                {item.role} · <span className="text-slate-700 dark:text-slate-300 font-medium">{item.company}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-white/5 shrink-0">
            {item.source === 'Twitter' && <Twitter size={11} className="text-sky-500" />}
            {item.source === 'GitHub' && <Github size={11} className="text-slate-700 dark:text-slate-300" />}
            {item.source === 'Discord' && <MessageSquare size={11} className="text-indigo-500" />}
            {item.source === 'HackerNews' && <span className="text-amber-500 font-bold text-[9px]">HN</span>}
            <span>{item.source}</span>
          </div>
        </div>

        {/* Highlight Callout */}
        <div className="mb-3 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-500/20 text-xs font-medium text-purple-900 dark:text-purple-300 leading-snug">
          "{item.highlight}"
        </div>

        {/* Full Quote */}
        <p className="text-xs sm:text-[13px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-4">
          {item.content}
        </p>
      </div>

      {/* Footer tags and metrics */}
      <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400"
            >
              #{tag}
            </span>
          ))}
        </div>

        {item.metrics && (
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            ✓ {item.metrics}
          </span>
        )}
      </div>
    </div>
  );
}
