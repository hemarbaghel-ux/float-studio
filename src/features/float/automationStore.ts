import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export type TriggerKind = 'manual' | 'interval' | 'daily';

export interface AutomationRun {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'success' | 'error';
  output: string;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  trigger: TriggerKind;
  /** minutes, for interval triggers */
  everyMinutes: number;
  /** "HH:MM" local time, for daily triggers */
  dailyAt: string;
  enabled: boolean;
  includeWorkspace: boolean;
  slackWebhook?: string;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runs: AutomationRun[];
}

export function computeNextRun(a: Pick<Automation, 'trigger' | 'everyMinutes' | 'dailyAt' | 'enabled'>, from = Date.now()): number | undefined {
  if (!a.enabled || a.trigger === 'manual') return undefined;
  if (a.trigger === 'interval') return from + Math.max(1, a.everyMinutes) * 60_000;
  const [h, m] = (a.dailyAt || '09:00').split(':').map((n) => parseInt(n, 10) || 0);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function describeTrigger(a: Automation) {
  if (a.trigger === 'manual') return 'Manual';
  if (a.trigger === 'interval') return `Every ${a.everyMinutes} min`;
  return `Daily at ${a.dailyAt}`;
}

interface AutomationState {
  automations: Automation[];
  create: (input: Omit<Automation, 'id' | 'createdAt' | 'runs' | 'nextRunAt' | 'lastRunAt'>) => string;
  update: (id: string, patch: Partial<Automation>) => void;
  remove: (id: string) => void;
  startRun: (id: string) => string;
  finishRun: (id: string, runId: string, status: 'success' | 'error', output: string) => void;
}

export const useAutomations = create<AutomationState>()(
  persist(
    (set) => ({
      automations: [],
      create: (input) => {
        const id = uuidv4();
        const a: Automation = { ...input, id, createdAt: Date.now(), runs: [] };
        a.nextRunAt = computeNextRun(a);
        set((s) => ({ automations: [a, ...s.automations] }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({
          automations: s.automations.map((a) => {
            if (a.id !== id) return a;
            const next = { ...a, ...patch };
            if ('trigger' in patch || 'everyMinutes' in patch || 'dailyAt' in patch || 'enabled' in patch) next.nextRunAt = computeNextRun(next);
            return next;
          }),
        })),
      remove: (id) => set((s) => ({ automations: s.automations.filter((a) => a.id !== id) })),
      startRun: (id) => {
        const runId = uuidv4();
        const now = Date.now();
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id
              ? {
                  ...a,
                  lastRunAt: now,
                  nextRunAt: computeNextRun(a, now),
                  runs: [{ id: runId, startedAt: now, status: 'running' as const, output: '' }, ...a.runs].slice(0, 20),
                }
              : a,
          ),
        }));
        return runId;
      },
      finishRun: (id, runId, status, output) =>
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id ? { ...a, runs: a.runs.map((r) => (r.id === runId ? { ...r, status, output, finishedAt: Date.now() } : r)) } : a,
          ),
        })),
    }),
    {
      name: 'float_automations',
      // A run that was "running" when the tab closed can never finish: mark it as interrupted.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.automations = state.automations.map((a) => ({
          ...a,
          runs: a.runs.map((r) => (r.status === 'running' ? { ...r, status: 'error' as const, output: r.output || 'Interrupted (tab was closed).' } : r)),
        }));
      },
    },
  ),
);
