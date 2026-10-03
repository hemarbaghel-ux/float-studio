import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { 
  Search, 
  BookOpen, 
  Compass, 
  History, 
  HelpCircle, 
  Newspaper, 
  Users, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  Calendar, 
  ChevronRight, 
  ExternalLink 
} from 'lucide-react';

interface SearchResult {
  title: string;
  category: string;
  href: string;
  snippet: string;
}

export function ResourcesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    document.title = 'Resources — FLOAT';
  }, []);

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const categories = [
    {
      title: 'Documentation',
      desc: 'Comprehensive guides, workspace concepts, AI modes, and provider configurations.',
      href: '/resources/docs',
      icon: <BookOpen size={20} className="text-purple-600 dark:text-purple-400" />,
      tag: 'Core Docs'
    },
    {
      title: 'Tutorials & Guides',
      desc: 'Step-by-step practical developer tutorials from first edit to advanced diff reviews.',
      href: '/resources/guides',
      icon: <Compass size={20} className="text-blue-600 dark:text-blue-400" />,
      tag: 'Tutorials'
    },
    {
      title: 'Product Changelog',
      desc: 'Chronological timeline of verified releases, feature additions, and platform fixes.',
      href: '/resources/changelog',
      icon: <History size={20} className="text-emerald-600 dark:text-emerald-400" />,
      tag: 'Updates'
    },
    {
      title: 'Help Center & FAQs',
      desc: 'Immediate answers to common troubleshooting, quotas, diff workflows, and accounts.',
      href: '/resources/help',
      icon: <HelpCircle size={20} className="text-amber-600 dark:text-amber-400" />,
      tag: 'Support'
    },
    {
      title: 'Engineering Blog',
      desc: 'Technical insights, model evaluation architectures, and announcements from our team.',
      href: '/resources/blog',
      icon: <Newspaper size={20} className="text-indigo-600 dark:text-indigo-400" />,
      tag: 'Articles'
    },
    {
      title: 'Developer Community',
      desc: 'Collaborate with developers, share feedback, and submit feature requests.',
      href: '/resources/community',
      icon: <Users size={20} className="text-rose-600 dark:text-rose-400" />,
      tag: 'Community'
    }
  ];

  // Search index covering all resource destinations
  const searchIndex: SearchResult[] = [
    {
      title: 'Introduction to FLOAT',
      category: 'Documentation',
      href: '/resources/docs',
      snippet: 'Learn how FLOAT transforms coding with Ask, Plan, Edit, and Agent modes in an integrated Monaco editor.'
    },
    {
      title: 'Accessing & Installing FLOAT',
      category: 'Documentation',
      href: '/resources/docs',
      snippet: 'Run FLOAT instantly in modern browsers or install it locally via progressive web app controls.'
    },
    {
      title: 'Creating Your First Project',
      category: 'Documentation',
      href: '/resources/docs',
      snippet: 'Initialize a fresh workspace or import an existing codebase with Firebase-secured persistence.'
    },
    {
      title: 'Understanding the Workspace Layout',
      category: 'Documentation',
      href: '/resources/docs',
      snippet: 'Navigate the 4-panel developer environment: Activity Bar, File Explorer, Editor, and AI Panel.'
    },
    {
      title: 'Using Ask, Plan, Edit, and Agent Modes',
      category: 'Documentation',
      href: '/resources/docs',
      snippet: 'Choose the optimal level of AI autonomy from read-only architectural analysis to targeted code diffs.'
    },
    {
      title: 'Monaco Editor & Diff Review Engine',
      category: 'Documentation',
      href: '/resources/docs',
      snippet: 'Review line-by-line additions and deletions before accepting AI-generated modifications.'
    },
    {
      title: 'From Workspace to First Edit',
      category: 'Guides',
      href: '/resources/guides',
      snippet: 'A 5-minute practical walkthrough for initializing a project and completing your first verified edit.'
    },
    {
      title: 'Safe Code Modifications: Diff Review Workflow',
      category: 'Guides',
      href: '/resources/guides',
      snippet: 'Master FLOAT’s human-in-the-loop diff review engine to inspect and verify code changes.'
    },
    {
      title: 'Exploring Large Codebases with ASK Mode',
      category: 'Guides',
      href: '/resources/guides',
      snippet: 'How to use read-only AI queries to understand complex dependency graphs and architectures.'
    },
    {
      title: 'v0.9.4: Navigation Refinement & Resources Hub',
      category: 'Changelog',
      href: '/resources/changelog',
      snippet: 'Removed unwanted hover underlines, added focus-visible rings, and shipped the Resources experience.'
    },
    {
      title: 'v0.9.3: Multi-Model Evaluation & Telemetry',
      category: 'Changelog',
      href: '/resources/changelog',
      snippet: 'Launched Models Hub with standardized benchmark tasks and real-time token tracking.'
    },
    {
      title: 'Account, Sign-in & Authentication Help',
      category: 'Help Center',
      href: '/resources/help',
      snippet: 'How to sign in, reset passwords, and manage Firebase-authenticated sessions.'
    },
    {
      title: 'AI Model Quota & Rate Limit Troubleshooting',
      category: 'Help Center',
      href: '/resources/help',
      snippet: 'Diagnose quota errors and clear accumulated conversation history using New Chat.'
    },
    {
      title: 'Architecting FLOAT’s Centralized Multi-Model Router',
      category: 'Blog',
      href: '/resources/blog',
      snippet: 'Deep dive into honest routing, latency metrics, and the anti-silent-fallback principle.'
    }
  ];

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return searchIndex.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.snippet.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources" />

      <main className="flex-1 pt-32 pb-24 max-w-6xl mx-auto w-full px-6">
        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 text-purple-700 dark:text-purple-300 text-xs font-medium mb-4">
            <Sparkles size={13} />
            <span>FLOAT Developer Hub</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-slate-900 dark:text-white mb-4 leading-tight">
            Resources for building with FLOAT.
          </h1>

          <p className="text-base text-slate-600 dark:text-[#A1A1AA] leading-relaxed max-w-2xl mx-auto mb-8">
            Learn FLOAT, explore product updates, find step-by-step guides, and get troubleshooting help.
          </p>

          {/* Search bar */}
          <div className="max-w-xl mx-auto relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search all documentation, guides, updates, and help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-md"
            />
          </div>
        </section>

        {/* Live Search Results if active */}
        {searchQuery.trim() !== '' ? (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-white/10">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Search Results ({searchResults.length})
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                Clear Search
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-500">
                No resources found matching "{searchQuery}". Try searching for "diff", "Ask", or "Monaco".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((res, idx) => (
                  <a
                    key={idx}
                    href={res.href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNav(res.href);
                    }}
                    className="p-5 bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl hover:border-slate-300 dark:hover:border-white/20 transition-all flex flex-col justify-between group cursor-pointer shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-purple-600 dark:text-purple-400 font-medium mb-1.5">
                        <span>{res.category}</span>
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {res.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">
                        {res.snippet}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* 6 Category Cards Grid */}
            <section className="mb-20">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.map((cat, idx) => (
                  <a
                    key={idx}
                    href={cat.href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNav(cat.href);
                    }}
                    className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center group-hover:scale-105 transition-transform">
                          {cat.icon}
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-[#8B949E] uppercase tracking-wider">
                          {cat.tag}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-6">
                        {cat.desc}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs font-medium text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      <span>Explore {cat.title}</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </a>
                ))}
              </div>
            </section>

            {/* Featured Getting Started Walkthrough */}
            <section className="mb-20 bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-10 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-6 border-b border-slate-100 dark:border-white/5">
                <div>
                  <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">
                    <BookOpen size={14} />
                    <span>FEATURED WALKTHROUGH</span>
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Getting Started with FLOAT
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-1">
                    The four foundational steps to building software with precision AI assistance.
                  </p>
                </div>

                <a
                  href="/resources/docs"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNav('/resources/docs');
                  }}
                  className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>View full documentation</span>
                  <ArrowRight size={14} />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    step: '01',
                    title: 'Open Workspace',
                    desc: 'Sign in to access your dashboard. Create a project or open a workspace in your browser.'
                  },
                  {
                    step: '02',
                    title: 'Select AI Mode',
                    desc: 'Choose ASK for read-only exploration, PLAN for roadmaps, or EDIT for targeted code diffs.'
                  },
                  {
                    step: '03',
                    title: 'Prompt with Context',
                    desc: 'Open target files in Monaco. The AI automatically references active buffer context.'
                  },
                  {
                    step: '04',
                    title: 'Review Diff & Accept',
                    desc: 'Inspect additions in green and removals in red. Explicitly accept or reject changes.'
                  }
                ].map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 flex flex-col justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400 mb-2 block">
                        {item.step}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Verified Updates (Changelog Feed) */}
            <section className="mb-20">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Recent Verified Releases
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-0.5">
                    Real, verified changes shipped to the FLOAT platform.
                  </p>
                </div>

                <a
                  href="/resources/changelog"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNav('/resources/changelog');
                  }}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>All changelog entries</span>
                  <ArrowRight size={13} />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    version: 'v0.9.4',
                    date: 'Sep 2026',
                    title: 'Navigation Refinement & Resources Hub',
                    desc: 'Removed hover underline on Product/Pricing items, enhanced focus rings, and shipped the Resources directory.'
                  },
                  {
                    version: 'v0.9.3',
                    date: 'Aug 2026',
                    title: 'Multi-Model Hub & Telemetry',
                    desc: 'Launched centralized AI model evaluations, benchmark leaderboards, and real-time token tracking.'
                  },
                  {
                    version: 'v0.9.2',
                    date: 'Jul 2026',
                    title: 'Monaco Editor & Safe Diffs',
                    desc: 'Integrated Monaco syntax highlighting with human-in-the-loop line diff approvals.'
                  }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-mono font-bold text-[11px] text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded">
                          {item.version}
                        </span>
                        <span className="text-slate-400 text-[11px]">{item.date}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                        {item.desc}
                      </p>
                    </div>

                    <a
                      href="/resources/changelog"
                      onClick={(e) => {
                        e.preventDefault();
                        handleNav('/resources/changelog');
                      }}
                      className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-between cursor-pointer"
                    >
                      <span>Read release details</span>
                      <ArrowRight size={13} />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <ResourcesFooter />
    </div>
  );
}
