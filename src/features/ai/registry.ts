import { AIModel, Agent } from '../../types/ai';
import { VERIFIED_MODELS } from '../../data/verifiedModels';
import { DASHBOARD_MODELS } from '../dashboard/dashboardModels';

const existingPredefinedIds = new Set([
  'float-basic',
  'auto',
  ...DASHBOARD_MODELS.map(m => m.id)
]);

export const FLOAT_BASIC_MODEL: AIModel = {
  id: 'float-basic',
  exactModelId: 'gpt-4o-mini',
  apiModelId: 'gpt-4o-mini',
  providerId: 'openai',
  provider: 'FLOAT (OpenAI)',
  displayName: 'FLOAT Basic',
  shortName: 'FLOAT Basic',
  family: 'gpt',
  tier: 'Free',
  description: 'Free tier developer model powered by server-side OpenAI (GPT-4o mini). Optimized for rapid code editing, lint fixing, and codebase queries.',
  capabilities: {
    coding: true,
    reasoning: false,
    vision: true,
    tools: true,
    structuredOutput: true,
    streaming: true,
    longContext: true
  },
  capabilitiesList: ['Coding', 'Reviewing', 'Planning', 'Debugging', 'Exploring', 'UI assistance'],
  contextWindow: 128000,
  status: 'AVAILABLE',
  speed: 'fast',
  reasoningLevel: 'Fast',
  supportsReasoning: false,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: true,
  version: 'gpt-4o-mini',
  availability: 'Available',
  pricing: {
    inputCost: 0,
    outputCost: 0,
    currency: 'USD',
    effectiveDate: '2024-07-18'
  },
  docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
  pricingUrl: 'https://openai.com/api/pricing/'
};

const rawInitialModels: AIModel[] = [
  FLOAT_BASIC_MODEL,
  ...DASHBOARD_MODELS,
  {
    id: 'auto',
    exactModelId: 'gpt-4o',
    apiModelId: 'gpt-4o',
    providerId: 'auto',
    provider: 'OpenAI',
    displayName: 'Auto (FLOAT Dynamic Router)',
    shortName: 'Auto',
    family: 'auto',
    description: 'Automatically routes to the highest-performance operational OpenAI model in FLOAT (GPT-4o).',
    capabilities: { coding: true, reasoning: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Vision', 'Tool use'],
    contextWindow: 128000,
    status: 'AVAILABLE',
    speed: 'fast',
    reasoningLevel: 'Balanced',
    version: 'high effort',
    availability: 'Available',
    pricing: {
      inputCost: 2.50,
      outputCost: 10.00,
      currency: 'USD',
      effectiveDate: '2024-11-20'
    },
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o',
    pricingUrl: 'https://openai.com/api/pricing/'
  },
  ...VERIFIED_MODELS.filter(vm => !existingPredefinedIds.has(vm.id)).map(vm => ({
    id: vm.id,
    exactModelId: vm.exactModelId,
    apiModelId: vm.exactModelId,
    providerId: vm.providerId,
    provider: vm.providerId === 'openai' ? 'OpenAI' : 'FLOAT',
    displayName: vm.displayName,
    shortName: vm.displayName.replace('OpenAI ', ''),
    family: vm.family,
    description: vm.description,
    capabilities: {
      coding: vm.capabilities.coding,
      reasoning: vm.capabilities.reasoning,
      vision: vm.capabilities.vision,
      tools: vm.capabilities.tools,
      structuredOutput: vm.capabilities.structuredOutput,
      streaming: vm.capabilities.streaming,
      longContext: vm.capabilities.longContext
    },
    capabilitiesList: [
      ...(vm.capabilities.coding ? ['Coding'] : []),
      ...(vm.capabilities.reasoning ? ['Reasoning'] : []),
      ...(vm.capabilities.tools ? ['Tool use'] : []),
      ...(vm.capabilities.vision ? ['Vision'] : [])
    ],
    contextWindow: vm.contextWindow,
    status: vm.availabilityStatus as any,
    speed: vm.speed,
    reasoningLevel: vm.speed === 'fast' ? 'Fast' : vm.speed === 'slow' ? 'High' : 'Medium',
    version: vm.snapshotVersion || vm.id,
    availability: vm.availabilityStatus === 'AVAILABLE' ? 'Available' : 'Configuration required',
    pricing: {
      inputCost: vm.pricing.inputCostPer1M,
      outputCost: vm.pricing.outputCostPer1M,
      currency: vm.pricing.currency,
      effectiveDate: vm.pricing.effectiveDate
    },
    limits: {
      maxOutputTokens: vm.maxOutputTokens
    },
    releaseDate: vm.releaseDate,
    modalities: vm.modalities,
    docUrl: vm.docUrl,
    pricingUrl: vm.pricing.sourceUrl,
    snapshotVersion: vm.snapshotVersion,
    limitations: vm.limitations,
    intendedUseCases: vm.intendedUseCases,
    availabilityDetails: vm.availabilityDetails
  }))
];

const seenInitialModelIds = new Set<string>();
export const INITIAL_MODELS: AIModel[] = rawInitialModels.filter(m => {
  if (seenInitialModelIds.has(m.id)) return false;
  seenInitialModelIds.add(m.id);
  return true;
});

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'main-agent',
    name: 'Main Agent',
    description: 'General purpose AI assistant',
    icon: 'Bot',
    systemInstructions: 'You are the main FLOAT assistant powered by OpenAI.',
    defaultModel: 'auto',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: false, webResearch: false },
    mode: 'agent'
  },
  {
    id: 'coder-agent',
    name: 'Coder',
    description: 'Writes and modifies code',
    icon: 'Code',
    systemInstructions: 'You are an expert coder.',
    defaultModel: 'gpt-4o',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: false, webResearch: false },
    mode: 'edit'
  },
  {
    id: 'reviewer-agent',
    name: 'Reviewer',
    description: 'Reviews code for bugs and quality',
    icon: 'Eye',
    systemInstructions: 'You are a code reviewer.',
    defaultModel: 'gpt-4o',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'ask'
  },
  {
    id: 'planner-agent',
    name: 'Planner',
    description: 'Plans complex architectural changes',
    icon: 'Map',
    systemInstructions: 'You are a software architect.',
    defaultModel: 'o1',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'ask'
  },
  {
    id: 'explorer-agent',
    name: 'Explorer',
    description: 'Navigates and explains large codebases',
    icon: 'Compass',
    systemInstructions: 'You are a codebase explorer.',
    defaultModel: 'gpt-4o-mini',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'ask'
  },
  {
    id: 'debugger-agent',
    name: 'Debugger',
    description: 'Finds and fixes bugs',
    icon: 'Bug',
    systemInstructions: 'You are a debugging expert.',
    defaultModel: 'o3-mini',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'modify_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: true, webResearch: false },
    mode: 'edit'
  },
  {
    id: 'ui-agent',
    name: 'UI Agent',
    description: 'Builds beautiful user interfaces',
    icon: 'Layout',
    systemInstructions: 'You are an expert UI/UX developer.',
    defaultModel: 'gpt-4o',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'edit'
  },
  {
    id: 'astra-agent',
    name: 'Astra Cloud Agent',
    description: 'Autonomous cloud execution agent powered by GPT-6 Astra Preview with upstream GPT-4o fallback',
    icon: 'Sparkles',
    systemInstructions: 'You are Astra, FLOAT AI\'s next-generation autonomous cloud execution agent powered by GPT-6 Astra (Preview) with upstream GPT-4o fallback.',
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gpt-4o',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: true, webResearch: true },
    mode: 'agent'
  }
];
