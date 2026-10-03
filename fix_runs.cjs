const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsRuns.tsx', 'utf8');
code = code.replace('const { runs } = useEvalStore();', 'const { runs, tasks } = useEvalStore();');
fs.writeFileSync('src/features/evals/EvalsRuns.tsx', code);
