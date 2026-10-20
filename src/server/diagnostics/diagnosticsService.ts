/**
 * FLOAT AI - Unified Error Diagnostics Service (Milestone 9)
 *
 * Aggregates diagnostic entries scoped by project and owner userId.
 */

export type DiagnosticSource = 'typescript' | 'eslint' | 'build' | 'test' | 'runtime' | 'terminal' | 'browser';
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticItem {
  id: string;
  source: DiagnosticSource;
  severity: DiagnosticSeverity;
  filePath?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string | number;
  timestamp: number;
  userId?: string;
}

const MAX_DIAGNOSTICS_FOR_PROMPT = 15;
const MAX_DIAGNOSTICS_CHARS = 4000;

export class DiagnosticsService {
  private static diagnostics = new Map<string, DiagnosticItem[]>(); // projectId -> items
  private static projectOwners = new Map<string, string>(); // projectId -> owner userId

  static addDiagnostic(
    projectId: string,
    item: Omit<DiagnosticItem, 'id' | 'timestamp'>,
    userId?: string
  ): DiagnosticItem {
    const owner = this.projectOwners.get(projectId);
    const effectiveUserId = userId ?? item.userId;
    if (owner && effectiveUserId && owner !== effectiveUserId) {
      throw new Error('Forbidden: Cannot add diagnostics to a project owned by another user.');
    }
    if (effectiveUserId && !owner) {
      this.projectOwners.set(projectId, effectiveUserId);
    }

    const list = this.diagnostics.get(projectId) || [];
    const fullItem: DiagnosticItem = {
      ...item,
      userId: effectiveUserId,
      id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now()
    };

    list.unshift(fullItem);
    if (list.length > 200) list.pop();
    this.diagnostics.set(projectId, list);
    return fullItem;
  }

  static getDiagnostics(
    projectId: string,
    sourceFilter?: DiagnosticSource,
    userId?: string
  ): DiagnosticItem[] {
    const owner = this.projectOwners.get(projectId);
    if (owner && userId && owner !== userId) {
      return [];
    }
    const list = (this.diagnostics.get(projectId) || []).filter(
      d => !userId || !d.userId || d.userId === userId
    );
    if (!sourceFilter) return list;
    return list.filter(d => d.source === sourceFilter);
  }

  static clearDiagnostics(projectId: string, source?: DiagnosticSource, userId?: string): boolean {
    const owner = this.projectOwners.get(projectId);
    if (owner && userId && owner !== userId) {
      return false;
    }
    if (!source) {
      this.diagnostics.delete(projectId);
    } else {
      const list = this.diagnostics.get(projectId) || [];
      this.diagnostics.set(projectId, list.filter(d => d.source !== source));
    }
    return true;
  }

  static clearAllForTests(): void {
    this.diagnostics.clear();
    this.projectOwners.clear();
  }

  /**
   * Formats active errors as a bounded prompt context section for Debug & Chat modes.
   */
  static formatDiagnosticsPrompt(projectId: string, userId?: string): string {
    const items = this.getDiagnostics(projectId, undefined, userId)
      .filter(d => d.severity === 'error')
      .slice(0, MAX_DIAGNOSTICS_FOR_PROMPT);

    if (items.length === 0) return '';

    const lines: string[] = ['[Active Workspace Diagnostics]'];
    let totalChars = 0;

    for (const d of items) {
      const loc = d.filePath ? `${d.filePath}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ''}` : ''}` : 'general';
      const lineStr = `• [${d.source.toUpperCase()}] ${loc} - ${d.message}`;
      if (totalChars + lineStr.length > MAX_DIAGNOSTICS_CHARS) {
        lines.push('... [Remaining diagnostics truncated for context budget]');
        break;
      }
      lines.push(lineStr);
      totalChars += lineStr.length;
    }

    return lines.join('\n');
  }
}
