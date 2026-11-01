import { AIMessage, ChangeSet, FileNode } from '../types';

// Firestore's document limit is 1 MiB. Leave room for document field names and
// metadata, and measure UTF-8 bytes rather than JavaScript UTF-16 characters.
export const MAX_CONVERSATION_MESSAGE_BYTES = 850_000;
export const LEGACY_CONVERSATION_MESSAGE_COUNT = 24;
export const CONVERSATION_MESSAGE_BATCH_SIZE = 450;
export const CONVERSATION_MESSAGE_MANIFEST_ID = '__manifest__';

export interface SerializedConversationMessage {
  id: string;
  index: number;
  message: string;
}

export interface ConversationMessageManifest {
  ownerId: string;
  generation: string;
  count: number;
  complete: boolean;
}

export type ConversationSyncResult =
  | { status: 'synced' }
  | { status: 'local-only'; reason: 'not-authenticated' | 'message-too-large' }
  | { status: 'failed'; reason: 'permission-denied' | 'cloud-unavailable' };

export function conversationSyncStatusLabel(result: ConversationSyncResult): string {
  if (result.status === 'synced') return 'Conversation saved to cloud';
  if (result.status === 'local-only') {
    return result.reason === 'message-too-large'
      ? 'Conversation exceeds the cloud message size limit. A local copy is saved on this device.'
      : 'Signed out. Conversation is saved on this device only.';
  }
  return result.reason === 'permission-denied'
    ? 'Cloud save was denied. A local copy is saved on this device.'
    : 'Cloud save failed. A local copy is saved on this device.';
}

export interface ThreadMessageForCloud {
  id: string;
  role: AIMessage['role'];
  content: string;
  createdAt: number;
  checkpoint?: FileNode[];
  changes?: AIMessage['changes'];
  changeSet?: ChangeSet;
  error?: string;
  cancelled?: boolean;
  latencyMs?: number;
  modelId?: string;
}

export function mapThreadMessagesForCloud(messages: ThreadMessageForCloud[]): AIMessage[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    checkpoint: message.checkpoint,
    changes: message.changes,
    changeSet: message.changeSet,
    error: message.error,
    cancelled: message.cancelled,
    latency: message.latencyMs,
    modelId: message.modelId,
  }));
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function serializeConversationMessages(messages: AIMessage[]): SerializedConversationMessage[] | null {
  const serialized: SerializedConversationMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = JSON.stringify(messages[index]);
    if (typeof message !== 'string' || utf8ByteLength(message) > MAX_CONVERSATION_MESSAGE_BYTES) return null;
    serialized.push({ id: String(index).padStart(8, '0'), index, message });
  }
  return serialized;
}

export function serializeLegacyConversationSnapshot(messages: AIMessage[]): string | null {
  const recent = messages.slice(-LEGACY_CONVERSATION_MESSAGE_COUNT);
  while (recent.length > 0) {
    const serialized = JSON.stringify(recent);
    if (utf8ByteLength(serialized) <= MAX_CONVERSATION_MESSAGE_BYTES) return serialized;
    recent.shift();
  }
  return messages.length === 0 ? '[]' : null;
}

export function parseConversationMessageDocuments(
  documents: Array<{ id: string; index: number; message: string; generation: string }>,
  manifest: ConversationMessageManifest | null
): AIMessage[] | null {
  if (!manifest?.complete || !manifest.generation || !Number.isInteger(manifest.count) || manifest.count < 0) return null;
  const currentGeneration = documents.filter(document => document.generation === manifest.generation);
  if (currentGeneration.length !== manifest.count) return null;

  const ordered = currentGeneration.sort((left, right) => left.index - right.index);
  try {
    const messages = ordered.map((document, index) => {
      if (document.index !== index || document.id !== `${manifest.generation}_${String(index).padStart(8, '0')}`) {
        throw new Error('Conversation message sequence is incomplete.');
      }
      return JSON.parse(document.message) as AIMessage;
    });
    return messages;
  } catch {
    return null;
  }
}
