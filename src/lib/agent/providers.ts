import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { Effort } from '../types';
import type { ToolSpec } from './tools';

export type HistItem =
  | { role: 'user'; text: string; images?: { mime: string; data: string }[] }
  | { role: 'assistant'; text: string; toolCalls: ProviderToolCall[]; raw?: unknown }
  | { role: 'tool'; id: string; name: string; output: string };

export interface ProviderToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface StreamOpts {
  model: string;
  system: string;
  history: HistItem[];
  tools: ToolSpec[];
  effort: Effort;
  signal: AbortSignal;
  onText: (delta: string) => void;
  onThinking: (delta: string) => void;
}

export interface StreamResult {
  text: string;
  toolCalls: ProviderToolCall[];
  raw?: unknown;
}

export type Provider = (opts: StreamOpts) => Promise<StreamResult>;

// ---------------------------------------------------------------- Gemini
const BUDGET: Record<Effort, number> = { low: 512, medium: 4096, high: -1 };

export function geminiProvider(apiKey: string): Provider {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, system, history, tools, effort, signal, onText, onThinking }) => {
    const contents: Content[] = [];
    for (const h of history) {
      if (h.role === 'user') {
        const parts: Part[] = [{ text: h.text || ' ' }];
        for (const img of h.images ?? []) parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
        contents.push({ role: 'user', parts });
      } else if (h.role === 'assistant') {
        const raw = h.raw as Part[] | undefined;
        const parts: Part[] = raw?.length
          ? raw
          : [
              ...(h.text ? [{ text: h.text }] : []),
              ...h.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
            ];
        if (parts.length) contents.push({ role: 'model', parts });
      } else {
        const part: Part = { functionResponse: { name: h.name, response: { output: h.output } } };
        const last = contents[contents.length - 1];
        // merge consecutive tool responses into one user turn
        if (last?.role === 'user' && last.parts?.every((p) => p.functionResponse)) last.parts.push(part);
        else contents.push({ role: 'user', parts: [part] });
      }
    }

    const thinking = model.includes('2.5')
      ? { thinkingConfig: { thinkingBudget: model.includes('pro') && effort === 'low' ? 1024 : BUDGET[effort], includeThoughts: true } }
      : {};

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: system,
        abortSignal: signal,
        ...(tools.length
          ? {
              tools: [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parametersJsonSchema: t.parameters,
                  })),
                },
              ],
            }
          : {}),
        ...thinking,
      },
    });

    let text = '';
    const rawParts: Part[] = [];
    const toolCalls: ProviderToolCall[] = [];
    for await (const chunk of stream) {
      if (signal.aborted) break;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        rawParts.push(p);
        if (p.thought && p.text) onThinking(p.text);
        else if (p.text) {
          text += p.text;
          onText(p.text);
        }
        if (p.functionCall) {
          toolCalls.push({
            id: p.functionCall.id || `call_${toolCalls.length}_${Date.now()}`,
            name: p.functionCall.name ?? '',
            args: (p.functionCall.args as Record<string, unknown>) ?? {},
          });
        }
      }
    }
    return { text, toolCalls, raw: rawParts };
  };
}

// ---------------------------------------------------------------- OpenAI-compatible
interface OAIMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: unknown;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export function openaiProvider(apiKey: string, baseUrl: string): Provider {
  return async ({ model, system, history, tools, effort, signal, onText, onThinking }) => {
    const messages: OAIMsg[] = [{ role: 'system', content: system }];
    for (const h of history) {
      if (h.role === 'user') {
        messages.push({
          role: 'user',
          content: h.images?.length
            ? [
                { type: 'text', text: h.text },
                ...h.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })),
              ]
            : h.text,
        });
      } else if (h.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: h.text || null,
          ...(h.toolCalls.length
            ? {
                tool_calls: h.toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function' as const,
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                })),
              }
            : {}),
        });
      } else messages.push({ role: 'tool', tool_call_id: h.id, content: h.output });
    }
    const reasoning = /^(o\d|gpt-5)/.test(model) ? { reasoning_effort: effort } : {};
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(tools.length
          ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
          : {}),
        ...reasoning,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 400)}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let text = '';
    const acc: Record<number, { id: string; name: string; args: string }> = {};
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const d = j.choices?.[0]?.delta ?? {};
          if (d.reasoning_content || d.reasoning) onThinking(d.reasoning_content ?? d.reasoning);
          if (d.content) {
            text += d.content;
            onText(d.content);
          }
          for (const tc of d.tool_calls ?? []) {
            const slot = (acc[tc.index ?? 0] ??= { id: '', name: '', args: '' });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name += tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments;
          }
        } catch {
          /* partial line */
        }
      }
    }
    const toolCalls = Object.values(acc).map((s, i) => {
      let args: Record<string, unknown> = {};
      try {
        args = s.args ? JSON.parse(s.args) : {};
      } catch {
        args = { _raw: s.args };
      }
      return { id: s.id || `call_${i}`, name: s.name, args };
    });
    return { text, toolCalls };
  };
}
