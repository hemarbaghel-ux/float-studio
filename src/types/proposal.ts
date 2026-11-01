export type ProposalStatus = 
  | 'pending_review'
  | 'applying'
  | 'applied'
  | 'partially_applied'
  | 'rejected'
  | 'stale'
  | 'failed';

export type ChangeOperation = 'create' | 'modify' | 'delete' | 'rename';

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface DiffHunkLine {
  type: 'context' | 'add' | 'del';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  id: string;
  index: number;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  additions: number;
  deletions: number;
  originalLines: string[];
  proposedLines: string[];
  lines: DiffHunkLine[];
}

export interface ProposalChange {
  path: string;
  operation: ChangeOperation;
  originalContent?: string;
  proposedContent?: string;
  originalHash?: string;
  proposedHash?: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
  diffStats: DiffStats;
}

export interface CodeProposal {
  id: string;
  ownerId: string;
  projectId: string;
  conversationId?: string;
  description: string;
  status: ProposalStatus;
  affectedFiles: string[];
  changes: ProposalChange[];
  appliedFiles?: string[];
  appliedFileGeneration?: string;
  failedFiles?: { path: string; error: string }[];
  conflictDetails?: { path: string; message: string }[];
  createdAt: number;
  updatedAt: number;
}
