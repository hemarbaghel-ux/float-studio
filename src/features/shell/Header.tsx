import React from 'react';
import { Search, Sun, Moon, Settings, Sparkles } from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { AccountMenu } from '../../components/AccountMenu';
import { useIDEStore } from '../../store';
import { useI18nStore } from '../../store/i18nStore';

export function Header() {
  const { projectName, settings, updateSettings } = useIDEStore();
  const { t } = useI18nStore();

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const handleOpenCommandPalette = () => {
    document.dispatchEvent(new Event('open-command-palette'));
  };

  const handleOpenSettings = () => {
    document.dispatchEvent(new Event('open-settings'));
  };

  return (
    <header className="h-10 bg-white dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-[#2A2A2A] flex items-center justify-between px-3 shrink-0 select-none z-20 text-xs text-slate-600 dark:text-[#8B949E] transition-colors">
      {/* Left branding & project context */}
      <div className="flex items-center gap-3 min-w-0">
        <a 
          href="/" 
          className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer shrink-0"
          title="Return to Home"
        >
          <FloatLogo className="w-4 h-4" />
          <FloatWordmark className="h-3 text-slate-900 dark:text-white" />
          <span className="sr-only">FLOAT</span>
        </a>
        <span className="text-slate-300 dark:text-[#2A2A2A]">/</span>
        <span className="truncate font-medium text-slate-800 dark:text-[#C9D1D9] max-w-[180px]" title={projectName || 'Workspace'}>
          {projectName || 'Workspace'}
        </span>
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] font-medium border border-emerald-200 dark:border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Ready</span>
        </div>
      </div>

      {/* Center Search / Command Palette shortcut */}
      <div className="flex-1 max-w-sm mx-4 hidden md:block">
        <button
          onClick={handleOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1 bg-slate-100 hover:bg-slate-200/70 dark:bg-[#141414] dark:hover:bg-[#1C1C1C] border border-slate-200 dark:border-[#2A2A2A] rounded-lg text-slate-500 dark:text-[#8B949E] text-xs transition-colors cursor-pointer group"
          title="Open Command Palette (Cmd+Shift+P)"
        >
          <div className="flex items-center gap-2 truncate">
            <Search size={13} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white transition-colors" />
            <span className="truncate">{t('app.search_placeholder', 'Search files, commands (Cmd+P)')}</span>
          </div>
          <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-[#1C1C1C] border border-slate-200 dark:border-[#2A2A2A] rounded text-slate-400 dark:text-[#8B949E]">
            ⌘⇧P
          </kbd>
        </button>
      </div>

      {/* Right navigation, Language switcher, theme toggle, and settings */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="hidden lg:flex items-center gap-1 text-xs mr-1">
          <a
            href="/models"
            className="px-2 py-1 rounded hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            {t('nav.models', 'Models')}
          </a>
          <a
            href="/pricing"
            className="px-2 py-1 rounded hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            {t('nav.pricing', 'Pricing')}
          </a>
          <a
            href="/evals"
            className="px-2 py-1 rounded hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            {t('nav.evals', 'Evals')}
          </a>
        </div>

        {/* Language selector dropdown */}
        <LanguageDropdown align="right" />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
          title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-[#8B949E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Settings modal trigger */}
        <button
          onClick={handleOpenSettings}
          aria-label="Settings"
          title={t('nav.settings', 'Settings')}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-[#8B949E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Settings size={15} />
        </button>

        {/* Account Menu */}
        <AccountMenu align="right" direction="down" compact={true} />
      </div>
    </header>
  );
}
