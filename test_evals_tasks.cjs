// just verifying EvalsTasks.tsx doesn't have local store remnants crashing
const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsTasks.tsx', 'utf8');

if (code.includes('useEvalStore()')) {
  console.log("Still has useEvalStore");
  code = code.replace(/import \{ useEvalStore \} from '.*';/, '');
  fs.writeFileSync('src/features/evals/EvalsTasks.tsx', code);
}
