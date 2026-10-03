import React from 'react';
import { FloatLogo } from '../../components/FloatLogo';
import { FloatWordmark } from '../../components/FloatWordmark';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { ProductsDropdown } from '../../components/ProductsDropdown';
import { PricingDropdown } from '../../components/PricingDropdown';
import { ResourcesDropdown } from '../../components/ResourcesDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';
import { useIDEStore } from '../../store';
import { Sun, Moon, GraduationCap, ChevronRight, BookOpen } from 'lucide-react';

interface LearnHeaderProps {
  currentPath: string;
  articleTitle?: string;
  categoryTitle?: string;
  onOpenMobileMenu?: () => void;
}

export function LearnHeader({ currentPath, articleTitle, categoryTitle, onOpenMobileMenu }: LearnHeaderProps) {
  const { settings, toggleTheme } = useIDEStore();
  const { t } = useTranslation();

  const handleNav = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleStart = (mode?: string) => {
    const target = mode === 'signin' ? '/login' : '/signup';
    handleNav(target);
  };

  const navLinks = [
    { label: 'Overview', href: '/learn' },
    { label: 'Agentic Development', href: '/learn/agentic-development' },
    { label: 'Getting Started', href: '/learn/getting-started' },
    { label: 'Tutorials', href: '/learn/tutorials' },
    { label: 'Glossary', href: '/learn/glossary' },
    { label: 'Core Docs', href: '/resources/docs' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#0A0A08]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-white/5 transition-colors">
      {/* Top Brand Navbar */}
      <nav className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <a 
            href="/" 
            className="flex items-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/30 rounded-sm"
            onClick={(e) => {
              e.preventDefault();
              handleNav('/');
            }}
          >
            <FloatLogo className="w-6 h-6" />
            <span className="flex items-center text-slate-900 dark:text-white">
              <FloatWordmark className="h-4 w-auto" />
            </span>
          </a>

          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-[#A1A1AA]">
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
            {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button 
            onClick={() => handleStart('signin')}
            className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors hidden sm:block cursor-pointer px-2 py-1 text-xs"
          >
            {t('nav.signin', 'Sign in')}
          </button>
          <button 
            onClick={() => handleStart('signup')}
            className="px-3.5 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity font-medium text-xs cursor-pointer shadow-sm"
          >
            {t('nav.download', 'Get Started')}
          </button>
        </div>
      </nav>

      {/* Learning Center Subnavigation & Breadcrumbs */}
      <div className="border-t border-slate-200/60 dark:border-white/5 bg-slate-50/70 dark:bg-black/30">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between py-2 text-xs">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5">
            <a 
              href="/learn" 
              onClick={(e) => { e.preventDefault(); handleNav('/learn'); }}
              className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white hover:opacity-80 transition-opacity shrink-0"
            >
              <GraduationCap size={15} className="text-[#FF5F56]" />
              <span className="tracking-tight uppercase text-[11px] font-bold">Learn</span>
            </a>

            {/* Breadcrumb tail if inside an article */}
            {categoryTitle && articleTitle && (
              <div className="hidden md:flex items-center gap-1.5 text-slate-400 dark:text-slate-500 shrink-0 text-[11px]">
                <ChevronRight size={12} />
                <span>{categoryTitle}</span>
                <ChevronRight size={12} />
                <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-xs">{articleTitle}</span>
              </div>
            )}

            <div className="h-3 w-px bg-slate-200 dark:bg-white/10 mx-1 hidden sm:block" />

            <div className="flex items-center gap-1">
              {navLinks.map((link) => {
                const isCurrent = currentPath === link.href || (link.href === '/learn/tutorials' && currentPath.startsWith('/learn/tutorials'));
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleNav(link.href);
                    }}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs font-medium whitespace-nowrap ${
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

          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-200/80 dark:bg-white/10 rounded-md shrink-0 cursor-pointer"
            >
              <BookOpen size={13} />
              <span>Topics</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
