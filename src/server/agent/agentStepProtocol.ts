import type { ToolCallDefinition } from '../providers/base';

export interface AgentStepMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ValidatedAgentStepPayload {
  model: string;
  projectId?: string;
  messages: AgentStepMessage[];
  systemInstruction: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  tools: ToolCallDefinition[];
}

export type AgentStepValidation =
  | { ok: true; value: ValidatedAgentStepPayload }
  | { ok: false; error: string };

const ALLOWED_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);
const MAX_MESSAGES = 40;
const MAX_TOOLS = 32;
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_TOOL_SCHEMA_BYTES = 16 * 1024;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateToolDefinition(input: any): ToolCallDefinition | string {
  if (!isRecord(input) || typeof input.name !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(input.name)) return 'Each tool must have a valid name.';
  if (typeof input.description !== 'string' || input.description.length < 1 || input.description.length > 1200) {
    return `Tool "${input.name}" has an invalid description.`;
  }
  const schema = input.parameters;
  if (!isRecord(schema) || schema.type !== 'object' || !isRecord(schema.properties) ||
      !Array.isArray(schema.required) || schema.required.length > 64) {
    return `Tool "${input.name}" must provide an object schema with properties and required fields.`;
  }
  const entries = Object.entries(schema.properties);
  if (entries.length > 64) return `Tool "${input.name}" defines too many properties.`;
  const properties: Record<string, any> = {};
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || !isRecord(raw) ||
        typeof raw.type !== 'string' || !ALLOWED_SCHEMA_TYPES.has(raw.type) ||
        typeof raw.description !== 'string' || raw.description.length > 1200) {
      return `Tool "${input.name}" contains an invalid property schema.`;
    }
    const property: Record<string, any> = { type: raw.type, description: raw.description };
    if (raw.items !== undefined) {
      if (!isRecord(raw.items) || typeof raw.items.type !== 'string' || !ALLOWED_SCHEMA_TYPES.has(raw.items.type)) {
        return `Tool "${input.name}" contains an invalid array item schema.`;
      }
      property.items = { type: raw.items.type };
    }
    if (raw.enum !== undefined) {
      if (!Array.isArray(raw.enum) || raw.enum.length > 100 ||
          !raw.enum.every((entry: unknown) => ['string', 'number', 'boolean'].includes(typeof entry))) {
        return `Tool "${input.name}" contains an invalid enum.`;
      }
      property.enum = raw.enum;
    }
    properties[key] = property;
  }
  const required = schema.required as unknown[];
  if (!required.every((entry: unknown) =>
    typeof entry === 'string' && Object.prototype.hasOwnProperty.call(properties, entry))) {
    return `Tool "${input.name}" requires a property that is not defined.`;
  }
  const normalized = {
    name: input.name,
    description: input.description,
    parameters: { type: 'object', properties, required: required as string[] }
  };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_TOOL_SCHEMA_BYTES) {
    return `Tool "${input.name}" schema exceeds the allowed size.`;
  }
  return normalized;
}

export function validateAgentStepPayload(input: unknown): AgentStepValidation {
  if (!isRecord(input)) return { ok: false, error: 'Request body must be a JSON object.' };
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : 'gpt-6-astra';
  if (model.length > 128) return { ok: false, error: 'Model identifier is too long.' };
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Messages must contain between 1 and ${MAX_MESSAGES} turns.` };
  }
  const messages: AgentStepMessage[] = [];
  let totalBytes = 0;
  for (const message of input.messages) {
    if (!isRecord(message) || (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' || message.content.length > 120_000) {
      return { ok: false, error: 'Every message must have a supported role and bounded text content.' };
    }
    totalBytes += Buffer.byteLength(message.content, 'utf8');
    if (totalBytes > MAX_MESSAGE_BYTES) return { ok: false, error: 'Composer conversation exceeds the 512 KB request limit.' };
    messages.push({ role: message.role, content: message.content });
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: 'The final Composer message must contain the latest user instruction or tool observation.' };
  }
  if (typeof input.systemInstruction !== 'string' ||
      input.systemInstruction.length < 1 || input.systemInstruction.length > 16_000) {
    return { ok: false, error: 'System instructions must be between 1 and 16,000 characters.' };
  }
  if (input.projectId !== undefined &&
      (typeof input.projectId !== 'string' || !input.projectId.trim() || input.projectId.length > 128)) {
    return { ok: false, error: 'Project identifier is invalid.' };
  }
  if (input.reasoningEffort !== undefined &&
      !['low', 'medium', 'high'].includes(input.reasoningEffort)) {
    return { ok: false, error: 'Reasoning effort must be low, medium, or high.' };
  }
  if (!Array.isArray(input.tools) || input.tools.length < 1 || input.tools.length > MAX_TOOLS) {
    return { ok: false, error: `Composer must provide between 1 and ${MAX_TOOLS} tools.` };
  }
  const tools: ToolCallDefinition[] = [];
  const names = new Set<string>();
  for (const rawTool of input.tools) {
    const tool = validateToolDefinition(rawTool);
    if (typeof tool === 'string') return { ok: false, error: tool };
    if (names.has(tool.name)) return { ok: false, error: `Duplicate tool name "${tool.name}".` };
    names.add(tool.name);
    tools.push(tool);
  }
  return {
    ok: true,
    value: {
      model,
      projectId: typeof input.projectId === 'string' ? input.projectId.trim() : undefined,
      messages,
      systemInstruction: input.systemInstruction,
      reasoningEffort: input.reasoningEffort,
      tools
    }
  };
}

export function validateAgentToolCalls(
  definitions: ToolCallDefinition[],
  rawCalls: unknown
): { ok: true; toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> } | { ok: false; error: string } {
  if (rawCalls === undefined || rawCalls === null) return { ok: true, toolCalls: [] };
  if (!Array.isArray(rawCalls) || rawCalls.length > 16) {
    return { ok: false, error: 'Provider returned too many tool calls in one step.' };
  }
  const byName = new Map(definitions.map(definition => [definition.name, definition]));
  const toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
  for (let index = 0; index < rawCalls.length; index++) {
    const call = rawCalls[index];
    if (!isRecord(call) || typeof call.name !== 'string' || !isRecord(call.arguments)) {
      return { ok: false, error: 'Provider returned a malformed structured tool call.' };
    }
    const definition = byName.get(call.name);
    if (!definition) return { ok: false, error: `Provider requested unregistered tool "${call.name}".` };
    for (const required of definition.parameters.required) {
      if (!Object.prototype.hasOwnProperty.call(call.arguments, required)) {
        return { ok: false, error: `Provider omitted required argument "${required}" for "${call.name}".` };
      }
    }
    for (const [key, value] of Object.entries(call.arguments)) {
      const property = definition.parameters.properties[key];
      if (!property) return { ok: false, error: `Provider returned unexpected argument "${key}" for "${call.name}".` };
      const matches = property.type === 'string' ? typeof value === 'string'
        : property.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : property.type === 'integer' ? Number.isSafeInteger(value)
        : property.type === 'boolean' ? typeof value === 'boolean'
        : property.type === 'array' ? Array.isArray(value)
        : property.type === 'object' ? isRecord(value)
        : false;
      if (!matches) return { ok: false, error: `Provider returned an invalid "${key}" argument for "${call.name}".` };
      if (property.enum && !property.enum.includes(value)) {
        return { ok: false, error: `Provider returned an unsupported enum value for "${call.name}".` };
      }
    }
    toolCalls.push({
      id: typeof call.id === 'string' && call.id ? call.id.slice(0, 256) : `tool-call-${index + 1}`,
      name: call.name,
      arguments: call.arguments
    });
  }
  return { ok: true, toolCalls };
}
