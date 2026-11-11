import { auth } from '../lib/firebase';
import { resolveApiUrl } from '../lib/apiConfig';

/** Attach a fresh Firebase ID token to requests for authenticated server APIs. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');

  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const resolvedInput = typeof input === 'string' && input.startsWith('/') ? resolveApiUrl(input) : input;
  return fetch(resolvedInput, { ...init, headers });
}
