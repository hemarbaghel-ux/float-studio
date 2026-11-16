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
});
