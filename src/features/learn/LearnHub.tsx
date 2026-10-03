import React, { useState, useMemo } from 'react';
import { LearnHeader } from './LearnHeader';
import { ResourcesFooter } from '../resources/ResourcesFooter';
import { 
  LEARN_ARTICLES, 
  START_HERE_ARTICLES, 
  GLOSSARY_TERMS, 
  LEARN_CATEGORIES 
} from './learnData';
import { 
  Search, 
  ArrowRight, 
  Bot, 
  Compass, 
  Sparkles, 
  Code2, 
  ShieldCheck, 
  Layers, 
  Wrench, 
  CheckCircle2, 
  Cpu, 
  Terminal, 
  BookOpen, 
  BookMarked,
  ExternalLink
} from 'lucide-react';

export function LearnHub() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  React.useEffect(() => {
    document.title = 'Learning Center — FLOAT';
  }, []);

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Search through all articles, tutorials, and glossary terms
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();

    const matchedArticles = Object.values(LEARN_ARTICLES).filter(art => 
      art.title.toLowerCase().includes(q) ||
      art.subtitle.toLowerCase().includes(q) ||
      art.summary.toLowerCase().includes(q) ||
      art.category.toLowerCase().includes(q)
    );

    const matchedGlossary = GLOSSARY_TERMS.filter(term =>
      term.term.toLowerCase().includes(q) ||
      term.definition.toLowerCase().includes(q)
    );

    return { articles: matchedArticles, glossary: matchedGlossary };
  }, [searchQuery]);

  // Filtered articles when not searching
  const filteredArticles = useMemo(() => {
    const list = Object.values(LEARN_ARTICLES);
    if (activeCategory === 'all') return list;
    if (activeCategory === 'foundations') return list.filter(a => a.category === 'Foundations');
    if (activeCategory === 'deep-dives') return list.filter(a => a.category === 'Deep Dives');
    if (activeCategory === 'engineering') return list.filter(a => a.category === 'Engineering & Security');
    if (activeCategory === 'tutorials') return list.filter(a => a.category === 'Hands-on Tutorials');
    return list;
  }, [activeCategory]);

  const getStartHereIcon = (iconName: string) => {
    switch (iconName) {
      case 'Bot': return <Bot size={20} className="text-[#FF5F56]" />;
      case 'Compass': return <Compass size={20} className="text-blue-500" />;
      case 'Sparkles': return <Sparkles size={20} className="text-amber-500" />;
      case 'Code2': return <Code2 size={20} className="text-purple-500" />;
      default: return <BookOpen size={20} className="text-slate-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white transition-colors flex flex-col">
      <LearnHeader currentPath="/learn" />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 max-w-5xl mx-auto w-full text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-4 tracking-wide uppercase">
          <span>FLOAT Learning Center</span>
          <span aria-hidden="true">·</span>
          <span>Agentic Development</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-medium tracking-tight mb-6 text-slate-900 dark:text-white leading-[1.15]">
          Learn to build with AI agents.
        </h1>

        <p className="text-lg md:text-xl text-slate-600 dark:text-[#A1A1AA] max-w-2xl mx-auto mb-10 leading-relaxed">
          Understand agentic development, explore practical workflows, and learn how to build, test, and ship software with FLOAT.
        </p>

        {/* Primary & Secondary Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <button
            onClick={() => handleNav('/learn/agentic-development')}
            className="w-full sm:w-auto px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <span>Start learning</span>
            <ArrowRight size={15} />
          </button>
          <button
            onClick={() => handleNav('/learn/tutorials')}
            className="w-full sm:w-auto px-6 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white rounded-full font-medium text-sm hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Explore tutorials</span>
          </button>
        </div>

        {/* Live Search Input */}
        <div className="max-w-2xl mx-auto relative text-left">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides, workflows, prompt techniques, and glossary..."
            className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-[#141412] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/20 transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 pb-24 w-full flex-1">
        {/* Render Search Results if searching */}
        {searchResults ? (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-200 dark:border-white/10">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Search Results for &ldquo;{searchQuery}&rdquo;
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {searchResults.articles.length + searchResults.glossary.length} matches
              </span>
            </div>

            {searchResults.articles.length === 0 && searchResults.glossary.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-[#121210] rounded-xl border border-slate-200 dark:border-white/5 p-8">
                <p className="text-slate-500 dark:text-slate-400 text-sm">No topics matched your search query. Try terms like &ldquo;agent&rdquo;, &ldquo;diff&rdquo;, &ldquo;context&rdquo;, or &ldquo;prompts&rdquo;.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {searchResults.articles.map(art => (
                  <div
                    key={art.slug}
                    onClick={() => handleNav(`/learn/${art.slug}`)}
                    className="p-5 bg-white dark:bg-[#141412] rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/20 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] mb-2">
                        <span>{art.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{art.readTime}</span>
                        <span aria-hidden="true">·</span>
                        <span>{art.level}</span>
                      </div>
                      <h3 className="font-semibold text-base text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors mb-1.5">
                        {art.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">
                        {art.summary}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-[#FF5F56] transition-colors">
                      <span>Read guide</span>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                ))}

                {searchResults.glossary.map(item => (
                  <div
                    key={item.slug}
                    onClick={() => handleNav('/learn/glossary')}
                    className="p-5 bg-white dark:bg-[#141412] rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/20 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] mb-2">
                        <span>Glossary</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.category}</span>
                      </div>
                      <h3 className="font-semibold text-base text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors mb-1.5">
                        {item.term}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">
                        {item.definition}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors">
                      <span>View in Glossary</span>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* START HERE Section */}
            <section className="mb-20">
              <div className="mb-6">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-1">
                  Start Here
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#A1A1AA]">
                  Essential introductory guides to build a strong foundation in agentic development with FLOAT.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {START_HERE_ARTICLES.map((card) => (
                  <div
                    key={card.slug}
                    onClick={() => handleNav(card.href)}
                    className="p-5 bg-white dark:bg-[#121210] rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                        {getStartHereIcon(card.icon)}
                      </div>
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors mb-2">
                        {card.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-4">
                        {card.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8B949E]">
                      <div className="flex items-center gap-1.5">
                        <span>{card.readTime}</span>
                        <span aria-hidden="true">·</span>
                        <span>{card.level}</span>
                      </div>
                      <ArrowRight size={13} className="text-slate-400 group-hover:text-[#FF5F56] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* CURATED LEARNING MODULES & GUIDES */}
            <section className="mb-20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-1">
                    Curriculum & Guides
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-[#A1A1AA]">
                    Systematic technical deep dives covering every layer of the agentic lifecycle.
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-white/5 rounded-lg overflow-x-auto no-scrollbar shrink-0">
                  {LEARN_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        activeCategory === cat.id
                          ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredArticles.map((article) => (
                  <div
                    key={article.slug}
                    onClick={() => handleNav(`/learn/${article.slug}`)}
                    className="p-6 bg-white dark:bg-[#121210] rounded-xl border border-slate-200/90 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      {/* Zero-Pill Metadata */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-[#8B949E] mb-2.5">
                        <span>{article.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{article.readTime}</span>
                        <span aria-hidden="true">·</span>
                        <span>{article.level}</span>
                      </div>

                      <h3 className="font-semibold text-base text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors mb-1.5">
                        {article.title}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed line-clamp-3 mb-4">
                        {article.summary}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-[#FF5F56] transition-colors">
                      <span>{article.isTutorial ? 'Follow tutorial' : 'Read guide'}</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* HANDS-ON TUTORIALS SPOTLIGHT */}
            <section className="mb-20 p-8 rounded-2xl bg-gradient-to-br from-slate-100 to-white dark:from-[#141412] dark:to-[#0F0F0B] border border-slate-200 dark:border-white/10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF5F56] uppercase tracking-wider mb-2">
                    <Sparkles size={14} />
                    <span>Hands-On Engineering</span>
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Step-by-Step Tutorials
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1 max-w-xl">
                    Follow guided walkthroughs to build real features, resolve production bugs, and connect automated PR reviews.
                  </p>
                </div>
                <button
                  onClick={() => handleNav('/learn/tutorials')}
                  className="shrink-0 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
                >
                  <span>View all 5 tutorials</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {Object.values(LEARN_ARTICLES).filter(a => a.isTutorial).slice(0, 4).map(tut => (
                  <div
                    key={tut.slug}
                    onClick={() => handleNav(`/learn/${tut.slug}`)}
                    className="p-5 bg-white dark:bg-[#1A1A18] rounded-xl border border-slate-200 dark:border-white/10 hover:border-[#FF5F56]/60 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                      <div className="flex items-center gap-2">
                        <span>{tut.readTime}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tut.level}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Interactive</span>
                    </div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors mb-1.5">
                      {tut.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">
                      {tut.summary}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* DEVELOPER GLOSSARY PREVIEW */}
            <section className="mb-20">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-1">
                    Developer Glossary
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-[#A1A1AA]">
                    Authoritative definitions of core concepts in agentic AI, ReAct, RAG, and codebase indexing.
                  </p>
                </div>
                <button
                  onClick={() => handleNav('/learn/glossary')}
                  className="text-xs font-semibold text-[#FF5F56] hover:opacity-80 flex items-center gap-1 transition-opacity cursor-pointer"
                >
                  <span>Explore A-Z Glossary</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {GLOSSARY_TERMS.slice(0, 6).map((term) => (
                  <div
                    key={term.slug}
                    onClick={() => handleNav('/learn/glossary')}
                    className="p-4 bg-white dark:bg-[#121210] rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/20 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-[#FF5F56]">{term.letter}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{term.category}</span>
                    </div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors mb-1">
                      {term.term}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-[#A1A1AA] line-clamp-2 leading-relaxed">
                      {term.definition}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* CALL TO ACTION: TRY IN FLOAT */}
            <section className="py-12 px-8 bg-slate-900 text-white dark:bg-white dark:text-black rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-lg">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight mb-2">
                  Ready to apply agentic development?
                </h3>
                <p className="text-sm text-slate-300 dark:text-slate-700 max-w-xl">
                  Launch the FLOAT workspace to experience multi-step autonomous planning, safe Monaco diff reviews, and multi-model routing on your own codebase.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleNav('/signup')}
                  className="px-5 py-2.5 bg-white text-slate-900 dark:bg-black dark:text-white rounded-full font-medium text-xs hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Open Workspace
                </button>
                <button
                  onClick={() => handleNav('/models')}
                  className="px-4 py-2.5 border border-white/20 dark:border-black/20 rounded-full font-medium text-xs hover:bg-white/10 dark:hover:bg-black/5 transition-colors cursor-pointer"
                >
                  Explore Models
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      <ResourcesFooter />
    </div>
  );
}
