import { AIModel, Agent } from '../../types/ai';
import { getAllCatalogModels } from '../../data/verifiedModels';
import { DASHBOARD_MODELS } from '../dashboard/dashboardModels';

const existingPredefinedIds = new Set([...DASHBOARD_MODELS.map((m) => m.id)]);

function getProviderDisplayName(providerId: string): string {
  if (providerId === 'google') return 'Google Gemini';
  if (providerId === 'openai') return 'OpenAI';
  if (providerId === 'anthropic') return 'Anthropic';
  return 'FLOAT';
}

const rawInitialModels: AIModel[] = [
  ...DASHBOARD_MODELS,
  ...getAllCatalogModels()
    .filter((vm) => !existingPredefinedIds.has(vm.id))
    .map((vm) => ({
      id: vm.id,
      exactModelId: vm.exactModelId,
      apiModelId: vm.exactModelId,
      providerId: vm.providerId,
      provider: getProviderDisplayName(vm.providerId),
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
      availability: vm.availabilityStatus === 'AVAILABLE' ? 'Available' : 'Add key to enable',
      pricing: {
        inputCost: vm.pricing.inputCostPer1M as any,
        outputCost: vm.pricing.outputCostPer1M as any,
        currency: vm.pricing.currency,
        effectiveDate: vm.pricing.effectiveDate
      },
      limits: {
        maxOutputTokens: vm.maxOutputTokens
      },
      releaseDate: vm.releaseDate,
      modalities: vm.modalities,
      docUrl: vm.docUrl,
      pricingUrl: vm.pricing.sourceUrl || undefined,
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
export const INITIAL_MODELS: AIModel[] = rawInitialModels.filter((m) => {
  if (seenInitialModelIds.has(m.id)) return false;
  seenInitialModelIds.add(m.id);
  return true;
});

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'main-agent',
    name: 'Main Agent',
    description: 'General purpose AI assistant powered by Gemini 4 Argon & GPT-6 Astra',
    icon: 'Bot',
    systemInstructions: 'You are the main FLOAT assistant.',
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gemini-4-argon',
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
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gemini-4-argon',
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
    defaultModel: 'gpt-6-sol',
    fallbackModel: 'gemini-4-argon',
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
    defaultModel: 'gpt-6-sol',
    fallbackModel: 'gemini-4-argon',
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
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gemini-4-argon',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'ask'
  },
  {
    id: 'debugger-agent',
    name: 'Debugger',
    description: 'Finds and fixes bugs with deep reasoning',
    icon: 'Bug',
    systemInstructions: 'You are a debugging expert.',
    defaultModel: 'gpt-6-sol',
    fallbackModel: 'gemini-4-argon',
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
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gemini-4-argon',
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
    systemInstructions: "You are Astra, FLOAT AI's next-generation autonomous cloud execution agent powered by GPT-6 Astra.",
    defaultModel: 'gpt-6-astra',
    fallbackModel: 'gpt-6-sol',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: true, webResearch: true },
    mode: 'agent'
  }
];
