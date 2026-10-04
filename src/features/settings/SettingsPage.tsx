import React, { useState, useEffect } from 'react';
import { 
  SlidersHorizontal, Palette, Code2, Bot, Bell, Shield, 
  Sun, Moon, Laptop, Check, ArrowLeft, RefreshCw, Download, 
  Trash2, AlertTriangle, ExternalLink, ShieldCheck, Sparkles,
  Info, Cpu, CheckCircle2, ChevronRight
} from 'lucide-react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useAIStore } from '../../store/aiStore';
import { useI18nStore, SUPPORTED_LANGUAGES } from '../../store/i18nStore';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../ai/registry';
import { useConsentStore } from '../../store/consentStore';
import { CURRENT_POLICY_VERSION } from '../../services/consentService';

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<'general' | 'appearance' | 'editor' | 'ai' | 'notifications' | 'privacy'>('general');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category') || params.get('tab') || window.location.hash.replace('#', '');
      if (cat && ['general', 'appearance', 'editor', 'ai', 'notifications', 'privacy'].includes(cat)) {
        setActiveCategory(cat as any);
      }
    } catch (e) {
      // Ignore
    }
  }, []);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [consentSuccessMsg, setConsentSuccessMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const { settings, updateSettings, files, projectName } = useIDEStore();
  const { user, logout } = useAuthStore();
  const { preferences, updateConsent, withdrawConsent, isSaving: isSavingConsent, error: consentError, clearError } = useConsentStore();
  const { 
    selectedModel, setSelectedModel,
    selectedAgent, setSelectedAgent
  } = useAIStore();
  const { currentLanguage, setLanguage } = useI18nStore();

  const handleResetDefaults = () => {
    updateSettings({
      fontSize: 14,
      wordWrap: 'off',
      minimap: false,
      tabSize: 4,
      theme: 'dark',
      language: 'English',
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace"
    });
    setLanguage('en');
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 3000);
  };

  const handleExportData = () => {
    const data = {
      project: projectName || 'FLOAT Workspace',
      exportedAt: new Date().toISOString(),
      userEmail: user?.email,
      files: files
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `float-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res === 'granted') {
        new Notification('FLOAT Notifications Active', {
          body: 'You will receive execution completions and background task updates.',
          icon: '/favicon.ico'
        });
      }
    }
  };

  const navCategories = [
    { id: 'general', label: 'General', icon: SlidersHorizontal, desc: 'Language, startup tab, confirmations' },
    { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Dark, light, and system themes' },
    { id: 'editor', label: 'Editor', icon: Code2, desc: 'Font size, font family, minimap, tabs, wrap' },
    { id: 'ai', label: 'AI & Models', icon: Bot, desc: 'Default models, agents, availability' },
    { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'In-app toasts and desktop alerts' },
    { id: 'privacy', label: 'Privacy & Data', icon: Shield, desc: 'Workspace exports, account safety' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors selection:bg-slate-300 dark:selection:bg-white/20">
      
      {/* Top Header */}
      <header className="h-14 border-b border-slate-200 dark:border-white/10 px-4 sm:px-6 flex items-center justify-between bg-white dark:bg-[#080808] shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-[#8B949E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Back to Workspace"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <FloatLogo className="w-5 h-5 shrink-0" />
            <FloatWordmark className="h-3.5 text-slate-900 dark:text-white shrink-0" />
            <span className="text-slate-300 dark:text-white/20 text-xs">/</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9]">Settings</span>
          </div>
        </div>

        <button
          onClick={() => {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="px-3 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Done
        </button>
      </header>

      {/* Main Container - Two Columns */}
      <div className="flex-1 max-w-6xl w-full mx-auto flex flex-col md:flex-row p-4 sm:p-6 md:p-8 gap-8">
        
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-1 select-none">
          <div className="mb-3 px-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Settings</h2>
            <p className="text-xs text-slate-500 dark:text-[#8B949E]">Manage preferences and tools</p>
          </div>

          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-none">
            {navCategories.map(cat => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id as any)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer shrink-0 md:shrink ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-white/10 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400 dark:text-[#8B949E]'} />
                  <span className="flex-1">{cat.label}</span>
                  {isActive && <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-white" />}
                </button>
              );
            })}
          </div>

          <div className="mt-auto hidden md:block pt-6 border-t border-slate-200 dark:border-[#2A2A2A] text-[11px] text-slate-400 dark:text-[#6E7681] px-2">
            FLOAT AI Studio • 2026
          </div>
        </aside>

        {/* Right Content Panel */}
        <main className="flex-1 min-w-0 bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#2A2A2A] rounded-2xl p-6 sm:p-8 shadow-sm">
          
          {/* GENERAL SETTINGS */}
          {activeCategory === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">General Preferences</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">Application localization, startup view, and defaults</p>
              </div>

              {resetSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>Preferences reset to defaults successfully.</span>
                </div>
              )}

              <div className="space-y-4 divide-y divide-slate-100 dark:divide-white/5">
                {/* Language selection */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 first:pt-0">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Display Language</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Updates application navigation and text strings</p>
                  </div>
                  <select
                    value={currentLanguage}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 w-44 cursor-pointer"
                  >
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Startup page preference */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Startup Landing View</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Default view when launching the application</p>
                  </div>
                  <select
                    defaultValue="chat"
                    className="px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 w-44 cursor-pointer"
                  >
                    <option value="chat">New Chat Workspace</option>
                    <option value="projects">Projects Explorer</option>
                    <option value="workspace">Python IDE</option>
                  </select>
                </div>

                {/* Confirmations */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Require Diff Review Confirmation</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Always prompt before applying AI-generated code edits</p>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 accent-slate-900 dark:accent-white rounded cursor-pointer"
                  />
                </div>

                {/* Reset defaults */}
                <div className="pt-6">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Reset All Settings</h4>
                      <p className="text-[11px] text-slate-500 dark:text-[#8B949E]">Reverts theme, editor font, and language back to defaults</p>
                    </div>
                    <button
                      onClick={handleResetDefaults}
                      className="px-3 py-1.5 border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* APPEARANCE */}
          {activeCategory === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Appearance & Theme</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">Customize workspace colors and contrast mode</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Dark Theme */}
                <button
                  type="button"
                  onClick={() => updateSettings({ theme: 'dark' })}
                  className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                    settings.theme === 'dark'
                      ? 'border-slate-900 dark:border-white bg-slate-100/50 dark:bg-white/10 ring-1 ring-slate-900 dark:ring-white'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                      <Moon size={16} />
                    </div>
                    {settings.theme === 'dark' && (
                      <span className="text-[10px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-black px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Dark Theme</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-1">Deep monochrome canvas with high contrast code</p>
                </button>

                {/* Light Theme */}
                <button
                  type="button"
                  onClick={() => updateSettings({ theme: 'light' })}
                  className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                    settings.theme === 'light'
                      ? 'border-slate-900 dark:border-white bg-slate-100/50 dark:bg-white/10 ring-1 ring-slate-900 dark:ring-white'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center">
                      <Sun size={16} />
                    </div>
                    {settings.theme === 'light' && (
                      <span className="text-[10px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-black px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Light Theme</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-1">Clean daylight theme for high brightness environments</p>
                </button>

                {/* System Theme */}
                <button
                  type="button"
                  onClick={() => updateSettings({ theme: 'system' })}
                  className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                    settings.theme === 'system'
                      ? 'border-slate-900 dark:border-white bg-slate-100/50 dark:bg-white/10 ring-1 ring-slate-900 dark:ring-white'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center">
                      <Laptop size={16} />
                    </div>
                    {settings.theme === 'system' && (
                      <span className="text-[10px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-black px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">System Sync</h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-1">Automatically match your operating system theme</p>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                Theme changes take effect instantly across all views, Monaco Editor instances, dialogs, and terminal consoles without requiring a page refresh.
              </div>
            </div>
          )}

          {/* EDITOR CONFIGURATION */}
          {activeCategory === 'editor' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Monaco Editor Configuration</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">Configure code typography, indentation, and minimap options</p>
              </div>

              <div className="space-y-4 divide-y divide-slate-100 dark:divide-white/5">
                {/* Font Size */}
                <div className="flex items-center justify-between pt-3 first:pt-0">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Font Size (px)</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Controls font size in the Monaco code editor</p>
                  </div>
                  <input
                    type="number"
                    min="10"
                    max="32"
                    value={settings.fontSize}
                    onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) || 14 })}
                    className="w-20 px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-right text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
                  />
                </div>

                {/* Font Family */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Font Family</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Monospace typography used in code editor</p>
                  </div>
                  <select
                    value={settings.fontFamily || "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace"}
                    onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                    className="w-56 px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer"
                  >
                    <option value="'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace">JetBrains Mono (Default)</option>
                    <option value="'Fira Code', monospace">Fira Code</option>
                    <option value="'SF Mono', 'Menlo', Monaco, monospace">SF Mono / Menlo</option>
                    <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
                    <option value="'Courier New', monospace">Courier New</option>
                  </select>
                </div>

                {/* Tab Size */}
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Tab Indentation</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Number of spaces per tab stop</p>
                  </div>
                  <select
                    value={settings.tabSize}
                    onChange={(e) => updateSettings({ tabSize: parseInt(e.target.value) || 4 })}
                    className="w-28 px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer"
                  >
                    <option value="2">2 Spaces</option>
                    <option value="4">4 Spaces</option>
                    <option value="8">8 Spaces</option>
                  </select>
                </div>

                {/* Word Wrap */}
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Word Wrap</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Wrap long lines to fit the editor viewport</p>
                  </div>
                  <select
                    value={settings.wordWrap}
                    onChange={(e) => updateSettings({ wordWrap: e.target.value as any })}
                    className="w-28 px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer"
                  >
                    <option value="on">Enabled</option>
                    <option value="off">Disabled</option>
                  </select>
                </div>

                {/* Minimap */}
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Code Minimap</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Show code outline overview on the right margin</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.minimap}
                    onChange={(e) => updateSettings({ minimap: e.target.checked })}
                    className="w-4 h-4 accent-slate-900 dark:accent-white rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* AI & MODELS */}
          {activeCategory === 'ai' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">AI & Intelligence Models</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">Manage default model routing, agents, and capability limits</p>
              </div>

              <div className="space-y-4 divide-y divide-slate-100 dark:divide-white/5">
                {/* Default Model */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 first:pt-0">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Default Model</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Primary model invoked for code generation and workspace edits</p>
                  </div>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 w-52 cursor-pointer"
                  >
                    {INITIAL_MODELS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.displayName} ({m.providerId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Default Agent */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Default Agent Workflow</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Autonomous agent strategy for tasks and refactorings</p>
                  </div>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-white/30 w-52 cursor-pointer"
                  >
                    {INITIAL_AGENTS.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Model Catalog */}
                <div className="pt-4">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Verified Configured Models</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141414] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu size={15} className="text-slate-600 dark:text-[#C5C5C5]" />
                        <div>
                          <span className="text-xs font-semibold block text-slate-900 dark:text-white">Gemini 2.5 Flash</span>
                          <span className="text-[10px] text-slate-400">1M Context • Real-time Code Edits</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white border border-slate-300 dark:border-white/15">Active</span>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141414] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu size={15} className="text-slate-600 dark:text-[#C5C5C5]" />
                        <div>
                          <span className="text-xs font-semibold block text-slate-900 dark:text-white">Gemini 2.5 Pro</span>
                          <span className="text-[10px] text-slate-400">2M Context • Complex Architecture</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white border border-slate-300 dark:border-white/15">Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeCategory === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Notification Controls</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">Control in-app alerts and desktop completion signals</p>
              </div>

              <div className="space-y-4 divide-y divide-slate-100 dark:divide-white/5">
                <div className="flex items-center justify-between pt-3 first:pt-0">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">In-App Toast Alerts</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Show popup toasts when saving or compiling projects</p>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 accent-slate-900 dark:accent-white rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Desktop System Notifications</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Receive background notifications when long agent tasks complete</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 capitalize">{notificationPermission}</span>
                    <button
                      onClick={requestNotificationPermission}
                      className="px-3 py-1 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      {notificationPermission === 'granted' ? 'Enabled' : 'Request Permission'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRIVACY & DATA */}
          {activeCategory === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Privacy & Data Governance</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">Control data sharing preferences, export files, and manage account security</p>
              </div>

              {exportSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>Workspace data exported as JSON successfully.</span>
                </div>
              )}

              {consentSuccessMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>{consentSuccessMsg}</span>
                </div>
              )}

              {consentError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
                  <span>{consentError}</span>
                  <button onClick={clearError} className="text-xs underline cursor-pointer">Dismiss</button>
                </div>
              )}

              {/* Data Sharing & Real Consent Card */}
              <div className="p-5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Product Improvement & Diagnostics</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                        preferences.sharingEnabled 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400' 
                          : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                      }`}>
                        {preferences.sharingEnabled ? 'Sharing Enabled' : 'Privacy Mode (OFF)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1 leading-relaxed">
                      Allow FLOAT to gather anonymized system error codes, model latencies, and interaction counts to diagnose bugs. 
                      Never includes source code, passwords, API keys, or raw files.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={preferences.sharingEnabled}
                      disabled={isSavingConsent}
                      onClick={async () => {
                        const target = !preferences.sharingEnabled;
                        const ok = await updateConsent(target, 'settings');
                        if (ok) {
                          setConsentSuccessMsg(target ? 'Optional data sharing enabled.' : 'Data sharing disabled. Privacy mode active.');
                          setTimeout(() => setConsentSuccessMsg(null), 3500);
                        }
                      }}
                      className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                        preferences.sharingEnabled ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-[#2A2A2A]'
                      }`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${
                        preferences.sharingEnabled 
                          ? 'translate-x-5 bg-white dark:bg-black' 
                          : 'translate-x-0 bg-white dark:bg-[#8B949E]'
                      }`} />
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#161616] border border-slate-100 dark:border-white/5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Policy Version</span>
                    <span className="font-mono text-slate-700 dark:text-[#C9D1D9]">v{preferences.policyVersion || CURRENT_POLICY_VERSION}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Storage Target</span>
                    <span className="text-slate-700 dark:text-[#C9D1D9]">
                      {preferences.syncedWithCloud ? 'Firestore Cloud Record' : 'Browser Protected Storage'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Last Updated</span>
                    <span className="text-slate-700 dark:text-[#C9D1D9]">
                      {preferences.lastUpdated ? new Date(preferences.lastUpdated).toLocaleDateString() : 'Default initial state'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSavingConsent || !preferences.sharingEnabled}
                      onClick={async () => {
                        const ok = await withdrawConsent();
                        if (ok) {
                          setConsentSuccessMsg('Consent successfully withdrawn. All optional data sharing stopped.');
                          setTimeout(() => setConsentSuccessMsg(null), 3500);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-[#C9D1D9] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
                    >
                      Withdraw Consent
                    </button>
                    <span className="text-slate-400 text-[11px]">Immediately terminates all optional telemetry.</span>
                  </div>

                  <a 
                    href="/privacy" 
                    className="text-blue-500 hover:underline flex items-center gap-1 text-xs"
                  >
                    <span>Read Privacy Policy</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <div className="space-y-4 divide-y divide-slate-100 dark:divide-white/5">
                {/* Data Export */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 first:pt-0">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Export Workspace Files</h4>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E]">Download all project files and chat logs as JSON</p>
                  </div>
                  <button
                    onClick={handleExportData}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 dark:text-black text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <Download size={13} />
                    <span>Export JSON</span>
                  </button>
                </div>

                {/* Account details */}
                <div className="pt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Authenticated Identity</h4>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">UID</span>
                      <code className="font-mono text-slate-700 dark:text-[#C9D1D9]">{user?.uid || 'Not signed in'}</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Email</span>
                      <span className="text-slate-700 dark:text-[#C9D1D9]">{user?.email || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Account Deletion */}
                <div className="pt-6">
                  <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        <span>Delete Account</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
                        Permanently delete your account, projects, and synced workspace records.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete FLOAT Account?</h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
              This action cannot be undone. All your project files, cloud history, and configuration preferences will be permanently wiped.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await logout();
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
