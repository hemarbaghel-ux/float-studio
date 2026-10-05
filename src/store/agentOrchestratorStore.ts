import { create } from 'zustand';
import { AgentTask, AgentEvent, AgentApproval } from '../types/agents';
import { v4 as uuidv4 } from 'uuid';
import { apiFetch } from '../services/api';

interface AgentOrchestratorState {
  tasks: AgentTask[];
  events: AgentEvent[];
  approvals: AgentApproval[];
  
  createTask: (task: Pick<AgentTask, 'name' | 'description' | 'assignedAgentId' | 'modelId' | 'context'> & { projectId: string; requestedChecks?: AgentTask['requestedChecks'] }) => Promise<void>;
  updateTaskStatus: (taskId: string, status: AgentTask['status'], progress?: number) => void;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  
  addEvent: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => void;
  
  resolveApproval: (approvalId: string, status: 'approved' | 'denied') => void;
  fetchTasks: () => Promise<void>;
  fetchEvents: (taskId: string) => Promise<void>;
  receiveTaskEvent: (taskId: string, event: AgentEvent) => void;
}

export const useAgentOrchestratorStore = create<AgentOrchestratorState>((set, get) => ({
  tasks: [],
  events: [],
  approvals: [],

  createTask: async (taskData) => {
    const response = await apiFetch('/api/agents/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not create agent task.');
    const task = result as AgentTask;
    set((state) => ({ tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)] }));
  },

  updateTaskStatus: (taskId, status, progress) => set((state) => ({
    tasks: state.tasks.map(t => 
      t.id === taskId 
        ? { ...t, status, progress: progress ?? t.progress, updatedAt: Date.now() } 
        : t
    )
  })),

  pauseTask: (taskId) => {
    apiFetch(`/api/agents/tasks/${taskId}/pause`, { method: 'POST' }).catch(console.error);
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === taskId && ['QUEUED', 'PLANNING', 'INSPECTING', 'EXECUTING'].includes(t.status)
          ? { ...t, status: 'PAUSED', updatedAt: Date.now() }
          : t
      )
    }));
  },

  resumeTask: (taskId) => {
    apiFetch(`/api/agents/tasks/${taskId}/resume`, { method: 'POST' }).catch(console.error);
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === taskId && t.status === 'PAUSED'
          ? { ...t, status: 'QUEUED', updatedAt: Date.now() }
          : t
      )
    }));
  },

  cancelTask: (taskId) => {
    apiFetch(`/api/agents/tasks/${taskId}/cancel`, { method: 'POST' }).catch(console.error);
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === taskId && !['COMPLETED', 'FAILED'].includes(t.status)
          ? { ...t, status: 'CANCELLED', updatedAt: Date.now() }
          : t
      )
    }));
  },

  addEvent: (eventData) => set((state) => ({
    events: [...state.events, { ...eventData, id: uuidv4(), timestamp: Date.now() }]
  })),

  resolveApproval: (approvalId, status) => set((state) => ({
    approvals: state.approvals.map(a => 
      a.id === approvalId 
        ? { ...a, status } 
        : a
    )
  })),

  fetchTasks: async () => {
    try {
      const res = await apiFetch('/api/agents/tasks');
      const data = await res.json();
      set({ tasks: data });
    } catch (err) {
      console.error(err);
    }
  },

  fetchEvents: async (taskId) => {
    try {
      const res = await apiFetch(`/api/agents/tasks/${taskId}/events`);
      const data = await res.json();
      set(state => {
        const existingIds = new Set(state.events.map(e => e.id));
        const newEvents = data.filter((e: any) => !existingIds.has(e.id));
        return { events: [...state.events, ...newEvents] };
      });
    } catch (err) {
      console.error(err);
    }
  },

  receiveTaskEvent: (taskId, event) => set(state => {
    const existing = state.events.some(item => item.id === event.id);
    return {
      events: existing ? state.events : [...state.events, event],
      tasks: state.tasks.map(task => task.id === taskId ? {
        ...task,
        lastEvent: { id: event.id, type: String(event.type), message: String(event.message || ''), timestamp: event.timestamp },
        updatedAt: Math.max(task.updatedAt, event.timestamp),
      } : task),
    };
  }),
}));
