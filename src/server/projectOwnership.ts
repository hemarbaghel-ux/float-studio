import { Response, NextFunction } from 'express';
import {
  adminDb,
  hasAdminCredentials,
  isPermissionDeniedError,
  markAdminCredentialsUnavailable
} from './adminFirebase';

export interface ProjectOwnershipResult {
  allowed: boolean;
  status: number;
  error?: string;
  /**
   * True only when the project exists in durable Firestore storage and is owned by `userId`.
   */
  persisted?: boolean;
  /**
   * True when `allowMissing: true` permitted an unsaved/ephemeral local workspace that does not
   * exist in Firestore. Ephemeral workspaces never grant access to persisted project resources.
   */
  isEphemeral?: boolean;
  /**
   * The canonical workspace identifier to use for in-memory scoping.
   * For persisted projects, this equals `projectId`.
   * For ephemeral `'default-project'`, this is isolated per user (`ephemeral-${userId}-default-project`).
   */
  effectiveProjectId?: string;
  projectData?: Record<string, any>;
}

export interface VerifyProjectOwnershipOptions {
  /**
   * Explicit Unsaved-Workspace Policy:
   * - `false` (DEFAULT): Requires a persisted project in Firestore owned by `userId`.
   *   Used for all `/api/projects/:projectId/*` routes (executions, proposals, code search,
   *   validation, git, rules, reviews, diagnostics, automations, memories) and project-scoped
   *   skills/MCP configurations. Missing projects return 404.
   * - `true`: Supports an unsaved/ephemeral local workspace ONLY on `/api/ai/chat`, `/api/ai/agent`,
   *   and `/api/ai/plan`. Always checks Firestore first so a persisted project with that ID owned
   *   by another user is rejected with 403. If unpersisted in Firestore, isolates the ephemeral
   *   workspace per user so it cannot access or collide with another user's resources.
   */
  allowMissing?: boolean;
  notFoundMessage?: string;
}

type ProjectLookupFn = (projectId: string) => Promise<{ exists: boolean; data?: Record<string, any> }>;

let customProjectLookupForTests: ProjectLookupFn | null = null;
const ephemeralWorkspaceOwners = new Map<string, string>();

/**
 * Test-only hook to inject a deterministic mock Firestore project reader.
 * Pass `null` to restore default `adminDb` behavior.
 */
export function setProjectLookupForTests(lookupFn: ProjectLookupFn | null): void {
  customProjectLookupForTests = lookupFn;
  ephemeralWorkspaceOwners.clear();
}

export function resetEphemeralWorkspacesForTests(): void {
  ephemeralWorkspaceOwners.clear();
}

const VALID_PROJECT_ID_REGEX = /^[a-zA-Z0-9_\-.]{1,128}$/;

export function isValidProjectId(projectId: unknown): projectId is string {
  return (
    typeof projectId === 'string' &&
    VALID_PROJECT_ID_REGEX.test(projectId.trim()) &&
    !projectId.includes('..')
  );
}

/**
 * Verifies server-side project ownership using trusted Firebase Admin (`adminDb`).
 * - Never uses the unauthenticated client Firebase Web SDK on the server.
 * - Never bypasses Firestore lookup for `'default-project'`: if a persisted project with ID
 *   `'default-project'` exists and belongs to another user, returns 403 Forbidden.
 * - Fails closed (503) when Firebase Admin credentials are missing or Firestore is unreachable.
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  options: VerifyProjectOwnershipOptions = {}
): Promise<ProjectOwnershipResult> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return {
      allowed: false,
      status: 401,
      error: 'Authentication is required.'
    };
  }

  if (!isValidProjectId(projectId)) {
    return {
      allowed: false,
      status: 400,
      error: 'A valid projectId is required.'
    };
  }

  const sanitizedId = projectId.trim();
  const normalizedUserId = userId.trim();

  // Fail closed when required server-side Firebase Admin configuration is missing
  if (!customProjectLookupForTests && !hasAdminCredentials()) {
    return {
      allowed: false,
      status: 503,
      error: 'Project ownership verification is unavailable because Firebase Admin credentials are not configured.'
    };
  }

  try {
    let exists = false;
    let data: Record<string, any> | undefined;

    if (customProjectLookupForTests) {
      const res = await customProjectLookupForTests(sanitizedId);
      exists = res.exists;
      data = res.data;
    } else {
      const snap = await adminDb.collection('projects').doc(sanitizedId).get();
      exists = snap.exists;
      data = snap.exists ? (snap.data() || {}) : undefined;
    }

    if (!exists) {
      if (options.allowMissing) {
        // Explicit ephemeral local workspace mode:
        // 1. If the caller passed the generic placeholder 'default-project', namespace it per user
        //    so two users in unsaved 'default-project' mode never share state.
        if (sanitizedId === 'default-project') {
          return {
            allowed: true,
            status: 200,
            persisted: false,
            isEphemeral: true,
            effectiveProjectId: `ephemeral-${normalizedUserId}-default-project`
          };
        }

        // 2. For a client-generated unsaved project ID, bind it to the first user who claims it in memory
        //    so another user cannot pass that unsaved ID to access in-memory session state.
        const existingEphemeralOwner = ephemeralWorkspaceOwners.get(sanitizedId);
        if (existingEphemeralOwner && existingEphemeralOwner !== normalizedUserId) {
          return {
            allowed: false,
            status: 403,
            error: 'Unauthorized: You do not own this project workspace.',
            persisted: false,
            isEphemeral: true
          };
        }
        ephemeralWorkspaceOwners.set(sanitizedId, normalizedUserId);

        return {
          allowed: true,
          status: 200,
          persisted: false,
          isEphemeral: true,
          effectiveProjectId: sanitizedId
        };
      }

      return {
        allowed: false,
        status: 404,
        error: options.notFoundMessage || 'Project workspace not found.',
        persisted: false,
        isEphemeral: false
      };
    }

    const ownerId = data?.ownerId;
    if (!ownerId || typeof ownerId !== 'string' || ownerId !== normalizedUserId) {
      return {
        allowed: false,
        status: 403,
        error: 'Unauthorized: You do not own this project workspace.',
        persisted: true,
        isEphemeral: false
      };
    }

    return {
      allowed: true,
      status: 200,
      persisted: true,
      isEphemeral: false,
      effectiveProjectId: sanitizedId,
      projectData: data
    };
  } catch (error: any) {
    if (isPermissionDeniedError(error)) {
      markAdminCredentialsUnavailable(error);
    }
    return {
      allowed: false,
      status: 503,
      error: 'Could not verify project ownership. Retry when project storage is available.'
    };
  }
}

/**
 * Express middleware that enforces project ownership on routes with `:projectId`.
 */
export function requireProjectOwnership(options: VerifyProjectOwnershipOptions = {}) {
  return async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const projectId = req.params?.projectId || req.body?.projectId;
    const check = await verifyProjectOwnership(projectId, userId, options);
    if (!check.allowed) {
      return res.status(check.status).json({ error: check.error });
    }
    req.projectData = check.projectData;
    req.projectOwnership = check;
    return next();
  };
}
