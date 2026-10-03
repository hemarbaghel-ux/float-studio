import { nanoid } from 'nanoid';
import { getState } from './store';
import { runAgent } from './agent/runAgent';
import { slackNotify } from './integrations';
import type { Automation, Schedule } from './types';

export function nextRunAt(a: Pick<Automation, 'schedule' | 'lastRunAt' | 'createdAt'>, now = Date.now()): number | null {
  const s = a.schedule;
  if (s.type === 'interval') return Math.max(now, (a.lastRunAt ?? a.createdAt) + s.minutes * 60_000);
  if (s.type === 'daily') {
    const [h, m] = s.time.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    const lastBoundary = d.getTime() <= now ? d.getTime() : d.getTime() - 86_400_000;
    if ((a.lastRunAt ?? a.createdAt) < lastBoundary && lastBoundary <= now) return now; // due
    return d.getTime() > now ? d.getTime() : d.getTime() + 86_400_000;
  }
  return null;
}

export function isDue(a: Automation, now = Date.now()) {
  if (!a.enabled) return false;
  const s = a.schedule;
  if (s.type === 'interval') return now >= (a.lastRunAt ?? a.createdAt) + s.minutes * 60_000;
  if (s.type === 'daily') {
    const [h, m] = s.time.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return now >= d.getTime() && (a.lastRunAt ?? a.createdAt) < d.getTime();
  }
  return false;
}

export function describeSchedule(s: Schedule) {
  switch (s.type) {
    case 'manual':
      return 'Manual';
    case 'interval':
      return s.minutes % 60 === 0 ? `Every ${s.minutes / 60}h` : `Every ${s.minutes} min`;
    case 'daily':
      return `Daily at ${s.time}`;
    case 'on-change':
      return 'On file change';
  }
}

const inflight = new Set<string>();

export async function runAutomation(id: string) {
  const s = getState();
  const a = s.automations.find((x) => x.id === id);
  if (!a || inflight.has(id)) return;
  inflight.add(id);
  const chatId = s.createChat(a.name, { source: 'automation', automationId: a.id });
  const runId = nanoid(8);
  s.addRun(a.id, { id: runId, at: Date.now(), chatId, status: 'running' });
  try {
    const r = await runAgent({ chatId, prompt: a.prompt });
    const summary = r.text.slice(0, 280);
    getState().updateRun(a.id, runId, { status: r.ok ? 'success' : 'error', summary });
    const hook = getState().settings.slackWebhook;
    if (a.notifySlack && hook) {
      await slackNotify(hook, `*FLOAT automation:* ${a.name}\n${r.ok ? '✅' : '⚠️'} ${summary}`).catch(() => {});
    }
    getState().toast(`Automation “${a.name}” ${r.ok ? 'finished' : 'failed'}`, r.ok ? 'success' : 'error');
  } finally {
    inflight.delete(id);
  }
}
