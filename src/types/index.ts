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
  events?: AgentEvent[];
  modelId?: string;
  agentId?: string;
  latency?: number;
  status?: 'sending' | 'streaming' | 'completed' | 'error' | 'cancelled';
  error?: string;
  conversationId?: string;
  checkpoint?: FileNode[];
  changes?: Record<string, { status: 'pending' | 'accepted' | 'rejected'; before?: string | null }>;
  agentEvents?: Array<{ type?: string; action?: string; message?: string; tool?: string }>;
  cancelled?: boolean;
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

export type AgentMode = 'ask' | 'edit' | 'agent';

export interface ChangeSet {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'partially_applied' | 'failed' | 'pending_review' | 'stale';
  changes: Change[];
  proposalId?: string;
  ownerId?: string;
  projectId?: string;
  agentBranch?: string;
  agentBaseCommit?: string;
  agentDiff?: string;
}

export interface Change {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'rename';
  originalContent?: string;
  proposedContent?: string;
  originalHash?: string;
  proposedHash?: string;
  diffStats?: { additions: number; deletions: number };
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
}

export interface AgentEvent {
  type: 'task_started' | 'planning' | 'searching' | 'reading_file' | 'generating' | 'review_ready' | 'applying' | 'validation_started' | 'validation_completed' | 'completed' | 'failed';
  message?: string;
}
export * from './ai';
export * from './evals';
export * from './proposal';
export * from './validation';
