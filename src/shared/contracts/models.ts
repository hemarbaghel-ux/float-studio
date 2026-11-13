/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authoritative Model Catalog & Capabilities Contracts (Phase 2 & Stage 2)
 *
 * Establishes a single authoritative source of truth for model capability schemas,
 * provider routing aliases, context window limits, and availability states across
 * backend services, web frontend, and desktop workbenches.
 * Derived directly from `src/data/verifiedModels.ts` (`VERIFIED_MODELS`).
 */

import { VERIFIED_MODELS } from '../../data/verifiedModels';

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

  /** Evaluates whether a model's provider credential is configured */
  isModelAvailable(id: string, configuredProviders: Record<string, boolean>): boolean;
}

/**
 * Canonical verified models shared across the entire FLOAT architecture.
 * Derived strictly from `VERIFIED_MODELS` in `src/data/verifiedModels.ts`.
 */
export const CANONICAL_FLOAT_MODELS: readonly IModelDescriptor[] = [
  ...VERIFIED_MODELS.filter(m => m.deprecationStatus !== 'retired').map(m => ({
    id: m.id,
    displayName: m.displayName,
    providerId: m.providerId as RoutedProvider,
    apiModelId: m.upstreamModelId || m.exactModelId,
    protocol: (m.apiProtocol || 'chat_completions') as ModelProtocol,
    selectable: m.deprecationStatus !== 'deprecated',
    isDefault: m.id === 'gpt-6.1-sol',
    contextWindow: m.contextWindow,
    maxOutputTokens: m.maxOutputTokens,
    description: m.description,
    capabilities: {
      coding: m.capabilities.coding,
      reasoning: m.capabilities.reasoning,
      vision: m.capabilities.vision,
      tools: m.capabilities.tools,
      structuredOutput: m.capabilities.structuredOutput,
      streaming: m.capabilities.streaming,
      longContext: m.capabilities.longContext,
    },
    pricing: {
      inputCostPer1M: m.pricing.inputCostPer1M,
      outputCostPer1M: m.pricing.outputCostPer1M,
      cachedInputCostPer1M: m.pricing.cachedInputCostPer1M,
      currency: m.pricing.currency,
      effectiveDate: m.pricing.effectiveDate,
      sourceUrl: m.pricing.sourceUrl,
    },
    deprecationStatus: (m.deprecationStatus || 'active') as ModelDeprecationStatus,
  })),
  {
    id: 'auto',
    displayName: 'Auto (GPT-6 Astra)',
    providerId: 'openai',
    apiModelId: 'gpt-6-astra',
    protocol: 'responses',
    selectable: true,
    isRoutingAlias: true,
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    description: 'Explicit routing alias resolving to GPT-6 Astra.',
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
      if (m.apiModelId && m.apiModelId !== m.id && !m.isRoutingAlias) {
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
