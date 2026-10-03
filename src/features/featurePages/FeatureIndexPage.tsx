import React from 'react';
import { ALL_FEATURES, FEATURE_CATEGORIES } from './featureData';
import { ResourcesHeader } from '../resources/ResourcesHeader';
import { ResourcesFooter } from '../resources/ResourcesFooter';
import { ArrowRight, Sparkles, Layers } from 'lucide-react';

export function FeatureIndexPage() {
  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-[#EDEDED] font-sans selection:bg-[#7C3AED]/20 dark:selection:bg-white/10 transition-colors">
      <ResourcesHeader currentPath="/features" />

      {/* Hero */}
      <section className="pt-36 pb-16 px-6 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-slate-200/80 dark:bg-white/10 text-slate-800 dark:text-slate-200 mb-6">
          <Layers size={12} className="text-[#FF5F56]" />
          Platform Architecture &amp; Capabilities
        </div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight mb-6 text-slate-900 dark:text-white">
          FLOAT Feature Catalog
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-[#A1A1AA] max-w-2xl mx-auto leading-relaxed mb-8">
          Detailed architectural breakdowns, workflows, engineering examples, and specifications for every capability in FLOAT.
        </p>
      </section>

      {/* Categories Grid */}
      <section className="pb-32 px-6 max-w-6xl mx-auto flex flex-col gap-16">
        {FEATURE_CATEGORIES.map((cat, idx) => {
          const categoryFeatures = ALL_FEATURES.filter((f) => cat.slugs.includes(f.slug));
          return (
            <div key={idx} className="text-left border-t border-slate-200 dark:border-white/5 pt-10">
              <div className="mb-6">
                <h2 className="text-2xl font-medium text-slate-900 dark:text-white tracking-tight mb-1">
                  {cat.title}
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#A1A1AA]">
                  {cat.description}
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {categoryFeatures.map((feat) => (
                  <a
                    key={feat.slug}
                    href={`/features/${feat.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNav(`/features/${feat.slug}`);
                    }}
                    className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 rounded-xl hover:border-slate-400 dark:hover:border-white/20 transition-all shadow-xs flex flex-col justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#FF5F56] uppercase tracking-wider">{feat.title}</span>
                        <span className="text-[10px] text-slate-400 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded font-mono">{feat.requirementsAndLimitations.availabilityStatus}</span>
                      </div>
                      <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2 group-hover:text-[#FF5F56] transition-colors">
                        {feat.headline}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-6">
                        {feat.introParagraph.slice(0, 140)}...
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF5F56] pt-4 border-t border-slate-100 dark:border-white/5">
                      <span>Explore {feat.title}</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <ResourcesFooter />
    </div>
  );
}
