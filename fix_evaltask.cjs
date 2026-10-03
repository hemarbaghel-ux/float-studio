const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsTasks.tsx', 'utf8');
code = code.replace(
  "import { EvalCategory, Difficulty, ValidationType } from '../../types/evals';",
  "import { EvalTask, EvalCategory, Difficulty, ValidationType } from '../../types/evals';"
);
fs.writeFileSync('src/features/evals/EvalsTasks.tsx', code);
