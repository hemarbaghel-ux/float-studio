const fs = require('fs');
let code = fs.readFileSync('src/features/agents/AgentsWorkspace.tsx', 'utf8');

code = code.replace(
  `import React, { useState } from 'react';`,
  `import React, { useState, useEffect } from 'react';\nimport { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';`
);

code = code.replace(
  `export function AgentsWorkspace() {
  const [activeTab, setActiveTab] = useState<AgentTab>('overview');`,
  `export function AgentsWorkspace() {
  const [activeTab, setActiveTab] = useState<AgentTab>('overview');
  const { fetchTasks } = useAgentOrchestratorStore();

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, []);`
);

fs.writeFileSync('src/features/agents/AgentsWorkspace.tsx', code);
