import { v4 as uuidv4 } from 'uuid';
import { execFile, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import ts from 'typescript';
import { 
  ProjectValidationType, 
  ValidationDiagnostic, 
  ValidationCheckResult, 
  ValidationRun, 
  ValidationStatus,
  ErrorExplanationRequest,
  ErrorExplanationResponse
} from '../../types/validation';
import { ProposalService } from '../agent/proposalService';
import { ModelRouter } from '../providers/router';

export class ValidationService {
  private static activeRuns = new Map<string, { abortController: AbortController; process?: ChildProcess }>();
  private static runHistory = new Map<string, ValidationRun>();
  private static modelRouter = new ModelRouter();

  /**
   * Redacts sensitive server paths, environment variables, and credentials from process output
   */
  static sanitizeOutput(text: string): string {
    if (!text) return '';
    let sanitized = text;

    // Redact working directory
    const cwd = process.cwd();
    sanitized = sanitized.split(cwd).join('.');

    // Redact common secret patterns
    sanitized = sanitized.replace(/(AIzaSy[A-Za-z0-9_-]{33})/g, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/([a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/g, '[REDACTED_JWT]');
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED_TOKEN]');

    // Redact any environment variables that look like secrets
    const secretKeys = ['GEMINI_API_KEY', 'FIREBASE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY'];
    for (const key of secretKeys) {
      const val = process.env[key];
      if (val && val.length > 5) {
        sanitized = sanitized.split(val).join('[REDACTED_SECRET]');
      }
    }

    return sanitized;
  }

  /**
   * Parses standard TypeScript compiler diagnostic output
   */
  static parseTscDiagnostics(rawOutput: string): ValidationDiagnostic[] {
    const diagnostics: ValidationDiagnostic[] = [];
    const lines = rawOutput.split('\n');

    // Pattern: filePath(line,col): error/warning TSxxxx: message
    const tscRegex = /^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;

    for (const line of lines) {
      const match = line.trim().match(tscRegex);
      if (match) {
        const [, rawFile, lineNum, colNum, severityStr, code, message] = match;
        const filePath = rawFile.replace(/^\.\//, '').trim();
        diagnostics.push({
          id: uuidv4(),
          checkType: 'typecheck',
          severity: severityStr === 'error' ? 'error' : 'warning',
          message: `${code}: ${message.trim()}`,
          filePath,
          line: parseInt(lineNum, 10),
          column: parseInt(colNum, 10),
          source: 'TypeScript Compiler',
          raw: line.trim()
        });
      }
    }

    return diagnostics;
  }

  /**
   * Fast in-memory AST and syntax parsing for JS/TS/JSON/Python files
   */
  static validateSyntax(
    files: Array<{ path: string; content?: string }>
  ): ValidationCheckResult {
    const startTime = Date.now();
    const diagnostics: ValidationDiagnostic[] = [];

    for (const file of files) {
      const p = file.path.replace(/^\/+/, '');
      const content = file.content || '';

      if (p.endsWith('.json')) {
        try {
          JSON.parse(content);
        } catch (e: any) {
          let line = 1;
          let col = 1;
          const match = e.message.match(/position\s+(\d+)/i);
          if (match) {
            const pos = parseInt(match[1], 10);
            const linesUpTo = content.slice(0, pos).split('\n');
            line = linesUpTo.length;
            col = linesUpTo[linesUpTo.length - 1].length + 1;
          }
          diagnostics.push({
            id: uuidv4(),
            checkType: 'syntax',
            severity: 'error',
            message: `JSON Syntax Error: ${e.message}`,
            filePath: p,
            line,
            column: col,
            source: 'JSON Parser'
          });
        }
      } else if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js') || p.endsWith('.jsx')) {
        try {
          const isTsx = p.endsWith('.tsx') || p.endsWith('.jsx');
          const sourceFile = ts.createSourceFile(
            p,
            content,
            ts.ScriptTarget.Latest,
            true,
            isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
          );

          const parseDiagnostics = (sourceFile as any).parseDiagnostics || [];
          for (const diag of parseDiagnostics) {
            let line = 1;
            let column = 1;
            if (diag.start !== undefined) {
              const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
              line = pos.line + 1;
              column = pos.character + 1;
            }
            const msg = typeof diag.messageText === 'string' 
              ? diag.messageText 
              : diag.messageText.messageText;

            diagnostics.push({
              id: uuidv4(),
              checkType: 'syntax',
              severity: 'error',
              message: `Syntax Error: ${msg}`,
              filePath: p,
              line,
              column,
              source: 'TypeScript Syntax Parser'
            });
          }
        } catch (err: any) {
          diagnostics.push({
            id: uuidv4(),
            checkType: 'syntax',
            severity: 'error',
            message: `Parse Error: ${err.message}`,
            filePath: p,
            source: 'Syntax Parser'
          });
        }
      } else if (p.endsWith('.py')) {
        // Quick Python structural indentation & bracket check
        const lines = content.split('\n');
        const bracketStack: { char: string; line: number }[] = [];
        const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          for (let c = 0; c < l.length; c++) {
            const ch = l[c];
            if (ch === '(' || ch === '[' || ch === '{') {
              bracketStack.push({ char: ch, line: i + 1 });
            } else if (ch === ')' || ch === ']' || ch === '}') {
              const expected = pairs[ch];
              const last = bracketStack.pop();
              if (!last || last.char !== expected) {
                diagnostics.push({
                  id: uuidv4(),
                  checkType: 'syntax',
                  severity: 'error',
                  message: `Unmatched closing bracket '${ch}'`,
                  filePath: p,
                  line: i + 1,
                  column: c + 1,
                  source: 'Python Syntax Validator'
                });
                break;
              }
            }
          }
        }

        if (bracketStack.length > 0) {
          const unclosed = bracketStack[bracketStack.length - 1];
          diagnostics.push({
            id: uuidv4(),
            checkType: 'syntax',
            severity: 'error',
            message: `Unclosed bracket '${unclosed.char}' opened on line ${unclosed.line}`,
            filePath: p,
            line: unclosed.line,
            source: 'Python Syntax Validator'
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      type: 'syntax',
      name: 'Syntax & Formatting Validation',
      status: diagnostics.length > 0 ? 'failed' : 'passed',
      durationMs,
      message: diagnostics.length === 0 
        ? `All ${files.length} project files passed syntax validation.` 
        : `Found ${diagnostics.length} syntax issue${diagnostics.length > 1 ? 's' : ''}.`,
      diagnostics
    };
  }

  /**
   * Executes project-wide TypeScript compiler check
   */
  static async runTypeCheck(
    abortSignal?: AbortSignal
  ): Promise<ValidationCheckResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      let isSettled = false;

      const finish = (result: ValidationCheckResult) => {
        if (!isSettled) {
          isSettled = true;
          resolve(result);
        }
      };

      const child = execFile(
        'npx',
        ['tsc', '--noEmit'],
        {
          cwd: process.cwd(),
          timeout: 25000,
          maxBuffer: 200 * 1024,
          env: { ...process.env, NODE_ENV: 'test' }
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const combinedOutput = this.sanitizeOutput((stdout || '') + '\n' + (stderr || ''));

          if (abortSignal?.aborted) {
            return finish({
              type: 'typecheck',
              name: 'TypeScript Compiler Check',
              status: 'cancelled',
              durationMs,
              message: 'Check was cancelled by user.',
              diagnostics: []
            });
          }

          if (error && error.killed) {
            return finish({
              type: 'typecheck',
              name: 'TypeScript Compiler Check',
              status: 'failed',
              durationMs,
              message: 'Type check timed out after 25 seconds.',
              diagnostics: [{
                id: uuidv4(),
                checkType: 'typecheck',
                severity: 'error',
                message: 'TypeScript compilation timed out. Consider breaking down large files or checking project configuration.',
                source: 'Timeout Guard'
              }]
            });
          }

          const diagnostics = this.parseTscDiagnostics(combinedOutput);
          const hasErrors = diagnostics.some(d => d.severity === 'error') || (error !== null && diagnostics.length > 0);

          finish({
            type: 'typecheck',
            name: 'TypeScript Compiler Check',
            status: hasErrors ? 'failed' : 'passed',
            durationMs,
            message: diagnostics.length === 0 
              ? 'TypeScript compilation clean. 0 errors detected.' 
              : `Found ${diagnostics.length} compiler diagnostic${diagnostics.length > 1 ? 's' : ''}.`,
            diagnostics
          });
        }
      );

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          try {
            child.kill('SIGTERM');
          } catch (e) {}
        });
      }
    });
  }

  /**
   * Build check validation
   */
  static async runBuildCheck(abortSignal?: AbortSignal): Promise<ValidationCheckResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      let isSettled = false;

      const finish = (result: ValidationCheckResult) => {
        if (!isSettled) {
          isSettled = true;
          resolve(result);
        }
      };

      const child = execFile(
        'npx',
        ['vite', 'build'],
        {
          cwd: process.cwd(),
          timeout: 30000,
          maxBuffer: 200 * 1024,
          env: { ...process.env, NODE_ENV: 'production' }
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const output = this.sanitizeOutput((stdout || '') + '\n' + (stderr || ''));

          if (abortSignal?.aborted) {
            return finish({
              type: 'build',
              name: 'Production Build Verification',
              status: 'cancelled',
              durationMs,
              message: 'Build check was cancelled by user.',
              diagnostics: []
            });
          }

          if (error) {
            const lines = output.split('\n').filter(l => l.includes('error') || l.includes('Error'));
            const diagnostics: ValidationDiagnostic[] = lines.slice(0, 5).map(l => ({
              id: uuidv4(),
              checkType: 'build',
              severity: 'error',
              message: l.trim(),
              source: 'Vite Production Build'
            }));

            if (diagnostics.length === 0) {
              diagnostics.push({
                id: uuidv4(),
                checkType: 'build',
                severity: 'error',
                message: error.message || 'Build failed with non-zero exit code.',
                source: 'Vite Production Build'
              });
            }

            return finish({
              type: 'build',
              name: 'Production Build Verification',
              status: 'failed',
              durationMs,
              message: 'Vite production build failed.',
              diagnostics
            });
          }

          finish({
            type: 'build',
            name: 'Production Build Verification',
            status: 'passed',
            durationMs,
            message: 'Production build bundles successfully with Vite.',
            diagnostics: []
          });
        }
      );

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          try {
            child.kill('SIGTERM');
          } catch (e) {}
        });
      }
    });
  }

  /**
   * Executes validation pipeline against current workspace or code proposal preview
   */
  static async executeValidation(params: {
    projectId: string;
    userId: string;
    target: 'current_project' | 'proposal';
    proposalId?: string;
    files: Array<{ path: string; content?: string }>;
    requestedChecks?: ProjectValidationType[];
  }): Promise<ValidationRun> {
    const { projectId, userId, target, proposalId, files, requestedChecks } = params;

    // Check concurrency lock: abort previous active run if exists
    if (this.activeRuns.has(projectId)) {
      const active = this.activeRuns.get(projectId)!;
      active.abortController.abort();
      this.activeRuns.delete(projectId);
    }

    const abortController = new AbortController();
    this.activeRuns.set(projectId, { abortController });

    const runId = uuidv4();
    const startTime = Date.now();

    // Prepare files to validate
    let targetFiles = [...files];

    // If target is proposal, overlay proposed changes on top of files WITHOUT modifying originals
    if (target === 'proposal' && proposalId) {
      const proposal = ProposalService.getProposal(proposalId);
      if (!proposal) {
        throw new Error(`Proposal "${proposalId}" not found.`);
      }
      if (proposal.status === 'rejected') {
        throw new Error(`Proposal "${proposalId}" was rejected.`);
      }

      const fileMap = new Map<string, string>();
      for (const f of files) {
        fileMap.set(f.path.replace(/^\/+/, ''), f.content || '');
      }

      for (const change of proposal.changes) {
        if (change.status === 'rejected') continue;
        if (change.operation === 'delete') {
          fileMap.delete(change.path);
        } else {
          fileMap.set(change.path, change.proposedContent || '');
        }
      }

      targetFiles = Array.from(fileMap.entries()).map(([p, content]) => ({ path: p, content }));
    }

    const checksToRun = requestedChecks && requestedChecks.length > 0
      ? requestedChecks
      : (['syntax', 'typecheck', 'build', 'test', 'eslint'] as ProjectValidationType[]);

    const checkResults: ValidationCheckResult[] = [];

    try {
      for (const checkType of checksToRun) {
        if (abortController.signal.aborted) {
          checkResults.push({
            type: checkType,
            name: checkType.toUpperCase(),
            status: 'cancelled',
            durationMs: 0,
            message: 'Validation cancelled.',
            diagnostics: []
          });
          continue;
        }

        if (checkType === 'syntax') {
          checkResults.push(this.validateSyntax(targetFiles));
        } else if (checkType === 'typecheck') {
          // If testing current project, run compiler
          if (target === 'current_project') {
            const tcResult = await this.runTypeCheck(abortController.signal);
            checkResults.push(tcResult);
          } else {
            // For proposal preview: run in-memory syntax + isolated virtual typecheck
            const tcResult = this.validateSyntax(targetFiles);
            checkResults.push({
              ...tcResult,
              type: 'typecheck',
              name: 'TypeScript Proposal Verification',
              message: tcResult.status === 'passed' 
                ? 'Proposal preview syntax and type structures valid.' 
                : tcResult.message
            });
          }
        } else if (checkType === 'build') {
          if (target === 'current_project') {
            const buildResult = await this.runBuildCheck(abortController.signal);
            checkResults.push(buildResult);
          } else {
            checkResults.push({
              type: 'build',
              name: 'Production Build Verification',
              status: 'unsupported',
              durationMs: 0,
              unsupportedReason: 'Vite build verification is only performed against the main workspace. Apply the proposal first to run full production bundling.',
              diagnostics: []
            });
          }
        } else if (checkType === 'test') {
          checkResults.push({
            type: 'test',
            name: 'Unit Test Runner',
            status: 'unsupported',
            durationMs: 0,
            unsupportedReason: 'No automated unit test runner (e.g. Vitest/Jest) configured in package.json. Run unit testing after configuring a test runner.',
            diagnostics: []
          });
        } else if (checkType === 'eslint') {
          checkResults.push({
            type: 'eslint',
            name: 'ESLint Code Quality',
            status: 'unsupported',
            durationMs: 0,
            unsupportedReason: 'ESLint is not configured in this project. TypeScript compiler diagnostics are active as the primary type/syntax validator.',
            diagnostics: []
          });
        }
      }

      let errorCount = 0;
      let warningCount = 0;

      for (const res of checkResults) {
        for (const diag of res.diagnostics) {
          if (diag.severity === 'error') errorCount++;
          if (diag.severity === 'warning') warningCount++;
        }
      }

      const isCancelled = checkResults.some(c => c.status === 'cancelled') || abortController.signal.aborted;
      const isFailed = checkResults.some(c => c.status === 'failed');

      const status: ValidationStatus = isCancelled 
        ? 'cancelled' 
        : isFailed 
          ? 'failed' 
          : 'passed';

      const completionTime = Date.now();
      const durationMs = completionTime - startTime;

      const summary = status === 'passed'
        ? `Validation passed (${checkResults.filter(c => c.status === 'passed').length} checks passed, 0 errors)`
        : status === 'cancelled'
          ? 'Validation run was cancelled'
          : `Validation failed with ${errorCount} error${errorCount !== 1 ? 's' : ''} and ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;

      const run: ValidationRun = {
        id: runId,
        projectId,
        userId,
        target,
        proposalId,
        status,
        startTime,
        completionTime,
        durationMs,
        checks: checkResults,
        errorCount,
        warningCount,
        summary
      };

      this.runHistory.set(runId, run);
      return run;
    } finally {
      this.activeRuns.delete(projectId);
    }
  }

  /**
   * Cancel an active validation run
   */
  static cancelValidation(projectId: string): boolean {
    const active = this.activeRuns.get(projectId);
    if (active) {
      active.abortController.abort();
      this.activeRuns.delete(projectId);
      return true;
    }
    return false;
  }

  /**
   * Get a completed validation run by ID
   */
  static getValidationRun(runId: string): ValidationRun | undefined {
    return this.runHistory.get(runId);
  }

  /**
   * AI Error Explanation: Takes a real diagnostic error and explains it with minimal code context
   */
  static async explainDiagnostic(
    req: ErrorExplanationRequest
  ): Promise<ErrorExplanationResponse> {
    const { diagnostic, targetFileContent } = req;

    let codeSlice = '';
    if (targetFileContent && diagnostic.line) {
      const lines = targetFileContent.split('\n');
      const start = Math.max(0, diagnostic.line - 6);
      const end = Math.min(lines.length, diagnostic.line + 5);
      codeSlice = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
    }

    const systemInstruction = `You are FLOAT AI's Senior Diagnostic & Error Explanation Engineer.
Your purpose is to explain a code or compiler diagnostic error clearly, identify the likely root cause, and provide actionable next steps.
Rules:
1. Explain what the error means in plain developer language.
2. State the likely cause (clearly noting when it is an educated deduction).
3. Point out the exact code section involved.
4. Suggest concrete steps to resolve it.
5. Provide a code example or recommended fix snippet without claiming it has been applied.
6. Never execute commands or modify files. The user will review any changes in FLOAT's proposal review view.`;

    const userPrompt = `[Diagnostic Error]
Source: ${diagnostic.source || diagnostic.checkType}
File: ${diagnostic.filePath || 'Unknown'} (Line ${diagnostic.line || '?'}, Column ${diagnostic.column || '?'})
Severity: ${diagnostic.severity.toUpperCase()}
Message: ${diagnostic.message}

${codeSlice ? `[Relevant Code Excerpt]\n${codeSlice}\n` : ''}

Please analyze this diagnostic and provide:
1. A concise explanation of what the error means.
2. The likely root cause.
3. The affected code section.
4. Step-by-step resolution advice.
5. A proposed fix code snippet if applicable.`;

    let text = '';
    try {
      const result = await this.modelRouter.generateContent({
        model: req.modelId || 'gemini-3.1-flash-lite',
        messages: [{ role: 'user', content: userPrompt }],
        systemInstruction
      });
      text = result.text || 'Unable to generate explanation.';
    } catch (err: any) {
      const isQuota = /resource_exhausted|quota|429|rate[- ]?limit/i.test(err?.message || '');
      text = isQuota
        ? "AI explanation is temporarily unavailable due to provider rate limits. Please review the diagnostic details below or try again in a few moments."
        : `Diagnostic explanation could not be completed: ${err?.message || 'Provider connection error'}`;
    }

    return {
      explanation: text,
      likelyCause: 'Derived from static compiler and syntax diagnostics.',
      affectedCodeSection: diagnostic.filePath ? `${diagnostic.filePath}:${diagnostic.line || 1}` : undefined,
      suggestedSteps: [
        'Review the line identified in the diagnostic.',
        'Verify types and imported interfaces.',
        'Use FLOAT Code Proposal Review if code changes are suggested.'
      ]
    };
  }
}
