const fs = require('fs');

const path = 'src/server/agent.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix capabilities
content = content.replace("capabilities: ['function-calling']", "capabilities: { coding: true, reasoning: false, vision: false, tools: true, structuredOutput: true, streaming: true }, status: 'AVAILABLE', speed: 'fast'");
content = content.replace("capabilities: ['function-calling', 'complex-reasoning']", "capabilities: { coding: true, reasoning: true, vision: true, tools: true, structuredOutput: true, streaming: true }, status: 'AVAILABLE', speed: 'balanced'");

// Fix systemInstructions
content = content.replace("systemInstructions,", "systemInstruction: systemInstructions,");

fs.writeFileSync(path, content);
