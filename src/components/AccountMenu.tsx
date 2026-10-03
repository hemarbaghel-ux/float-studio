import React, { useState, useRef, useEffect } from 'react';
import { 
  Home, Settings, User as UserIcon, ArrowDownCircle, Sun, Moon, 
  HelpCircle, LogOut, ChevronRight, Check, Sparkles, FileText, 
  Keyboard, AlertCircle, Compass, Zap, Bug, Info, Laptop, 
  ShieldCheck, ExternalLink, Loader2
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useIDEStore } from '../store';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { BugReportModal } from './BugReportModal';
import { AboutModal } from './AboutModal';

interface AccountMenuProps {
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  compact?: boolean;
}

export function AccountMenu({ align = 'left', direction = 'up', compact = false }: AccountMenuProps) {
  const { user, logout } = useAuthStore();
  const { settings, updateSettings } = useIDEStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'appearance' | 'help' | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Modals
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveSubmenu(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setActiveSubmenu(null);
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const navigate = (path: string) => {
    setIsOpen(false);
    setActiveSubmenu(null);
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setIsOpen(false);
      setActiveSubmenu(null);
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    updateSettings({ theme: newTheme });
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Developer';
  const initial = (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'F').toUpperCase();

  const themeLabel = settings.theme === 'dark' ? 'Dark' : settings.theme === 'light' ? 'Light' : 'System';

  return (
    <div className="relative inline-block text-left select-none">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setActiveSubmenu(null);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Account Menu"
        className={`flex items-center gap-2.5 p-1.5 rounded-lg text-left transition-colors cursor-pointer w-full ${
          isOpen 
            ? 'bg-slate-200/70 dark:bg-white/10 text-slate-900 dark:text-white' 
            : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9]'
        }`}
      >
        <div className="w-7 h-7 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center text-xs font-semibold shrink-0 uppercase shadow-sm">
          {initial}
        </div>
        {!compact && (
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs truncate font-medium text-slate-800 dark:text-[#E6EDF3]">
              {displayName}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-[#8B949E] flex items-center gap-1.5">
              <span>Free Plan</span>
              <span>•</span>
              <span className="capitalize">{themeLabel}</span>
            </span>
          </div>
        )}
      </button>

      {/* Main Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="User account actions"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${
            direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          } w-60 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#2A2A2A] shadow-2xl text-slate-800 dark:text-[#C9D1D9] text-xs py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 dark:divide-[#2A2A2A]`}
        >
          {/* User Information Header */}
          <div className="px-3 py-2 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center text-xs font-semibold shrink-0 uppercase">
              {initial}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-slate-900 dark:text-white truncate text-xs">
                {displayName}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-[#8B949E] truncate">
                {user?.email || 'Signed in via Firebase'}
              </span>
            </div>
          </div>

          {/* Group 1: ACCOUNT */}
          <div className="py-1">
            <button
              onClick={() => navigate('/dashboard')}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
            >
              <Home size={14} className="text-slate-400 dark:text-[#8B949E]" />
              <span className="flex-1">Dashboard</span>
            </button>

            <button
              onClick={() => navigate('/settings')}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
            >
              <Settings size={14} className="text-slate-400 dark:text-[#8B949E]" />
              <span className="flex-1">My Settings</span>
            </button>

            <button
              onClick={() => navigate('/profile')}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
            >
              <UserIcon size={14} className="text-slate-400 dark:text-[#8B949E]" />
              <span className="flex-1">Profile</span>
            </button>
          </div>

          {/* Group 2: APPLICATION */}
          <div className="py-1 relative">
            <button
              onClick={() => navigate('/download')}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
            >
              <ArrowDownCircle size={14} className="text-slate-400 dark:text-[#8B949E]" />
              <span className="flex-1">Download FLOAT</span>
            </button>

            {/* Appearance Submenu Trigger */}
            <div 
              className="relative"
              onMouseEnter={() => setActiveSubmenu('appearance')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                onClick={() => setActiveSubmenu(activeSubmenu === 'appearance' ? null : 'appearance')}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={activeSubmenu === 'appearance'}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Sun size={14} className="text-slate-400 dark:text-[#8B949E]" />
                  <span>Appearance</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-[#8B949E]">
                  <span className="capitalize">{themeLabel}</span>
                  <ChevronRight size={13} />
                </div>
              </button>

              {/* Appearance Submenu */}
              {activeSubmenu === 'appearance' && (
                <div 
                  className={`absolute left-full ml-1 ${
                    direction === 'up' ? 'bottom-0' : 'top-0'
                  } w-36 rounded-xl bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] shadow-2xl py-1 z-50`}
                >
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Moon size={13} />
                      <span>Dark</span>
                    </div>
                    {settings.theme === 'dark' && <Check size={13} className="text-slate-900 dark:text-white" />}
                  </button>

                  <button
                    onClick={() => handleThemeChange('light')}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Sun size={13} />
                      <span>Light</span>
                    </div>
                    {settings.theme === 'light' && <Check size={13} className="text-slate-900 dark:text-white" />}
                  </button>

                  <button
                    onClick={() => handleThemeChange('system')}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Laptop size={13} />
                      <span>System</span>
                    </div>
                    {settings.theme === 'system' && <Check size={13} className="text-slate-900 dark:text-white" />}
                  </button>
                </div>
              )}
            </div>

            {/* Help Submenu Trigger */}
            <div 
              className="relative"
              onMouseEnter={() => setActiveSubmenu('help')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                onClick={() => setActiveSubmenu(activeSubmenu === 'help' ? null : 'help')}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={activeSubmenu === 'help'}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle size={14} className="text-slate-400 dark:text-[#8B949E]" />
                  <span>Help</span>
                </div>
                <ChevronRight size={13} className="text-slate-400 dark:text-[#8B949E]" />
              </button>

              {/* Help Submenu */}
              {activeSubmenu === 'help' && (
                <div 
                  className={`absolute left-full ml-1 ${
                    direction === 'up' ? 'bottom-0' : 'top-0'
                  } w-48 rounded-xl bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] shadow-2xl py-1 z-50`}
                >
                  <button
                    onClick={() => navigate('/help')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <HelpCircle size={13} className="text-slate-400" />
                    <span>Help Center & FAQ</span>
                  </button>

                  <button
                    onClick={() => navigate('/resources/docs')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <FileText size={13} className="text-slate-400" />
                    <span>Documentation</span>
                  </button>

                  <button
                    onClick={() => navigate('/resources/guides')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Sparkles size={13} className="text-slate-400" />
                    <span>Getting Started</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setActiveSubmenu(null);
                      setShowShortcuts(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Keyboard size={13} className="text-slate-400" />
                    <span>Keyboard Shortcuts</span>
                  </button>

                  <button
                    onClick={() => navigate('/resources/help')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <AlertCircle size={13} className="text-slate-400" />
                    <span>Troubleshooting</span>
                  </button>

                  <button
                    onClick={() => navigate('/features')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Compass size={13} className="text-slate-400" />
                    <span>Feature Guides</span>
                  </button>

                  <button
                    onClick={() => navigate('/resources/changelog')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Zap size={13} className="text-slate-400" />
                    <span>What's New</span>
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-[#2A2A2A]" />

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setActiveSubmenu(null);
                      setShowBugReport(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Bug size={13} className="text-slate-400 dark:text-[#8B949E]" />
                    <span>Report a Bug</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setActiveSubmenu(null);
                      setShowAbout(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 text-left text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <Info size={13} className="text-slate-400 dark:text-[#8B949E]" />
                    <span>About FLOAT</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Group 3: ACCOUNT ACTION */}
          <div className="py-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              {isLoggingOut ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <LogOut size={14} />
              )}
              <span>{isLoggingOut ? 'Signing Out...' : 'Log Out'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Help Modals */}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}
