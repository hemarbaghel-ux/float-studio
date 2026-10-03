const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

if (!code.includes('setupAgentOrchestratorRoutes')) {
  code = `import { setupAgentOrchestratorRoutes } from './src/server/agentOrchestrator';\n` + code;
  code = code.replace(
    `setupEvalsRoutes(app);`,
    `setupEvalsRoutes(app);\n  setupAgentOrchestratorRoutes(app);`
  );
  fs.writeFileSync('server.ts', code);
}
