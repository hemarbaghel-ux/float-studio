export type SourceType = 'official_provider' | 'independent_benchmark' | 'float_evaluation';
export type ModelProviderId = 'google' | 'openai' | 'anthropic' | 'xai' | 'auto';
export type TrustworthyModelStatus = 'AVAILABLE' | 'NOT_CONFIGURED' | 'CONFIG_REQUIRED' | 'UNAVAILABLE';

export interface VerifiedSource {
  name: string;
  url: string;
  type: SourceType;
  verifiedDate: string; // YYYY-MM-DD
  evaluator?: string;
  notes?: string;
}

export interface VerifiedPricing {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  cachedInputCostPerMillion?: number;
  currency: 'USD';
  effectiveDate: string;
  sourceUrl: string;
  sourceName: string;
  pricingUnit: 'per 1M tokens';
  notes?: string;
}

export interface VerifiedBenchmarkResult {
  id: string;
  benchmarkId: string;
  benchmarkName: string;
  benchmarkVersion: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  score: number;
  unit: '%' | 'pts';
  evaluator: string;
  sourceType: SourceType;
  evaluationDate: string;
  sourceUrl: string;
  testConditions: string;
  sampleSize?: number;
  notes?: string;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  category: 'Coding' | 'Reasoning' | 'Agentic' | 'Multi-turn';
  version: string;
  description: string;
  methodology: string;
  officialUrl: string;
  maintainer: string;
  scoringUnit: string;
  caveats: string[];
}

export interface VerifiedModel {
  id: string;
  displayName: string;
  providerId: ModelProviderId;
  family: string;
  version: string;
  releaseDate: string;
  status: TrustworthyModelStatus;
  statusReason: string;
  officialDocUrl: string;
  description: string;
  capabilities: {
    coding: boolean;
    reasoning: boolean;
    vision: boolean;
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
  };
  contextWindow: number;
  maxOutputTokens: number;
  supportedModalities: string[];
  pricing: VerifiedPricing;
  benchmarks: VerifiedBenchmarkResult[];
  limitations: string[];
  lastVerified: string;
}
