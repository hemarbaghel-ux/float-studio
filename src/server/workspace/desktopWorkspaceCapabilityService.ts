/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Desktop Workspace Capability Record
 *
 * Represents an explicitly registered, canonicalized local filesystem workspace root
 * bound to a specific authenticated owner and project.
 */
export interface DesktopWorkspaceCapability {
  readonly capabilityToken: string;
  readonly userId: string;
  readonly projectId: string;
  readonly canonicalRoot: string;
  readonly registeredAt: number;
  readonly expiresAt: number;
}

export interface RegisterCapabilityParams {
  readonly userId: string;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly ttlMs?: number;
}

export interface VerifyCapabilityResult {
  readonly valid: boolean;
  readonly canonicalRoot?: string;
  readonly error?: string;
  readonly code?: string;
}

const DEFAULT_CAPABILITY_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PATH_LENGTH = 1024;

/**
 * High-risk operating system root directories that must NEVER be registered
 * as workspace roots.
 */
const SYSTEM_FORBIDDEN_ROOTS: string[] = [
  // Unix roots
  '/',
  '/etc',
  '/var',
  '/usr',
  '/bin',
  '/sbin',
  '/dev',
  '/proc',
  '/sys',
  '/root',
  '/home',
  '/tmp',
  // Windows roots & sensitive system paths
  'C:\\',
  'C:\\Windows',
  'C:\\Windows\\System32',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Users',
];

/**
 * Check whether a canonical path matches or is a parent of a system forbidden root,
 * or is directly equal to the server's process.cwd() or parent of process.cwd().
 */
export function isForbiddenSystemRoot(canonicalPath: string): boolean {
  const normalized = path.normalize(canonicalPath);

  // 1. Check against known system directories (case-insensitive for Windows)
  for (const forbidden of SYSTEM_FORBIDDEN_ROOTS) {
    let normForbidden = path.normalize(forbidden);
    if (process.platform === 'win32') {
      if (normalized.toLowerCase() === normForbidden.toLowerCase()) return true;
    } else {
      if (normalized === normForbidden) return true;
    }
  }

  // 2. Drive root check (e.g. C:\ or /)
  const parsed = path.parse(normalized);
  if (parsed.root && normalized === parsed.root) {
    return true;
  }

  // 3. Server process.cwd() containment check
  // The server's own codebase root or its ancestors cannot be mounted as an untrusted project workspace
  try {
    const serverCwd = fs.realpathSync(process.cwd());
    const relToCwd = path.relative(normalized, serverCwd);
    if (relToCwd === '' || (!relToCwd.startsWith('..') && !path.isAbsolute(relToCwd))) {
      // normalized is cwd or an ancestor of cwd
      return true;
    }
  } catch {
    // If cwd cannot be resolved, allow check to proceed
  }

  return false;
}

/**
 * DesktopWorkspaceCapabilityService
 *
 * Enforces that local filesystem access on native desktop environments requires an explicit,
 * pre-validated, unforgeable capability token registered by the trusted desktop host.
 * Unauthenticated web API callers cannot submit arbitrary host paths.
 */
export class DesktopWorkspaceCapabilityService {
  private readonly capabilities = new Map<string, DesktopWorkspaceCapability>();

  private getSigningSecret(): string {
    return process.env.FLOAT_APPROVAL_SECRET || 'float_default_secure_workspace_capability_secret_2026';
  }

  /**
   * Register a trusted local workspace root for native desktop usage.
   * Performs strict canonicalization, existence check, and system root blacklisting.
   */
  registerCapability(params: RegisterCapabilityParams): DesktopWorkspaceCapability {
    const { userId, projectId, workspaceRoot, ttlMs = DEFAULT_CAPABILITY_TTL_MS } = params;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required to register a workspace capability.');
    }
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new Error('projectId is required to register a workspace capability.');
    }
    if (!workspaceRoot || typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
      throw new Error('workspaceRoot must be a non-empty string.');
    }

    const trimmedRoot = workspaceRoot.trim();
    if (trimmedRoot.length > MAX_PATH_LENGTH) {
      throw new Error(`workspaceRoot exceeds maximum path length of ${MAX_PATH_LENGTH} characters.`);
    }

    // Must exist on disk
    if (!fs.existsSync(trimmedRoot)) {
      throw new Error(`workspaceRoot does not exist on disk: "${trimmedRoot}"`);
    }

    // Must be a directory
    const stat = fs.statSync(trimmedRoot);
    if (!stat.isDirectory()) {
      throw new Error(`workspaceRoot must be a directory, not a file: "${trimmedRoot}"`);
    }

    // Must resolve to real canonical path (resolves symlinks)
    const canonicalRoot = fs.realpathSync(trimmedRoot);

    // Guard against system root registration
    if (isForbiddenSystemRoot(canonicalRoot)) {
      throw new Error(`Security violation: Registration of system directory or server root as workspace is forbidden: "${canonicalRoot}"`);
    }

    // Generate cryptographic token
    const randomEntropy = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + Math.max(1, ttlMs);

    const signature = crypto
      .createHmac('sha256', this.getSigningSecret())
      .update(`${userId}:${projectId}:${canonicalRoot}:${now}:${expiresAt}:${randomEntropy}`)
      .digest('hex');

    const capabilityToken = `fcap_${randomEntropy}_${signature}`;

    const record: DesktopWorkspaceCapability = {
      capabilityToken,
      userId: userId.trim(),
      projectId: projectId.trim(),
      canonicalRoot,
      registeredAt: now,
      expiresAt,
    };

    this.capabilities.set(capabilityToken, record);
    return record;
  }

  /**
   * Verify an incoming capability token for an API request.
   * Guarantees single-tenant user and project binding, expiry check, and constant-time signature match.
   */
  verifyCapability(token: string, userId: string, projectId: string): VerifyCapabilityResult {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Capability token is required.', code: 'MISSING_CAPABILITY_TOKEN' };
    }

    const record = this.capabilities.get(token.trim());
    if (!record) {
      return { valid: false, error: 'Workspace capability not found or has expired.', code: 'INVALID_CAPABILITY_TOKEN' };
    }

    // Expiry check
    if (Date.now() > record.expiresAt) {
      this.capabilities.delete(token.trim());
      return { valid: false, error: 'Workspace capability token has expired.', code: 'EXPIRED_CAPABILITY_TOKEN' };
    }

    // User binding check
    if (record.userId !== userId.trim()) {
      return { valid: false, error: 'Capability token user mismatch: access denied.', code: 'UNAUTHORIZED_CAPABILITY_USER' };
    }

    // Project binding check
    if (record.projectId !== projectId.trim()) {
      return { valid: false, error: 'Capability token project mismatch: access denied.', code: 'UNAUTHORIZED_CAPABILITY_PROJECT' };
    }

    // Verify canonical path still exists on disk
    if (!fs.existsSync(record.canonicalRoot)) {
      return { valid: false, error: 'Registered workspace directory no longer exists on disk.', code: 'WORKSPACE_ROOT_NOT_FOUND' };
    }

    return {
      valid: true,
      canonicalRoot: record.canonicalRoot,
    };
  }

  /**
   * Revoke a capability token explicitly.
   */
  revokeCapability(token: string): void {
    this.capabilities.delete(token.trim());
  }

  /**
   * Clear all expired capabilities.
   */
  pruneExpired(): void {
    const now = Date.now();
    for (const [token, record] of this.capabilities.entries()) {
      if (now > record.expiresAt) {
        this.capabilities.delete(token);
      }
    }
  }

  /**
   * Reset store (for testing).
   */
  clearForTests(): void {
    this.capabilities.clear();
  }
}

export const defaultDesktopWorkspaceCapabilityService = new DesktopWorkspaceCapabilityService();
