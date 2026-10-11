import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  ArrowUp,
  ChevronDown,
  Square,
  Check,
  Bot,
  Sparkles,
  MessageSquare,
  Cloud,
  Code2,
} from 'lucide-react';
import {
  AgentMode,
  ContextPill,
  MODEL_TIER_LABELS,
  AGENT_MODE_LABELS,
  ModelTier,
} from './types';

const MODEL_OPTIONS: ModelTier[] = [
  'gpt-4o-balanced',
  'gpt-4o',
  'claude-sonnet',
  'claude-opus',
  'gemini-flash',
  'grok-fast',
  'float-pro',
  'composer',
];

const AGENT_OPTIONS: AgentMode[] = ['main', 'composer', 'agent', 'ask', 'cloud'];

interface PromptComposerProps {
  onSubmit: (text: string, pills: ContextPill[]) => void;
  isSubmitting?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  selectedModel: ModelTier;
  onModelChange: (model: ModelTier) => void;
  agentMode: AgentMode;
  onAgentModeChange: (mode: AgentMode) => void;
  initialPrompt?: string;
  placeholder?: string;
  className?: string;
}

export function PromptComposer({
  onSubmit,
  isSubmitting = false,
  isStreaming = false,
  onStop,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeChange,
  initialPrompt = '',
  placeholder = 'Ask FLOAT to build, fix bugs, explore',
  className = '',
}: PromptComposerProps) {
  const [text, setText] = useState(initialPrompt);
  const [pills, setPills] = useState<ContextPill[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const h = Math.min(Math.max(textareaRef.current.scrollHeight, 56), 200);
      textareaRef.current.style.height = `${h}px`;
    }
  }, [text]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
      if (agentRef.current && !agentRef.current.contains(e.target as Node)) setAgentOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting || isStreaming) return;
    onSubmit(trimmed, pills);
    setText('');
    setPills([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const addContextPill = () => {
    const id = `pill_${Date.now()}`;
    setPills((prev) => [
      ...prev,
      {
        id,
        type: 'codebase',
        label: '@Codebase',
        metadata: { path: 'src/' },
      },
    ]);
  };

  const removePill = (id: string) => {
    setPills((prev) => prev.filter((p) => p.id !== id));
  };

  const canSend = text.trim().length > 0 && !isSubmitting && !isStreaming;

  const agentIcon = (mode: AgentMode) => {
    switch (mode) {
      case 'composer':
        return <Code2 size={13} />;
      case 'agent':
        return <Bot size={13} />;
      case 'ask':
        return <MessageSquare size={13} />;
      case 'cloud':
        return <Cloud size={13} />;
      default:
        return <Sparkles size={13} />;
    }
  };

  return (
    <div
      className={`w-full bg-white dark:bg-[#141414] border border-slate-200/90 dark:border-[#2C2C2C] rounded-2xl shadow-sm overflow-hidden ${className}`}
    >
      {pills.length > 0 && (
        <div className="px-3 pt-3 flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <span
              key={pill.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20"
            >
              {pill.label}
              <button
                type="button"
                onClick={() => removePill(pill.id)}
                className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer"
                aria-label={`Remove ${pill.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={isSubmitting}
        className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-slate-900 dark:text-[#E6EDF3] placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none leading-relaxed"
      />

      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={addContextPill}
            title="Add context (@)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <Plus size={16} strokeWidth={2} />
          </button>

          {/* Model selector */}
          <div className="relative" ref={modelRef}>
            <button
              type="button"
              onClick={() => {
                setModelOpen((v) => !v);
                setAgentOpen(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer max-w-[140px]"
            >
              <span className="truncate font-medium">
                {MODEL_TIER_LABELS[selectedModel] || selectedModel}
              </span>
              <ChevronDown size={12} className="shrink-0 opacity-70" />
            </button>
            {modelOpen && (
              <div className="absolute bottom-full left-0 mb-1.5 w-48 bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2A2A2A] rounded-xl shadow-xl z-50 py-1 max-h-56 overflow-y-auto">
                {MODEL_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onModelChange(m);
                      setModelOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer ${
                      selectedModel === m
                        ? 'text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-[#8B949E]'
                    }`}
                  >
                    <span>{MODEL_TIER_LABELS[m]}</span>
                    {selectedModel === m && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agent mode selector */}
          <div className="relative" ref={agentRef}>
            <button
              type="button"
              onClick={() => {
                setAgentOpen((v) => !v);
                setModelOpen(false);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <span className="opacity-70">{agentIcon(agentMode)}</span>
              <span className="truncate font-medium max-w-[100px]">
                {AGENT_MODE_LABELS[agentMode] || agentMode}
              </span>
              <ChevronDown size={12} className="shrink-0 opacity-70" />
            </button>
            {agentOpen && (
              <div className="absolute bottom-full left-0 mb-1.5 w-44 bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2A2A2A] rounded-xl shadow-xl z-50 py-1">
                {AGENT_OPTIONS.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      onAgentModeChange(mode);
                      setAgentOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer ${
                      agentMode === mode
                        ? 'text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-[#8B949E]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {agentIcon(mode)}
                      {AGENT_MODE_LABELS[mode]}
                    </span>
                    {agentMode === mode && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center shrink-0">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              className="w-8 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-black flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              title="Send"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                canSend
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-black hover:opacity-90 cursor-pointer'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-300 dark:text-[#4A4A4A] cursor-not-allowed'
              }`}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
