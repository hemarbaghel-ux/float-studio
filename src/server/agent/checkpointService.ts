import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { adminDb, isPermissionDeniedError, markAdminCredentialsUnavailable } from '../adminFirebase';
import {
  isDurableFirestoreActive,
  saveLargePayloadDurable,
  loadLargePayloadDurable,
  deleteLargePayloadDurable,
  LargePayloadManifest
} from '../durableState';

export const SERVER_CHECKPOINTS_COLLECTION = 'server_checkpoints';
const DEFAULT_CHECKPOINT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface CheckpointFileEntry {
  id?: string;
  path: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
}

export interface WorkspaceCheckpointMetadata {
  id: string;
  ownerId: string;
  projectId: string;
  label?: string;
  messageId?: string;
  conversationId?: string;
  promptExcerpt: string;
  fileCount: number;
  totalBytes: number;
  sha256: string;
  storageMode?: 'inline' | 'gcs' | 'firestore_chunks';
  createdAt: number;
  expiresAtMs: number;
}

export interface WorkspaceCheckpoint extends WorkspaceCheckpointMetadata {
  files: CheckpointFileEntry[];
}

interface StoredCheckpointRecord extends WorkspaceCheckpointMetadata {
  payloadMeta?: LargePayloadManifest;
  files?: CheckpointFileEntry[];
}

export class CheckpointService {
  private static fallbackStore = new Map<string, StoredCheckpointRecord>();

  static clearCacheForTests(): void {
    this.fallbackStore.clear();
  }

  static normalizeFiles(rawFiles: any[]): CheckpointFileEntry[] {
    if (!Array.isArray(rawFiles)) return [];
    const normalized: CheckpointFileEntry[] = [];
    for (const f of rawFiles) {
      if (!f || typeof f !== 'object') continue;
      const rawPath = typeof f.path === 'string' && f.path.trim() ? f.path.trim() : typeof f.name === 'string' ? f.name.trim() : '';
      if (!rawPath) continue;
      const safePath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!safePath || safePath.split('/').some((seg: string) => seg === '..') || safePath.includes('\0')) continue;
      normalized.push({
        id: typeof f.id === 'string' ? f.id : `file-${safePath.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        path: safePath,
        name: typeof f.name === 'string' && f.name.trim() ? f.name.trim() : safePath.split('/').pop() || safePath,
        type: f.type === 'folder' ? 'folder' : 'file',
        content: typeof f.content === 'string' ? f.content : ''
      });
    }
    return normalized;
  }

  static async createCheckpoint(input: {
    ownerId: string;
    projectId: string;
    files: any[];
    label?: string;
    prompt?: string;
    messageId?: string;
    conversationId?: string;
    checkpointId?: string;
  }): Promise<WorkspaceCheckpointMetadata> {
    const id = input.checkpointId || `cp_${uuidv4()}`;
    const files = this.normalizeFiles(input.files);
    const serialized = JSON.stringify(files);
    const totalBytes = Buffer.byteLength(serialized, 'utf8');
    const sha256 = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
    const now = Date.now();
    const expiresAtMs = now + DEFAULT_CHECKPOINT_TTL_MS;
    const promptExcerpt = String(input.prompt || input.label || 'Workspace snapshot before agent run').slice(0, 180);

    const baseMeta: WorkspaceCheckpointMetadata = {
      id,
      ownerId: input.ownerId,
      projectId: input.projectId,
      ...(input.label ? { label: input.label } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      promptExcerpt,
      fileCount: files.length,
      totalBytes,
      sha256,
      storageMode: totalBytes > 900 * 1024 ? (process.env.GOOGLE_CLOUD_STORAGE_BUCKET ? 'gcs' : 'firestore_chunks') : 'inline',
      createdAt: now,
      expiresAtMs
    };

    // Always store in local fallback map so tests & non-ADC environments work seamlessly
    this.fallbackStore.set(id, {
      ...baseMeta,
      files
    });

    if (isDurableFirestoreActive()) {
      try {
        const manifest = await saveLargePayloadDurable({
          collectionName: SERVER_CHECKPOINTS_COLLECTION,
          docId: id,
          ownerId: input.ownerId,
          projectId: input.projectId,
          payload: files,
          extraFields: {
            ...baseMeta
          },
          ttlMs: DEFAULT_CHECKPOINT_TTL_MS
        });
        baseMeta.storageMode = manifest.storageBackend;
      } catch (err: any) {
        if (isPermissionDeniedError(err)) {
          markAdminCredentialsUnavailable(err);
        } else {
          throw err;
        }
      }
    }

    return baseMeta;
  }

  static async getCheckpoint(
    checkpointId: string,
    ownerId: string,
    projectId?: string
  ): Promise<WorkspaceCheckpoint | null> {
    if (!checkpointId || !ownerId) return null;

    if (isDurableFirestoreActive()) {
      try {
        const docSnap = await adminDb.collection(SERVER_CHECKPOINTS_COLLECTION).doc(checkpointId).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          if (data.ownerId !== ownerId) return null;
          if (projectId && data.projectId !== projectId) return null;

          const loaded = await loadLargePayloadDurable<CheckpointFileEntry[]>({
            collectionName: SERVER_CHECKPOINTS_COLLECTION,
            docId: checkpointId,
            ownerId
          });
          if (loaded?.payload) {
            return {
              id: data.id || checkpointId,
              ownerId: data.ownerId,
              projectId: data.projectId,
              label: data.label,
              messageId: data.messageId,
              conversationId: data.conversationId,
              promptExcerpt: data.promptExcerpt || '',
              fileCount: typeof data.fileCount === 'number' ? data.fileCount : loaded.payload.length,
              totalBytes: typeof data.totalBytes === 'number' ? data.totalBytes : 0,
              sha256: data.sha256 || '',
              storageMode: loaded.manifest.storageBackend || data.storageMode || 'inline',
              createdAt: data.createdAt || Date.now(),
              expiresAtMs: data.expiresAtMs || Date.now() + DEFAULT_CHECKPOINT_TTL_MS,
              files: loaded.payload
            };
          }
        }
      } catch (err: any) {
        if (isPermissionDeniedError(err)) {
          markAdminCredentialsUnavailable(err);
        }
      }
    }

    const fallback = this.fallbackStore.get(checkpointId);
    if (!fallback) return null;
    if (fallback.ownerId !== ownerId) return null;
    if (projectId && fallback.projectId !== projectId) return null;

    return {
      ...fallback,
      files: (fallback.files || []).map((f) => ({ ...f }))
    };
  }

  static async listCheckpoints(projectId: string, ownerId: string): Promise<WorkspaceCheckpointMetadata[]> {
    if (!projectId || !ownerId) return [];

    if (isDurableFirestoreActive()) {
      try {
        const snap = await adminDb
          .collection(SERVER_CHECKPOINTS_COLLECTION)
          .where('projectId', '==', projectId)
          .where('ownerId', '==', ownerId)
          .limit(50)
          .get();
        const items: WorkspaceCheckpointMetadata[] = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: d.id || doc.id,
            ownerId: d.ownerId,
            projectId: d.projectId,
            label: d.label,
            messageId: d.messageId,
            conversationId: d.conversationId,
            promptExcerpt: d.promptExcerpt || '',
            fileCount: d.fileCount || 0,
            totalBytes: d.totalBytes || 0,
            sha256: d.sha256 || '',
            storageMode: d.storageBackend || d.storageMode || 'inline',
            createdAt: d.createdAt || 0,
            expiresAtMs: d.expiresAtMs || 0
          };
        });
        if (items.length > 0) {
          return items.sort((a, b) => b.createdAt - a.createdAt);
        }
      } catch (err: any) {
        if (isPermissionDeniedError(err)) {
          markAdminCredentialsUnavailable(err);
        }
      }
    }

    const list: WorkspaceCheckpointMetadata[] = [];
    for (const item of this.fallbackStore.values()) {
      if (item.projectId === projectId && item.ownerId === ownerId) {
        const { files: _files, payloadMeta: _pm, ...meta } = item;
        list.push(meta);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  static async restoreCheckpoint(
    checkpointId: string,
    ownerId: string,
    projectId?: string
  ): Promise<{ success: boolean; checkpoint?: WorkspaceCheckpoint; error?: string }> {
    const checkpoint = await this.getCheckpoint(checkpointId, ownerId, projectId);
    if (!checkpoint) {
      return {
        success: false,
        error: 'Checkpoint not found or access denied.'
      };
    }

    // Verify integrity of snapshot
    const serialized = JSON.stringify(checkpoint.files);
    const computedHash = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
    if (checkpoint.sha256 && computedHash !== checkpoint.sha256) {
      return {
        success: false,
        error: 'Checkpoint integrity check failed (SHA-256 mismatch).'
      };
    }

    // Also update persisted project document in Firestore if it exists and belongs to ownerId
    if (isDurableFirestoreActive() && checkpoint.projectId && !checkpoint.projectId.startsWith('ephemeral-')) {
      try {
        const projRef = adminDb.collection('projects').doc(checkpoint.projectId);
        const projSnap = await projRef.get();
        if (projSnap.exists && projSnap.data()?.ownerId === ownerId) {
          await projRef.update({
            files: JSON.stringify(checkpoint.files),
            updatedAt: new Date()
          });
        }
      } catch (err: any) {
        if (isPermissionDeniedError(err)) {
          markAdminCredentialsUnavailable(err);
        }
      }
    }

    return {
      success: true,
      checkpoint
    };
  }

  static async deleteCheckpoint(checkpointId: string, ownerId: string): Promise<boolean> {
    const existing = this.fallbackStore.get(checkpointId);
    if (existing && existing.ownerId !== ownerId) return false;
    this.fallbackStore.delete(checkpointId);
    if (isDurableFirestoreActive()) {
      await deleteLargePayloadDurable({
        collectionName: SERVER_CHECKPOINTS_COLLECTION,
        docId: checkpointId,
        ownerId
      }).catch(() => {});
    }
    return true;
  }
}
