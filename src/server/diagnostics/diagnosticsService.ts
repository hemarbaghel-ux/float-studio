/**
 * FLOAT AI - Unified Error Diagnostics Service (Milestone 9)
 *
 * Aggregates diagnostic entries from:
 * - typescript (compiler errors)
 * - eslint (linter issues)
 * - build (bundler/transpiler errors)
 * - test (test assertion failures)
 * - runtime (unhandled exceptions, rejected promises)
 * - terminal (command errors)
 * - browser (client-side console errors)
 *
 * Formats bounded diagnostic contexts for the AI Context Pipeline.
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
}

const MAX_DIAGNOSTICS_FOR_PROMPT = 15;
const MAX_DIAGNOSTICS_CHARS = 4000;

export class DiagnosticsService {
  private static diagnostics = new Map<string, DiagnosticItem[]>(); // projectId -> items

  static addDiagnostic(projectId: string, item: Omit<DiagnosticItem, 'id' | 'timestamp'>): DiagnosticItem {
    const list = this.diagnostics.get(projectId) || [];
    const fullItem: DiagnosticItem = {
      ...item,
      id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now()
    };

    list.unshift(fullItem);
    if (list.length > 200) list.pop(); // keep latest 200
    this.diagnostics.set(projectId, list);
    return fullItem;
  }

  static getDiagnostics(projectId: string, sourceFilter?: DiagnosticSource): DiagnosticItem[] {
    const list = this.diagnostics.get(projectId) || [];
    if (!sourceFilter) return list;
    return list.filter(d => d.source === sourceFilter);
  }

  static clearDiagnostics(projectId: string, source?: DiagnosticSource): void {
    if (!source) {
      this.diagnostics.delete(projectId);
    } else {
      const list = this.diagnostics.get(projectId) || [];
      this.diagnostics.set(projectId, list.filter(d => d.source !== source));
    }
  }

  /**
   * Formats active errors as a bounded prompt context section for Debug & Chat modes.
   */
  static formatDiagnosticsPrompt(projectId: string): string {
    const items = this.getDiagnostics(projectId)
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
