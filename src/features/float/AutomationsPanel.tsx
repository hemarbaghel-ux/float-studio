import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, Clock, Loader2, Pause, Play, Plus, Trash2, Workflow, X, XCircle, ExternalLink } from 'lucide-react';
import { isAutomationOwnedBy, useAutomations, describeTrigger, type Automation, type TriggerKind } from './automationStore';
import { runAutomation } from './automationEngine';
import { useAuthStore } from '../../store/authStore';

const TEMPLATES: { name: string; prompt: string; trigger: TriggerKind; everyMinutes?: number; dailyAt?: string }[] = [
  {
    name: 'Daily code review',
    prompt: 'Review the workspace for bugs, security issues and missing tests. List the top 5 findings with file paths and suggested fixes.',
    trigger: 'daily',
    dailyAt: '09:00',
  },
  {
    name: 'TODO sweeper',
    prompt: 'Find every TODO / FIXME in the workspace and propose a concrete implementation plan for each one.',
    trigger: 'interval',
    everyMinutes: 60,
  },
  {
    name: 'Write release notes',
    prompt: 'Summarize what this project does and write user-facing release notes for the current state of the code.',
    trigger: 'manual',
  },
];

function timeAgo(ts?: number) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function timeUntil(ts?: number) {
  if (!ts) return '—';
  const d = ts - Date.now();
  if (d <= 0) return 'due now';
  if (d < 3_600_000) return `in ${Math.ceil(d / 60_000)}m`;
  if (d < 86_400_000) return `in ${Math.round(d / 3_600_000)}h`;
  return new Date(ts).toLocaleString();
}

const input =
  'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none focus:border-slate-400 dark:focus:border-white/30';

function Editor({ initial, onClose }: { initial?: Partial<Automation>; onClose: () => void }) {
  const { create, update } = useAutomations();
  const [name, setName] = useState(initial?.name ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [trigger, setTrigger] = useState<TriggerKind>(initial?.trigger ?? 'manual');
  const [everyMinutes, setEvery] = useState(initial?.everyMinutes ?? 60);
  const [dailyAt, setDailyAt] = useState(initial?.dailyAt ?? '09:00');
  const [includeWorkspace, setInclude] = useState(initial?.includeWorkspace ?? true);
  const [slackWebhook, setSlack] = useState(initial?.slackWebhook ?? '');
  const ownerId = useAuthStore((state) => state.user?.uid);
  const valid = Boolean(ownerId && name.trim() && prompt.trim() && (!slackWebhook || /^https:\/\/hooks\.slack\.com\//.test(slackWebhook)));

  const save = () => {
    if (!valid) return;
    if (!ownerId) return;
    const data = { ownerId, name: name.trim(), prompt: prompt.trim(), trigger, everyMinutes, dailyAt, includeWorkspace, slackWebhook: slackWebhook.trim() || undefined };
    if (initial?.id) update(initial.id, data);
    else create({ ...data, enabled: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Automation"
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{initial?.id ? 'Edit automation' : 'New automation'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-3.5 p-5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-[#8B949E]">Name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly dependency audit" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-[#8B949E]">Instructions for the agent</span>
            <textarea className={`${input} min-h-[96px] resize-y`} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Check for outdated packages and summarize the risk..." />
          </label>
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-[#8B949E]">Trigger</span>
            <div className="flex gap-1.5">
              {(['manual', 'interval', 'daily'] as TriggerKind[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTrigger(t)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs capitalize cursor-pointer ${
                    trigger === t ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-white/5 font-semibold' : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  {t === 'interval' ? 'Repeat' : t}
                </button>
              ))}
            </div>
            {trigger === 'interval' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-[#C9D1D9]">
                Every
                <input type="number" min={1} className={`${input} w-20`} value={everyMinutes} onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))} />
                minutes
              </div>
            )}
            {trigger === 'daily' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-[#C9D1D9]">
                At
                <input type="time" className={`${input} w-32`} value={dailyAt} onChange={(e) => setDailyAt(e.target.value)} />
                local time
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-[#C9D1D9] cursor-pointer">
            <input type="checkbox" checked={includeWorkspace} onChange={(e) => setInclude(e.target.checked)} />
            Include the active workspace files as context
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-[#8B949E]">Slack webhook (optional)</span>
            <input className={input} value={slackWebhook} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
          </label>
          <p className="text-[11px] text-slate-400 dark:text-[#6E7681]">Scheduled automations run while FLOAT is open in a tab. Missed runs start as soon as you return.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-white/10 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid}
            className="rounded-lg bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-black disabled:opacity-40 cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationsPanel() {
  const { automations: storedAutomations, update, remove } = useAutomations();
  const ownerId = useAuthStore((state) => state.user?.uid);
  const automations = useMemo(() => storedAutomations.filter((automation) => isAutomationOwnedBy(automation, ownerId)), [storedAutomations, ownerId]);
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const current = useMemo(() => automations.find((a) => a.id === selected) ?? automations[0], [automations, selected]);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const openInWorkspace = (prompt: string) => {
    sessionStorage.setItem('float_draft_prompt', prompt);
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="w-full h-full p-6 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-blue-600 dark:text-blue-400 mb-1">
            <Workflow size={14} />
            <span>Automations Engine</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Developer Automations</h2>
          <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1">Run agent tasks on a schedule or on demand, with results posted here and to Slack.</p>
          {!ownerId && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Sign in to create and run automations. Your saved automations are scoped to your account on this browser.</p>}
        </div>
        <button
          onClick={() => setEditing({})}
          className="px-3.5 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus size={14} /> New automation
        </button>
      </div>

      {automations.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => setEditing({ name: t.name, prompt: t.prompt, trigger: t.trigger, everyMinutes: t.everyMinutes ?? 60, dailyAt: t.dailyAt ?? '09:00', includeWorkspace: true })}
              className="text-left bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-xl p-4 hover:border-blue-500/50 transition-colors cursor-pointer"
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.name}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-[#8B949E] line-clamp-3">{t.prompt}</div>
              <div className="mt-3 text-[11px] text-blue-600 dark:text-blue-400 font-medium">Use template →</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 min-h-0">
          <div className="flex flex-col gap-2">
            {automations.map((a) => {
              const last = a.runs[0];
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a.id)}
                  className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                    current?.id === a.id ? 'border-slate-900 dark:border-white/40 bg-white dark:bg-[#141414]' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {last?.status === 'running' ? (
                      <Loader2 size={13} className="animate-spin text-blue-500" />
                    ) : last?.status === 'error' ? (
                      <XCircle size={13} className="text-rose-500" />
                    ) : last ? (
                      <CheckCircle2 size={13} className="text-emerald-500" />
                    ) : (
                      <Clock size={13} className="text-slate-400" />
                    )}
                    <span className="flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{a.name}</span>
                    {!a.enabled && <span className="text-[10px] rounded bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-slate-500">Paused</span>}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400 dark:text-[#8B949E]">
                    <span>{describeTrigger(a)}</span>
                    <span>{a.enabled && a.trigger !== 'manual' ? `Next ${timeUntil(a.nextRunAt)}` : `Last ${timeAgo(a.lastRunAt)}`}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {current && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 flex flex-col gap-4 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">{current.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
                    {describeTrigger(current)} · {current.includeWorkspace ? 'with workspace context' : 'prompt only'}
                    {current.slackWebhook ? ' · Slack' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void runAutomation(current.id)}
                    disabled={!ownerId || current.runs[0]?.status === 'running'}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {current.runs[0]?.status === 'running' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run now
                  </button>
                  {current.trigger !== 'manual' && (
                    <button
                      onClick={() => update(current.id, { enabled: !current.enabled })}
                      title={current.enabled ? 'Pause' : 'Resume'}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                    >
                      {current.enabled ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  )}
                  <button onClick={() => setEditing(current)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${current.name}"?`)) remove(current.id);
                    }}
                    title="Delete"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-[#0A0A0A] border border-slate-100 dark:border-white/5 p-3 text-xs text-slate-700 dark:text-[#C9D1D9] font-sans">{current.prompt}</pre>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#6E7681]">Run history</div>
                {current.runs.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-[#8B949E]">No runs yet. Click Run now to try it.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {current.runs.map((r, i) => {
                      const expanded = openRun === r.id || (openRun === null && i === 0);
                      return (
                        <div key={r.id} className="rounded-lg border border-slate-200 dark:border-white/10">
                          <button onClick={() => setOpenRun(expanded ? '' : r.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer">
                            {r.status === 'running' ? (
                              <Loader2 size={12} className="animate-spin text-blue-500" />
                            ) : r.status === 'error' ? (
                              <XCircle size={12} className="text-rose-500" />
                            ) : (
                              <CheckCircle2 size={12} className="text-emerald-500" />
                            )}
                            <span className="flex-1 text-left text-slate-700 dark:text-[#C9D1D9]">{new Date(r.startedAt).toLocaleString()}</span>
                            <span className="text-slate-400">{r.finishedAt ? `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s` : 'running…'}</span>
                          </button>
                          {expanded && r.status !== 'running' && (
                            <div className="border-t border-slate-100 dark:border-white/5 px-3 py-2.5">
                              <div className={`prose prose-sm dark:prose-invert max-w-none text-xs ${r.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-[#C9D1D9]'}`}>
                                <ReactMarkdown>{r.output}</ReactMarkdown>
                              </div>
                              {r.status === 'success' && <button
                                onClick={() => openInWorkspace(`${current.prompt}\n\nPrevious automation report:\n${r.output.slice(0, 4000)}`)}
                                className="mt-2 text-[11px] font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline cursor-pointer"
                              >
                                Continue in a new chat <ExternalLink size={11} />
                              </button>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
