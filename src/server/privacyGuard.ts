/**
 * Server-Side Privacy Guard for FLOAT AI
 * Enforces user consent preferences across model routing, agent loops, and evaluation execution.
 */

export class ServerPrivacyGuard {
  /**
   * Evaluates consent from HTTP headers or request body.
   * Defaults strictly to FALSE (opt-in only / privacy by default).
   */
  static evaluateConsent(req?: any, explicitConsent?: boolean): boolean {
    if (explicitConsent !== undefined) {
      return explicitConsent === true;
    }

    if (!req) return false;

    // Check request header (e.g. X-Float-Data-Sharing)
    const headerValue = req.headers?.['x-float-data-sharing'];
    if (headerValue === 'true' || headerValue === '1') {
      return true;
    }

    // Check request body
    if (req.body?.dataSharingAllowed === true || req.body?.dataSharingConsent === true) {
      return true;
    }

    // Default to OFF for privacy
    return false;
  }

  /**
   * Sanitizes payloads, redacting sensitive tokens, passwords, and API keys.
   */
  static sanitizeForLogs(data: any): any {
    if (!data) return data;
    if (typeof data === 'string') {
      if (data.includes('AIza') || data.includes('sk-') || data.length > 500) {
        return '[REDACTED_OR_TRUNCATED]';
      }
      return data;
    }

    if (typeof data === 'object') {
      const sanitized: Record<string, any> = Array.isArray(data) ? [] : {};
      for (const [key, value] of Object.entries(data)) {
        if (/key|secret|token|password|auth|credential/i.test(key)) {
          sanitized[key] = '[REDACTED_SECRET]';
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeForLogs(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Logs a message with privacy awareness. When data sharing is OFF, excludes prompt and output content.
   */
  static logAudit(source: string, action: string, dataSharingConsent: boolean, details?: any) {
    const status = dataSharingConsent ? 'Telemetry: OPTED-IN' : 'Telemetry: DISABLED (Privacy Mode)';
    const cleanDetails = dataSharingConsent ? this.sanitizeForLogs(details) : undefined;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PrivacyGuard][${source}] ${action} | ${status}`, cleanDetails || '');
    }
  }

  /**
   * Blocks transmission of data to external telemetry or third-party datasets if consent is OFF.
   * Returns true if dispatch was allowed, or false if blocked.
   */
  static dispatchExternalTelemetry(
    pipelineName: string,
    dataSharingConsent: boolean,
    payload: any
  ): boolean {
    if (!dataSharingConsent) {
      // Strictly blocked
      return false;
    }

    // When consented, ensure payload is sanitized before any dispatch
    const sanitized = this.sanitizeForLogs(payload);
    // In production, this would send to an approved internal telemetry collector.
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Telemetry Dispatch -> ${pipelineName}]`, sanitized);
    }
    return true;
  }
}
