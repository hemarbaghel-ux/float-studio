/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canonical Proposal & Diff Schemas (Phase 2 & Phase 5)
 *
 * Defines the unified data structures for multi-file code proposals, unified diffs,
 * change operations, conflict detection, and review lifecycle states across web, server, and desktop workbenches.
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
  readonly unifiedDiff?: string;
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

export interface IProposalConflict {
  readonly path: string;
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly reason: string;
}

export interface IProposalApplicationResult {
  readonly success: boolean;
  readonly proposalId: string;
  readonly status: ProposalStatus;
  readonly appliedFiles: readonly string[];
  readonly checkpointId?: string;
  readonly conflicts?: readonly IProposalConflict[];
  readonly error?: string;
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

/**
 * Generates a unified diff string for a file change.
 */
export function generateUnifiedDiff(filePath: string, original: string = '', proposed: string = ''): string {
  const normOriginal = original.replace(/\r\n/g, '\n');
  const normProposed = proposed.replace(/\r\n/g, '\n');

  if (normOriginal === normProposed) {
    return '';
  }

  const origLines = normOriginal ? normOriginal.split('\n') : [];
  const propLines = normProposed ? normProposed.split('\n') : [];

  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  if (origLines.length === 0) {
    const lines = [`@@ -0,0 +1,${propLines.length} @@`];
    for (const l of propLines) lines.push(`+${l}`);
    return [...header, ...lines].join('\n');
  }

  if (propLines.length === 0) {
    const lines = [`@@ -1,${origLines.length} +0,0 @@`];
    for (const l of origLines) lines.push(`-${l}`);
    return [...header, ...lines].join('\n');
  }

  let start = 0;
  while (start < origLines.length && start < propLines.length && origLines[start] === propLines[start]) {
    start++;
  }

  let endOrig = origLines.length - 1;
  let endProp = propLines.length - 1;
  while (endOrig >= start && endProp >= start && origLines[endOrig] === propLines[endProp]) {
    endOrig--;
    endProp--;
  }

  const contextBefore = Math.max(0, start - 3);
  const contextAfterOrig = Math.min(origLines.length, endOrig + 4);

  const hunkOldStart = contextBefore + 1;
  const hunkOldCount = contextAfterOrig - contextBefore;
  const hunkNewStart = contextBefore + 1;
  const hunkNewCount = (start - contextBefore) + (endProp - start + 1) + (contextAfterOrig - (endOrig + 1));

  const lines: string[] = [
    `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`
  ];

  for (let i = contextBefore; i < start; i++) {
    lines.push(` ${origLines[i]}`);
  }
  for (let i = start; i <= endOrig; i++) {
    lines.push(`-${origLines[i]}`);
  }
  for (let i = start; i <= endProp; i++) {
    lines.push(`+${propLines[i]}`);
  }
  for (let i = endOrig + 1; i < contextAfterOrig; i++) {
    lines.push(` ${origLines[i]}`);
  }

  return [...header, ...lines].join('\n');
}
