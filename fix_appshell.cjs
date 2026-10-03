const fs = require('fs');
let code = fs.readFileSync('src/features/shell/AppShell.tsx', 'utf8');
code = code.replace(
  "import { EvalsWorkspace } from '../evals/EvalsWorkspace';", 
  "import { EvalsWorkspace } from '../evals/EvalsWorkspace';\nimport { AgentsWorkspace } from '../agents/AgentsWorkspace';"
);
fs.writeFileSync('src/features/shell/AppShell.tsx', code);
