import { AIModel, Agent } from '../../types/ai';
import { VERIFIED_MODELS } from '../../data/verifiedModels';

export const INITIAL_MODELS: AIModel[] = [
  { 
    id: 'auto', 
    exactModelId: 'gemini-3.1-flash-lite',
    providerId: 'auto', 
    displayName: 'Auto (FLOAT Dynamic Router)', 
    family: 'auto', 
    category: 'auto',
    description: 'Automatically routes to the highest-availability operational model in FLOAT (Gemini 3.1 Flash Lite).', 
    capabilities: { coding: true, reasoning: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: true }, 
    contextWindow: 1048576, 
    status: 'AVAILABLE', 
    speed: 'fast',
    reasoningEffort: 'low',
    supportedEfforts: ['low', 'medium', 'high'],
    pricing: {
      inputCost: 0.075,
      outputCost: 0.30,
      currency: 'USD',
      effectiveDate: '2025-06-01'
    },
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-3.1-flash-lite',
    pricingUrl: 'https://ai.google.dev/pricing'
  },
  ...VERIFIED_MODELS.map(vm => ({
    id: vm.id,
    exactModelId: vm.exactModelId,
    providerId: vm.providerId,
    displayName: vm.displayName,
    family: vm.family,
    category: vm.category,
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
    contextWindow: vm.contextWindow,
    status: vm.availabilityStatus as any,
    speed: vm.speed,
    reasoningEffort: vm.reasoningEffort,
    supportedEfforts: vm.supportedEfforts,
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
    deprecationStatus: vm.deprecationStatus
  }))
];

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'main-agent',
    name: 'Main Agent',
    description: 'General purpose AI assistant for coding, questions, and architecture',
    icon: 'Bot',
    systemInstructions: 'You are the main FLOAT assistant.',
    defaultModel: 'auto',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file', 'rename_file', 'delete_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: false, webResearch: false },
    mode: 'agent'
  },
  {
    id: 'coder-agent',
    name: 'Coder',
    description: 'Writes and modifies production code with rigorous precision',
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
    description: 'Reviews code for bugs, logic errors, and security issues',
    icon: 'Eye',
    systemInstructions: 'You are a code reviewer.',
    defaultModel: 'claude-3-5-sonnet-20241022',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'ask'
  },
  {
    id: 'planner-agent',
    name: 'Planner',
    description: 'Plans complex multi-file architectural changes and migrations',
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
    description: 'Navigates, indexes, and explains large complex codebases',
    icon: 'Compass',
    systemInstructions: 'You are a codebase explorer.',
    defaultModel: 'gemini-3.1-flash-lite',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files'],
    permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'ask'
  },
  {
    id: 'debugger-agent',
    name: 'Debugger',
    description: 'Finds, reproduces, and resolves complex runtime bugs',
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
    description: 'Builds beautiful, responsive developer interfaces and frontends',
    icon: 'Layout',
    systemInstructions: 'You are an expert UI/UX developer.',
    defaultModel: 'gemini-3.8-flash',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'edit'
  }
];
