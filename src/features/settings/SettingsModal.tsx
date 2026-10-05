import React, { useState } from 'react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { LogOut, X, Sun, Moon, Laptop, User, Copy, Check, Sparkles, Sliders, Palette, ShieldCheck, Plug, Shield, ExternalLink, AlertCircle } from 'lucide-react';
import { FloatLogo } from '../../components/FloatLogo';
import { cn } from '../../lib/utils';
import { IntegrationsPage } from '../integrations/IntegrationsPage';
import { useConsentStore } from '../../store/consentStore';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useIDEStore();
  const { user, logout } = useAuthStore();
  const { preferences, updateConsent, withdrawConsent, isSaving: isSavingConsent, error: consentError, clearError } = useConsentStore();
  const [copiedUid, setCopiedUid] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'appearance' | 'editor' | 'integrations' | 'privacy'>('profile');
  const [consentSuccessMsg, setConsentSuccessMsg] = useState<string | null>(null);

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const handleSignOut = async () => {
    await logout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0A0A0A] text-slate-800 dark:text-[#C9D1D9] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#2A2A2A] flex flex-col max-h-[85vh] overflow-hidden transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#2A2A2A] shrink-0 bg-slate-50/50 dark:bg-[#111111]">
          <div className="flex items-center gap-3">
            <FloatLogo className="w-6 h-6" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">Settings & Profile</h2>
              <p className="text-xs text-slate-500 dark:text-[#8B949E]">Manage your profile preferences and environment appearance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-[#8B949E] dark:hover:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-[#1C1C1C] rounded-lg transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex px-6 pt-3 border-b border-slate-200 dark:border-[#2A2A2A] gap-2 bg-slate-50/30 dark:bg-[#0A0A0A]">
          <button
            onClick={() => setActiveSection('profile')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px cursor-pointer",
              activeSection === 'profile'
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold"
                : "border-transparent text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <User size={14} />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setActiveSection('appearance')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px cursor-pointer",
              activeSection === 'appearance'
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold"
                : "border-transparent text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Palette size={14} />
            <span>Appearance & Theme</span>
          </button>
          <button
            onClick={() => setActiveSection('editor')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px cursor-pointer",
              activeSection === 'editor'
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold"
                : "border-transparent text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Sliders size={14} />
            <span>Editor</span>
          </button>
          <button
            onClick={() => setActiveSection('integrations')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px cursor-pointer",
              activeSection === 'integrations'
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold"
                : "border-transparent text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Plug size={14} />
            <span>Integrations</span>
          </button>
          <button
            onClick={() => setActiveSection('privacy')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px cursor-pointer",
              activeSection === 'privacy'
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-semibold"
                : "border-transparent text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Shield size={14} />
            <span>Privacy & Data</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* USER PROFILE SECTION */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate text-base">
                        {user?.displayName || user?.email?.split('@')[0] || 'Float Developer'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <ShieldCheck size={11} />
                        Free Plan
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-[#8B949E] truncate">
                      {user?.email || 'Signed in via Firebase Auth'}
                    </span>
                  </div>
                </div>

                {user && (
                  <button
                    onClick={handleSignOut}
                    className="self-start sm:self-auto px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>

              {/* User Metadata */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8B949E]">
                  Account Details
                </h4>

                <div className="divide-y divide-slate-200 dark:divide-[#2A2A2A] rounded-xl border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] overflow-hidden text-sm">
                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-xs text-slate-500 dark:text-[#8B949E]">Account ID</span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono bg-slate-100 dark:bg-[#0A0A0A] px-2 py-1 rounded text-slate-700 dark:text-slate-300">
                        {user?.uid ? `${user.uid.slice(0, 12)}...` : 'Guest Session'}
                      </code>
                      {user?.uid && (
                        <button
                          onClick={copyUid}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:text-[#8B949E] dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-[#21262D] transition-colors"
                          title="Copy UID"
                        >
                          {copiedUid ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-xs text-slate-500 dark:text-[#8B949E]">Status</span>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active & Authenticated
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-xs text-slate-500 dark:text-[#8B949E]">Active Theme</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-900 dark:text-white capitalize">
                        {settings.theme} Mode
                      </span>
                      <button
                        type="button"
                        onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#2A2A2A] bg-slate-50 dark:bg-[#0A0A0A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
                      >
                        {settings.theme === 'dark' ? (
                          <>
                            <Sun size={13} className="text-amber-400" />
                            <span>Light Mode</span>
                          </>
                        ) : (
                          <>
                            <Moon size={13} className="text-slate-700 dark:text-slate-300" />
                            <span>Dark Mode</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* APPEARANCE & THEME TOGGLE SECTION */}
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8B949E] mb-2">
                  Theme Mode
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mb-4">
                  Select your preferred interface theme. The theme is applied across the Landing Page, Dashboard, and Code IDE.
                </p>

                {/* Segmented Light/Dark/System Mode Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Light Mode Option Card */}
                  <button
                    type="button"
                    onClick={() => updateSettings({ theme: 'light' })}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                      settings.theme === 'light'
                        ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-white/10 ring-1 ring-slate-900 dark:ring-white"
                        : "border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        settings.theme === 'light'
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-100 dark:bg-[#1C1C1C] text-slate-600 dark:text-[#8B949E] group-hover:text-slate-900 dark:group-hover:text-white"
                      )}>
                        <Sun size={18} />
                      </div>
                      {settings.theme === 'light' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white mb-1">
                      Light Mode
                    </span>
                    <span className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                      Clean white canvas with high contrast, optimized for daylight.
                    </span>

                    {/* Preview visual bar */}
                    <div className="mt-3 w-full h-3 rounded-md bg-slate-100 border border-slate-200 flex items-center px-1 gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                      <div className="w-8 h-1 rounded bg-slate-300" />
                      <div className="w-4 h-1 rounded bg-slate-200" />
                    </div>
                  </button>

                  {/* Dark Mode Option Card */}
                  <button
                    type="button"
                    onClick={() => updateSettings({ theme: 'dark' })}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                      settings.theme === 'dark'
                        ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-white/10 ring-1 ring-slate-900 dark:ring-white"
                        : "border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        settings.theme === 'dark'
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-100 dark:bg-[#1C1C1C] text-slate-600 dark:text-[#8B949E] group-hover:text-slate-900 dark:group-hover:text-white"
                      )}>
                        <Moon size={18} />
                      </div>
                      {settings.theme === 'dark' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white mb-1">
                      Dark Mode
                    </span>
                    <span className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                      Deep obsidian background, reduced eye strain for focused coding.
                    </span>

                    {/* Preview visual bar */}
                    <div className="mt-3 w-full h-3 rounded-md bg-[#0A0A0A] border border-[#2A2A2A] flex items-center px-1 gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      <div className="w-8 h-1 rounded bg-[#2A2A2A]" />
                      <div className="w-4 h-1 rounded bg-[#1C1C1C]" />
                    </div>
                  </button>

                  {/* System Theme Option Card */}
                  <button
                    type="button"
                    onClick={() => updateSettings({ theme: 'system' })}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer",
                      settings.theme === 'system'
                        ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-white/10 ring-1 ring-slate-900 dark:ring-white"
                        : "border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:border-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        settings.theme === 'system'
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-100 dark:bg-[#1C1C1C] text-slate-600 dark:text-[#8B949E] group-hover:text-slate-900 dark:group-hover:text-white"
                      )}>
                        <Laptop size={18} />
                      </div>
                      {settings.theme === 'system' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white mb-1">
                      System Sync
                    </span>
                    <span className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                      Automatically matches your operating system theme preference.
                    </span>

                    {/* Preview visual bar */}
                    <div className="mt-3 w-full h-3 rounded-md bg-gradient-to-r from-slate-200 to-[#141414] border border-slate-300 dark:border-[#2A2A2A] flex items-center px-1 gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      <div className="w-8 h-1 rounded bg-slate-400" />
                      <div className="w-4 h-1 rounded bg-slate-600" />
                    </div>
                  </button>
                </div>
              </div>

              {/* Quick Switch Row */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#2A2A2A] bg-slate-50/50 dark:bg-[#141414] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">Quick Switch</div>
                  <div className="text-xs text-slate-500 dark:text-[#8B949E]">Instantly flip between Light and Dark themes</div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
                >
                  {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  <span>Switch to {settings.theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
              </div>
            </div>
          )}

          {/* EDITOR SECTION */}
          {activeSection === 'editor' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8B949E] mb-3">
                Editor Configuration
              </h3>

              <div className="space-y-3 divide-y divide-slate-200 dark:divide-[#2A2A2A] border border-slate-200 dark:border-[#2A2A2A] rounded-xl p-4 bg-white dark:bg-[#141414]">
                <div className="flex items-center justify-between pb-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">Font Size</div>
                    <div className="text-xs text-slate-500 dark:text-[#8B949E]">Adjust the code editor font size in pixels</div>
                  </div>
                  <input
                    type="number"
                    className="bg-slate-50 dark:bg-[#0A0A0A] border border-slate-300 dark:border-[#2A2A2A] rounded-lg px-3 py-1.5 text-sm outline-none w-20 text-right focus:border-slate-500 dark:focus:border-white/40 text-slate-900 dark:text-white"
                    value={settings.fontSize}
                    onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) || 14 })}
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">Word Wrap</div>
                    <div className="text-xs text-slate-500 dark:text-[#8B949E]">Wrap long lines inside the editor viewport</div>
                  </div>
                  <select
                    className="bg-slate-50 dark:bg-[#0A0A0A] border border-slate-300 dark:border-[#2A2A2A] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-slate-500 dark:focus:border-white/40 text-slate-900 dark:text-white cursor-pointer"
                    value={settings.wordWrap}
                    onChange={(e) => updateSettings({ wordWrap: e.target.value as any })}
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">Minimap</div>
                    <div className="text-xs text-slate-500 dark:text-[#8B949E]">Display overview minimap on the right margin</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.minimap}
                    onChange={(e) => updateSettings({ minimap: e.target.checked })}
                    className="w-4 h-4 accent-slate-900 dark:accent-white rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">Tab Size</div>
                    <div className="text-xs text-slate-500 dark:text-[#8B949E]">Indentation spaces per tab press</div>
                  </div>
                  <input
                    type="number"
                    className="bg-slate-50 dark:bg-[#0A0A0A] border border-slate-300 dark:border-[#2A2A2A] rounded-lg px-3 py-1.5 text-sm outline-none w-20 text-right focus:border-slate-500 dark:focus:border-white/40 text-slate-900 dark:text-white"
                    value={settings.tabSize}
                    onChange={(e) => updateSettings({ tabSize: parseInt(e.target.value) || 2 })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* INTEGRATIONS SECTION */}
          {activeSection === 'integrations' && (
            <div className="h-full">
              <IntegrationsPage />
            </div>
          )}

          {/* PRIVACY & DATA CONSENT SECTION */}
          {activeSection === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Optional diagnostic logging</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">The public privacy notice is still a draft.</p>
              </div>

              {consentSuccessMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <Check size={14} />
                  <span>{consentSuccessMsg}</span>
                </div>
              )}

              {consentError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
                  <span>{consentError}</span>
                  <button onClick={clearError} className="text-xs underline cursor-pointer">Dismiss</button>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Diagnostic logging preference</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                        preferences.sharingEnabled
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                      }`}>
                        {preferences.sharingEnabled ? 'Enabled (development diagnostics)' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1">
                      Optional telemetry is not connected to an external analytics service in this release. This preference only gates diagnostic logging in development. AI prompts and attached context still pass through the configured server to the selected model provider.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.sharingEnabled}
                    disabled={isSavingConsent}
                    onClick={async () => {
                      const target = !preferences.sharingEnabled;
                      const ok = await updateConsent(target, 'settings');
                      if (ok) {
                        setConsentSuccessMsg(target ? 'Diagnostic logging preference enabled.' : 'Diagnostic logging preference disabled.');
                        setTimeout(() => setConsentSuccessMsg(null), 3000);
                      }
                    }}
                    className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer shrink-0 ${
                      preferences.sharingEnabled ? 'bg-slate-900 dark:bg-white' : 'bg-slate-300 dark:bg-[#2A2A2A]'
                    }`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${
                      preferences.sharingEnabled
                        ? 'translate-x-5 bg-white dark:bg-black'
                        : 'translate-x-0 bg-white dark:bg-[#8B949E]'
                    }`} />
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-white/5 text-[11px] text-slate-500 dark:text-[#8B949E] flex items-center justify-between">
                  <span>Consent record: Draft</span>
                  <span>{preferences.syncedWithCloud ? 'Cloud Synced' : 'Local Storage'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={isSavingConsent || !preferences.sharingEnabled}
                  onClick={async () => {
                    const ok = await withdrawConsent();
                    if (ok) {
                      setConsentSuccessMsg('Diagnostic logging preference reset to disabled.');
                      setTimeout(() => setConsentSuccessMsg(null), 3000);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Reset Preference
                </button>

                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                >
                  <span>Read data-handling draft</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-[#2A2A2A] bg-slate-50 dark:bg-[#111111] flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 dark:text-[#8B949E]">
            FLOAT Editor Environment
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
