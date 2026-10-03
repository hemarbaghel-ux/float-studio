import { ModelPricing, AIModel } from '../../types/ai';
import { INITIAL_MODELS } from '../ai/registry';

export interface CostBreakdown {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  totalTokens: number;
  inputCostPerRequest: number;
  outputCostPerRequest: number;
  costPerRequest: number;
  totalInputCost: number;
  totalOutputCost: number;
  totalCost: number;
  currency: string;
  pricing: ModelPricing;
}

export interface CalculationParams {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  requests?: number;
}

class PricingRegistry {
  private pricingMap: Map<string, ModelPricing> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.initFromModels(INITIAL_MODELS);
  }

  /**
   * Subscribe to pricing registry updates
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all subscribers when pricing data changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error executing pricing registry listener:', err);
      }
    });
  }

  /**
   * Validate that pricing data contains non-fabricated, verified numbers
   */
  public static isValidPricing(pricing: any): pricing is ModelPricing {
    return Boolean(
      pricing &&
      typeof pricing.inputCost === 'number' &&
      typeof pricing.outputCost === 'number' &&
      !isNaN(pricing.inputCost) &&
      !isNaN(pricing.outputCost) &&
      isFinite(pricing.inputCost) &&
      isFinite(pricing.outputCost) &&
      pricing.inputCost >= 0 &&
      pricing.outputCost >= 0 &&
      typeof pricing.currency === 'string' &&
      pricing.currency.trim().length > 0
    );
  }

  /**
   * Populate the registry from available models
   */
  public initFromModels(models: AIModel[]): void {
    let count = 0;
    for (const model of models) {
      if (PricingRegistry.isValidPricing(model.pricing)) {
        this.pricingMap.set(model.id, model.pricing);
        count++;
      }
    }
    if (count > 0) {
      this.notifyListeners();
    }
  }

  /**
   * Register or override pricing for a specific model ID with validation
   */
  public registerPricing(modelId: string, pricing: ModelPricing, notify: boolean = true): boolean {
    if (!modelId || !PricingRegistry.isValidPricing(pricing)) {
      return false;
    }
    this.pricingMap.set(modelId, pricing);
    if (notify) {
      this.notifyListeners();
    }
    return true;
  }

  /**
   * Batch register multiple pricing entries
   */
  public batchRegister(entries: { modelId: string; pricing: ModelPricing }[]): number {
    let registeredCount = 0;
    for (const entry of entries) {
      if (entry.modelId && PricingRegistry.isValidPricing(entry.pricing)) {
        this.pricingMap.set(entry.modelId, entry.pricing);
        registeredCount++;
      }
    }
    if (registeredCount > 0) {
      this.notifyListeners();
    }
    return registeredCount;
  }

  /**
   * Check if pricing data exists and is valid for a model
   */
  public hasPricing(modelId: string): boolean {
    const pricing = this.pricingMap.get(modelId);
    return Boolean(
      pricing &&
      typeof pricing.inputCost === 'number' &&
      typeof pricing.outputCost === 'number' &&
      !isNaN(pricing.inputCost) &&
      !isNaN(pricing.outputCost)
    );
  }

  /**
   * Retrieve pricing data for a model
   */
  public getPricing(modelId: string): ModelPricing | undefined {
    return this.pricingMap.get(modelId);
  }

  /**
   * Retrieve all registered model IDs with pricing
   */
  public getPricedModelIds(): string[] {
    return Array.from(this.pricingMap.keys());
  }

  /**
   * Calculate cost based on input/output tokens and number of requests.
   * STRICT GUARANTEE: If pricing data is missing or incomplete, no calculation occurs and null is returned.
   */
  public calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    requests: number = 1
  ): CostBreakdown | null {
    // Ensuring no calculations occur if pricing data is missing
    if (!this.hasPricing(modelId)) {
      return null;
    }

    const pricing = this.getPricing(modelId);
    if (!pricing) {
      return null;
    }

    // Sanitize non-negative numeric inputs
    const validInputs = Math.max(0, isNaN(inputTokens) ? 0 : inputTokens);
    const validOutputs = Math.max(0, isNaN(outputTokens) ? 0 : outputTokens);
    const validRequests = Math.max(0, isNaN(requests) ? 0 : requests);

    // Pricing is per 1,000,000 tokens (1M tokens)
    const inputCostPerRequest = (validInputs / 1_000_000) * pricing.inputCost;
    const outputCostPerRequest = (validOutputs / 1_000_000) * pricing.outputCost;
    const costPerRequest = inputCostPerRequest + outputCostPerRequest;

    const totalInputCost = inputCostPerRequest * validRequests;
    const totalOutputCost = outputCostPerRequest * validRequests;
    const totalCost = costPerRequest * validRequests;

    return {
      modelId,
      inputTokens: validInputs,
      outputTokens: validOutputs,
      requests: validRequests,
      totalTokens: (validInputs + validOutputs) * validRequests,
      inputCostPerRequest,
      outputCostPerRequest,
      costPerRequest,
      totalInputCost,
      totalOutputCost,
      totalCost,
      currency: pricing.currency || 'USD',
      pricing,
    };
  }

  /**
   * Helper calculate method accepting calculation params object
   */
  public calculate(params: CalculationParams): CostBreakdown | null {
    return this.calculateCost(
      params.modelId,
      params.inputTokens,
      params.outputTokens,
      params.requests ?? 1
    );
  }
}

// Export singleton instance and class
export const ModelPricingRegistry = new PricingRegistry();
export { PricingRegistry };
