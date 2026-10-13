export type EvaluatorType = 'Official provider report' | 'Independent evaluation' | 'FLOAT evaluation';

export interface VerifiedBenchmarkDefinition {
  id: string;
  name: string;
  version: string;
  category: 'Software Engineering' | 'Code Generation' | 'Scientific Reasoning' | 'Mathematics';
  metricName: string;
  scoreUnit: '%';
  higherIsBetter: boolean;
  description: string;
  officialSourceUrl: string;
  maintainer: string;
  datasetSize: string;
  methodologyOverview: string;
  evaluationConditions: string;
  comparabilityGuidelines: string;
}

export interface VerifiedBenchmarkScore {
  id: string;
  benchmarkId: string;
  benchmarkName: string;
  benchmarkVersion: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  providerId: 'openai';
  score: number;
  scoreUnit: '%';
  evalDate: string;
  sourceUrl: string;
  evaluatorType: EvaluatorType;
  evaluatorName: string;
  testConfiguration: string;
  scaffoldingUsed: boolean;
  isComparableWithStandard: boolean;
  notesAndLimitations?: string;
}

export const VERIFIED_BENCHMARK_DEFINITIONS: VerifiedBenchmarkDefinition[] = [
  {
    id: 'swe-bench-verified',
    name: 'SWE-bench Verified',
    version: 'Verified (2024)',
    category: 'Software Engineering',
    metricName: 'Resolved %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: 'Gold-standard benchmark evaluating autonomous agent software engineering capabilities across 500 human-validated real GitHub issues from open-source repositories.',
    officialSourceUrl: 'https://www.swebench.com/',
    maintainer: 'Princeton University / Scale AI',
    datasetSize: '500 validated task instances',
    methodologyOverview: 'Model is provided repository code and problem statement. Resolving patch must pass fail-to-pass unit tests without regressing pass-to-pass tests.',
    evaluationConditions: 'Standard agent scaffolding with tool calling, repository navigation, and test execution capability.',
    comparabilityGuidelines: 'Compare only against standard verified split. Scaffolding differences significantly impact resolution rate.'
  },
  {
    id: 'humaneval',
    name: 'HumanEval',
    version: 'Python Pass@1',
    category: 'Code Generation',
    metricName: 'Pass@1 %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: '164 handcrafted Python programming challenges testing function synthesis from docstrings and passing unit tests on first attempt.',
    officialSourceUrl: 'https://github.com/openai/human-eval',
    maintainer: 'OpenAI (Chen et al.)',
    datasetSize: '164 coding tasks',
    methodologyOverview: 'Zero-shot prompt containing function signature and docstring. Generated code is executed in sandbox against unit assertions.',
    evaluationConditions: 'Standard zero-shot generation without human in the loop.',
    comparabilityGuidelines: 'Highly comparable across all frontier models. Modern frontier models exhibit near-saturation.'
  },
  {
    id: 'gpqa-diamond',
    name: 'GPQA Diamond',
    version: 'Diamond (198 questions)',
    category: 'Scientific Reasoning',
    metricName: 'Accuracy %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: '198 extremely challenging graduate-level biology, physics, and chemistry multiple-choice questions written and validated by domain experts.',
    officialSourceUrl: 'https://github.com/idavidrein/gpqa',
    maintainer: 'NYU / Independent researchers (Rein et al.)',
    datasetSize: '198 multiple-choice questions',
    methodologyOverview: 'Evaluated with chain-of-thought prompting. Questions are designed to be Google-proof and resist superficial memorization.',
    evaluationConditions: 'Chain-of-thought with reasoning effort configured.',
    comparabilityGuidelines: 'Compare diamond split scores with matching reasoning token budgets.'
  },
  {
    id: 'math-500',
    name: 'MATH-500',
    version: 'Representative subset (500 problems)',
    category: 'Mathematics',
    metricName: 'Accuracy %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: '500 challenging high-school competition mathematics problems spanning algebra, geometry, number theory, and calculus.',
    officialSourceUrl: 'https://github.com/openai/prm800k',
    maintainer: 'OpenAI (Lightman et al.)',
    datasetSize: '500 competition math problems',
    methodologyOverview: 'Problems require formal multi-step derivations ending in exact boxed numeric or algebraic expressions.',
    evaluationConditions: 'Evaluated with step-by-step reasoning or thinking tokens enabled.',
    comparabilityGuidelines: 'Directly comparable across test-time reasoning models.'
  }
];

export const VERIFIED_BENCHMARK_SCORES: VerifiedBenchmarkScore[] = [
  // --- SWE-bench Verified ---
  {
    id: 'swe-gpt-6-astra',
    benchmarkId: 'swe-bench-verified',
    benchmarkName: 'SWE-bench Verified',
    benchmarkVersion: 'Verified (2024)',
    modelId: 'gpt-6-astra',
    modelName: 'GPT-6 Astra (Preview)',
    modelVersion: 'preview-rt_7k2m',
    providerId: 'openai',
    score: 58.2,
    scoreUnit: '%',
    evalDate: '2025-03-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Autonomous cloud execution agent scaffolding with codex runner.',
    scaffoldingUsed: true,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with autonomous agent scaffolding.'
  },
  {
    id: 'swe-gpt-6-1-sol',
    benchmarkId: 'swe-bench-verified',
    benchmarkName: 'SWE-bench Verified',
    benchmarkVersion: 'Verified (2024)',
    modelId: 'gpt-6.1-sol',
    modelName: 'GPT-6.1 Sol (Preview)',
    modelVersion: 'preview-sol',
    providerId: 'openai',
    score: 56.4,
    scoreUnit: '%',
    evalDate: '2025-04-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Full preview evaluation with codex agent runner and repository scaffolding.',
    scaffoldingUsed: true,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with test-time reasoning and execution tools.'
  },

  // --- HumanEval (Python Pass@1) ---
  {
    id: 'he-gpt-6-astra',
    benchmarkId: 'humaneval',
    benchmarkName: 'HumanEval',
    benchmarkVersion: 'Python Pass@1',
    modelId: 'gpt-6-astra',
    modelName: 'GPT-6 Astra (Preview)',
    modelVersion: 'preview-rt_7k2m',
    providerId: 'openai',
    score: 93.8,
    scoreUnit: '%',
    evalDate: '2025-03-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Zero-shot prompt with codex cloud execution.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Autonomous cloud agent execution.'
  },
  {
    id: 'he-gpt-6-1-sol',
    benchmarkId: 'humaneval',
    benchmarkName: 'HumanEval',
    benchmarkVersion: 'Python Pass@1',
    modelId: 'gpt-6.1-sol',
    modelName: 'GPT-6.1 Sol (Preview)',
    modelVersion: 'preview-sol',
    providerId: 'openai',
    score: 94.6,
    scoreUnit: '%',
    evalDate: '2025-04-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Zero-shot prompt with frontier test-time reasoning.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with test-time reasoning.'
  },

  // --- GPQA Diamond ---
  {
    id: 'gpqa-gpt-6-astra',
    benchmarkId: 'gpqa-diamond',
    benchmarkName: 'GPQA Diamond',
    benchmarkVersion: 'Diamond (198 questions)',
    modelId: 'gpt-6-astra',
    modelName: 'GPT-6 Astra (Preview)',
    modelVersion: 'preview-rt_7k2m',
    providerId: 'openai',
    score: 72.4,
    scoreUnit: '%',
    evalDate: '2025-03-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Chain-of-thought with cloud execution.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Preview evaluation.'
  },
  {
    id: 'gpqa-gpt-6-1-sol',
    benchmarkId: 'gpqa-diamond',
    benchmarkName: 'GPQA Diamond',
    benchmarkVersion: 'Diamond (198 questions)',
    modelId: 'gpt-6.1-sol',
    modelName: 'GPT-6.1 Sol (Preview)',
    modelVersion: 'preview-sol',
    providerId: 'openai',
    score: 74.8,
    scoreUnit: '%',
    evalDate: '2025-04-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Frontier reasoning effort mode.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Deep test-time reasoning.'
  },

  // --- MATH-500 ---
  {
    id: 'math-gpt-6-astra',
    benchmarkId: 'math-500',
    benchmarkName: 'MATH-500',
    benchmarkVersion: 'Representative subset (500 problems)',
    modelId: 'gpt-6-astra',
    modelName: 'GPT-6 Astra (Preview)',
    modelVersion: 'preview-rt_7k2m',
    providerId: 'openai',
    score: 91.5,
    scoreUnit: '%',
    evalDate: '2025-03-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Multi-step reasoning prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Autonomous cloud agent execution.'
  },
  {
    id: 'math-gpt-6-1-sol',
    benchmarkId: 'math-500',
    benchmarkName: 'MATH-500',
    benchmarkVersion: 'Representative subset (500 problems)',
    modelId: 'gpt-6.1-sol',
    modelName: 'GPT-6.1 Sol (Preview)',
    modelVersion: 'preview-sol',
    providerId: 'openai',
    score: 93.2,
    scoreUnit: '%',
    evalDate: '2025-04-01',
    sourceUrl: 'https://platform.openai.com/docs/models/agents',
    evaluatorType: 'FLOAT evaluation',
    evaluatorName: 'FLOAT Engineering',
    testConfiguration: 'Frontier reasoning derivation mode.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with frontier test-time reasoning.'
  }
];

export function getBenchmarkDefinition(id: string): VerifiedBenchmarkDefinition | undefined {
  return VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === id);
}

export function getScoresForModel(modelId: string): VerifiedBenchmarkScore[] {
  return VERIFIED_BENCHMARK_SCORES.filter(s => s.modelId === modelId);
}

export function getScoresForBenchmark(benchmarkId: string): VerifiedBenchmarkScore[] {
  return VERIFIED_BENCHMARK_SCORES.filter(s => s.benchmarkId === benchmarkId);
}
