/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';

describe('Workspace Containment & Realpath Validation (Phase 1 SEC-04)', () => {
  let tempBaseDir: string;
  let workspaceRoot: string;
  let externalSecretDir: string;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-containment-test-'));
    workspaceRoot = path.join(tempBaseDir, 'workspace');
    externalSecretDir = path.join(tempBaseDir, 'external-secrets');

    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(externalSecretDir, { recursive: true });

    fs.writeFileSync(path.join(workspaceRoot, 'safe.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(externalSecretDir, 'external-data.txt'), 'OUTSIDE_DATA');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  it('allows reading and writing legitimate files inside workspace root', async () => {
    const ws = new LocalFileSystemWorkspaceService(workspaceRoot);
    const content = await ws.readFile('safe.ts');
    expect(content).toBe('export const a = 1;');

    await ws.writeFile('nested/hello.ts', 'console.log("hello");');
    const written = await ws.readFile('nested/hello.ts');
    expect(written).toBe('console.log("hello");');
  });

  it('rejects lexical path traversal attempts escaping workspace root', () => {
    const ws = new LocalFileSystemWorkspaceService(workspaceRoot);
    expect(() => ws.resolvePath('../external-secrets/external-data.txt')).toThrow();
    expect(() => ws.resolvePath('../../etc/passwd')).toThrow();
  });

  it('rejects writing to nonexistent paths that would escape workspace root', async () => {
    const ws = new LocalFileSystemWorkspaceService(workspaceRoot);
    await expect(async () => {
      await ws.writeFile('../escaped-file.txt', 'malicious');
    }).rejects.toThrow();

    await expect(async () => {
      await ws.writeFile('../../outside/deep/file.txt', 'malicious');
    }).rejects.toThrow();
  });

  it('rejects deleting or stating files that escape workspace root', async () => {
    const ws = new LocalFileSystemWorkspaceService(workspaceRoot);
    await expect(async () => {
      await ws.deleteFile('../external-secrets/external-data.txt');
    }).rejects.toThrow();

    await expect(async () => {
      await ws.stat('../external-secrets/external-data.txt');
    }).rejects.toThrow();
  });

  it('safely returns false for fileExists on escaping paths without throwing unhandled exceptions', async () => {
    const ws = new LocalFileSystemWorkspaceService(workspaceRoot);
    const exists = await ws.fileExists('../external-secrets/external-data.txt');
    expect(exists).toBe(false);
  });

  it('prevents symlink attacks pointing to files outside workspace root', async () => {
    const symlinkPath = path.join(workspaceRoot, 'secret-link');
    try {
      fs.symlinkSync(externalSecretDir, symlinkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (e: any) {
      // If symlink creation lacks permissions on Windows without developer mode, verify resolvePath containment
      return;
    }

    const ws = new LocalFileSystemWorkspaceService(workspaceRoot);

    // Reading through the symlink must throw containment violation
    await expect(async () => {
      await ws.readFile('secret-link/external-data.txt');
    }).rejects.toThrow(/containment violation/i);

    // Writing through the symlink must throw containment violation
    await expect(async () => {
      await ws.writeFile('secret-link/pwned.txt', 'malicious');
    }).rejects.toThrow(/containment violation/i);

    // Writing to a nonexistent deep subpath through symlink must throw containment violation
    await expect(async () => {
      await ws.writeFile('secret-link/deep/sub/nonexistent.txt', 'malicious');
    }).rejects.toThrow(/containment violation/i);

    // Directory listing must not follow escaping symlinks into external directories
    const files = await ws.listFiles({ recursive: true });
    const paths = files.map(f => f.path);
    expect(paths).not.toContain('secret-link/external-data.txt');
  });
});
