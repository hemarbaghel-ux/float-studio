const fs = require('fs');
let code = fs.readFileSync('src/store/index.ts', 'utf8');
code = code.replace(/activeWorkspace: "code" \| "evals";/g, 'activeWorkspace: "code" | "evals" | "agents";');
code = code.replace(/setActiveWorkspace: \(workspace: "code" \| "evals"\) => void;/g, 'setActiveWorkspace: (workspace: "code" | "evals" | "agents") => void;');
fs.writeFileSync('src/store/index.ts', code);
