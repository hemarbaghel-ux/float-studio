import type { DiffHunk, DiffHunkLine } from '../lib/diffHunks';
export type { DiffHunk, DiffHunkLine };

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

export interface ProposalChange {
  path: string;
  operation: ChangeOperation;
  originalContent?: string;
  proposedContent?: string;
  patchedContent?: string;
  originalHash?: string;
  proposedHash?: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
  diffStats: DiffStats;
  hunks?: DiffHunk[];
  selectedHunkIds?: string[];
}

export interface CodeProposal {
  id: string;
  ownerId: string;
  projectId: string;
  conversationId?: string;
  agentId?: string;
  agentTaskId?: string;
  agentBranch?: string;
  agentBaseCommit?: string;
  agentDiff?: string;
  description: string;
  status: ProposalStatus;
  affectedFiles: string[];
  changes: ProposalChange[];
  appliedFiles?: string[];
  patchedContents?: Record<string, string>;
  failedFiles?: { path: string; error: string }[];
  conflictDetails?: { path: string; message: string }[];
  createdAt: number;
  updatedAt: number;
}

