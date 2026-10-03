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

const getStoredOnboarding = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem('float_has_completed_onboarding');
    if (val !== null) return val === 'true';
  } catch {}
  return false;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  hasCompletedOnboarding: getStoredOnboarding(),
  setOnboarded: (val, userId) => {
    try {
      localStorage.setItem('float_has_completed_onboarding', String(val));
      if (userId) {
        localStorage.setItem(`float_onboarded_${userId}`, String(val));
      }
    } catch {}
    set({ hasCompletedOnboarding: val });
  },
  syncOnboardingForUser: (userId) => {
    try {
      if (userId && localStorage.getItem(`float_onboarded_${userId}`) === 'true') {
        set({ hasCompletedOnboarding: true });
        return true;
      }
      const generic = localStorage.getItem('float_has_completed_onboarding') === 'true';
      if (generic) {
        set({ hasCompletedOnboarding: true });
        return true;
      }
    } catch {}
    return false;
  },
  
  accountType: 'personal',
  setAccountType: (type) => set({ accountType: type }),
  role: null,
  setRole: (role) => set({ role }),
  dataSharing: false,
  setDataSharing: (val) => set({ dataSharing: val })
}));
