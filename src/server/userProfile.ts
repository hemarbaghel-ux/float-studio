import { adminDb, hasAdminCredentials } from './adminFirebase';

export interface UserProfile {
  id: string;
  email: string;
  plan: 'free' | 'pro' | 'team';
  createdAt: string;
}

const memoryProfiles = new Map<string, UserProfile>();

export async function ensureUserProfile(user: { uid: string; email?: string }): Promise<UserProfile> {
  const userId = user.uid;
  const email = user.email || '';

  if (hasAdminCredentials()) {
    try {
      const userRef = adminDb.collection('users').doc(userId);
      const snapshot = await userRef.get();
      if (snapshot.exists) {
        const data = snapshot.data();
        return {
          id: userId,
          email: data?.email || email,
          plan: data?.plan || 'free',
          createdAt: data?.createdAt || new Date().toISOString()
        };
      }

      const newProfile: UserProfile = {
        id: userId,
        email,
        plan: 'free',
        createdAt: new Date().toISOString()
      };
      await userRef.set(newProfile);
      return newProfile;
    } catch (err) {
      console.warn(`[UserProfile] Firestore write error for user ${userId}, using memory fallback:`, err);
    }
  }

  // Memory fallback when Firestore admin credentials are unavailable (e.g. testing or local dev)
  if (!memoryProfiles.has(userId)) {
    memoryProfiles.set(userId, {
      id: userId,
      email,
      plan: 'free',
      createdAt: new Date().toISOString()
    });
  }

  return memoryProfiles.get(userId)!;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (hasAdminCredentials()) {
    try {
      const snapshot = await adminDb.collection('users').doc(userId).get();
      if (snapshot.exists) {
        const data = snapshot.data();
        return {
          id: userId,
          email: data?.email || '',
          plan: data?.plan || 'free',
          createdAt: data?.createdAt || new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn(`[UserProfile] Firestore read error for user ${userId}:`, err);
    }
  }

  return memoryProfiles.get(userId) || null;
}

export function resetMemoryProfilesForTests(): void {
  memoryProfiles.clear();
}
