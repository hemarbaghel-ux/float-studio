import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Cloud, Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import { AVAILABLE_PROFILES, formatDuration, useCloudSession, CloudProfile } from './cloudSessionStore';

function useTick(ms: number, enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

/** Banner shown on top of the composer. Opens the session dialog or shows the live session. */
export function CloudSessionBanner() {
  return null;
}

export function CloudSessionModal() {
  const { modalOpen, closeModal, start, active, sessionId, environmentId, modelAttached, stop } = useCloudSession();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'custom'>('profile');
  const [customSessionId, setCustomSessionId] = useState(sessionId || '');
  const [customEnvId, setCustomEnvId] = useState(environmentId || '');

  if (!modalOpen) return null;

  const currentSessionId = sessionId || AVAILABLE_PROFILES[0].sessionId;
  const currentEnvId = environmentId || AVAILABLE_PROFILES[0].environmentId;
  const execCommand = `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id '${currentEnvId}'`;

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(execCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectProfile = (p: CloudProfile) => {
    start('cloud-agent', `${p.id}-ccarenv`, p.sessionId, p.environmentId, p.model);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-[2px] p-4 pt-[6vh] overflow-y-auto" onMouseDown={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cloud execution session details"
        className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden mb-8"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-purple-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Cloud Session & Self-Hosted Environment</h2>
          </div>
          <button onClick={closeModal} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Active Session Status */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Check size={14} /> Active Attached Session
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                {active ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Model / Agent Target</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium text-xs">
                  {modelAttached || 'GPT-6.1 Sol (Preview)'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Session ID</span>
                <code className="text-slate-800 dark:text-slate-200 font-mono text-[11px] break-all bg-black/10 dark:bg-black/30 px-2 py-1 rounded block">
                  {currentSessionId}
                </code>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Environment ID</span>
                <code className="text-slate-800 dark:text-slate-200 font-mono text-[11px] break-all bg-black/10 dark:bg-black/30 px-2 py-1 rounded block">
                  {currentEnvId}
                </code>
              </div>
            </div>
          </div>

          {/* Quick Session Profile Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Select Known Session</span>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`px-2 py-0.5 rounded ${activeTab === 'profile' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Presets
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('custom')}
                  className={`px-2 py-0.5 rounded ${activeTab === 'custom' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Custom IDs
                </button>
              </div>
            </div>

            {activeTab === 'profile' ? (
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_PROFILES.map((p) => {
                  const isCurrent = currentSessionId === p.sessionId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProfile(p)}
                      className={`text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                        isCurrent
                          ? 'border-purple-500/60 bg-purple-500/10 text-purple-900 dark:text-purple-200 shadow-2xs'
                          : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs">{p.name}</span>
                        {isCurrent && <Check size={12} className="text-purple-600 dark:text-purple-400" />}
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                        {p.sessionId.slice(0, 16)}...
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Session ID</label>
                  <input
                    type="text"
                    value={customSessionId}
                    onChange={(e) => setCustomSessionId(e.target.value)}
                    placeholder="sess_..."
                    className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-black/40 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Environment ID</label>
                  <input
                    type="text"
                    value={customEnvId}
                    onChange={(e) => setCustomEnvId(e.target.value)}
                    placeholder="ccarenv_b64_..."
                    className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-black/40 text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (customSessionId && customEnvId) {
                      start('cloud-agent', 'custom-ccarenv', customSessionId.trim(), customEnvId.trim(), 'Custom Agent');
                    }
                  }}
                  className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Apply Custom Session
                </button>
              </div>
            )}
          </div>

          {/* Self-Hosted Environment Executor Command */}
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Cloud size={14} className="text-emerald-500" />
                Connect OpenAI Self-Hosted Environment
              </span>
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy Command'}
              </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              If your OpenAI dashboard shows <strong className="text-slate-900 dark:text-slate-200">"Your environment is disconnected"</strong>, run this command in your local PowerShell terminal. It launches <code className="font-mono text-emerald-600 dark:text-emerald-400">codex exec-server</code> to bridge your local environment to the remote session:
            </p>

            <code className="text-emerald-800 dark:text-emerald-300 font-mono text-[10px] break-all bg-black/10 dark:bg-black/30 p-2.5 rounded-lg block select-all">
              {execCommand}
            </code>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
              <strong className="text-amber-700 dark:text-amber-400 block font-semibold">Important Authentication Requirement:</strong>
              <span>
                OpenAI requires an <strong className="text-slate-800 dark:text-slate-200">Environment Key</strong> with the <code className="font-mono text-[10px] bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded">api.agents.environments.connect</code> scope. This is generated in your OpenAI Dashboard under <em className="text-slate-800 dark:text-slate-200">Agents &gt; Environments &gt; Keys</em>, or by clicking "connect your environment" in the OpenAI session banner.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                start('cloud-agent', 'sol-ccarenv', currentSessionId, currentEnvId, modelAttached);
                closeModal();
              }}
              className="flex-1 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check size={14} /> Synchronize Session
            </button>
            {active && (
              <button
                onClick={() => {
                  stop();
                  closeModal();
                }}
                className="py-2 px-4 rounded-lg border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
