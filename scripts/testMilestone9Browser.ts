import assert from 'assert';
import { BrowserAgentService } from '../src/server/browser/browserAgent';

console.log('=== FLOAT AI Milestone 9: Browser & Visual Agent Verification ===\n');

async function runTests() {
  try {
    // 1. Honest environment capability detection
    console.log('--- Test 1: Honest Capability Detection ---');
    const envStatus = BrowserAgentService.detectEnvironment();
    assert.strictEqual(typeof envStatus.isSupported, 'boolean', 'Returns boolean support status');
    assert.strictEqual(envStatus.driver, 'none', 'Reports no active headless driver in current environment');
    assert.ok(envStatus.statusMessage.includes('infrastructure'), 'Explicitly notes infrastructure dependency');
    console.log('[PASS] Honest capability detection verified (no faked browser executions)');

    // 2. SSRF Navigation Safety
    console.log('\n--- Test 2: SSRF & Internal Network Guards ---');
    const cloudMetadata = BrowserAgentService.validateUrlSafety('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(cloudMetadata.safe, false, 'Blocks AWS/GCP cloud metadata IP');
    assert.ok(cloudMetadata.error?.includes('blocked for security'), 'Returns security error');

    const localHost = BrowserAgentService.validateUrlSafety('http://localhost:3000/internal-admin');
    assert.strictEqual(localHost.safe, false, 'Blocks localhost navigation');

    const privateLan = BrowserAgentService.validateUrlSafety('http://192.168.1.1/router');
    assert.strictEqual(privateLan.safe, false, 'Blocks private RFC1918 LAN address');

    const validPublic = BrowserAgentService.validateUrlSafety('https://example.com/docs');
    assert.strictEqual(validPublic.safe, true, 'Permits valid public internet URL');
    console.log('[PASS] SSRF protection guards against internal infrastructure exfiltration');

    // 3. Dispatcher Execution Contract
    console.log('\n--- Test 3: Browser Action Dispatcher Contract ---');
    const actionResult = await BrowserAgentService.executeAction({
      type: 'navigate',
      url: 'https://example.com'
    });

    assert.strictEqual(actionResult.action, 'navigate', 'Action type recorded');
    // Because headless browser is not installed in current test runner, verifies it does not fabricate success:
    assert.strictEqual(actionResult.success, false, 'Reports requirement cleanly without fake success');
    assert.ok(actionResult.error?.includes('Infrastructure dependency'), 'Explains required infrastructure');
    console.log('[PASS] Action dispatcher contract honors live environment state');

    console.log('\n==================================================');
    console.log('Milestone 9 Browser Agent: All 3 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] Browser agent verification failed:', err);
    process.exit(1);
  }
}

runTests();
