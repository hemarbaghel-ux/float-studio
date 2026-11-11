/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Universal Sentry Error Tracking Integration
 *
 * Configured via SENTRY_DSN in the server environment or VITE_SENTRY_DSN in the web environment.
 * If SENTRY_DSN is unset or empty, error tracking is completely disabled with zero runtime overhead.
 */

export interface SentryBreadcrumb {
  readonly timestamp: number;
  readonly message: string;
  readonly category?: string;
  readonly level?: 'debug' | 'info' | 'warning' | 'error';
  readonly data?: Record<string, unknown>;
}

export interface SentryEvent {
  readonly event_id: string;
  readonly timestamp: number;
  readonly platform: 'javascript' | 'node';
  readonly level: 'info' | 'warning' | 'error' | 'fatal';
  readonly message?: string;
  readonly exception?: {
    readonly values: Array<{
      readonly type: string;
      readonly value: string;
      readonly stacktrace?: { readonly frames: Array<{ readonly filename?: string; readonly function?: string; readonly lineno?: number }> };
    }>;
  };
  readonly extra?: Record<string, unknown>;
  readonly breadcrumbs?: readonly SentryBreadcrumb[];
  readonly tags?: Record<string, string>;
  readonly environment?: string;
}

export interface ParsedSentryDsn {
  readonly publicKey: string;
  readonly host: string;
  readonly path: string;
  readonly projectId: string;
  readonly envelopeEndpoint: string;
}

let parsedDsn: ParsedSentryDsn | null = null;
let isInitialized = false;
const breadcrumbs: SentryBreadcrumb[] = [];
const MAX_BREADCRUMBS = 50;

/**
 * Parses a standard Sentry DSN: https://<publicKey>@<host>/<projectId>
 */
export function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
  try {
    const trimmed = (dsn || '').trim();
    if (!trimmed) return null;
    const url = new URL(trimmed);
    const publicKey = url.username;
    const host = url.host;
    const pathParts = url.pathname.split('/').filter(Boolean);
    const projectId = pathParts[pathParts.length - 1];

    if (!publicKey || !host || !projectId) return null;

    const basePath = pathParts.slice(0, -1).join('/');
    const prefix = basePath ? `/${basePath}` : '';
    const envelopeEndpoint = `${url.protocol}//${host}${prefix}/api/${projectId}/envelope/`;

    return {
      publicKey,
      host,
      path: url.pathname,
      projectId,
      envelopeEndpoint,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the configured DSN across Node server and Vite client environments.
 */
function resolveConfiguredDsn(): string | undefined {
  if (typeof process !== 'undefined' && process.env?.SENTRY_DSN) {
    return process.env.SENTRY_DSN;
  }
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv?.VITE_SENTRY_DSN) {
      return metaEnv.VITE_SENTRY_DSN;
    }
  } catch {
    // import.meta not available in plain CJS
  }
  return undefined;
}

/**
 * Initializes Sentry error tracking. If DSN is absent, does nothing.
 */
export function initSentry(dsnOverride?: string): boolean {
  if (isInitialized && !dsnOverride) return Boolean(parsedDsn);

  const dsn = dsnOverride !== undefined ? dsnOverride : resolveConfiguredDsn();
  parsedDsn = dsn ? parseSentryDsn(dsn) : null;
  isInitialized = true;

  if (!parsedDsn) {
    return false; // Disabled
  }

  // Hook unhandled errors if in browser environment
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      if (event.error) {
        captureException(event.error, { source: 'window.onerror' });
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (reason instanceof Error) {
        captureException(reason, { source: 'unhandledrejection' });
      } else if (reason) {
        captureMessage(typeof reason === 'string' ? reason : JSON.stringify(reason), 'error', { source: 'unhandledrejection' });
      }
    });
  }

  // Hook uncaught exceptions if in Node environment
  if (typeof process !== 'undefined' && process.on && typeof window === 'undefined') {
    process.on('uncaughtException', (error) => {
      captureException(error, { source: 'process.uncaughtException' });
    });
    process.on('unhandledRejection', (reason) => {
      if (reason instanceof Error) {
        captureException(reason, { source: 'process.unhandledRejection' });
      } else {
        captureMessage(String(reason), 'error', { source: 'process.unhandledRejection' });
      }
    });
  }

  return true;
}

export function isSentryEnabled(): boolean {
  if (!isInitialized) initSentry();
  return Boolean(parsedDsn);
}

export function addBreadcrumb(breadcrumb: Omit<SentryBreadcrumb, 'timestamp'>): void {
  if (!isSentryEnabled()) return;
  breadcrumbs.push({
    ...breadcrumb,
    timestamp: Date.now() / 1000,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

/**
 * Generates random 32-character hex event ID matching Sentry format.
 */
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Math.random().toString(16).substring(2).padEnd(32, '0').substring(0, 32);
}

/**
 * Sends a Sentry envelope event via HTTP POST.
 */
async function sendSentryEnvelope(event: SentryEvent): Promise<void> {
  if (!parsedDsn) return;

  try {
    const envelopeHeader = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      dsn: parsedDsn.envelopeEndpoint,
    });

    const itemHeader = JSON.stringify({
      type: 'event',
      content_type: 'application/json',
    });

    const itemPayload = JSON.stringify(event);
    const body = `${envelopeHeader}\n${itemHeader}\n${itemPayload}\n`;

    if (typeof fetch === 'function') {
      await fetch(parsedDsn.envelopeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=float-sentry/1.0.0, sentry_key=${parsedDsn.publicKey}`,
        },
        body,
      });
    }
  } catch {
    // Never let telemetry errors disrupt user workflows
  }
}

/**
 * Captures an exception and dispatches it to Sentry if enabled.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): string | undefined {
  if (!isSentryEnabled() || !parsedDsn) return undefined;

  const eventId = generateEventId();
  const err = error instanceof Error ? error : new Error(String(error));

  const event: SentryEvent = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: typeof window !== 'undefined' ? 'javascript' : 'node',
    level: 'error',
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: err.message || 'Unknown error',
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split('\n')
                  .slice(1)
                  .map(line => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    extra: context,
    breadcrumbs: [...breadcrumbs],
    tags: {
      app: 'float-studio',
      environment: (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'production',
    },
  };

  sendSentryEnvelope(event).catch(() => undefined);
  return eventId;
}

/**
 * Captures an informational or error message and dispatches it to Sentry if enabled.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>
): string | undefined {
  if (!isSentryEnabled() || !parsedDsn) return undefined;

  const eventId = generateEventId();
  const event: SentryEvent = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: typeof window !== 'undefined' ? 'javascript' : 'node',
    level,
    message,
    extra: context,
    breadcrumbs: [...breadcrumbs],
    tags: {
      app: 'float-studio',
      environment: (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'production',
    },
  };

  sendSentryEnvelope(event).catch(() => undefined);
  return eventId;
}

/**
 * Reset helper for unit tests.
 */
export function resetSentryForTests(): void {
  parsedDsn = null;
  isInitialized = false;
  breadcrumbs.length = 0;
}
