/**
 * API configuration and endpoint resolution helper for FLOAT Studio.
 * Handles environment variables, user settings, and automatic protocol adaptation
 * between web (relative URLs with proxy) and desktop (configurable localhost or remote URL).
 */

export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. User-configured custom backend URL via settings / localStorage
    try {
      const customUrl = localStorage.getItem('float_backend_url')?.trim();
      if (customUrl) return customUrl.replace(/\/+$/, '');
    } catch {}

    // 2. Injected backend URL (e.g. from Electron wrapper or test harness)
    if ((window as any).__FLOAT_BACKEND_URL__) {
      return String((window as any).__FLOAT_BACKEND_URL__).trim().replace(/\/+$/, '');
    }
  }

  // 3. Build-time environment variables
  const envUrl = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL) ||
    (typeof process !== 'undefined' && (process.env?.FLOAT_BACKEND_URL || process.env?.VITE_BACKEND_URL))
  )?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // 4. Desktop / Electron environment running over file:// protocol
  if (
    typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')))
  ) {
    return 'http://127.0.0.1:3000';
  }

  // 5. Standard web browser environment: relative URLs use current origin / Vite proxy
  return '';
}

export function setBackendBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      localStorage.removeItem('float_backend_url');
    } else {
      localStorage.setItem('float_backend_url', trimmed);
    }
  }
}

export function resolveApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getBackendBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

export function formatBackendConnectionError(endpointUrl: string, originalError?: any): string {
  const errMsg = originalError?.message || String(originalError || '');
  const isNetworkFailure =
    /failed to fetch|networkerror|econnrefused|connection refused|load failed|net::err/i.test(errMsg);

  if (isNetworkFailure) {
    return `Could not reach the FLOAT AI backend at "${endpointUrl}".\n\nPlease ensure the backend server is running and reachable, or update the Backend Service URL in Settings > AI & Models.`;
  }

  return errMsg || 'Failed to communicate with AI backend service.';
}
