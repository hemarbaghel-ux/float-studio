const fs = require('fs');
let code = fs.readFileSync('src/features/shell/ActivityBar.tsx', 'utf8');

code = code.replace(
  `import { Files, Search, Settings, MessageSquare, Terminal, Bot, BarChart2 } from 'lucide-react';`,
  `import { Files, Search, Settings, MessageSquare, Terminal, Bot, BarChart2, ShieldAlert, Cpu } from 'lucide-react';`
);

code = code.replace(
  `        <ActivityIcon 
           icon={BarChart2}`,
  `        <ActivityIcon 
           icon={Cpu} 
           isActive={activeWorkspace === 'agents'} 
           onClick={() => setActiveWorkspace(activeWorkspace === 'agents' ? 'code' : 'agents')} 
           title="Agent Command Center" 
         />
        <ActivityIcon 
           icon={BarChart2}`
);

fs.writeFileSync('src/features/shell/ActivityBar.tsx', code);
