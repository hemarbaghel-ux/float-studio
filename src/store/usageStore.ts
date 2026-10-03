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
}

interface UsageStore {
  records: ModelUsageRecord[];
  addRecord: (record: Omit<ModelUsageRecord, 'requestId' | 'timestamp'>) => void;
  setRecords: (records: ModelUsageRecord[]) => void;
  clearRecords: () => void;
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
      setRecords: (records) => set({ records }),
      clearRecords: () => set({ records: [] })
    }),
    {
      name: 'float-usage-storage'
    }
  )
);
