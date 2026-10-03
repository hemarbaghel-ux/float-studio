const fs = require('fs');

const p = 'src/features/models/ModelDetailsPage.tsx';
let content = fs.readFileSync(p, 'utf8');

// Fix 'completed' -> 'Completed'
content = content.replace(/r\.status === 'completed'/g, "r.status === 'Completed'");

// Fix metrics fields
content = content.replace(/run\.metrics\?\.totalCost/g, "run.metrics?.estimatedCost");
content = content.replace(/run\.metrics\?\.inputTokens/g, "run.metrics?.tokenUsage?.input");
content = content.replace(/run\.metrics\?\.outputTokens/g, "run.metrics?.tokenUsage?.output");
content = content.replace(/run\.metrics\?\.agentSteps/g, "run.activity?.length");

// Fix model.status comparisons
content = content.replace(/model\.status === 'PREVIEW'/g, "model.status === 'NOT_CONFIGURED'");
content = content.replace(/model\.status === 'EXPERIMENTAL'/g, "model.status === 'ERROR'");
content = content.replace(/model\.status === 'DEPRECATED'/g, "model.status === 'DISABLED'");

fs.writeFileSync(p, content);

const p2 = 'src/features/models/ModelDetailsPanel.tsx';
if (fs.existsSync(p2)) {
  let content2 = fs.readFileSync(p2, 'utf8');
  content2 = content2.replace(/model\.status === 'CONFIGURED'/g, "model.status === 'AVAILABLE'");
  fs.writeFileSync(p2, content2);
}
