/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CliAgentSurface } from '../core/surfaces/CliAgentSurface';
import { AgentMode } from '../core/harness/ToolPolicyManager';

export async function runFloatCli(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'help' || args.includes('--help')) {
    console.log(`
FLOAT AI Studio CLI (Cursor AI Harness Parity)

Usage:
  float run --prompt "<task>" [--mode agent|ask|plan|debug] [--model <modelId>]
  float plan --prompt "<task>"
  float index [--sync]

Options:
  --prompt    The engineering task or natural language prompt
  --mode      Tool policy mode: agent (default), ask, plan, debug
  --model     Target frontier model (default: composer-pro)
  --json      Output structured JSON response
    `);
    return;
  }

  if (command === 'run' || command === 'plan') {
    const promptIndex = args.indexOf('--prompt');
    const prompt = promptIndex !== -1 ? args[promptIndex + 1] : args[1];

    if (!prompt) {
      console.error('Error: Missing required --prompt argument.');
      process.exit(1);
    }

    const modeIndex = args.indexOf('--mode');
    const mode = (command === 'plan' ? 'plan' : modeIndex !== -1 ? args[modeIndex + 1] : 'agent') as AgentMode;

    const modelIndex = args.indexOf('--model');
    const modelId = modelIndex !== -1 ? args[modelIndex + 1] : 'composer-pro';

    console.log(`[FLOAT CLI] Launching headless harness in ${mode.toUpperCase()} mode with model ${modelId}...`);

    // In-memory mock workspace for standalone CLI testing
    const mockWorkspace: any = {
      listFiles: async () => [],
      readFile: async () => '',
      writeFile: async () => {},
      fileExists: async () => true,
      deleteFile: async () => {}
    };

    const cliSurface = new CliAgentSurface(mockWorkspace);
    const result = await cliSurface.runHeadless({ prompt, mode, modelId });

    if (args.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\nResult:\n${result.finalResponse}\n\nCompleted in ${result.durationMs}ms.`);
    }
    return;
  }

  console.error(`Unknown command "${command}". Run "float help" for usage.`);
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('floatCli.ts')) {
  runFloatCli(process.argv).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
