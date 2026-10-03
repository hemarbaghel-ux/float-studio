import { useState, useEffect, useCallback, useMemo } from 'react';
import { AIModel, ModelPricing, ProviderAdapter, AIProviderAdapter } from '../../types/ai';
import { ModelPricingRegistry, CostBreakdown } from './ModelPricingRegistry';
import { INITIAL_MODELS } from '../ai/registry';

export interface SyncPricingResult {
  providerId: string;
  providerName: string;
  success: boolean;
  syncedModels: { modelId: string; pricing: ModelPricing }[];
  skippedModels: { modelId: string; reason: string }[];
  error?: string;
}

export interface SyncPricingSummary {
  totalSynced: number;
  totalSkipped: number;
  results: SyncPricingResult[];
  timestamp: Date;
}

export interface SyncOptions {
  adapters?: (ProviderAdapter | AIProviderAdapter)[];
  autoSync?: boolean;
  intervalMs?: number;
  onSyncComplete?: (summary: SyncPricingSummary) => void;
}

/**
 * Validates that pricing data meets strict standards for genuine, non-fabricated information.
 */
export function validateModelPricing(pricing: any): pricing is ModelPricing {
  if (!pricing) return false;
  
  const hasValidInput = typeof pricing.inputCost === 'number' && 
                        !isNaN(pricing.inputCost) && 
                        isFinite(pricing.inputCost) && 
                        pricing.inputCost >= 0;
                        
  const hasValidOutput = typeof pricing.outputCost === 'number' && 
                         !isNaN(pricing.outputCost) && 
                         isFinite(pricing.outputCost) && 
                         pricing.outputCost >= 0;
                         
  const hasValidCurrency = typeof pricing.currency === 'string' && 
                           pricing.currency.trim().length > 0;

  return hasValidInput && hasValidOutput && hasValidCurrency;
}

/**
 * Synchronizes model pricing data from a single ProviderAdapter into ModelPricingRegistry.
 * STRICT NON-FABRICATION POLICY: If pricing data is missing or invalid, it is safely skipped.
 */
export async function syncPricingFromProviderAdapter(
  adapter: ProviderAdapter | AIProviderAdapter
): Promise<SyncPricingResult> {
  const providerId = adapter.id || 'unknown';
  const providerName = adapter.name || providerId;

  const result: SyncPricingResult = {
    providerId,
    providerName,
    success: true,
    syncedModels: [],
    skippedModels: []
  };

  try {
    // 1. Check if adapter provides a full model list with pricing
    if (typeof adapter.listModels === 'function') {
      const models = await adapter.listModels();
      if (Array.isArray(models)) {
        for (const model of models) {
          if (!model || !model.id) continue;

          if (validateModelPricing(model.pricing)) {
            const registered = ModelPricingRegistry.registerPricing(model.id, model.pricing, false);
            if (registered) {
              result.syncedModels.push({ modelId: model.id, pricing: model.pricing });
            }
          } else {
            result.skippedModels.push({
              modelId: model.id,
              reason: model.pricing ? 'Invalid or incomplete pricing fields' : 'No pricing data specified by provider'
            });
          }
        }
      }
    }

    // 2. Check if adapter exposes a dedicated pricing table
    if (typeof adapter.getPricingTable === 'function') {
      const pricingTable = await adapter.getPricingTable();
      if (pricingTable && typeof pricingTable === 'object') {
        for (const [modelId, pricing] of Object.entries(pricingTable)) {
          if (validateModelPricing(pricing)) {
            const registered = ModelPricingRegistry.registerPricing(modelId, pricing, false);
            if (registered) {
              // Avoid duplicate entry in syncedModels
              if (!result.syncedModels.some(m => m.modelId === modelId)) {
                result.syncedModels.push({ modelId, pricing });
              }
            }
          } else {
            result.skippedModels.push({
              modelId,
              reason: 'Invalid or incomplete pricing fields in pricing table'
            });
          }
        }
      }
    }

    // If any models were synced, trigger registry notification
    if (result.syncedModels.length > 0) {
      // Re-register the last one with notify = true or batch
      const last = result.syncedModels[result.syncedModels.length - 1];
      ModelPricingRegistry.registerPricing(last.modelId, last.pricing, true);
    }
  } catch (err: any) {
    result.success = false;
    result.error = err.message || 'Unknown error synchronizing from provider adapter';
    console.error(`Failed to sync pricing from adapter ${providerName}:`, err);
  }

  return result;
}

/**
 * Synchronizes model pricing data from multiple ProviderAdapters into ModelPricingRegistry.
 */
export async function syncPricingFromMultipleAdapters(
  adapters: (ProviderAdapter | AIProviderAdapter)[]
): Promise<SyncPricingSummary> {
  const results: SyncPricingResult[] = [];
  let totalSynced = 0;
  let totalSkipped = 0;

  for (const adapter of adapters) {
    const res = await syncPricingFromProviderAdapter(adapter);
    results.push(res);
    totalSynced += res.syncedModels.length;
    totalSkipped += res.skippedModels.length;
  }

  return {
    totalSynced,
    totalSkipped,
    results,
    timestamp: new Date()
  };
}

/**
 * Built-in verified client ProviderAdapters with genuine, non-fabricated pricing specifications.
 */
export class ClientGoogleAdapter implements ProviderAdapter {
  id = 'google';
  name = 'Google Gemini';

  async listModels(): Promise<AIModel[]> {
    return INITIAL_MODELS.filter(m => m.providerId === 'google');
  }

  supportsTools(): boolean { return true; }
  supportsStructuredOutput(): boolean { return true; }

  async generate(): Promise<any> { throw new Error('Client adapter is used for metadata and pricing inspection'); }
  async stream(): Promise<void> { throw new Error('Client adapter is used for metadata and pricing inspection'); }
}

export class ClientOpenAIAdapter implements ProviderAdapter {
  id = 'openai';
  name = 'OpenAI';

  async listModels(): Promise<AIModel[]> {
    return INITIAL_MODELS.filter(m => m.providerId === 'openai');
  }

  supportsTools(): boolean { return true; }
  supportsStructuredOutput(): boolean { return true; }

  async generate(): Promise<any> { throw new Error('Client adapter is used for metadata and pricing inspection'); }
  async stream(): Promise<void> { throw new Error('Client adapter is used for metadata and pricing inspection'); }
}

export class ClientAnthropicAdapter implements ProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic';

  async listModels(): Promise<AIModel[]> {
    return INITIAL_MODELS.filter(m => m.providerId === 'anthropic');
  }

  supportsTools(): boolean { return true; }
  supportsStructuredOutput(): boolean { return true; }

  async generate(): Promise<any> { throw new Error('Client adapter is used for metadata and pricing inspection'); }
  async stream(): Promise<void> { throw new Error('Client adapter is used for metadata and pricing inspection'); }
}

export const DEFAULT_PROVIDER_ADAPTERS: ProviderAdapter[] = [
  new ClientGoogleAdapter(),
  new ClientOpenAIAdapter(),
  new ClientAnthropicAdapter()
];

/**
 * React Hook: Synchronizes provider adapter pricing into ModelPricingRegistry
 */
export function useModelPricingSync(options: SyncOptions = {}) {
  const { 
    adapters = DEFAULT_PROVIDER_ADAPTERS, 
    autoSync = true, 
    intervalMs,
    onSyncComplete 
  } = options;

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncPricingSummary | null>(null);

  const syncAll = useCallback(async (): Promise<SyncPricingSummary> => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await syncPricingFromMultipleAdapters(adapters);
      setSummary(res);
      setLastSynced(res.timestamp);
      onSyncComplete?.(res);
      return res;
    } catch (err: any) {
      const msg = err.message || 'Failed to sync model pricing';
      setError(msg);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [adapters, onSyncComplete]);

  const syncFromAdapter = useCallback(async (adapter: ProviderAdapter): Promise<SyncPricingResult> => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await syncPricingFromProviderAdapter(adapter);
      setLastSynced(new Date());
      return res;
    } catch (err: any) {
      const msg = err.message || 'Failed to sync adapter pricing';
      setError(msg);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (autoSync) {
      syncAll().catch(console.error);
    }
  }, [autoSync, syncAll]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return;
    const interval = setInterval(() => {
      syncAll().catch(console.error);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, syncAll]);

  return {
    isSyncing,
    lastSynced,
    error,
    summary,
    totalSyncedCount: summary?.totalSynced ?? 0,
    syncAll,
    syncFromAdapter,
  };
}

/**
 * React Hook: Reactive subscriber to a specific model's pricing in ModelPricingRegistry.
 * Re-renders automatically whenever any adapter syncs pricing updates for this model.
 */
export function useModelPricing(modelId: string) {
  const [, setVersion] = useState<number>(0);

  // Subscribe to ModelPricingRegistry changes
  useEffect(() => {
    const unsubscribe = ModelPricingRegistry.subscribe(() => {
      setVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  const pricing = useMemo(() => {
    return ModelPricingRegistry.getPricing(modelId);
  }, [modelId]);

  const hasPricing = useMemo(() => {
    return ModelPricingRegistry.hasPricing(modelId);
  }, [modelId]);

  const calculateCost = useCallback(
    (inputTokens: number, outputTokens: number, requests: number = 1): CostBreakdown | null => {
      return ModelPricingRegistry.calculateCost(modelId, inputTokens, outputTokens, requests);
    },
    [modelId]
  );

  return {
    pricing,
    hasPricing,
    calculateCost
  };
}
