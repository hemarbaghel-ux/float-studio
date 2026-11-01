import { 
  VerifiedModel, 
  BenchmarkDefinition, 
  VerifiedBenchmarkResult 
} from '../../types/modelIntelligence';
import { VERIFIED_MODELS as RUNTIME_MODELS } from '../../data/verifiedModels';

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

export const VERIFIED_MODELS: VerifiedModel[] = RUNTIME_MODELS.map((model) => ({
  id: model.id,
  displayName: model.displayName,
  providerId: 'openai',
  family: model.family,
  version: model.snapshotVersion,
  releaseDate: model.releaseDate || 'Unknown',
  status: model.availabilityStatus === 'AVAILABLE'
    ? 'AVAILABLE'
    : model.availabilityStatus === 'UNAVAILABLE'
      ? 'UNAVAILABLE'
      : model.availabilityStatus === 'UNKNOWN'
        ? 'UNVERIFIED'
        : 'CONFIG_REQUIRED',
  statusReason: model.availabilityDetails,
  officialDocUrl: model.docUrl,
  description: model.description,
  capabilities: {
    coding: model.capabilities.coding,
    reasoning: model.capabilities.reasoning,
    vision: model.capabilities.vision,
    tools: model.capabilities.tools,
    structuredOutput: model.capabilities.structuredOutput,
    streaming: model.capabilities.streaming
  },
  contextWindow: model.contextWindow,
  maxOutputTokens: model.maxOutputTokens,
  supportedModalities: model.modalities,
  pricing: {
    inputCostPerMillion: model.pricing.inputCostPer1M,
    outputCostPerMillion: model.pricing.outputCostPer1M,
    cachedInputCostPerMillion: model.pricing.cachedInputCostPer1M,
    currency: model.pricing.currency,
    effectiveDate: model.pricing.effectiveDate,
    sourceUrl: model.pricing.sourceUrl,
    sourceName: model.providerId,
    pricingUnit: model.pricing.pricingUnit
  },
  benchmarks: [],
  limitations: model.limitations
}));
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
