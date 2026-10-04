import React, { useState, useRef, useEffect, useId } from 'react';
import { 
  Home, Settings, User as UserIcon, ArrowDownCircle, Sun, Moon, 
  HelpCircle, LogOut, ChevronRight, Check, Sparkles, FileText, 
  Laptop, SlidersHorizontal, Mail, Loader2, Palette
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useIDEStore, applyThemeToDocument } from '../store';
import { ContactModal } from './ContactModal';

export interface AccountMenuProps {
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  compact?: boolean;
  className?: string;
  triggerElement?: React.ReactNode;
}

export function AccountMenu({ 
  align = 'left', 
  direction = 'up', 
  compact = false,
  className = '',
  triggerElement 
}: AccountMenuProps) {
  const { user, logout } = useAuthStore();
  const { settings, updateSettings } = useIDEStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'appearance' | 'help' | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Modals
  const [showContact, setShowContact] = useState(false);

  // Keyboard navigation focus indexes
  // Main menu items:
  // 0: Upgrade to Start
  // 1: Dashboard
  // 2: My Settings
  // 3: Profile
  // 4: Download FLOAT
  // 5: Appearance
  // 6: Help
  // 7: Log Out
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [submenuFocusedIndex, setSubmenuFocusedIndex] = useState<number>(-1);

  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submenu placement (auto-detect viewport space on right vs left)
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current && 
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        (!submenuRef.current || !submenuRef.current.contains(target))
      ) {
        setIsOpen(false);
        setActiveSubmenu(null);
        setFocusedIndex(-1);
        setSubmenuFocusedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Viewport placement calculation for submenu
  const updateSubmenuPosition = () => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const SUBMENU_WIDTH = 190;
    const spaceOnRight = window.innerWidth - (rect.right + SUBMENU_WIDTH + 12);
    if (spaceOnRight < 0 && rect.left >= SUBMENU_WIDTH + 12) {
      setSubmenuSide('left');
    } else {
      setSubmenuSide('right');
    }
  };

  useEffect(() => {
    if (isOpen && activeSubmenu) {
      updateSubmenuPosition();
    }
  }, [isOpen, activeSubmenu]);

  // Handle open / close resets
  useEffect(() => {
    if (!isOpen) {
      setActiveSubmenu(null);
      setFocusedIndex(-1);
      setSubmenuFocusedIndex(-1);
      if (submenuTimerRef.current) {
        clearTimeout(submenuTimerRef.current);
      }
    }
  }, [isOpen]);

  const navigate = (path: string) => {
    setIsOpen(false);
    setActiveSubmenu(null);
    if (window.location.pathname === path && path === '/dashboard') {
      return;
    }
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
      setIsOpen(false);
      setActiveSubmenu(null);
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    updateSettings({ theme: newTheme });
    applyThemeToDocument(newTheme);
  };

  // Submenu hover handlers with small anti-flicker delay
  const handleMouseEnterParent = (submenuKey: 'appearance' | 'help') => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    setActiveSubmenu(submenuKey);
    setSubmenuFocusedIndex(-1);
  };

  const handleMouseLeaveParent = () => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
    }
    submenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
      setSubmenuFocusedIndex(-1);
    }, 180);
  };

  const handleMouseEnterSubmenu = () => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  };

  const handleMouseLeaveSubmenu = () => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
    }
    submenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
      setSubmenuFocusedIndex(-1);
    }, 180);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (activeSubmenu) {
        setActiveSubmenu(null);
        setSubmenuFocusedIndex(-1);
      } else {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }

    // Inside a submenu
    if (activeSubmenu) {
      const submenuItemCount = activeSubmenu === 'appearance' ? 4 : 3;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSubmenuFocusedIndex(prev => (prev + 1) % submenuItemCount);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSubmenuFocusedIndex(prev => (prev - 1 + submenuItemCount) % submenuItemCount);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveSubmenu(null);
        setSubmenuFocusedIndex(-1);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (activeSubmenu === 'appearance') {
          if (submenuFocusedIndex === 0) handleThemeChange('light');
          else if (submenuFocusedIndex === 1) handleThemeChange('dark');
          else if (submenuFocusedIndex === 2) handleThemeChange('system');
          else if (submenuFocusedIndex === 3) navigate('/settings');
        } else if (activeSubmenu === 'help') {
          if (submenuFocusedIndex === 0) navigate('/resources/docs');
          else if (submenuFocusedIndex === 1) navigate('/help');
          else if (submenuFocusedIndex === 2) {
            setIsOpen(false);
            setActiveSubmenu(null);
            setShowContact(true);
          }
        }
        return;
      }
    }

    // Main menu navigation
    const MAIN_ITEMS_COUNT = 8;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev + 1) % MAIN_ITEMS_COUNT);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev - 1 + MAIN_ITEMS_COUNT) % MAIN_ITEMS_COUNT);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (focusedIndex === 5) {
        setActiveSubmenu('appearance');
        setSubmenuFocusedIndex(0);
      } else if (focusedIndex === 6) {
        setActiveSubmenu('help');
        setSubmenuFocusedIndex(0);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      switch (focusedIndex) {
        case 0: navigate('/pricing'); break;
        case 1: navigate('/dashboard'); break;
        case 2: navigate('/settings'); break;
        case 3: navigate('/profile'); break;
        case 4: navigate('/download'); break;
        case 5: 
          setActiveSubmenu('appearance');
          setSubmenuFocusedIndex(0);
          break;
        case 6: 
          setActiveSubmenu('help');
          setSubmenuFocusedIndex(0);
          break;
        case 7: handleLogout(); break;
        default: break;
      }
    }
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Developer';
  const initial = (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'F').toUpperCase();
  const themeLabel = settings.theme === 'dark' ? 'Dark' : settings.theme === 'light' ? 'Light' : 'System';

  return (
    <div 
      className={`relative inline-block text-left select-none ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* 1. Trigger Button */}
      {triggerElement ? (
        <div 
          onClick={() => {
            setIsOpen(!isOpen);
            setActiveSubmenu(null);
          }}
          className="cursor-pointer"
        >
          {triggerElement}
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setActiveSubmenu(null);
          }}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          title="Account Menu"
          className={`flex items-center gap-2.5 p-1.5 rounded-lg text-left transition-colors cursor-pointer w-full font-sans ${
            isOpen 
              ? 'bg-slate-200/80 dark:bg-white/10 text-slate-900 dark:text-white' 
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
      )}

      {/* 2. Main Account Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="User account actions"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } w-60 rounded-xl bg-white dark:bg-[#181818] border border-slate-200/90 dark:border-[#2C2C2C] shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/75 text-slate-800 dark:text-[#C9D1D9] text-xs py-1.5 z-50 animate-in fade-in duration-100 select-none font-sans`}
        >
          {/* User Information Header */}
          <div className="px-3 py-2 flex items-center gap-2.5 border-b border-slate-100 dark:border-white/5">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center text-xs font-semibold shrink-0 uppercase shadow-sm">
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

          {/* Section 1: Upgrade to Start */}
          <div className="p-1 border-b border-slate-100 dark:border-white/5">
            <button
              onClick={() => navigate('/pricing')}
              role="menuitem"
              tabIndex={focusedIndex === 0 ? 0 : -1}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer text-left ${
                focusedIndex === 0 
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' 
                  : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-800 dark:text-[#E6EDF3]'
              }`}
            >
              <Sparkles size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="flex-1 font-medium">Upgrade to Start</span>
            </button>
          </div>

          {/* Section 2: Dashboard & My Settings */}
          <div className="p-1 border-b border-slate-100 dark:border-white/5">
            <button
              onClick={() => navigate('/dashboard')}
              role="menuitem"
              tabIndex={focusedIndex === 1 ? 0 : -1}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                focusedIndex === 1 
                  ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white' 
                  : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Home size={14} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
              <span className="flex-1">Dashboard</span>
            </button>

            <button
              onClick={() => navigate('/settings')}
              role="menuitem"
              tabIndex={focusedIndex === 2 ? 0 : -1}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                focusedIndex === 2 
                  ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white' 
                  : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Settings size={14} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
              <span className="flex-1">My Settings</span>
            </button>
          </div>

          {/* Section 3: Profile, Download, Appearance, Help */}
          <div className="p-1 border-b border-slate-100 dark:border-white/5">
            <button
              onClick={() => navigate('/profile')}
              role="menuitem"
              tabIndex={focusedIndex === 3 ? 0 : -1}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                focusedIndex === 3 
                  ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white' 
                  : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserIcon size={14} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
              <span className="flex-1">Profile</span>
            </button>

            <button
              onClick={() => navigate('/download')}
              role="menuitem"
              tabIndex={focusedIndex === 4 ? 0 : -1}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                focusedIndex === 4 
                  ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white' 
                  : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowDownCircle size={14} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
              <span className="flex-1">Download FLOAT</span>
            </button>

            {/* Appearance Submenu Trigger */}
            <div 
              className="relative"
              onMouseEnter={() => handleMouseEnterParent('appearance')}
              onMouseLeave={handleMouseLeaveParent}
            >
              <button
                type="button"
                onClick={() => setActiveSubmenu(activeSubmenu === 'appearance' ? null : 'appearance')}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={activeSubmenu === 'appearance'}
                tabIndex={focusedIndex === 5 ? 0 : -1}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                  focusedIndex === 5 || activeSubmenu === 'appearance'
                    ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Palette size={14} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
                  <span>Appearance</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-[#8B949E]">
                  <ChevronRight size={13} className="text-slate-400 dark:text-[#8B949E]" />
                </div>
              </button>

              {/* Appearance Submenu */}
              {activeSubmenu === 'appearance' && (
                <div 
                  ref={submenuRef}
                  role="menu"
                  aria-label="Appearance Options"
                  onMouseEnter={handleMouseEnterSubmenu}
                  onMouseLeave={handleMouseLeaveSubmenu}
                  className={`absolute ${
                    submenuSide === 'left' ? 'right-full mr-1.5' : 'left-full ml-1.5'
                  } ${
                    direction === 'up' ? 'bottom-0' : 'top-0'
                  } w-44 rounded-xl bg-white dark:bg-[#181818] border border-slate-200/90 dark:border-[#2C2C2C] shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/75 py-1 z-50 animate-in fade-in duration-100 select-none font-sans`}
                >
                  <button
                    onClick={() => handleThemeChange('light')}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 0 ? 0 : -1}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 0
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : settings.theme === 'light'
                        ? 'text-slate-900 dark:text-white font-medium hover:bg-slate-50 dark:hover:bg-white/5'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sun size={13} className="text-amber-500 shrink-0" />
                      <span>Light</span>
                    </div>
                    {settings.theme === 'light' && <Check size={13} className="text-slate-900 dark:text-white stroke-[2.2]" />}
                  </button>

                  <button
                    onClick={() => handleThemeChange('dark')}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 1 ? 0 : -1}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 1
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : settings.theme === 'dark'
                        ? 'text-slate-900 dark:text-white font-medium hover:bg-slate-50 dark:hover:bg-white/5'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Moon size={13} className="text-indigo-400 shrink-0" />
                      <span>Dark</span>
                    </div>
                    {settings.theme === 'dark' && <Check size={13} className="text-slate-900 dark:text-white stroke-[2.2]" />}
                  </button>

                  <button
                    onClick={() => handleThemeChange('system')}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 2 ? 0 : -1}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 2
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : settings.theme === 'system'
                        ? 'text-slate-900 dark:text-white font-medium hover:bg-slate-50 dark:hover:bg-white/5'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Laptop size={13} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
                      <span>System</span>
                    </div>
                    {settings.theme === 'system' && <Check size={13} className="text-slate-900 dark:text-white stroke-[2.2]" />}
                  </button>

                  {/* Divider */}
                  <div className="my-1 border-t border-slate-100 dark:border-white/5" />

                  {/* Configure Appearance */}
                  <button
                    onClick={() => navigate('/settings?category=appearance')}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 3 ? 0 : -1}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 3
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <SlidersHorizontal size={13} className="text-slate-400 dark:text-[#8B949E]" />
                    <span>Configure</span>
                  </button>
                </div>
              )}
            </div>

            {/* Help Submenu Trigger */}
            <div 
              className="relative"
              onMouseEnter={() => handleMouseEnterParent('help')}
              onMouseLeave={handleMouseLeaveParent}
            >
              <button
                type="button"
                onClick={() => setActiveSubmenu(activeSubmenu === 'help' ? null : 'help')}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={activeSubmenu === 'help'}
                tabIndex={focusedIndex === 6 ? 0 : -1}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                  focusedIndex === 6 || activeSubmenu === 'help'
                    ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle size={14} className="text-slate-400 dark:text-[#8B949E] shrink-0" />
                  <span>Help</span>
                </div>
                <ChevronRight size={13} className="text-slate-400 dark:text-[#8B949E]" />
              </button>

              {/* Help Submenu */}
              {activeSubmenu === 'help' && (
                <div 
                  ref={submenuRef}
                  role="menu"
                  aria-label="Help Options"
                  onMouseEnter={handleMouseEnterSubmenu}
                  onMouseLeave={handleMouseLeaveSubmenu}
                  className={`absolute ${
                    submenuSide === 'left' ? 'right-full mr-1.5' : 'left-full ml-1.5'
                  } ${
                    direction === 'up' ? 'bottom-0' : 'top-0'
                  } w-44 rounded-xl bg-white dark:bg-[#181818] border border-slate-200/90 dark:border-[#2C2C2C] shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/75 py-1 z-50 animate-in fade-in duration-100 select-none font-sans`}
                >
                  <button
                    onClick={() => navigate('/resources/docs')}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 0 ? 0 : -1}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 0
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <FileText size={13} className="text-slate-400 dark:text-[#8B949E]" />
                    <span>FLOAT Docs</span>
                  </button>

                  <button
                    onClick={() => navigate('/help')}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 1 ? 0 : -1}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 1
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <HelpCircle size={13} className="text-slate-400 dark:text-[#8B949E]" />
                    <span>Get Help</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setActiveSubmenu(null);
                      setShowContact(true);
                    }}
                    role="menuitem"
                    tabIndex={submenuFocusedIndex === 2 ? 0 : -1}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      submenuFocusedIndex === 2
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Mail size={13} className="text-slate-400 dark:text-[#8B949E]" />
                    <span>Contact Us</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Log Out */}
          <div className="p-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              role="menuitem"
              tabIndex={focusedIndex === 7 ? 0 : -1}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 transition-colors cursor-pointer disabled:opacity-50 text-left ${
                focusedIndex === 7
                  ? 'bg-rose-50 dark:bg-rose-950/30'
                  : 'hover:bg-rose-50 dark:hover:bg-rose-950/20'
              }`}
            >
              {isLoggingOut ? (
                <Loader2 size={14} className="animate-spin text-rose-600 dark:text-rose-400" />
              ) : (
                <LogOut size={14} className="text-rose-600 dark:text-rose-400" />
              )}
              <span>{isLoggingOut ? 'Signing Out...' : 'Log Out'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Contact FLOAT Support Modal */}
      {showContact && <ContactModal onClose={() => setShowContact(false)} />}
    </div>
  );
}
