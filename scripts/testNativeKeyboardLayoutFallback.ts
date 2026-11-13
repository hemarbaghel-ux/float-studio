import assert from 'node:assert/strict';
import { isLinuxUsKeyboardLayout } from '../desktop/src/vs/platform/keyboardLayout/common/keyboardLayoutFallback.js';

assert.equal(isLinuxUsKeyboardLayout(null), false, 'null metadata must select fallback mapping');
assert.equal(isLinuxUsKeyboardLayout({}), false, 'missing layout must select fallback mapping');
assert.equal(isLinuxUsKeyboardLayout({ group: 0 }), false, 'undefined layout must not throw');
assert.equal(isLinuxUsKeyboardLayout({ layout: 'us', group: 0 }), true, 'US layout must be recognized');
assert.equal(isLinuxUsKeyboardLayout({ layout: 'us,de', group: 1 }), false, 'active non-US group must be respected');
assert.equal(isLinuxUsKeyboardLayout({ layout: 'de,us', group: 1 }), true, 'active US group must be recognized');
assert.equal(isLinuxUsKeyboardLayout({ layout: 'us', group: 7 }), false, 'out-of-range group must fail closed');
assert.equal(isLinuxUsKeyboardLayout({ layout: 'us', group: '0' }), true, 'invalid group metadata must fall back to first layout');

console.log('[PASS] Linux keyboard metadata fallback covers absent and malformed native data');
