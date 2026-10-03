const fs = require('fs');

const p = 'src/App.tsx';
let content = fs.readFileSync(p, 'utf8');

// Add imports
content = content.replace("import { ModelsEvalsPage } from './features/models/ModelsEvalsPage';",
  "import { ModelsEvalsPage } from './features/models/ModelsEvalsPage';\nimport { UsageDashboard } from './features/models/UsageDashboard';\nimport { ModelDetailsPage } from './features/models/ModelDetailsPage';");

// Add routes
const routes = `  if (currentPath.startsWith('/models/gpt/') && currentPath.length > '/models/gpt/'.length) {
    return <ModelDetailsPage providerId="openai" modelId={currentPath.replace('/models/gpt/', '')} />;
  }
  if (currentPath.startsWith('/models/gemini/') && currentPath.length > '/models/gemini/'.length) {
    return <ModelDetailsPage providerId="google" modelId={currentPath.replace('/models/gemini/', '')} />;
  }
  if (currentPath.startsWith('/models/anthropic/') && currentPath.length > '/models/anthropic/'.length) {
    return <ModelDetailsPage providerId="anthropic" modelId={currentPath.replace('/models/anthropic/', '')} />;
  }
  if (currentPath === '/models/usage') {
    return <UsageDashboard />;
  }
  if (currentPath === '/models/gpt') {`;

content = content.replace("  if (currentPath === '/models/gpt') {", routes);
fs.writeFileSync(p, content);
