const fs = require('fs');
let code = fs.readFileSync('src/features/shell/ActivityBar.tsx', 'utf8');

code = code.replace(
  /<ActivityIcon \n           icon=\{Bot\}/,
  `<ActivityIcon 
           icon={BarChart2} 
           isActive={activeWorkspace === 'evals'} 
           onClick={() => setActiveWorkspace(activeWorkspace === 'evals' ? 'code' : 'evals')} 
           title="Evals" 
         />
        <ActivityIcon 
           icon={Bot}`
);

fs.writeFileSync('src/features/shell/ActivityBar.tsx', code);
