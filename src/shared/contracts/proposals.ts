/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canonical Proposal & Diff Schemas (Phase 2)
 *
 * Defines the unified data structures for multi-file code proposals, unified diffs,
 * change operations, and review lifecycle states across web, server, and desktop workbenches.
 */

import crypto from 'crypto';

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
  readonly additions: number;
  readonly deletions: number;
}

export interface IProposalFileChange {
  readonly path: string;
  readonly operation: ChangeOperation;
  readonly originalContent?: string;
  readonly proposedContent?: string;
  readonly originalHash?: string;
  readonly proposedHash?: string;
  readonly status: 'pending' | 'accepted' | 'rejected' | 'applied' | 'failed';
  readonly diffStats: DiffStats;
}

export interface IProposal {
  readonly id: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly conversationId?: string;
  readonly title: string;
  readonly explanation: string;
  readonly status: ProposalStatus;
  readonly files: readonly IProposalFileChange[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Normalized 16-char SHA-256 hash calculation, treating CRLF and LF identically.
 */
export function computeContentHash(content: string = ''): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').substring(0, 16);
}

/**
 * Line-based diff statistical calculator.
 */
export function computeDiffStats(original: string = '', proposed: string = ''): DiffStats {
  const origLines = original ? original.replace(/\r\n/g, '\n').split('\n') : [];
  const propLines = proposed ? proposed.replace(/\r\n/g, '\n').split('\n') : [];

  if (origLines.length === 0) {
    return { additions: propLines.length, deletions: 0 };
  }
  if (propLines.length === 0) {
    return { additions: 0, deletions: origLines.length };
  }

  const origCounts = new Map<string, number>();
  for (const line of origLines) {
    origCounts.set(line, (origCounts.get(line) || 0) + 1);
  }

  let matched = 0;
  for (const line of propLines) {
    const count = origCounts.get(line);
    if (count && count > 0) {
      matched++;
      origCounts.set(line, count - 1);
    }
  }

  const additions = Math.max(0, propLines.length - matched);
  const deletions = Math.max(0, origLines.length - matched);
  return { additions, deletions };
}
