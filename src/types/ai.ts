export type ProviderId = 'google' | 'openai' | 'anthropic' | 'xai' | 'cursor' | 'auto';
export type ModelStatus =
  | 'AVAILABLE'
  | 'CONFIG_REQUIRED'
  | 'PROVIDER_SUPPORTED_NOT_CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'ERROR'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface ModelCapability {
  coding: boolean;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  longContext?: boolean;
}

export interface AIModel {
  id: string;
  exactModelId?: string;
  apiModelId?: string;
  providerId: ProviderId;
  provider?: string;
  tier?: 'Free' | 'Pro' | 'Enterprise' | string;
  displayName: string;
  shortName?: string;
  family: string;
  description?: string;
  capabilities: ModelCapability;
  capabilitiesList?: string[];
  contextWindow: number;
  status: ModelStatus;
  speed: 'fast' | 'balanced' | 'slow';
  version?: string;
  reasoningLevel?: string;
  isNew?: boolean;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  availability?: string;
  pricing?: ModelPricing;
  limits?: { maxOutputTokens?: number };
  releaseDate?: string;
  modalities?: string[];
  docUrl?: string;
  pricingUrl?: string;
  snapshotVersion?: string;
  limitations?: string[];
  intendedUseCases?: string[];
  availabilityDetails?: string;
}

export interface AgentPermission {
  readFiles: boolean;
  searchCode: boolean;
  createFiles: boolean;
  modifyFiles: boolean;
  renameFiles: boolean;
  deleteFiles: boolean;
  terminal: boolean;
  webResearch: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemInstructions: string;
  defaultModel: string; // model id or 'auto' (primary model)
  fallbackModel?: string; // fallback model id
  allowedModels: string[]; // array of model ids or '*'
  tools: string[]; // array of tool names
  permissions: AgentPermission;
  mode: 'ask' | 'edit' | 'agent';
  status?: 'AVAILABLE' | 'COMING_SOON' | 'BETA';
}

export interface AgentModelAssignment {
  id?: string;
  ownerId: string;
  agentId: string;
  primaryModel: string;
  fallbackModel: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ProviderStatus {
  enabled: boolean;
  configured: boolean;
  defaultModel: string;
}

export interface ModelPreference {
  preferredModel: string;
  fallbackModel: string;
  speedPreference: 'fast' | 'balanced' | 'slow';
  qualityPreference: 'high' | 'balanced' | 'low';
}

export interface ModelUsage {
  modelId: string;
  providerId: ProviderId;
  requestCount: number;
  inputTokens?: number;
  outputTokens?: number;
  latency?: number;
  success: boolean;
  taskId?: string;
  agentId?: string;
}

export interface ModelPricing {
  inputCost: number; // per 1M tokens
  outputCost: number; // per 1M tokens
  currency: string;
  effectiveDate: string;
}

export interface AIProviderAdapter {
  id?: string;
  name?: string;
  listModels(): Promise<AIModel[]>;
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest, onEvent: (event: any) => void): Promise<void>;
  supportsTools(): boolean;
  supportsStructuredOutput(): boolean;
  getModelPricing?(modelId: string): Promise<ModelPricing | undefined> | ModelPricing | undefined;
  getPricingTable?(): Promise<Record<string, ModelPricing>> | Record<string, ModelPricing>;
}

export type ProviderAdapter = AIProviderAdapter;

export interface ModelRequest {
  modelId: string;
  messages: any[]; // standard message format
  systemInstruction?: string;
  tools?: any[];
  agentId?: string;
  taskId?: string;
  conversationId?: string;
  dataSharingAllowed?: boolean;
  dataSharingConsent?: boolean;
}

export interface ModelResponse {
  text: string;
  functionCalls?: any[];
  usage?: { inputTokens: number; outputTokens: number };
}
