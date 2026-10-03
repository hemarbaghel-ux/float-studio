const fs = require('fs');
let code = fs.readFileSync('src/store/aiStore.ts', 'utf8');

const defaultAgents = `const defaultAgents: Agent[] = [
  { id: 'main-agent', name: 'Main Agent', description: 'Overall task coordination', icon: 'Bot', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['*'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: true, terminal: true, webResearch: false }, mode: 'agent' },
  { id: 'planner-agent', name: 'Planner Agent', description: 'Break complex requests into executable tasks', icon: 'List', systemInstructions: '', defaultModel: 'gemini-3.5-pro', allowedModels: ['*'], tools: ['read_file', 'search_codebase'], permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'ask' },
  { id: 'explorer-agent', name: 'Explorer Agent', description: 'Understand repository structure', icon: 'Search', systemInstructions: '', defaultModel: 'gemini-3.5-flash', allowedModels: ['*'], tools: ['read_file', 'search_codebase'], permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'ask' },
  { id: 'coder-agent', name: 'Coder Agent', description: 'Implement requested functionality', icon: 'Code', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['read_file', 'search_codebase', 'create_file', 'modify_file'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: false, terminal: false, webResearch: false }, mode: 'edit' },
  { id: 'debugger-agent', name: 'Debugger Agent', description: 'Investigate errors and propose fixes', icon: 'Bug', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['read_file', 'search_codebase', 'modify_file', 'get_diagnostics'], permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'edit' },
  { id: 'reviewer-agent', name: 'Reviewer Agent', description: 'Review generated changes and detect bugs', icon: 'Shield', systemInstructions: '', defaultModel: 'claude-sonnet', allowedModels: ['*'], tools: ['read_file', 'get_diff'], permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'ask' },
  { id: 'ui-agent', name: 'UI Agent', description: 'Build frontend components', icon: 'Layout', systemInstructions: '', defaultModel: 'gemini-3.5-pro', allowedModels: ['*'], tools: ['read_file', 'create_file', 'modify_file'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: false, terminal: false, webResearch: false }, mode: 'edit' },
  { id: 'backend-agent', name: 'Backend Agent', description: 'Build server functionality and APIs', icon: 'Server', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['read_file', 'create_file', 'modify_file'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: false, terminal: false, webResearch: false }, mode: 'edit' },
  { id: 'database-agent', name: 'Database Agent', description: 'Database models and queries', icon: 'Database', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['read_file', 'create_file', 'modify_file'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: false, terminal: false, webResearch: false }, mode: 'edit' },
  { id: 'test-agent', name: 'Test Agent', description: 'Create and execute tests', icon: 'TestTube', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['read_file', 'create_file', 'modify_file', 'run_tests'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: true, deleteFiles: false, terminal: true, webResearch: false }, mode: 'edit' },
  { id: 'terminal-agent', name: 'Terminal Agent', description: 'Run approved terminal commands', icon: 'Terminal', systemInstructions: '', defaultModel: 'gpt-6-astra', allowedModels: ['*'], tools: ['run_terminal'], permissions: { readFiles: false, searchCode: false, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: true, webResearch: false }, mode: 'agent' },
  { id: 'documentation-agent', name: 'Documentation Agent', description: 'Generate/update documentation', icon: 'FileText', systemInstructions: '', defaultModel: 'gemini-3.5-flash', allowedModels: ['*'], tools: ['read_file', 'create_file', 'modify_file'], permissions: { readFiles: true, searchCode: true, createFiles: true, modifyFiles: true, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'edit' },
  { id: 'security-agent', name: 'Security Agent', description: 'Identify security problems', icon: 'ShieldAlert', systemInstructions: '', defaultModel: 'claude-opus', allowedModels: ['*'], tools: ['read_file', 'search_codebase'], permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'ask' },
  { id: 'performance-agent', name: 'Performance Agent', description: 'Identify performance bottlenecks', icon: 'Zap', systemInstructions: '', defaultModel: 'grok', allowedModels: ['*'], tools: ['read_file', 'search_codebase'], permissions: { readFiles: true, searchCode: true, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: false }, mode: 'ask' },
  { id: 'research-agent', name: 'Research Agent', description: 'Research technical info', icon: 'Globe', systemInstructions: '', defaultModel: 'grok', allowedModels: ['*'], tools: ['search_web'], permissions: { readFiles: false, searchCode: false, createFiles: false, modifyFiles: false, renameFiles: false, deleteFiles: false, terminal: false, webResearch: true }, mode: 'ask' }
];

`;

code = code.replace(
  `export const useAIStore = create<AIStore>((set) => ({`,
  defaultAgents + `export const useAIStore = create<AIStore>((set) => ({`
);

code = code.replace(
  `  agents: [],`,
  `  agents: defaultAgents,`
);

fs.writeFileSync('src/store/aiStore.ts', code);
