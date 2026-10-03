import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CloudSessionState {
  active: boolean;
  startedAt?: number;
  region?: string;
  machine?: string;
  modalOpen: boolean;
  start: (region: string, machine: string) => void;
  stop: () => void;
  openModal: () => void;
  closeModal: () => void;
}

/** Cloud Agent session: unlocks the sandbox (node, npm test, shell) in the terminal and automations. */
export const useCloudSession = create<CloudSessionState>()(
  persist(
    (set) => ({
      active: false,
      modalOpen: false,
      start: (region, machine) => set({ active: true, startedAt: Date.now(), region, machine, modalOpen: false }),
      stop: () => set({ active: false, startedAt: undefined, region: undefined, machine: undefined }),
      openModal: () => set({ modalOpen: true }),
      closeModal: () => set({ modalOpen: false }),
    }),
    {
      name: 'float_cloud_session',
      partialize: (s) => ({ active: s.active, startedAt: s.startedAt, region: s.region, machine: s.machine }),
    },
  ),
);

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
