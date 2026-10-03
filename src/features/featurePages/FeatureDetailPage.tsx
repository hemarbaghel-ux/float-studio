import React, { useState, useEffect, useRef } from 'react';
import { FeatureDetail } from './types';
import { getFeatureBySlug, ALL_FEATURES } from './featureData';
import { FeatureMockup } from './FeatureMockups';
import { FeatureTableOfContents } from './FeatureTableOfContents';
import { ResourcesHeader } from '../resources/ResourcesHeader';
import { ResourcesFooter } from '../resources/ResourcesFooter';
import { ArrowRight, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Sparkles, Layers, ShieldCheck, HelpCircle } from 'lucide-react';

interface FeatureDetailPageProps {
  slug: string;
}

export function FeatureDetailPage({ slug }: FeatureDetailPageProps) {
  const feature = getFeatureBySlug(slug);
  const [openFaqIndices, setOpenFaqIndices] = useState<number[]>([0]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!feature) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-white flex flex-col justify-between">
        <ResourcesHeader currentPath={`/features/${slug}`} />
        <main className="max-w-3xl mx-auto px-6 py-40 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-6">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-3xl font-bold mb-3">Feature Page Not Found</h1>
          <p className="text-slate-600 dark:text-[#A1A1AA] mb-8">
            The feature page <span className="font-mono text-rose-400">/features/{slug}</span> does not exist or may have been renamed.
          </p>
          <a
            href="/features"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/features');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-black font-semibold rounded-full hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            Explore all features <ArrowRight size={16} />
          </a>
        </main>
        <ResourcesFooter />
      </div>
    );
  }

  const toggleFaq = (idx: number) => {
    setOpenFaqIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-[#EDEDED] font-sans selection:bg-[#7C3AED]/20 dark:selection:bg-white/10 transition-colors">
      <ResourcesHeader currentPath={`/features/${feature.slug}`} />

      {/* Mobile Sticky Table of Contents Quick Jump Bar */}
      <div className="lg:hidden sticky top-16 z-30">
        <FeatureTableOfContents 
          variant="mobile" 
          contentRef={contentRef} 
          slug={feature.slug} 
        />
      </div>

      {/* 1. HERO SECTION */}
      <section className="pt-32 pb-16 px-6 max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-slate-200/80 dark:bg-white/10 text-slate-800 dark:text-slate-200 mb-6">
            <Sparkles size={12} className="text-[#FF5F56]" />
            {feature.badgeCategory}
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6 leading-[1.1] text-slate-900 dark:text-white">
            {feature.title}: {feature.headline}
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-8">
            {feature.introParagraph}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <a
              href={feature.primaryAction.href}
              onClick={(e) => {
                e.preventDefault();
                handleNav(feature.primaryAction.href);
              }}
              className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-black font-semibold rounded-full hover:opacity-90 transition-opacity flex items-center justify-center gap-2 w-full sm:w-auto shadow-md"
            >
              {feature.primaryAction.label} <ArrowRight size={16} />
            </a>
            <a
              href={feature.secondaryAction.href}
              onClick={(e) => {
                e.preventDefault();
                handleNav(feature.secondaryAction.href);
              }}
              className="px-6 py-3 border border-slate-300 dark:border-white/15 text-slate-700 dark:text-[#EDEDED] font-medium rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {feature.secondaryAction.label}
            </a>
          </div>
        </div>

        {/* Hero Interactive / Visual Demonstration */}
        <div className="w-full max-w-4xl mx-auto">
          <FeatureMockup feature={feature} />
        </div>
      </section>

      {/* 2 to 10. DOCUMENTATION BODY WITH AUTO-GENERATING STICKY TABLE OF CONTENTS */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 flex flex-col lg:flex-row gap-12 items-start justify-center border-t border-slate-200 dark:border-white/5">
        {/* Main Content Column */}
        <div ref={contentRef} className="flex-1 w-full max-w-4xl min-w-0 space-y-20">
          {/* 2. WHAT IT DOES */}
          <section id="overview" data-toc-title="What It Does" className="scroll-mt-28">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Overview</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-8">
              What it is & why it matters
            </h2>

            <div className="grid md:grid-cols-2 gap-8 text-left">
              <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 rounded-xl shadow-xs">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">The Problem It Solves</h3>
                <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  {feature.whatItDoes.problemSolved}
                </p>
              </div>
              <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 rounded-xl shadow-xs">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Who Benefits & Workflow Fit</h3>
                <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  {feature.whatItDoes.targetAudience} {feature.whatItDoes.workflowFit}
                </p>
              </div>
            </div>
          </section>

          {/* 3. HOW IT WORKS (NUMBERED STEPS) */}
          <section id="how-it-works" data-toc-title="How It Works" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Workflow</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-4">
              How it works in practice
            </h2>
            <p className="text-slate-600 dark:text-[#A1A1AA] text-base mb-12 max-w-2xl">
              A transparent breakdown of developer interactions, internal system processing, and explicit approval checkpoints.
            </p>

            <div className="flex flex-col gap-6">
              {feature.howItWorks.map((step) => (
                <div
                  key={step.stepNumber}
                  className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 md:p-8 rounded-xl shadow-xs text-left"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[#FF5F56] text-white flex items-center justify-center font-bold text-sm shrink-0">
                      {step.stepNumber}
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                      {step.title}
                    </h3>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Developer Action:</div>
                      <p className="text-slate-600 dark:text-[#A1A1AA] mb-4">{step.developerAction}</p>

                      <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">FLOAT System Action:</div>
                      <p className="text-slate-600 dark:text-[#A1A1AA]">{step.floatAction}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#1E1C18] p-4 rounded-lg border border-slate-200 dark:border-white/5">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8B949E] mb-1">Involved Artifacts</div>
                      <div className="text-xs font-mono text-slate-700 dark:text-slate-300 mb-3">{step.involvedArtifacts}</div>

                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8B949E] mb-1">Output Produced</div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 mb-3">{step.outputProduced}</div>

                      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Human Review & Approval</div>
                      <div className="text-xs text-slate-700 dark:text-slate-300">{step.inspectionAndApproval}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 4. PRACTICAL EXAMPLE */}
          <section id="practical-example" data-toc-title="Practical Example" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Real Scenario</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-4">
              Practical engineering example
            </h2>
            <p className="text-slate-600 dark:text-[#A1A1AA] text-base mb-8">
              {feature.practicalExample.scenarioTitle}
            </p>

            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl p-6 md:p-8 shadow-xs">
              <div className="mb-6">
                <span className="text-xs font-bold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider block mb-1">Starting Problem</span>
                <p className="text-sm text-slate-800 dark:text-slate-200">{feature.practicalExample.problem}</p>
              </div>

              <div className="mb-6">
                <span className="text-xs font-bold text-[#FF5F56] uppercase tracking-wider block mb-1">Developer Instruction</span>
                <div className="p-3 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-mono text-slate-900 dark:text-white">
                  {feature.practicalExample.developerPrompt}
                </div>
              </div>

              <div className="mb-6">
                <span className="text-xs font-bold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider block mb-2">Execution Process</span>
                <ul className="space-y-1.5 text-sm text-slate-600 dark:text-[#A1A1AA]">
                  {feature.practicalExample.executionProcess.map((proc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#FF5F56] mt-0.5">›</span>
                      <span>{proc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-6">
                <span className="text-xs font-bold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider block mb-2">Resulting Code / Diff Output</span>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed">
                  <pre>{feature.practicalExample.codeOrDiffSnippet}</pre>
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0" />
                <span><strong>Verification:</strong> {feature.practicalExample.verificationStep}</span>
              </div>
            </div>
          </section>

          {/* 5. KEY CAPABILITIES */}
          <section id="key-capabilities" data-toc-title="Key Capabilities" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Features</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-8">
              Key capabilities
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {feature.keyCapabilities.map((cap, i) => (
                <div key={i} className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 rounded-xl shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="font-semibold text-base text-slate-900 dark:text-white mb-2">{cap.name}</h3>
                    <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-4">{cap.description}</p>
                  </div>
                  <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Benefit: {cap.practicalBenefit}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 6. WHEN TO USE IT */}
          <section id="when-to-use" data-toc-title="When To Use" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Use Cases</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-8">
              When to use {feature.title}
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {feature.whenToUseScenarios.map((scen, i) => (
                <div key={i} className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 rounded-xl shadow-xs">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center font-bold text-slate-900 dark:text-white mb-3">
                    {i + 1}
                  </div>
                  <h3 className="font-medium text-base text-slate-900 dark:text-white mb-2">{scen.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">{scen.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 7. WORKFLOW AND INTEGRATIONS */}
          <section id="integrations" data-toc-title="Workflow & Integrations" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Connected System</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-4">
              Workflow & related integrations
            </h2>
            <p className="text-slate-600 dark:text-[#A1A1AA] text-base mb-8">
              {feature.workflowAndIntegrations.leadText}
            </p>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {feature.workflowAndIntegrations.connectedTools.map((tool) => (
                <a
                  key={tool.slug}
                  href={`/features/${tool.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNav(`/features/${tool.slug}`);
                  }}
                  className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-4 rounded-xl hover:border-slate-400 dark:hover:border-white/20 transition-all cursor-pointer shadow-xs block"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center justify-between mb-1">
                    <span>{tool.name}</span>
                    <ArrowRight size={14} className="text-[#FF5F56]" />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">{tool.role}</div>
                </a>
              ))}
            </div>
          </section>

          {/* 8. REQUIREMENTS AND LIMITATIONS */}
          <section id="specifications" data-toc-title="Requirements & Limits" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Honest Specifications</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-8">
              Requirements & operational limitations
            </h2>

            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl p-6 md:p-8 shadow-xs">
              <div className="grid sm:grid-cols-3 gap-6 mb-6 pb-6 border-b border-slate-200 dark:border-white/5">
                <div>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E] uppercase font-bold block mb-1">Status</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {feature.requirementsAndLimitations.availabilityStatus}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E] uppercase font-bold block mb-1">Authentication</span>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {feature.requirementsAndLimitations.authRequired ? 'Required (Free or Pro account)' : 'None (Available publicly)'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E] uppercase font-bold block mb-1">API Key Needed</span>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {feature.requirementsAndLimitations.providerKeyRequired ? 'Required (BYOK or managed plan)' : 'Managed by FLOAT'}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">Environment Notes:</span>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">{feature.requirementsAndLimitations.environmentNotes}</p>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">Known Technical Boundaries:</span>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-[#A1A1AA]">
                  {feature.requirementsAndLimitations.knownLimitations.map((lim, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">•</span>
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 9. FAQ ACCORDION */}
          <section id="faq" data-toc-title="Frequently Asked Questions" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Frequently Asked</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-8">
              Frequently asked questions about {feature.title}
            </h2>

            <div className="flex flex-col gap-3">
              {feature.faq.map((item, idx) => {
                const isOpen = openFaqIndices.includes(idx);
                return (
                  <div
                    key={idx}
                    className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden transition-colors"
                  >
                    <button
                      onClick={() => toggleFaq(idx)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left font-medium text-sm text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <span>{item.question}</span>
                      {isOpen ? <ChevronUp size={16} className="text-[#FF5F56]" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-4 pt-1 text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed border-t border-slate-100 dark:border-white/5">
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 10. RELATED FEATURES */}
          <section id="related-features" data-toc-title="Related Features" className="scroll-mt-28 pt-16 border-t border-slate-200 dark:border-white/5 text-left">
            <div className="text-xs uppercase tracking-widest text-[#FF5F56] font-bold mb-2">Explore Next</div>
            <h2 className="text-3xl font-medium text-slate-900 dark:text-white tracking-tight mb-8">
              Related features
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {feature.relatedFeatures.map((rel) => (
                <a
                  key={rel.slug}
                  href={`/features/${rel.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNav(`/features/${rel.slug}`);
                  }}
                  className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-6 rounded-xl hover:border-slate-400 dark:hover:border-white/20 transition-all shadow-xs flex flex-col justify-between cursor-pointer group"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF5F56] mb-1 block">{rel.category}</span>
                    <h3 className="font-semibold text-base text-slate-900 dark:text-white mb-2 group-hover:text-[#FF5F56] transition-colors">{rel.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-4">{rel.description}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-[#FF5F56]">
                    Learn more <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </a>
              ))}
            </div>
          </section>
        </div>

        {/* Desktop Sticky Rail Table of Contents */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-28 self-start max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar">
          <FeatureTableOfContents 
            variant="desktop" 
            contentRef={contentRef} 
            slug={feature.slug} 
          />
        </aside>
      </div>

      {/* 11. FINAL CALL TO ACTION */}
      <section className="py-28 border-t border-slate-200 dark:border-white/5 px-6 bg-slate-900 dark:bg-black text-white text-center">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
            Build with {feature.title} in FLOAT
          </h2>
          <p className="text-slate-400 text-lg mb-8 max-w-xl">
            Experience real AI-driven development. Available today on web and desktop.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a
              href={feature.primaryAction.href}
              onClick={(e) => {
                e.preventDefault();
                handleNav(feature.primaryAction.href);
              }}
              className="px-8 py-3.5 bg-white text-black font-semibold rounded-full hover:bg-slate-200 transition-colors shadow-lg cursor-pointer"
            >
              {feature.primaryAction.label}
            </a>
            <a
              href="/features"
              onClick={(e) => {
                e.preventDefault();
                handleNav('/features');
              }}
              className="px-8 py-3.5 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              Explore all features
            </a>
          </div>
        </div>
      </section>

      <ResourcesFooter />
    </div>
  );
}
