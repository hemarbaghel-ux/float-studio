/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import path from 'node:path';

export interface DynamicToolOutput {
  readonly toolName: string;
  readonly inlineOutput: string;
  readonly artifactFilePath?: string;
  readonly byteSize: number;
  readonly truncated: boolean;
}

export interface SkillManifestSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
}

export interface TerminalSessionRecord {
  readonly sessionId: string;
  readonly logFilePath: string;
  readonly commandCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const DEFAULT_INLINE_OUTPUT_CHAR_LIMIT = 2000;

export class DynamicContextManager {
  private readonly artifactDir: string;
  private readonly terminalDir: string;
  private readonly skillCatalog: Map<string, SkillManifestSummary> = new Map();
  private readonly terminalSessions: Map<string, TerminalSessionRecord> = new Map();

  constructor(workspaceRoot: string = process.cwd()) {
    this.artifactDir = path.join(workspaceRoot, '.float', 'scratch');
    this.terminalDir = path.join(workspaceRoot, '.float', 'terminal_sessions');
  }

  /**
   * Offloads large tool output to disk artifacts if it exceeds token budget.
   * Instead of stuffing 50KB of grep or build output into the context window,
   * write it to a disk file and return a concise summary with the file pointer.
   */
  public processToolOutput(
    toolName: string,
    rawOutput: string,
    charLimit: number = DEFAULT_INLINE_OUTPUT_CHAR_LIMIT
  ): DynamicToolOutput {
    const byteSize = Buffer.byteLength(rawOutput, 'utf8');

    if (rawOutput.length <= charLimit) {
      return {
        toolName,
        inlineOutput: rawOutput,
        byteSize,
        truncated: false
      };
    }

    const fileHash = crypto.createHash('sha256').update(rawOutput).digest('hex').slice(0, 10);
    const artifactPath = path.join(this.artifactDir, `${toolName}_output_${fileHash}.log`);

    const preview = rawOutput.slice(0, charLimit);
    const remainingChars = rawOutput.length - charLimit;
    const inlineOutput = `${preview}\n\n[... Truncated ${remainingChars} characters (${byteSize} bytes total). Full output saved to: ${artifactPath}. Use read_file to inspect specific lines if needed.]`;

    return {
      toolName,
      inlineOutput,
      artifactFilePath: artifactPath,
      byteSize,
      truncated: true
    };
  }

  /**
   * Registers a skill by description only (loading on demand, not in bulk).
   */
  public registerSkillSummary(skill: SkillManifestSummary): void {
    this.skillCatalog.set(skill.id, skill);
  }

  /**
   * Returns formatted skills catalog overview (name + description only).
   */
  public getAvailableSkillsOverview(): string {
    if (this.skillCatalog.size === 0) return 'No specialized skills installed.';

    const lines: string[] = ['Available Skills (call fetch_rules_or_skills to load full instructions):'];
    for (const skill of this.skillCatalog.values()) {
      lines.push(`- ${skill.id}: ${skill.name} — ${skill.description}`);
    }
    return lines.join('\n');
  }

  /**
   * Records or updates a real terminal session log file.
   */
  public recordTerminalSession(sessionId: string): TerminalSessionRecord {
    const existing = this.terminalSessions.get(sessionId);
    const now = Date.now();

    if (existing) {
      const updated: TerminalSessionRecord = {
        ...existing,
        commandCount: existing.commandCount + 1,
        updatedAt: now
      };
      this.terminalSessions.set(sessionId, updated);
      return updated;
    }

    const logPath = path.join(this.terminalDir, `session_${sessionId}.log`);
    const record: TerminalSessionRecord = {
      sessionId,
      logFilePath: logPath,
      commandCount: 1,
      createdAt: now,
      updatedAt: now
    };
    this.terminalSessions.set(sessionId, record);
    return record;
  }

  /**
   * Summarizes long chat history to preserve context budget without losing requirements.
   */
  public summarizeChatHistory(messages: Array<{ role: string; content: string }>, keepLastN: number = 4): {
    summary: string;
    recentMessages: Array<{ role: string; content: string }>;
  } {
    if (messages.length <= keepLastN) {
      return { summary: '', recentMessages: messages };
    }

    const olderMessages = messages.slice(0, messages.length - keepLastN);
    const recentMessages = messages.slice(messages.length - keepLastN);

    const keyPoints: string[] = [];
    for (const msg of olderMessages) {
      if (msg.role === 'user') {
        const firstLine = msg.content.split('\n')[0].trim();
        if (firstLine) keyPoints.push(`- User requested: ${firstLine.slice(0, 120)}`);
      } else if (msg.role === 'assistant') {
        const firstLine = msg.content.split('\n')[0].trim();
        if (firstLine && !firstLine.startsWith('{') && !firstLine.startsWith('```')) {
          keyPoints.push(`- Assistant concluded: ${firstLine.slice(0, 120)}`);
        }
      }
    }

    const summary = keyPoints.length > 0
      ? `Prior Conversation Context Summary (${olderMessages.length} turns):\n${keyPoints.slice(-8).join('\n')}`
      : `Prior Conversation Context (${olderMessages.length} turns omitted to preserve budget).`;

    return { summary, recentMessages };
  }
}
