const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsTasks.tsx', 'utf8');
code = code.replace("import { EvalTask } from '../../types';", "");
code = code.replace("import { EvalTask, EvalCategory, Difficulty, ValidationType } from '../../types/evals';", "import { EvalCategory, Difficulty, ValidationType } from '../../types/evals';\nimport { useEvalStore } from '../../store/evalStore';");
fs.writeFileSync('src/features/evals/EvalsTasks.tsx', code);
