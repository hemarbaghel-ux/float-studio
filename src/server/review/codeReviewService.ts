/**
 * FLOAT AI - Automated Code Review & PR Review Service (Milestone 9)
 *
 * Implements code review analysis scoped to verified project and user ownership.
 */

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface CodeReviewFinding {
  id: string;
  severity: ReviewSeverity;
  category: 'security' | 'correctness' | 'performance' | 'regression' | 'maintainability';
  filePath: string;
  line?: number;
  finding: string;
  explanation: string;
  suggestedFix?: string;
  confidence: number;
  dismissed: boolean;
}

export interface ReviewReport {
  id: string;
  projectId: string;
  userId?: string;
  targetBranch?: string;
  pullRequestNumber?: number;
  timestamp: number;
  findings: CodeReviewFinding[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    total: number;
  };
}

export class CodeReviewService {
  private static reports = new Map<string, ReviewReport>();

  private static canAccessReport(
    report: ReviewReport | undefined,
    projectId?: string,
    userId?: string
  ): report is ReviewReport {
    if (!report) return false;
    if (projectId !== undefined && report.projectId !== projectId) return false;
    if (userId !== undefined && report.userId && report.userId !== userId) return false;
    if (userId === undefined && report.userId !== undefined) return false;
    return true;
  }

  /**
   * Analyzes changed files or unified diff for concrete issues.
   */
  static analyzeDiff(
    projectId: string,
    diffText: string,
    files: Array<{ path: string; content: string }>,
    userId?: string
  ): ReviewReport {
    const findings: CodeReviewFinding[] = [];
    const reportId = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const credRegex = /(?:ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{48}|AIzaSy[a-zA-Z0-9_-]{33}|password\s*[:=]\s*['"][^'"]{4,}['"])/i;
    const traversalRegex = /\.\.\/|\.\.\\/;
    const consoleRegex = /console\.(?:log|debug)\s*\(/;

    for (const f of files) {
      const lines = (f.content || '').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];

        if (credRegex.test(lineText)) {
          findings.push({
            id: `find-sec-${findings.length + 1}`,
            severity: 'critical',
            category: 'security',
            filePath: f.path,
            line: i + 1,
            finding: 'Potential hardcoded credential or token detected',
            explanation: 'Line contains patterns matching known API key or credential signatures. Secrets should be stored in environment variables.',
            suggestedFix: 'Replace the literal string with a secure environment variable reference (e.g. process.env.API_KEY).',
            confidence: 0.95,
            dismissed: false
          });
        }

        if (traversalRegex.test(lineText) && (f.path.includes('server') || f.path.includes('api'))) {
          findings.push({
            id: `find-trav-${findings.length + 1}`,
            severity: 'high',
            category: 'security',
            filePath: f.path,
            line: i + 1,
            finding: 'Potential unvalidated path traversal sequence',
            explanation: 'Detected "../" sequence in server path manipulation. May permit unauthorized filesystem escape if unvalidated.',
            suggestedFix: 'Sanitize path using normalizeWorkspacePath and reject traversal segments.',
            confidence: 0.85,
            dismissed: false
          });
        }

        if (consoleRegex.test(lineText) && f.path.endsWith('.ts') && !f.path.includes('test') && !f.path.includes('scripts')) {
          findings.push({
            id: `find-log-${findings.length + 1}`,
            severity: 'info',
            category: 'maintainability',
            filePath: f.path,
            line: i + 1,
            finding: 'Extraneous console logging in production code',
            explanation: 'Persistent console.log calls may pollute production server logs.',
            suggestedFix: 'Remove console call or replace with structured logger.',
            confidence: 0.75,
            dismissed: false
          });
        }
      }
    }

    const report: ReviewReport = {
      id: reportId,
      projectId,
      userId,
      timestamp: Date.now(),
      findings,
      summary: {
        criticalCount: findings.filter(f => f.severity === 'critical').length,
        highCount: findings.filter(f => f.severity === 'high').length,
        mediumCount: findings.filter(f => f.severity === 'medium').length,
        lowCount: findings.filter(f => f.severity === 'low').length,
        total: findings.length
      }
    };

    this.reports.set(reportId, report);
    return report;
  }

  static getReport(id: string, projectId?: string, userId?: string): ReviewReport | undefined {
    const report = this.reports.get(id);
    if (!this.canAccessReport(report, projectId, userId)) return undefined;
    return report;
  }

  static listReports(projectId: string, userId?: string): ReviewReport[] {
    return Array.from(this.reports.values()).filter(r => this.canAccessReport(r, projectId, userId));
  }

  static dismissFinding(reportId: string, findingId: string, projectId?: string, userId?: string): boolean {
    const report = this.getReport(reportId, projectId, userId);
    if (!report) return false;
    const item = report.findings.find(f => f.id === findingId);
    if (!item) return false;
    item.dismissed = true;
    return true;
  }

  static clear(): void {
    this.reports.clear();
  }
}
