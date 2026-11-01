import type { Change, ChangeSet, FileNode } from '../../types';
import type { CodeProposal } from '../../types/proposal';
import { flattenFileTree } from '../../lib/utils';
import { parseSegments } from '../float/chatParsing';

export interface AssistantProposalDraft {
  description: string;
  changes: Array<{ path: string; operation: 'create' | 'modify' | 'delete'; proposedContent?: string }>;
  virtualFiles: Array<{ path: string; content: string }>;
}

/** Prevent a delayed Apply response from mutating a different or concurrently edited workspace. */
export function findProposalWorkspaceConflicts(options: {
  expectedProjectId: string | null;
  activeProjectId: string | null;
  changes: Array<Pick<Change, 'path' | 'operation'>>;
  approvedPaths: string[];
  beforeFiles: FileNode[];
  currentFiles: FileNode[];
}): string[] {
  if (options.expectedProjectId !== options.activeProjectId) return ['The active project changed'];

  const snapshot = (files: FileNode[]) => new Map(
    flattenFileTree(files)
      .filter((file) => file.type === 'file')
      .map((file) => [file.path || file.name, { id: file.id, content: file.content || '' }])
  );
  const before = snapshot(options.beforeFiles);
  const current = snapshot(options.currentFiles);
  const conflicts: string[] = [];

  for (const change of options.changes) {
    if (!options.approvedPaths.includes(change.path)) continue;
    const initialFile = before.get(change.path);
    const latestFile = current.get(change.path);
    if (change.operation === 'create') {
      if (initialFile || latestFile) conflicts.push(change.path);
    } else if (!initialFile || !latestFile || initialFile.id !== latestFile.id || initialFile.content !== latestFile.content) {
      conflicts.push(change.path);
    }
  }
  return conflicts;
}

export function prepareAssistantProposal(
  responseText: string,
  prompt: string,
  files: FileNode[]
): AssistantProposalDraft | null {
  const edits = parseSegments(responseText).filter((segment) => segment.kind !== 'text');
  if (edits.length === 0) return null;
  if (edits.some((segment) => segment.kind === 'file' && !segment.complete)) {
    throw new Error('The model returned an incomplete file change. No proposal was created; retry the request.');
  }

  const workspaceFiles = new Map(
    flattenFileTree(files)
      .filter((file) => file.type === 'file')
      .map((file) => [file.path || file.name, file.content || ''])
  );
  const seenPaths = new Set<string>();
  const changes: AssistantProposalDraft['changes'] = [];
  const virtualFiles: AssistantProposalDraft['virtualFiles'] = [];

  for (const edit of edits) {
    if (seenPaths.has(edit.path)) throw new Error(`The model returned more than one change for ${edit.path}. No proposal was created.`);
    seenPaths.add(edit.path);
    const exists = workspaceFiles.has(edit.path);
    if (exists) virtualFiles.push({ path: edit.path, content: workspaceFiles.get(edit.path) || '' });
    changes.push(edit.kind === 'delete'
      ? { path: edit.path, operation: 'delete' }
      : { path: edit.path, operation: exists ? 'modify' : 'create', proposedContent: edit.content });
  }

  return {
    description: prompt.trim().slice(0, 500) || 'Assistant code changes',
    changes,
    virtualFiles
  };
}

export function proposalToChangeSet(proposal: CodeProposal): ChangeSet {
  return {
    id: proposal.id,
    proposalId: proposal.id,
    ownerId: proposal.ownerId,
    projectId: proposal.projectId,
    description: proposal.description,
    status: proposal.status === 'applying' ? 'pending_review' : proposal.status,
    changes: proposal.changes
  };
}

export async function createAssistantProposal(options: {
  responseText: string;
  prompt: string;
  projectId: string;
  conversationId: string;
  files: FileNode[];
  token: string;
  fetcher?: typeof fetch;
}): Promise<ChangeSet | null> {
  const draft = prepareAssistantProposal(options.responseText, options.prompt, options.files);
  if (!draft) return null;

  const response = await (options.fetcher || fetch)(
    `/api/projects/${encodeURIComponent(options.projectId)}/proposals`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.token}`
      },
      body: JSON.stringify({ ...draft, conversationId: options.conversationId })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Could not create code proposal (${response.status}).`);
  }
  if (!data.proposal || !Array.isArray(data.proposal.changes) || typeof data.proposal.id !== 'string') {
    throw new Error('The server returned an invalid code proposal. No changes were applied.');
  }
  return proposalToChangeSet(data.proposal as CodeProposal);
}
