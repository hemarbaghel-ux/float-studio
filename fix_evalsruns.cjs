const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsRuns.tsx', 'utf8');

code = code.replace(
  "const { tasks, addRun } = useEvalStore();",
  "const { tasks, runEval } = useEvalStore();"
);

code = code.replace(
  /addRun\(\{[\s\S]*?status: 'Queued'\n\s*\}\);/,
  "runEval(selectedTask, selectedModel, selectedAgent, models.find(m => m.id === selectedModel)?.providerId || '');"
);

fs.writeFileSync('src/features/evals/EvalsRuns.tsx', code);
