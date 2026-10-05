/** Bounds provider I/O even when a client stays connected to a stalled upstream. */
export function providerRequestSignal(callerSignal?: AbortSignal, timeoutMs = 120_000): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}
