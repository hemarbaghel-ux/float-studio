import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useI18nStore, SUPPORTED_LANGUAGES, LanguageOption } from '../store/i18nStore';

interface LanguageContextType {
  currentLanguage: string;
  languages: LanguageOption[];
  setLanguage: (code: string) => void;
  t: (key: string, defaultText?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { currentLanguage, languages, setLanguage, t } = useI18nStore();

  useEffect(() => {
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  const value = useMemo(() => ({
    currentLanguage,
    languages,
    setLanguage,
    t
  }), [currentLanguage, languages, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Return store functions directly if outside of provider as a safe fallback
    const store = useI18nStore.getState();
    return {
      currentLanguage: store.currentLanguage,
      languages: store.languages,
      setLanguage: store.setLanguage,
      t: store.t
    };
  }
  return context;
}

// Alias hook for convenience
export const useTranslation = useLanguage;
