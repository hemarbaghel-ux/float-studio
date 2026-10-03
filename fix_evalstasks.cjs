const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsTasks.tsx', 'utf8');
code = code.replace(
  "import { EvalTask, EvalCategory, Difficulty, ValidationType } from '../../types/evals';",
  "import { EvalCategory, Difficulty, ValidationType } from '../../types/evals';\nimport { EvalTask } from '../../types';"
);
fs.writeFileSync('src/features/evals/EvalsTasks.tsx', code);
