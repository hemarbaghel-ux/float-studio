/**
 * FLOAT AI - Browser & Visual Agent Architecture (Phase 3 Real Playwright Driver)
 *
 * Implements sandboxed browser interaction:
 * - Feature-flagged Playwright driver (FLOAT_ENABLE_BROWSER_AGENT=true)
 * - Honest capability detection (verifies both feature flag and Playwright/Chromium executable)
 * - When Playwright or Chromium is absent, every action returns success: false with actionable setup steps
 * - Navigation safety: hostname SSRF blocklist + DNS resolution checks against private/loopback/metadata IPs
 */

import dns from 'dns';
import fs from 'fs';
import net from 'net';

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'select' | 'screenshot' | 'inspect_console' | 'get_text';
  url?: string;
  selector?: string;
  text?: string;
  options?: Record<string, any>;
}

export interface BrowserActionResult {
  success: boolean;
  action: BrowserAction['type'];
  url: string;
  title?: string;
  textExcerpt?: string;
  consoleErrors: string[];
  networkErrors: string[];
  screenshotBase64?: string;
  error?: string;
  setupSteps?: string[];
}

export interface BrowserEnvironmentStatus {
  isSupported: boolean;
  featureFlagEnabled: boolean;
  driver: 'playwright' | 'none';
  executableFound: boolean;
  executablePath?: string;
  statusMessage: string;
  setupSteps: string[];
}

const BLOCKED_HOST_PATTERNS = [
  /^169\.254\./,        // Cloud instance metadata
  /^127\./,             // Loopback
  /^0\./,               // Unspecified
  /^localhost$/i,
  /\.localhost$/i,
  /\.internal$/i,
  /^metadata\.google\.internal$/i,
  /^::1$/,
  /^\[::1\]$/,
  /^10\./,              // Private RFC1918
  /^192\.168\./,        // Private RFC1918
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private RFC1918
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./ // CGNAT RFC6598
];

const BROWSER_SETUP_STEPS = [
  '1. Install Playwright and Chromium: npx playwright install --with-deps chromium',
  '2. Enable the browser agent feature flag: set FLOAT_ENABLE_BROWSER_AGENT=true in the server environment',
  '3. Restart the FLOAT server and verify GET /api/browser/status reports isSupported: true'
];

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  return dns.promises.lookup(hostname, { all: true });
};

export class BrowserAgentService {
  private static customDnsLookup: DnsLookupFn | null = null;

  static setDnsLookupForTests(fn: DnsLookupFn | null): void {
    this.customDnsLookup = fn;
  }

  /**
   * Checks whether an IPv4 or IPv6 literal belongs to a private, loopback, link-local,
   * unspecified, or cloud metadata range.
   */
  static isPrivateOrReservedIp(ipRaw: string): boolean {
    const ip = ipRaw.trim().replace(/^\[|\]$/g, '').toLowerCase();

    // IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
    if (ip.startsWith('::ffff:')) {
      const v4Part = ip.slice('::ffff:'.length);
      if (net.isIPv4(v4Part)) {
        return this.isPrivateOrReservedIp(v4Part);
      }
    }

    if (net.isIPv4(ip)) {
      const octets = ip.split('.').map((n) => parseInt(n, 10));
      if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;
      const [a, b] = octets;
      if (a === 0) return true; // 0.0.0.0/8
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 127) return true; // 127.0.0.0/8 loopback
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
      if (a >= 224) return true; // Multicast & reserved
      return false;
    }

    if (net.isIPv6(ip)) {
      if (ip === '::' || ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === '0:0:0:0:0:0:0:0') {
        return true;
      }
      // Unique local addresses fc00::/7 (fc00..fdff)
      if (ip.startsWith('fc') || ip.startsWith('fd')) {
        return true;
      }
      // Link-local fe80::/10
      if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
        return true;
      }
      // Multicast ff00::/8
      if (ip.startsWith('ff')) {
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Synchronous URL & hostname SSRF validation.
   */
  static validateUrlSafety(rawUrl: string): { safe: boolean; error?: string } {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, error: 'Only http and https protocols are permitted for browser navigation.' };
      }

      const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
      for (const pattern of BLOCKED_HOST_PATTERNS) {
        if (pattern.test(hostname)) {
          return { safe: false, error: `Access to internal host "${hostname}" is blocked for security.` };
        }
      }

      if (net.isIP(hostname) && this.isPrivateOrReservedIp(hostname)) {
        return { safe: false, error: `Access to private or reserved IP "${hostname}" is blocked for security.` };
      }

      return { safe: true };
    } catch {
      return { safe: false, error: 'Invalid URL specified.' };
    }
  }

  /**
   * Asynchronous URL + DNS resolution check against private/loopback/metadata IP ranges (prevents DNS rebinding/aliasing).
   */
  static async validateUrlAndDnsSafety(rawUrl: string): Promise<{ safe: boolean; error?: string; resolvedAddresses?: string[] }> {
    const syncCheck = this.validateUrlSafety(rawUrl);
    if (!syncCheck.safe) {
      return syncCheck;
    }

    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

    if (net.isIP(hostname)) {
      if (this.isPrivateOrReservedIp(hostname)) {
        return { safe: false, error: `Access to private or reserved IP "${hostname}" is blocked for security.` };
      }
      return { safe: true, resolvedAddresses: [hostname] };
    }

    const lookup = this.customDnsLookup || defaultDnsLookup;
    try {
      const records = await lookup(hostname);
      if (!Array.isArray(records) || records.length === 0) {
        return { safe: false, error: `DNS resolution returned no records for "${hostname}".` };
      }
      const addresses: string[] = [];
      for (const rec of records) {
        const addr = String(rec.address || '').trim();
        addresses.push(addr);
        if (this.isPrivateOrReservedIp(addr)) {
          return {
            safe: false,
            error: `Host "${hostname}" resolved to restricted private/internal IP "${addr}", which is blocked for security.`
          };
        }
      }
      return { safe: true, resolvedAddresses: addresses };
    } catch (err: any) {
      return {
        safe: false,
        error: `DNS resolution failed for host "${hostname}": ${err.message || 'lookup error'}`
      };
    }
  }

  /**
   * Honest environment check: verifies feature flag and headless Chromium executable availability.
   */
  static detectEnvironment(): BrowserEnvironmentStatus {
    const featureFlagEnabled = process.env.FLOAT_ENABLE_BROWSER_AGENT === 'true';
    const candidatePaths = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      process.env.CHROMIUM_PATH,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable'
    ].filter((p): p is string => Boolean(p && p.trim()));

    let executablePath: string | undefined;
    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      } catch {}
    }

    // Check if playwright package is resolvable
    let playwrightInstalled = false;
    try {
      require.resolve('playwright');
      playwrightInstalled = true;
    } catch {
      try {
        require.resolve('playwright-core');
        playwrightInstalled = true;
      } catch {}
    }

    const executableFound = Boolean(executablePath);
    const isSupported = featureFlagEnabled && playwrightInstalled && executableFound;

    if (!featureFlagEnabled) {
      return {
        isSupported: false,
        featureFlagEnabled: false,
        driver: 'none',
        executableFound,
        executablePath,
        statusMessage:
          'Browser agent infrastructure is disabled (FLOAT_ENABLE_BROWSER_AGENT is not set to true). Follow setupSteps to enable headless Chromium / Playwright.',
        setupSteps: BROWSER_SETUP_STEPS
      };
    }

    if (!playwrightInstalled || !executableFound) {
      return {
        isSupported: false,
        featureFlagEnabled: true,
        driver: 'none',
        executableFound,
        executablePath,
        statusMessage:
          'Browser agent requires Playwright and headless Chromium infrastructure, which were not found in the current container runtime.',
        setupSteps: BROWSER_SETUP_STEPS
      };
    }

    return {
      isSupported: true,
      featureFlagEnabled: true,
      driver: 'playwright',
      executableFound: true,
      executablePath,
      statusMessage: 'Playwright headless Chromium driver is active.',
      setupSteps: []
    };
  }

  /**
   * Dispatches a browser action via Playwright when supported, or returns success: false with setup steps.
   * Never returns success: true without acting.
   */
  static async executeAction(action: BrowserAction): Promise<BrowserActionResult> {
    if (action.url) {
      const safety = await this.validateUrlAndDnsSafety(action.url);
      if (!safety.safe) {
        return {
          success: false,
          action: action.type,
          url: action.url,
          consoleErrors: [],
          networkErrors: [],
          error: safety.error
        };
      }
    } else if (action.type === 'navigate') {
      return {
        success: false,
        action: 'navigate',
        url: '',
        consoleErrors: [],
        networkErrors: [],
        error: 'A target URL is required for navigate action.'
      };
    }

    const env = this.detectEnvironment();
    if (!env.isSupported) {
      return {
        success: false,
        action: action.type,
        url: action.url || '',
        consoleErrors: [],
        networkErrors: [],
        error: `Infrastructure dependency: ${env.statusMessage}`,
        setupSteps: env.setupSteps
      };
    }

    let browser: any = null;
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    try {
      // Dynamic import of playwright / playwright-core
      let pw: any;
      try {
        pw = await import(/* @vite-ignore */ 'playwright' as string);
      } catch {
        pw = await import(/* @vite-ignore */ 'playwright-core' as string);
      }

      browser = await pw.chromium.launch({
        headless: true,
        executablePath: env.executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
      });
      const page = await context.newPage();

      // Guard all sub-requests and redirects against SSRF & private DNS resolution
      await page.route('**/*', async (route: any) => {
        const reqUrl = route.request().url();
        const check = await this.validateUrlAndDnsSafety(reqUrl);
        if (!check.safe) {
          networkErrors.push(`Blocked unsafe request "${reqUrl}": ${check.error}`);
          await route.abort('accessdenied');
          return;
        }
        await route.continue();
      });

      page.on('console', (msg: any) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      page.on('requestfailed', (req: any) => {
        networkErrors.push(`${req.method()} ${req.url()} failed: ${req.failure()?.errorText || 'unknown'}`);
      });

      const timeoutMs = Number(action.options?.timeoutMs) || 15000;

      if (action.url) {
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      }

      if (action.type === 'click') {
        if (!action.selector) throw new Error('selector is required for click action.');
        await page.click(action.selector, { timeout: timeoutMs });
      } else if (action.type === 'type') {
        if (!action.selector) throw new Error('selector is required for type action.');
        await page.fill(action.selector, action.text || '', { timeout: timeoutMs });
      } else if (action.type === 'select') {
        if (!action.selector) throw new Error('selector is required for select action.');
        await page.selectOption(action.selector, action.text || '', { timeout: timeoutMs });
      }

      const title = await page.title().catch(() => '');
      const currentUrl = page.url();
      let textExcerpt: string | undefined;
      let screenshotBase64: string | undefined;

      if (action.type === 'get_text' || action.type === 'navigate') {
        const rawText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        textExcerpt = String(rawText).slice(0, 4000);
      }

      if (action.type === 'screenshot') {
        const buf: Buffer = await page.screenshot({ type: 'png', fullPage: false });
        screenshotBase64 = buf.toString('base64');
      }

      return {
        success: true,
        action: action.type,
        url: currentUrl,
        title,
        textExcerpt,
        consoleErrors,
        networkErrors,
        screenshotBase64
      };
    } catch (err: any) {
      return {
        success: false,
        action: action.type,
        url: action.url || '',
        consoleErrors,
        networkErrors,
        error: `Playwright execution failed: ${err.message || String(err)}`
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
    }
  }
}
