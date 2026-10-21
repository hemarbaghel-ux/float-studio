import { AIModel, Agent } from '../../types/ai';
import { VERIFIED_MODELS } from '../../data/verifiedModels';
import { DASHBOARD_MODELS } from '../dashboard/dashboardModels';

const existingPredefinedIds = new Set([
  ...DASHBOARD_MODELS.map(m => m.id)
]);

const rawInitialModels: AIModel[] = [
  ...DASHBOARD_MODELS,
  ...VERIFIED_MODELS.filter(vm => !existingPredefinedIds.has(vm.id)).map(vm => ({
    id: vm.id,
    exactModelId: vm.exactModelId,
    apiModelId: vm.exactModelId,
    providerId: vm.providerId,
    provider: vm.providerId === 'openai' ? 'OpenAI' : 'FLOAT',
    displayName: vm.displayName,
    shortName: vm.displayName.replace('OpenAI ', ''),
    family: vm.family,
    tier: vm.deprecationStatus === 'preview' ? 'Preview' : undefined,
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
    availabilityDetails: vm.availabilityDetails,
    fallbackModel: vm.fallbackModel,
    cloudAgentConfig: vm.cloudAgentConfig,
    supportsStreaming: vm.capabilities.streaming,
    supportsTools: vm.capabilities.tools,
    supportsVision: vm.capabilities.vision,
    supportsReasoning: vm.capabilities.reasoning
  }))
];

const seenInitialModelIds = new Set<string>();
export const INITIAL_MODELS: AIModel[] = rawInitialModels.filter(m => {
  if (seenInitialModelIds.has(m.id)) return false;
  seenInitialModelIds.add(m.id);
  return true;
});

export const FLOAT_BASIC_MODEL: AIModel | undefined = INITIAL_MODELS.find(m => m.id === 'float-basic');

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'main-agent',
    name: 'Main Agent',
    description: 'General purpose AI assistant powered by OpenAI and FLOAT AI',
    icon: 'Bot',
    systemInstructions: 'You are the main FLOAT assistant.',
    defaultModel: 'gpt-4o',
    fallbackModel: 'gpt-4o-mini',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: false, webResearch: false },
    mode: 'agent'
  },
  {
    id: 'coder-agent',
    name: 'Coder',
    description: 'Writes and modifies code with proposal review',
    icon: 'Code',
    systemInstructions: 'You are an expert software engineer.',
    defaultModel: 'gpt-4o',
    fallbackModel: 'float-basic',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: false, webResearch: false },
    mode: 'edit'
  },
  {
    id: 'reviewer-agent',
    name: 'Reviewer',
    description: 'Reviews code for bugs and security issues',
    icon: 'Eye',
    systemInstructions: 'You are a code reviewer.',
    defaultModel: 'gpt-4o',
    fallbackModel: 'float-basic',
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
    defaultModel: 'o3-mini',
    fallbackModel: 'float-basic',
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
    fallbackModel: 'float-basic',
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
    fallbackModel: 'float-basic',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'modify_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: true, webResearch: false },
    mode: 'edit'
  },
  {
    id: 'ui-agent',
    name: 'UI Agent',
    description: 'Builds polished user interfaces',
    icon: 'Layout',
    systemInstructions: 'You are an expert UI/UX developer.',
    defaultModel: 'gpt-4o',
    fallbackModel: 'float-basic',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'edit'
  },
  {
    id: 'astra-agent',
    name: 'Astra Cloud Agent',
    description: 'Autonomous cloud execution agent powered by GPT-6 Astra',
    icon: 'Sparkles',
    systemInstructions: 'You are Astra, FLOAT AI\'s next-generation autonomous cloud execution agent powered by GPT-6 Astra.',
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gpt-4o',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: true, webResearch: true },
    mode: 'agent'
  }
];
