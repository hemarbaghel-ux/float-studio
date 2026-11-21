/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Key, Check, AlertCircle, Loader2, Trash2, Eye, EyeOff, Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getClientKeys,
  saveClientKey,
  deleteClientKey,
  validateClientKey,
  UserApiKeyRecord
} from '../../services/byok/clientKeyring';

interface ProviderMeta {
  id: 'openai' | 'anthropic' | 'google' | 'deepseek';
  name: string;
  description: string;
  placeholder: string;
  docUrl: string;
  unlockedModels: string[];
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Bypass platform rate limits and unlock Flagship o1 Reasoning and GPT-4o.',
    placeholder: 'sk-proj-...',
    docUrl: 'https://platform.openai.com/api-keys',
    unlockedModels: ['o1', 'o3-mini', 'gpt-4o', 'gpt-4o-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Direct high-tier access to Claude 3.5 Sonnet, Claude 3.5 Haiku, and Opus.',
    placeholder: 'sk-ant-api03-...',
    docUrl: 'https://console.anthropic.com/settings/keys',
    unlockedModels: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Unlock 2M token long-context window with Gemini 1.5 Pro and Gemini 2.0 Flash.',
    placeholder: 'AIzaSy...',
    docUrl: 'https://aistudio.google.com/app/apikey',
    unlockedModels: ['gemini-1.5-pro', 'gemini-2.0-flash'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Direct access to DeepSeek V3 Flagship and DeepSeek R1 open reasoning models.',
    placeholder: 'sk-...',
    docUrl: 'https://platform.deepseek.com/api_keys',
    unlockedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
];

export function ByokModelKeySettings() {
  const [keys, setKeys] = useState<UserApiKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testState, setTestState] = useState<Record<string, { loading: boolean; success?: boolean; error?: string }>>({});
  const [saveState, setSaveState] = useState<Record<string, { loading: boolean; error?: string }>>({});

  const fetchKeys = async () => {
    try {
      setIsLoading(true);
      const clientKeys = await getClientKeys();
      setKeys(clientKeys);
    } catch {
      setKeys([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleTestKey = async (providerId: string) => {
    const apiKey = inputs[providerId]?.trim();
    if (!apiKey) return;

    setTestState(prev => ({ ...prev, [providerId]: { loading: true } }));
    try {
      const res = await validateClientKey(providerId, apiKey);
      if (res.valid) {
        setTestState(prev => ({ ...prev, [providerId]: { loading: false, success: true } }));
      } else {
        setTestState(prev => ({
          ...prev,
          [providerId]: { loading: false, success: false, error: res.error || 'Key validation failed' },
        }));
      }
    } catch (err: any) {
      setTestState(prev => ({
        ...prev,
        [providerId]: { loading: false, success: false, error: err.message || 'Validation error' },
      }));
    }
  };

  const handleSaveKey = async (providerId: string) => {
    const apiKey = inputs[providerId]?.trim();
    if (!apiKey) return;

    setSaveState(prev => ({ ...prev, [providerId]: { loading: true } }));
    try {
      await saveClientKey(providerId, apiKey);
      setInputs(prev => ({ ...prev, [providerId]: '' }));
      setTestState(prev => ({ ...prev, [providerId]: { loading: false, success: true } }));
      await fetchKeys();
    } catch (err: any) {
      setSaveState(prev => ({
        ...prev,
        [providerId]: { loading: false, error: err.message || 'Failed to save key' },
      }));
    } finally {
      setSaveState(prev => ({ ...prev, [providerId]: { ...prev[providerId], loading: false } }));
    }
  };

  const handleDeleteKey = async (providerId: string) => {
    try {
      await deleteClientKey(providerId);
      await fetchKeys();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8B949E]">
            Bring Your Own API Keys (BYOK)
          </h3>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <Sparkles size={12} />
            Unlocks Higher & Reasoning Models
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-[#8B949E]">
          Provide your own API keys to bypass platform rate limits and directly access advanced models (Claude 3.5 Sonnet, OpenAI o1, Gemini 1.5 Pro, and DeepSeek R1). Keys are encrypted at rest with AES-256-GCM.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8 text-xs text-slate-400">
          <Loader2 size={16} className="animate-spin mr-2" />
          Loading secure key vault...
        </div>
      ) : (
        <div className="space-y-4">
          {PROVIDERS.map(p => {
            const configuredKey = keys.find(k => k.provider === p.id);
            const isConfigured = Boolean(configuredKey);
            const currentInput = inputs[p.id] || '';
            const tState = testState[p.id];
            const sState = saveState[p.id];

            return (
              <div
                key={p.id}
                className={cn(
                  "p-4 rounded-xl border transition-colors",
                  isConfigured
                    ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10"
                    : "border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414]"
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</h4>
                      {isConfigured ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <Check size={10} /> Active ({configuredKey?.masked})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          Free Mode (Local Simulation)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">{p.description}</p>
                  </div>

                  <a
                    href={p.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 shrink-0"
                  >
                    Get Key <ExternalLink size={11} />
                  </a>
                </div>

                {/* Unlocked Model Badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.unlockedModels.map(m => (
                    <span
                      key={m}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-md font-mono",
                        isConfigured
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20"
                          : "bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-400"
                      )}
                    >
                      {m}
                    </span>
                  ))}
                </div>

                {/* Input and Controls */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey[p.id] ? 'text' : 'password'}
                        value={currentInput}
                        onChange={e => setInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder={isConfigured ? 'Enter new key to update...' : p.placeholder}
                        className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#2A2A2A] bg-slate-50 dark:bg-[#0E0E0E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-600"
                      />
                      <Key size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <button
                        type="button"
                        onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showKey[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!currentInput || tState?.loading}
                      onClick={() => handleTestKey(p.id)}
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#222] dark:hover:bg-[#2A2A2A] text-slate-700 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {tState?.loading ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                    </button>

                    <button
                      type="button"
                      disabled={!currentInput || sState?.loading}
                      onClick={() => handleSaveKey(p.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {sState?.loading ? <Loader2 size={12} className="animate-spin" /> : isConfigured ? 'Update' : 'Save'}
                    </button>

                    {isConfigured && (
                      <button
                        type="button"
                        onClick={() => handleDeleteKey(p.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                        title="Remove custom key"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Test Feedback */}
                  {tState?.success && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check size={12} /> Key validated successfully against {p.name}.
                    </div>
                  )}
                  {tState?.error && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {tState.error}
                    </div>
                  )}
                  {sState?.error && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {sState.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
