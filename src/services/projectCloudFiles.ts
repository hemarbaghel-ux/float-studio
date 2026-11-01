import type { FileNode } from '../types';

// Firestore documents are limited to 1 MiB. Keep each content document below
// 600 KiB so its owner, generation, index, and field overhead also fit safely.
export const MAX_PROJECT_CONTENT_CHUNK_BYTES = 600 * 1024;
export const PROJECT_CONTENT_BATCH_SIZE = 400;
export const PROJECT_CONTENT_STORAGE_VERSION = 2;

export type ProjectFileTreeSerialization =
  | { ok: true; serialized: string; byteLength: number; chunks: string[] }
  | { ok: false; reason: 'unserializable'; byteLength: number };

export interface ProjectContentManifest {
  fileStorageVersion: 2;
  fileGeneration: string;
  fileChunkCount: number;
  fileBytes: number;
  fileSnapshotComplete: boolean;
}

export interface ProjectContentChunk {
  generation: string;
  index: number;
  content: string;
}

export type ProjectCloudSaveResult =
  | { status: 'synced' }
  | { status: 'local-only'; reason: 'no-project' | 'not-authenticated' | 'unserializable'; message: string }
  | { status: 'error'; reason: 'permission-denied' | 'cloud-unavailable' | 'conflict'; message: string };

export function serializeProjectFileTree(files: FileNode[]): ProjectFileTreeSerialization {
  let serialized: string;
  try {
    serialized = JSON.stringify(files);
  } catch {
    return { ok: false, reason: 'unserializable', byteLength: 0 };
  }

  if (typeof serialized !== 'string') {
    return { ok: false, reason: 'unserializable', byteLength: 0 };
  }

  const byteLength = new TextEncoder().encode(serialized).byteLength;
  return { ok: true, serialized, byteLength, chunks: splitUtf8(serialized, MAX_PROJECT_CONTENT_CHUNK_BYTES) };
}

function validateProjectFileTree(value: unknown): FileNode[] {
  if (!Array.isArray(value)) throw new Error('Project file snapshot has an invalid root.');
  const seenIds = new Set<string>();
  const validateNodes = (nodes: unknown[]): FileNode[] => nodes.map((node) => {
    if (!node || typeof node !== 'object') throw new Error('Project file snapshot contains an invalid node.');
    const candidate = node as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !candidate.id || seenIds.has(candidate.id) ||
        typeof candidate.name !== 'string' || !candidate.name ||
        (candidate.type !== 'file' && candidate.type !== 'folder') ||
        (candidate.content !== undefined && typeof candidate.content !== 'string') ||
        (candidate.children !== undefined && !Array.isArray(candidate.children)) ||
        (candidate.type === 'file' && candidate.children !== undefined)) {
      throw new Error('Project file snapshot contains an invalid or duplicate file node.');
    }
    seenIds.add(candidate.id);
    return {
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
      ...(typeof candidate.content === 'string' ? { content: candidate.content } : {}),
      ...(Array.isArray(candidate.children) ? { children: validateNodes(candidate.children) } : {}),
      ...(typeof candidate.isOpen === 'boolean' ? { isOpen: candidate.isOpen } : {})
    } as FileNode;
  });
  return validateNodes(value);
}

function utf8CodePointBytes(character: string): number {
  const codePoint = character.codePointAt(0) || 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function splitUtf8(value: string, maxBytes = MAX_PROJECT_CONTENT_CHUNK_BYTES): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) throw new Error('Chunk limit must be at least 4 bytes.');
  if (!value) return [''];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of value) {
    const characterBytes = utf8CodePointBytes(character);
    if (current && currentBytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function joinProjectFileTreeChunks(
  chunks: ProjectContentChunk[],
  manifest: ProjectContentManifest
): FileNode[] {
  if (manifest.fileStorageVersion !== 2 || !manifest.fileSnapshotComplete ||
      !manifest.fileGeneration || !Number.isInteger(manifest.fileChunkCount) || manifest.fileChunkCount < 1 ||
      !Number.isInteger(manifest.fileBytes) || manifest.fileBytes < 0) {
    throw new Error('Project file snapshot is incomplete or has an invalid manifest.');
  }

  const current = chunks.filter(chunk => chunk.generation === manifest.fileGeneration);
  if (current.length !== manifest.fileChunkCount) {
    throw new Error('Project file snapshot is incomplete. Retry loading after cloud sync finishes.');
  }
  current.sort((left, right) => left.index - right.index);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index].index !== index || new TextEncoder().encode(current[index].content).byteLength > MAX_PROJECT_CONTENT_CHUNK_BYTES) {
      throw new Error('Project file snapshot contains a malformed or oversized content chunk.');
    }
  }

  const serialized = current.map(chunk => chunk.content).join('');
  if (new TextEncoder().encode(serialized).byteLength !== manifest.fileBytes) {
    throw new Error('Project file snapshot failed its integrity check.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Project file snapshot contains invalid JSON.');
  }
  return validateProjectFileTree(parsed);
}

export function parseLegacyProjectFileTree(raw: unknown): FileNode[] {
  if (Array.isArray(raw)) return raw as FileNode[];
  if (typeof raw !== 'string') throw new Error('Project file snapshot is missing.');
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateProjectFileTree(parsed);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Project file snapshot')) throw error;
    throw new Error('Project file snapshot contains invalid JSON.');
  }
}

export function projectCloudSaveErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (code === 'permission-denied') return 'Cloud save was denied. Your local workspace copy is preserved.';
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Cloud storage is temporarily unavailable. Your local workspace copy is preserved.';
  }
  if (code === 'aborted') return 'This workspace changed in another window during save. Your local copy is preserved; save again to publish the latest version.';
  return 'Cloud save failed. Your local workspace copy is preserved.';
}

export function projectCloudSaveFailureReason(error: unknown): 'permission-denied' | 'cloud-unavailable' | 'conflict' {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (code === 'permission-denied') return 'permission-denied';
  if (code === 'aborted') return 'conflict';
  return 'cloud-unavailable';
}
