import { useState } from 'react';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import { Workflow, Plus, Play, Trash2, Pencil, Clock, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { useStore } from '../lib/store';
import { describeSchedule, nextRunAt, runAutomation } from '../lib/automations';
import { timeAgo, timeUntil } from '../lib/time';
import { useNow } from '../hooks/useNow';
import type { Automation, Schedule } from '../lib/types';
import { Empty, Modal, Toggle, SlackIcon } from './ui';

const TEMPLATES: { name: string; prompt: string; schedule: Schedule }[] = [
  { name: 'Nightly test run', prompt: 'Run npm test. If anything fails, find the root cause and fix it, then re-run the tests.', schedule: { type: 'daily', time: '02:00' } },
  { name: 'Review changes on save', prompt: 'Review the most recently changed files for bugs, security issues and readability. Report findings concisely; do not modify files.', schedule: { type: 'on-change' } },
  { name: 'TODO sweeper', prompt: 'Search the codebase for TODO and FIXME comments and summarize them as a prioritized checklist.', schedule: { type: 'interval', minutes: 60 } },
  { name: 'Write missing tests', prompt: 'Find modules without tests and write unit tests for them, then run npm test.', schedule: { type: 'manual' } },
];

export function AutomationsView() {
  const automations = useStore((s) => s.automations);
  const [editing, setEditing] = useState<Automation | null>(null);
  const blank = (): Automation => ({
    id: nanoid(8),
    name: '',
    prompt: '',
    schedule: { type: 'interval', minutes: 60 },
    enabled: true,
    notifySlack: false,
    createdAt: Date.now(),
    runs: [],
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Automations</h1>
            <p className="mt-1 text-[13px] text-sub">Run agents on a schedule or when your code changes. Results land in Chats and optionally Slack.</p>
          </div>
          <button className="btn-primary" onClick={() => setEditing(blank())}>
            <Plus size={14} /> New automation
          </button>
        </div>

        {automations.length === 0 ? (
          <div className="card">
            <Empty
              icon={<Workflow size={20} />}
              title="No automations yet"
              body="Start from a template or create your own. Automations run while FLOAT is open in a tab."
            />
            <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setEditing({ ...blank(), name: t.name, prompt: t.prompt, schedule: t.schedule })}
                  className="rounded-xl border border-line p-3 text-left hover:bg-muted/60"
                >
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <Zap size={13} className="text-accent" /> {t.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-faint">{describeSchedule(t.schedule)}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {automations.map((a) => (
              <AutomationCard key={a.id} a={a} onEdit={() => setEditing(a)} />
            ))}
          </div>
        )}
      </div>
      {editing && <AutomationEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AutomationCard({ a, onEdit }: { a: Automation; onEdit: () => void }) {
  const now = useNow(15_000);
  const { upsertAutomation, deleteAutomation, openChat } = useStore.getState();
  const next = a.enabled ? nextRunAt(a, now) : null;
  const running = a.runs[0]?.status === 'running';
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className={clsx('mt-0.5 grid h-8 w-8 place-items-center rounded-lg', a.enabled ? 'bg-fg text-bg' : 'bg-muted text-faint')}>
          <Workflow size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{a.name}</span>
            {a.notifySlack && <SlackIcon size={12} />}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] text-sub">{a.prompt}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-faint">
            <span className="flex items-center gap-1">
              <Clock size={11} /> {describeSchedule(a.schedule)}
            </span>
            {next && <span>Next run {timeUntil(next, now)}</span>}
            {a.lastRunAt && <span>Last run {timeAgo(a.lastRunAt, now)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-outline px-2 py-1 text-[12px]" disabled={running} onClick={() => void runAutomation(a.id)}>
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run now
          </button>
          <button className="btn-ghost px-1.5" onClick={onEdit} aria-label="Edit">
            <Pencil size={14} />
          </button>
          <button className="btn-ghost px-1.5 hover:text-red-500" onClick={() => confirm(`Delete “${a.name}”?`) && deleteAutomation(a.id)} aria-label="Delete">
            <Trash2 size={14} />
          </button>
          <Toggle label="Enabled" checked={a.enabled} onChange={(v) => upsertAutomation({ ...a, enabled: v, createdAt: v && !a.enabled ? Date.now() : a.createdAt })} />
        </div>
      </div>
      {a.runs.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          {a.runs.slice(0, 4).map((r) => (
            <button key={r.id} onClick={() => openChat(r.chatId)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-muted/60">
              {r.status === 'running' ? (
                <Loader2 size={12} className="animate-spin text-faint" />
              ) : r.status === 'success' ? (
                <CheckCircle2 size={12} className="text-emerald-600" />
              ) : (
                <XCircle size={12} className="text-red-500" />
              )}
              <span className="w-16 shrink-0 text-faint">{timeAgo(r.at, now)}</span>
              <span className="truncate text-sub">{r.summary || (r.status === 'running' ? 'Running…' : 'No output')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AutomationEditor({ initial, onClose }: { initial: Automation; onClose: () => void }) {
  const [a, setA] = useState<Automation>(initial);
  const hasSlack = useStore((s) => !!s.settings.slackWebhook);
  const { upsertAutomation, toast } = useStore.getState();
  const isNew = !useStore.getState().automations.some((x) => x.id === a.id);
  const save = () => {
    if (!a.name.trim() || !a.prompt.trim()) return toast('Name and prompt are required', 'error');
    upsertAutomation({ ...a, createdAt: isNew ? Date.now() : a.createdAt });
    toast(isNew ? 'Automation created' : 'Automation saved', 'success');
    onClose();
  };
  const s = a.schedule;
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New automation' : 'Edit automation'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save}>
            {isNew ? 'Create' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-sub">Name</span>
          <input className="input" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Nightly test run" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-sub">Agent prompt</span>
          <textarea className="input min-h-[96px] resize-y" value={a.prompt} onChange={(e) => setA({ ...a, prompt: e.target.value })} placeholder="What should the agent do each run?" />
        </label>
        <div>
          <span className="mb-1 block text-[12px] font-medium text-sub">Trigger</span>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-0.5">
            {(
              [
                ['manual', 'Manual'],
                ['interval', 'Interval'],
                ['daily', 'Daily'],
                ['on-change', 'On change'],
              ] as const
            ).map(([t, l]) => (
              <button
                key={t}
                onClick={() =>
                  setA({
                    ...a,
                    schedule: t === 'interval' ? { type: t, minutes: 60 } : t === 'daily' ? { type: t, time: '09:00' } : { type: t },
                  })
                }
                className={clsx('rounded-md py-1 text-[12px]', s.type === t ? 'bg-panel font-medium shadow-sm' : 'text-sub')}
              >
                {l}
              </button>
            ))}
          </div>
          {s.type === 'interval' && (
            <select className="input mt-2" value={s.minutes} onChange={(e) => setA({ ...a, schedule: { type: 'interval', minutes: Number(e.target.value) } })}>
              {[5, 15, 30, 60, 180, 360, 720].map((m) => (
                <option key={m} value={m}>
                  Every {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}
                </option>
              ))}
            </select>
          )}
          {s.type === 'daily' && (
            <input type="time" className="input mt-2" value={s.time} onChange={(e) => setA({ ...a, schedule: { type: 'daily', time: e.target.value } })} />
          )}
          {s.type === 'on-change' && <p className="mt-2 text-[12px] text-faint">Runs 4 seconds after you stop editing files in the Codebase.</p>}
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <SlackIcon size={18} />
          <div className="flex-1">
            <div className="text-[13px] font-medium">Notify Slack</div>
            <div className="text-[12px] text-faint">{hasSlack ? 'Post a summary after each run' : 'Add a Slack webhook in Integrations to enable'}</div>
          </div>
          <Toggle label="Notify Slack" checked={a.notifySlack && hasSlack} onChange={(v) => hasSlack && setA({ ...a, notifySlack: v })} />
        </div>
      </div>
    </Modal>
  );
}
