import type { ModelInfo, Plan } from './types';

export const MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', description: 'Deep reasoning for large refactors', speed: 'High', pro: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', description: 'Fast, capable everyday agent', speed: 'Balanced' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', provider: 'gemini', description: 'Lowest latency edits', speed: 'Fast' },
  { id: 'openai:custom', label: 'OpenAI-compatible', provider: 'openai', description: 'Model set in Integrations', speed: 'Balanced' },
  { id: 'float-demo', label: 'Float Demo', provider: 'demo', description: 'Offline simulated agent, no key needed', speed: 'Fast' },
];

export const PLAN_LIMITS: Record<Plan, { requests: number; label: string; price: string }> = {
  free: { requests: 50, label: 'Free Plan', price: '$0' },
  pro: { requests: 500, label: 'Pro', price: '$20' },
  ultra: { requests: 5000, label: 'Ultra', price: '$200' },
};

export function modelById(id: string) {
  return MODELS.find((m) => m.id === id);
}

/**
 * "Auto" routing: picks a model based on configured providers and prompt complexity,
 * like Cursor's Auto. Long / multi-step / refactor-ish prompts go to the High tier.
 */
export function routeAuto(prompt: string, opts: { hasGemini: boolean; hasOpenAI: boolean; plan: Plan; maxMode: boolean }): ModelInfo {
  const complex =
    opts.maxMode ||
    prompt.length > 280 ||
    /\b(refactor|architect|debug|race condition|migrate|optimi[sz]e|design|full[- ]stack|dashboard|multi|entire|whole)\b/i.test(prompt);
  if (opts.hasGemini) {
    if (complex && opts.plan !== 'free') return modelById('gemini-2.5-pro')!;
    return modelById(complex ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite')!;
  }
  if (opts.hasOpenAI) return modelById('openai:custom')!;
  return modelById('float-demo')!;
}
