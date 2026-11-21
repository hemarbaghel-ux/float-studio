/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface HarnessToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, any>;
  readonly requiresApproval: boolean;
}

export const HARNESS_CANONICAL_TOOLS: readonly HarnessToolSchema[] = [
  {
    name: 'search_files',
    description: 'Searches workspace file paths, directories, or regex text matching across files.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or regex pattern' },
        directory: { type: 'string', description: 'Relative directory to search within' },
        maxResults: { type: 'number', description: 'Max matches to return (default: 25)' }
      },
      required: ['query']
    },
    requiresApproval: false
  },
  {
    name: 'semantic_search',
    description: 'Performs semantic codebase search using AST chunking, embeddings, and hybrid grep.',
    parameters: {
      type: 'object',
      properties: {
        naturalLanguageQuery: { type: 'string', description: 'Description of what code/function you are looking for' },
        limit: { type: 'number', description: 'Max code snippets to return (default: 10)' }
      },
      required: ['naturalLanguageQuery']
    },
    requiresApproval: false
  },
  {
    name: 'read_file',
    description: 'Reads the full or partial content of a file, including source code, text, or image metadata.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace relative path of the file to read' },
        startLine: { type: 'number', description: '1-based starting line number' },
        endLine: { type: 'number', description: '1-based ending line number' }
      },
      required: ['path']
    },
    requiresApproval: false
  },
  {
    name: 'edit_file',
    description: 'Applies surgical or multi-line edits to a file. Changes are staged and reviewed as diffs before acceptance.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace relative path of the file to edit' },
        targetText: { type: 'string', description: 'Exact string or block to replace' },
        replacementText: { type: 'string', description: 'Replacement content' },
        explanation: { type: 'string', description: 'Reason for the change' }
      },
      required: ['path', 'targetText', 'replacementText']
    },
    requiresApproval: false
  },
  {
    name: 'run_shell',
    description: 'Executes a command in a real terminal profile, watching output so the agent can react to test or build failures.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command line to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' }
      },
      required: ['command']
    },
    requiresApproval: true
  },
  {
    name: 'browser',
    description: 'Navigates web pages, takes screenshots, clicks elements, and interacts with running applications.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['navigate', 'click', 'screenshot', 'fill'], description: 'Browser action to execute' },
        url: { type: 'string', description: 'Target URL' },
        selector: { type: 'string', description: 'CSS selector for element interaction' }
      },
      required: ['action']
    },
    requiresApproval: false
  },
  {
    name: 'web_search',
    description: 'Performs live web searches to look up documentation, libraries, APIs, and stack traces.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' }
      },
      required: ['query']
    },
    requiresApproval: false
  },
  {
    name: 'fetch_rules_or_skills',
    description: 'Dynamically fetches active repository rules (.cursor/rules, .float/rules) or loads specialized skills by name on demand.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule file or skill ID to load' }
      },
      required: ['name']
    },
    requiresApproval: false
  },
  {
    name: 'generate_image',
    description: 'Creates or edits images, diagrams, or visual mockups from a text brief.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Visual brief description' },
        outputPath: { type: 'string', description: 'Where to save the generated image asset' }
      },
      required: ['prompt']
    },
    requiresApproval: false
  },
  {
    name: 'ask_user',
    description: 'Asks the user a clarifying question while continuing non-dependent work asynchronously.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to present to the user' },
        options: { type: 'array', items: { type: 'string' }, description: 'Suggested multiple choice answers if applicable' }
      },
      required: ['question']
    },
    requiresApproval: false
  },
  {
    name: 'invoke_subagent',
    description: 'Delegates an isolated slice of work to a subagent (research, shell, browser, or custom .cursor/agents/ or .float/agents/).',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Job title or role of the subagent' },
        prompt: { type: 'string', description: 'Specific task description and completion condition' },
        subagentType: { type: 'string', enum: ['research', 'shell', 'browser', 'custom'], description: 'Type of subagent' }
      },
      required: ['role', 'prompt']
    },
    requiresApproval: false
  }
];

export function getToolsForModel(modelName: string): HarnessToolSchema[] {
  // Format tool descriptions tailored per model family (Composer, OpenAI, Anthropic, Gemini)
  return HARNESS_CANONICAL_TOOLS.map(tool => {
    if (modelName.startsWith('claude')) {
      return {
        ...tool,
        description: `[Claude Optimized] ${tool.description}`
      };
    }
    return tool;
  });
}
