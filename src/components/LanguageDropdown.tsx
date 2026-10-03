import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Globe, Check } from 'lucide-react';
import { useI18nStore, SUPPORTED_LANGUAGES } from '../store/i18nStore';
import { useIDEStore } from '../store';

interface LanguageDropdownProps {
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  compact?: boolean;
  className?: string;
}

export function LanguageDropdown({ 
  align = 'right', 
  direction = 'down', 
  compact = false, 
  className = '' 
}: LanguageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentLanguage, setLanguage, t } = useI18nStore();
  const { updateSettings } = useIDEStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === currentLanguage) || SUPPORTED_LANGUAGES[0];

  const handleSelect = (code: string, nativeName: string) => {
    setLanguage(code);
    updateSettings({ language: nativeName });
    setIsOpen(false);
  };

  const menuPositionClasses = direction === 'up'
    ? `bottom-full mb-2 ${align === 'left' ? 'left-0' : 'right-0'}`
    : `top-full mt-2 ${align === 'left' ? 'left-0' : 'right-0'}`;

  return (
    <div 
      className={`relative inline-block text-left ${className}`} 
      ref={dropdownRef}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('common.language', 'Language')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer select-none ${
          isOpen
            ? 'text-slate-900 bg-slate-100 dark:text-white dark:bg-white/10'
            : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/5'
        }`}
      >
        <Globe size={15} className="shrink-0 opacity-80" />
        {!compact && (
          <span className="font-normal tracking-normal text-[13px]">{activeLang.nativeName}</span>
        )}
        <ChevronDown 
          size={13} 
          className={`transition-transform duration-200 opacity-60 ${isOpen ? (direction === 'up' ? '' : 'rotate-180') : (direction === 'up' ? 'rotate-180' : '')}`} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            aria-label={t('common.language', 'Language')}
            initial={{ opacity: 0, y: direction === 'up' ? -6 : 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? -6 : 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute w-44 bg-[#141414] dark:bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-1.5 max-h-80 overflow-y-auto ${menuPositionClasses}`}
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = lang.code === activeLang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(lang.code, lang.nativeName)}
                  className={`w-full px-4 py-2 text-[13px] text-left transition-colors flex items-center justify-between font-normal ${
                    isSelected 
                      ? 'text-white bg-white/10 font-medium' 
                      : 'text-[#D1D1D1] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="tracking-normal">{lang.nativeName}</span>
                  {isSelected && <Check size={14} className="text-purple-400 dark:text-white/80 shrink-0 ml-2" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
