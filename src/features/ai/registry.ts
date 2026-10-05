import { AIModel, Agent } from '../../types/ai';
import { VERIFIED_MODELS } from '../../data/verifiedModels';
import { DASHBOARD_MODELS } from '../dashboard/dashboardModels';

const dashboardModelIds = new Set([...DASHBOARD_MODELS.map(m => m.id), 'float-basic']);

export const FLOAT_BASIC_MODEL: AIModel = {
  id: 'float-basic',
  exactModelId: 'gemini-3.8-flash',
  apiModelId: 'gemini-3.8-flash',
  providerId: 'google',
  provider: 'FLOAT',
  tier: 'Free',
  displayName: 'FLOAT Basic',
  shortName: 'FLOAT Basic',
  family: 'float',
  description: 'Everyday developer model for basic coding assistance, simple functions, code explanations, step-by-step plans, and straightforward debugging on the Free tier.',
  capabilities: {
    coding: true,
    reasoning: true,
    vision: false,
    tools: true,
    structuredOutput: true,
    streaming: true,
    longContext: false
  },
  capabilitiesList: ['Coding', 'Reviewing', 'Planning', 'Debugging', 'Exploring', 'UI assistance'],
  contextWindow: 131072,
  status: 'AVAILABLE',
  speed: 'fast',
  version: 'basic',
  reasoningLevel: 'Free · Basic coding assistance',
  isNew: false,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: false,
  supportsReasoning: false,
  availability: 'Available',
  pricing: {
    inputCost: 0,
    outputCost: 0,
    currency: 'USD',
    effectiveDate: '2025-01-01'
  },
  limits: { maxOutputTokens: 8192 },
  limitations: [
    'Basic coding assistance tier: not optimized for large-scale architectural redesign or complex multi-repository refactoring.',
    'Does not perform long autonomous agent runs, production infrastructure management, or automatic git pushes.',
    'Server-side proposal review and explicit apply/reject workflows remain strictly enforced.'
  ],
  intendedUseCases: [
    'Small code changes, simple functions, and code snippets',
    'Explaining obvious issues, common bugs, and code-quality feedback',
    'Step-by-step planning and basic implementation guides',
    'Analyzing straightforward errors and stack traces',
    'Exploring and understanding project files and functions',
    'Creating or modifying basic UI components and layouts'
  ],
  availabilityDetails: 'Operational on the Free tier. Powered by FLOAT server-side Google Gemini architecture.'
};

export const INITIAL_MODELS: AIModel[] = [
  FLOAT_BASIC_MODEL,
  ...DASHBOARD_MODELS,
  {
    id: 'auto',
    exactModelId: 'gemini-2.0-flash',
    providerId: 'auto',
    displayName: 'Auto (FLOAT Dynamic Router)',
    shortName: 'Auto',
    family: 'auto',
    description: 'Automatically routes to the highest-performance operational model in FLOAT (Gemini 2.0 Flash).',
    capabilities: { coding: true, reasoning: true, vision: true, tools: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Vision', 'Tool use'],
    contextWindow: 1048576,
    status: 'AVAILABLE',
    speed: 'fast',
    reasoningLevel: 'High Fast',
    version: 'high effort',
    availability: 'Available',
    pricing: {
      inputCost: 0.10,
      outputCost: 0.40,
      currency: 'USD',
      effectiveDate: '2025-01-15'
    },
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.0-flash',
    pricingUrl: 'https://ai.google.dev/pricing'
  },
  ...VERIFIED_MODELS.filter(vm => !dashboardModelIds.has(vm.id)).map(vm => ({
    id: vm.id,
    exactModelId: vm.exactModelId,
    apiModelId: vm.exactModelId,
    providerId: vm.providerId,
    provider: vm.providerId === 'google' ? 'Google' : vm.providerId === 'openai' ? 'OpenAI' : vm.providerId === 'anthropic' ? 'Anthropic' : vm.providerId === 'xai' ? 'xAI' : 'FLOAT',
    displayName: vm.displayName,
    shortName: vm.displayName.replace('Google ', '').replace('OpenAI ', '').replace('Anthropic ', ''),
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

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'main-agent',
    name: 'Main Agent',
    description: 'General purpose AI assistant',
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
    defaultModel: 'claude-3-5-sonnet-20241022',
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
    defaultModel: 'o1-preview',
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
    defaultModel: 'gemini-3.8-flash',
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
    defaultModel: 'o1-mini',
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
    defaultModel: 'gemini-3.8-flash',
    allowedModels: ['*'],
    tools: ['search_codebase', 'read_file', 'list_files', 'create_file', 'modify_file'],
    permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false },
    mode: 'edit'
  }
];
