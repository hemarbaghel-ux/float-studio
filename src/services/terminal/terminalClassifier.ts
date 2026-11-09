/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Terminal Error Classifier & Diagnostics Parser (Phase 7)
 *
 * Scans terminal standard error and execution output to automatically detect and classify:
 * - Missing commands
 * - Uninstalled/missing dependencies
 * - Compiler/TypeScript build failures
 * - Test suite assertions & test failures
 * - Runtime exceptions and stack traces
 * - Permission and environment errors
 *
 * Synthesizes high-fidelity "Fix with FLOAT" context packages for immediate Composer remediation.
 */

export type TerminalErrorCategory =
  | 'command_not_found'
  | 'missing_dependency'
  | 'build_failure'
  | 'syntax_error'
  | 'test_failure'
  | 'runtime_exception'
  | 'permission_denied'
  | 'unknown';

export interface ClassifiedTerminalError {
  readonly category: TerminalErrorCategory;
  readonly summary: string;
  readonly command?: string;
  readonly exitCode?: number;
  readonly targetFile?: string;
  readonly targetLine?: number;
  readonly packageName?: string;
  readonly rawSnippet: string;
  readonly recommendedPrompt: string;
}

/**
 * Parses raw terminal stdout/stderr to extract structured diagnostics.
 */
export function classifyTerminalOutput(
  rawOutput: string,
  command?: string,
  exitCode?: number
): ClassifiedTerminalError | null {
  if (!rawOutput && (exitCode === 0 || exitCode === undefined)) {
    return null;
  }

  const output = rawOutput || '';

  // 1. Missing command patterns
  const cmdNotFoundWindows = /'([^']+)' is not recognized as an internal or external command/i.exec(output);
  if (cmdNotFoundWindows) {
    const missingCmd = cmdNotFoundWindows[1];
    return {
      category: 'command_not_found',
      summary: `Command "${missingCmd}" is not installed or not in system PATH.`,
      command,
      exitCode: exitCode ?? 1,
      packageName: missingCmd,
      rawSnippet: cmdNotFoundWindows[0],
      recommendedPrompt: `The command "${missingCmd}" was not found. Please check dependencies in package.json or install the required tool.`,
    };
  }

  const cmdNotFoundUnix = /(?:bash|zsh|sh)?:\s*(?:command not found:\s*([^\n\r]+)|([^\s:]+):\s*command not found)/i.exec(output);
  if (cmdNotFoundUnix) {
    const missingCmd = (cmdNotFoundUnix[1] || cmdNotFoundUnix[2] || '').trim();
    return {
      category: 'command_not_found',
      summary: `Command "${missingCmd}" is not installed or not in system PATH.`,
      command,
      exitCode: exitCode ?? 127,
      packageName: missingCmd,
      rawSnippet: cmdNotFoundUnix[0],
      recommendedPrompt: `The command "${missingCmd}" was not found. Please configure the tool or install it in the project.`,
    };
  }

  // 2. Missing dependency patterns (Node / Python)
  const nodeMissingModule = /Cannot find module ['"]([^'"]+)['"]/i.exec(output);
  if (nodeMissingModule) {
    const pkg = nodeMissingModule[1];
    return {
      category: 'missing_dependency',
      summary: `Missing Node.js dependency "${pkg}".`,
      command,
      exitCode: exitCode ?? 1,
      packageName: pkg,
      rawSnippet: nodeMissingModule[0],
      recommendedPrompt: `Cannot find module "${pkg}". Please inspect dependencies in package.json and import paths.`,
    };
  }

  const pyMissingModule = /(?:ModuleNotFoundError|ImportError):\s*(?:No module named ['"]([^'"]+)['"]|cannot import name ['"]([^'"]+)['"])/i.exec(output);
  if (pyMissingModule) {
    const pkg = pyMissingModule[1] || pyMissingModule[2];
    return {
      category: 'missing_dependency',
      summary: `Missing Python dependency "${pkg}".`,
      command,
      exitCode: exitCode ?? 1,
      packageName: pkg,
      rawSnippet: pyMissingModule[0],
      recommendedPrompt: `Python failed to import module "${pkg}". Please check requirements.txt or import statements.`,
    };
  }

  // 3. TypeScript / Compiler Build Errors
  const tsErrorWithLoc = /([a-zA-Z0-9_./\\-]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)\s*-\s*error\s+TS(\d+):\s*([^\r\n]+)/i.exec(output);
  if (tsErrorWithLoc) {
    const file = tsErrorWithLoc[1].replace(/\\/g, '/');
    const line = parseInt(tsErrorWithLoc[2], 10);
    const tsCode = tsErrorWithLoc[4];
    const message = tsErrorWithLoc[5].trim();
    return {
      category: 'build_failure',
      summary: `TypeScript error TS${tsCode} in ${file}:${line}: ${message}`,
      command,
      exitCode: exitCode ?? 1,
      targetFile: file,
      targetLine: line,
      rawSnippet: tsErrorWithLoc[0],
      recommendedPrompt: `Fix TypeScript compiler error TS${tsCode} in ${file} at line ${line}: "${message}".`,
    };
  }

  const tsErrorPlain = /error\s+TS(\d+):\s*([^\r\n]+)/i.exec(output);
  if (tsErrorPlain) {
    const tsCode = tsErrorPlain[1];
    const message = tsErrorPlain[2].trim();
    return {
      category: 'build_failure',
      summary: `TypeScript compilation error TS${tsCode}: ${message}`,
      command,
      exitCode: exitCode ?? 1,
      rawSnippet: tsErrorPlain[0],
      recommendedPrompt: `Fix TypeScript build error TS${tsCode}: "${message}".`,
    };
  }

  // 4. Test Failures (Jest, Mocha, Vitest, unittest)
  const jestFail = /FAIL\s+([a-zA-Z0-9_./\\-]+\.(?:test|spec)\.[a-zA-Z0-9]+)/i.exec(output);
  if (jestFail) {
    const testFile = jestFail[1].replace(/\\/g, '/');
    return {
      category: 'test_failure',
      summary: `Test suite failed in ${testFile}.`,
      command,
      exitCode: exitCode ?? 1,
      targetFile: testFile,
      rawSnippet: jestFail[0],
      recommendedPrompt: `Unit tests failed in ${testFile}. Please inspect the test assertions and fix the underlying issue.`,
    };
  }

  const assertionError = /AssertionError(?:\s*\[ERR_ASSERTION\])?:\s*([^\r\n]+)/i.exec(output);
  if (assertionError) {
    const message = assertionError[1].trim();
    return {
      category: 'test_failure',
      summary: `Assertion failed: ${message}`,
      command,
      exitCode: exitCode ?? 1,
      rawSnippet: assertionError[0],
      recommendedPrompt: `Assertion failed during test execution: "${message}". Please analyze the failure and update code to satisfy the test.`,
    };
  }

  // 5. Syntax Errors
  const syntaxErr = /SyntaxError:\s*([^\r\n]+)/i.exec(output);
  if (syntaxErr) {
    return {
      category: 'syntax_error',
      summary: `Syntax error: ${syntaxErr[1].trim()}`,
      command,
      exitCode: exitCode ?? 1,
      rawSnippet: syntaxErr[0],
      recommendedPrompt: `Fix syntax error: "${syntaxErr[1].trim()}".`,
    };
  }

  // 6. Permission Denied
  const permDenied = /(?:EACCES:\s*permission denied|Permission denied|Operation not permitted)/i.exec(output);
  if (permDenied) {
    return {
      category: 'permission_denied',
      summary: `Permission denied: ${permDenied[0]}`,
      command,
      exitCode: exitCode ?? 126,
      rawSnippet: permDenied[0],
      recommendedPrompt: `Command encountered permission denied (${permDenied[0]}). Please review workspace file permissions.`,
    };
  }

  // 7. Generic Non-Zero Exit Code with output
  if (exitCode !== 0 && exitCode !== undefined) {
    const lines = output.trim().split('\n').filter(l => l.trim().length > 0);
    const lastLine = lines[lines.length - 1] || 'Process terminated with non-zero exit code';
    return {
      category: 'unknown',
      summary: `Command failed with exit code ${exitCode}: ${lastLine.slice(0, 150)}`,
      command,
      exitCode,
      rawSnippet: lastLine,
      recommendedPrompt: `Command "${command || 'task'}" failed with exit code ${exitCode}. Please analyze the terminal output and fix the error.`,
    };
  }

  return null;
}
