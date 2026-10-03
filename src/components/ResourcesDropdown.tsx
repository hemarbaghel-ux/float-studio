import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, BookOpen, Newspaper, History, HelpCircle, Users, Compass, ArrowRight, GraduationCap } from 'lucide-react';
import { useTranslation } from './LanguageProvider';

interface ResourcesDropdownProps {
  currentPath?: string;
}

export function ResourcesDropdown({ currentPath }: ResourcesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = currentPath?.startsWith('/resources') || currentPath?.startsWith('/learn');

  const resources = [
    {
      name: 'Learning Center',
      desc: 'Master agentic development, multi-step workflows, and prompts.',
      href: '/learn',
      icon: <GraduationCap size={16} className="text-[#FF5F56]" />
    },
    {
      name: t('resources.docs', 'Documentation'),
      desc: t('resources.docs_desc', 'Explore guides, API references, and FLOAT workflows.'),
      href: '/resources/docs',
      icon: <BookOpen size={16} className="text-purple-600 dark:text-purple-400" />
    },
    {
      name: t('resources.guides', 'Tutorials & Guides'),
      desc: t('resources.guides_desc', 'Step-by-step tutorials for building and editing code with AI.'),
      href: '/resources/guides',
      icon: <Compass size={16} className="text-blue-600 dark:text-blue-400" />
    },
    {
      name: t('resources.changelog', 'Changelog'),
      desc: t('resources.changelog_desc', 'Chronological product updates, additions, and fixes.'),
      href: '/resources/changelog',
      icon: <History size={16} className="text-emerald-600 dark:text-emerald-400" />
    },
    {
      name: t('resources.help', 'Help Center'),
      desc: t('resources.help_desc', 'FAQs, troubleshooting, accounts, and editor assistance.'),
      href: '/resources/help',
      icon: <HelpCircle size={16} className="text-amber-600 dark:text-amber-400" />
    },
    {
      name: t('resources.blog', 'Blog'),
      desc: t('resources.blog_desc', 'Product announcements, engineering updates, and insights.'),
      href: '/resources/blog',
      icon: <Newspaper size={16} className="text-indigo-600 dark:text-indigo-400" />
    },
    {
      name: t('resources.community', 'Community'),
      desc: t('resources.community_desc', 'Connect with developers, share projects, and give feedback.'),
      href: '/resources/community',
      icon: <Users size={16} className="text-rose-600 dark:text-rose-400" />
    }
  ];

  const handleNavigate = (href: string) => {
    setIsOpen(false);
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div 
      className="relative" 
      ref={dropdownRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/30 rounded-sm cursor-pointer ${
          isActive || isOpen
            ? 'text-slate-900 dark:text-white pb-1'
            : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white pb-1'
        }`}
        aria-expanded={isOpen}
      >
        {t('nav.resources', 'Resources')}
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-1/2 -translate-x-1/2 md:left-auto md:right-0 md:translate-x-0 mt-2 w-80 md:w-96 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col py-2"
          >
            <div className="grid grid-cols-1 gap-1 px-2">
              {resources.map((item, idx) => (
                <a
                  key={idx}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate(item.href);
                  }}
                  className="p-2.5 rounded-lg flex items-start gap-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    {item.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {item.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-[#A1A1AA] line-clamp-1">
                      {item.desc}
                    </span>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 px-4 pb-1 flex items-center justify-between">
              <a
                href="/resources"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigate('/resources');
                }}
                className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>{t('resources.view_all', 'View all resources')}</span>
                <ArrowRight size={12} />
              </a>
              <span className="text-[10px] text-slate-400 dark:text-slate-600">FLOAT AI</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
