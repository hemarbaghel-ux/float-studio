import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { 
  Newspaper, 
  Calendar, 
  Clock, 
  ArrowRight, 
  Sparkles, 
  BookOpen, 
  X, 
  CheckCircle2, 
  Layers, 
  Shield 
} from 'lucide-react';

interface Article {
  id: string;
  category: 'Announcements' | 'Engineering' | 'Product' | 'Guides';
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  featured?: boolean;
  content: {
    intro: string;
    sections: {
      title: string;
      body: string;
      points?: string[];
    }[];
    conclusion: string;
  };
}

export function BlogPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);

  React.useEffect(() => {
    document.title = 'Blog — FLOAT';
  }, []);

  const articles: Article[] = [
    {
      id: 'multi-model-router-launch',
      category: 'Announcements',
      title: 'Architecting FLOAT’s Centralized Multi-Model Evaluation Hub',
      excerpt: 'How we built transparent model evaluations, real-time token telemetry, and centralized routing without silent fallbacks.',
      date: 'August 2026',
      readTime: '6 min read',
      featured: true,
      content: {
        intro: 'In AI-assisted software development, transparency is essential. Developers need to know exactly which model is processing their code, what the latency looks like, and how tokens are consumed. Today we explore the architecture behind FLOAT’s multi-model routing and evaluation hub.',
        sections: [
          {
            title: 'The Anti-Silent-Fallback Principle',
            body: 'Many developer tools quietly redirect unsupported model requests to a cheaper default model when an error occurs. In FLOAT, we enforce strict, honest routing: if a requested provider model is not configured or fails, the platform surfaces an actionable error rather than pretending a different model ran.',
            points: [
              'Explicit provider adapters under src/server/providers/',
              'Accurate telemetry for prompt tokens, completion tokens, and latency',
              'Real benchmark evaluations across standardized coding tasks'
            ]
          },
          {
            title: 'Unified Evaluation Metrics',
            body: 'Our evaluation framework measures real-world coding benchmarks including syntax validity, diff adherence, and instruction precision. Developers can inspect these benchmarks directly at /models/evals.',
            points: [
              'Task execution tracking with duration and status checks',
              'Direct comparisons between Gemini 3.8 Flash and leading alternative architectures'
            ]
          }
        ],
        conclusion: 'By providing transparent evaluation data and honest routing, FLOAT gives developers confidence in their AI-augmented workflow.'
      }
    },
    {
      id: 'diff-review-safety-first',
      category: 'Engineering',
      title: 'Human-in-the-Loop: Why Unconstrained Autonomous Edits Break Projects',
      excerpt: 'A deep dive into our Monaco diff review engine and why explicit human verification is critical for mission-critical software.',
      date: 'July 2026',
      readTime: '5 min read',
      featured: false,
      content: {
        intro: 'Modern coding models are capable of generating remarkable implementations in seconds. However, unconstrained file modifications frequently introduce subtle regressions, delete existing state, or violate typing conventions.',
        sections: [
          {
            title: 'Line-by-Line Verification',
            body: 'FLOAT’s diff review workflow ensures that every AI proposal is staged in a review buffer. The developer examines additions in green and deletions in red before any disk write occurs.',
            points: [
              'Side-by-side and unified diff options in Monaco',
              'Explicit Accept and Reject actions',
              'Preservation of user undo/redo stacks'
            ]
          }
        ],
        conclusion: 'AI should empower developer judgment, not replace it. Transparent diffs are the foundation of safe AI coding.'
      }
    }
  ];

  const categories = ['All', 'Announcements', 'Engineering', 'Product', 'Guides'];

  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'All') return articles;
    return articles.filter(a => a.category === selectedCategory);
  }, [articles, selectedCategory]);

  const featuredArticle = articles.find(a => a.featured) || articles[0];

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/blog" />

      <main className="flex-1 pt-28 pb-20 max-w-6xl mx-auto w-full px-6">
        {/* Title */}
        <div className="mb-10 pb-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1">
            <Newspaper size={14} />
            <span>FLOAT ENGINEERING & PRODUCT BLOG</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Articles & Insights
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            Technical write-ups, architecture breakdowns, and product updates from the FLOAT engineering team.
          </p>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 mt-6 overflow-x-auto no-scrollbar pb-1">
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
        </div>

        {/* Featured Article Card */}
        {featuredArticle && selectedCategory === 'All' && (
          <div className="mb-12 bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-10 shadow-sm relative overflow-hidden group">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 text-xs mb-3">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider text-[10px]">
                  Featured Article
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-slate-500 dark:text-[#8B949E]">{featuredArticle.date}</span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-slate-500 dark:text-[#8B949E]">{featuredArticle.readTime}</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white mb-3">
                {featuredArticle.title}
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-6">
                {featuredArticle.excerpt}
              </p>

              <button
                onClick={() => setActiveArticle(featuredArticle)}
                className="px-5 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Read Full Article</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {filteredArticles.map(article => (
            <article
              key={article.id}
              className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 dark:hover:border-white/20 transition-all"
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] mb-2.5">
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">{article.category}</span>
                  <span>·</span>
                  <span>{article.date}</span>
                  <span>·</span>
                  <span>{article.readTime}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 leading-snug">
                  {article.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-6">
                  {article.excerpt}
                </p>
              </div>

              <button
                onClick={() => setActiveArticle(article)}
                className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Read Article</span>
                <ArrowRight size={13} />
              </button>
            </article>
          ))}
        </div>

        {/* Blog Coming Soon Notice for Upcoming Series */}
        <section className="bg-slate-100/70 dark:bg-[#121212] border border-slate-200/80 dark:border-white/10 rounded-2xl p-6 sm:p-8 text-center max-w-3xl mx-auto">
          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={18} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            More Engineering Deep Dives in Progress
          </h3>
          <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-5 max-w-lg mx-auto">
            We are writing deep dives on agent task graphs, token budget optimization, and sandboxed test execution. In the meantime, explore our documentation or product changelog.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleNav('/resources/docs')}
              className="px-4 py-2 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-medium text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <BookOpen size={13} />
              <span>Read Documentation</span>
            </button>
            <button
              onClick={() => handleNav('/resources/changelog')}
              className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              View Changelog
            </button>
          </div>
        </section>
      </main>

      {/* Article Reader Modal */}
      {activeArticle && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActiveArticle(null)}
              className="absolute top-6 right-6 p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1">
              <span>{activeArticle.category}</span>
              <span aria-hidden="true">·</span>
              <span>{activeArticle.date}</span>
              <span aria-hidden="true">·</span>
              <span>{activeArticle.readTime}</span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white mb-4">
              {activeArticle.title}
            </h2>

            <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed pb-4 mb-6 border-b border-slate-100 dark:border-white/5 font-medium">
              {activeArticle.content.intro}
            </p>

            <div className="space-y-6">
              {activeArticle.content.sections.map((sec, idx) => (
                <div key={idx} className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {sec.title}
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {sec.body}
                  </p>
                  {sec.points && (
                    <ul className="space-y-1 pl-2 mt-2">
                      {sec.points.map((pt, pIdx) => (
                        <li key={pIdx} className="text-xs text-slate-600 dark:text-[#A1A1AA] flex items-start gap-2">
                          <CheckCircle2 size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-white block mb-1">Conclusion</span>
                {activeArticle.content.conclusion}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">FLOAT AI Articles</span>
              <button
                onClick={() => setActiveArticle(null)}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium cursor-pointer"
              >
                Close Article
              </button>
            </div>
          </div>
        </div>
      )}

      <ResourcesFooter />
    </div>
  );
}
