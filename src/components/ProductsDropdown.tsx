import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Code, Terminal, Layers, Puzzle } from 'lucide-react';
import { useTranslation } from './LanguageProvider';

interface ProductsDropdownProps {
  currentPath?: string;
}

export function ProductsDropdown({ currentPath }: ProductsDropdownProps) {
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

  const isActive = currentPath?.startsWith('/products');

  const categories = [
    {
      title: 'Workspace',
      icon: <Code size={16} />,
      items: [
        { name: 'Coding workspace', desc: 'Open a browser workspace for project files, AI chat, and code review.', status: 'AVAILABLE', href: '/dashboard' },
        { name: 'Project files', desc: 'Import, browse, and edit files in the workspace.', status: 'AVAILABLE', href: '/dashboard' },
        { name: 'Review proposed edits', desc: 'Inspect code proposals before applying them.', status: 'AVAILABLE', href: '/dashboard' },
        { name: 'Browser runtime', desc: 'Run supported code in the isolated browser runtime.', status: 'AVAILABLE', href: '/dashboard' },
      ]
    },
    {
      title: 'Models & evaluation',
      icon: <Terminal size={16} />,
      items: [
        { name: 'Model catalog', desc: 'Browse models supported by configured providers.', status: 'AVAILABLE', href: '/models' },
        { name: 'Evaluations', desc: 'Create and run model evaluation tasks.', status: 'AVAILABLE', href: '/evals' },
        { name: 'Usage', desc: 'Review usage data recorded by the workspace.', status: 'AVAILABLE', href: '/models/usage' },
      ]
    },
    {
      title: 'Connections & automations',
      icon: <Puzzle size={16} />,
      items: [
        { name: 'GitHub', desc: 'Connect GitHub when OAuth is configured for this deployment.', status: 'AVAILABLE', href: '/integrations' },
        { name: 'GitLab', desc: 'GitLab OAuth is available when configured for this deployment.', status: 'AVAILABLE', href: '/integrations' },
        { name: 'Automations', desc: 'Manage browser-local scheduled workflows.', status: 'AVAILABLE', href: '/automations' },
      ]
    }
  ];

  return (
    <div 
      className="relative" 
      ref={dropdownRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/30 rounded-sm ${
          isActive || isOpen
            ? 'text-slate-900 dark:text-white pb-1' 
            : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white pb-1'
        }`}
        aria-expanded={isOpen}
      >
        {t('nav.product', 'Products')}
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full left-1/2 -translate-x-1/2 md:left-0 md:-translate-x-[15%] lg:-translate-x-1/4 mt-2 w-[90vw] md:w-[700px] lg:w-[900px] bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-6 gap-x-8 gap-y-10 max-h-[80vh] overflow-y-auto">
              {categories.map((category, idx) => (
                <div key={idx} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold mb-2">
                    <span className="text-purple-600 dark:text-purple-400">{category.icon}</span>
                    <span className="tracking-tight">{category.title}</span>
                  </div>
                  <div className="flex flex-col gap-4">
                    {category.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="flex flex-col group relative">
                        {item.status === 'AVAILABLE' && item.href ? (
                          <a 
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 -mx-2 px-2 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            <div className="text-sm font-medium text-slate-900 dark:text-white mb-0.5 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_name`, item.name)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-[#A1A1AA] leading-snug">
                              {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_desc`, item.desc)}
                            </div>
                          </a>
                        ) : (
                          <div className="block -mx-2 px-2 py-1 opacity-70">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_name`, item.name)}
                              </span>
                              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
                                {t('products.coming_soon', 'Coming soon')}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-[#A1A1AA] leading-snug">
                              {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_desc`, item.desc)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-slate-50 dark:bg-[#111] p-6 border-t border-slate-200 dark:border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-900 dark:text-white text-sm mb-1">
                  Explore FLOAT
                </div>
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">
                  Current features are available in the browser workspace. Preview concepts are marked as unavailable.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a 
                  href="/features"
                  onClick={() => setIsOpen(false)}
                  className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-black dark:hover:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 px-4 py-2 rounded-full transition-colors"
                >
                  All Features
                </a>
                <a 
                  href="/"
                  className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-4 py-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                >
                  {t('products.explore_link', 'Explore FLOAT')} <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
