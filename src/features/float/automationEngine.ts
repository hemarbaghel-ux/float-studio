import { useEffect } from 'react';
import { auth } from '../../lib/firebase';
import { useIDEStore } from '../../store';
import { useAIStore } from '../../store/aiStore';
import { ConsentService } from '../../services/consentService';
import { isAutomationOwnedBy, useAutomations, type Automation } from './automationStore';
import { buildAutomationChatRequest } from './automationRequest';
const inFlight = new Set<string>();

async function notifySlack(webhook: string, a: Automation, status: string, output: string) {
  try {
    // Slack incoming webhooks reject preflighted requests from browsers; a simple form POST works.
    const body = new URLSearchParams({
      payload: JSON.stringify({ text: `*FLOAT automation* "${a.name}" ${status}\n\n${output.slice(0, 2800)}` }),
    });
    await fetch(webhook, { method: 'POST', mode: 'no-cors', body });
  } catch (err) {
    console.warn('Slack notification failed', err);
  }
}

/** Run an automation once using the server-side model router (/api/ai/chat). */
export async function runAutomation(id: string): Promise<void> {
  const store = useAutomations.getState();
  const a = store.automations.find((x) => x.id === id);
  const user = auth.currentUser;
  // Automations are stored in browser-local storage. Never run legacy or
  // another account's record using the currently signed-in user's session.
  if (!a || !user || !isAutomationOwnedBy(a, user.uid) || inFlight.has(id)) return;
  inFlight.add(id);
  const runId = store.startRun(id);
  try {
    const token = await user.getIdToken();
    const workspace = useIDEStore.getState();
    const requestBody = buildAutomationChatRequest({
      automation: a,
      files: workspace.files,
      projectId: workspace.projectId,
      projectName: workspace.projectName,
      model: useAIStore.getState().selectedModel,
    });
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Float-Data-Sharing': ConsentService.isSharingAllowed() ? 'true' : 'false',
      },
      body: JSON.stringify(requestBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('The model returned an empty response. Please try again.');
    useAutomations.getState().finishRun(id, runId, 'success', text);
    if (a.slackWebhook) await notifySlack(a.slackWebhook, a, 'finished', text);
  } catch (err: any) {
    const msg = err?.message || String(err);
    useAutomations.getState().finishRun(id, runId, 'error', msg);
    if (a.slackWebhook) await notifySlack(a.slackWebhook, a, 'failed', msg);
  } finally {
    inFlight.delete(id);
  }
}

/** Checks every 15s for due automations while the app is open. Mount once (in Dashboard). */
export function useAutomationScheduler() {
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const ownerId = auth.currentUser?.uid;
      if (!ownerId) return;
      for (const a of useAutomations.getState().automations) {
        if (isAutomationOwnedBy(a, ownerId) && a.enabled && a.trigger !== 'manual' && a.nextRunAt && a.nextRunAt <= now) void runAutomation(a.id);
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);
}
