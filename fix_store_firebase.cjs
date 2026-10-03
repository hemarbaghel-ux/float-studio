const fs = require('fs');
let code = fs.readFileSync('src/store/index.ts', 'utf8');

code = code.replace(
  `import { FileNode, OpenTab, AIMessage, EditorSettings, AIContextItem, TerminalEntry, ChangeSet } from '../types';`,
  `import { FileNode, OpenTab, AIMessage, EditorSettings, AIContextItem, TerminalEntry, ChangeSet } from '../types';\nimport { doc, setDoc, serverTimestamp } from 'firebase/firestore';\nimport { db, auth } from '../lib/firebase';`
);

code = code.replace(
  `  projectName: string | null;`,
  `  projectId: string | null;
  projectName: string | null;`
);

code = code.replace(
  `  setProject: (name: string, files: FileNode[]) => void;`,
  `  setProject: (name: string, files: FileNode[], projectId?: string) => void;
  saveProject: () => Promise<void>;`
);

code = code.replace(
  `  projectName: null,`,
  `  projectId: null,\n  projectName: null,`
);

code = code.replace(
  `  setProject: (name, files) => set({ projectName: name, files, openTabs: [], activeFileId: null }),`,
  `  setProject: (name, files, projectId) => {
    const id = projectId || uuidv4();
    set({ projectName: name, files, openTabs: [], activeFileId: null, projectId: id });
    if (!projectId) {
       get().saveProject();
    }
  },
  
  saveProject: async () => {
    const state = get();
    if (!state.projectId || !state.projectName || !auth.currentUser) return;
    try {
      await setDoc(doc(db, 'projects', state.projectId), {
        ownerId: auth.currentUser.uid,
        name: state.projectName,
        files: JSON.stringify(state.files),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to save project", err);
    }
  },`
);

code = code.replace(
  `return { files: newFiles };
  }),`,
  `return { files: newFiles };
  }),`
);

fs.writeFileSync('src/store/index.ts', code);
