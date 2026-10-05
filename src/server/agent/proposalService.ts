import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { CodeProposal, ProposalChange, DiffStats, ProposalStatus } from '../../types/proposal';
import { getCodeProposal, listCodeProposals, saveCodeProposal } from './proposalPersistence';

const SENSITIVE_SEGMENT = /^(?:\.env(?:$|\.)|\.git$|node_modules$|vendor$|dist$|build$|coverage$|\.next$|\.cache$|\.venv$|venv$|\.ssh$|\.aws$|\.npmrc$|\.pypirc$|\.netrc$|\.ds_store$|id_rsa(?:$|\.)|id_ed25519(?:$|\.))/i;
const SENSITIVE_EXTENSION = /\.(?:pem|key|p12|pfx|keystore|crt|cer)$/i;

export function sanitizeProposalPath(rawPath: string): { safePath: string; error?: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { safePath: '', error: 'File path is required.' };
  }
  const normalized = rawPath.trim().replace(/\\/g, '/');
  if (normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    return { safePath: '', error: 'Path traversal (../) is strictly forbidden.' };
  }
  if (normalized.split('/').some(part => SENSITIVE_SEGMENT.test(part)) || SENSITIVE_EXTENSION.test(normalized)) {
    return { safePath: '', error: `Access to sensitive path "${normalized}" is forbidden.` };
  }
  return { safePath: normalized };
}

export function computeContentHash(content: string = ''): string {
  // Normalize CRLF to LF for cross-platform stability
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').substring(0, 16);
}

export function computeDiffStats(original: string = '', proposed: string = ''): DiffStats {
  const origLines = original ? original.replace(/\r\n/g, '\n').split('\n') : [];
  const propLines = proposed ? proposed.replace(/\r\n/g, '\n').split('\n') : [];

  if (origLines.length === 0) {
    return { additions: propLines.length, deletions: 0 };
  }
  if (propLines.length === 0) {
    return { additions: 0, deletions: origLines.length };
  }

  // Simple and fast line comparison
  const origSet = new Map<string, number>();
  for (const line of origLines) {
    origSet.set(line, (origSet.get(line) || 0) + 1);
  }

  let matched = 0;
  for (const line of propLines) {
    const count = origSet.get(line);
    if (count && count > 0) {
      matched++;
      origSet.set(line, count - 1);
    }
  }

  const additions = Math.max(0, propLines.length - matched);
  const deletions = Math.max(0, origLines.length - matched);

  return { additions, deletions };
}

export interface CreateProposalInput {
  ownerId: string;
  projectId: string;
  description: string;
  conversationId?: string;
  agentId?: string;
  agentTaskId?: string;
  rawChanges: Array<{
    path: string;
    operation: 'create' | 'modify' | 'delete' | 'rename';
    proposedContent?: string;
  }>;
  virtualFiles: Map<string, { content?: string }>;
}

export class ProposalService {
  private static proposals = new Map<string, CodeProposal>();
  private static activeLocks = new Set<string>();

  static createProposal(input: CreateProposalInput): { proposal?: CodeProposal; error?: string } {
    const { ownerId, projectId, description, conversationId, agentId, agentTaskId, rawChanges, virtualFiles } = input;

    if (!rawChanges || !Array.isArray(rawChanges) || rawChanges.length === 0) {
      return { error: 'Proposal must contain at least one file change.' };
    }

    if (rawChanges.length > 20) {
      return { error: 'Proposals are limited to a maximum of 20 files per change set.' };
    }

    let totalSize = 0;
    const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2MB limit

    const validatedChanges: ProposalChange[] = [];
    const affectedFiles: string[] = [];

    for (const raw of rawChanges) {
      const { safePath, error } = sanitizeProposalPath(raw.path);
      if (error) {
        return { error: `Invalid file path "${raw.path}": ${error}` };
      }

      const operation = raw.operation || 'modify';
      const existingContent = virtualFiles.get(safePath)?.content || '';
      const proposedContent = operation === 'delete' ? '' : (raw.proposedContent || '');

      totalSize += existingContent.length + proposedContent.length;
      if (totalSize > MAX_TOTAL_SIZE) {
        return { error: 'Total proposal payload exceeds the 2MB safety threshold.' };
      }

      const originalHash = operation === 'create' ? '' : computeContentHash(existingContent);
      const proposedHash = operation === 'delete' ? '' : computeContentHash(proposedContent);
      const diffStats = computeDiffStats(existingContent, proposedContent);

      validatedChanges.push({
        path: safePath,
        operation,
        originalContent: existingContent,
        proposedContent,
        originalHash,
        proposedHash,
        status: 'pending',
        diffStats
      });

      affectedFiles.push(safePath);
    }

    const proposalId = uuidv4();
    const proposal: CodeProposal = {
      id: proposalId,
      ownerId,
      projectId,
      conversationId,
      agentId,
      agentTaskId,
      description: description?.trim() || 'Proposed Code Changes',
      status: 'pending_review',
      affectedFiles,
      changes: validatedChanges,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.proposals.set(proposalId, proposal);
    return { proposal };
  }

  static getProposal(proposalId: string): CodeProposal | undefined {
    return this.proposals.get(proposalId);
  }

  static async createProposalDurable(input: CreateProposalInput): Promise<{ proposal?: CodeProposal; error?: string }> {
    const result = this.createProposal(input);
    if (!result.proposal) return result;
    try {
      await saveCodeProposal(result.proposal);
      return result;
    } catch (error: any) {
      this.proposals.delete(result.proposal.id);
      return { error: error.message || 'Could not store the proposal. Reduce the number or size of changed files.' };
    }
  }

  static async persistProposalMetadata(proposal: CodeProposal): Promise<void> {
    await saveCodeProposal(proposal);
  }

  static async rejectAgentTaskProposals(taskId: string, projectId: string, ownerId: string): Promise<void> {
    const proposals = await this.listProposalsDurable(projectId, ownerId);
    for (const proposal of proposals) {
      if (proposal.agentTaskId === taskId && ['pending_review', 'applying'].includes(proposal.status)) {
        await this.rejectProposalDurable(proposal.id, ownerId, ownerId);
      }
    }
  }

  static async getProposalDurable(proposalId: string, ownerId: string): Promise<CodeProposal | null> {
    const cached = this.proposals.get(proposalId);
    if (cached?.ownerId === ownerId) return cached;
    const proposal = await getCodeProposal(proposalId, ownerId);
    if (proposal) this.proposals.set(proposalId, proposal);
    return proposal;
  }

  static async listProposalsDurable(projectId: string, ownerId: string): Promise<CodeProposal[]> {
    const proposals = await listCodeProposals(projectId, ownerId);
    for (const proposal of proposals) this.proposals.set(proposal.id, proposal);
    return proposals;
  }

  static listProposalsForProject(projectId: string): CodeProposal[] {
    const list: CodeProposal[] = [];
    for (const p of this.proposals.values()) {
      if (p.projectId === projectId) {
        list.push(p);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  static async applyProposalDurable(
    proposalId: string,
    ownerId: string,
    options: { userId: string; approvedPaths?: string[]; currentFiles: Array<{ path: string; content?: string }> }
  ) {
    if (!await this.getProposalDurable(proposalId, ownerId)) {
      return { success: false, status: 'failed' as ProposalStatus, error: 'Proposal not found.' };
    }
    const result = await this.applyProposal(proposalId, options);
    const proposal = this.proposals.get(proposalId);
    if (proposal) await saveCodeProposal(proposal);
    return result;
  }

  static async rejectProposalDurable(proposalId: string, ownerId: string, userId: string) {
    if (!await this.getProposalDurable(proposalId, ownerId)) {
      return { success: false, status: 'failed' as ProposalStatus, error: 'Proposal not found.' };
    }
    const result = this.rejectProposal(proposalId, userId);
    const proposal = this.proposals.get(proposalId);
    if (proposal && result.success) await saveCodeProposal(proposal);
    return result;
  }

  static checkConflicts(
    proposal: CodeProposal,
    currentFiles: Map<string, string>
  ): { isStale: boolean; conflicts: { path: string; message: string }[] } {
    const conflicts: { path: string; message: string }[] = [];

    for (const change of proposal.changes) {
      if (change.status === 'rejected') continue;

      const currentContent = currentFiles.get(change.path);

      if (change.operation === 'modify' || change.operation === 'delete') {
        if (currentContent === undefined) {
          conflicts.push({
            path: change.path,
            message: `Target file "${change.path}" was deleted or missing from the project workspace.`
          });
          continue;
        }

        const currentHash = computeContentHash(currentContent);
        if (change.originalHash && currentHash !== change.originalHash) {
          conflicts.push({
            path: change.path,
            message: `File content has diverged since proposal was created (expected hash ${change.originalHash}, current hash ${currentHash}).`
          });
        }
      } else if (change.operation === 'create') {
        if (currentContent !== undefined) {
          conflicts.push({
            path: change.path,
            message: `Cannot create file "${change.path}" because it already exists in the project workspace.`
          });
        }
      }
    }

    return {
      isStale: conflicts.length > 0,
      conflicts
    };
  }

  static async applyProposal(
    proposalId: string,
    options: {
      userId: string;
      approvedPaths?: string[];
      currentFiles: Array<{ path: string; content?: string }>;
    }
  ): Promise<{
    success: boolean;
    status: ProposalStatus;
    appliedFiles?: string[];
    failedFiles?: { path: string; error: string }[];
    conflicts?: { path: string; message: string }[];
    error?: string;
  }> {
    const { userId, approvedPaths, currentFiles } = options;

    // Mutex guard against concurrent duplicate apply clicks
    if (this.activeLocks.has(proposalId)) {
      return {
        success: false,
        status: 'applying',
        error: 'Proposal application is currently in progress. Duplicate submission rejected.'
      };
    }

    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { success: false, status: 'failed', error: 'Proposal not found.' };
    }

    if (proposal.ownerId && proposal.ownerId !== userId) {
      return { success: false, status: 'failed', error: 'Unauthorized: You do not own this proposal.' };
    }

    if (proposal.status === 'applied') {
      return { success: false, status: 'applied', error: 'Proposal has already been fully applied.' };
    }

    if (proposal.status === 'rejected') {
      return { success: false, status: 'rejected', error: 'Proposal was rejected and cannot be applied.' };
    }

    this.activeLocks.add(proposalId);
    proposal.status = 'applying';
    proposal.updatedAt = Date.now();

    try {
      const currentMap = new Map<string, string>();
      for (const f of currentFiles) {
        if (f.path) {
          currentMap.set(f.path.replace(/^\/+/, ''), f.content || '');
        }
      }

      // Conflict validation check
      const { isStale, conflicts } = this.checkConflicts(proposal, currentMap);
      if (isStale) {
        proposal.status = 'stale';
        proposal.conflictDetails = conflicts;
        proposal.updatedAt = Date.now();
        return {
          success: false,
          status: 'stale',
          conflicts,
          error: 'Cannot apply: One or more target files have changed since the proposal was created.'
        };
      }

      const appliedFiles: string[] = [];
      const failedFiles: { path: string; error: string }[] = [];

      for (const change of proposal.changes) {
        // If approvedPaths specified, only apply approved subset
        if (approvedPaths && !approvedPaths.includes(change.path)) {
          change.status = 'rejected';
          continue;
        }

        try {
          change.status = 'applied';
          appliedFiles.push(change.path);
        } catch (err: any) {
          change.status = 'failed';
          failedFiles.push({ path: change.path, error: err.message || 'Write failed' });
        }
      }

      const isPartial = appliedFiles.length > 0 && appliedFiles.length < proposal.changes.length;
      proposal.status = isPartial ? 'partially_applied' : (failedFiles.length > 0 ? 'failed' : 'applied');
      proposal.appliedFiles = appliedFiles;
      proposal.failedFiles = failedFiles.length > 0 ? failedFiles : undefined;
      proposal.updatedAt = Date.now();

      return {
        success: appliedFiles.length > 0,
        status: proposal.status,
        appliedFiles,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined
      };
    } finally {
      this.activeLocks.delete(proposalId);
    }
  }

  static rejectProposal(
    proposalId: string,
    userId: string
  ): { success: boolean; status: ProposalStatus; error?: string } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { success: false, status: 'failed', error: 'Proposal not found.' };
    }

    if (proposal.ownerId && proposal.ownerId !== userId) {
      return { success: false, status: 'failed', error: 'Unauthorized: You do not own this proposal.' };
    }

    if (proposal.status === 'applied') {
      return { success: false, status: 'applied', error: 'Proposal has already been applied.' };
    }

    proposal.status = 'rejected';
    for (const c of proposal.changes) {
      c.status = 'rejected';
    }
    proposal.updatedAt = Date.now();

    return { success: true, status: 'rejected' };
  }
}
