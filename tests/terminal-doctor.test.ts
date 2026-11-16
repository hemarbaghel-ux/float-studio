/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { runTerminalSetupDoctor } from '../src/server/terminal/terminalDoctor';

describe('Terminal Doctor (Sandboxed Docker Execution Environment)', () => {
  it('evaluates environment requirements and returns structured report', () => {
    const report = runTerminalSetupDoctor({});
    expect(report).toBeDefined();
    expect(report.ready).toBe(false);
    expect(report.mode).toBe('unconfigured');
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(4);
  });

  it('reports blocker when execution image digest is missing or unpinned', () => {
    const report = runTerminalSetupDoctor({
      FLOAT_EXECUTION_IMAGE: 'node:22-bookworm-slim', // Not pinned to sha256
    });

    const check = report.checks.find(c => c.id === 'execution_image_digest');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('blocker');
  });

  it('validates execution image when properly pinned to sha256 digest', () => {
    const report = runTerminalSetupDoctor({
      FLOAT_EXECUTION_IMAGE: 'node@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    const check = report.checks.find(c => c.id === 'execution_image_digest');
    expect(check?.passed).toBe(true);
  });
});
