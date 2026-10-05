import { conversationCacheKey, conversationListCacheKey } from './conversationCacheKeys';
import { projectStorageKey } from '../store/projectStorage';

export interface LegacyCacheInventory {
  project: boolean;
  transcripts: string[];
  conversations: string[];
  conversationLists: string[];
  unownedAutomations: number;
}

export interface LegacyCacheMigrationResult {
  projectImported: boolean;
  transcriptsImported: number;
  conversationsImported: number;
  listsImported: number;
  automationsAssigned: number;
}

const migrationMarker = (ownerId: string) => `float_legacy_cache_migrated_${ownerId}`;
const legacyClaimKey = 'float_legacy_cache_claimed_by';

function readJson(storage: Storage, key: string): any | null {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function keys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
}

function validProject(project: any): boolean {
  return Boolean(project && typeof project === 'object' && typeof project.projectId === 'string' && Array.isArray(project.files));
}

function unownedAutomationCount(storage: Storage): number {
  const parsed = readJson(storage, 'float_automations');
  const automations = parsed?.state?.automations;
  return Array.isArray(automations) ? automations.filter((item: any) => item && typeof item.id === 'string' && !item.ownerId).length : 0;
}

export function inspectLegacyCache(storage: Storage, ownerId: string): LegacyCacheInventory | null {
  if (!ownerId || storage.getItem(migrationMarker(ownerId))) return null;
  const claimedBy = storage.getItem(legacyClaimKey);
  if (claimedBy && claimedBy !== ownerId) return null;

  const allKeys = keys(storage);
  const project = validProject(readJson(storage, 'float_active_project'));
  const transcripts = allKeys.filter((key) => /^float_chat_[^_]+$/.test(key));
  const conversations = allKeys.filter((key) => /^float_conv_[^_]+$/.test(key));
  const conversationLists = allKeys.filter((key) => /^float_conv_list_[^_]+$/.test(key));
  const unownedAutomations = unownedAutomationCount(storage);
  if (!project && transcripts.length === 0 && conversations.length === 0 && conversationLists.length === 0 && unownedAutomations === 0) return null;
  return { project, transcripts, conversations, conversationLists, unownedAutomations };
}

function copyIfMissing(storage: Storage, sourceKey: string, targetKey: string): boolean {
  if (storage.getItem(targetKey) !== null) return false;
  const value = storage.getItem(sourceKey);
  if (value === null) return false;
  storage.setItem(targetKey, value);
  return true;
}

/** Copies older browser-only caches into one explicitly selected account, leaving source keys intact. */
export function migrateLegacyCache(storage: Storage, ownerId: string): LegacyCacheMigrationResult {
  const inventory = inspectLegacyCache(storage, ownerId);
  const result: LegacyCacheMigrationResult = {
    projectImported: false,
    transcriptsImported: 0,
    conversationsImported: 0,
    listsImported: 0,
    automationsAssigned: 0,
  };
  if (!inventory) return result;

  // The first account that explicitly claims the legacy cache owns its migration.
  // Other accounts in this browser cannot import the same unscoped source data.
  storage.setItem(legacyClaimKey, ownerId);

  if (inventory.project) {
    result.projectImported = copyIfMissing(storage, 'float_active_project', projectStorageKey(ownerId));
  }

  for (const sourceKey of inventory.transcripts) {
    const conversationId = sourceKey.slice('float_chat_'.length);
    if (copyIfMissing(storage, sourceKey, `float_chat_${ownerId}_${conversationId}`)) result.transcriptsImported++;
  }

  for (const sourceKey of inventory.conversations) {
    const conversationId = sourceKey.slice('float_conv_'.length);
    if (copyIfMissing(storage, sourceKey, conversationCacheKey(conversationId, ownerId))) result.conversationsImported++;
  }

  for (const sourceKey of inventory.conversationLists) {
    const projectId = sourceKey.slice('float_conv_list_'.length);
    if (copyIfMissing(storage, sourceKey, conversationListCacheKey(projectId, ownerId))) result.listsImported++;
  }

  const automationState = readJson(storage, 'float_automations');
  const automations = automationState?.state?.automations;
  if (Array.isArray(automations)) {
    for (const automation of automations) {
      if (automation && typeof automation.id === 'string' && !automation.ownerId) {
        automation.ownerId = ownerId;
        result.automationsAssigned++;
      }
    }
    if (result.automationsAssigned > 0) {
      const rawState = storage.getItem('float_automations');
      if (rawState !== null) storage.setItem(`float_legacy_automations_backup_${ownerId}`, rawState);
      storage.setItem('float_automations', JSON.stringify(automationState));
    }
  }

  // Prevent repeated prompts. The old source data remains available for recovery.
  storage.setItem(migrationMarker(ownerId), new Date().toISOString());
  return result;
}
