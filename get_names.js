const fs = require('fs');
const content = fs.readFileSync('src/features/ai/registry.ts', 'utf8');
const regex = /displayName:\s*'([^']+)'/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(match[1]);
}
