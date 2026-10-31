import assert from 'assert';
import { BrowserAgentService } from '../src/server/browser/browserAgent';

console.log('=== FLOAT AI Phase 3: Browser & Visual Agent Verification ===\n');

async function runTests() {
  try {
    // 1. Honest environment capability detection & Setup Steps
    console.log('--- Test 1: Honest Capability Detection & Setup Steps ---');
    const prevFlag = process.env.FLOAT_ENABLE_BROWSER_AGENT;
    delete process.env.FLOAT_ENABLE_BROWSER_AGENT;

    const envStatus = BrowserAgentService.detectEnvironment();
    assert.strictEqual(typeof envStatus.isSupported, 'boolean', 'Returns boolean support status');
    assert.strictEqual(envStatus.isSupported, false, 'isSupported is false when feature flag is off or binary absent');
    assert.strictEqual(envStatus.driver, 'none', 'Reports no active headless driver when disabled');
    assert.ok(Array.isArray(envStatus.setupSteps) && envStatus.setupSteps.length >= 2, 'Provides actionable setupSteps');

    if (prevFlag !== undefined) process.env.FLOAT_ENABLE_BROWSER_AGENT = prevFlag;
    console.log('[PASS] Honest capability detection verified (no faked browser executions)');

    // 2. Hostname & IP Literal SSRF Navigation Safety
    console.log('\n--- Test 2: Hostname & IP Literal SSRF Guards ---');
    const cloudMetadata = BrowserAgentService.validateUrlSafety('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(cloudMetadata.safe, false, 'Blocks AWS/GCP cloud metadata IP');
    assert.ok(cloudMetadata.error?.includes('blocked for security'), 'Returns security error');

    const localHost = BrowserAgentService.validateUrlSafety('http://localhost:3000/internal-admin');
    assert.strictEqual(localHost.safe, false, 'Blocks localhost navigation');

    const privateLan = BrowserAgentService.validateUrlSafety('http://192.168.1.1/router');
    assert.strictEqual(privateLan.safe, false, 'Blocks private RFC1918 LAN address');

    const ipv6Loopback = BrowserAgentService.validateUrlSafety('http://[::1]:8080/status');
    assert.strictEqual(ipv6Loopback.safe, false, 'Blocks IPv6 loopback [::1]');

    const validPublic = BrowserAgentService.validateUrlSafety('https://example.com/docs');
    assert.strictEqual(validPublic.safe, true, 'Permits valid public internet URL');
    console.log('[PASS] Hostname and literal IP SSRF guards verified');

    // 3. DNS-Resolution SSRF Checks Against Private IPs (Rebinding Protection)
    console.log('\n--- Test 3: DNS-Resolution SSRF Checks Against Private IPs ---');
    BrowserAgentService.setDnsLookupForTests(async (hostname) => {
      if (hostname === 'rebind-loopback.attacker.example') {
        return [{ address: '127.0.0.1', family: 4 }];
      }
      if (hostname === 'rebind-metadata.attacker.example') {
        return [{ address: '169.254.169.254', family: 4 }];
      }
      if (hostname === 'rebind-rfc1918.attacker.example') {
        return [{ address: '10.24.0.5', family: 4 }];
      }
      if (hostname === 'rebind-ipv6-ula.attacker.example') {
        return [{ address: 'fd00::1234', family: 6 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    });

    const dnsLoopback = await BrowserAgentService.validateUrlAndDnsSafety('https://rebind-loopback.attacker.example/pwn');
    assert.strictEqual(dnsLoopback.safe, false, 'Blocks domain resolving to 127.0.0.1 via DNS');
    assert.ok(dnsLoopback.error?.includes('127.0.0.1'), 'Reports restricted resolved IP 127.0.0.1');

    const dnsMetadata = await BrowserAgentService.validateUrlAndDnsSafety('https://rebind-metadata.attacker.example/iam');
    assert.strictEqual(dnsMetadata.safe, false, 'Blocks domain resolving to 169.254.169.254 via DNS');

    const dnsRfc1918 = await BrowserAgentService.validateUrlAndDnsSafety('https://rebind-rfc1918.attacker.example/');
    assert.strictEqual(dnsRfc1918.safe, false, 'Blocks domain resolving to 10.24.0.5 via DNS');

    const dnsIpv6Ula = await BrowserAgentService.validateUrlAndDnsSafety('https://rebind-ipv6-ula.attacker.example/');
    assert.strictEqual(dnsIpv6Ula.safe, false, 'Blocks domain resolving to IPv6 ULA fd00::1234 via DNS');

    const dnsPublic = await BrowserAgentService.validateUrlAndDnsSafety('https://example.com/docs');
    assert.strictEqual(dnsPublic.safe, true, 'Permits domain resolving to public IP 93.184.216.34');

    // Ensure executeAction also blocks DNS-rebound URLs with success: false
    const actionOnReboundUrl = await BrowserAgentService.executeAction({
      type: 'navigate',
      url: 'https://rebind-metadata.attacker.example/iam'
    });
    assert.strictEqual(actionOnReboundUrl.success, false, 'executeAction rejects DNS-rebound URL with success:false');
    assert.ok(actionOnReboundUrl.error?.includes('169.254.169.254'), 'executeAction error cites private DNS resolution');
    console.log('[PASS] DNS-resolution SSRF protection blocks private/loopback/metadata IP rebinding');

    // 4. Dispatcher Execution Contract: Never Returns Fake Success
    console.log('\n--- Test 4: Browser Action Dispatcher Never Reports Fake Success ---');
    const actionTypes: Array<'navigate' | 'click' | 'type' | 'select' | 'screenshot' | 'inspect_console' | 'get_text'> = [
      'navigate',
      'click',
      'type',
      'select',
      'screenshot',
      'inspect_console',
      'get_text'
    ];

    for (const type of actionTypes) {
      const actionResult = await BrowserAgentService.executeAction({
        type,
        url: 'https://example.com',
        selector: '#btn',
        text: 'hello'
      });
      assert.strictEqual(actionResult.action, type, `Action type ${type} recorded`);
      assert.strictEqual(actionResult.success, false, `Action ${type} returns success: false when Playwright/Chromium is unconfigured`);
      assert.ok(Array.isArray(actionResult.setupSteps) && actionResult.setupSteps.length > 0, `Action ${type} includes setupSteps`);
    }
    console.log('[PASS] Every action returns success: false with setupSteps when browser driver is absent');

    console.log('\n==================================================');
    console.log('Phase 3 Browser Agent: All 4 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] Browser agent verification failed:', err);
    process.exit(1);
  } finally {
    BrowserAgentService.setDnsLookupForTests(null);
  }
}

void runTests();
