import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Sparkles, Zap, Users, Building2, Shield } from 'lucide-react';
import { useTranslation } from './LanguageProvider';

interface PricingDropdownProps {
  currentPath?: string;
}

export function PricingDropdown({ currentPath }: PricingDropdownProps) {
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

  const isActive = currentPath?.startsWith('/pricing');

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
        {t('nav.pricing', 'Pricing')}
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg overflow-hidden z-50 flex flex-col py-1.5"
          >
            <a 
              href="/pricing#free" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-slate-600 dark:text-slate-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-slate-900 dark:text-white">{t('pricing.plan_free', 'Free')}</span>
                <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('pricing.sub_free', 'For developers exploring FLOAT.')}</span>
              </div>
            </a>
            
            <a 
              href="/pricing#pro" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
                <Zap size={14} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-slate-900 dark:text-white">{t('pricing.plan_pro', 'Pro')}</span>
                <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('pricing.sub_pro', 'For individual developers building seriously with AI agents.')}</span>
              </div>
            </a>
            
            <a 
              href="/pricing#business" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                <Users size={14} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-slate-900 dark:text-white">{t('pricing.plan_business', 'Business')}</span>
                <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('pricing.sub_business', 'For teams building and shipping software together.')}</span>
              </div>
            </a>
            
            <a 
              href="/pricing#ultimate" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                <Building2 size={14} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-slate-900 dark:text-white">{t('pricing.plan_ultimate', 'Ultimate')}</span>
                <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('pricing.sub_ultimate', 'For power users and teams running advanced agentic workflows.')}</span>
              </div>
            </a>
            
            <a 
              href="/pricing#enterprise" 
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Shield size={14} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-slate-900 dark:text-white">{t('pricing.plan_enterprise', 'Enterprise')}</span>
                <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('pricing.sub_enterprise', 'For organizations requiring advanced security, governance, support, and custom commercial terms.')}</span>
              </div>
            </a>

            <div className="mt-1 border-t border-slate-100 dark:border-white/5 pt-1">
              <a 
                href="/pricing" 
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5 block text-center transition-colors"
              >
                {t('pricing.compare', 'Compare all plans')}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
