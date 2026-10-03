const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsRuns.tsx', 'utf8');

code = code.replace(
  "                  <td className=\"px-4 py-3 text-[#C9D1D9] font-medium\">{run.taskId}</td>",
  "                  <td className=\"px-4 py-3 text-[#C9D1D9] font-medium\">{tasks.find(t => t.id === run.taskId)?.name || run.taskId}</td>"
);

fs.writeFileSync('src/features/evals/EvalsRuns.tsx', code);
