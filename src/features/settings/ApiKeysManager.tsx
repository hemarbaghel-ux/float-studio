import React, { useState, useEffect } from 'react';
import {
  Key, Check, Shield, ExternalLink, Loader2,
  AlertCircle, Sparkles, Eye, EyeOff, CheckCircle2,
  Cpu, Trash2, RotateCcw
} from 'lucide-react';
import {
  getUserApiKeys,
  saveUserApiKeys,
  clearUserApiKeys,
  verifyApiKey,
  type UserApiKeys,
  type KeyVerificationResult
} from '../../services/apiKeyService';

export interface ProviderMeta {
  id: keyof UserApiKeys;
  name: string;
  tagline: string;
  models: string[];
  placeholder: string;
  docsUrl: string;
  keyPrefix: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Built-in free tier active by default for high-speed coding and deep architectural reasoning.',
    models: ['gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    placeholder: 'Built-in active (or enter custom AI Studio key)',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AIzaSy...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Frontier reasoning, Codex agent execution, and coding with GPT-4o, o1, and o3-mini.',
    models: ['gpt-4o', 'o1', 'o3-mini', 'gpt-4o-mini'],
    placeholder: 'sk-proj-... or sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    tagline: 'Exceptional coding, reasoning, and system architecture with Claude 3.7 Sonnet.',
    models: ['claude-3-7-sonnet', 'claude-3-5-sonnet'],
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'High-performance open weights and deep mathematical reasoning models.',
    models: ['deepseek-r1', 'deepseek-v3'],
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-...',
  },
];

interface ApiKeysManagerProps {
  onSaved?: () => void;
  className?: string;
}

export function ApiKeysManager({ onSaved, className = '' }: ApiKeysManagerProps) {
  const [keys, setKeys] = useState<UserApiKeys>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, KeyVerificationResult>>({});
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setKeys(getUserApiKeys());
    const onKeyChange = () => setKeys(getUserApiKeys());
    window.addEventListener('float-api-keys-changed', onKeyChange);
    return () => window.removeEventListener('float-api-keys-changed', onKeyChange);
  }, []);

  const toggleVisibility = (providerId: string) => {
    setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleKeyChange = (providerId: keyof UserApiKeys, value: string) => {
    setKeys((prev) => ({ ...prev, [providerId]: value }));
    if (results[providerId]) {
      setResults((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
    }
  };

  const handleVerify = async (providerId: keyof UserApiKeys) => {
    const keyValue = keys[providerId]?.trim() || '';
    if (!keyValue && providerId !== 'gemini') {
      setResults((prev) => ({
        ...prev,
        [providerId]: { valid: false, message: 'Please enter a key to verify.', provider: providerId },
      }));
      return;
    }

    setVerifying((prev) => ({ ...prev, [providerId]: true }));
    try {
      const effectiveKey = keyValue || (providerId === 'gemini' ? 'test' : '');
      const res = await verifyApiKey(providerId, effectiveKey);
      setResults((prev) => ({ ...prev, [providerId]: res }));
    } finally {
      setVerifying((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    saveUserApiKeys(keys);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onSaved?.();
    }, 700);
  };

  const handleClear = () => {
    if (confirm('Clear all stored custom API keys from this browser?')) {
      clearUserApiKeys();
      setKeys({});
      setResults({});
    }
  };

  const hasAnyKey = Boolean(keys.openai || keys.anthropic || keys.deepseek || keys.gemini);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Banner / Status Indicator */}
      <div className="p-3.5 rounded-xl bg-slate-900/40 dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] flex items-start gap-3">
        <Sparkles size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
              Cursor-Style Bring-Your-Own-Key (BYOK)
            </h4>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Zero Stored Secrets
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1 leading-relaxed">
            Keys are stored strictly in your browser's local storage and passed directly for authenticated streaming.
            Google Gemini includes a built-in free tier so you can always generate code even without external keys.
          </p>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <Check size={14} className="shrink-0" />
          <span>API keys saved successfully to local storage.</span>
        </div>
      )}

      {/* Provider List */}
      <div className="space-y-3">
        {PROVIDERS.map((provider) => {
          const currentVal = keys[provider.id] || '';
          const isVisible = showKeys[provider.id] || false;
          const isTesting = verifying[provider.id] || false;
          const result = results[provider.id];
          const isBuiltInGemini = provider.id === 'gemini' && !currentVal.trim();

          return (
            <div
              key={provider.id}
              className="p-3.5 rounded-xl bg-white dark:bg-[#12151B] border border-slate-200 dark:border-[#21262D] space-y-2.5 transition-colors hover:border-slate-300 dark:hover:border-[#30363D]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {provider.name}
                    </span>
                    {isBuiltInGemini ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} /> Built-in Free Tier
                      </span>
                    ) : currentVal.trim() ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-500 dark:text-blue-400">
                        <Cpu size={11} /> Custom Key Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-[#6E7681]">Optional</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
                    {provider.tagline}
                  </p>
                </div>

                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-[#58A6FF] hover:underline shrink-0"
                  title={`Get ${provider.name} API Key`}
                >
                  <span>Get Key</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              {/* Input & Verification */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={isVisible ? 'text' : 'password'}
                    value={currentVal}
                    onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                    placeholder={provider.placeholder}
                    spellCheck={false}
                    className="w-full bg-slate-50 dark:bg-[#0D1117] border border-slate-200 dark:border-[#30363D] focus:border-blue-500 dark:focus:border-[#58A6FF] rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#484F58] focus:outline-none pr-8 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisibility(provider.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    title={isVisible ? 'Hide Key' : 'Show Key'}
                    aria-label={isVisible ? 'Hide Key' : 'Show Key'}
                  >
                    {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleVerify(provider.id)}
                  disabled={isTesting || (!currentVal.trim() && provider.id !== 'gemini')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-[#30363D] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  {isTesting ? (
                    <>
                      <Loader2 size={12} className="animate-spin text-blue-500" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Verify Key</span>
                  )}
                </button>
              </div>

              {/* Verification Result Feedback */}
              {result && (
                <div
                  className={`p-2 rounded-md text-[11px] flex items-center gap-1.5 ${
                    result.valid
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {result.valid ? (
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle size={13} className="shrink-0 text-rose-500" />
                  )}
                  <span className="truncate">{result.message}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#21262D]">
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasAnyKey}
          className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer"
        >
          <Trash2 size={12} />
          <span>Clear All Stored Keys</span>
        </button>

        <button
          type="button"
          onClick={() => handleSave()}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm"
        >
          <Check size={14} />
          <span>Save API Keys</span>
        </button>
      </div>
    </div>
  );
}
