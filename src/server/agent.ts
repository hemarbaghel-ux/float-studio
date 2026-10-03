import { ModelRouter } from './providers/ModelRouter';
import { ModelRequest } from '../types/ai';

interface VirtualFile {
  path: string;
  type: 'file' | 'folder';
  content?: string;
}

const router = new ModelRouter();

// Auto-register some models manually here or import from registry
router.registerModel({
  id: 'gemini-3.5-flash',
  displayName: 'Gemini 3.5 Flash',
  providerId: 'google',
  family: 'gemini',
  contextWindow: 1048576,
  capabilities: { coding: true, reasoning: false, vision: false, tools: true, structuredOutput: true, streaming: true }, status: 'AVAILABLE', speed: 'fast'
});
router.registerModel({
  id: 'gemini-3.5-pro',
  displayName: 'Gemini 3.5 Pro',
  providerId: 'google',
  family: 'gemini',
  contextWindow: 2097152,
  capabilities: { coding: true, reasoning: true, vision: true, tools: true, structuredOutput: true, streaming: true }, status: 'AVAILABLE', speed: 'balanced'
});

export async function runAgentLoop(
  req: any,
  res: any,
  apiKey: string, // passed from environment or request? In the old one it was passed in.
  modelId: string,
  prompt: string,
  virtualFiles: VirtualFile[],
  agentId?: string
) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  sendEvent('event', { type: 'task_started', message: 'Task started...' });
  
  // Set the environment variable for Google Gemini Adapter since it reads from process.env
  // or we could pass it in. If we receive it from req, we temporarily set it (not ideal for concurrent)
  // But wait! AI Studio injects process.env.GEMINI_API_KEY. So we just use that.
  if (apiKey && !process.env.GEMINI_API_KEY) {
     process.env.GEMINI_API_KEY = apiKey;
  }

  sendEvent('event', { type: 'planning', message: 'Planning approach...' });
  
  // Create an in-memory map of files for the tools
  const fileMap = new Map<string, VirtualFile>();
  virtualFiles.forEach(f => fileMap.set(f.path, f));

  // Define tools
  const tools = [
    {
      name: 'list_files',
      description: 'Lists all files in the project workspace.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'read_file',
      description: 'Reads the content of a specific file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path of the file to read, e.g., src/App.tsx' }
        },
        required: ['path']
      }
    },
    {
      name: 'search_codebase',
      description: 'Searches the codebase for a specific query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text to search for' }
        },
        required: ['query']
      }
    },
    {
      name: 'propose_changes',
      description: 'Submits the final proposed changes to the user for review. Use this when you have finished planning and generating changes.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'A short description of the changes' },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'The path of the file to change' },
                operation: { type: 'string', description: 'The operation type: create, modify, delete, rename' },
                proposedContent: { type: 'string', description: 'The new content of the file (required for create and modify)' }
              },
              required: ['path', 'operation']
            }
          }
        },
        required: ['description', 'changes']
      }
    }
  ];

  const systemInstructions = `You are a completely autonomous AI coding agent.
You must use tools to explore the codebase and propose changes.
You DO NOT directly modify files. You use the propose_changes tool to submit a change set for the user to review.
Always read files before modifying them.
When proposing changes, provide the FULL complete file content in proposedContent, do not use diffs or placeholders.`;

  let history: any[] = [{ role: 'user', content: prompt }];
  let changeSet = null;
  let iterations = 0;
  let finalResponseText = '';
  const MAX_ITERATIONS = 10;
  
  // Handle Auto Routing Strategy
  let resolvedModelId = modelId;
  if (resolvedModelId === 'auto') {
     // Simple deterministic routing policy for Phase 3
     if (prompt.toLowerCase().includes('refactor') || prompt.toLowerCase().includes('complex')) {
        resolvedModelId = 'gemini-3.5-pro';
     } else {
        resolvedModelId = 'gemini-3.5-flash';
     }
  }

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      
      const startTime = Date.now();
      
      const request: ModelRequest = {
        modelId: resolvedModelId,
        messages: history,
        systemInstruction: systemInstructions,
        tools,
      };

      const response = await router.route(request);
      
      const latency = Date.now() - startTime;

      const messageParts: any[] = [];
      const functionCalls = response.functionCalls || [];

      if (response.text) {
         finalResponseText = response.text;
         sendEvent('event', { type: 'generating', message: 'Analyzing...' });
         messageParts.push({ text: response.text });
      }

      history.push({ role: 'model', parts: messageParts }); // Store original parts for potential next iteration if needed
      
      if (functionCalls.length > 0) {
        const functionResponses: any[] = [];
        
        for (const call of functionCalls) {
          const { name, args } = call;
          
          if (name === 'list_files') {
            sendEvent('event', { type: 'searching', message: 'Listing files...' });
            const files = Array.from(fileMap.values()).map(f => f.path);
            functionResponses.push({
              name,
              response: { result: files }
            });
          } else if (name === 'read_file') {
            const path = args.path as string;
            sendEvent('event', { type: 'reading_file', message: `Reading ${path}...` });
            
            // Normalize and validate path
            const normalized = path.replace(/^\/+/, '');
            if (normalized.includes('../')) {
              functionResponses.push({ name, response: { error: 'Invalid path: ../ traversal is not allowed.' } });
              continue;
            }

            const file = fileMap.get(normalized);
            if (file && file.type === 'file') {
              functionResponses.push({ name, response: { content: file.content || '' } });
            } else {
              functionResponses.push({ name, response: { error: 'File not found' } });
            }
          } else if (name === 'search_codebase') {
            const query = args.query as string;
            sendEvent('event', { type: 'searching', message: `Searching for "${query}"...` });
            const results: any[] = [];
            
            for (const file of fileMap.values()) {
              if (file.type === 'file' && file.content) {
                if (file.content.includes(query)) {
                  results.push({ path: file.path, match: true }); // Simple implementation
                }
              }
            }
            functionResponses.push({ name, response: { results } });
          } else if (name === 'propose_changes') {
            sendEvent('event', { type: 'review_ready', message: 'Changes are ready for review.' });
            changeSet = {
              id: Math.random().toString(36).substring(7),
              description: args.description,
              status: 'pending',
              changes: (args.changes as any[]).map(c => {
                const original = fileMap.get(c.path)?.content;
                return {
                  path: c.path,
                  operation: c.operation,
                  originalContent: original,
                  proposedContent: c.proposedContent,
                  status: 'pending'
                };
              })
            };
            functionResponses.push({ name, response: { status: 'Changes submitted.' } });
          }
        }
        
        history.push({
          role: 'user',
          parts: functionResponses.map(r => ({ functionResponse: r }))
        });

        if (changeSet) {
           break; // Stop loop after proposing changes
        }
      } else {
        // No function calls, we are done
        // Attach stats metadata on final result
        sendEvent('result', { 
           text: finalResponseText,
           modelId: resolvedModelId,
           agentId,
           latency
        });
        res.end();
        return;
      }
    }

    if (changeSet) {
      sendEvent('result', { changeSet, text: finalResponseText, modelId: resolvedModelId, agentId });
    } else {
      sendEvent('result', { text: finalResponseText, modelId: resolvedModelId, agentId });
    }
  } catch (error: any) {
    console.error('Agent Error:', error);
    sendEvent('event', { type: 'failed', message: error.message || 'An error occurred.' });
  }

  res.end();
}
