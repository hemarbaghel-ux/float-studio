const fs = require('fs');
let code = fs.readFileSync('src/server/agentOrchestrator.ts', 'utf8');

code = code.replace(
  `getEvents(taskId: string) {
    return this.events.get(taskId) || [];
  }`,
  `getEvents(taskId: string) {
    return this.events.get(taskId) || [];
  }
  
  getAllEvents() {
    const all = [];
    for (const taskEvents of this.events.values()) {
      all.push(...taskEvents);
    }
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }`
);

code = code.replace(
  `app.get('/api/agents/tasks/:id/events',`,
  `app.get('/api/agents/events', (req: any, res: any) => {
    res.json(orchestrator.getAllEvents());
  });

  app.get('/api/agents/tasks/:id/events',`
);

fs.writeFileSync('src/server/agentOrchestrator.ts', code);
