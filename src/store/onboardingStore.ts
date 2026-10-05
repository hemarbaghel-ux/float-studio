import { create } from 'zustand';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  setOnboarded: (val: boolean, userId?: string) => void;
  syncOnboardingForUser: (userId?: string | null) => boolean;
  
  // Onboarding data
  accountType: 'personal' | 'team' | null;
  setAccountType: (type: 'personal' | 'team') => void;
  role: string | null;
  setRole: (role: string) => void;
  dataSharing: boolean;
  setDataSharing: (val: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  hasCompletedOnboarding: false,
  setOnboarded: (val, userId) => {
    try {
      if (userId) {
        localStorage.setItem(`float_onboarded_${userId}`, String(val));
      } else {
        // Retain a one-time legacy marker only for callers that have not migrated.
        localStorage.setItem('float_has_completed_onboarding', String(val));
      }
    } catch {}
    set({ hasCompletedOnboarding: val });
  },
  syncOnboardingForUser: (userId) => {
    try {
      if (!userId) {
        set({ hasCompletedOnboarding: false, accountType: 'personal', role: null, dataSharing: false });
        return false;
      }

      const accountValue = localStorage.getItem(`float_onboarded_${userId}`);
      if (accountValue !== null) {
        const completed = accountValue === 'true';
        set({ hasCompletedOnboarding: completed, accountType: 'personal', role: null, dataSharing: false });
        return completed;
      }

      // Let the first account seen after upgrade claim the old shared flag once.
      const legacyCompleted = localStorage.getItem('float_has_completed_onboarding') === 'true';
      if (legacyCompleted) {
        localStorage.setItem(`float_onboarded_${userId}`, 'true');
        localStorage.removeItem('float_has_completed_onboarding');
      }
      set({ hasCompletedOnboarding: legacyCompleted, accountType: 'personal', role: null, dataSharing: false });
      return legacyCompleted;
    } catch {}
    set({ hasCompletedOnboarding: false, accountType: 'personal', role: null, dataSharing: false });
    return false;
  },
  
  accountType: 'personal',
  setAccountType: (type) => set({ accountType: type }),
  role: null,
  setRole: (role) => set({ role }),
  dataSharing: false,
  setDataSharing: (val) => set({ dataSharing: val })
}));
