import { create } from 'zustand';
import { allTranslations } from '../locales';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

export const translations = allTranslations;

interface I18nState {
  currentLanguage: string; // e.g. 'en', 'zh-CN', etc.
  languages: LanguageOption[];
  setLanguage: (code: string) => void;
  t: (key: string, defaultText?: string) => string;
}

const getStoredLanguage = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('float_language');
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved || l.nativeName === saved)) {
      const match = SUPPORTED_LANGUAGES.find(l => l.code === saved || l.nativeName === saved);
      return match ? match.code : 'en';
    }
  }
  return 'en';
};

export const useI18nStore = create<I18nState>((set, get) => ({
  currentLanguage: getStoredLanguage(),
  languages: SUPPORTED_LANGUAGES,
  setLanguage: (code: string) => {
    const valid = SUPPORTED_LANGUAGES.some(l => l.code === code);
    const newLang = valid ? code : 'en';
    if (typeof window !== 'undefined') {
      localStorage.setItem('float_language', newLang);
      document.documentElement.lang = newLang;
    }
    set({ currentLanguage: newLang });
  },
  t: (key: string, defaultText?: string) => {
    const { currentLanguage } = get();
    const langDict = translations[currentLanguage];
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    const enDict = translations['en'];
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    return defaultText !== undefined ? defaultText : key;
  }
}));
