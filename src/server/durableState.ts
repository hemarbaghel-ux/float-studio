import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { adminApp, adminDb, hasAdminCredentials, isPermissionDeniedError, markAdminCredentialsUnavailable } from './adminFirebase';

export const LARGE_PAYLOAD_THRESHOLD_BYTES = 900 * 1024; // ~900 KB
export const FIRESTORE_CHUNK_MAX_BYTES = 750 * 1024; // < 800 KB per Firestore chunk doc
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days default TTL

export interface LargePayloadManifest {
  id: string;
  ownerId: string;
  projectId: string;
  storageBackend: 'inline' | 'gcs' | 'firestore_chunks';
  byteLength: number;
  sha256: string;
  chunkCount?: number;
  gcsBucket?: string;
  gcsObjectPath?: string;
  payload?: unknown;
  createdAt: number;
  updatedAt: number;
  expiresAt: Date;
  expiresAtMs: number;
}

export interface GcsAdapter {
  uploadObject(bucket: string, objectPath: string, data: Buffer, contentType: string): Promise<void>;
  downloadObject(bucket: string, objectPath: string): Promise<Buffer | null>;
  deleteObject(bucket: string, objectPath: string): Promise<void>;
}

const defaultGcsAdapter: GcsAdapter = {
  async uploadObject(bucket: string, objectPath: string, data: Buffer, contentType: string): Promise<void> {
    const file = getStorage(adminApp).bucket(bucket).file(objectPath);
    await file.save(data, { contentType, resumable: false });
  },
  async downloadObject(bucket: string, objectPath: string): Promise<Buffer | null> {
    const file = getStorage(adminApp).bucket(bucket).file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [contents] = await file.download();
    return contents;
  },
  async deleteObject(bucket: string, objectPath: string): Promise<void> {
    const file = getStorage(adminApp).bucket(bucket).file(objectPath);
    await file.delete({ ignoreNotFound: true });
  }
};

let customGcsAdapter: GcsAdapter | null = null;
let customFirestoreDb: any = null;

export class FirestoreNotConfiguredError extends Error {
  statusCode = 503;
  code = 'NOT_CONFIGURED' as const;
  constructor(message = 'Firestore Admin credentials are not configured in production (FIREBASE_SERVICE_ACCOUNT_JSON missing).') {
    super(message);
    this.name = 'FirestoreNotConfiguredError';
  }
}

export function setCustomGcsAdapterForTests(adapter: GcsAdapter | null): void {
  customGcsAdapter = adapter;
}

export function setCustomFirestoreDbForTests(db: any | null): void {
  customFirestoreDb = db;
}

function hasActiveDb(): boolean {
  return Boolean(customFirestoreDb || hasAdminCredentials());
}

function getActiveDb(): any | null {
  if (customFirestoreDb) return customFirestoreDb;
  if (hasAdminCredentials()) return adminDb;
  if (process.env.NODE_ENV === 'production') {
    throw new FirestoreNotConfiguredError();
  }
  return null;
}

export function assertProductionFirestoreConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !hasActiveDb()) {
    throw new FirestoreNotConfiguredError();
  }
}

function getActiveGcsAdapter(): GcsAdapter {
  return customGcsAdapter || defaultGcsAdapter;
}

function getConfiguredGcsBucket(): string | null {
  const bucket = (process.env.GOOGLE_CLOUD_STORAGE_BUCKET || '').trim();
  return bucket.length > 0 ? bucket : null;
}

export function computePayloadSha256(serialized: string): string {
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

export function splitUtf8IntoChunks(serialized: string, maxChunkBytes = FIRESTORE_CHUNK_MAX_BYTES): string[] {
  const chunks: string[] = [];
  const buf = Buffer.from(serialized, 'utf8');
  let offset = 0;

  while (offset < buf.length) {
    let end = Math.min(offset + maxChunkBytes, buf.length);
    // Avoid splitting multi-byte UTF-8 continuation bytes (10xxxxxx = 0x80..0xBF)
    while (end < buf.length && (buf[end] & 0xc0) === 0x80 && end > offset) {
      end--;
    }
    if (end === offset) {
      end = Math.min(offset + maxChunkBytes, buf.length);
    }
    chunks.push(buf.subarray(offset, end).toString('utf8'));
    offset = end;
  }

  return chunks;
}

/**
 * Saves an arbitrary JSON-serializable payload (such as a workspace snapshot, proposal, or checkpoint)
 * into a Firestore collection with TTL metadata (`expiresAt`).
 * - Payloads <= 900 KB are stored inline in the Firestore document.
 * - Payloads > 900 KB are stored in Google Cloud Storage when GOOGLE_CLOUD_STORAGE_BUCKET is configured,
 *   or split into < 750 KB documents inside a `chunks` subcollection in Firestore.
 */
export async function saveLargePayloadDurable(options: {
  collectionName: string;
  docId: string;
  ownerId: string;
  projectId: string;
  payload: unknown;
  extraFields?: Record<string, unknown>;
  ttlMs?: number;
  thresholdBytes?: number;
}): Promise<LargePayloadManifest> {
  const {
    collectionName,
    docId,
    ownerId,
    projectId,
    payload,
    extraFields = {},
    ttlMs = DEFAULT_TTL_MS,
    thresholdBytes = LARGE_PAYLOAD_THRESHOLD_BYTES
  } = options;

  const serialized = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  const sha256 = computePayloadSha256(serialized);
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  const expiresAt = new Date(expiresAtMs);

  const db = getActiveDb();
  const gcsBucket = getConfiguredGcsBucket();

  if (byteLength <= thresholdBytes) {
    const manifest: LargePayloadManifest = {
      id: docId,
      ownerId,
      projectId,
      storageBackend: 'inline',
      byteLength,
      sha256,
      payload: JSON.parse(serialized),
      createdAt: now,
      updatedAt: now,
      expiresAt,
      expiresAtMs
    };

    if (db) {
      await db.collection(collectionName).doc(docId).set({
        ...extraFields,
        ...manifest
      });
    }
    return manifest;
  }

  // Payload exceeds ~900 KB threshold
  if (gcsBucket) {
    const gcsObjectPath = `${collectionName}/${ownerId}/${projectId}/${docId}.json`;
    const gcs = getActiveGcsAdapter();
    await gcs.uploadObject(gcsBucket, gcsObjectPath, Buffer.from(serialized, 'utf8'), 'application/json');

    const manifest: LargePayloadManifest = {
      id: docId,
      ownerId,
      projectId,
      storageBackend: 'gcs',
      byteLength,
      sha256,
      gcsBucket,
      gcsObjectPath,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      expiresAtMs
    };

    if (db) {
      await db.collection(collectionName).doc(docId).set({
        ...extraFields,
        ...manifest
      });
    }
    return manifest;
  }

  // Fallback when GCS is not configured: chunked Firestore subcollections (`chunks/{index}`)
  const chunks = splitUtf8IntoChunks(serialized, FIRESTORE_CHUNK_MAX_BYTES);
  const manifest: LargePayloadManifest = {
    id: docId,
    ownerId,
    projectId,
    storageBackend: 'firestore_chunks',
    byteLength,
    sha256,
    chunkCount: chunks.length,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    expiresAtMs
  };

  if (db) {
    const docRef = db.collection(collectionName).doc(docId);
    await docRef.set({
      ...extraFields,
      ...manifest
    });
    const chunksCol = docRef.collection('chunks');
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = String(i).padStart(5, '0');
      await chunksCol.doc(chunkId).set({
        index: i,
        ownerId,
        projectId,
        data: chunks[i],
        byteLength: Buffer.byteLength(chunks[i], 'utf8'),
        createdAt: now,
        expiresAt,
        expiresAtMs
      });
    }
  }

  return manifest;
}

/**
 * Loads a payload previously stored via `saveLargePayloadDurable`, verifying tenant `ownerId`
 * and seamlessly reassembling from inline, GCS, or Firestore chunked subcollections.
 */
export async function loadLargePayloadDurable<T = unknown>(options: {
  collectionName: string;
  docId: string;
  ownerId: string;
}): Promise<{ payload: T; manifest: LargePayloadManifest } | null> {
  const { collectionName, docId, ownerId } = options;
  const db = getActiveDb();
  if (!db) return null;

  const snap = await db.collection(collectionName).doc(docId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, any>;
  if (!data || data.ownerId !== ownerId) return null;

  // Enforce TTL check on read
  const expiresAtMs = typeof data.expiresAtMs === 'number'
    ? data.expiresAtMs
    : data.expiresAt?.toMillis?.() || (data.expiresAt instanceof Date ? data.expiresAt.getTime() : 0);
  if (expiresAtMs > 0 && Date.now() > expiresAtMs) {
    return null;
  }

  const backend = data.storageBackend || 'inline';
  const manifest: LargePayloadManifest = {
    id: data.id || docId,
    ownerId: data.ownerId,
    projectId: data.projectId || '',
    storageBackend: backend,
    byteLength: Number(data.byteLength || 0),
    sha256: String(data.sha256 || ''),
    chunkCount: typeof data.chunkCount === 'number' ? data.chunkCount : undefined,
    gcsBucket: data.gcsBucket,
    gcsObjectPath: data.gcsObjectPath,
    createdAt: Number(data.createdAt || 0),
    updatedAt: Number(data.updatedAt || 0),
    expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(expiresAtMs || Date.now() + DEFAULT_TTL_MS),
    expiresAtMs: expiresAtMs || Date.now() + DEFAULT_TTL_MS
  };

  if (backend === 'inline') {
    const inlinePayload = (data.payload !== undefined ? data.payload : data.files) as T;
    return { payload: inlinePayload, manifest };
  }

  if (backend === 'gcs') {
    if (!data.gcsBucket || !data.gcsObjectPath) return null;
    const gcs = getActiveGcsAdapter();
    const buffer = await gcs.downloadObject(data.gcsBucket, data.gcsObjectPath);
    if (!buffer) return null;
    const raw = buffer.toString('utf8');
    if (manifest.sha256 && computePayloadSha256(raw) !== manifest.sha256) {
      throw new Error('Integrity check failed when loading workspace payload from Cloud Storage.');
    }
    return { payload: JSON.parse(raw) as T, manifest };
  }

  if (backend === 'firestore_chunks') {
    const chunksSnap = await db.collection(collectionName).doc(docId).collection('chunks').get();
    if (chunksSnap.empty) return null;
    const chunkDocs = chunksSnap.docs
      .map((d: any) => d.data())
      .filter((c: any) => c && c.ownerId === ownerId)
      .sort((a: any, b: any) => Number(a.index) - Number(b.index));

    if (manifest.chunkCount && chunkDocs.length !== manifest.chunkCount) {
      throw new Error(`Incomplete chunked payload in Firestore (expected ${manifest.chunkCount} chunks, found ${chunkDocs.length}).`);
    }

    const combined = chunkDocs.map((c: any) => String(c.data || '')).join('');
    if (manifest.sha256 && computePayloadSha256(combined) !== manifest.sha256) {
      throw new Error('Integrity check failed when reassembling chunked Firestore payload.');
    }
    return { payload: JSON.parse(combined) as T, manifest };
  }

  return null;
}

export async function deleteLargePayloadDurable(options: {
  collectionName: string;
  docId: string;
  ownerId: string;
}): Promise<boolean> {
  const { collectionName, docId, ownerId } = options;
  const db = getActiveDb();
  if (!db) return false;

  const docRef = db.collection(collectionName).doc(docId);
  const snap = await docRef.get();
  if (!snap.exists || snap.get('ownerId') !== ownerId) return false;

  const data = snap.data() || {};
  if (data.storageBackend === 'gcs' && data.gcsBucket && data.gcsObjectPath) {
    await getActiveGcsAdapter().deleteObject(data.gcsBucket, data.gcsObjectPath).catch(() => undefined);
  } else if (data.storageBackend === 'firestore_chunks') {
    const chunksSnap = await docRef.collection('chunks').get();
    for (const chunkDoc of chunksSnap.docs) {
      await chunkDoc.ref.delete().catch(() => undefined);
    }
  }

  await docRef.delete();
  return true;
}

// ============================================================================
// Transactional Rate Limiter with Firestore TTL (`server_rate_limits`)
// ============================================================================

const fallbackRateLimitWindows = new Map<string, { count: number; windowStart: number; expiresAtMs: number }>();

function checkFallbackMemoryRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const current = fallbackRateLimitWindows.get(key);
  if (!current || now - current.windowStart >= windowMs || now > current.expiresAtMs) {
    fallbackRateLimitWindows.set(key, {
      count: 1,
      windowStart: now,
      expiresAtMs: now + windowMs * 2
    });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count += 1;
  return true;
}

export function resetFallbackRateLimitsForTests(): void {
  fallbackRateLimitWindows.clear();
}

/**
 * Checks and increments a rate limit counter transactionally in Firestore (`server_rate_limits`)
 * with automatic TTL (`expiresAt` Timestamp/Date and `expiresAtMs`).
 * Falls back to local memory window only when Admin SDK credentials are not available in preview.
 */
export async function checkTransactionalRateLimit(
  bucket: string,
  userId: string,
  maxRequests = 45,
  windowMs = 60_000
): Promise<boolean> {
  if (!userId || !bucket) return false;
  const safeKey = `${bucket}:${userId}`.replace(/[^a-zA-Z0-9_:\-.]/g, '_');

  const db = getActiveDb();
  if (!db) {
    return checkFallbackMemoryRateLimit(safeKey, maxRequests, windowMs);
  }

  try {
    const docRef = db.collection('server_rate_limits').doc(safeKey);
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(docRef);
      const now = Date.now();
      const expiresAtMs = now + windowMs * 2;
      const expiresAt = new Date(expiresAtMs);

      if (!snap.exists) {
        tx.set(docRef, {
          id: safeKey,
          bucket,
          ownerId: userId,
          count: 1,
          windowStart: now,
          windowMs,
          updatedAt: now,
          expiresAt,
          expiresAtMs
        });
        return true;
      }

      const data = snap.data() || {};
      const windowStart = Number(data.windowStart || 0);
      const existingExpiresMs = Number(data.expiresAtMs || 0);
      const count = Number(data.count || 0);

      if (now - windowStart >= windowMs || (existingExpiresMs > 0 && now > existingExpiresMs)) {
        tx.set(docRef, {
          id: safeKey,
          bucket,
          ownerId: userId,
          count: 1,
          windowStart: now,
          windowMs,
          updatedAt: now,
          expiresAt,
          expiresAtMs
        });
        return true;
      }

      if (count >= maxRequests) {
        return false;
      }

      tx.set(
        docRef,
        {
          count: count + 1,
          updatedAt: now,
          expiresAt,
          expiresAtMs
        },
        { merge: true }
      );
      return true;
    });
  } catch (error: any) {
    if (error instanceof FirestoreNotConfiguredError) {
      throw error;
    }
    if (isPermissionDeniedError(error)) {
      markAdminCredentialsUnavailable(error);
    }
    if (process.env.NODE_ENV === 'production') {
      throw new FirestoreNotConfiguredError();
    }
    return checkFallbackMemoryRateLimit(safeKey, maxRequests, windowMs);
  }
}

// ============================================================================
// Generic Server-Only Firestore Document Helpers (with TTL & Tenant Isolation)
// ============================================================================

export async function saveServerDocDurable<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  ownerId: string,
  data: T,
  ttlMs = DEFAULT_TTL_MS
): Promise<void> {
  const db = getActiveDb();
  if (!db) return;
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  const expiresAt = new Date(expiresAtMs);
  try {
    await db.collection(collectionName).doc(docId).set({
      ... JSON.parse(JSON.stringify(data)),
      ownerId,
      updatedAt: now,
      expiresAt,
      expiresAtMs
    });
  } catch (error: any) {
    if (isPermissionDeniedError(error)) {
      markAdminCredentialsUnavailable(error);
    } else {
      throw error;
    }
  }
}

export async function getServerDocDurable<T = Record<string, any>>(
  collectionName: string,
  docId: string,
  ownerId: string
): Promise<T | null> {
  const db = getActiveDb();
  if (!db) return null;
  try {
    const snap = await db.collection(collectionName).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, any>;
    if (!data || data.ownerId !== ownerId) return null;
    const expiresAtMs = Number(data.expiresAtMs || 0);
    if (expiresAtMs > 0 && Date.now() > expiresAtMs) return null;
    return data as T;
  } catch (error: any) {
    if (isPermissionDeniedError(error)) {
      markAdminCredentialsUnavailable(error);
      return null;
    }
    throw error;
  }
}

export async function listServerDocsDurable<T = Record<string, any>>(
  collectionName: string,
  ownerId: string,
  projectId?: string
): Promise<T[]> {
  const db = getActiveDb();
  if (!db) return [];
  try {
    const snap = await db.collection(collectionName).where('ownerId', '==', ownerId).get();
    const now = Date.now();
    return snap.docs
      .map((d: any) => d.data() as Record<string, any>)
      .filter((data: any) => {
        if (!data || data.ownerId !== ownerId) return false;
        if (projectId && data.projectId && data.projectId !== projectId) return false;
        const expiresAtMs = Number(data.expiresAtMs || 0);
        if (expiresAtMs > 0 && now > expiresAtMs) return false;
        return true;
      }) as T[];
  } catch (error: any) {
    if (isPermissionDeniedError(error)) {
      markAdminCredentialsUnavailable(error);
      return [];
    }
    throw error;
  }
}

export async function deleteServerDocDurable(
  collectionName: string,
  docId: string,
  ownerId: string
): Promise<boolean> {
  const db = getActiveDb();
  if (!db) return false;
  try {
    const ref = db.collection(collectionName).doc(docId);
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('ownerId') !== ownerId) return false;
      tx.delete(ref);
      return true;
    });
  } catch (error: any) {
    if (isPermissionDeniedError(error)) {
      markAdminCredentialsUnavailable(error);
      return false;
    }
    throw error;
  }
}

export function isDurableFirestoreActive(): boolean {
  return hasActiveDb();
}

