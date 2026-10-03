const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsWorkspace.tsx', 'utf8');

code = `import { useEvalStore } from '../../store/evalStore';\nimport { useEffect } from 'react';\n` + code;

code = code.replace(
  "const [activeTab, setActiveTab] = useState<EvalTab>('overview');",
  `const [activeTab, setActiveTab] = useState<EvalTab>('overview');
  const { fetchTasks, fetchRuns } = useEvalStore();

  useEffect(() => {
    fetchTasks();
    fetchRuns();
    
    // Simple polling for running evals
    const interval = setInterval(() => {
      fetchRuns();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);`
);

fs.writeFileSync('src/features/evals/EvalsWorkspace.tsx', code);
