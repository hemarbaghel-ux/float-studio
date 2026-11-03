import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { FileNode, OpenTab, AIMessage, EditorSettings, AIContextItem, TerminalEntry, ChangeSet, EditorSelection } from '../types';
import { deleteField, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { executeProjectCommand } from '../services/projectExecution';
import {
  projectCloudSaveErrorMessage,
  projectCloudSaveFailureReason,
  serializeProjectFileTree,
  type ProjectCloudSaveResult
} from '../services/projectCloudFiles';
import {
  deleteProjectContentGeneration,
  runSerialProjectCloudWrite,
  writeProjectContentGeneration
} from '../services/projectCloudRepository';
import { flattenFileTree } from '../lib/utils';
import { projectStorageKey } from './projectStorage';
import { workspaceIndexManager } from '../services/indexing/workspaceIndexManager';

export const DEFAULT_PYTHON_FILES: FileNode[] = [
  {
    id: 'file-main-py',
    name: 'main.py',
    type: 'file',
    content: `# Welcome to FLOAT - Python IDE & Coding Agent
def main():
    print("Welcome to FLOAT!")
    name = "Python Developer"
    print(f"Ready to code, {name}.")
    
    # Try out some Python features:
    numbers = [1, 2, 3, 4, 5]
    squared = [n ** 2 for n in numbers]
    print(f"Squares: {squared}")

if __name__ == "__main__":
    main()
`
  },
  {
    id: 'file-readme-md',
    name: 'README.md',
    type: 'file',
    content: `# FLOAT Python Project

Click **Run** in the top bar or press **Ctrl+Enter** (Cmd+Enter) to execute your Python code.
Execution is performed live in the browser via Pyodide.
`
  }
];

export interface WorkspaceCheckpoint {
  id: string;
  label: string;
  timestamp: number;
  files: FileNode[];
}

interface StoredProject {
  projectId: string;
  projectName: string;
  files: FileNode[];
  openTabs: OpenTab[];
  activeFileId: string | null;
}

const loadStoredProject = (ownerId?: string | null): StoredProject => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(projectStorageKey(ownerId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0) {
          if (!parsed.projectId || parsed.projectId === 'default-python-workspace') {
            parsed.projectId = uuidv4();
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load project from storage:', e);
    }
  }

  return {
    projectId: uuidv4(),
    projectName: 'Python Workspace',
    files: DEFAULT_PYTHON_FILES,
    openTabs: [
      { id: 'tab-main', fileId: 'file-main-py', isModified: false }
    ],
    activeFileId: 'file-main-py'
  };
};

const saveStoredProject = (data: StoredProject, ownerId: string | null = auth.currentUser?.uid ?? null) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(projectStorageKey(ownerId), JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save project to storage:', e);
    }
  }
};

interface IDEState {
  // Project & Files
  hasStarted: boolean;
  startSession: () => void;
  projectId: string | null;
  projectName: string | null;
  files: FileNode[];
  projectLoadedFromCloud: boolean;
  setProject: (name: string, files: FileNode[], projectId?: string, source?: 'cloud' | 'local') => void;
  switchAccount: (ownerId: string | null) => void;
  clearProject: () => void;
  saveProject: () => Promise<ProjectCloudSaveResult>;
  projectCloudSaveStatus: 'idle' | 'saving' | 'synced' | 'local-only' | 'error';
  projectCloudSaveMessage: string | null;
  updateFileContent: (idOrPath: string, content: string) => void;
  addFile: (parentId: string | null, file: FileNode) => void;
  renameFile: (id: string, newName: string) => void;
  deleteFile: (id: string) => void;
  applyExecutionChanges: (changedFiles: Array<{ path: string; content?: string }>, deletedFiles: string[]) => void;
  checkpoints: WorkspaceCheckpoint[];
  createCheckpoint: (label: string) => string;
  restoreCheckpoint: (checkpointId: string) => boolean;
  restoreLastCheckpoint: () => boolean;
  
  // Tabs & Editor
  openTabs: OpenTab[];
  activeFileId: string | null;
  openFile: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveFile: (id: string) => void;
  markTabModified: (id: string, modified: boolean) => void;
  
  // Python Execution
  isRunningCode: boolean;
  executionOutput: string;
  executionError: string | null;
  lastExecutionTimeMs: number | null;
  setExecutionResult: (output: string, error: string | null, durationMs: number | null) => void;
  runActiveCode: () => Promise<void>;
  
  // Layout
  leftSidebarOpen: boolean;
  activeWorkspace: "code";
  setActiveWorkspace: (workspace: "code") => void;
  activeSidebarView: 'explorer' | 'search' | 'source-control';
  rightSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: 'terminal' | 'problems' | 'output' | 'validation';
  setBottomPanelTab: (tab: 'terminal' | 'problems' | 'output' | 'validation') => void;
  toggleLeftSidebar: () => void;
  setActiveSidebarView: (view: 'explorer' | 'search' | 'source-control') => void;
  toggleRightSidebar: () => void;
  toggleBottomPanel: () => void;
  initialPrompt: string | null;
  setInitialPrompt: (prompt: string | null) => void;

  // AI
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  aiMessages: AIMessage[];
  setAiMessages: (messages: AIMessage[]) => void;
  aiContext: AIContextItem[];
  activeSelection: EditorSelection | null;
  setActiveSelection: (selection: EditorSelection | null) => void;
  reviewChangeSet: ChangeSet | null;
  setReviewChangeSet: (changeSet: ChangeSet | null) => void;
  aiModel: string;
  setAiModel: (model: string) => void;
  addAiMessage: (message: Partial<Pick<AIMessage, 'id'>> & Omit<AIMessage, 'id' | 'timestamp'>) => void;
  updateAiMessage: (id: string, updates: Partial<AIMessage>) => void;
  updateAiMessageChangeSet: (changeSetId: string, changeSet: ChangeSet) => void;
  addAiContext: (item: Omit<AIContextItem, 'id'>) => void;
  removeAiContext: (id: string) => void;
  clearAiContext: () => void;
  clearAiMessages: () => void;

  // Terminal
  terminalEntries: TerminalEntry[];
  addTerminalEntry: (entry: Omit<TerminalEntry, 'id' | 'timestamp'>) => void;
  clearTerminal: () => void;

  // Settings
  settings: EditorSettings;
  updateSettings: (settings: Partial<EditorSettings>) => void;
  toggleTheme: () => void;
}

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

export const applyThemeToDocument = (theme: 'dark' | 'light' | 'system') => {
  if (typeof document === 'undefined') return;

  if (systemThemeMediaQuery && systemThemeListener) {
    systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
    systemThemeMediaQuery = null;
    systemThemeListener = null;
  }

  let resolvedTheme: 'dark' | 'light' = 'dark';

  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      resolvedTheme = systemThemeMediaQuery.matches ? 'dark' : 'light';
      systemThemeListener = (e: MediaQueryListEvent) => {
        const next = e.matches ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', next === 'dark');
        document.documentElement.classList.toggle('light', next === 'light');
        document.documentElement.setAttribute('data-theme', next);
      };
      systemThemeMediaQuery.addEventListener('change', systemThemeListener);
    }
  } else {
    resolvedTheme = theme;
  }

  if (resolvedTheme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.setAttribute('data-theme', 'light');
  }

  try {
    localStorage.setItem('float_theme', theme);
  } catch (e) {
    // Ignore error
  }
};

const getInitialTheme = (): 'dark' | 'light' | 'system' => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_theme');
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        applyThemeToDocument(saved as any);
        return saved as any;
      }
    } catch (e) {
      // Ignore error
    }
  }
  applyThemeToDocument('dark');
  return 'dark';
};

const defaultSettings: EditorSettings = {
  fontSize: 14,
  wordWrap: 'off',
  minimap: false,
  tabSize: 4,
  theme: getInitialTheme(),
  language: 'English',
  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace"
};

export const normalizeFilePath = (pathStr: string): string => {
  return (pathStr || '').replace(/\\/g, '/').replace(/^\/+/ , '').replace(/\/+$/, '').trim();
};

const findFile = (nodes: FileNode[], idOrPath: string): FileNode | null => {
  if (!idOrPath) return null;

  // 1. Direct ID match
  const matchById = (items: FileNode[]): FileNode | null => {
    for (const item of items) {
      if (item.id === idOrPath) return item;
      if (item.children) {
        const found = matchById(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  const byId = matchById(nodes);
  if (byId) return byId;

  // 2. Full normalized path match
  const normalized = normalizeFilePath(idOrPath);
  const matchByPath = (items: FileNode[], prefix = ''): FileNode | null => {
    for (const item of items) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (itemPath === normalized) return item;
      if (item.children) {
        const found = matchByPath(item.children, itemPath);
        if (found) return found;
      }
    }
    return null;
  };
  const byPath = matchByPath(nodes);
  if (byPath) return byPath;

  // 3. Fallback: match by filename if query does not contain path separators
  if (!idOrPath.includes('/') && !idOrPath.includes('\\')) {
    const matchByName = (items: FileNode[]): FileNode | null => {
      for (const item of items) {
        if (item.name === idOrPath) return item;
        if (item.children) {
          const found = matchByName(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    return matchByName(nodes);
  }

  return null;
};

const initialProject = loadStoredProject(auth.currentUser?.uid ?? null);
let projectSaveSequence = 0;

export const useIDEStore = create<IDEState>((set, get) => ({
  hasStarted: true,
  startSession: () => set({ hasStarted: true }),
  projectId: initialProject.projectId,
  projectName: initialProject.projectName,
  files: initialProject.files,
  checkpoints: [],
  projectLoadedFromCloud: false,
  projectCloudSaveStatus: 'idle',
  projectCloudSaveMessage: null,
  openTabs: initialProject.openTabs,
  activeFileId: initialProject.activeFileId,

  setProject: (name, files, projectId, source = 'local') => {
    const id = projectId || uuidv4();
    try {
      workspaceIndexManager.syncProject(id, flattenFileTree(files).map(f => ({
        path: f.path || f.name,
        name: f.name,
        content: f.content || '',
        type: f.type
      })));
    } catch (e) {
      console.warn('Failed to sync workspace index on setProject:', e);
    }
    const firstFile = files.find(f => f.type === 'file') || files[0];
    const initialTabs = firstFile && firstFile.type === 'file' 
      ? [{ id: uuidv4(), fileId: firstFile.id, isModified: false }] 
      : [];
    const activeId = firstFile && firstFile.type === 'file' ? firstFile.id : null;

    set({ 
      projectName: name, 
      files, 
      openTabs: initialTabs, 
      activeFileId: activeId, 
      projectId: id,
      projectLoadedFromCloud: source === 'cloud',
      projectCloudSaveStatus: 'idle',
      projectCloudSaveMessage: null,
      hasStarted: true
    });

    saveStoredProject({
      projectId: id,
      projectName: name,
      files,
      openTabs: initialTabs,
      activeFileId: activeId
    });

    if (!projectId) {
      get().saveProject();
    }
  },

  switchAccount: (ownerId) => {
    const project = loadStoredProject(ownerId);
    set({
      ...project,
      projectLoadedFromCloud: false,
      aiMessages: [],
      aiContext: [],
      initialPrompt: null,
      activeConversationId: null,
      activeSelection: null,
      terminalEntries: [],
      isRunningCode: false,
      executionOutput: '',
      executionError: null,
      lastExecutionTimeMs: null,
      projectCloudSaveStatus: 'idle',
      projectCloudSaveMessage: null,
    });
  },
  
  clearProject: () => {
    const newId = uuidv4();
    const def = {
      projectId: newId,
      projectName: 'Python Workspace',
      files: DEFAULT_PYTHON_FILES,
      openTabs: [{ id: 'tab-main', fileId: 'file-main-py', isModified: false }],
      activeFileId: 'file-main-py'
    };
    set({
      ...def,
      projectLoadedFromCloud: false,
      aiMessages: [],
      aiContext: [],
      initialPrompt: null,
      terminalEntries: [],
      projectCloudSaveStatus: 'idle',
      projectCloudSaveMessage: null
    });
    saveStoredProject(def);
  },

  saveProject: async () => {
    const state = get();
    const requestSequence = ++projectSaveSequence;
    const ownerId = auth.currentUser?.uid ?? null;
    let currentProjectId: string = state.projectId || '';

    if (!currentProjectId || currentProjectId === 'default-python-workspace') {
      currentProjectId = uuidv4();
      set({ projectId: currentProjectId });
    }

    // Always persist to localStorage immediately
    if (state.projectName) {
      saveStoredProject({
        projectId: currentProjectId,
        projectName: state.projectName,
        files: state.files,
        openTabs: state.openTabs,
        activeFileId: state.activeFileId
      }, ownerId);
    }

    const projectName = state.projectName ? state.projectName.slice(0, 100) : null;
    if (!projectName) {
      return { status: 'local-only', reason: 'no-project', message: 'No named workspace is available to sync.' };
    }
    if (!auth.currentUser) {
      const message = 'Sign in to sync this workspace. A local copy is saved on this device.';
      if (get().projectId === currentProjectId && requestSequence === projectSaveSequence) {
        set({
          projectCloudSaveStatus: 'local-only',
          projectCloudSaveMessage: message
        });
      }
      return { status: 'local-only', reason: 'not-authenticated', message };
    }

    const user = auth.currentUser;
    const serializedFiles = serializeProjectFileTree(state.files);
    if (serializedFiles.ok === false) {
      const message = 'This workspace could not be serialized for cloud storage. Its local copy is preserved.';
      if (get().projectId === currentProjectId && requestSequence === projectSaveSequence) {
        set({ projectCloudSaveStatus: 'local-only', projectCloudSaveMessage: message });
      }
      return { status: 'local-only', reason: 'unserializable', message };
    }
    const generation = uuidv4();
    const manifest = {
      fileStorageVersion: 2,
      fileGeneration: generation,
      fileChunkCount: serializedFiles.chunks.length,
      fileBytes: serializedFiles.byteLength
    } as const;
    if (get().projectId === currentProjectId && requestSequence === projectSaveSequence) {
      set({ projectCloudSaveStatus: 'saving', projectCloudSaveMessage: 'Saving workspace to cloud…' });
    }
    return runSerialProjectCloudWrite(`${user.uid}:${currentProjectId}`, async () => {
      let projectRef = doc(db, 'projects', currentProjectId);
      let generationMayExist = false;
      let generationPublished = false;
      try {
      let docExists = false;
      let isOwner = false;
      let ownershipCouldNotBeVerified = false;
      let previousGeneration: string | undefined;
      let expectedLegacyFileValue: string | undefined;

      try {
        const snap = await getDoc(projectRef);
        if (snap.exists()) {
          const existingData = snap.data();
          docExists = true;
          isOwner = existingData.ownerId === user.uid;
          if (isOwner && existingData.fileStorageVersion === 2 && typeof existingData.fileGeneration === 'string') {
            previousGeneration = existingData.fileGeneration;
          } else if (isOwner) {
            expectedLegacyFileValue = JSON.stringify(existingData.files);
          }
        }
      } catch (readErr: any) {
        // A permission or network error does not prove that the ID is unused.
        // Use a fresh ID rather than attempting to create over an unverifiable doc.
        ownershipCouldNotBeVerified = true;
      }

      if (docExists && isOwner) {
        // Publish a new immutable content generation only after all its chunks were written.
        generationMayExist = true;
        await writeProjectContentGeneration(db, currentProjectId, user.uid, generation, serializedFiles.chunks);
        await runTransaction(db, async (transaction) => {
          const latest = await transaction.get(projectRef);
          if (!latest.exists() || latest.data().ownerId !== user.uid) {
            const error = new Error('Workspace ownership changed during save.') as Error & { code: string };
            error.code = 'aborted';
            throw error;
          }
          const latestData = latest.data();
          const unchanged = previousGeneration
            ? latestData.fileStorageVersion === 2 && latestData.fileGeneration === previousGeneration
            : latestData.fileStorageVersion !== 2 && JSON.stringify(latestData.files) === expectedLegacyFileValue;
          if (!unchanged) {
            const error = new Error('Workspace changed in another window during save.') as Error & { code: string };
            error.code = 'aborted';
            throw error;
          }
          transaction.update(projectRef, {
            name: projectName,
            ...manifest,
            fileSnapshotComplete: true,
            files: deleteField(),
            updatedAt: serverTimestamp()
          });
        });
        generationPublished = true;
      } else {
        // If document exists but is not owned by current user, allocate a fresh ID
        if ((docExists && !isOwner) || ownershipCouldNotBeVerified) {
          currentProjectId = uuidv4();
          if (get().projectId === state.projectId) set({ projectId: currentProjectId });
          projectRef = doc(db, 'projects', currentProjectId);
          saveStoredProject({
            projectId: currentProjectId,
            projectName,
            files: state.files,
            openTabs: state.openTabs,
            activeFileId: state.activeFileId
          }, user.uid);
        }

        await runTransaction(db, async (transaction) => {
          const existing = await transaction.get(projectRef);
          if (existing.exists()) {
            const error = new Error('Workspace ID was claimed while saving.') as Error & { code: string };
            error.code = 'aborted';
            throw error;
          }
          transaction.set(projectRef, {
            ownerId: user.uid,
            name: projectName,
            ...manifest,
            fileSnapshotComplete: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        generationMayExist = true;
        await writeProjectContentGeneration(db, currentProjectId, user.uid, generation, serializedFiles.chunks);
        await runTransaction(db, async (transaction) => {
          const latest = await transaction.get(projectRef);
          if (!latest.exists() || latest.data().ownerId !== user.uid || latest.data().fileGeneration !== generation) {
            const error = new Error('Workspace changed in another window during save.') as Error & { code: string };
            error.code = 'aborted';
            throw error;
          }
          transaction.update(projectRef, { fileSnapshotComplete: true, updatedAt: serverTimestamp() });
        });
        generationPublished = true;
      }
      if (previousGeneration && previousGeneration !== generation) {
        await deleteProjectContentGeneration(db, currentProjectId, previousGeneration).catch((cleanupError) => {
          console.warn('A previous project content generation could not be cleaned up:', cleanupError);
        });
      }
      if (get().projectId === currentProjectId && auth.currentUser?.uid === user.uid && requestSequence === projectSaveSequence) {
        set({ projectCloudSaveStatus: 'synced', projectCloudSaveMessage: 'Workspace saved to cloud.', projectLoadedFromCloud: true });
      }
        return { status: 'synced' };
      } catch (err: any) {
        if (generationMayExist && !generationPublished) {
          await deleteProjectContentGeneration(db, currentProjectId, generation).catch(() => {});
        }
        console.error('Failed to save project to cloud:', err?.code || 'unknown-error');
        const message = projectCloudSaveErrorMessage(err);
        if (get().projectId === currentProjectId && auth.currentUser?.uid === user.uid && requestSequence === projectSaveSequence) {
          set({ projectCloudSaveStatus: 'error', projectCloudSaveMessage: message });
        }
        return { status: 'error', reason: projectCloudSaveFailureReason(err), message };
      }
    });
  },
  
  updateFileContent: (idOrPath, content) => set((state) => {
    const newFiles = JSON.parse(JSON.stringify(state.files));
    let file = findFile(newFiles, idOrPath);

    // If not found by direct ID or path, but idOrPath is a valid relative path, insert into tree
    if (!file && typeof idOrPath === 'string' && (idOrPath.includes('/') || idOrPath.includes('.'))) {
      const normalizedPath = normalizeFilePath(idOrPath);
      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.length > 0) {
        let level: FileNode[] = newFiles;
        for (const segment of segments.slice(0, -1)) {
          let folder = level.find((node: FileNode) => node.name === segment && node.type === 'folder');
          if (!folder) {
            folder = { id: uuidv4(), name: segment, type: 'folder', children: [] };
            level.push(folder);
          }
          folder.children = folder.children || [];
          level = folder.children;
        }
        const name = segments[segments.length - 1];
        file = { id: uuidv4(), name, type: 'file', content: content ?? '' };
        level.push(file);
      }
    } else if (file) {
      file.content = content;
    }

    if (file && state.projectId) {
      try {
        const filePath = flattenFileTree(newFiles).find(f => f.id === file!.id)?.path || normalizeFilePath(idOrPath) || file.name;
        workspaceIndexManager.getIndex(state.projectId).updateFile(filePath, content);
      } catch {}
    }

    // Save locally
    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: newFiles,
        openTabs: state.openTabs,
        activeFileId: state.activeFileId
      });
    }

    return { files: newFiles };
  }),
  
  addFile: (parentId, file) => set((state) => {
    const newFiles = JSON.parse(JSON.stringify(state.files));
    if (!parentId) {
      newFiles.push(file);
    } else {
      const parent = findFile(newFiles, parentId);
      if (parent && parent.type === 'folder') {
        parent.children = parent.children || [];
        parent.children.push(file);
      }
    }

    // If it's a file, automatically open it
    let newTabs = state.openTabs;
    let newActiveId = state.activeFileId;
    if (file.type === 'file') {
      newTabs = [...state.openTabs, { id: uuidv4(), fileId: file.id, isModified: false }];
      newActiveId = file.id;

      if (state.projectId) {
        try {
          const parentPath = parentId ? flattenFileTree(state.files).find(f => f.id === parentId)?.path : '';
          const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
          workspaceIndexManager.getIndex(state.projectId).updateFile(filePath, file.content || '');
        } catch {}
      }
    }

    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: newFiles,
        openTabs: newTabs,
        activeFileId: newActiveId
      });
    }

    return { files: newFiles, openTabs: newTabs, activeFileId: newActiveId };
  }),

  renameFile: (id, newName) => set((state) => {
    const trimmed = (newName || "").trim();
    if (!trimmed || trimmed === "." || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..") || trimmed.includes("\0")) {
      return {};
    }
    const newFiles = JSON.parse(JSON.stringify(state.files)) as FileNode[];
    const oldFlat = flattenFileTree(state.files);
    const targetOld = oldFlat.find(f => f.id === id);
    const targetNode = findFile(newFiles, id);
    if (!targetNode) return {};
    targetNode.name = trimmed;
    const newFlat = flattenFileTree(newFiles);
    if (state.projectId) {
      try {
        const idx = workspaceIndexManager.getIndex(state.projectId);
        if (targetOld?.path) {
          for (const oldEntry of oldFlat) {
            if (oldEntry.path && (oldEntry.path === targetOld.path || oldEntry.path.startsWith(`${targetOld.path}/`))) {
              idx.removeFile(oldEntry.path);
            }
          }
        }
        for (const f of newFlat) {
          if (f.type === "file" && f.path) {
            idx.updateFile(f.path, f.content || "");
          }
        }
      } catch {}
    }
    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: newFiles,
        openTabs: state.openTabs,
        activeFileId: state.activeFileId
      });
    }
    return { files: newFiles };
  }),

  deleteFile: (id) => set((state) => {
    const target = findFile(state.files, id);
    const removedIds = new Set<string>([id]);
    const collectDescendantIds = (node: FileNode | null) => {
      if (!node) return;
      removedIds.add(node.id);
      if (node.children) {
        for (const child of node.children) {
          collectDescendantIds(child);
        }
      }
    };
    collectDescendantIds(target);

    if (target && state.projectId) {
      try {
        const flatBefore = flattenFileTree(state.files);
        const idx = workspaceIndexManager.getIndex(state.projectId);
        for (const entry of flatBefore) {
          if (removedIds.has(entry.id) && entry.path) {
            idx.removeFile(entry.path);
          }
        }
      } catch {}
    }

    const targetId = target ? target.id : id;
    const filterFiles = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter(n => n.id !== targetId).map(n => ({
        ...n,
        children: n.children ? filterFiles(n.children) : undefined
      }));
    };
    const newFiles = filterFiles(state.files);
    const newTabs = state.openTabs.filter(t => !removedIds.has(t.fileId));
    const newActiveId = (state.activeFileId && removedIds.has(state.activeFileId))
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].fileId : null)
      : state.activeFileId;

    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: newFiles,
        openTabs: newTabs,
        activeFileId: newActiveId
      });
    }

    return { files: newFiles, openTabs: newTabs, activeFileId: newActiveId };
  }),

  applyExecutionChanges: (changedFiles, deletedFiles) => set((state) => {
    const nextFiles = JSON.parse(JSON.stringify(state.files)) as FileNode[];
    const findPath = (nodes: FileNode[], target: string, parentPath = ''): FileNode | null => {
      const normTarget = normalizeFilePath(target);
      for (const node of nodes) {
        const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
        if (currentPath === normTarget) return node;
        const nested = node.children && findPath(node.children, target, currentPath);
        if (nested) return nested;
      }
      return null;
    };
    const removePath = (nodes: FileNode[], target: string, parentPath = ''): boolean => {
      const normTarget = normalizeFilePath(target);
      for (let index = 0; index < nodes.length; index += 1) {
        const currentPath = parentPath ? `${parentPath}/${nodes[index].name}` : nodes[index].name;
        if (currentPath === normTarget) { nodes.splice(index, 1); return true; }
        if (nodes[index].children && removePath(nodes[index].children!, target, currentPath)) return true;
      }
      return false;
    };
    const openTabs = [...state.openTabs];
    let activeFileId = state.activeFileId;
    for (const deleted of deletedFiles) {
      const oldNode = findPath(nextFiles, deleted);
      if (oldNode) {
        removePath(nextFiles, deleted);
        const remainingTabs = openTabs.filter(tab => tab.fileId !== oldNode.id);
        openTabs.splice(0, openTabs.length, ...remainingTabs);
        if (activeFileId === oldNode.id) activeFileId = openTabs[0]?.fileId ?? null;
      }
    }
    for (const changed of changedFiles) {
      const normPath = normalizeFilePath(changed.path);
      const segments = normPath.split('/').filter(Boolean);
      if (!segments.length) continue;
      let level = nextFiles;
      let parentPath = '';
      for (const segment of segments.slice(0, -1)) {
        parentPath = parentPath ? `${parentPath}/${segment}` : segment;
        let folder = level.find(node => node.name === segment && node.type === 'folder');
        if (!folder) { folder = { id: uuidv4(), name: segment, type: 'folder', children: [] }; level.push(folder); }
        folder.children = folder.children || [];
        level = folder.children;
      }
      const name = segments[segments.length - 1];
      const existing = level.find(node => node.name === name && node.type === 'file');
      if (existing) {
        existing.content = changed.content ?? '';
      } else {
        const newFile: FileNode = { id: uuidv4(), name, type: 'file', content: changed.content ?? '' };
        level.push(newFile);
      }
    }
    const sort = (nodes: FileNode[]) => { nodes.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1); nodes.forEach(node => node.children && sort(node.children)); };
    sort(nextFiles);
    if (state.projectId) {
      try {
        const idx = workspaceIndexManager.getIndex(state.projectId);
        for (const d of deletedFiles) idx.removeFile(normalizeFilePath(d));
        for (const c of changedFiles) idx.updateFile(normalizeFilePath(c.path), c.content || '');
      } catch {}
    }
    if (state.projectId && state.projectName) saveStoredProject({ projectId: state.projectId, projectName: state.projectName, files: nextFiles, openTabs, activeFileId });
    return { files: nextFiles, openTabs, activeFileId };
  }),

  createCheckpoint: (label: string) => {
    const checkpointId = `ckpt-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const clonedFiles = JSON.parse(JSON.stringify(get().files)) as FileNode[];
    const newCheckpoint: WorkspaceCheckpoint = {
      id: checkpointId,
      label: label || 'Workspace Checkpoint',
      timestamp: Date.now(),
      files: clonedFiles
    };
    set((state) => ({
      checkpoints: [newCheckpoint, ...state.checkpoints].slice(0, 25)
    }));
    return checkpointId;
  },

  restoreCheckpoint: (checkpointId: string) => {
    const cp = get().checkpoints.find(c => c.id === checkpointId);
    if (!cp) return false;
    const clonedFiles = JSON.parse(JSON.stringify(cp.files)) as FileNode[];
    set({ files: clonedFiles });
    if (get().projectId) {
      try {
        workspaceIndexManager.syncProject(get().projectId!, flattenFileTree(clonedFiles).map(f => ({
          path: f.path || f.name,
          name: f.name,
          content: f.content || '',
          type: f.type
        })));
      } catch {}
    }
    if (get().projectId && get().projectName) {
      saveStoredProject({
        projectId: get().projectId!,
        projectName: get().projectName!,
        files: clonedFiles,
        openTabs: get().openTabs,
        activeFileId: get().activeFileId
      });
    }
    void get().saveProject();
    return true;
  },

  restoreLastCheckpoint: () => {
    const latest = get().checkpoints[0];
    if (!latest) return false;
    return get().restoreCheckpoint(latest.id);
  },

  openFile: (id) => set((state) => {
    const existing = state.openTabs.find(t => t.fileId === id);
    if (existing) {
      if (state.projectId && state.projectName) {
        saveStoredProject({
          projectId: state.projectId,
          projectName: state.projectName,
          files: state.files,
          openTabs: state.openTabs,
          activeFileId: id
        });
      }
      return { activeFileId: id };
    }
    const newTabs = [...state.openTabs, { id: uuidv4(), fileId: id, isModified: false }];
    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: state.files,
        openTabs: newTabs,
        activeFileId: id
      });
    }
    return { openTabs: newTabs, activeFileId: id };
  }),
  
  closeTab: (id) => set((state) => {
    const newTabs = state.openTabs.filter(t => t.id !== id);
    let newActiveId = state.activeFileId;
    if (state.activeFileId === state.openTabs.find(t => t.id === id)?.fileId) {
      newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].fileId : null;
    }
    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: state.files,
        openTabs: newTabs,
        activeFileId: newActiveId
      });
    }
    return { openTabs: newTabs, activeFileId: newActiveId };
  }),
  
  setActiveFile: (id) => set((state) => {
    if (state.projectId && state.projectName) {
      saveStoredProject({
        projectId: state.projectId,
        projectName: state.projectName,
        files: state.files,
        openTabs: state.openTabs,
        activeFileId: id
      });
    }
    return { activeFileId: id };
  }),
  
  markTabModified: (id, modified) => set((state) => ({
    openTabs: state.openTabs.map(t => t.fileId === id ? { ...t, isModified: modified } : t)
  })),

  // Python Execution
  isRunningCode: false,
  executionOutput: '',
  executionError: null,
  lastExecutionTimeMs: null,
  setExecutionResult: (executionOutput, executionError, lastExecutionTimeMs) => set({ executionOutput, executionError, lastExecutionTimeMs }),

  runActiveCode: async () => {
    const state = get();
    if (state.isRunningCode) return;

    // Determine which file to run
    let targetFile: FileNode | null = null;
    if (state.activeFileId) {
      targetFile = findFile(state.files, state.activeFileId);
    }
    if (!targetFile || targetFile.type !== 'file') {
      // Find main.py or first python file
      const flattened = flattenFileTree(state.files);
      const pyFile = flattened.find(f => f.path.endsWith('.py'));
      if (pyFile) {
        targetFile = { id: pyFile.id, name: pyFile.path.split('/').pop() || 'main.py', type: 'file', content: pyFile.content };
      }
    }

    if (!targetFile || targetFile.content === undefined) {
      state.addTerminalEntry({
        type: 'error',
        content: 'No Python file selected to execute.'
      });
      set({ bottomPanelOpen: true, bottomPanelTab: 'output' });
      return;
    }

    const fileName = flattenFileTree(state.files).find(file => file.id === targetFile!.id)?.path || targetFile.name;

    set({ 
      isRunningCode: true, 
      executionError: null,
      bottomPanelOpen: true,
      bottomPanelTab: 'output'
    });

    state.addTerminalEntry({
      type: 'command',
      content: `python ${fileName}`
    });

    const virtualFiles = flattenFileTree(state.files).filter(file => file.type === 'file').map(f => ({
      path: f.path,
      content: f.content
    }));

    try {
      const saveResult = await state.saveProject();
      if (saveResult.status !== 'synced') throw new Error(saveResult.message);
      const projectId = get().projectId;
      if (!projectId) throw new Error('Save this workspace before running a server command.');
      const result = await executeProjectCommand({
        projectId,
        command: `python ${fileName}`,
        files: virtualFiles,
        onOutput: (stream, text) => state.addTerminalEntry({ type: stream === 'stdout' ? 'output' : 'error', content: text })
      });
      if (result.changedFiles?.length || result.deletedFiles?.length) {
        get().applyExecutionChanges(result.changedFiles || [], result.deletedFiles || []);
        const saveResult = await get().saveProject();
        if (saveResult.status !== 'synced') throw new Error(saveResult.message);
      }
      const failure = result.status === 'succeeded' ? null : `Process ${result.status} (exit code ${result.exitCode ?? 'unknown'}).`;
      state.addTerminalEntry({ type: failure ? 'error' : 'output', content: `[${result.status}; exit code ${result.exitCode ?? 'unknown'}; ${result.durationMs}ms]` });
      set({ executionOutput: '', executionError: failure, lastExecutionTimeMs: result.durationMs, isRunningCode: false });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      state.addTerminalEntry({
        type: 'error',
        content: `Execution failed: ${errMsg}`
      });
      set({
        executionError: errMsg,
        isRunningCode: false
      });
    }
  },

  // Layout
  leftSidebarOpen: true,
  activeWorkspace: "code",
  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
  activeSidebarView: 'explorer',
  rightSidebarOpen: true,
  bottomPanelOpen: true,
  bottomPanelTab: 'terminal',
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  toggleLeftSidebar: () => set(state => ({ leftSidebarOpen: !state.leftSidebarOpen })),
  setActiveSidebarView: (view) => set({ activeSidebarView: view, leftSidebarOpen: true }),
  toggleRightSidebar: () => set(state => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  toggleBottomPanel: () => set(state => ({ bottomPanelOpen: !state.bottomPanelOpen })),
  initialPrompt: null,
  setInitialPrompt: (prompt) => set({ initialPrompt: prompt }),

  // AI
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  aiMessages: [],
  setAiMessages: (messages) => set({ aiMessages: messages }),
  aiContext: [],
  activeSelection: null,
  setActiveSelection: (selection) => set({ activeSelection: selection }),
  reviewChangeSet: null,
  setReviewChangeSet: (changeSet) => set({ reviewChangeSet: changeSet }),
  aiModel: 'gemini-3.8-flash',
  setAiModel: (model) => set({ aiModel: model }),
  
  addAiMessage: (msg) => set((state) => ({
    aiMessages: [...state.aiMessages, { ...msg, id: msg.id || uuidv4(), timestamp: Date.now() }]
  })),

  updateAiMessage: (id, updates) => set((state) => ({
    aiMessages: state.aiMessages.map(m => m.id === id ? { ...m, ...updates } : m)
  })),

  updateAiMessageChangeSet: (changeSetId, changeSet) => set((state) => ({
    aiMessages: state.aiMessages.map(m => m.changeSet?.id === changeSetId ? { ...m, changeSet } : m)
  })),
  
  addAiContext: (item) => set((state) => ({
    aiContext: [...state.aiContext, { ...item, id: uuidv4() }]
  })),
  
  removeAiContext: (id) => set((state) => ({
    aiContext: state.aiContext.filter(c => c.id !== id)
  })),
  
  clearAiContext: () => set({ aiContext: [] }),
  clearAiMessages: () => set({ aiMessages: [] }),

  // Terminal
  terminalEntries: [
    {
      id: 'init-entry',
      type: 'output',
      content: 'FLOAT Python 3.12 Runtime ready. Type python code, "python main.py", or click Run to execute.',
      timestamp: Date.now()
    }
  ],
  addTerminalEntry: (entry) => set((state) => ({
    terminalEntries: [...state.terminalEntries, { ...entry, id: uuidv4(), timestamp: Date.now() }]
  })),
  clearTerminal: () => set({ terminalEntries: [] }),

  // Settings
  settings: defaultSettings,
  updateSettings: (newSettings) => set((state) => {
    const nextSettings = { ...state.settings, ...newSettings };
    if (newSettings.theme) {
      applyThemeToDocument(newSettings.theme);
    }
    return { settings: nextSettings };
  }),
  toggleTheme: () => set((state) => {
    const nextTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyThemeToDocument(nextTheme);
    return {
      settings: { ...state.settings, theme: nextTheme }
    };
  }),
}));
