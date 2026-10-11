export type ModelTier =
  | 'float-pro'
  | 'float-basic'
  | 'gpt-4o'
  | 'gpt-4o-balanced'
  | 'claude-sonnet'
  | 'claude-opus'
  | 'gemini-flash'
  | 'grok-fast'
  | 'composer';

export type AgentMode = 'composer' | 'agent' | 'ask' | 'cloud' | 'main';

export type ContextPillType = 'codebase' | 'files' | 'docs' | 'web' | 'folder' | 'symbol';

export interface ContextPill {
  id: string;
  type: ContextPillType;
  label: string;
  metadata?: {
    path?: string;
    source?: string;
    [key: string]: unknown;
  };
}

export type ReasoningBlockType =
  | 'thinking'
  | 'reading_file'
  | 'searching'
  | 'planning'
  | 'editing'
  | 'running';

export interface ReasoningBlock {
  id: string;
  type: ReasoningBlockType;
  title: string;
  content: string;
  status: 'pending' | 'active' | 'done' | 'error';
  durationSeconds?: number;
}

export interface FeedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  pills?: ContextPill[];
  isStreaming?: boolean;
  reasoningBlocks?: ReasoningBlock[];
  timestamp: number;
  error?: string;
}

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  'float-pro': 'FLOAT Pro',
  'float-basic': 'FLOAT Basic',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-balanced': 'GPT-4o Balanced',
  'claude-sonnet': 'Claude Sonnet',
  'claude-opus': 'Claude Opus',
  'gemini-flash': 'Gemini Flash',
  'grok-fast': 'Grok Fast',
  composer: 'Composer',
};

export const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  composer: 'Composer',
  agent: 'Agent',
  ask: 'Ask',
  cloud: 'Cloud Agent',
  main: 'Main Agent',
};
