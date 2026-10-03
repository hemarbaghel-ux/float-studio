export type View = 'home' | 'chat' | 'codebase' | 'automations' | 'integrations';
export type Theme = 'light' | 'dark' | 'system';
export type Plan = 'free' | 'pro' | 'ultra';
export type Effort = 'low' | 'medium' | 'high';
export type ChatMode = 'agent' | 'ask';
export type ProviderId = 'demo' | 'gemini' | 'openai';

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Text content for text-like files */
  text?: string;
  /** data: URL for images */
  dataUrl?: string;
}

export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: string;
  /** id of the FileChange produced by this call (write/edit/delete) */
  changeId?: string;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; call: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  createdAt: number;
  attachments?: Attachment[];
  model?: string;
  error?: string;
  durationMs?: number;
  /** Snapshot of the codebase taken before this user message ran (checkpoint) */
  checkpoint?: Record<string, string>;
}

export interface FileChange {
  id: string;
  path: string;
  before: string | null; // null => file did not exist
  after: string | null; // null => file deleted
  status: 'pending' | 'accepted' | 'rejected';
  messageId: string;
  at: number;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  messages: Message[];
  changes: FileChange[];
  source?: 'automation' | 'user';
  automationId?: string;
}

export interface CodeFile {
  content: string;
  updatedAt: number;
}

export interface Codebase {
  name: string;
  files: Record<string, CodeFile>;
  openTabs: string[];
  activePath: string | null;
  github?: { owner: string; repo: string; branch: string };
}

export type Schedule =
  | { type: 'manual' }
  | { type: 'interval'; minutes: number }
  | { type: 'daily'; time: string } // HH:mm local
  | { type: 'on-change' }; // runs when codebase files change

export interface AutomationRun {
  id: string;
  at: number;
  chatId: string;
  status: 'running' | 'success' | 'error';
  summary?: string;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: Schedule;
  enabled: boolean;
  notifySlack: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runs: AutomationRun[];
}

export interface Settings {
  geminiKey: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  githubToken: string;
  slackWebhook: string;
  customInstructions: string;
  autoRunCommands: boolean;
}

export interface ModelConfig {
  model: string; // 'auto' | model id
  effort: Effort;
  mode: ChatMode;
  maxMode: boolean;
}

export interface CloudSession {
  active: boolean;
  startedAt?: number;
  region?: string;
  machine?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  plan: Plan;
  usage: { month: string; requests: number };
}

export interface ModelInfo {
  id: string;
  label: string;
  provider: ProviderId;
  description: string;
  speed: 'Fast' | 'Balanced' | 'High';
  pro?: boolean;
}
