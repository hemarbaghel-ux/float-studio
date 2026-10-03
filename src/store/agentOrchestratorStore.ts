import { create } from 'zustand';
import { AgentTask, AgentEvent, AgentApproval } from '../types/agents';
import { v4 as uuidv4 } from 'uuid';

interface AgentOrchestratorState {
  tasks: AgentTask[];
  events: AgentEvent[];
  approvals: AgentApproval[];
  
  createTask: (task: Omit<AgentTask, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>) => void;
  updateTaskStatus: (taskId: string, status: AgentTask['status'], progress?: number) => void;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  
  addEvent: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => void;
  
  resolveApproval: (approvalId: string, status: 'approved' | 'denied') => void;
  fetchTasks: () => Promise<void>;
  fetchEvents: (taskId: string) => Promise<void>;
}

export const useAgentOrchestratorStore = create<AgentOrchestratorState>((set, get) => ({
  tasks: [],
  events: [],
  approvals: [],

  createTask: (taskData) => set((state) => {
    const newTask: AgentTask = {
      ...taskData,
      id: uuidv4(),
      status: 'QUEUED',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    return { tasks: [...state.tasks, newTask] };
  }),

  updateTaskStatus: (taskId, status, progress) => set((state) => ({
    tasks: state.tasks.map(t => 
      t.id === taskId 
        ? { ...t, status, progress: progress ?? t.progress, updatedAt: Date.now() } 
        : t
    )
  })),

  pauseTask: (taskId) => {
    fetch(`/api/agents/tasks/${taskId}/pause`, { method: 'POST' }).catch(console.error);
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === taskId && ['QUEUED', 'PLANNING', 'INSPECTING', 'EXECUTING'].includes(t.status)
          ? { ...t, status: 'PAUSED', updatedAt: Date.now() }
          : t
      )
    }));
  },

  resumeTask: (taskId) => {
    fetch(`/api/agents/tasks/${taskId}/resume`, { method: 'POST' }).catch(console.error);
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === taskId && t.status === 'PAUSED'
          ? { ...t, status: 'QUEUED', updatedAt: Date.now() }
          : t
      )
    }));
  },

  cancelTask: (taskId) => {
    fetch(`/api/agents/tasks/${taskId}/cancel`, { method: 'POST' }).catch(console.error);
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
      const res = await fetch('/api/agents/tasks');
      const data = await res.json();
      set({ tasks: data });
    } catch (err) {
      console.error(err);
    }
  },

  fetchEvents: async (taskId) => {
    try {
      const res = await fetch(`/api/agents/tasks/${taskId}/events`);
      const data = await res.json();
      set(state => {
        const existingIds = new Set(state.events.map(e => e.id));
        const newEvents = data.filter((e: any) => !existingIds.has(e.id));
        return { events: [...state.events, ...newEvents] };
      });
    } catch (err) {
      console.error(err);
    }
  }
}));
