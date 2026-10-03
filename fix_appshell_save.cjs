const fs = require('fs');
let code = fs.readFileSync('src/features/shell/AppShell.tsx', 'utf8');

if (!code.includes('saveProject')) {
  code = code.replace(
    `import React, { useState, useEffect } from 'react';`,
    `import React, { useState, useEffect, useRef } from 'react';`
  );
  code = code.replace(
    `export function AppShell() {
  const {`,
    `export function AppShell() {
  const { saveProject, files,`
  );
  
  code = code.replace(
    `    document.addEventListener('open-agent-manager', handleOpenAgentManager);`,
    `    document.addEventListener('open-agent-manager', handleOpenAgentManager);
    
    // Auto save logic
    const saveTimeout = setTimeout(() => {
      saveProject();
    }, 2000);
    `
  );
  
  code = code.replace(
    `      document.removeEventListener('open-agent-manager', handleOpenAgentManager);
    };
  }, []);`,
    `      document.removeEventListener('open-agent-manager', handleOpenAgentManager);
      clearTimeout(saveTimeout);
    };
  }, [files]); // Re-run effect when files change to debounce save`
  );

  fs.writeFileSync('src/features/shell/AppShell.tsx', code);
}
