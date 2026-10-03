const fs = require('fs');
let code = fs.readFileSync('src/features/agents/AgentActivity.tsx', 'utf8');

code = code.replace(
  `import { useAIStore } from '../../store/aiStore';`,
  `import { useAIStore } from '../../store/aiStore';\nimport { useEffect, useState } from 'react';`
);

code = code.replace(
  `export function AgentActivity() {
  const { events } = useAgentOrchestratorStore();`,
  `export function AgentActivity() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/agents/events');
        const data = await res.json();
        setEvents(data);
      } catch (err) {}
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, []);`
);

fs.writeFileSync('src/features/agents/AgentActivity.tsx', code);
