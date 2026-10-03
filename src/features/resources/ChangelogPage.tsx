import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { History, Tag, Sparkles, Wrench, Bug, CheckCircle2, Calendar } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: {
    type: 'feature' | 'improvement' | 'fix';
    text: string;
  }[];
}

export function ChangelogPage() {
  const [filterType, setFilterType] = useState<'all' | 'feature' | 'improvement' | 'fix'>('all');

  React.useEffect(() => {
    document.title = 'Changelog — FLOAT';
  }, []);

  const changelog: ChangelogEntry[] = [
    {
      version: 'v0.9.4',
      date: 'September 2026',
      title: 'Navigation Refinement & Complete Resources Hub',
      summary: 'Enhanced navigation accessibility, removed unwanted hover underlines, and launched the full FLOAT developer resources experience.',
      changes: [
        {
          type: 'feature',
          text: 'Dedicated Resources directory including Documentation, Guides, Changelog, Help Center, Blog, and Community.'
        },
        {
          type: 'improvement',
          text: 'Refined top navigation bar: eliminated bottom border underline on Product and Pricing hover states.'
        },
        {
          type: 'improvement',
          text: 'Added visible focus rings (focus-visible:ring-2) to interactive navigation dropdowns for keyboard accessibility.'
        },
        {
          type: 'fix',
          text: 'Replaced dead anchor navigation links with client-side SPA routing across all navigation menus.'
        }
      ]
    },
    {
      version: 'v0.9.3',
      date: 'August 2026',
      title: 'Multi-Model Hub, Evaluation Benchmarks & Telemetry',
      summary: 'Introduced the centralized AI model evaluation platform and real-time usage monitoring.',
      changes: [
        {
          type: 'feature',
          text: 'Launched Models Hub with comparisons across Gemini, GPT, and Claude providers.'
        },
        {
          type: 'feature',
          text: 'Automated task evaluations and leaderboard tracking coding benchmarks.'
        },
        {
          type: 'improvement',
          text: 'Centralized model provider routing with honest error handling and no silent fallbacks.'
        },
        {
          type: 'improvement',
          text: 'Real-time token consumption, latency, and session cost tracking at /models/usage.'
        }
      ]
    },
    {
      version: 'v0.9.2',
      date: 'July 2026',
      title: 'Monaco Editor & Diff Review Engine',
      summary: 'Upgraded the code editing experience with side-by-side diff review and safe change validation.',
      changes: [
        {
          type: 'feature',
          text: 'Monaco Editor integration with full syntax highlighting, tab switching, and line numbers.'
        },
        {
          type: 'feature',
          text: 'Human-in-the-loop diff review: inspect line additions and deletions with explicit Accept/Reject actions.'
        },
        {
          type: 'fix',
          text: 'Added duplicate submission guards to project creation to prevent accidental multi-clicks.'
        },
        {
          type: 'improvement',
          text: 'Multi-file tab manager with dirty state indicators for unsaved buffer changes.'
        }
      ]
    },
    {
      version: 'v0.9.1',
      date: 'June 2026',
      title: 'Internationalization & Theme Engine',
      summary: 'Expanded global developer accessibility with multi-language localizations and dark/light mode toggle.',
      changes: [
        {
          type: 'feature',
          text: 'Localization engine supporting 10 languages including English, Spanish, Chinese, Japanese, and French.'
        },
        {
          type: 'feature',
          text: 'Full dark mode and light mode theme switcher with persistent user preferences.'
        },
        {
          type: 'improvement',
          text: 'WCAG contrast compliant typography tokens across landing and IDE interfaces.'
        }
      ]
    },
    {
      version: 'v0.9.0',
      date: 'May 2026',
      title: 'FLOAT Developer Platform Baseline Launch',
      summary: 'Initial release of the FLOAT AI developer environment.',
      changes: [
        {
          type: 'feature',
          text: 'Integrated 4-panel developer workspace: Activity Bar, File Explorer, Editor, and AI Panel.'
        },
        {
          type: 'feature',
          text: 'Four specialized AI modes: ASK (exploration), PLAN (architecture), EDIT (diffs), and AGENT (execution).'
        },
        {
          type: 'feature',
          text: 'Firebase Authentication and Cloud Firestore security rules with user-scoped data isolation.'
        }
      ]
    }
  ];

  const filteredChangelog = useMemo(() => {
    if (filterType === 'all') return changelog;
    return changelog
      .map(entry => ({
        ...entry,
        changes: entry.changes.filter(c => c.type === filterType)
      }))
      .filter(entry => entry.changes.length > 0);
  }, [changelog, filterType]);

  const getTypeBadge = (type: 'feature' | 'improvement' | 'fix') => {
    switch (type) {
      case 'feature':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 px-2 py-0.5 rounded">
            <Sparkles size={11} />
            Feature
          </span>
        );
      case 'improvement':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 px-2 py-0.5 rounded">
            <Wrench size={11} />
            Improvement
          </span>
        );
      case 'fix':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 rounded">
            <Bug size={11} />
            Fix
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/changelog" />

      <main className="flex-1 pt-28 pb-20 max-w-4xl mx-auto w-full px-6">
        {/* Title */}
        <div className="mb-10 pb-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">
            <History size={14} />
            <span>FLOAT CHANGELOG</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Product Updates & Releases
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            A chronological record of verified features, performance improvements, and fixes shipped to FLOAT.
          </p>

          {/* Filters */}
          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                  : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10'
              }`}
            >
              All Updates
            </button>
            <button
              onClick={() => setFilterType('feature')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filterType === 'feature'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10'
              }`}
            >
              Features
            </button>
            <button
              onClick={() => setFilterType('improvement')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filterType === 'improvement'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10'
              }`}
            >
              Improvements
            </button>
            <button
              onClick={() => setFilterType('fix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filterType === 'fix'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10'
              }`}
            >
              Fixes
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-12">
          {filteredChangelog.map((entry, index) => (
            <article 
              key={entry.version}
              className="relative pl-6 sm:pl-8 border-l border-slate-200 dark:border-white/10"
            >
              {/* Dot */}
              <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-purple-600 dark:bg-purple-400 ring-4 ring-white dark:ring-[#0A0A08]" />

              <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl p-6 sm:p-7 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white">
                      {entry.version}
                    </span>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {entry.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#8B949E]">
                    <Calendar size={13} />
                    <span>{entry.date}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-5 leading-relaxed">
                  {entry.summary}
                </p>

                <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-white/5">
                  {entry.changes.map((change, cIdx) => (
                    <div key={cIdx} className="flex items-start gap-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      <div className="shrink-0 mt-0.5">
                        {getTypeBadge(change.type)}
                      </div>
                      <span className="pt-0.5">{change.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      <ResourcesFooter />
    </div>
  );
}
