import assert from 'assert';
import { normalizeGeminiError } from '../src/server/providers/gemini';

function runErrorResilienceTests() {
  console.log('=== FLOAT AI: Error Resilience & Cancellation Verification ===\n');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. normalizeGeminiError recognizes object cancellation
  test('normalizeGeminiError parses {type: "cancelation", msg: "operation is manually canceled"} as AbortError', () => {
    const rawError = { type: 'cancelation', msg: 'operation is manually canceled' };
    const normalized = normalizeGeminiError(rawError);

    assert.strictEqual((normalized as any).name, 'AbortError');
    assert.strictEqual((normalized as any).type, 'cancelation');
    assert.strictEqual(normalized.message, 'Operation was cancelled.');
  });

  // 2. normalizeGeminiError recognizes stringified JSON cancellation
  test('normalizeGeminiError parses JSON string {"type":"cancelation","msg":"operation is manually canceled"} as AbortError', () => {
    const jsonStr = JSON.stringify({ type: 'cancelation', msg: 'operation is manually canceled' });
    const normalized = normalizeGeminiError(jsonStr);

    assert.strictEqual((normalized as any).name, 'AbortError');
    assert.strictEqual((normalized as any).type, 'cancelation');
  });

  // 3. Firestore idle stream log filter function
  test('Firestore idle stream log messages are detected and filtered', () => {
    const isBenignFirestoreLog = (msg: string) => {
      return (
        msg.includes('Disconnecting idle stream') ||
        msg.includes('Timed out waiting for new targets') ||
        msg.includes("GrpcConnection RPC 'Listen' stream") ||
        msg.includes('operation is manually canceled')
      );
    };

    const idleLog = "@firebase/firestore: Firestore (12.18.0): GrpcConnection RPC 'Listen' stream 0x5344264f error. Code: 1 Message: 1 CANCELLED: Disconnecting idle stream. Timed out waiting for new targets.";
    assert.strictEqual(isBenignFirestoreLog(idleLog), true);

    const realError = "Missing or insufficient permissions for path /projects/p1";
    assert.strictEqual(isBenignFirestoreLog(realError), false);
  });

  // 4. Global unhandledrejection cancellation guard
  test('Global unhandledrejection cancellation guard flags cancellation errors', () => {
    const isCancellationRejection = (reason: any) => {
      const reasonStr = typeof reason === 'string' 
        ? reason 
        : (reason?.message || reason?.msg || JSON.stringify(reason || ''));

      return (
        reason?.type === 'cancelation' ||
        reason?.type === 'cancelled' ||
        reason?.name === 'AbortError' ||
        reasonStr.includes('operation is manually canceled') ||
        reasonStr.includes('cancelation') ||
        /cancel/i.test(reasonStr)
      );
    };

    assert.strictEqual(isCancellationRejection({ type: 'cancelation', msg: 'operation is manually canceled' }), true);
    assert.strictEqual(isCancellationRejection(new Error('Operation cancelled by user')), true);
    assert.strictEqual(isCancellationRejection('{"type":"cancelation","msg":"operation is manually canceled"}'), true);
    assert.strictEqual(isCancellationRejection(new Error('Unexpected network failure')), false);
  });

  console.log(`\n======================================================`);
  console.log(`Error Resilience Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runErrorResilienceTests();
