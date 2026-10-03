import { nanoid } from 'nanoid';
import { getState } from '../store';
import { modelById, PLAN_LIMITS, routeAuto } from '../models';
import type { Attachment, Message, MessagePart, ModelInfo } from '../types';
import { executeTool, TOOL_SPECS } from './tools';
import { demoProvider } from './demo';
import { geminiProvider, openaiProvider, type HistItem, type Provider } from './providers';

const controllers = new Map<string, AbortController>();

export function stopAgent(chatId: string) {
  controllers.get(chatId)?.abort();
}

export function isRunning(chatId: string) {
  return controllers.has(chatId);
}

function resolveModel(prompt: string): { model: ModelInfo; apiModel: string; provider: Provider; note?: string } {
  const { settings, modelConfig, user } = getState();
  const hasGemini = !!settings.geminiKey.trim();
  const hasOpenAI = !!settings.openaiKey.trim();
  let model =
    modelConfig.model === 'auto'
      ? routeAuto(prompt, { hasGemini, hasOpenAI, plan: user.plan, maxMode: modelConfig.maxMode })
      : (modelById(modelConfig.model) ?? modelById('float-demo')!);
  let note: string | undefined;

  if (model.pro && user.plan === 'free') {
    note = `${model.label} requires Pro — used Gemini 2.5 Flash instead.`;
    model = modelById('gemini-2.5-flash')!;
  }
  if (model.provider === 'gemini' && !hasGemini) {
    note = `No Gemini key configured — ran with the offline Float Demo agent. Add a key in Integrations.`;
    model = modelById('float-demo')!;
  }
  if (model.provider === 'openai' && !hasOpenAI) {
    note = `No OpenAI-compatible key configured — ran with the offline Float Demo agent.`;
    model = modelById('float-demo')!;
  }
  const provider =
    model.provider === 'gemini'
      ? geminiProvider(settings.geminiKey.trim())
      : model.provider === 'openai'
        ? openaiProvider(settings.openaiKey.trim(), settings.openaiBaseUrl || 'https://api.openai.com/v1')
        : demoProvider;
  const apiModel = model.provider === 'openai' ? settings.openaiModel || 'gpt-4.1-mini' : model.id;
  return { model, apiModel, provider, note };
}

function systemPrompt(mode: 'agent' | 'ask') {
  const { codebase, cloud, settings } = getState();
  const files = Object.keys(codebase.files).sort();
  return [
    'You are FLOAT, an expert AI coding agent embedded in a browser IDE (similar to Cursor).',
    'You operate on a virtual workspace of files. Be concise, precise and professional. Use Markdown with fenced code blocks.',
    mode === 'agent'
      ? 'AGENT MODE: use tools to inspect and modify files. Always read a file before editing it. Prefer edit_file for targeted changes and write_file for new files. After making changes, briefly summarize what changed and why. Do not paste whole files in chat if you already wrote them with a tool.'
      : 'ASK MODE: you may read and search files but must NOT modify them. Answer questions and propose code in fenced blocks.',
    `Cloud session: ${cloud.active ? `ACTIVE (${cloud.region}, ${cloud.machine}) — run_command is available.` : 'INACTIVE — run_command will fail; tell the user to start a session if commands are needed.'}`,
    'HTML entry files can be previewed in the Codebase Preview tab; local <link>/<script> references are inlined automatically.',
    `Workspace "${codebase.name}" files (${files.length}):\n${files.slice(0, 300).join('\n') || '(empty)'}`,
    settings.customInstructions ? `User rules:\n${settings.customInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function attachmentText(atts: Attachment[] = []) {
  return atts
    .filter((a) => a.text != null)
    .map((a) => `\n\n<attached_file name="${a.name}">\n${a.text!.slice(0, 50_000)}\n</attached_file>`)
    .join('');
}

function messageToHistory(m: Message): HistItem[] {
  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') + attachmentText(m.attachments);
    return [
      {
        role: 'user',
        text,
        images: (m.attachments ?? [])
          .filter((a) => a.dataUrl)
          .map((a) => ({ mime: a.mime, data: a.dataUrl!.split(',')[1] ?? '' })),
      },
    ];
  }
  // Collapse past assistant turns into text (tool activity summarized) — robust across providers.
  const text = m.parts
    .map((p) =>
      p.type === 'text'
        ? p.text
        : p.type === 'tool'
          ? `\n[used ${p.call.name}(${JSON.stringify(p.call.args).slice(0, 120)}) → ${(p.call.result ?? '').slice(0, 200)}]\n`
          : '',
    )
    .join('');
  return text.trim() ? [{ role: 'assistant', text, toolCalls: [] }] : [];
}

export interface RunOptions {
  chatId: string;
  prompt: string;
  attachments?: Attachment[];
}

export async function runAgent({ chatId, prompt, attachments }: RunOptions): Promise<{ text: string; ok: boolean }> {
  const s = getState();
  if (controllers.has(chatId)) return { text: 'Agent already running', ok: false };

  const chat = s.chats.find((c) => c.id === chatId);
  if (!chat) return { text: 'Chat not found', ok: false };

  const userMsg: Message = {
    id: nanoid(10),
    role: 'user',
    createdAt: Date.now(),
    parts: [{ type: 'text', text: prompt }],
    attachments,
    checkpoint: s.snapshot(),
  };
  const prior = chat.messages;
  s.appendMessage(chatId, userMsg);
  if (chat.title === 'New chat') s.renameChat(chatId, titleFrom(prompt));

  const { model, apiModel, provider, note } = resolveModel(prompt);
  const asst: Message = { id: nanoid(10), role: 'assistant', createdAt: Date.now(), parts: [], model: model.label };
  s.appendMessage(chatId, asst);

  const limit = PLAN_LIMITS[s.user.plan].requests;
  if (s.user.usage.requests >= limit && model.provider !== 'demo') {
    s.updateMessage(chatId, asst.id, (m) => ({
      ...m,
      error: `You've used all ${limit} agent requests on the ${PLAN_LIMITS[s.user.plan].label}. Upgrade to Pro to keep building.`,
    }));
    return { text: 'Usage limit reached', ok: false };
  }

  const ctrl = new AbortController();
  controllers.set(chatId, ctrl);
  s.setRunning(chatId, true);
  const started = performance.now();

  // Batched streaming updates (one store write per animation frame)
  let pending: { kind: 'text' | 'thinking'; delta: string }[] = [];
  let raf = 0;
  const flush = () => {
    raf = 0;
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    getState().updateMessage(chatId, asst.id, (m) => {
      const parts = [...m.parts];
      for (const { kind, delta } of batch) {
        const last = parts[parts.length - 1];
        if (last && last.type === kind) parts[parts.length - 1] = { ...last, text: last.text + delta };
        else parts.push({ type: kind, text: delta } as MessagePart);
      }
      return { ...m, parts };
    });
  };
  const push = (kind: 'text' | 'thinking', delta: string) => {
    pending.push({ kind, delta });
    if (!raf) raf = requestAnimationFrame(flush);
  };
  const addPart = (part: MessagePart) => {
    flush();
    getState().updateMessage(chatId, asst.id, (m) => ({ ...m, parts: [...m.parts, part] }));
  };

  const mode = s.modelConfig.mode;
  const tools = TOOL_SPECS.filter((t) => (mode === 'ask' ? !t.mutates : true));
  const history: HistItem[] = [...prior.flatMap(messageToHistory), ...messageToHistory(userMsg)];
  const maxSteps = s.modelConfig.maxMode ? 40 : 20;
  let finalText = '';
  let ok = true;

  if (note) addPart({ type: 'thinking', text: note });

  try {
    for (let step = 0; step < maxSteps; step++) {
      const res = await provider({
        model: apiModel,
        system: systemPrompt(mode),
        history,
        tools,
        effort: s.modelConfig.effort,
        signal: ctrl.signal,
        onText: (d) => push('text', d),
        onThinking: (d) => push('thinking', d),
      });
      flush();
      finalText = res.text || finalText;
      history.push({ role: 'assistant', text: res.text, toolCalls: res.toolCalls, raw: res.raw });
      if (!res.toolCalls.length) break;

      for (const tc of res.toolCalls) {
        if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const callId = tc.id || nanoid(6);
        addPart({ type: 'tool', call: { id: callId, name: tc.name, args: tc.args, status: 'running' } });
        const r = await executeTool(tc.name, tc.args, { chatId, messageId: asst.id });
        getState().updateMessage(chatId, asst.id, (m) => ({
          ...m,
          parts: m.parts.map((p) =>
            p.type === 'tool' && p.call.id === callId
              ? { ...p, call: { ...p.call, status: r.ok ? 'done' : 'error', result: r.output, changeId: r.changeId } }
              : p,
          ),
        }));
        history.push({ role: 'tool', id: callId, name: tc.name, output: r.output });
      }
      if (step === maxSteps - 1) push('text', '\n\n_Reached the step limit for this run. Say "continue" to keep going._');
    }
  } catch (e) {
    flush();
    const err = e as Error;
    if (err.name === 'AbortError' || ctrl.signal.aborted) {
      getState().updateMessage(chatId, asst.id, (m) => ({ ...m, error: 'Stopped by user' }));
    } else {
      ok = false;
      getState().updateMessage(chatId, asst.id, (m) => ({ ...m, error: humanizeError(err) }));
    }
  } finally {
    flush();
    if (raf) cancelAnimationFrame(raf);
    controllers.delete(chatId);
    const st = getState();
    st.setRunning(chatId, false);
    st.updateMessage(chatId, asst.id, (m) => ({
      ...m,
      durationMs: performance.now() - started,
      // mark any tool calls still running as errored (aborted mid-call)
      parts: m.parts.map((p) => (p.type === 'tool' && p.call.status === 'running' ? { ...p, call: { ...p.call, status: 'error', result: 'Cancelled' } } : p)),
    }));
    if (model.provider !== 'demo') st.countRequest();
  }
  return { text: finalText, ok };
}

function humanizeError(e: Error) {
  const msg = e.message || String(e);
  if (/API key not valid|401|invalid_api_key|PERMISSION_DENIED/i.test(msg)) return 'The API key was rejected. Check it in Integrations.';
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return 'Rate limit or quota exceeded for this provider. Try again shortly or switch models.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network error — the provider could not be reached (check base URL / CORS).';
  return msg.slice(0, 500);
}

export function titleFrom(prompt: string) {
  const t = prompt.replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  const words = t.split(' ').slice(0, 6).join(' ');
  return words.length > 42 ? words.slice(0, 40) + '…' : words.charAt(0).toUpperCase() + words.slice(1);
}
