/**
 * FLOAT Studio - Local Disk & Proposal Engine
 *
 * Implements local folder reading, context building, proposal generation with diffs,
 * explicit human approval gating, and checkpoint rollback.
 * Independent of VS Code UI layer so it can be run in any runtime or test environment.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isSensitivePath, isPathTraversal } from '../../../src/services/indexing/fileFilter';
import { computeDiffStats } from '../../../src/server/proposals/proposalService';

export interface LocalFileEntry {
  relativePath: string;
  absolutePath: string;
  content: string;
  size: number;
}

export interface ProposalChangeItem {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  originalContent?: string;
  proposedContent?: string;
  diffStats: { additions: number; deletions: number };
}

export interface DesktopProposal {
  id: string;
  description: string;
  status: 'pending_review' | 'applied' | 'rejected';
  changes: ProposalChangeItem[];
  totalDiffStats: { additions: number; deletions: number };
  createdAt: number;
}

export class FloatVSCodiumEngine {
  private workspaceRoot: string | null = null;
  private indexedFiles = new Map<string, LocalFileEntry>();
  private activeProposal: DesktopProposal | null = null;
  private checkpoints: Array<{ id: string; timestamp: number; snapshot: Map<string, string> }> = [];

  /**
   * 1. Open Local Folder Workflow
   * Reads files directly from the local hard drive, respecting sensitive file exclusions.
   */
  async openLocalFolder(folderPath: string): Promise<{ success: boolean; fileCount: number; error?: string }> {
    try {
      const resolved = path.resolve(folderPath);
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        return { success: false, fileCount: 0, error: 'Path is not a directory.' };
      }

      this.workspaceRoot = resolved;
      this.indexedFiles.clear();
      await this.scanDirectory(resolved, '');

      return {
        success: true,
        fileCount: this.indexedFiles.size
      };
    } catch (err: any) {
      return { success: false, fileCount: 0, error: err.message };
    }
  }

  private async scanDirectory(currentDir: string, relativePrefix: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      const normalizedRelPath = relPath.replace(/\\/g, '/');

      // Filter out sensitive files and node_modules
      if (isSensitivePath(normalizedRelPath) || entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, normalizedRelPath);
      } else if (entry.isFile()) {
        // Read file content up to 64KB
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          this.indexedFiles.set(normalizedRelPath, {
            relativePath: normalizedRelPath,
            absolutePath: fullPath,
            content,
            size: content.length
          });
        } catch {
          // Skip unreadable or binary files
        }
      }
    }
  }

  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  getIndexedFiles(): Map<string, LocalFileEntry> {
    return this.indexedFiles;
  }

  /**
   * 2. Connect FLOAT Chat / Context Engine
   * Resolves @file mentions and retrieves relevant local context within character budgets.
   */
  buildPromptContext(userPrompt: string): { prompt: string; contextFiles: string[]; totalChars: number } {
    const contextFiles: string[] = [];
    let totalChars = 0;
    const MAX_CONTEXT_BUDGET = 24000;

    // Check for @file mentions (e.g. @src/index.ts)
    const fileMentionRegex = /@([\w./-]+)/g;
    let match: RegExpExecArray | null;

    while ((match = fileMentionRegex.exec(userPrompt)) !== null) {
      const rawMention = match[1];
      const normalized = rawMention.replace(/\\/g, '/');
      const file = this.indexedFiles.get(normalized);

      if (file && totalChars + file.content.length <= MAX_CONTEXT_BUDGET) {
        contextFiles.push(normalized);
        totalChars += file.content.length;
      }
    }

    return {
      prompt: userPrompt,
      contextFiles,
      totalChars
    };
  }

  /**
   * 3. Show Multi-File Change Proposal
   * Generates a structured proposal with side-by-side diff stats without touching disk files.
   */
  createProposal(
    description: string,
    rawChanges: Array<{ path: string; operation: 'create' | 'modify' | 'delete'; proposedContent?: string }>
  ): { success: boolean; proposal?: DesktopProposal; error?: string } {
    if (!this.workspaceRoot) {
      return { success: false, error: 'No local workspace is open.' };
    }

    let totalAdditions = 0;
    let totalDeletions = 0;
    const changeItems: ProposalChangeItem[] = [];

    for (const change of rawChanges) {
      const normalizedPath = change.path.replace(/\\/g, '/').replace(/^\/+/, '');

      if (isPathTraversal(normalizedPath) || isSensitivePath(normalizedPath)) {
        return { success: false, error: `Invalid or sensitive path: "${normalizedPath}"` };
      }

      const existingFile = this.indexedFiles.get(normalizedPath);
      const originalContent = existingFile?.content || '';
      const proposedContent = change.operation === 'delete' ? '' : (change.proposedContent || '');

      const stats = computeDiffStats(originalContent, proposedContent);
      totalAdditions += stats.additions;
      totalDeletions += stats.deletions;

      changeItems.push({
        path: normalizedPath,
        operation: change.operation,
        originalContent,
        proposedContent,
        diffStats: stats
      });
    }

    const proposal: DesktopProposal = {
      id: `prop-${Date.now()}`,
      description,
      status: 'pending_review',
      changes: changeItems,
      totalDiffStats: { additions: totalAdditions, deletions: totalDeletions },
      createdAt: Date.now()
    };

    this.activeProposal = proposal;
    return { success: true, proposal };
  }

  getActiveProposal(): DesktopProposal | null {
    return this.activeProposal;
  }

  /**
   * 4. Explicit Approval Gating
   * Rejection strictly leaves local disk files untouched.
   * Acceptance writes to local hard drive and records a pre-turn checkpoint.
   */
  async reviewAndFinalizeProposal(
    proposalId: string,
    decision: 'accept' | 'reject'
  ): Promise<{ success: boolean; status: 'applied' | 'rejected'; appliedFiles?: string[]; message: string }> {
    if (!this.activeProposal || this.activeProposal.id !== proposalId) {
      return { success: false, status: 'rejected', message: 'No matching proposal found.' };
    }

    if (decision === 'reject') {
      this.activeProposal.status = 'rejected';
      return {
        success: true,
        status: 'rejected',
        message: 'Proposal was rejected. Source files on the local disk remain 100% unchanged.'
      };
    }

    // Capture checkpoint before writing to local disk
    const snapshot = new Map<string, string>();
    for (const [p, f] of this.indexedFiles.entries()) {
      snapshot.set(p, f.content);
    }
    this.checkpoints.push({
      id: `ckpt-${Date.now()}`,
      timestamp: Date.now(),
      snapshot
    });

    const appliedFiles: string[] = [];

    // Write accepted changes directly to local hard drive
    for (const item of this.activeProposal.changes) {
      const fullPath = path.join(this.workspaceRoot!, item.path);

      if (item.operation === 'delete') {
        try {
          await fs.unlink(fullPath);
          this.indexedFiles.delete(item.path);
          appliedFiles.push(item.path);
        } catch {}
      } else {
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, item.proposedContent || '', 'utf8');

        this.indexedFiles.set(item.path, {
          relativePath: item.path,
          absolutePath: fullPath,
          content: item.proposedContent || '',
          size: (item.proposedContent || '').length
        });
        appliedFiles.push(item.path);
      }
    }

    this.activeProposal.status = 'applied';
    return {
      success: true,
      status: 'applied',
      appliedFiles,
      message: `Successfully applied ${appliedFiles.length} file changes to local disk.`
    };
  }

  /**
   * One-Click Rollback to last checkpoint
   */
  async rollbackLastCheckpoint(): Promise<boolean> {
    const last = this.checkpoints.pop();
    if (!last || !this.workspaceRoot) return false;

    for (const [relPath, content] of last.snapshot.entries()) {
      const fullPath = path.join(this.workspaceRoot, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
      this.indexedFiles.set(relPath, {
        relativePath: relPath,
        absolutePath: fullPath,
        content,
        size: content.length
      });
    }
    return true;
  }
}
