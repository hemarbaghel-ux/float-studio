/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { AgentHarness } from '../harness/AgentHarness';
import { IWorkspaceService } from '../../shared/contracts/workspace';

export interface InlineEditorDiffHunk {
  readonly filePath: string;
  readonly originalContent: string;
  readonly proposedContent: string;
  readonly unifiedDiff: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Editor Agent Surface (Runs next to Code-OSS editor files on developer machine)
 *
 * Responsibilities:
 * - Supervised edits directly in active editor buffers.
 * - Sits beside Code-OSS language servers, debuggers, and extension host.
 * - Displays inline diffs (Ctrl+K / Cmd+K) and terminal execution.
 */
export class EditorAgentSurface {
  private readonly harness: AgentHarness;
  private pendingDiffs = new Map<string, InlineEditorDiffHunk>();

  constructor(private readonly workspace: IWorkspaceService, harness?: AgentHarness) {
    this.harness = harness || new AgentHarness(workspace, 'agent');
  }

  public getHarness(): AgentHarness {
    return this.harness;
  }

  /**
   * Generates a supervised inline diff for a file buffer (e.g. triggered via Ctrl+K).
   */
  public async generateSupervisedEdit(
    filePath: string,
    instruction: string,
    selectedCode?: string
  ): Promise<InlineEditorDiffHunk> {
    const originalContent = (await this.workspace.fileExists(filePath))
      ? await this.workspace.readFile(filePath)
      : '';

    let proposedContent = originalContent;
    if (instruction.toLowerCase().includes('error') || instruction.toLowerCase().includes('try')) {
      proposedContent = `try {\n  ${originalContent.trim()}\n} catch (error) {\n  console.error("Operation failed:", error);\n  throw error;\n}\n`;
    } else {
      proposedContent = `// [FLOAT Supervised Edit: ${instruction}]\n${originalContent}`;
    }

    const diffHunk: InlineEditorDiffHunk = {
      filePath,
      originalContent,
      proposedContent,
      unifiedDiff: `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,5 @@\n+${proposedContent}`,
      status: 'pending'
    };

    this.pendingDiffs.set(filePath, diffHunk);
    return diffHunk;
  }

  /**
   * Accepts a supervised edit diff into the real file buffer.
   */
  public async acceptEdit(filePath: string): Promise<boolean> {
    const diff = this.pendingDiffs.get(filePath);
    if (!diff) return false;

    await this.workspace.writeFile(filePath, diff.proposedContent);
    this.pendingDiffs.delete(filePath);
    return true;
  }

  /**
   * Rejects a supervised edit diff without touching disk.
   */
  public rejectEdit(filePath: string): boolean {
    return this.pendingDiffs.delete(filePath);
  }
}
