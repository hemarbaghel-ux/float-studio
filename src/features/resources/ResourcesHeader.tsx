import React from 'react';
import { FloatLogo } from '../../components/FloatLogo';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { ProductsDropdown } from '../../components/ProductsDropdown';
import { PricingDropdown } from '../../components/PricingDropdown';
import { ResourcesDropdown } from '../../components/ResourcesDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';
import { useIDEStore } from '../../store';
import { Sun, Moon } from 'lucide-react';

interface ResourcesHeaderProps {
  currentPath: string;
}

export function ResourcesHeader({ currentPath }: ResourcesHeaderProps) {
  const { settings, toggleTheme } = useIDEStore();
  const { t } = useTranslation();

  const handleStart = (mode?: string) => {
    const target = mode === 'signin' ? '/login' : '/signup';
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const navLinks = [
    { label: 'Features', href: '/features' },
    { label: 'Learning Center', href: '/learn' },
    { label: t('resources.tab_overview', 'Overview'), href: '/resources' },
    { label: t('resources.tab_docs', 'Docs'), href: '/resources/docs' },
    { label: t('resources.tab_guides', 'Guides'), href: '/resources/guides' },
    { label: t('resources.tab_changelog', 'Changelog'), href: '/resources/changelog' },
    { label: t('resources.tab_help', 'Help Center'), href: '/resources/help' },
    { label: t('resources.tab_blog', 'Blog'), href: '/resources/blog' },
    { label: t('resources.tab_community', 'Community'), href: '/resources/community' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#0F0F0B]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-white/5 transition-colors">
      {/* Top Navbar */}
      <nav className="flex items-center justify-between px-6 py-3.5 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <a 
            href="/" 
            className="flex items-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/30 rounded-sm"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            <FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-[#A1A1AA]">
            <ModelsDropdown currentPath={currentPath} />
            <ProductsDropdown currentPath={currentPath} />
            <PricingDropdown currentPath={currentPath} />
            <ResourcesDropdown currentPath={currentPath} />
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm font-medium">
          <LanguageDropdown />
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-slate-200 dark:border-white/15 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/30"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button 
            onClick={() => handleStart('signin')}
            className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors hidden sm:block cursor-pointer px-2 py-1"
          >
            {t('nav.signin', 'Sign in')}
          </button>
          <button 
            onClick={() => handleStart('signup')}
            className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity font-semibold cursor-pointer"
          >
            {t('nav.download', 'Download')}
          </button>
        </div>
      </nav>

      {/* Resources Subnav */}
      <div className="border-t border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-6 overflow-x-auto no-scrollbar py-2 text-xs font-medium">
          <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold text-[10px] hidden sm:inline">
            Resources
          </span>
          <div className="flex items-center gap-1 sm:gap-2">
            {navLinks.map((link) => {
              const isCurrent = currentPath === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.pushState({}, '', link.href);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
