import React from 'react';
import { FloatLogo } from '../../components/FloatLogo';
import { useTranslation } from '../../components/LanguageProvider';

export function ResourcesFooter() {
  const { t } = useTranslation();

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <footer className="py-16 border-t border-slate-200 dark:border-white/5 px-6 bg-slate-50 dark:bg-[#0A0A08] text-left transition-colors">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 text-sm mb-12">
        <div className="flex flex-col gap-3 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2">
            <FloatLogo className="w-5 h-5" />
            <span className="font-bold tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-[#A1A1AA] leading-relaxed">
            The AI-powered development platform for building ambitious software.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-slate-900 dark:text-white font-semibold text-xs tracking-wider uppercase">{t('footer.product', 'Product')}</h4>
          <a href="/features" onClick={(e) => { e.preventDefault(); handleNav('/features'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Feature Catalog</a>
          <a href="/" onClick={(e) => { e.preventDefault(); handleNav('/'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Workspace</a>
          <a href="/models" onClick={(e) => { e.preventDefault(); handleNav('/models'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">AI Models</a>
          <a href="/models/evals" onClick={(e) => { e.preventDefault(); handleNav('/models/evals'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Evaluations</a>
          <a href="/pricing" onClick={(e) => { e.preventDefault(); handleNav('/pricing'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Pricing</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-slate-900 dark:text-white font-semibold text-xs tracking-wider uppercase">{t('footer.resources', 'Resources')}</h4>
          <a href="/resources/docs" onClick={(e) => { e.preventDefault(); handleNav('/resources/docs'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Documentation</a>
          <a href="/resources/guides" onClick={(e) => { e.preventDefault(); handleNav('/resources/guides'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Tutorials & Guides</a>
          <a href="/resources/changelog" onClick={(e) => { e.preventDefault(); handleNav('/resources/changelog'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Changelog</a>
          <a href="/resources/help" onClick={(e) => { e.preventDefault(); handleNav('/resources/help'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Help Center</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-slate-900 dark:text-white font-semibold text-xs tracking-wider uppercase">{t('footer.community', 'Community')}</h4>
          <a href="/resources/community" onClick={(e) => { e.preventDefault(); handleNav('/resources/community'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Discussions</a>
          <a href="/resources/blog" onClick={(e) => { e.preventDefault(); handleNav('/resources/blog'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Blog</a>
          <a href="/resources/help#feedback" onClick={(e) => { e.preventDefault(); handleNav('/resources/help'); }} className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors text-xs cursor-pointer">Feedback</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-slate-900 dark:text-white font-semibold text-xs tracking-wider uppercase">{t('footer.legal', 'Platform')}</h4>
          <span className="text-slate-500 dark:text-[#8B949E] text-xs">React 19 & Monaco</span>
          <span className="text-slate-500 dark:text-[#8B949E] text-xs">Gemini & Multi-Model</span>
          <span className="text-slate-500 dark:text-[#8B949E] text-xs">Firebase Secured</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto pt-8 border-t border-slate-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-[#8B949E] gap-4">
        <span>&copy; {new Date().getFullYear()} FLOAT AI. All rights reserved.</span>
        <div className="flex items-center gap-6">
          <a href="/privacy" onClick={(e) => { e.preventDefault(); handleNav('/privacy'); }} className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Privacy Policy</a>
          <a href="/resources" onClick={(e) => { e.preventDefault(); handleNav('/resources'); }} className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Resource Hub</a>
          <a href="/resources/docs" onClick={(e) => { e.preventDefault(); handleNav('/resources/docs'); }} className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Docs Index</a>
          <a href="/pricing" onClick={(e) => { e.preventDefault(); handleNav('/pricing'); }} className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Pricing</a>
        </div>
      </div>
    </footer>
  );
}
