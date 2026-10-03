import clsx from 'clsx';
import { Sparkles, Check, ChevronDown, Lock, Infinity as InfinityIcon, MessageCircleQuestion, Bot } from 'lucide-react';
import { useStore } from '../lib/store';
import { MODELS } from '../lib/models';
import type { Effort } from '../lib/types';
import { Popover, Toggle, GeminiIcon } from './ui';

const EFFORTS: Effort[] = ['low', 'medium', 'high'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ModelPicker() {
  const cfg = useStore((s) => s.modelConfig);
  const plan = useStore((s) => s.user.plan);
  const settings = useStore((s) => s.settings);
  const { updateModelConfig, setModal } = useStore.getState();
  const current = cfg.model === 'auto' ? null : MODELS.find((m) => m.id === cfg.model);
  const configured = (p: string) => (p === 'gemini' ? !!settings.geminiKey : p === 'openai' ? !!settings.openaiKey : true);

  return (
    <Popover
      side="top"
      className="w-[300px]"
      trigger={(open, toggle) => (
        <button
          onClick={toggle}
          className={clsx('flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] hover:bg-muted', open && 'bg-muted')}
          aria-label="Choose model"
        >
          {cfg.mode === 'ask' ? <MessageCircleQuestion size={14} className="text-sky-500" /> : <Sparkles size={14} className="text-accent" />}
          <span className="font-semibold">{current ? current.label : 'Auto'}</span>
          <span className="hidden text-[12px] text-faint sm:inline">{current ? current.speed : 'High Fast'}</span>
          <span className="rounded border border-line bg-muted px-1 font-mono text-[10px] text-sub">{cap(cfg.effort)}</span>
          {cfg.maxMode && <span className="rounded bg-fg px-1 text-[10px] font-semibold text-bg">MAX</span>}
          <ChevronDown size={13} className="text-faint" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1">
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
            {(['agent', 'ask'] as const).map((m) => (
              <button
                key={m}
                onClick={() => updateModelConfig({ mode: m })}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-md py-1 text-[12px] font-medium',
                  cfg.mode === m ? 'bg-panel shadow-sm' : 'text-sub',
                )}
              >
                {m === 'agent' ? <Bot size={13} /> : <MessageCircleQuestion size={13} />}
                {cap(m)}
              </button>
            ))}
          </div>

          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Model</div>
          <button
            onClick={() => (updateModelConfig({ model: 'auto' }), close())}
            className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
          >
            <Sparkles size={15} className="mt-0.5 text-accent" />
            <span className="flex-1">
              <span className="block text-[13px] font-medium">Auto</span>
              <span className="block text-[11px] text-faint">Routes each request to High or Fast models</span>
            </span>
            {cfg.model === 'auto' && <Check size={14} className="mt-0.5" />}
          </button>
          {MODELS.map((m) => {
            const locked = m.pro && plan === 'free';
            const ok = configured(m.provider);
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (locked) return setModal('upgrade');
                  updateModelConfig({ model: m.id });
                  close();
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="mt-0.5 w-[15px]">{m.provider === 'gemini' ? <GeminiIcon size={15} /> : <Bot size={15} className="text-sub" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {m.label}
                    <span className="text-[10px] font-normal text-faint">{m.speed}</span>
                    {locked && <Lock size={11} className="text-faint" />}
                  </span>
                  <span className="block truncate text-[11px] text-faint">{ok ? m.description : 'Add API key in Integrations'}</span>
                </span>
                {cfg.model === m.id && <Check size={14} className="mt-0.5" />}
              </button>
            );
          })}

          <div className="my-1.5 border-t border-line" />
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Reasoning effort</div>
          <div className="mx-1 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
            {EFFORTS.map((e) => (
              <button
                key={e}
                onClick={() => updateModelConfig({ effort: e })}
                className={clsx('rounded-md py-1 text-[12px]', cfg.effort === e ? 'bg-panel font-medium shadow-sm' : 'text-sub')}
              >
                {cap(e)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <InfinityIcon size={15} className="text-sub" />
            <span className="flex-1">
              <span className="block text-[13px] font-medium">Max mode {plan === 'free' && <Lock size={11} className="inline text-faint" />}</span>
              <span className="block text-[11px] text-faint">Longer runs (40 steps) and strongest models</span>
            </span>
            <Toggle
              label="Max mode"
              checked={cfg.maxMode}
              onChange={(v) => (plan === 'free' ? setModal('upgrade') : updateModelConfig({ maxMode: v }))}
            />
          </div>
        </div>
      )}
    </Popover>
  );
}
