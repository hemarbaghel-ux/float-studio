const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsTasks.tsx', 'utf8');

code = code.replace(
  `import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';`,
  `import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';\nimport { evalTaskConverter } from '../../lib/converters';\nimport { EvalTask } from '../../types';`
);

code = code.replace(
  `  const [tasks, setTasks] = useState<any[]>([]);`,
  `  const [tasks, setTasks] = useState<EvalTask[]>([]);`
);

code = code.replace(
  `      const q = query(collection(db, 'evalTasks'), where('ownerId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));`,
  `      const q = query(collection(db, 'evalTasks').withConverter(evalTaskConverter), where('ownerId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => doc.data());`
);

fs.writeFileSync('src/features/evals/EvalsTasks.tsx', code);
