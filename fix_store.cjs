const fs = require('fs');
let code = fs.readFileSync('src/store/index.ts', 'utf8');

code = code.replace(
  `  activeWorkspace: "code" | "evals";\n  setActiveWorkspace: (workspace: "code" | "evals") => void;\n  activeSidebarView: 'explorer',`,
  `  activeWorkspace: "code",\n  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),\n  activeSidebarView: 'explorer',`
);

code = code.replace(
  `setActiveSidebarView: (view) => set({ activeWorkspace: "code" | "evals";\n  setActiveWorkspace: (workspace: "code" | "evals") => void;\n  activeSidebarView: view, leftSidebarOpen: true })`,
  `setActiveSidebarView: (view) => set({ activeSidebarView: view, leftSidebarOpen: true })`
);

fs.writeFileSync('src/store/index.ts', code);
