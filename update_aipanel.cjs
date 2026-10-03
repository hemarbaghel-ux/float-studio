const fs = require('fs');
let code = fs.readFileSync('src/features/ai/AIPanel.tsx', 'utf8');

code = code.replace(
  `if (mode === 'agent') {`,
  `if (activeAgent?.id === 'main-agent') {
      const taskRes = await fetch('/api/agents/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: "Assist with: " + userMessage.substring(0, 30),
          description: userMessage,
          assignedAgentId: 'main-agent',
          modelId: selectedModel,
          context: { files: [], objectives: [] }
        })
      });
      const task = await taskRes.json();
      addAiMessage({ role: 'model', content: \`Task queued in the Agent Command Center. [Task: \${task.name}]\`, events: [] });
      setIsLoading(false);
      return;
    }
    
    if (mode === 'agent') {`
);

fs.writeFileSync('src/features/ai/AIPanel.tsx', code);
