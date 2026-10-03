const fs = require('fs');
let code = fs.readFileSync('src/store/agentOrchestratorStore.ts', 'utf8');

code = code.replace(
  `resolveApproval: (approvalId: string, status: 'approved' | 'denied') => void;`,
  `resolveApproval: (approvalId: string, status: 'approved' | 'denied') => void;
  fetchTasks: () => Promise<void>;
  fetchEvents: (taskId: string) => Promise<void>;`
);

code = code.replace(
  `resolveApproval: (approvalId, status) => set((state) => ({
    approvals: state.approvals.map(a => 
      a.id === approvalId 
        ? { ...a, status } 
        : a
    )
  }))`,
  `resolveApproval: (approvalId, status) => set((state) => ({
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
      const res = await fetch(\`/api/agents/tasks/\${taskId}/events\`);
      const data = await res.json();
      set(state => {
        const existingIds = new Set(state.events.map(e => e.id));
        const newEvents = data.filter((e: any) => !existingIds.has(e.id));
        return { events: [...state.events, ...newEvents] };
      });
    } catch (err) {
      console.error(err);
    }
  }`
);

fs.writeFileSync('src/store/agentOrchestratorStore.ts', code);
