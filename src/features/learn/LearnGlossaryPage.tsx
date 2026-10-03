import React, { useState, useMemo } from 'react';
import { LearnHeader } from './LearnHeader';
import { ResourcesFooter } from '../resources/ResourcesFooter';
import { GLOSSARY_TERMS, GlossaryTerm } from './learnData';
import { Search, ArrowRight, BookOpen, ChevronRight } from 'lucide-react';

export function LearnGlossaryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string>('All');

  React.useEffect(() => {
    document.title = 'Developer Glossary — FLOAT Learning Center';
  }, []);

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Get distinct letters present in the glossary
  const alphabet = useMemo(() => {
    const letters = new Set(GLOSSARY_TERMS.map(t => t.letter));
    return ['All', ...Array.from(letters).sort()];
  }, []);

  // Filtered terms
  const filteredTerms = useMemo(() => {
    return GLOSSARY_TERMS.filter(term => {
      const matchesSearch = 
        !searchQuery.trim() ||
        term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.definition.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesLetter = selectedLetter === 'All' || term.letter === selectedLetter;

      return matchesSearch && matchesLetter;
    });
  }, [searchQuery, selectedLetter]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white transition-colors flex flex-col">
      <LearnHeader currentPath="/learn/glossary" />

      <main className="pt-32 pb-24 max-w-5xl mx-auto px-6 w-full flex-1">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#8B949E] mb-6">
          <a href="/learn" onClick={(e) => { e.preventDefault(); handleNav('/learn'); }} className="hover:underline">Learn</a>
          <ChevronRight size={12} />
          <span className="text-slate-900 dark:text-white">Glossary</span>
        </nav>

        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-3">
            Developer Glossary
          </h1>
          <p className="text-base text-slate-600 dark:text-[#A1A1AA] max-w-2xl leading-relaxed">
            Essential terminology for agentic software engineering, LLM reasoning, codebase context systems, and automated evaluation metrics.
          </p>
        </div>

        {/* Search Bar & Alphabet Filter */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search glossary terms..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#141412] border border-slate-200 dark:border-white/10 rounded-xl text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Alphabet Index */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            {alphabet.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(letter)}
                className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
                  selectedLetter === letter
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-bold'
                    : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        {/* Terms Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {filteredTerms.map((item) => (
            <div
              key={item.slug}
              className="p-6 bg-white dark:bg-[#121210] rounded-xl border border-slate-200/90 dark:border-white/10 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-[#FF5F56]">{item.letter}</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{item.category}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {item.term}
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-[#D4D4D8] mb-3 leading-relaxed">
                  {item.definition}
                </p>
                <p className="text-xs text-slate-500 dark:text-[#A1A1AA] leading-relaxed">
                  {item.explanation}
                </p>
              </div>

              {item.relatedSlugs.length > 0 && (
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">Related:</span>
                  <div className="flex flex-wrap gap-2">
                    {item.relatedSlugs.map(slug => (
                      <a
                        key={slug}
                        href={`/learn/${slug}`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleNav(`/learn/${slug}`);
                        }}
                        className="text-[#FF5F56] hover:underline cursor-pointer text-[11px] font-medium"
                      >
                        {slug.replace('-', ' ')}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredTerms.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-[#121210] rounded-xl border border-slate-200 dark:border-white/5">
            <p className="text-slate-500 text-sm">No glossary terms found matching your filter.</p>
          </div>
        )}
      </main>

      <ResourcesFooter />
    </div>
  );
}
