/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authoritative Model Catalog & Capabilities Contracts (Phase 2)
 *
 * Establishes a single authoritative source of truth for model capability schemas,
 * provider routing aliases, context window limits, and availability states across
 * backend services, web frontend, and desktop workbenches.
 */

export type RoutedProvider = 'openai' | 'google' | 'anthropic' | 'custom';
export type ModelProtocol = 'responses' | 'chat_completions';
export type ModelDeprecationStatus = 'active' | 'preview' | 'deprecated' | 'retired';

export interface ModelCapability {
  readonly coding: boolean;
  readonly reasoning: boolean;
  readonly vision: boolean;
  readonly tools: boolean;
  readonly structuredOutput: boolean;
  readonly streaming: boolean;
  readonly longContext?: boolean;
}

export interface ModelPricing {
  readonly inputCostPer1M: number;
  readonly outputCostPer1M: number;
  readonly cachedInputCostPer1M?: number;
  readonly currency: 'USD';
  readonly effectiveDate: string;
  readonly sourceUrl: string;
}

export interface IModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly providerId: RoutedProvider;
  readonly apiModelId: string;
  readonly protocol: ModelProtocol;
  readonly selectable: boolean;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly description: string;
  readonly capabilities: ModelCapability;
  readonly pricing?: ModelPricing;
  readonly deprecationStatus: ModelDeprecationStatus;
  readonly isDefault?: boolean;
  readonly isRoutingAlias?: boolean;
  readonly fallbackModelId?: string;
}

/**
 * Authoritative Model Catalog Interface
 */
export interface IModelCatalog {
  /** Returns all active and selectable model descriptors */
  getAllModels(): readonly IModelDescriptor[];

  /** Finds a model descriptor by canonical ID or API model ID */
  getModel(id: string): IModelDescriptor | undefined;

  /** Filters models by provider */
  getModelsByProvider(providerId: RoutedProvider): readonly IModelDescriptor[];

  /** Returns the default recommended model */
  getDefaultModel(): IModelDescriptor;

  /** Evaluates whether a model is genuinely operational given configured provider credentials */
  isModelAvailable(id: string, configuredProviders: Record<string, boolean>): boolean;
}

/**
 * Canonical verified models shared across the entire FLOAT architecture.
 * Derived strictly from verified models to guarantee zero conflicting sources of truth.
 */
export const CANONICAL_FLOAT_MODELS: readonly IModelDescriptor[] = [
  {
    id: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol',
    providerId: 'openai',
    apiModelId: 'gpt-6.1-sol',
    protocol: 'chat_completions',
    selectable: true,
    isDefault: true,
    contextWindow: 1050000,
    maxOutputTokens: 65536,
    description: 'Flagship frontier reasoning and coding model with verified high-speed synthesis.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true,
      longContext: true,
    },
    pricing: {
      inputCostPer1M: 3.0,
      outputCostPer1M: 15.0,
      cachedInputCostPer1M: 1.5,
      currency: 'USD',
      effectiveDate: '2026-11-01',
      sourceUrl: 'https://openai.com/pricing',
    },
    deprecationStatus: 'active',
  },
  {
    id: 'gpt-6-astra',
    displayName: 'GPT-6 Astra',
    providerId: 'openai',
    apiModelId: 'gpt-6-astra',
    protocol: 'chat_completions',
    selectable: true,
    contextWindow: 1050000,
    maxOutputTokens: 32768,
    description: 'Autonomous coding specialist with real-time multi-file editing capabilities.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true,
      longContext: true,
    },
    pricing: {
      inputCostPer1M: 2.5,
      outputCostPer1M: 10.0,
      cachedInputCostPer1M: 1.25,
      currency: 'USD',
      effectiveDate: '2026-11-01',
      sourceUrl: 'https://openai.com/pricing',
    },
    deprecationStatus: 'active',
  },
  {
    id: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    providerId: 'google',
    apiModelId: 'gemini-3.8-flash',
    protocol: 'chat_completions',
    selectable: true,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    description: 'High-frequency multimodal model engineered for low-latency speculative edits.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true,
      longContext: true,
    },
    pricing: {
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.6,
      cachedInputCostPer1M: 0.0375,
      currency: 'USD',
      effectiveDate: '2026-11-01',
      sourceUrl: 'https://ai.google.dev/pricing',
    },
    deprecationStatus: 'active',
  },
  {
    id: 'auto',
    displayName: 'Auto (GPT-6 Astra)',
    providerId: 'openai',
    apiModelId: 'gpt-6-astra',
    protocol: 'chat_completions',
    selectable: true,
    isRoutingAlias: true,
    contextWindow: 1050000,
    maxOutputTokens: 32768,
    description: 'Smart routing alias dynamically delegating to the optimal coding model.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true,
      longContext: true,
    },
    deprecationStatus: 'active',
    fallbackModelId: 'gpt-6-astra',
  },
];

/**
 * Authoritative Model Catalog implementation
 */
export class AuthoritativeModelCatalog implements IModelCatalog {
  private readonly models: Map<string, IModelDescriptor> = new Map();

  constructor(customModels: readonly IModelDescriptor[] = CANONICAL_FLOAT_MODELS) {
    for (const m of customModels) {
      this.models.set(m.id, m);
      if (m.apiModelId && m.apiModelId !== m.id) {
        this.models.set(m.apiModelId, m);
      }
    }
  }

  getAllModels(): readonly IModelDescriptor[] {
    const unique = new Map<string, IModelDescriptor>();
    for (const m of this.models.values()) {
      if (m.selectable && m.deprecationStatus !== 'retired') {
        unique.set(m.id, m);
      }
    }
    return Array.from(unique.values());
  }

  getModel(id: string): IModelDescriptor | undefined {
    return this.models.get(id);
  }

  getModelsByProvider(providerId: RoutedProvider): readonly IModelDescriptor[] {
    return this.getAllModels().filter((m) => m.providerId === providerId);
  }

  getDefaultModel(): IModelDescriptor {
    const def = this.getAllModels().find((m) => m.isDefault);
    return def || CANONICAL_FLOAT_MODELS[0];
  }

  isModelAvailable(id: string, configuredProviders: Record<string, boolean>): boolean {
    const model = this.getModel(id);
    if (!model || !model.selectable || model.deprecationStatus === 'retired') {
      return false;
    }
    return Boolean(configuredProviders[model.providerId]);
  }
}
