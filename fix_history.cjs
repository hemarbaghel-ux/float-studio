const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalHistoryList.tsx', 'utf8');
code = code.replace('run.timestamp', 'run.startedAt');
fs.writeFileSync('src/features/evals/EvalHistoryList.tsx', code);
