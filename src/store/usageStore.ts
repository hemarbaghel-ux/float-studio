import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ModelUsageRecord {
  requestId: string;
  userId: string;
  provider: string;
  modelId: string;
  agentId?: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  latency: number;
  timeToFirstToken?: number;
  estimatedCost: number;
  status: 'success' | 'error';
  errorType?: string;
  isFallback?: boolean;
  savingsUSD?: number;
}

interface UsageStore {
  records: ModelUsageRecord[];
  addRecord: (record: Omit<ModelUsageRecord, 'requestId' | 'timestamp'>) => void;
  clearRecords: () => void;
}

/** Removes synthetic preview records written by older app versions. */
export function sanitizeUsageRecords(value: unknown): ModelUsageRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((record): record is ModelUsageRecord => Boolean(
    record &&
    typeof record === 'object' &&
    !String((record as ModelUsageRecord).requestId || '').startsWith('sample-req-') &&
    (record as ModelUsageRecord).userId !== 'preview-developer'
  ));
}

export const useUsageStore = create<UsageStore>()(
  persist(
    (set) => ({
      records: [],
      addRecord: (record) => set((state) => ({
        records: [
          ...state.records,
          {
            ...record,
            requestId: crypto.randomUUID(),
            timestamp: Date.now()
          }
        ]
      })),
      clearRecords: () => set({ records: [] })
    }),
    {
      name: 'float-usage-storage',
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<UsageStore>),
        records: sanitizeUsageRecords((persistedState as Partial<UsageStore> | undefined)?.records)
      })
    }
  )
);
