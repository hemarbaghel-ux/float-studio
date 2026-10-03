import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from './LanguageProvider';

interface ModelsDropdownProps {
  currentPath?: string;
}

export function ModelsDropdown({ currentPath }: ModelsDropdownProps) {
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

  const isActive = currentPath?.startsWith('/models');

  return (
    <div 
      className="relative" 
      ref={dropdownRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 transition-colors ${
          isActive 
            ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white pb-1' 
            : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white pb-1'
        }`}
        aria-expanded={isOpen}
      >
        {t('nav.models', 'Models')}
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg overflow-hidden z-50 flex flex-col py-1.5"
          >
            <a 
              href="/models" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-between"
            >
              <span>{t('nav.all_models', 'All Models')}</span>
              <span className="text-[10px] text-slate-400 font-mono">Catalog</span>
            </a>
            <a 
              href="/models/gemini" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Gemini
            </a>
            <a 
              href="/models/gpt" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              GPT
            </a>
            <a 
              href="/models/claude" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Claude
            </a>
            <div className="my-1 border-t border-slate-100 dark:border-white/5" />
            <a 
              href="/evals" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-between"
            >
              <span>{t('nav.evals', 'Evals & Benchmarks')}</span>
              <span className="text-[10px] text-purple-500 font-mono">Verified</span>
            </a>
            <a 
              href="/models/usage" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {t('nav.usage', 'Usage & Quota')}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
