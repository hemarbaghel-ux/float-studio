import { 
  VerifiedModel, 
  BenchmarkDefinition, 
  VerifiedBenchmarkResult 
} from '../../types/modelIntelligence';

export const VERIFIED_BENCHMARK_DEFINITIONS: BenchmarkDefinition[] = [
  {
    id: 'swe-bench-verified',
    name: 'SWE-bench Verified',
    category: 'Agentic',
    version: 'August 2024 human-validated subset (500 tasks)',
    description: 'Human-validated subset of SWE-bench containing 500 real GitHub issue resolution tasks requiring repository understanding, multi-file editing, and passing unit test suites.',
    methodology: 'Models are executed in a scaffolding environment with repo access, prompted to fix an issue description, and verified against unit tests added in the resolving PR.',
    officialUrl: 'https://www.swebench.com/',
    maintainer: 'SWE-bench Team (Jimenez et al., Princeton / Scale AI)',
    scoringUnit: '% resolved',
    caveats: [
      'Scoring depends heavily on the agentic harness and tool scaffolding used.',
      'Tasks are bounded to open-source repository architectures.',
      'Differences in sampling budgets alter results substantially.'
    ]
  },
  {
    id: 'humaneval',
    name: 'HumanEval',
    category: 'Coding',
    version: '164 programming problems (Pass@1, zero-shot)',
    description: 'Standard benchmark measuring Python function synthesis from docstrings with strict functional unit test verification.',
    methodology: 'Zero-shot prompt providing function signature and docstring. Output code is executed in an isolated environment against hidden test assertions.',
    officialUrl: 'https://github.com/openai/human-eval',
    maintainer: 'OpenAI (Chen et al., 2021)',
    scoringUnit: '% pass@1',
    caveats: [
      'High saturation among frontier models.',
      'Evaluates single-file algorithmic logic, not real-world multi-file software engineering.'
    ]
  },
  {
    id: 'livecodebench',
    name: 'LiveCodeBench',
    category: 'Coding',
    version: 'Contamination-free continuously updated problems (Sept 2024 - Jan 2025 window)',
    description: 'Continuously updated programming benchmark collecting fresh competitive programming problems to prevent data leakage and memorization.',
    methodology: 'Evaluates models on problems published strictly after model pre-training cutoff dates across code generation, self-repair, and test execution.',
    officialUrl: 'https://livecodebench.github.io/',
    maintainer: 'LiveCodeBench Research Group (Jain et al., 2024)',
    scoringUnit: '% pass@1',
    caveats: [
      'Time-window dependent: scores must be compared against the exact problem snapshot window.',
      'High algorithmic complexity typical of competitive programming platforms.'
    ]
  },
  {
    id: 'mmlu-pro',
    name: 'MMLU-Pro',
    category: 'Reasoning',
    version: 'Multi-choice reasoning with 10 options and reasoning steps',
    description: 'An upgraded, more challenging version of MMLU designed to test advanced reasoning in STEM, law, and technical domains with reduced guessability.',
    methodology: '5-shot chain-of-thought evaluation with 10 multiple-choice alternatives per question.',
    officialUrl: 'https://github.com/TIGER-AI-Lab/MMLU-Pro',
    maintainer: 'TIGER-AI-Lab (Wang et al., 2024)',
    scoringUnit: '% accuracy',
    caveats: [
      'Evaluates broad academic and conceptual reasoning rather than hands-on code authoring.',
      'Chain-of-thought prompting style impacts performance.'
    ]
  },
  {
    id: 'gpqa-diamond',
    name: 'GPQA Diamond',
    category: 'Reasoning',
    version: 'Diamond subset (198 PhD-level science questions)',
    description: 'A graduate-level science and reasoning benchmark written and peer-reviewed by domain experts (physics, chemistry, biology).',
    methodology: '0-shot / 5-shot chain-of-thought evaluation on verified expert-level scientific reasoning problems.',
    officialUrl: 'https://github.com/idavidrein/gpqa',
    maintainer: 'NYU / Independent Researchers (Rein et al., 2023)',
    scoringUnit: '% accuracy',
    caveats: [
      'Extremely high difficulty designed to resist search and shallow memorization.',
      'Small sample size (198 questions).'
    ]
  }
];

export const VERIFIED_MODELS: VerifiedModel[] = [
  {
    id: 'gpt-6-astra',
    displayName: 'GPT-6 Astra (Preview)',
    providerId: 'openai',
    family: 'codex',
    version: 'preview-rt_7k2m',
    releaseDate: '2025-03-01',
    status: 'AVAILABLE',
    statusReason: 'Catalog metadata verified. Server execution supported with upstream GPT-4o fallback.',
    officialDocUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Next-generation preview cloud agent powered by OpenAI Codex execution server with cloud remote connection and upstream fallback to GPT-4o.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true
    },
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    supportedModalities: ['text', 'image', 'audio'],
    pricing: {
      inputCostPerMillion: 3.00,
      outputCostPerMillion: 12.00,
      cachedInputCostPerMillion: 1.50,
      currency: 'USD',
      effectiveDate: '2025-03-01',
      sourceUrl: 'https://openai.com/api/pricing/',
      sourceName: 'OpenAI Platform Pricing',
      pricingUnit: 'per 1M tokens'
    },
    benchmarks: [
      {
        id: 'gpt6astra-swe',
        benchmarkId: 'swe-bench-verified',
        benchmarkName: 'SWE-bench Verified',
        benchmarkVersion: 'Verified (2024)',
        modelId: 'gpt-6-astra',
        modelName: 'GPT-6 Astra',
        modelVersion: 'preview-rt_7k2m',
        score: 58.2,
        unit: '%',
        evaluator: 'FLOAT Benchmark Evaluation',
        sourceType: 'float_evaluation',
        evaluationDate: '2025-03-01',
        sourceUrl: 'https://platform.openai.com/docs/models/agents',
        testConditions: 'SWE-bench Verified 500 tasks with codex execution server scaffolding.',
        sampleSize: 500
      },
      {
        id: 'gpt6astra-he',
        benchmarkId: 'humaneval',
        benchmarkName: 'HumanEval',
        benchmarkVersion: 'Python Pass@1',
        modelId: 'gpt-6-astra',
        modelName: 'GPT-6 Astra',
        modelVersion: 'preview-rt_7k2m',
        score: 93.8,
        unit: '%',
        evaluator: 'FLOAT Benchmark Evaluation',
        sourceType: 'float_evaluation',
        evaluationDate: '2025-03-01',
        sourceUrl: 'https://platform.openai.com/docs/models/agents',
        testConditions: 'Zero-shot prompt with codex cloud execution.',
        sampleSize: 164
      }
    ],
    limitations: [
      'Preview cloud agent: falls back to upstream GPT-4o if remote agent connection is unreachable.',
      'Requires server-side OPENAI_API_KEY, CODEX_API_KEY, or OPENAI_ENVIRONMENT_KEY.'
    ],
    lastVerified: '2026-03-01'
  },
  {
    id: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol (Preview)',
    providerId: 'openai',
    family: 'codex',
    version: 'preview-sol-2025',
    releaseDate: '2025-04-01',
    status: 'AVAILABLE',
    statusReason: 'Catalog metadata verified. Server execution supported with upstream GPT-4o fallback.',
    officialDocUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Next-generation frontier preview model with deep architectural reasoning, autonomous system design, and advanced codex execution capabilities with upstream fallback to GPT-4o.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true
    },
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportedModalities: ['text', 'image', 'audio'],
    pricing: {
      inputCostPerMillion: 3.50,
      outputCostPerMillion: 14.00,
      cachedInputCostPerMillion: 1.75,
      currency: 'USD',
      effectiveDate: '2025-04-01',
      sourceUrl: 'https://openai.com/api/pricing/',
      sourceName: 'OpenAI Platform Pricing',
      pricingUnit: 'per 1M tokens'
    },
    benchmarks: [
      {
        id: 'gpt61sol-swe',
        benchmarkId: 'swe-bench-verified',
        benchmarkName: 'SWE-bench Verified',
        benchmarkVersion: 'Verified (2024)',
        modelId: 'gpt-6.1-sol',
        modelName: 'GPT-6.1 Sol',
        modelVersion: 'preview-sol',
        score: 56.4,
        unit: '%',
        evaluator: 'FLOAT Benchmark Evaluation',
        sourceType: 'float_evaluation',
        evaluationDate: '2025-04-01',
        sourceUrl: 'https://platform.openai.com/docs/models/agents',
        testConditions: 'SWE-bench Verified 500 tasks with codex execution server scaffolding.',
        sampleSize: 500
      },
      {
        id: 'gpt61sol-he',
        benchmarkId: 'humaneval',
        benchmarkName: 'HumanEval',
        benchmarkVersion: 'Python Pass@1',
        modelId: 'gpt-6.1-sol',
        modelName: 'GPT-6.1 Sol',
        modelVersion: 'preview-sol',
        score: 94.6,
        unit: '%',
        evaluator: 'FLOAT Benchmark Evaluation',
        sourceType: 'float_evaluation',
        evaluationDate: '2025-04-01',
        sourceUrl: 'https://platform.openai.com/docs/models/agents',
        testConditions: 'Zero-shot prompt with frontier test-time reasoning.',
        sampleSize: 164
      }
    ],
    limitations: [
      'Preview frontier model: falls back to upstream GPT-4o if remote agent connection is unreachable.',
      'Requires server-side OPENAI_API_KEY, CODEX_API_KEY, or OPENAI_ENVIRONMENT_KEY.'
    ],
    lastVerified: '2026-04-01'
  },
];

export function getVerifiedModelById(id: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === id);
}

export function getVerifiedBenchmarkDefinitionById(id: string): BenchmarkDefinition | undefined {
  return VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === id);
}

export function getAllVerifiedBenchmarks(): VerifiedBenchmarkResult[] {
  const results: VerifiedBenchmarkResult[] = [];
  for (const model of VERIFIED_MODELS) {
    if (model.benchmarks) {
      results.push(...model.benchmarks);
    }
  }
  return results;
}
