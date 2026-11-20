/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';

describe('SEC-04 Filesystem Race Condition & Symlink Protection Engine (Phase 1.1 Task 5)', () => {
  let tmpBaseDir: string;
  let workspaceDir: string;
  let outsideDir: string;
  let workspaceService: LocalFileSystemWorkspaceService;

  beforeEach(async () => {
    tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-fs-race-test-'));
    workspaceDir = path.join(tmpBaseDir, 'workspace');
    outsideDir = path.join(tmpBaseDir, 'outside-sensitive');

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Sensitive external file
    fs.writeFileSync(path.join(outsideDir, 'sensitive.txt'), 'SUPER_SECRET_PAYLOAD', 'utf8');

    workspaceService = new LocalFileSystemWorkspaceService(workspaceDir);
    await workspaceService.initializeIndex();
  });

  afterEach(async () => {
    try {
      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    } catch {}
  });

  it('safely reads and writes valid contained workspace files', async () => {
    await workspaceService.writeFile('src/app.ts', 'console.log("hello world");');
    const read = await workspaceService.readFile('src/app.ts');
    expect(read).toBe('console.log("hello world");');
  });

  it('refuses to read through a symlink pointing outside the workspace', async () => {
    const sensitiveFile = path.join(outsideDir, 'sensitive.txt');
    const symlinkTarget = path.join(workspaceDir, 'external-link.txt');

    try {
      fs.symlinkSync(sensitiveFile, symlinkTarget);
    } catch (e: any) {
      if (process.platform === 'win32' && e.code === 'EPERM') {
        // Windows unprivileged symlink test fallback
        return;
      }
      throw e;
    }

    await expect(workspaceService.readFile('external-link.txt')).rejects.toThrow(
      /Path containment violation/
    );
  });

  it('refuses to write through an existing symlink pointing outside the workspace, protecting target content', async () => {
    const sensitiveFile = path.join(outsideDir, 'sensitive.txt');
    const symlinkTarget = path.join(workspaceDir, 'overwrite-link.txt');

    try {
      fs.symlinkSync(sensitiveFile, symlinkTarget);
    } catch (e: any) {
      if (process.platform === 'win32' && e.code === 'EPERM') {
        return;
      }
      throw e;
    }

    // Attempting to overwrite through the symlink must fail closed
    await expect(
      workspaceService.writeFile('overwrite-link.txt', 'MALICIOUS_OVERWRITE')
    ).rejects.toThrow(/Path containment violation/);

    // Verify external target was NOT overwritten
    const sensitiveContent = fs.readFileSync(sensitiveFile, 'utf8');
    expect(sensitiveContent).toBe('SUPER_SECRET_PAYLOAD');
  });

  it('refuses to write if an intermediate directory segment is a symlink pointing outside', async () => {
    const symlinkDir = path.join(workspaceDir, 'evil-dir');

    try {
      fs.symlinkSync(outsideDir, symlinkDir, 'junction');
    } catch (e: any) {
      if (process.platform === 'win32' && e.code === 'EPERM') {
        return;
      }
      throw e;
    }

    await expect(
      workspaceService.writeFile('evil-dir/pwned.txt', 'ATTACK')
    ).rejects.toThrow(/Path containment violation/);

    expect(fs.existsSync(path.join(outsideDir, 'pwned.txt'))).toBe(false);
  });

  it('unlinks only the symlink itself on deleteFile, leaving external target file intact', async () => {
    const sensitiveFile = path.join(outsideDir, 'sensitive.txt');
    const symlinkTarget = path.join(workspaceDir, 'delete-link.txt');

    try {
      fs.symlinkSync(sensitiveFile, symlinkTarget);
    } catch (e: any) {
      if (process.platform === 'win32' && e.code === 'EPERM') {
        return;
      }
      throw e;
    }

    expect(fs.existsSync(symlinkTarget)).toBe(true);

    await workspaceService.deleteFile('delete-link.txt');

    // Symlink is removed
    expect(fs.existsSync(symlinkTarget)).toBe(false);
    // External file still exists intact!
    expect(fs.existsSync(sensitiveFile)).toBe(true);
    expect(fs.readFileSync(sensitiveFile, 'utf8')).toBe('SUPER_SECRET_PAYLOAD');
  });

  it('verifies nonexistent target path ancestor containment', () => {
    // Normal nonexistent path in valid workspace subfolder
    const validTarget = workspaceService.resolvePath('nested/future/file.txt');
    expect(validTarget).toContain(workspaceDir);

    // Escaping traversal path
    expect(() => workspaceService.resolvePath('../../../etc/passwd')).toThrow(
      /Path traversal is strictly prohibited|Path containment violation/
    );
  });

  it('eliminates TOCTOU symlink-swap races during concurrent read and write operations', async () => {
    const validTargetDir = path.join(workspaceDir, 'legit-target');
    fs.mkdirSync(validTargetDir, { recursive: true });
    fs.writeFileSync(path.join(validTargetDir, 'data.txt'), 'LEGIT_WORKSPACE_CONTENT', 'utf8');

    const swapLink = path.join(workspaceDir, 'dynamic-link');

    const createLink = (target: string) => {
      try {
        if (fs.existsSync(swapLink)) {
          fs.unlinkSync(swapLink);
        }
      } catch {}
      try {
        if (process.platform === 'win32') {
          fs.symlinkSync(target, swapLink, 'junction');
        } else {
          fs.symlinkSync(target, swapLink, 'dir');
        }
      } catch (err: any) {
        if (process.platform === 'win32' && err.code === 'EPERM') return false;
        throw err;
      }
      return true;
    };

    if (!createLink(validTargetDir)) {
      // Windows unprivileged fallback if junctions restricted
      return;
    }

    let isSwapping = true;
    // Background worker rapidly swapping dynamic-link between valid workspace and outside sensitive dir
    const swapper = (async () => {
      let turn = 0;
      while (isSwapping) {
        const target = turn % 2 === 0 ? outsideDir : validTargetDir;
        createLink(target);
        turn++;
        await new Promise(r => setTimeout(r, 2));
      }
    })();

    const operations: Promise<void>[] = [];
    const leakedPayloads: string[] = [];

    for (let i = 0; i < 30; i++) {
      // Concurrent read
      operations.push(
        (async () => {
          try {
            const content = await workspaceService.readFile('dynamic-link/data.txt');
            if (content.includes('SUPER_SECRET_PAYLOAD')) {
              leakedPayloads.push(content);
            }
          } catch (err: any) {
            // Path containment violation or ENOENT during swap is expected and correct
            expect(err.message).toMatch(/Path containment violation|File not found|ENOENT/i);
          }
        })()
      );

      // Concurrent write attempt through dynamic link
      operations.push(
        (async () => {
          try {
            await workspaceService.writeFile('dynamic-link/attack.txt', 'MALICIOUS_OVERWRITE');
          } catch (err: any) {
            expect(err.message).toMatch(/Path containment violation|File not found|ENOENT|EEXIST/i);
          }
        })()
      );
    }

    await Promise.all(operations);
    isSwapping = false;
    await swapper;

    // Invariant 1: Zero leaks of outside secret payload
    expect(leakedPayloads).toHaveLength(0);

    // Invariant 2: External sensitive directory was NEVER modified or injected with attack files
    expect(fs.existsSync(path.join(outsideDir, 'attack.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(outsideDir, 'sensitive.txt'), 'utf8')).toBe('SUPER_SECRET_PAYLOAD');
  });
});
