import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { 
  Compass, 
  Search, 
  Clock, 
  ArrowRight, 
  CheckCircle2, 
  Code, 
  Layers, 
  ShieldCheck, 
  Zap, 
  X, 
  BookOpen 
} from 'lucide-react';

interface Guide {
  id: string;
  category: 'Getting Started' | 'AI Coding' | 'Codebase Exploration' | 'Debugging' | 'Workflows';
  title: string;
  description: string;
  readTime: string;
  isPublished: boolean;
  sections?: {
    heading: string;
    body: string;
    points?: string[];
  }[];
}

export function GuidesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGuide, setActiveGuide] = useState<Guide | null>(null);

  React.useEffect(() => {
    document.title = 'Tutorials & Guides — FLOAT';
  }, []);

  const guides: Guide[] = [
    {
      id: 'quickstart-first-edit',
      category: 'Getting Started',
      title: 'From Workspace to First Edit',
      description: 'A 5-minute practical walkthrough for initializing a project, prompting the AI, and completing your first verified code edit.',
      readTime: '5 min read',
      isPublished: true,
      sections: [
        {
          heading: '1. Launching Your Project',
          body: 'Open FLOAT and select "New Project" from the Dashboard. Name your workspace and select your primary environment (e.g. TypeScript or Python). The workspace initializes immediately with your file explorer and Monaco editor.',
          points: [
            'Notice the Activity Bar on the left: File Explorer, Search, and Settings.',
            'The AI Panel on the right is ready to receive your commands.'
          ]
        },
        {
          heading: '2. Understanding the Modes',
          body: 'FLOAT provides four modes to suit your workflow: ASK, PLAN, EDIT, and AGENT. For your first edit, switch the dropdown to EDIT mode. This ensures that the AI only proposes targeted diffs rather than performing unconstrained autonomous operations.'
        },
        {
          heading: '3. Prompting the AI Assistant',
          body: 'Open a target file in your Monaco editor (for example, src/App.tsx). In the AI chat box, describe your desired modification concisely: "Add a dark mode toggle button to the top navigation header".',
          points: [
            'FLOAT inspects the currently open file context automatically.',
            'The AI generates a structured proposed change.'
          ]
        },
        {
          heading: '4. Reviewing the Diff',
          body: 'When the AI finishes generating code, a Diff Review card appears showing the exact red (removed) and green (added) lines. Inspect the changes carefully. When satisfied, click "Accept Change" to apply the diff.'
        }
      ]
    },
    {
      id: 'diff-review-mastery',
      category: 'AI Coding',
      title: 'Safe Code Modifications: Diff Review Workflow',
      description: 'Master FLOAT’s human-in-the-loop diff review engine to inspect, verify, and approve code changes without regressions.',
      readTime: '6 min read',
      isPublished: true,
      sections: [
        {
          heading: 'Why Diff Review Matters',
          body: 'Autonomous code generation without human verification introduces bugs and regressions. FLOAT enforces explicit diff review: code is never silently overwritten behind your back.',
          points: [
            'Unified and split diff inspection in Monaco.',
            'Explicit Accept and Reject actions for every proposal.',
            'Unsaved change badges indicate when modifications have been applied to your buffer.'
          ]
        },
        {
          heading: 'Evaluating Proposed Changes',
          body: 'Before clicking Accept, verify that: (1) existing component state is preserved, (2) imports are correctly structured, and (3) types adhere to TypeScript conventions.'
        }
      ]
    },
    {
      id: 'codebase-exploration-ask',
      category: 'Codebase Exploration',
      title: 'Exploring Large Codebases with ASK Mode',
      description: 'How to use read-only AI queries to understand complex dependency graphs, routing architectures, and data flows safely.',
      readTime: '7 min read',
      isPublished: true,
      sections: [
        {
          heading: 'Read-Only Exploration with ASK Mode',
          body: 'When onboarding to a new repository or troubleshooting unfamiliar logic, switch to ASK mode. In ASK mode, FLOAT is strictly restricted from editing files. It reads repository context and provides deep architectural explanations.',
          points: [
            'Ask: "Where is authentication enforced in our Express routes?"',
            'Ask: "Explain how Zustand stores manage IDE state in src/store/"',
            'No risk of accidental file edits or dirty git working trees.'
          ]
        }
      ]
    },
    {
      id: 'model-token-optimization',
      category: 'Workflows',
      title: 'Optimizing Model Tokens & Turn Budgets',
      description: 'Manage AI context windows, inspect latency benchmarks, and monitor your token budget using the Models Hub.',
      readTime: '4 min read',
      isPublished: true,
      sections: [
        {
          heading: 'Managing Conversation Context',
          body: 'Large multi-turn conversations can consume tokens and dilute prompt relevance. Use the "New Chat" button when switching to an unrelated task to refresh the context window and ensure high-precision responses.',
          points: [
            'Track your token consumption in real time at /models/usage.',
            'Gemini 3.8 Flash provides rapid inference with large token context limits.'
          ]
        }
      ]
    },
    {
      id: 'agentic-debugging-loop',
      category: 'Debugging',
      title: 'Automated Diagnostic Loops with Debugger Agent',
      description: 'Let the Debugger Agent analyze stack traces, reproduce test failures, and propose surgical bug fixes.',
      readTime: 'Coming soon',
      isPublished: false
    },
    {
      id: 'cloud-agent-pipelines',
      category: 'Workflows',
      title: 'Setting up Cloud Agent CI/CD Pipelines',
      description: 'Automate PR reviews and background refactoring tasks with remote agent runners.',
      readTime: 'Coming soon',
      isPublished: false
    }
  ];

  const categories = ['All', 'Getting Started', 'AI Coding', 'Codebase Exploration', 'Debugging', 'Workflows'];

  const filteredGuides = useMemo(() => {
    return guides.filter(guide => {
      const matchesCategory = selectedCategory === 'All' || guide.category === selectedCategory;
      const matchesQuery = searchQuery === '' ||
        guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guide.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guide.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [guides, selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/guides" />

      <main className="flex-1 pt-28 pb-20 max-w-7xl mx-auto w-full px-6">
        {/* Title */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
            <Compass size={14} />
            <span>LEARNING & GUIDES</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Tutorials & Practical Guides
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            Step-by-step developer guides for building, debugging, and editing software with FLOAT AI.
          </p>

          {/* Search bar */}
          <div className="mt-6 max-w-xl relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search guides (e.g. Diffs, Ask mode, Quickstart)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs'
                  : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Guides Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGuides.map(guide => (
            <div
              key={guide.id}
              className={`bg-white dark:bg-[#141414] border rounded-xl p-6 flex flex-col justify-between transition-all ${
                guide.isPublished
                  ? 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-xs hover:shadow-md'
                  : 'border-dashed border-slate-200 dark:border-white/10 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs mb-3">
                  <span className="font-medium text-slate-500 dark:text-[#8B949E]">
                    {guide.category}
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Clock size={12} />
                    <span>{guide.readTime}</span>
                  </div>
                </div>

                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2 leading-snug">
                  {guide.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-6">
                  {guide.description}
                </p>
              </div>

              <div>
                {guide.isPublished ? (
                  <button
                    onClick={() => setActiveGuide(guide)}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Read Tutorial</span>
                    <ArrowRight size={13} />
                  </button>
                ) : (
                  <div className="w-full py-2 px-3 bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 rounded-lg text-xs font-medium text-center border border-slate-200/50 dark:border-white/5">
                    Tutorial in preparation
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Guide Reader Modal */}
      {activeGuide && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActiveGuide(null)}
              className="absolute top-6 right-6 p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
              <span>{activeGuide.category}</span>
              <span aria-hidden="true">·</span>
              <span>{activeGuide.readTime}</span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white mb-3">
              {activeGuide.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#A1A1AA] pb-4 mb-6 border-b border-slate-100 dark:border-white/5">
              {activeGuide.description}
            </p>

            <div className="space-y-6">
              {activeGuide.sections?.map((sec, idx) => (
                <div key={idx} className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {sec.heading}
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {sec.body}
                  </p>
                  {sec.points && (
                    <ul className="space-y-1.5 pl-2 mt-2">
                      {sec.points.map((pt, pIdx) => (
                        <li key={pIdx} className="text-xs text-slate-600 dark:text-[#A1A1AA] flex items-start gap-2">
                          <CheckCircle2 size={13} className="text-blue-500 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">FLOAT AI Developer Guides</span>
              <button
                onClick={() => setActiveGuide(null)}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      <ResourcesFooter />
    </div>
  );
}
