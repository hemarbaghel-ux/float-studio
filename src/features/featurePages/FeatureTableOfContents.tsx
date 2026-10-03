import React, { useState, useEffect, useRef } from 'react';
import { 
  List, 
  ChevronRight, 
  ChevronDown, 
  ArrowUp, 
  Link2, 
  Check, 
  Sparkles, 
  Compass 
} from 'lucide-react';

export interface TocItem {
  id: string;
  title: string;
  badge?: string;
  level?: number;
}

interface FeatureTableOfContentsProps {
  contentRef?: React.RefObject<HTMLElement | null>;
  slug?: string;
  className?: string;
  variant?: 'both' | 'desktop' | 'mobile';
}

const DEFAULT_FEATURE_SECTIONS: TocItem[] = [
  { id: 'overview', title: 'What It Does' },
  { id: 'how-it-works', title: 'How It Works' },
  { id: 'practical-example', title: 'Practical Example' },
  { id: 'key-capabilities', title: 'Key Capabilities' },
  { id: 'when-to-use', title: 'When To Use' },
  { id: 'integrations', title: 'Workflow & Integrations' },
  { id: 'specifications', title: 'Requirements & Limits' },
  { id: 'faq', title: 'Frequently Asked Questions' },
  { id: 'related-features', title: 'Related Features' },
];

export function FeatureTableOfContents({ 
  contentRef, 
  slug, 
  className = '',
  variant = 'both'
}: FeatureTableOfContentsProps) {
  const [items, setItems] = useState<TocItem[]>(DEFAULT_FEATURE_SECTIONS);
  const [activeId, setActiveId] = useState<string>('overview');
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 1. Auto-generate TOC items by scanning the DOM inside contentRef (or document)
  useEffect(() => {
    const scanSections = () => {
      const container = contentRef?.current || document.querySelector('main') || document;
      const sectionElements = container.querySelectorAll<HTMLElement>('[data-toc-title], section[id]');

      if (sectionElements.length > 0) {
        const discovered: TocItem[] = [];
        sectionElements.forEach((el) => {
          const id = el.id || el.getAttribute('id');
          if (!id) return;
          
          // Get title from data-toc-title or first h2/h3
          const title = el.getAttribute('data-toc-title') || 
                        el.querySelector('h2, h3')?.textContent?.trim() || 
                        id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          
          const badge = el.getAttribute('data-toc-badge') || undefined;

          // Prevent duplicates
          if (!discovered.some((item) => item.id === id)) {
            discovered.push({ id, title, badge });
          }
        });

        if (discovered.length > 0) {
          setItems(discovered);
        }
      } else {
        setItems(DEFAULT_FEATURE_SECTIONS);
      }
    };

    // Run scan on mount or when slug / ref changes
    const timer = setTimeout(scanSections, 50);
    return () => clearTimeout(timer);
  }, [contentRef, slug]);

  // 2. Track active section using IntersectionObserver and scroll listener
  useEffect(() => {
    const handleScroll = () => {
      // Calculate scroll progress percentage
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100));
        setScrollProgress(progress);
      }

      // If at bottom of page, activate last item
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50) {
        if (items.length > 0) {
          setActiveId(items[items.length - 1].id);
        }
        return;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // IntersectionObserver to detect active visible section
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.2, 0.5]
      }
    );

    // Observe each section element
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [items]);

  // 3. Smooth scroll navigation handler
  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (!element) return;

    // Header offset compensation
    const headerOffset = 90;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });

    setActiveId(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  const copySectionLink = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const activeTitle = items.find((i) => i.id === activeId)?.title || 'Contents';

  const renderMobile = (
    <div className="w-full bg-slate-50/95 dark:bg-[#0F0F0B]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2A2A2A] px-6 py-2.5 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white transition-colors cursor-pointer truncate"
          aria-expanded={mobileMenuOpen}
          aria-label="Table of contents menu"
        >
          <List size={14} className="text-[#FF5F56] shrink-0" />
          <span className="text-slate-400 dark:text-slate-500 font-normal">Jump to:</span>
          <span className="font-semibold text-slate-900 dark:text-white truncate">{activeTitle}</span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-slate-400">
            {Math.round(scrollProgress)}%
          </span>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            title="Back to top"
            aria-label="Back to top"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[#2A2A2A] max-h-72 overflow-y-auto py-2 space-y-1">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isActive 
                    ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-semibold' 
                    : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <span>{item.title}</span>
                {isActive && <ChevronRight size={12} className="text-[#FF5F56]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderDesktop = (
    <nav
      aria-label="Table of contents"
      className={`select-none ${className}`}
    >
      <div className="p-4 bg-white/70 dark:bg-[#161410]/80 backdrop-blur-md border border-slate-200/80 dark:border-[#2A2A2A] rounded-2xl shadow-xs">
        {/* Header & Progress Indicator */}
        <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100 dark:border-[#2A2A2A]">
          <div className="flex items-center gap-2">
            <Compass size={14} className="text-[#FF5F56]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              On this page
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {Math.round(scrollProgress)}%
          </span>
        </div>

        {/* Reading progress track bar */}
        <div className="w-full h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden mb-3.5">
          <div
            className="h-full bg-gradient-to-r from-[#FF5F56] to-amber-500 transition-all duration-150 ease-out"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>

        {/* Section Items with Active Rail Indicator */}
        <div className="relative pl-3 space-y-0.5">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-1 bottom-1 w-[1.5px] bg-slate-200 dark:bg-white/10" />

          {items.map((item) => {
            const isActive = activeId === item.id;
            const isCopied = copiedId === item.id;

            return (
              <div
                key={item.id}
                className="relative group flex items-center justify-between"
              >
                {/* Active pip on the vertical line */}
                {isActive && (
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-3 bg-[#FF5F56] rounded-r transition-all" />
                )}

                <button
                  onClick={() => scrollToSection(item.id)}
                  className={`flex-1 text-left py-1.5 px-2 rounded-md text-xs transition-colors truncate cursor-pointer ${
                    isActive
                      ? 'text-slate-900 dark:text-white font-medium bg-slate-100 dark:bg-white/5'
                      : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                  }`}
                  title={item.title}
                >
                  <span className="truncate block">{item.title}</span>
                </button>

                {/* Copy section link button on hover */}
                <button
                  onClick={(e) => copySectionLink(e, item.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity ml-1 rounded cursor-pointer"
                  title="Copy link to section"
                  aria-label={`Copy link to ${item.title}`}
                >
                  {isCopied ? (
                    <Check size={11} className="text-emerald-500" />
                  ) : (
                    <Link2 size={11} />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#2A2A2A] flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer text-[11px]"
          >
            <ArrowUp size={12} />
            <span>Back to top</span>
          </button>

          <span className="text-[10px] text-slate-400/80 font-mono">
            {items.length} sections
          </span>
        </div>
      </div>
    </nav>
  );

  if (variant === 'mobile') {
    return renderMobile;
  }

  if (variant === 'desktop') {
    return renderDesktop;
  }

  return (
    <>
      <div className="lg:hidden sticky top-16 z-30">
        {renderMobile}
      </div>
      <div className="hidden lg:block">
        {renderDesktop}
      </div>
    </>
  );
}
