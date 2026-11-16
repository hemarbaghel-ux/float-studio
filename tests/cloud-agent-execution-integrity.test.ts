/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import { CloudAgentOrchestrator } from '../src/server/cloudAgent/cloudAgentOrchestrator';
import { createApp } from '../src/server/app';

describe('Cloud Agent Execution Integrity & Option B Safeguards', () => {
  let orchestrator: CloudAgentOrchestrator;

  beforeEach(() => {
    orchestrator = new CloudAgentOrchestrator();
  });

  describe('Orchestrator Run Lifecycle & Fake-Completion Rejection', () => {
    it('initializes legitimate runs with "queued" status, never marking unexecuted runs as completed', () => {
      const run = orchestrator.startRun({
        userId: 'user_dev',
        projectId: 'proj_float',
        goal: 'Add logging middleware',
        subtasks: [
          {
            subtaskId: 'st_1',
            title: 'Create middleware',
            role: 'implementer',
            ownedPaths: ['src/middleware/logger.ts'],
          },
        ],
      });

      expect(run.status).toBe('queued');
      expect(run.mergedProposal).toBeUndefined();
      expect(run.status).not.toBe('completed');
      expect(run.status).not.toBe('proposal_ready');
    });

    it('blocks runs with "conflict_blocked" when parallel subtasks have overlapping owned paths without dependency ordering', () => {
      const run = orchestrator.startRun({
        userId: 'user_dev',
        projectId: 'proj_float',
        goal: 'Refactor authentication and database',
        subtasks: [
          {
            subtaskId: 'st_1',
            title: 'Update auth config',
            role: 'implementer',
            ownedPaths: ['src/config.ts'],
          },
          {
            subtaskId: 'st_2',
            title: 'Update db config',
            role: 'implementer',
            ownedPaths: ['src/config.ts'], // Conflict!
          },
        ],
      });

      expect(run.status).toBe('conflict_blocked');
      expect(run.fileOwnershipConflicts).toHaveLength(1);
      expect(run.fileOwnershipConflicts[0].path).toBe('src/config.ts');
    });

    it('supports cancellation of active runs', () => {
      const run = orchestrator.startRun({
        userId: 'user_dev',
        projectId: 'proj_float',
        goal: 'Long running task',
        subtasks: [
          {
            subtaskId: 'st_1',
            title: 'Process items',
            role: 'implementer',
            ownedPaths: ['src/items.ts'],
          },
        ],
      });

      const cancelled = orchestrator.cancelRun(run.runId, 'user_dev');
      expect(cancelled).toBeDefined();
      expect(cancelled?.status).toBe('cancelled');
    });
  });

  describe('Public Route Fail-Closed Enforcement (Option B)', () => {
    it('returns HTTP 503 CLOUD_AGENT_EXECUTION_NOT_CONFIGURED on public execution route', async () => {
      const app = await createApp({ skipVite: true });

      // Simulate request through express application
      const req: any = {
        method: 'POST',
        url: '/api/projects/proj-123/cloud-agent/runs',
        params: { projectId: 'proj-123' },
        user: { uid: 'user_test' },
        body: { goal: 'Run agent', subtasks: [{ subtaskId: '1', title: 'Task', role: 'implementer', ownedPaths: ['file.ts'] }] },
      };

      let responseStatusCode = 0;
      let responseBody: any = null;

      const res: any = {
        status(code: number) {
          responseStatusCode = code;
          return this;
        },
        json(data: any) {
          responseBody = data;
          return this;
        },
      };

      // Find the cloud-agent route layer in express router
      const routes = (app as any)._router.stack;
      const cloudRouteLayer = routes.find((layer: any) =>
        layer.route && layer.route.path === '/api/projects/:projectId/cloud-agent/runs'
      );

      expect(cloudRouteLayer).toBeDefined();
      // Invoke route handler
      const handler = cloudRouteLayer.route.stack[cloudRouteLayer.route.stack.length - 1].handle;
      await handler(req, res);

      expect(responseStatusCode).toBe(503);
      expect(responseBody.code).toBe('CLOUD_AGENT_EXECUTION_NOT_CONFIGURED');
      expect(responseBody.error).toContain('autonomous execution pipeline is not configured');
    });
  });
});
