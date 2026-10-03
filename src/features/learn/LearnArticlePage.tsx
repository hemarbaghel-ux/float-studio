import React, { useState, useEffect } from 'react';
import { LearnHeader } from './LearnHeader';
import { ResourcesFooter } from '../resources/ResourcesFooter';
import { 
  LEARN_ARTICLES, 
  LearnArticle, 
  LearnSection 
} from './learnData';
import { 
  Check, 
  Copy, 
  ChevronRight, 
  ArrowLeft, 
  ArrowRight, 
  BookOpen, 
  Info, 
  AlertTriangle, 
  Lightbulb, 
  Zap, 
  CheckCircle2, 
  Search, 
  X, 
  ExternalLink,
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface LearnArticlePageProps {
  slug: string;
}

export function LearnArticlePage({ slug }: LearnArticlePageProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState<'yes' | 'no' | null>(null);

  const article: LearnArticle | undefined = LEARN_ARTICLES[slug];

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — FLOAT Learning Center`;
      window.scrollTo(0, 0);
    }
  }, [slug, article]);

  const handleNav = (href: string) => {
    setMobileDrawerOpen(false);
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const copyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!article) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col">
        <LearnHeader currentPath={`/learn/${slug}`} />
        <main className="flex-1 max-w-4xl mx-auto px-6 pt-40 pb-20 text-center">
          <h1 className="text-3xl font-bold mb-4">Guide Not Found</h1>
          <p className="text-slate-600 dark:text-[#A1A1AA] mb-8">
            The guide or tutorial &ldquo;{slug}&rdquo; could not be located in the curriculum.
          </p>
          <button
            onClick={() => handleNav('/learn')}
            className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full text-sm font-medium hover:opacity-90"
          >
            Back to Learning Center Hub
          </button>
        </main>
        <ResourcesFooter />
      </div>
    );
  }

  const prevArticle = article.prevSlug ? LEARN_ARTICLES[article.prevSlug] : null;
  const nextArticle = article.nextSlug ? LEARN_ARTICLES[article.nextSlug] : null;

  // Grouped articles for the sidebar
  const categories = ['Foundations', 'Deep Dives', 'Engineering & Security', 'Hands-on Tutorials'];

  const filteredArticles = Object.values(LEARN_ARTICLES).filter(a =>
    a.title.toLowerCase().includes(sidebarFilter.toLowerCase()) ||
    a.category.toLowerCase().includes(sidebarFilter.toLowerCase())
  );

  const renderCallout = (callout: NonNullable<LearnSection['callout']>) => {
    switch (callout.type) {
      case 'tip':
        return (
          <div className="my-6 p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200 flex gap-3 text-sm">
            <Lightbulb size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div>
              <div className="font-semibold mb-1 text-emerald-950 dark:text-emerald-100">{callout.title}</div>
              <div className="leading-relaxed opacity-95">{callout.text}</div>
            </div>
          </div>
        );
      case 'warning':
        return (
          <div className="my-6 p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 flex gap-3 text-sm">
            <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <div className="font-semibold mb-1 text-amber-950 dark:text-amber-100">{callout.title}</div>
              <div className="leading-relaxed opacity-95">{callout.text}</div>
            </div>
          </div>
        );
      case 'insight':
        return (
          <div className="my-6 p-4 rounded-xl bg-purple-50/80 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 text-purple-900 dark:text-purple-200 flex gap-3 text-sm">
            <Zap size={18} className="shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
            <div>
              <div className="font-semibold mb-1 text-purple-950 dark:text-purple-100">{callout.title}</div>
              <div className="leading-relaxed opacity-95">{callout.text}</div>
            </div>
          </div>
        );
      default:
        return (
          <div className="my-6 p-4 rounded-xl bg-slate-100 dark:bg-[#161614] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 flex gap-3 text-sm">
            <Info size={18} className="shrink-0 text-blue-500 mt-0.5" />
            <div>
              <div className="font-semibold mb-1 text-slate-900 dark:text-white">{callout.title}</div>
              <div className="leading-relaxed opacity-90">{callout.text}</div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white transition-colors flex flex-col">
      <LearnHeader 
        currentPath={`/learn/${slug}`} 
        articleTitle={article.title} 
        categoryTitle={article.category} 
        onOpenMobileMenu={() => setMobileDrawerOpen(true)}
      />

      <div className="pt-28 max-w-7xl mx-auto px-6 w-full flex-1 flex gap-10">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:block w-64 shrink-0 py-6 sticky top-28 h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar">
          <div className="mb-4">
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                placeholder="Filter topics..."
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#141412] border border-slate-200 dark:border-[#2A2A2A] rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="space-y-6">
            {categories.map((cat) => {
              const items = filteredArticles.filter(a => a.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-2">
                    {cat}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const isActive = item.slug === slug;
                      return (
                        <a
                          key={item.slug}
                          href={`/learn/${item.slug}`}
                          onClick={(e) => {
                            e.preventDefault();
                            handleNav(`/learn/${item.slug}`);
                          }}
                          className={`block px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                              : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="truncate">{item.title}</div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="pt-4 border-t border-slate-200 dark:border-[#2A2A2A] px-2">
              <a
                href="/learn/glossary"
                onClick={(e) => { e.preventDefault(); handleNav('/learn/glossary'); }}
                className="text-xs font-medium text-slate-600 dark:text-[#A1A1AA] hover:text-[#FF5F56] transition-colors flex items-center gap-1.5"
              >
                <BookOpen size={13} />
                <span>Developer Glossary</span>
              </a>
            </div>
          </div>
        </aside>

        {/* MOBILE SLIDE-OUT DRAWER */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-80 max-w-[85vw] bg-white dark:bg-[#121210] p-6 h-full flex flex-col z-10 shadow-2xl overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A2A2A] mb-4">
                <span className="font-semibold text-sm">Curriculum Navigation</span>
                <button 
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-6 flex-1">
                {categories.map((cat) => {
                  const items = Object.values(LEARN_ARTICLES).filter(a => a.category === cat);
                  return (
                    <div key={cat}>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        {cat}
                      </div>
                      <div className="space-y-1">
                        {items.map((item) => (
                          <button
                            key={item.slug}
                            onClick={() => handleNav(`/learn/${item.slug}`)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              item.slug === slug
                                ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                                : 'text-slate-600 dark:text-[#A1A1AA]'
                            }`}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CENTRAL ARTICLE COLUMN */}
        <article className="flex-1 max-w-3xl py-6 min-w-0">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#8B949E] mb-6">
            <a href="/learn" onClick={(e) => { e.preventDefault(); handleNav('/learn'); }} className="hover:underline">Learn</a>
            <ChevronRight size={12} />
            <span>{article.category}</span>
            <ChevronRight size={12} />
            <span className="text-slate-900 dark:text-white truncate">{article.title}</span>
          </nav>

          {/* Title & Subtitle */}
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2 leading-tight">
            {article.title}
          </h1>

          <p className="text-base text-slate-600 dark:text-[#A1A1AA] mb-6 font-normal">
            {article.subtitle}
          </p>

          {/* Zero-Pill Metadata Line */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] pb-6 mb-8 border-b border-slate-200 dark:border-white/10">
            <span>{article.readTime}</span>
            <span aria-hidden="true">·</span>
            <span>{article.level}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {article.updatedAt}</span>
          </div>

          {/* Executive Summary Callout */}
          <div className="p-5 rounded-xl bg-slate-100/80 dark:bg-[#141412] border border-slate-200 dark:border-white/5 mb-10 text-sm leading-relaxed text-slate-700 dark:text-[#D4D4D8]">
            {article.summary}
          </div>

          {/* Prerequisites (if tutorial) */}
          {article.prerequisites && article.prerequisites.length > 0 && (
            <div className="mb-10 p-5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/40 text-xs">
              <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2 uppercase tracking-wide">
                Prerequisites
              </div>
              <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                {article.prerequisites.map((p, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-blue-600 dark:text-blue-400" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Takeaways */}
          <div className="mb-12">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Key Objectives
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {article.keyTakeaways.map((item, idx) => (
                <div key={idx} className="p-3 bg-white dark:bg-[#121210] rounded-lg border border-slate-200 dark:border-white/10 text-xs flex items-start gap-2.5">
                  <CheckCircle2 size={15} className="text-[#FF5F56] shrink-0 mt-0.5" />
                  <span className="text-slate-700 dark:text-slate-300 leading-normal">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main Article Sections */}
          <div className="space-y-12">
            {article.sections.map((section, secIdx) => (
              <section key={section.id} id={section.id} className="scroll-mt-36">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white mb-4">
                  {section.heading}
                </h2>

                <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-[#D4D4D8] leading-relaxed space-y-4">
                  {section.content.split('\n\n').map((paragraph, pIdx) => (
                    <p key={pIdx}>{paragraph}</p>
                  ))}
                </div>

                {section.callout && renderCallout(section.callout)}

                {section.codeSnippet && (
                  <div className="my-6 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-[#1E1E1E] text-slate-100 shadow-md">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-white/5 text-xs text-slate-400 font-mono">
                      <span>{section.codeSnippet.filename || section.codeSnippet.language}</span>
                      <button
                        onClick={() => copyCode(section.codeSnippet!.code, secIdx)}
                        className="flex items-center gap-1 text-[11px] hover:text-white transition-colors cursor-pointer"
                        title="Copy code to clipboard"
                      >
                        {copiedIndex === secIdx ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed text-slate-200">
                      <code>{section.codeSnippet.code}</code>
                    </pre>
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Feedback & Interaction */}
          <div className="mt-16 pt-8 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Was this guide helpful?
            </div>
            <div className="flex items-center gap-2">
              {feedbackGiven ? (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Thank you for your feedback!
                </span>
              ) : (
                <>
                  <button
                    onClick={() => setFeedbackGiven('yes')}
                    className="px-3 py-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-xs hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setFeedbackGiven('no')}
                    className="px-3 py-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-xs hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                  >
                    No
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Navigation Previous / Next Cards */}
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            {prevArticle ? (
              <div
                onClick={() => handleNav(`/learn/${prevArticle.slug}`)}
                className="p-4 bg-white dark:bg-[#121210] rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                  <ArrowLeft size={12} />
                  <span>Previous</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors truncate">
                  {prevArticle.title}
                </div>
              </div>
            ) : <div />}

            {nextArticle ? (
              <div
                onClick={() => handleNav(`/learn/${nextArticle.slug}`)}
                className="p-4 bg-white dark:bg-[#121210] rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/20 transition-all cursor-pointer group text-right"
              >
                <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400 mb-1">
                  <span>Next</span>
                  <ArrowRight size={12} />
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors truncate">
                  {nextArticle.title}
                </div>
              </div>
            ) : <div />}
          </div>

          {/* Try in FLOAT CTA Banner */}
          <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white dark:from-[#181816] dark:to-[#121210] border border-slate-200/20 dark:border-white/10 flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold mb-1">Try this in FLOAT</div>
              <div className="text-xs text-slate-300 dark:text-[#A1A1AA]">
                Apply these concepts directly in the Monaco IDE with autonomous agents.
              </div>
            </div>
            <button
              onClick={() => handleNav('/signup')}
              className="px-4 py-2 bg-white text-slate-900 dark:bg-white dark:text-black rounded-full font-medium text-xs hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
            >
              Open Workspace
            </button>
          </div>
        </article>

        {/* RIGHT SIDEBAR: TABLE OF CONTENTS */}
        <nav className="hidden lg:block w-56 shrink-0 py-6 sticky top-28 h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 px-2">
            On this page
          </div>
          <ul className="space-y-2 text-xs">
            {article.sections.map((sec) => (
              <li key={sec.id}>
                <a
                  href={`#${sec.id}`}
                  className="block px-2 py-1 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors leading-snug"
                >
                  {sec.heading}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#2A2A2A] px-2">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            >
              Back to top ↑
            </button>
          </div>
        </nav>
      </div>

      <ResourcesFooter />
    </div>
  );
}
