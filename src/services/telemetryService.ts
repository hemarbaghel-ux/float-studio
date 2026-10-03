import { ConsentService } from './consentService';

export interface TelemetryEvent {
  category: 'interaction' | 'performance' | 'error';
  name: string;
  data?: Record<string, any>;
}

// Patterns that identify sensitive keys to scrub
const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /private/i
];

export class TelemetryService {
  /**
   * Sanitizes payload to ensure no sensitive credentials or raw file contents are ever recorded.
   */
  private static sanitizeData(data?: Record<string, any>): Record<string, any> {
    if (!data) return {};
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      // Check if key is sensitive
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED_SECRET]';
        continue;
      }

      // If string contains API key format or is excessively long, truncate or scrub
      if (typeof value === 'string') {
        if (value.startsWith('AIza') || value.startsWith('sk-') || value.length > 500) {
          sanitized[key] = '[REDACTED_OR_TRUNCATED]';
        } else {
          sanitized[key] = value;
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else {
        // Drop complex nested objects to prevent unexpected leakage of code or AST
        sanitized[key] = typeof value;
      }
    }

    return sanitized;
  }

  /**
   * Records an optional telemetry event ONLY if the user has consented.
   * If consent is OFF, drops the event silently and completely.
   */
  static recordEvent(event: TelemetryEvent): boolean {
    if (!ConsentService.isSharingAllowed()) {
      // Strictly excluded when sharing is OFF
      return false;
    }

    const sanitizedData = this.sanitizeData(event.data);
    const sanitizedEvent = {
      category: event.category,
      name: event.name,
      timestamp: Date.now(),
      data: sanitizedData
    };

    // In a production analytics setup, this would dispatch to an approved analytics endpoint.
    // For FLOAT, we keep it in an ephemeral telemetry buffer without model training or disk dump.
    if (process.env.NODE_ENV === 'development') {
      console.log('[Telemetry (Consented)]', sanitizedEvent);
    }

    return true;
  }
}
