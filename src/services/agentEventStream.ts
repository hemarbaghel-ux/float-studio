import { auth } from '../lib/firebase';
import type { AgentEvent } from '../types/agents';

/** Authenticated SSE client with Last-Event-ID replay and bounded reconnect backoff. */
export async function streamAgentTaskEvents(taskId: string, onEvent: (event: AgentEvent) => void, signal: AbortSignal): Promise<void> {
  let cursor = '';
  let delayMs = 500;
  while (!signal.aborted) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Agent events require an authenticated session.');
      const token = await user.getIdToken();
      const response = await fetch(`/api/agents/tasks/${encodeURIComponent(taskId)}/events/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', ...(cursor ? { 'Last-Event-ID': cursor } : {}) },
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`Agent event stream returned HTTP ${response.status}.`);
      delayMs = 500;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseFrame(frame);
          if (event?.id) cursor = event.id;
          if (event?.data) {
            try { onEvent(JSON.parse(event.data) as AgentEvent); } catch { /* Ignore malformed individual event frames. */ }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      await reader.cancel().catch(() => undefined);
    } catch (error) {
      if (signal.aborted) return;
      console.warn(`[FLOAT] Agent event stream for task ${taskId} disconnected; reconnecting.`, error);
    }
    if (signal.aborted) return;
    await wait(delayMs, signal);
    delayMs = Math.min(delayMs * 2, 15_000);
  }
}

function parseFrame(frame: string): { id?: string; data?: string } | null {
  if (!frame || frame.startsWith(':')) return null;
  let id: string | undefined;
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return { id, data: data.length ? data.join('\n') : undefined };
}

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const onAbort = () => { clearTimeout(timer); done(); };
    const timer = setTimeout(done, delayMs);
    function done() { signal.removeEventListener('abort', onAbort); resolve(); }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
