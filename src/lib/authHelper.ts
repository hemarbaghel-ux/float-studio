/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { auth } from './firebase';
import { useAuthStore } from '../store/authStore';
import { getBackendBaseUrl } from './apiConfig';

/**
 * Retrieves the active Firebase ID token for authenticated requests.
 * Checks both the Firebase client SDK and the application auth store
 * (supporting web, desktop loopback OAuth, and test environments).
 */
export async function getAuthToken(): Promise<string | null> {
  // 1. Check active Firebase SDK user
  try {
    if (auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      const token = await auth.currentUser.getIdToken();
      if (token) return token;
    }
  } catch (err) {
    console.warn('[AuthHelper] Firebase SDK getIdToken error:', err);
  }

  // 2. Check Zustand AuthStore user (desktop session or test harness)
  try {
    const storeUser = useAuthStore.getState().user as any;
    if (storeUser) {
      if (typeof storeUser.getIdToken === 'function') {
        const token = await storeUser.getIdToken();
        if (token) return token;
      }
      if (storeUser.token && typeof storeUser.token === 'string') {
        return storeUser.token;
      }
    }
  } catch (err) {
    console.warn('[AuthHelper] Store user token error:', err);
  }

  return null;
}

/**
 * Returns Authorization header object if user is authenticated, or empty object if not.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

/**
 * Synchronizes user profile with hosted backend upon sign-in.
 * Creates or updates profile in Firestore users/{uid} with { id, email, plan: 'free', createdAt }.
 */
export async function syncUserProfileWithBackend(): Promise<void> {
  try {
    const token = await getAuthToken();
    if (!token) return;

    const baseUrl = getBackendBaseUrl();
    if (!baseUrl && typeof window === 'undefined') return;
    await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.warn('[AuthHelper] Failed to sync user profile with backend:', err);
  }
}
