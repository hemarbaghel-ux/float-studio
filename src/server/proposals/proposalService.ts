import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { CodeProposal, ProposalChange, DiffStats, ProposalStatus } from '../../types/proposal';
import { getCodeProposal, listCodeProposals, saveAppliedCodeProposalForProjectRevision, saveCodeProposal } from './proposalPersistence';
import { hasAdminCredentials, isPermissionDeniedError, markAdminCredentialsUnavailable } from '../adminFirebase';

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
  rawChanges: Array<{
    path: string;
    operation: 'create' | 'modify' | 'delete' | 'rename';
    proposedContent?: string;
  }>;
  virtualFiles: Map<string, { content?: string }>;
}

export interface ProposalFinalizationInput {
  ownerId: string;
  projectId: string;
  approvedPaths: string[];
  currentFiles: Array<{ path: string; content?: string }>;
  projectData: Record<string, unknown>;
}

export function prepareProposalFinalization(
  proposal: CodeProposal,
  input: ProposalFinalizationInput
): { proposal?: CodeProposal; result: {
  success: boolean;
  status: ProposalStatus;
  appliedFiles?: string[];
  conflicts?: { path: string; message: string }[];
  error?: string;
} } {
  if (proposal.ownerId !== input.ownerId || proposal.projectId !== input.projectId) {
    return { result: { success: false, status: 'failed', error: 'Unauthorized: Proposal ownership does not match the project.' } };
  }
  if (proposal.status === 'rejected' || proposal.status === 'stale' || proposal.status === 'failed') {
    return { result: { success: false, status: proposal.status, error: `Proposal cannot be applied while it is ${proposal.status}.` } };
  }
  if (!Array.isArray(input.approvedPaths) || input.approvedPaths.length === 0 || new Set(input.approvedPaths).size !== input.approvedPaths.length) {
    return { result: { success: false, status: proposal.status, error: 'Select at least one unique proposal path to apply.' } };
  }

  const changesByPath = new Map(proposal.changes.map(change => [change.path, change]));
  const missingPaths = input.approvedPaths.filter(path => !changesByPath.has(path));
  if (missingPaths.length > 0) {
    return { result: { success: false, status: proposal.status, error: 'The request included paths outside this proposal.' } };
  }
  const current = new Map(input.currentFiles.filter(file => typeof file.path === 'string').map(file => [file.path, file.content || '']));
  const conflicts: { path: string; message: string }[] = [];
  for (const path of input.approvedPaths) {
    const change = changesByPath.get(path)!;
    if (change.operation === 'rename') {
      return { result: { success: false, status: proposal.status, error: 'Rename proposals are not supported by the current review workflow.' } };
    }
    const exists = current.has(path);
    const actualContent = current.get(path);
    const matches = change.operation === 'delete'
      ? !exists
      : exists && actualContent === (change.proposedContent || '');
    if (!matches) {
      conflicts.push({ path, message: 'The cloud workspace does not contain the approved proposal content.' });
    }
  }
  if (conflicts.length > 0) {
    return { result: {
      success: false,
      status: 'stale',
      conflicts,
      error: 'Proposal files have not been confirmed in the saved cloud workspace.'
    } };
  }

  const next: CodeProposal = {
    ...proposal,
    changes: proposal.changes.map(change => input.approvedPaths.includes(change.path)
      ? { ...change, status: 'applied' }
      : change),
    updatedAt: Date.now(),
  };
  const appliedFiles = next.changes.filter(change => change.status === 'applied').map(change => change.path);
  next.appliedFiles = appliedFiles;
  if (typeof input.projectData.fileGeneration === 'string') {
    next.appliedFileGeneration = input.projectData.fileGeneration;
  }
  next.status = next.changes.every(change => change.status === 'applied' || change.status === 'rejected')
    ? 'applied'
    : 'partially_applied';
  return { proposal: next, result: { success: true, status: next.status, appliedFiles } };
}

export class ProposalService {
  private static proposals = new Map<string, CodeProposal>();
  private static activeLocks = new Set<string>();

  static createProposal(input: CreateProposalInput): { proposal?: CodeProposal; error?: string } {
    const { ownerId, projectId, description, conversationId, rawChanges, virtualFiles } = input;

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
      if (operation === 'rename') {
        return { error: 'Rename proposals are not supported by the current review workflow.' };
      }
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
    if (!hasAdminCredentials()) return result;
    try {
      await saveCodeProposal(result.proposal);
      return result;
    } catch (error: any) {
      if (isPermissionDeniedError(error)) {
        markAdminCredentialsUnavailable(error);
        return result;
      }
      this.proposals.delete(result.proposal.id);
      return { error: error.message || 'Could not store the proposal. Reduce the number or size of changed files.' };
    }
  }

  static async persistProposalMetadata(proposal: CodeProposal): Promise<void> {
    if (!hasAdminCredentials()) return;
    try {
      await saveCodeProposal(proposal);
    } catch (error: any) {
      if (isPermissionDeniedError(error)) markAdminCredentialsUnavailable(error);
    }
  }

  static async getProposalDurable(proposalId: string, ownerId: string): Promise<CodeProposal | null> {
    const cached = this.proposals.get(proposalId);
    if (cached?.ownerId === ownerId) return cached;
    if (!hasAdminCredentials()) return null;
    try {
      const proposal = await getCodeProposal(proposalId, ownerId);
      if (proposal) this.proposals.set(proposalId, proposal);
      return proposal;
    } catch (error: any) {
      if (isPermissionDeniedError(error)) markAdminCredentialsUnavailable(error);
      return null;
    }
  }

  static async listProposalsDurable(projectId: string, ownerId: string): Promise<CodeProposal[]> {
    if (!hasAdminCredentials()) {
      return this.listProposalsForProject(projectId).filter((p) => p.ownerId === ownerId);
    }
    try {
      const proposals = await listCodeProposals(projectId, ownerId);
      for (const proposal of proposals) this.proposals.set(proposal.id, proposal);
      return proposals;
    } catch (error: any) {
      if (isPermissionDeniedError(error)) {
        markAdminCredentialsUnavailable(error);
      }
      return this.listProposalsForProject(projectId).filter((p) => p.ownerId === ownerId);
    }
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

  /** Finalize Apply only after the authenticated client has saved the proposed content to Firestore. */
  static async finalizeProposalDurable(proposalId: string, input: ProposalFinalizationInput) {
    if (this.activeLocks.has(proposalId)) {
      return { success: false, status: 'applying' as ProposalStatus, error: 'Proposal finalization is already in progress.' };
    }
    this.activeLocks.add(proposalId);
    try {
      const currentProposal = await this.getProposalDurable(proposalId, input.ownerId);
      if (!currentProposal) return { success: false, status: 'failed' as ProposalStatus, error: 'Proposal not found.' };
      if (!hasAdminCredentials()) {
        return { success: false, status: 'failed' as ProposalStatus, error: 'Cloud proposal finalization is unavailable because Firebase Admin credentials are not configured.' };
      }
      const prepared = prepareProposalFinalization(currentProposal, input);
      if (!prepared.proposal) return prepared.result;
      try {
        await saveAppliedCodeProposalForProjectRevision(
          prepared.proposal,
          input.projectData,
          currentProposal
        );
      } catch (error: any) {
        if (isPermissionDeniedError(error)) markAdminCredentialsUnavailable(error);
        return {
          success: false,
          status: error?.code === 'aborted' ? 'stale' as ProposalStatus : 'failed' as ProposalStatus,
          error: error?.message || 'Workspace changes were saved, but proposal status could not be recorded. Retry Apply to reconcile it.'
        };
      }
      this.proposals.set(proposalId, prepared.proposal);
      return prepared.result;
    } finally {
      this.activeLocks.delete(proposalId);
    }
  }

  static async rejectProposalDurable(proposalId: string, ownerId: string, userId: string) {
    if (!await this.getProposalDurable(proposalId, ownerId)) {
      return { success: false, status: 'failed' as ProposalStatus, error: 'Proposal not found.' };
    }
    const result = this.rejectProposal(proposalId, userId);
    const proposal = this.proposals.get(proposalId);
    if (proposal && result.success && hasAdminCredentials()) {
      await saveCodeProposal(proposal).catch((err) => {
        if (isPermissionDeniedError(err)) markAdminCredentialsUnavailable(err);
      });
    }
    return result;
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
