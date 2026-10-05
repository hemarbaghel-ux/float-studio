import { create } from 'zustand';
import { ConsentService, CURRENT_POLICY_VERSION } from '../services/consentService';
import { ConsentPreferences, ConsentSource } from '../types/consent';
import { auth } from '../lib/firebase';

interface ConsentState {
  preferences: ConsentPreferences;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  
  // Actions
  initialize: () => Promise<void>;
  updateConsent: (sharingEnabled: boolean, source?: ConsentSource) => Promise<boolean>;
  withdrawConsent: () => Promise<boolean>;
  clearError: () => void;
}

export const useConsentStore = create<ConsentState>((set, get) => ({
  preferences: ConsentService.getLocalConsent(),
  isLoading: false,
  isSaving: false,
  error: null,

  initialize: async () => {
    const ownerAtStart = auth.currentUser?.uid ?? null;
    set({ isLoading: true, error: null, preferences: ConsentService.getLocalConsent(ownerAtStart) });
    try {
      const prefs = await ConsentService.loadConsent();
      if ((auth.currentUser?.uid ?? null) !== ownerAtStart) return;
      set({ preferences: prefs, isLoading: false });
    } catch (e: any) {
      console.warn('Failed to load consent:', e);
      if ((auth.currentUser?.uid ?? null) === ownerAtStart) set({ isLoading: false });
    }
  },

  updateConsent: async (sharingEnabled: boolean, source: ConsentSource = 'settings') => {
    const ownerAtStart = auth.currentUser?.uid ?? null;
    set({ isSaving: true, error: null });
    try {
      const updated = await ConsentService.saveConsent(sharingEnabled, source);
      if ((auth.currentUser?.uid ?? null) !== ownerAtStart) return false;
      set({ preferences: updated, isSaving: false });
      return true;
    } catch (e: any) {
      let message = 'Unable to save consent preferences. Please check your network connection and try again.';
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.error) message = parsed.error;
      } catch {
        if (e.message) message = e.message;
      }
      if ((auth.currentUser?.uid ?? null) === ownerAtStart) set({ error: message, isSaving: false });
      return false;
    }
  },

  withdrawConsent: async () => {
    set({ isSaving: true, error: null });
    try {
      const updated = await ConsentService.withdrawConsent();
      set({ preferences: updated, isSaving: false });
      return true;
    } catch (e: any) {
      set({ error: e.message || 'Failed to withdraw consent', isSaving: false });
      return false;
    }
  },

  clearError: () => set({ error: null })
}));
