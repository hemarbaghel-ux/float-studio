import React, { useState, useEffect } from 'react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { ArrowRight, Sun, Moon, ChevronDown } from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { ProductsDropdown } from '../../components/ProductsDropdown';
import { PricingDropdown } from '../../components/PricingDropdown';
import { ResourcesDropdown } from '../../components/ResourcesDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';

export function LandingPage() {
  const { settings, toggleTheme, updateSettings } = useIDEStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleStart = (mode: 'signup' | 'signin' | React.MouseEvent = 'signup') => {
    if (user) {
      navigateTo('/dashboard');
      return;
    }
    const finalMode = typeof mode === 'string' && mode === 'signin' ? 'signin' : 'signup';
    const targetPath = finalMode === 'signin' ? '/sign-in' : '/sign-up';
    navigateTo(targetPath);
  };

  const handleExplore = () => {
    const target = document.getElementById('float-showcase');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigateTo('/features');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#02040A] text-slate-900 dark:text-[#EDEDED] font-sans overflow-x-hidden selection:bg-[#0070F3]/30 selection:text-white transition-colors">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-[#02040A]/85 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/[0.06] transition-colors">
        <div className="flex items-center gap-8">
          <a 
            href="/" 
            className="flex items-center gap-2.5 cursor-pointer group" 
            onClick={(e) => {
              e.preventDefault();
              if (window.location.pathname !== '/') {
                navigateTo('/');
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <FloatLogo size={34} className="w-[34px] h-[34px]" />
            <span className="flex items-center text-slate-900 dark:text-white">
              <FloatWordmark className="h-5 w-auto text-slate-900 dark:text-white tracking-wide" />
            </span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            {/* Studio (Active Tab with subtle blue indicator) */}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                if (window.location.pathname !== '/') {
                  navigateTo('/');
                } else {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="text-slate-900 dark:text-white transition-colors cursor-pointer relative py-1 flex flex-col items-center"
            >
              <span>Studio</span>
              <span className="w-5 h-0.5 bg-[#0070F3] shadow-[0_0_8px_#0070F3] rounded-full mx-auto block mt-1" />
            </a>

            {/* Models */}
            <a
              href="/models"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/models');
              }}
              className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
            >
              Models
            </a>

            {/* Developers */}
            <a
              href="/features"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/features');
              }}
              className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
            >
              Developers
            </a>

            {/* Resources */}
            <a
              href="/resources"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/resources');
              }}
              className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
            >
              Resources
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium">
          <LanguageDropdown />
          {/* Main Navigation Theme Toggle Button */}
          <button
            id="main-nav-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button 
            onClick={() => handleStart('signin')}
            className="px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/20 hover:border-slate-300 dark:hover:border-white/40 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer bg-slate-100/50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.06] backdrop-blur-sm"
          >
            {user ? 'Dashboard' : t('nav.signin', 'Log in')}
          </button>
          <button 
            onClick={() => handleStart('signup')}
            className="px-4.5 py-1.5 bg-[#0070F3] hover:bg-[#0060df] text-white rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-[0_0_20px_rgba(0,112,243,0.4)] hover:shadow-[0_0_30px_rgba(0,112,243,0.6)] transition-all cursor-pointer active:scale-95"
          >
            <span>{user ? 'Open Workspace' : 'Open FLOAT'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </nav>

      {/* Astra-Inspired AI Core Hero Section */}
      <section className="relative min-h-[92vh] flex flex-col justify-between items-center pt-28 pb-14 px-4 sm:px-6 overflow-hidden select-none bg-[#02040A]">
        {/* Subtle cosmic vignette & background gradient */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 65% 55% at 50% 48%, rgba(14, 165, 233, 0.1) 0%, rgba(2, 6, 23, 0.45) 55%, rgba(2, 4, 10, 0.98) 100%)'
          }}
          aria-hidden="true"
        />

        {/* Top subtle light ray / atmospheric depth */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[320px] bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.08)_0%,transparent_70%)] pointer-events-none"
          aria-hidden="true"
        />

        {/* Central Master Composition: FLOAT AI */}
        <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col items-center justify-center relative z-10 my-auto">
          <div className="w-full flex items-center justify-center">
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[9.5rem] xl:text-[11.5rem] font-bold tracking-tight text-white leading-none select-none drop-shadow-[0_0_50px_rgba(255,255,255,0.12)] text-center flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-10">
              <span>FLOAT</span>
              <span>AI</span>
            </h1>
          </div>

          {/* Subtitle Line */}
          <p className="text-sm sm:text-base md:text-lg text-zinc-300 font-light tracking-wide text-center max-w-xl mx-auto mt-6 sm:mt-8 mb-6 sm:mb-8 px-4">
            Intelligence in motion. Software without limits.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 w-full sm:w-auto px-4 z-20">
            <button
              onClick={() => handleStart('signup')}
              className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#0070F3] hover:bg-[#0060df] text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,112,243,0.45)] hover:shadow-[0_0_35px_rgba(0,112,243,0.7)] transition-all cursor-pointer active:scale-[0.98]"
            >
              <span>Start Building</span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={handleExplore}
              className="w-full sm:w-auto px-7 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white border border-white/20 hover:border-white/40 font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-[0.98]"
            >
              <span>Explore FLOAT</span>
            </button>
          </div>
        </div>

        {/* Bottom subtle scroll indicator / transition into showcase */}
        <div className="w-full flex justify-center pt-6 relative z-10">
          <button
            onClick={handleExplore}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-2 text-xs flex flex-col items-center gap-1 cursor-pointer"
            aria-label="Scroll to product features"
          >
            <span className="text-[10px] tracking-widest uppercase opacity-75">Explore Platform</span>
            <ChevronDown size={14} className="animate-bounce" />
          </button>
        </div>
      </section>

      {/* Product Showcase & Preview */}
      <main id="float-showcase" className="pt-20 pb-20 px-6 max-w-6xl mx-auto flex flex-col items-center justify-center text-center">
        <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-8 leading-[1.1] max-w-2xl text-slate-900 dark:text-white mx-auto">
          {t('hero.title_part1', 'FLOAT is your coding agent for')}<br className="hidden md:block" />
          {' '}{t('hero.title_part2', 'building ambitious software.')}
        </h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 w-full">
          <button 
            onClick={handleStart}
            className="group px-6 py-3 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity font-medium flex items-center justify-center gap-2 shadow-lg w-full sm:w-auto cursor-pointer"
          >
            {t('hero.download_windows', 'Open FLOAT')} <ArrowRight size={16} />
          </button>
        </div>

        {/* Mockup */}
        <div className="w-full relative">
          <div className="w-full aspect-[16/9] bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-2xl relative z-10">
            {/* Header */}
            <div className="h-10 bg-slate-100 dark:bg-[#1A1814] border-b border-slate-200 dark:border-white/5 flex items-center justify-center px-4 relative shrink-0">
              <div className="absolute left-4 flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
              </div>
              <div className="text-xs text-slate-500 dark:text-[#8B949E]">{t('preview.window_title', 'FLOAT Desktop')}</div>
            </div>
            {/* Split Pane */}
            <div className="flex h-[calc(100%-40px)]">
              {/* Sidebar */}
              <div className="w-64 border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#12100C] p-4 flex flex-col gap-4 text-left">
                 <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA] font-bold uppercase tracking-wider">{t('preview.in_progress', 'IN PROGRESS 1')}</div>
                 <div className="flex items-start gap-2">
                   <div className="text-slate-500 dark:text-[#A1A1AA] mt-0.5 animate-spin">⚙️</div>
                   <div>
                     <div className="text-sm font-medium text-slate-900 dark:text-white">{t('preview.plan_mission_control', 'Plan Mission Control')}</div>
                     <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">{t('preview.generating_plan', 'Generating plan')}</div>
                   </div>
                 </div>
                 <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA] font-bold uppercase tracking-wider mt-4">{t('preview.ready_for_review', 'READY FOR REVIEW 4')}</div>
                 <div className="flex items-start gap-2 opacity-60">
                   <div className="text-green-500 mt-0.5">✓</div>
                   <div className="flex-1">
                     <div className="flex justify-between items-center text-sm font-medium text-slate-900 dark:text-white">
                        <span>{t('preview.build_landing_page', 'Build Landing Page')}</span>
                        <span className="text-xs font-normal">{t('preview.now', 'now')}</span>
                     </div>
                     <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">{t('preview.done_fonts', 'Done. Fonts preload in the head...')}</div>
                   </div>
                 </div>
              </div>
              {/* Chat / Editor */}
              <div className="flex-1 flex bg-white dark:bg-[#161410] text-left">
                 <div className="w-1/2 p-6 flex flex-col gap-4 border-r border-slate-200 dark:border-white/5 relative overflow-hidden">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{t('preview.build_landing_page', 'Build Landing Page')}</div>
                    <div className="p-3 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-600 dark:text-[#A1A1AA]">
                      {t('preview.prompt_landing_page', 'make a landing page based on attached docs explaining what we do')}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-[#A1A1AA] flex flex-col gap-1">
                      <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> about-acme.md</div>
                      <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> brand-guidelines.pdf</div>
                      <div>{t('preview.thought_time', 'Thought 6s')}</div>
                    </div>
                    <div className="text-sm text-slate-800 dark:text-white">
                      {t('preview.agent_reply', "I'll create a minimal, serif-based landing page that matches your brand voice.")}
                    </div>
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="px-3 py-2 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <span className="text-slate-400 dark:text-[#A1A1AA]">📄</span> app/page.tsx
                        </div>
                        <span className="text-green-600 dark:text-green-500 text-xs font-mono">+52 -0</span>
                      </div>
                      <div className="px-3 py-2 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <span className="text-slate-400 dark:text-[#A1A1AA]">📄</span> app/globals.css
                        </div>
                        <span className="text-green-600 dark:text-green-500 text-xs font-mono">+18 -0</span>
                      </div>
                    </div>
                 </div>
                 {/* Code View */}
                 <div className="w-1/2 bg-slate-50 dark:bg-[#161410] p-6 text-sm font-serif text-slate-700 dark:text-[#D4D4D4]">
                    <div className="flex items-center gap-4 text-slate-500 dark:text-[#A1A1AA] mb-6 text-xs font-sans">
                      <span>←</span><span>→</span><span>↻</span>
                      <span className="flex-1 text-center font-mono bg-white dark:bg-[#1E1C18] border border-slate-200 dark:border-transparent py-1 rounded">http://localhost:3000</span>
                      <span>◫</span>
                    </div>
                    <h2 className="text-2xl text-slate-900 dark:text-white mb-4 italic">Acme Labs</h2>
                    <p className="mb-4 text-slate-600 dark:text-[#A1A1AA] text-base leading-relaxed font-sans">
                      {t('preview.acme_text_1', "Software creation is changing. We are a group of researchers, engineers, and technologists inventing at the edge of what's useful and possible.")}
                    </p>
                    <p className="text-slate-600 dark:text-[#A1A1AA] text-base mb-6 font-sans">
                      {t('preview.acme_text_2', 'We have much to learn, try, and build.')}
                    </p>
                    <button className="px-4 py-2 bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white rounded font-sans text-xs font-medium cursor-pointer">
                      {t('preview.see_projects', 'See projects')}
                    </button>
                 </div>
              </div>
            </div>
          </div>
          {/* Faded Background Element */}
          <div className="absolute -bottom-20 -left-10 -right-10 h-64 bg-gradient-to-b from-transparent to-slate-50 dark:to-[#02040A] z-20 pointer-events-none" />
        </div>
      </main>

      {/* Feature: Agents turn ideas into code */}
      <section className="py-32 max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl font-medium tracking-tight mb-4 text-slate-900 dark:text-white">
            {t('features.agents.title', 'Agents turn ideas into code')}
          </h2>
          <p className="text-slate-600 dark:text-[#A1A1AA] text-lg mb-8">
            {t('features.agents.desc', 'Accelerate development by handing off tasks to FLOAT, while you focus on making decisions.')}
          </p>
          <a 
            href="/learn/agentic-development" 
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/learn/agentic-development');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-[#FF5F56] hover:text-[#FF5F56]/80 font-medium flex items-center gap-2 cursor-pointer transition-colors"
          >
            {t('features.agents.cta', 'Learn about agentic development')} <ArrowRight size={16} />
          </a>
        </div>
        <div className="bg-white dark:bg-[#161410] rounded-xl border border-slate-200 dark:border-white/5 p-4 aspect-[4/3] flex items-center justify-center relative overflow-hidden shadow-sm">
           {/* Abstract Mockup */}
           <div className="absolute inset-4 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg p-4 flex flex-col gap-4 text-left">
             <div className="text-sm font-medium text-slate-900 dark:text-white">{t('preview.plan_mission_control', 'Plan Mission Control')}</div>
             <div className="text-sm text-slate-600 dark:text-[#A1A1AA]">{t('features.agents.mock_prompt', "let's build a mission control interface, similar to the expose-style window manager on macOS")}</div>
             <div className="mt-4 p-4 bg-white dark:bg-[#161410] rounded border border-slate-200 dark:border-white/5 flex flex-col gap-3">
               <div className="text-xs font-medium text-slate-500 dark:text-[#A1A1AA]">{t('features.agents.mock_q_title', 'Questions')}</div>
               <div className="text-sm text-slate-900 dark:text-white">{t('features.agents.mock_question', 'How should Mission Control be triggered?')}</div>
               <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#A1A1AA]"><span className="w-5 h-5 bg-slate-200 dark:bg-white/10 rounded flex items-center justify-center text-xs text-slate-900 dark:text-white">1</span> {t('features.agents.mock_opt1', 'Gesture (swipe up with 3 fingers)')}</div>
                 <div className="flex items-center gap-2 text-sm text-slate-900 dark:text-white"><span className="w-5 h-5 bg-[#FF5F56] rounded flex items-center justify-center text-xs text-white">2</span> {t('features.agents.mock_opt2', 'Keyboard shortcut (e.g. CMD+F3)')}</div>
                 <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#A1A1AA]"><span className="w-5 h-5 bg-slate-200 dark:bg-white/10 rounded flex items-center justify-center text-xs text-slate-900 dark:text-white">3</span> {t('features.agents.mock_opt3', 'Both keyboard and button')}</div>
               </div>
             </div>
           </div>
        </div>
      </section>

      {/* Feature: Full development lifecycle */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.lifecycle.title', 'Spans the full development lifecycle')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.lifecycle.desc', 'FLOAT supports every phase from planning to writing to reviewing code.')}
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.lifecycle.plan_title', 'Plan')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.lifecycle.plan_desc', 'For complex tasks, FLOAT asks clarifying questions, builds a plan, then executes in the background.')}</p>
              <a 
                href="/features/plan" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/plan');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 relative overflow-hidden h-64 shadow-xs">
               <div className="absolute inset-x-4 bottom-4 top-4 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg p-4">
                 <div className="text-xs font-medium text-slate-900 dark:text-white mb-2">{t('features.agents.mock_question', 'How should Mission Control be opened?')}</div>
                 <div className="flex flex-col gap-2">
                   <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA] flex items-center gap-1"><span className="bg-slate-200 dark:bg-white/10 px-1 rounded text-slate-900 dark:text-white">1</span> {t('features.agents.mock_opt1', 'Gesture (swipe up with 3 fingers)')}</div>
                   <div className="text-[10px] text-[#FF5F56] flex items-center gap-1"><span className="bg-[#FF5F56]/20 px-1 rounded">2</span> {t('features.agents.mock_opt2', 'Keyboard shortcut (e.g. CMD+F3)')}</div>
                   <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA] flex items-center gap-1"><span className="bg-slate-200 dark:bg-white/10 px-1 rounded text-slate-900 dark:text-white">3</span> {t('features.agents.mock_opt3', 'Both keyboard and button')}</div>
                 </div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.lifecycle.design_title', 'Design')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.lifecycle.design_desc', 'Visually edit any page by selecting an element to instantly rewrite, resize, or move it.')}</p>
              <a 
                href="/features/design" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/design');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 relative overflow-hidden h-64 font-serif text-slate-700 dark:text-[#D4D4D4] shadow-xs">
               <h4 className="text-lg text-slate-900 dark:text-white italic mb-2">Acme Labs</h4>
               <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-2 leading-relaxed font-sans">{t('preview.acme_text_1', "Software creation is changing. We are a group of researchers, engineers, and technologists inventing at the edge of what's useful and possible.")}</p>
               <div className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-4 font-sans">
                 <span className="bg-blue-500/20 text-blue-500 dark:text-blue-400 px-1 text-[10px] uppercase mr-1">JoinTeamLink &lt;a&gt;</span><br/>
                 <span className="border border-blue-500/50 p-0.5">{t('features.lifecycle.design_mock_join', 'Join our team →')}</span>
               </div>
               <div className="absolute bottom-4 left-4 right-4 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-2 rounded flex items-center justify-between font-sans">
                 <span className="text-[10px] text-slate-900 dark:text-white">{t('features.lifecycle.design_mock_btn', 'Make JoinTeamLink a button')}</span>
                 <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">↑</span>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.lifecycle.debug_title', 'Debug')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.lifecycle.debug_desc', 'FLOAT instruments your code and uses real execution data to pinpoint the fix.')}</p>
              <a 
                href="/features/debug" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/debug');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 relative overflow-hidden h-64 shadow-xs">
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg mb-4 text-xs text-slate-900 dark:text-white">
                 {t('features.lifecycle.debug_mock_issue', 'Chart tooltips freeze when hovering over data points.')}
               </div>
               <div className="flex flex-col gap-1 text-[10px] text-slate-600 dark:text-[#A1A1AA] mb-4">
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Checked')}</span> {t('features.lifecycle.debug_mock_check', 'server output')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Added')}</span> {t('features.lifecycle.debug_mock_logs', 'console logs')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Took')}</span> {t('features.lifecycle.debug_mock_screenshot', 'screenshot')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> ChartRenderer.tsx</div>
                 <div className="text-slate-900 dark:text-white font-medium mt-1">{t('features.lifecycle.debug_mock_found', 'Found it: stale closure in the hover handler.')}</div>
               </div>
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-2 rounded text-xs flex justify-between items-center text-slate-600 dark:text-[#A1A1AA]">
                 <span>📄 Tooltip.tsx</span>
                 <span className="text-green-600 dark:text-green-500 font-mono">+3 -1</span>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Real engineering */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.engineering.title', 'Equipped to do real engineering')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.engineering.desc', 'FLOAT edits files, runs terminal commands, searches the web, and more.')}
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.engineering.terminal_title', 'Terminal')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.engineering.terminal_desc', 'Run shell commands directly from FLOAT, from builds to tests to installs. Sandboxed by default.')}</p>
              <a 
                href="/features/terminal" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/terminal');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 font-mono text-[10px] shadow-xs">
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-2 rounded mb-2 text-slate-900 dark:text-white">{t('features.engineering.terminal_mock_input', 'build this project')}</div>
               <div className="text-slate-500 dark:text-[#A1A1AA] mb-2 flex flex-col gap-1">
                 <div>{t('features.engineering.terminal_mock_read', 'Read package.json')}</div>
                 <div>{t('features.engineering.terminal_mock_run', 'Ran terminal command')}</div>
               </div>
               <div className="bg-slate-900 text-slate-300 dark:bg-[#0A0A0A] border border-slate-700 dark:border-white/5 p-2 rounded">
                 <div className="text-white mb-1 font-semibold">$ npm run build</div>
                 <div>{t('features.engineering.terminal_mock_compiling', 'compiling (1047 modules)')}</div>
                 <div>{t('features.engineering.terminal_mock_collect', 'Collecting page data...')}</div>
                 <div>{t('features.engineering.terminal_mock_static', 'Generating static pages (48/48)')}</div>
                 <div>{t('features.engineering.terminal_mock_finalize', 'Finalizing page optimization...')}</div>
                 <div className="text-green-400 dark:text-green-500">{t('features.engineering.terminal_mock_success', '✓ Compiled successfully in 3.8s')}</div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.engineering.context_title', 'Add context')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.engineering.context_desc', 'Point FLOAT at exactly what matters with @-mentions and image uploads for reference.')}</p>
              <a 
                href="/features/add-context" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/add-context');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-end shadow-xs">
               <div className="w-full bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg text-sm text-slate-900 dark:text-white flex justify-between items-center shadow-sm">
                 <div>{t('features.engineering.context_mock_msg', 'Make drawer.tsx use vaul.emilkowal.ski and match our brand')}</div>
                 <div className="w-6 h-6 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center text-xs font-bold">↑</div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.engineering.git_title', 'Git & checkpoints')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.engineering.git_desc', 'See how your code has evolved, and roll back to a previous snapshot anytime.')}</p>
              <a 
                href="/features/git-checkpoints" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/git-checkpoints');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 text-[11px] flex flex-col gap-3 shadow-xs">
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_1', 'Set up Next.js project')}</span><span>Jan 8 —</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_2', 'Add Google OAuth')}</span><span>Jan 12 —</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_3', 'Build canvas editor')}</span><span>Jan 18 —</span></div>
               <div className="flex justify-between text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 px-2 py-1 rounded -mx-2 items-center font-medium">
                 <span className="flex items-center gap-2">{t('features.engineering.git_mock_4', 'Add multiplayer')} ↶</span>
                 <span>{t('features.engineering.git_time_yesterday', 'Yesterday —')}</span>
               </div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_5', 'Improve performance')}</span><span>{t('features.engineering.git_time_3h', '3h ago —')}</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_6', 'Add keyboard shortcuts')}</span><span>{t('features.engineering.git_time_1h', '1h ago —')}</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_7', 'Ship to production')}</span><span>{t('features.engineering.git_time_now', 'Now —')}</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Extend */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.extend.title', 'Extend with tools and knowledge')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.extend.desc', 'Give FLOAT your existing context, and add custom capabilities.')}
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.extend.plugins_title', 'Plugins')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.extend.plugins_desc', 'Browse and install community-built plugins to extend FLOAT with new capabilities.')}</p>
              <a 
                href="/features/plugins" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/plugins');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-center justify-center shadow-xs">
               <div className="w-full bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg p-2 shadow-sm">
                 <div className="text-amber-600 dark:text-[#FFBD2E] text-sm mb-2 px-2 font-mono">/add-plugin|</div>
                 <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA] px-2 mb-2 uppercase">{t('features.extend.add_plugin', 'Add plugin')}</div>
                 <div className="flex flex-col">
                   <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-xs text-slate-800 dark:text-white"><span className="text-[#E01E5A]">#</span> Slack Messaging Kit</div>
                   <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-xs text-slate-800 dark:text-white"><span className="text-[#F24E1E]">❖</span> Figma Visual Editor</div>
                   <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-xs text-slate-800 dark:text-white"><span className="font-bold">N</span> Notion Workspace Integration</div>
                 </div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.extend.skills_title', 'Skills')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.extend.skills_desc', 'Add domain knowledge to let FLOAT discover and run specialized prompts and code.')}</p>
              <a 
                href="/features/skills" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/skills');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#3A3930] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-center justify-center shadow-xs">
               <div className="w-full bg-white dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg p-2 shadow-sm relative">
                 <div className="text-slate-900 dark:text-white text-xs mb-3 px-2">{t('features.extend.skills_mock_prompt', "let's /apply-notion-styleguide and /|")}</div>
                 <div className="absolute top-10 left-0 right-0 bg-slate-50 dark:bg-[#2A2824] border border-slate-200 dark:border-white/10 rounded-lg p-2 shadow-xl z-10">
                   <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA] px-2 mb-2 uppercase">{t('features.extend.skills_label', 'Skills')}</div>
                   <div className="flex flex-col gap-2">
                     <div className="px-2 py-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded">
                       <div className="text-xs text-slate-900 dark:text-white font-medium">/fix-merge-conflicts</div>
                       <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.extend.skill_1_desc', 'Resolve git conflicts automatically')}</div>
                     </div>
                     <div className="px-2 py-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded">
                       <div className="text-xs text-slate-900 dark:text-white font-medium">/code-review</div>
                       <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.extend.skill_2_desc', 'Analyze code for issues and improvements')}</div>
                     </div>
                     <div className="px-2 py-1 bg-slate-200/80 dark:bg-white/5 rounded">
                       <div className="text-xs text-slate-900 dark:text-white font-medium">/apply-notion-styleguide</div>
                       <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.extend.skill_3_desc', 'Format code to match team standards')}</div>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.extend.mcp_title', 'MCP')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.extend.mcp_desc', 'Connect external tools and data sources like GitHub and Figma directly to FLOAT.')}</p>
              <a 
                href="/features/mcp" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/mcp');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-center justify-center relative overflow-hidden shadow-xs">
               <div className="w-16 h-16 bg-slate-900 dark:bg-white text-white dark:text-black rounded flex items-center justify-center relative z-10 shadow-lg">
                 <div className="w-8 h-8 bg-slate-100 dark:bg-[#161410] transform rotate-45" />
               </div>
               {/* Orbital icons */}
               <div className="absolute inset-0 opacity-20 text-slate-800 dark:text-white">
                  <div className="absolute top-8 left-1/2 -translate-x-1/2">❖</div>
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2">▲</div>
                  <div className="absolute left-8 top-1/2 -translate-y-1/2">N</div>
                  <div className="absolute right-8 top-1/2 -translate-y-1/2">🌐</div>
                  <div className="absolute top-1/4 left-1/4">#</div>
                  <div className="absolute bottom-1/4 right-1/4">⚡</div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Everywhere you work */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.everywhere.title', 'Everywhere you work')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">{t('features.everywhere.desc', 'One agent across every surface.')}</p>
        
        <div className="grid md:grid-cols-4 gap-6 text-left">
          {/* Desktop */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.everywhere.desktop_title', 'Desktop')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.everywhere.desktop_desc', 'Manual to agentic coding, in one familiar editor.')}</p>
              <a 
                href="/features/desktop" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/desktop');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-t-xl flex-1 pt-6 px-4 h-64 overflow-hidden border-b-0 shadow-xs">
               <div className="w-full h-full bg-slate-50 dark:bg-[#1E1C18] rounded-t-lg border border-slate-200 dark:border-white/10 p-4 border-b-0 text-xs text-slate-900 dark:text-white">
                 <div className="mb-4 text-slate-500 dark:text-[#A1A1AA]">{t('features.everywhere.desktop_mock_prompt', "let's add a spotlight-style search")}</div>
                 <div className="flex flex-col gap-1 text-slate-500 dark:text-[#A1A1AA]">
                   <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> App.tsx, Menu.tsx</div>
                   <div><span className="text-slate-900 dark:text-white font-medium">{t('features.engineering.git_mock_7', 'Searched')}</span> {t('features.everywhere.desktop_mock_search', '⌘K shortcut handlers')}</div>
                   <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Edited')}</span> {t('features.everywhere.desktop_mock_edit', 'Search.tsx')}</div>
                 </div>
                 <div className="mt-4 text-slate-800 dark:text-white font-medium">{t('features.everywhere.desktop_mock_done', 'Done. Press ⌘K to search files, actions, and...')}</div>
               </div>
            </div>
          </div>
          {/* CLI */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.everywhere.cli_title', 'CLI')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.everywhere.cli_desc', 'Run agents in any terminal, script, or editor.')}</p>
              <a 
                href="/features/cli" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/cli');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-t-xl flex-1 pt-6 px-4 h-64 overflow-hidden border-b-0 shadow-xs">
               <div className="w-full h-full bg-slate-900 dark:bg-[#0A0A0A] rounded-t-lg border border-slate-800 dark:border-white/10 p-4 border-b-0 font-mono text-[10px] text-slate-300 dark:text-[#A1A1AA]">
                 <div className="text-white font-bold mb-2">{t('features.everywhere.cli_mock_title', 'FLOAT Agent')}</div>
                 <div className="mb-4 text-slate-400">~/float/float-web</div>
                 <div className="text-white font-bold mb-4">{t('features.everywhere.cli_mock_task', 'Bioinformatics Tools')}</div>
                 <div className="mb-4 text-slate-200">{t('features.everywhere.cli_mock_text', "Add affine gap alignment. We only have linear alignment but I need Gotoh's algorithm for proper handling of indels. Also fix the...")}</div>
                 <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-white/20" /> {t('features.everywhere.cli_mock_thought', 'Thought 5s')}</div>
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white/20" /> {t('features.everywhere.cli_mock_read', 'Read bio/sequence_alignment.py')}</div>
               </div>
            </div>
          </div>
          {/* Other Surfaces */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.everywhere.other_title', 'Other Surfaces')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.everywhere.other_desc', 'Start agents from GitHub, Slack, Linear, JetBrains IDEs, and more.')}</p>
              <a 
                href="/features/other-surfaces" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/other-surfaces');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-t-xl flex-1 pt-6 px-4 h-64 overflow-hidden border-b-0 shadow-xs">
               <div className="w-full h-full bg-slate-50 dark:bg-[#1E1C18] rounded-t-lg border border-slate-200 dark:border-white/10 p-4 border-b-0 flex flex-col gap-4 text-[10px]">
                 <div className="flex gap-2">
                   <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-white/20 shrink-0" />
                   <div>
                     <div className="flex gap-2"><span className="text-slate-900 dark:text-white font-bold">leerob</span><span className="text-slate-500 dark:text-[#A1A1AA]">{t('features.everywhere.other_mock_ago5', '5m ago')}</span></div>
                     <div className="text-slate-700 dark:text-white">{t('features.everywhere.other_mock_pr', '@float can you review this PR?')}</div>
                   </div>
                 </div>
                 <div className="flex gap-2">
                   <div className="w-6 h-6 rounded bg-purple-600 text-white shrink-0 flex items-center justify-center font-bold text-[8px]">FL</div>
                   <div className="w-full">
                     <div className="flex gap-2"><span className="text-slate-900 dark:text-white font-bold">FLOAT <span className="bg-slate-200 dark:bg-white/10 px-1 rounded font-normal text-[8px]">{t('features.everywhere.other_mock_bot', 'bot')}</span></span><span className="text-slate-500 dark:text-[#A1A1AA]">{t('features.everywhere.other_mock_reviewed', 'reviewed 3m ago')}</span></div>
                     <div className="mt-2 bg-slate-900 dark:bg-[#0A0A0A] p-2 rounded border border-slate-800 dark:border-white/5 font-mono text-[8px] text-slate-300 dark:text-[#A1A1AA] overflow-hidden whitespace-nowrap">
                       <div className="text-white">src/vs/workbench/composer/...</div>
                       <div className="text-red-400">3292 - {'{selectedMode().k...'}</div>
                       <div className="text-green-400">3293 + {'{composerOpenMode...'}</div>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
          {/* Web & Mobile */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.everywhere.web_title', 'Web & Mobile')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.everywhere.web_desc', 'Run cloud agents from your browser or phone.')}</p>
              <a 
                href="/features/web-mobile" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/web-mobile');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-t-xl flex-1 pt-6 px-4 h-64 overflow-hidden border-b-0 flex justify-center shadow-xs">
               <div className="w-[80%] h-full bg-slate-50 dark:bg-[#1E1C18] rounded-t-3xl border-4 border-slate-800 dark:border-black p-4 border-b-0 text-[10px] flex flex-col gap-4">
                 <div className="flex items-center justify-between px-2">
                   <div className="w-4 h-4 bg-purple-600 rounded-sm transform rotate-45" />
                   <div className="flex gap-4 font-bold text-slate-900 dark:text-white"><span className="border-b-2 border-slate-900 dark:border-white pb-1">{t('features.everywhere.web_agent', 'Agent')}</span><span className="text-slate-500 dark:text-[#A1A1AA]">{t('features.everywhere.web_dashboard', 'Dashboard')}</span></div>
                 </div>
                 <div className="font-bold text-slate-500 dark:text-[#A1A1AA] mt-2">{t('features.everywhere.web_today', 'Today')}</div>
                 <div className="flex flex-col gap-3">
                   <div className="flex items-start gap-2">
                     <div className="mt-1 animate-spin text-slate-500 dark:text-[#A1A1AA]">⚙️</div>
                     <div>
                       <div className="text-slate-900 dark:text-white font-bold">{t('features.everywhere.web_task1_title', 'Vercel streaming SDK functionality')}</div>
                       <div className="text-slate-500 dark:text-[#A1A1AA] truncate">{t('features.everywhere.web_task1_desc', 'Analyzing codebase · dashboard-ui')}</div>
                     </div>
                   </div>
                   <div className="flex items-start gap-2">
                     <div className="mt-1 animate-spin text-slate-500 dark:text-[#A1A1AA]">⚙️</div>
                     <div>
                       <div className="text-slate-900 dark:text-white font-bold">{t('features.everywhere.web_task2_title', 'Model selector dropdown')}</div>
                       <div className="text-slate-500 dark:text-[#A1A1AA] truncate">{t('features.everywhere.web_task2_desc', 'Planning next moves · stripe-landing')}</div>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Codebase understanding */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.codebase.title', 'Understands your codebase, no matter the size')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.codebase.desc', 'FLOAT deeply learns your codebase before writing a single line.')}
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.codebase.models_title', 'Multiple models')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.codebase.models_desc', 'Subagents run in parallel to explore your codebase, with each one using the best model for the task.')}</p>
              <a 
                href="/features/multiple-models"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/multiple-models');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-4 h-64 overflow-hidden shadow-xs">
               <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-4 flex items-center justify-between">{t('features.codebase.models_mock_started', 'Started 4 subagents')} <span>∨</span></div>
               <div className="flex flex-col gap-2">
                 <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg flex items-center gap-3">
                   <div className="animate-spin text-slate-500 dark:text-[#A1A1AA]">⚙️</div>
                   <div>
                     <div className="text-sm font-medium text-slate-900 dark:text-white">{t('features.codebase.models_mock_task1', 'Set up model architecture')}</div>
                     <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.codebase.models_mock_task1_sub', 'Editing files • Opus-5')}</div>
                   </div>
                 </div>
                 <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg flex items-center gap-3">
                   <div className="animate-spin text-slate-500 dark:text-[#A1A1AA]">⚙️</div>
                   <div>
                     <div className="text-sm font-medium text-slate-900 dark:text-white">{t('features.codebase.models_mock_task2', 'Mission Control Interface')}</div>
                     <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.codebase.models_mock_task2_sub', 'Building dashboard • Grok 4.6')}</div>
                   </div>
                 </div>
                 <div className="bg-slate-50 dark:bg-[#161410] border border-slate-200 dark:border-white/5 p-3 rounded-lg flex items-center gap-3 opacity-60">
                   <div className="text-slate-500 dark:text-[#A1A1AA]">⚙️</div>
                   <div>
                     <div className="text-sm font-medium text-slate-900 dark:text-white">{t('features.codebase.models_mock_task3', 'Add evaluation metrics')}</div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.codebase.rules_title', 'Team rules')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.codebase.rules_desc', 'Teach FLOAT your preferences, from team conventions to specific architectural decisions.')}</p>
              <a 
                href="/features/team-rules" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/team-rules');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#3A3930] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex justify-center items-end overflow-hidden shadow-xs">
               <div className="w-full h-[90%] bg-white dark:bg-[#1E1C18] rounded-t-lg border border-slate-200 dark:border-white/10 p-4 border-b-0 font-mono text-[10px] text-slate-600 dark:text-[#A1A1AA] flex flex-col gap-2">
                 <div>---</div>
                 <div><span className="text-emerald-600 dark:text-[#7EE787]">description:</span> Notion-inspired block architecture</div>
                 <div><span className="text-emerald-600 dark:text-[#7EE787]">globs:</span> components/blocks/**/*.tsx</div>
                 <div>---</div>
                 <div className="mt-2 text-slate-900 dark:text-white font-bold"># Notion Block System</div>
                 <div className="mt-2 text-slate-900 dark:text-white font-bold">## Patterns</div>
                 <div>- Use `Block` components for all content types</div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.codebase.search_title', 'Fast codebase search')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.codebase.search_desc', 'Designed for large codebases, FLOAT uses Instant Grep to search millions of files in milliseconds.')}</p>
              <a 
                href="/features/codebase-search" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/codebase-search');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex flex-col justify-center shadow-xs">
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg text-xs text-slate-900 dark:text-white shadow-sm mb-4">
                 {t('features.codebase.search_mock_q', 'How does the payment flow handle failed transactions?')}
               </div>
               <div className="flex flex-col gap-2 text-[10px] text-slate-500 dark:text-[#A1A1AA] px-2">
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('features.codebase.search_mock_searched', 'Searched')}</span> {t('features.codebase.search_mock_s1', 'payment retry logic')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> checkout/PaymentService.ts</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> lib/stripe/webhooks.ts</div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product capabilities */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-4 text-center text-slate-900 dark:text-white">
          Coding tools in one browser workspace
        </h2>
        <p className="max-w-2xl mx-auto mb-12 text-center text-slate-600 dark:text-[#A1A1AA]">
          Explore a project, ask an AI model for help, review proposed changes, and keep your work organized in FLOAT.
        </p>
        <div className="grid md:grid-cols-3 gap-4 text-left">
          {[
            ['Work with your project', 'Browse files and edit code in the workspace.'],
            ['Choose an AI provider', 'Connect a provider key in settings and use the models available to your account.'],
            ['Review before applying', 'Inspect proposed code changes and validation output before accepting them.'],
          ].map(([title, description]) => (
            <div key={title} className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl p-6">
              <h3 className="text-slate-900 dark:text-white font-medium mb-2">{title}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature: Best Model / Agents / Enterprise */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('cards.best_model_title', 'Use the best model for every task')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('cards.best_model_desc', 'Connect a supported AI provider and choose from the models available to your account.')}</p>
              <a 
                href="/features/multiple-models"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/multiple-models');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('cards.best_model_cta', 'Explore models')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-[400px] flex items-center justify-center shadow-xs">
               <div className="w-full bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg shadow-2xl overflow-hidden text-sm relative pb-[200px]">
                 <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between text-slate-500 dark:text-[#A1A1AA]">
                   <div>{t('cards.ask_float', 'Ask FLOAT to plan or build anything')}</div>
                 </div>
                 <div className="p-3 flex items-center justify-between">
                   <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-white/5 px-2 py-1 rounded text-slate-900 dark:text-white">
                     <span>∞ Agent ∨</span>
                     <span className="text-slate-500 dark:text-[#A1A1AA]">{t('cards.auto', 'Auto')} ∨</span>
                   </div>
                   <div className="w-6 h-6 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center font-bold">↑</div>
                 </div>
                 {/* Dropdown popup */}
                 <div className="absolute bottom-16 left-24 right-8 bg-white dark:bg-[#2A2824] border border-slate-200 dark:border-white/10 rounded-lg shadow-2xl py-2 z-10 flex flex-col text-slate-800 dark:text-white">
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 flex justify-between"><span>{t('cards.auto', 'Auto')} <span className="text-slate-400 dark:text-[#A1A1AA] text-xs">{t('cards.suggested', 'Suggested')}</span></span><span>✓</span></div>
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">Grok 4.6</div>
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">GPT-5.6 Sol</div>
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">Fable 5.1 <span className="text-[#FF5F56] text-xs">Max</span></div>
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">Opus 5</div>
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">Gemini 3.1 Pro</div>
                   <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">Composer 2.5</div>
                 </div>
               </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('cards.autonomous_title', 'Review AI-assisted code changes')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('cards.autonomous_desc', 'Use FLOAT’s coding workspace to ask for changes, inspect the proposed diff, and decide what to apply.')}</p>
              <a 
                href="/features/agents" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/agents');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('cards.autonomous_cta', 'Explore the workspace')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#3A3930] border border-slate-200 dark:border-white/5 rounded-xl flex-1 pt-8 px-8 h-[400px] flex justify-center overflow-hidden border-b-0 shadow-xs">
               <div className="w-[85%] h-full bg-white dark:bg-[#161410] rounded-t-[3rem] border-8 border-slate-300 dark:border-[#1E1C18] p-6 border-b-0 relative shadow-md text-left">
                  {/* Dynamic Island */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1/3 h-5 bg-slate-800 dark:bg-[#1E1C18] rounded-full" />
                  <div className="mt-8">
                    <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{t('cards.all_repos', 'All Repos')}</h4>
                    <div className="text-xs text-slate-500 dark:text-[#A1A1AA] font-bold mb-4">{t('cards.recents', 'Recents')}</div>
                    <div className="flex flex-col gap-6">
                      <div className="flex gap-3">
                        <div className="text-purple-600 dark:text-[#A1A1AA] mt-0.5">❖</div>
                        <div>
                          <div className="text-slate-900 dark:text-white font-bold text-sm">{t('cards.repo_task1', 'Fix sign-in redirect on iOS')}</div>
                          <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">{t('cards.working', 'Working')} • float/mobile</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="text-purple-600 dark:text-[#A1A1AA] mt-0.5">❖</div>
                        <div>
                          <div className="text-slate-900 dark:text-white font-bold text-sm">{t('cards.repo_task2', 'Add rate limits to public routes')}</div>
                          <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">{t('cards.working', 'Working')} • float/api</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="text-purple-600 dark:text-[#A1A1AA] mt-0.5">❖</div>
                        <div>
                          <div className="text-slate-900 dark:text-white font-bold text-sm">{t('cards.repo_task3', 'Cache repository search results')}</div>
                          <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">{t('cards.working', 'Working')} • float/web</div>
                        </div>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('cards.enterprise_title', 'Develop enduring software')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('cards.enterprise_desc', 'Keep project files, AI conversations, and development tools together in one workspace.')}</p>
              <a 
                href="/features/enterprise" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/enterprise');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('cards.enterprise_cta', 'Explore the workspace')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-0 h-[400px] overflow-hidden relative shadow-xs">
               <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555099962-4199c345e5dd?q=80&w=2070')] bg-cover bg-center opacity-40 mix-blend-luminosity" />
               <div className="absolute inset-0 bg-gradient-to-t from-slate-100 dark:from-[#161410] to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-20 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5 text-center">
        <h2 className="text-3xl font-medium tracking-tight mb-4 text-slate-900 dark:text-white">Learn your way around FLOAT</h2>
        <p className="max-w-xl mx-auto mb-8 text-slate-600 dark:text-[#A1A1AA]">Read the documentation or browse guides before starting a workspace.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/resources/docs" className="px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5">Documentation</a>
          <a href="/resources/guides" className="px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5">Guides</a>
          <a href="/resources/help" className="px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5">Help center</a>
        </div>
      </section>

      {/* CTA */}
      <section className="py-40 flex flex-col items-center text-center border-t border-slate-200 dark:border-white/5">
        <h2 className="text-5xl md:text-7xl font-medium tracking-tight mb-12 text-slate-900 dark:text-white">
          {t('cta.title', 'Try FLOAT now.')}
        </h2>
        <button 
          onClick={handleStart}
          className="px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full hover:bg-slate-800 dark:hover:bg-white/90 transition-colors font-medium flex items-center gap-2 text-lg shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(255,255,255,0.2)] cursor-pointer"
        >
          Open FLOAT <ArrowRight size={20} />
        </button>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-200 dark:border-white/5 px-6 bg-slate-100 dark:bg-[#0A0A08] text-left">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-8 text-sm mb-16">
          <div className="flex flex-col gap-4">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">{t('footer.product', 'Product')}</h4>
            <a href="/features" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
            <a href="/pricing" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.pricing', 'Pricing')}</a>
            <a href="/models" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Models</a>
            <a href="/evals" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Evaluations</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">{t('footer.resources', 'Resources')}</h4>
            <a href="/resources/changelog" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.changelog', 'Changelog')}</a>
            <a href="/resources/docs" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.docs', 'Docs')}</a>
            <a href="/learn" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.learn', 'Learn')}</a>
            <a href="/resources" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.value_calculator', 'Resource Hub')}</a>
            <a href="/resources/help" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.help', 'Help')}</a>
            <a href="/models/usage" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Usage</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">{t('footer.legal', 'Legal')}</h4>
            <a href="/privacy" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Privacy &amp; Data Handling</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 dark:text-[#A1A1AA] gap-4">
          <div>{t('footer.copyright', '© 2026 FLOAT, Inc.')}</div>
        </div>
      </footer>
    </div>
  );
}
