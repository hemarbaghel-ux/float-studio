const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalTaskForm.tsx', 'utf8');

code = code.replace(
  `import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';`,
  `import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';\nimport { evalTaskConverter } from '../../lib/converters';`
);

code = code.replace(
  `      const taskRef = doc(db, 'evalTasks', taskId);
      
      const evalTaskData = {
        ownerId: auth.currentUser.uid,
        name: formData.name,
        description: formData.description,
        category: formData.category,
        difficulty: formData.difficulty,
        prompt: formData.prompt,
        validationType: formData.validationType,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(taskRef, evalTaskData);`,
  `      const taskRef = doc(db, 'evalTasks', taskId).withConverter(evalTaskConverter);
      
      const evalTaskData: EvalTask = {
        ownerId: auth.currentUser.uid,
        name: formData.name as string,
        description: formData.description as string,
        category: formData.category as string,
        difficulty: formData.difficulty as any,
        prompt: formData.prompt as string,
        validationType: formData.validationType as any
      };
      
      await setDoc(taskRef, evalTaskData);`
);

fs.writeFileSync('src/features/evals/EvalTaskForm.tsx', code);
