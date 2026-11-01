import assert from 'node:assert/strict';
import {
  MAX_CONVERSATION_MESSAGE_BYTES,
  conversationSyncStatusLabel,
  mapThreadMessagesForCloud,
  parseConversationMessageDocuments,
  serializeConversationMessages,
  serializeLegacyConversationSnapshot,
  utf8ByteLength,
} from '../src/services/conversationCloudMessages';

const messages = [
  { id: 'u1', role: 'user', content: 'hello' },
  { id: 'a1', role: 'assistant', content: 'world' },
] as any[];

const serialized = serializeConversationMessages(messages);
assert.ok(serialized);
assert.equal(serialized.length, 2);
assert.equal(serialized[0].id, '00000000');
assert.equal(serialized[1].id, '00000001');
const generation = '12345678-1234-4234-8234-123456789abc';
const generatedDocuments = serialized.map(message => ({
  ...message,
  id: `${generation}_${message.id}`,
  generation,
}));

const recovered = parseConversationMessageDocuments(generatedDocuments, {
  ownerId: 'owner',
  generation,
  count: 2,
  complete: true,
});
assert.deepEqual(recovered, messages);
assert.deepEqual(parseConversationMessageDocuments([
  ...generatedDocuments,
  { ...generatedDocuments[0], id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_00000000`, generation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', message: JSON.stringify({ role: 'assistant', content: 'stale' }) },
], { ownerId: 'owner', generation, count: 2, complete: true }), messages);
assert.equal(parseConversationMessageDocuments(generatedDocuments, { ownerId: 'owner', generation, count: 2, complete: false }), null);
assert.equal(parseConversationMessageDocuments(generatedDocuments.slice(0, 1), { ownerId: 'owner', generation, count: 2, complete: true }), null);
assert.equal(parseConversationMessageDocuments([
  generatedDocuments[1],
  { ...generatedDocuments[0], index: 1 },
], { ownerId: 'owner', generation, count: 2, complete: true }), null);

const multibyteText = '🧪'.repeat(100);
assert.ok(utf8ByteLength(multibyteText) > multibyteText.length);
assert.ok(serializeLegacyConversationSnapshot(messages));

const oversized = [{ role: 'assistant', content: 'x'.repeat(MAX_CONVERSATION_MESSAGE_BYTES) }] as any[];
assert.equal(serializeConversationMessages(oversized), null);
assert.equal(serializeLegacyConversationSnapshot(oversized), null);

const longThread = Array.from({ length: 40 }, (_, index) => ({
  id: `message-${index}`,
  role: index % 2 === 0 ? 'user' as const : 'model' as const,
  content: `content-${index}`,
  createdAt: index + 1,
}));
const mappedThread = mapThreadMessagesForCloud(longThread);
assert.equal(mappedThread.length, longThread.length, 'thread mapping retains messages beyond the old 24-message window');
assert.equal(mappedThread[0].id, longThread[0].id);
assert.equal(mappedThread[39].timestamp, longThread[39].createdAt);
assert.deepEqual(serializeConversationMessages(mappedThread)?.map(message => message.index), Array.from({ length: 40 }, (_, index) => index));

assert.equal(conversationSyncStatusLabel({ status: 'synced' }), 'Conversation saved to cloud');
assert.match(conversationSyncStatusLabel({ status: 'local-only', reason: 'not-authenticated' }), /saved on this device only/);
assert.match(conversationSyncStatusLabel({ status: 'local-only', reason: 'message-too-large' }), /message size limit/);
assert.match(conversationSyncStatusLabel({ status: 'failed', reason: 'permission-denied' }), /save was denied/);
assert.match(conversationSyncStatusLabel({ status: 'failed', reason: 'cloud-unavailable' }), /Cloud save failed/);

console.log('Conversation cloud message serialization and recovery tests passed.');
