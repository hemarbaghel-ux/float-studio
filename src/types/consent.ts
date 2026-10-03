export type ConsentSource = 'onboarding' | 'settings' | 'default';

export interface UserConsent {
  userId: string;
  sharingEnabled: boolean;
  policyVersion: string;
  source: ConsentSource;
  consentTimestamp?: any;
  updatedAt: any;
}

export interface ConsentPreferences {
  sharingEnabled: boolean;
  policyVersion: string;
  lastUpdated: string | null;
  source: ConsentSource;
  syncedWithCloud: boolean;
}
