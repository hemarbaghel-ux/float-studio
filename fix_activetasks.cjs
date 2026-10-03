const fs = require('fs');
let code = fs.readFileSync('src/features/agents/ActiveTasks.tsx', 'utf8');

code = code.replace(
  `const { tasks, pauseTask, resumeTask, cancelTask } = useAgentOrchestratorStore();`,
  `const { tasks, fetchTasks } = useAgentOrchestratorStore();
  
  const handlePause = async (id: string) => {
    await fetch(\`/api/agents/tasks/\${id}/pause\`, { method: 'POST' });
    fetchTasks();
  };
  const handleResume = async (id: string) => {
    await fetch(\`/api/agents/tasks/\${id}/resume\`, { method: 'POST' });
    fetchTasks();
  };
  const handleCancel = async (id: string) => {
    await fetch(\`/api/agents/tasks/\${id}/cancel\`, { method: 'POST' });
    fetchTasks();
  };`
);

code = code.replace(/pauseTask\(task\.id\)/g, 'handlePause(task.id)');
code = code.replace(/resumeTask\(task\.id\)/g, 'handleResume(task.id)');
code = code.replace(/cancelTask\(task\.id\)/g, 'handleCancel(task.id)');

fs.writeFileSync('src/features/agents/ActiveTasks.tsx', code);
