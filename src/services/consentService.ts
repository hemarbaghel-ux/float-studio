import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserConsent, ConsentSource, ConsentPreferences } from '../types/consent';

export const CURRENT_POLICY_VERSION = 'draft';
const LOCAL_STORAGE_KEY = 'float_data_sharing_consent_v1';

export function consentStorageKey(userId: string | null): string {
  return userId ? `${LOCAL_STORAGE_KEY}:user:${encodeURIComponent(userId)}` : `${LOCAL_STORAGE_KEY}:guest`;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Consent Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class ConsentService {
  /**
   * Reads stored local preference. Defaults to FALSE for new users (privacy by default).
   */
  static getLocalConsent(userId: string | null = auth.currentUser?.uid ?? null): ConsentPreferences {
    try {
      const stored = localStorage.getItem(consentStorageKey(userId));
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          sharingEnabled: !!parsed.sharingEnabled,
          policyVersion: parsed.policyVersion || CURRENT_POLICY_VERSION,
          lastUpdated: parsed.lastUpdated || null,
          source: parsed.source || 'default',
          syncedWithCloud: !!parsed.syncedWithCloud
        };
      }
    } catch {
      // Ignore json parse error
    }

    return {
      sharingEnabled: false,
      policyVersion: CURRENT_POLICY_VERSION,
      lastUpdated: null,
      source: 'default',
      syncedWithCloud: false
    };
  }

  /**
   * Saves local preference cache.
   */
  static setLocalConsent(prefs: ConsentPreferences, userId: string | null = auth.currentUser?.uid ?? null): void {
    try {
      localStorage.setItem(consentStorageKey(userId), JSON.stringify(prefs));
    } catch (e) {
      console.warn('Could not save consent to localStorage:', e);
    }
  }

  /**
   * Saves user consent to Firestore and localStorage.
   * If user is authenticated, persists to /userConsents/{userId}.
   * Throws real error if network or security rule rejects the write.
   */
  static async saveConsent(sharingEnabled: boolean, source: ConsentSource): Promise<ConsentPreferences> {
    const user = auth.currentUser;
    const nowIso = new Date().toISOString();

    const localPrefs: ConsentPreferences = {
      sharingEnabled,
      policyVersion: CURRENT_POLICY_VERSION,
      lastUpdated: nowIso,
      source,
      syncedWithCloud: false
    };

    if (user && user.uid) {
      const path = `userConsents/${user.uid}`;
      try {
        const consentDocRef = doc(db, 'userConsents', user.uid);
        
        await setDoc(consentDocRef, {
          userId: user.uid,
          sharingEnabled,
          policyVersion: CURRENT_POLICY_VERSION,
          source,
          consentTimestamp: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        localPrefs.syncedWithCloud = true;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }

    this.setLocalConsent(localPrefs, user?.uid ?? null);
    return localPrefs;
  }

  /**
   * Loads user consent from Firestore if signed in, or from localStorage.
   */
  static async loadConsent(): Promise<ConsentPreferences> {
    const user = auth.currentUser;
    const local = this.getLocalConsent(user?.uid ?? null);

    if (!user || !user.uid) {
      return local;
    }

    const path = `userConsents/${user.uid}`;
    try {
      const consentDocRef = doc(db, 'userConsents', user.uid);
      const snap = await getDoc(consentDocRef);

      if (snap.exists()) {
        const data = snap.data() as UserConsent;
        const lastUpdatedDate = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString();
        
        const prefs: ConsentPreferences = {
          sharingEnabled: !!data.sharingEnabled,
          policyVersion: data.policyVersion || CURRENT_POLICY_VERSION,
          lastUpdated: lastUpdatedDate,
          source: data.source || 'settings',
          syncedWithCloud: true
        };

        this.setLocalConsent(prefs, user.uid);
        return prefs;
      } else {
        // If not in cloud yet, but user previously made a choice in localStorage, sync it now
        if (local.source !== 'default') {
          return await this.saveConsent(local.sharingEnabled, local.source);
        }
        return local;
      }
    } catch (error) {
      // In case of read failure, fallback gracefully to cached local preference
      console.warn('Failed to load cloud consent, using local fallback:', error);
      return local;
    }
  }

  /**
   * Withdraws all consent immediately.
   */
  static async withdrawConsent(): Promise<ConsentPreferences> {
    return await this.saveConsent(false, 'settings');
  }

  /**
   * Checks whether telemetry or optional data sharing is permitted.
   */
  static isSharingAllowed(): boolean {
    const local = this.getLocalConsent(auth.currentUser?.uid ?? null);
    return local.sharingEnabled === true;
  }
}
