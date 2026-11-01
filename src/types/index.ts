export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
  isOpen?: boolean;
}

export interface OpenTab {
  id: string;
  fileId: string;
  isModified: boolean;
}

export interface Project {
  id: string;
  name: string;
  type: string;
  files: FileNode[];
}

export interface AIMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  changeSet?: ChangeSet;
  modelId?: string;
  latency?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    estimatedCostUsd?: number | null;
  };
  checkpointId?: string;
  checkpoint?: FileNode[];
  imageAttachments?: Array<{ id: string; name: string; mimeType: string; dataUrl: string }>;
  status?: 'sending' | 'streaming' | 'completed' | 'error' | 'cancelled';
  error?: string;
  isSimulated?: boolean;
  conversationId?: string;
  changes?: Record<string, { status: 'pending' | 'accepted' | 'rejected'; before?: string | null }>;
  cancelled?: boolean;
  contextExplanation?: {
    intent?: string;
    includedCount?: number;
    omittedCount?: number;
    totalContextChars?: number;
    includedItems?: Array<{ id: string; name: string; type: string; source: string; chars: number; priority: number }>;
    excludedItems?: Array<{ name: string; reason: string }>;
    appliedRules?: Array<{ id: string; name: string; scope: string; sourceFile?: string; priority?: number }>;
  };
}

export interface EditorSelection {
  fileId: string;
  filePath: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface AIContextItem {
  id: string;
  type: 'file' | 'selection' | 'terminal' | 'attachment' | 'search_match';
  name: string;
  content: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  sizeBytes?: number;
  mimeType?: string;
  imageDataUrl?: string;
}

export interface EditorSettings {
  fontSize: number;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  tabSize: number;
  theme: 'dark' | 'light' | 'system';
  language: string;
  fontFamily?: string;
}

export interface TerminalEntry {
  id: string;
  type: 'command' | 'output' | 'error';
  content: string;
  timestamp: number;
}

export interface ChangeSet {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'partially_applied' | 'failed' | 'pending_review' | 'stale';
  changes: Change[];
  proposalId?: string;
  ownerId?: string;
  projectId?: string;
}

export interface Change {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'rename';
  originalContent?: string;
  proposedContent?: string;
  patchedContent?: string;
  originalHash?: string;
  proposedHash?: string;
  diffStats?: { additions: number; deletions: number };
  hunks?: import('./proposal').DiffHunk[];
  selectedHunkIds?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
}

export * from './ai';
export * from './evals';
export * from './proposal';
export * from './validation';
