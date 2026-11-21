/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  defaultDesktopWorkspaceCapabilityService,
  isForbiddenSystemRoot,
} from '../src/server/workspace/desktopWorkspaceCapabilityService';
import {
  validateSafeWorkspacePath,
  SENSITIVE_SEGMENTS,
  SENSITIVE_EXTENSIONS,
} from '../src/shared/contracts/workspace';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';

describe('P0: Host Filesystem Boundary & Workspace Isolation', () => {
  let testRoot: string;
  let workspaceDir: string;
  let outsideDir: string;
  let outsideSecretFile: string;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'float-p0-test-'));
    workspaceDir = path.join(testRoot, 'workspace');
    outsideDir = path.join(testRoot, 'outside');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    outsideSecretFile = path.join(outsideDir, 'super-secret.env');
    fs.writeFileSync(outsideSecretFile, 'DATABASE_PASSWORD=ultra_confidential_123', 'utf8');

    // Create safe files inside workspace
    fs.writeFileSync(path.join(workspaceDir, 'package.json'), '{"name": "test-pkg"}', 'utf8');
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'src/index.ts'), 'export const hello = "world";', 'utf8');

    defaultDesktopWorkspaceCapabilityService.clearForTests();
  });

  afterEach(() => {
    defaultDesktopWorkspaceCapabilityService.clearForTests();
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('1. Path Traversal & Normalization (validateSafeWorkspacePath)', () => {
    it('rejects absolute Windows drive paths and root Unix paths', () => {
      expect(() => validateSafeWorkspacePath('C:\\Windows\\System32\\calc.exe')).toThrow(/Path traversal is strictly prohibited/);
      expect(() => validateSafeWorkspacePath('/etc/passwd')).toThrow(/Path traversal is strictly prohibited/);
      expect(() => validateSafeWorkspacePath('/var/log/syslog')).toThrow(/Path traversal is strictly prohibited/);
    });

    it('rejects parent directory traversal with .. in various forms', () => {
      expect(() => validateSafeWorkspacePath('../outside/super-secret.env')).toThrow(/Path traversal is strictly prohibited/);
      expect(() => validateSafeWorkspacePath('src/../../outside/super-secret.env')).toThrow(/Path traversal is strictly prohibited/);
      expect(() => validateSafeWorkspacePath('..\\outside\\super-secret.env')).toThrow(/Path traversal is strictly prohibited/);
    });

    it('rejects mixed slash styles attempting traversal', () => {
      expect(() => validateSafeWorkspacePath('src/..\\..\\outside')).toThrow(/Path traversal is strictly prohibited/);
      expect(() => validateSafeWorkspacePath('src\\..//..//outside')).toThrow(/Path traversal is strictly prohibited/);
    });

    it('rejects URL percent-encoded traversal (%2e%2e and %2f)', () => {
      expect(() => validateSafeWorkspacePath('%2e%2e%2foutside%2fsecret.env')).toThrow(/Path traversal is strictly prohibited/);
      expect(() => validateSafeWorkspacePath('src%2f%2e%2e%2f%2e%2e%2fsecret')).toThrow(/Path traversal is strictly prohibited/);
    });

    it('rejects double URL-encoded traversal (%252e%252e)', () => {
      expect(() => validateSafeWorkspacePath('%252e%252e%252foutside')).toThrow(/Path traversal is strictly prohibited/);
    });

    it('rejects null-byte injection', () => {
      expect(() => validateSafeWorkspacePath('safe.txt\0/../../etc/passwd')).toThrow(/Path traversal is strictly prohibited/);
    });

    it('rejects Windows reserved device names (CON, PRN, AUX, NUL, COM1, LPT1)', () => {
      expect(() => validateSafeWorkspacePath('CON')).toThrow(/Access to reserved system device name is forbidden/);
      expect(() => validateSafeWorkspacePath('src/NUL.txt')).toThrow(/Access to reserved system device name is forbidden/);
      expect(() => validateSafeWorkspacePath('COM1')).toThrow(/Access to reserved system device name is forbidden/);
      expect(() => validateSafeWorkspacePath('AUX.json')).toThrow(/Access to reserved system device name is forbidden/);
    });

    it('rejects trailing spaces and dots on path segments', () => {
      expect(() => validateSafeWorkspacePath('src/index.ts.')).toThrow(/Path segment contains forbidden trailing space or dot/);
      expect(() => validateSafeWorkspacePath('src /index.ts')).toThrow(/Path segment contains forbidden trailing space or dot/);
    });

    it('rejects sensitive files and secret directories', () => {
      expect(() => validateSafeWorkspacePath('.env')).toThrow(/Access to sensitive workspace path is forbidden/);
      expect(() => validateSafeWorkspacePath('.env.local')).toThrow(/Access to sensitive workspace path is forbidden/);
      expect(() => validateSafeWorkspacePath('.ssh/id_rsa')).toThrow(/Access to sensitive workspace path is forbidden/);
      expect(() => validateSafeWorkspacePath('.aws/credentials')).toThrow(/Access to sensitive workspace path is forbidden/);
      expect(() => validateSafeWorkspacePath('secrets/private.pem')).toThrow(/Access to sensitive workspace path is forbidden/);
      expect(() => validateSafeWorkspacePath('certs/cert.key')).toThrow(/Access to sensitive workspace path is forbidden/);
    });

    it('accepts legitimate safe relative workspace paths and normalizes cleanly', () => {
      expect(validateSafeWorkspacePath('./src/index.ts')).toBe('src/index.ts');
      expect(validateSafeWorkspacePath('package.json')).toBe('package.json');
      expect(validateSafeWorkspacePath('src/components/Button.tsx')).toBe('src/components/Button.tsx');
    });
  });

  describe('2. Symlink & Containment Security (LocalFileSystemWorkspaceService)', () => {
    it('rejects reading through a symlink pointing outside the workspace', async () => {
      const outsideTarget = outsideSecretFile;
      const symlinkPath = path.join(workspaceDir, 'symlink-leak.txt');

      try {
        fs.symlinkSync(outsideTarget, symlinkPath, 'file');
      } catch (err: any) {
        if (err.code === 'EPERM') return; // Windows unprivileged symlinks skip
      }

      const localWs = new LocalFileSystemWorkspaceService(workspaceDir);
      await expect(localWs.readFile('symlink-leak.txt')).rejects.toThrow(/Path containment violation/);
    });

    it('rejects reading inside a directory symlink pointing outside the workspace', async () => {
      const symlinkDir = path.join(workspaceDir, 'symlink-dir');

      try {
        fs.symlinkSync(outsideDir, symlinkDir, 'junction');
      } catch (err: any) {
        if (err.code === 'EPERM') return;
      }

      const localWs = new LocalFileSystemWorkspaceService(workspaceDir);
      await expect(localWs.readFile('symlink-dir/super-secret.env')).rejects.toThrow();
    });

    it('rejects writing through a symlink pointing outside the workspace', async () => {
      const symlinkWrite = path.join(workspaceDir, 'symlink-write.txt');
      try {
        fs.symlinkSync(outsideSecretFile, symlinkWrite, 'file');
      } catch (err: any) {
        if (err.code === 'EPERM') return;
      }

      const localWs = new LocalFileSystemWorkspaceService(workspaceDir);
      await expect(
        localWs.writeFile('symlink-write.txt', 'OVERWRITTEN_CONTENT')
      ).rejects.toThrow(/Path containment violation/);

      // Verify outside secret file was NOT modified
      const secretContent = fs.readFileSync(outsideSecretFile, 'utf8');
      expect(secretContent).toBe('DATABASE_PASSWORD=ultra_confidential_123');
    });

    it('confines operations when a symlink is created after workspace initialization', async () => {
      const localWs = new LocalFileSystemWorkspaceService(workspaceDir);
      await localWs.initializeIndex();

      // Later, malicious code creates an external symlink inside workspace
      const laterSymlink = path.join(workspaceDir, 'later-symlink.txt');
      try {
        fs.symlinkSync(outsideSecretFile, laterSymlink, 'file');
      } catch (err: any) {
        if (err.code === 'EPERM') return;
      }

      await expect(localWs.readFile('later-symlink.txt')).rejects.toThrow(/Path containment violation/);
    });

    it('filters out escaping symlinks during listFiles', async () => {
      const symlinkDir = path.join(workspaceDir, 'escaping-folder');
      try {
        fs.symlinkSync(outsideDir, symlinkDir, 'junction');
      } catch (err: any) {
        if (err.code === 'EPERM') return;
      }

      const localWs = new LocalFileSystemWorkspaceService(workspaceDir);
      const files = await localWs.listFiles();
      const escaping = files.some((f) => f.path.includes('super-secret.env'));
      expect(escaping).toBe(false);
    });
  });

  describe('3. Desktop Workspace Capability Service Invariants', () => {
    it('registers a valid local directory and issues an unforgeable capability token', () => {
      const cap = defaultDesktopWorkspaceCapabilityService.registerCapability({
        userId: 'user_alice',
        projectId: 'proj_123',
        workspaceRoot: workspaceDir,
      });

      expect(cap.capabilityToken).toMatch(/^fcap_[a-f0-9]{64}_[a-f0-9]{64}$/);
      expect(cap.userId).toBe('user_alice');
      expect(cap.projectId).toBe('proj_123');
      expect(cap.canonicalRoot).toBe(fs.realpathSync(workspaceDir));

      // Verifying succeeds with matching owner and project
      const result = defaultDesktopWorkspaceCapabilityService.verifyCapability(
        cap.capabilityToken,
        'user_alice',
        'proj_123'
      );
      expect(result.valid).toBe(true);
      expect(result.canonicalRoot).toBe(fs.realpathSync(workspaceDir));
    });

    it('rejects registration of system root directories (C:\\, Windows, /etc, cwd, etc.)', () => {
      expect(() => {
        defaultDesktopWorkspaceCapabilityService.registerCapability({
          userId: 'user_alice',
          projectId: 'proj_123',
          workspaceRoot: process.platform === 'win32' ? 'C:\\Windows' : '/etc',
        });
      }).toThrow(/Registration of system directory or server root as workspace is forbidden/);

      expect(() => {
        defaultDesktopWorkspaceCapabilityService.registerCapability({
          userId: 'user_alice',
          projectId: 'proj_123',
          workspaceRoot: process.cwd(),
        });
      }).toThrow(/Registration of system directory or server root as workspace is forbidden/);
    });

    it('rejects verification if userId does not match (cross-tenant capability theft)', () => {
      const cap = defaultDesktopWorkspaceCapabilityService.registerCapability({
        userId: 'user_alice',
        projectId: 'proj_123',
        workspaceRoot: workspaceDir,
      });

      const result = defaultDesktopWorkspaceCapabilityService.verifyCapability(
        cap.capabilityToken,
        'user_mallory', // Impersonator
        'proj_123'
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED_CAPABILITY_USER');
    });

    it('rejects verification if projectId does not match (cross-project capability reuse)', () => {
      const cap = defaultDesktopWorkspaceCapabilityService.registerCapability({
        userId: 'user_alice',
        projectId: 'proj_123',
        workspaceRoot: workspaceDir,
      });

      const result = defaultDesktopWorkspaceCapabilityService.verifyCapability(
        cap.capabilityToken,
        'user_alice',
        'proj_456' // Wrong project
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED_CAPABILITY_PROJECT');
    });

    it('rejects forged or non-existent capability tokens', () => {
      const result = defaultDesktopWorkspaceCapabilityService.verifyCapability(
        'fcap_fake_token_1234567890',
        'user_alice',
        'proj_123'
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_CAPABILITY_TOKEN');
    });

    it('rejects expired capability tokens', async () => {
      const cap = defaultDesktopWorkspaceCapabilityService.registerCapability({
        userId: 'user_alice',
        projectId: 'proj_123',
        workspaceRoot: workspaceDir,
        ttlMs: 50, // 50ms TTL
      });

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 60));

      const result = defaultDesktopWorkspaceCapabilityService.verifyCapability(
        cap.capabilityToken,
        'user_alice',
        'proj_123'
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED_CAPABILITY_TOKEN');
    });
  });
});
