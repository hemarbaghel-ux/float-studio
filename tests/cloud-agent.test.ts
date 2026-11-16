/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { CloudAgentOrchestrator } from '../src/server/cloudAgent/cloudAgentOrchestrator';

describe('Cloud Agent Orchestrator (Multi-Agent Worktree Coordination)', () => {
  it('detects uncoordinated file ownership conflicts between parallel subtasks', () => {
    const orchestrator = new CloudAgentOrchestrator();

    const conflicts = orchestrator.detectOwnershipConflicts([
      {
        subtaskId: 'subtask-1',
        title: 'Refactor auth',
        role: 'implementer',
        ownedPaths: ['src/auth.ts', 'src/types.ts'],
      },
      {
        subtaskId: 'subtask-2',
        title: 'Add oauth provider',
        role: 'implementer',
        ownedPaths: ['src/auth.ts'], // Conflicting file!
      },
    ]);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].path).toBe('src/auth.ts');
  });

  it('allows same file ownership if subtasks have explicit dependency ordering', () => {
    const orchestrator = new CloudAgentOrchestrator();

    const conflicts = orchestrator.detectOwnershipConflicts([
      {
        subtaskId: 'subtask-1',
        title: 'Prepare schema',
        role: 'planner',
        ownedPaths: ['src/schema.ts'],
      },
      {
        subtaskId: 'subtask-2',
        title: 'Implement migration',
        role: 'implementer',
        ownedPaths: ['src/schema.ts'],
        dependsOn: ['subtask-1'], // Ordered!
      },
    ]);

    expect(conflicts.length).toBe(0);
  });

  it('dispatches and tracks cloud agent run record', () => {
    const orchestrator = new CloudAgentOrchestrator();

    const run = orchestrator.startRun({
      userId: 'user-456',
      projectId: 'proj-789',
      goal: 'Refactor model routing',
      subtasks: [
        {
          subtaskId: 'task-a',
          title: 'Implement router',
          role: 'implementer',
          ownedPaths: ['src/router.ts'],
        },
      ],
    });

    expect(run).toBeDefined();
    expect(run.status).toBe('completed');
    expect(run.runId).toBeDefined();

    const retrieved = orchestrator.getRun(run.runId, 'user-456');
    expect(retrieved).toBeDefined();
    expect(retrieved?.goal).toBe('Refactor model routing');
  });
});
