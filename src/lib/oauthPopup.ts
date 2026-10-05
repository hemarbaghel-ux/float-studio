/**
 * Safe, robust OAuth Popup Manager for FLOAT AI
 * Handles popup lifecycle, safe cross-origin message listening,
 * popup closure detection, failure/denial handling, and timeouts.
 */

export interface OAuthSuccessPayload {
  provider: 'github' | 'gitlab';
  accountName?: string;
}

export interface OAuthLaunchOptions {
  authUrl: string;
  provider: 'github' | 'gitlab';
  timeoutMs?: number; // Defaults to 120,000ms (2 minutes)
  onSuccess: (data: OAuthSuccessPayload) => void;
  onError: (errorMessage: string) => void;
  onCancelled: (message: string) => void;
  onTimeout: (message: string) => void;
  onBlocked: (message: string) => void;
}

export interface ActiveOAuthSession {
  cancel: () => void;
}

export function launchOAuthFlow(options: OAuthLaunchOptions): ActiveOAuthSession {
  const {
    authUrl,
    provider,
    timeoutMs = 120000,
    onSuccess,
    onError,
    onCancelled,
    onTimeout,
    onBlocked
  } = options;

  const providerName = provider === 'github' ? 'GitHub' : 'GitLab';
  let completed = false;
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let popup: Window | null = null;

  const cleanup = () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    window.removeEventListener('message', handleMessage);
  };

  const handleMessage = (event: MessageEvent) => {
    const origin = event.origin;

    // OAuth callback is served by this app, so accept messages only from the
    // current origin and the popup window opened for this exact flow.
    if (origin !== window.location.origin || event.source !== popup) {
      return;
    }

    if (!event.data || typeof event.data !== 'object') {
      return;
    }

    // Guard against cross-provider message cross-talk
    if (event.data.provider && event.data.provider !== provider) {
      return;
    }

    if (event.data.type === 'OAUTH_AUTH_SUCCESS') {
      completed = true;
      cleanup();
      onSuccess({
        provider,
        accountName: event.data.accountName
      });
    } else if (event.data.type === 'OAUTH_AUTH_ERROR') {
      completed = true;
      cleanup();
      const rawError = String(event.data.error || 'Authorization was denied by user');
      const safeReason = rawError.toLowerCase().includes('access_denied')
        ? 'Authorization was denied by the user on ' + providerName
        : rawError;
      onError(`${providerName} connection failed: ${safeReason}`);
    }
  };

  window.addEventListener('message', handleMessage);

  try {
    const popupWidth = 600;
    const popupHeight = 720;
    const left = window.screenX + (window.outerWidth - popupWidth) / 2;
    const top = window.screenY + (window.outerHeight - popupHeight) / 2;

    popup = window.open(
      authUrl,
      `float_oauth_${provider}_${Date.now()}`,
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},menubar=no,toolbar=no,status=no,location=no,scrollbars=yes`
    );
  } catch {
    cleanup();
    onBlocked('Popup window was blocked by your browser. Please allow popups to connect your account.');
    return { cancel: () => {} };
  }

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    cleanup();
    onBlocked('Popup window was blocked by your browser. Please allow popups to connect your account.');
    return { cancel: () => {} };
  }

  // Safe polling for popup closed state
  checkInterval = setInterval(() => {
    try {
      if (popup && popup.closed) {
        clearInterval(checkInterval!);
        checkInterval = null;

        // Grace period (400ms) allows any in-flight postMessage to be dispatched first
        setTimeout(() => {
          if (!completed) {
            completed = true;
            cleanup();
            onCancelled(`${providerName} connection cancelled. You can try again.`);
          }
        }, 400);
      }
    } catch {
      // Cross-origin access checks can throw in certain browser configurations; keep polling
    }
  }, 350);

  // Safety timeout to prevent indefinite pending states
  timeoutTimer = setTimeout(() => {
    if (!completed) {
      completed = true;
      cleanup();
      try {
        if (popup && !popup.closed) {
          popup.close();
        }
      } catch {
        // Ignore popup close exceptions
      }
      onTimeout(`${providerName} connection timed out. Please try again.`);
    }
  }, timeoutMs);

  return {
    cancel: () => {
      if (!completed) {
        completed = true;
        cleanup();
        try {
          if (popup && !popup.closed) {
            popup.close();
          }
        } catch {}
      }
    }
  };
}
