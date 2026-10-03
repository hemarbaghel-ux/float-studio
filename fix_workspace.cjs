const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsWorkspace.tsx', 'utf8');

if (!code.includes('EvalsDashboard')) {
  code = code.replace(
    `import { EvalsOverview } from './EvalsOverview';`,
    `import { EvalsOverview } from './EvalsOverview';\nimport { EvalsDashboard } from './EvalsDashboard';`
  );
  
  code = code.replace(
    `{activeTab === 'overview' && <EvalsOverview />}`,
    `{activeTab === 'overview' && <EvalsDashboard />}`
  );
  
  fs.writeFileSync('src/features/evals/EvalsWorkspace.tsx', code);
}
