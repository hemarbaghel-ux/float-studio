import assert from 'node:assert/strict';
import { isAutomationOwnedBy } from '../src/features/float/automationStore';
import { projectStorageKey } from '../src/store/projectStorage';
import { conversationCacheKey, conversationListCacheKey } from '../src/services/conversationCacheKeys';
import { inspectLegacyCache, migrateLegacyCache } from '../src/services/legacyCacheMigration';
import { consentStorageKey } from '../src/services/consentService';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const aliceAutomation = { ownerId: 'alice' };
const legacyAutomation = {};

assert.equal(isAutomationOwnedBy(aliceAutomation, 'alice'), true, 'an owner can access their automation');
assert.equal(isAutomationOwnedBy(aliceAutomation, 'bob'), false, 'another account cannot access the automation');
assert.equal(isAutomationOwnedBy(aliceAutomation, undefined), false, 'signed-out users cannot access automations');
assert.equal(isAutomationOwnedBy(legacyAutomation, 'alice'), false, 'unowned legacy records are not assigned to the current account');
assert.notEqual(projectStorageKey('alice'), projectStorageKey('bob'), 'accounts have separate local project records');
assert.notEqual(projectStorageKey(null), projectStorageKey('alice'), 'signed-out workspace data is separate from account data');
assert.notEqual(conversationCacheKey('chat-1', 'alice'), conversationCacheKey('chat-1', 'bob'), 'accounts have separate local transcript records');
assert.notEqual(conversationListCacheKey('project-1', 'alice'), conversationListCacheKey('project-1', 'bob'), 'accounts have separate local conversation lists');
assert.notEqual(conversationCacheKey('chat-1', null), conversationCacheKey('chat-1', 'alice'), 'signed-out transcript data is separate from account data');
assert.notEqual(consentStorageKey('alice'), consentStorageKey('bob'), 'consent preference storage is isolated by account');
assert.notEqual(consentStorageKey(null), consentStorageKey('alice'), 'signed-out consent preference is isolated from account consent');

const legacyStorage = new MemoryStorage();
legacyStorage.setItem('float_active_project', JSON.stringify({ projectId: 'old-project', files: [] }));
legacyStorage.setItem('float_chat_chat-1', JSON.stringify([{ id: 'm1' }]));
legacyStorage.setItem('float_conv_conv-1', JSON.stringify({ id: 'conv-1' }));
legacyStorage.setItem('float_conv_list_old-project', JSON.stringify([{ id: 'conv-1' }]));
legacyStorage.setItem('float_active_project_alice', JSON.stringify({ projectId: 'current-project', files: [] }));
legacyStorage.setItem('float_automations', JSON.stringify({ state: { automations: [{ id: 'legacy-auto' }, { id: 'bob-auto', ownerId: 'bob' }] }, version: 0 }));

const inventory = inspectLegacyCache(legacyStorage, 'alice');
assert.equal(inventory?.transcripts.length, 1, 'legacy transcript is detected for opt-in recovery');
const migration = migrateLegacyCache(legacyStorage, 'alice');
assert.equal(migration.projectImported, false, 'existing account project data is never overwritten');
assert.equal(migration.transcriptsImported, 1, 'legacy transcript is copied into the account cache');
assert.equal(migration.conversationsImported, 1, 'legacy conversation is copied into the account cache');
assert.equal(migration.listsImported, 1, 'legacy conversation list is copied into the account cache');
assert.equal(migration.automationsAssigned, 1, 'only ownerless legacy automations are assigned');
assert.equal(legacyStorage.getItem('float_active_project'), JSON.stringify({ projectId: 'old-project', files: [] }), 'legacy source project remains untouched');
assert.ok(legacyStorage.getItem('float_legacy_automations_backup_alice'), 'legacy automations are backed up before ownership assignment');
assert.equal(inspectLegacyCache(legacyStorage, 'alice'), null, 'completed recovery is not offered again');
assert.equal(inspectLegacyCache(legacyStorage, 'bob'), null, 'legacy source data cannot be claimed by another account afterward');

console.log('Account data isolation and legacy recovery: 21 passed, 0 failed.');
