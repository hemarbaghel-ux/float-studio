import { v4 as uuidv4 } from 'uuid';
import { Plan, PlanStep, PlanStatus, PlanStepStatus } from '../../types/plan';
import { savePlanDurable, getPlanDurable, listPlansDurable, updatePlanDurable } from './planPersistence';
import { sanitizeProposalPath } from './proposalService';
import { ModelRouter } from '../providers/router';
import { workspaceIndexManager } from '../../services/indexing/workspaceIndexManager';

export interface GeneratePlanInput {
  ownerId: string;
  projectId: string;
  conversationId: string;
  prompt: string;
  virtualFiles?: Array<{ path: string; name?: string; content?: string; type?: string }>;
  model?: string;
}

export class PlanService {
  /**
   * Generates a structured multi-step plan using the AI model without executing code or mutating files.
   */
  static async generatePlan(input: GeneratePlanInput, modelRouter: ModelRouter): Promise<{ plan?: Plan; error?: string }> {
    const { ownerId, projectId, conversationId, prompt, virtualFiles = [], model = 'gemini-3.8-flash' } = input;

    if (!prompt || !prompt.trim()) {
      return { error: 'A task request is required to generate a plan.' };
    }

    // Keep context bounded with language-aware indexing
    let relevantContextBlock = '';
    try {
      const index = workspaceIndexManager.syncProject(projectId, virtualFiles.map(f => ({ path: f.path, name: f.name, content: f.content, type: f.type || 'file' })));
      const bounded = index.retrieveBoundedContext(prompt, { maxTotalChars: 3500 });
      if (bounded.formattedContext) {
        relevantContextBlock = `\n${bounded.formattedContext}\n`;
      }
    } catch {}

    const fileList = virtualFiles
      .filter(f => f && f.path && !f.path.includes('node_modules') && !f.path.startsWith('.'))
      .slice(0, 100)
      .map(f => f.path);

    const planningPrompt = `You are a Principal Software Architect.
Analyze the user request and available project files to create a structured implementation plan.
The plan must break the work into concrete, ordered steps.

Rules:
1. No code modifications occur during planning.
2. Every step must have a clear objective, affected files, tools likely needed, and expected validation.
3. Return ONLY valid JSON matching this schema:
{
  "title": "Short title of the task (under 60 chars)",
  "summary": "1-2 sentence overview of the implementation strategy",
  "steps": [
    {
      "order": 1,
      "objective": "Clear description of what this step achieves",
      "files": ["relative/path/to/file.ts"],
      "tools": ["read_project_file", "search_project"],
      "validation": "Syntax verification / Unit tests / Typecheck"
    }
  ]
}
${relevantContextBlock}
Available files:
${fileList.length > 0 ? fileList.slice(0, 50).join('\n') : 'No files listed yet'}

User Request:
${prompt}
`;

    try {
      const response = await modelRouter.generateContent({
        model,
        messages: [{ role: 'user', content: planningPrompt }],
        systemInstruction: "You are a software architect planning an implementation. Output ONLY a valid JSON object with title, summary, and steps."
      });

      let rawText = response.text || '';
      // Strip markdown code fences if wrapped
      rawText = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch (jsonErr) {
        // Fallback simple structured parsing if model emitted text
        parsed = {
          title: prompt.slice(0, 50),
          summary: 'Multi-step implementation plan generated from request.',
          steps: [
            {
              order: 1,
              objective: `Analyze files and plan changes for: ${prompt.slice(0, 60)}`,
              files: fileList.slice(0, 3),
              tools: ['read_project_file', 'search_project'],
              validation: 'Inspection'
            },
            {
              order: 2,
              objective: `Generate code proposal for: ${prompt.slice(0, 60)}`,
              files: fileList.slice(0, 3),
              tools: ['propose_changes'],
              validation: 'Syntax check & proposal review'
            }
          ]
        };
      }

      const planId = `plan-${Date.now()}-${uuidv4().slice(0, 8)}`;
      const steps: PlanStep[] = (Array.isArray(parsed.steps) ? parsed.steps : []).map((s: any, idx: number) => ({
        id: `step-${idx + 1}-${uuidv4().slice(0, 6)}`,
        order: idx + 1,
        objective: String(s.objective || `Step ${idx + 1}`),
        files: Array.isArray(s.files) ? s.files.map((f: any) => String(f).trim()).filter(Boolean) : [],
        tools: Array.isArray(s.tools) ? s.tools.map((t: any) => String(t).trim()).filter(Boolean) : ['search_project', 'read_project_file', 'propose_changes'],
        validation: String(s.validation || 'Manual code inspection and syntax validation'),
        status: 'pending' as PlanStepStatus
      }));

      if (steps.length === 0) {
        steps.push({
          id: `step-1-${uuidv4().slice(0, 6)}`,
          order: 1,
          objective: prompt,
          files: fileList.slice(0, 2),
          tools: ['search_project', 'read_project_file', 'propose_changes'],
          validation: 'Syntax verification',
          status: 'pending'
        });
      }

      const newPlan: Plan = {
        id: planId,
        conversationId,
        projectId,
        title: parsed.title || 'Implementation Plan',
        summary: parsed.summary || 'Step-by-step development plan.',
        steps,
        status: 'awaiting_approval',
        createdAt: Date.now(),
        currentStepIndex: 0
      };

      await savePlanDurable(newPlan, ownerId);
      return { plan: newPlan };
    } catch (error: any) {
      console.error('[PlanService] Error generating plan:', error);
      return { error: error.message || 'Failed to generate implementation plan.' };
    }
  }

  /**
   * Approves a plan. Must be called by authenticated user.
   */
  static async approvePlan(planId: string, ownerId: string): Promise<{ plan?: Plan; error?: string }> {
    const plan = await getPlanDurable(planId, ownerId);
    if (!plan) {
      return { error: 'Plan not found or access denied.' };
    }

    if (plan.status !== 'awaiting_approval' && plan.status !== 'draft') {
      return { error: `Cannot approve plan with status "${plan.status}".` };
    }

    const updated = await updatePlanDurable(planId, ownerId, {
      status: 'approved',
      approvedAt: Date.now()
    });

    return { plan: updated || undefined };
  }

  /**
   * Updates plan content (e.g. user edits steps or title before approving).
   */
  static async updatePlan(planId: string, ownerId: string, updates: Partial<Plan>): Promise<{ plan?: Plan; error?: string }> {
    const plan = await getPlanDurable(planId, ownerId);
    if (!plan) {
      return { error: 'Plan not found or access denied.' };
    }

    if (plan.status === 'executing' || plan.status === 'completed') {
      return { error: 'Cannot modify plan while it is executing or after completion.' };
    }

    const updated = await updatePlanDurable(planId, ownerId, updates);
    return { plan: updated || undefined };
  }

  /**
   * Cancels a plan.
   */
  static async cancelPlan(planId: string, ownerId: string): Promise<{ plan?: Plan; error?: string }> {
    const plan = await getPlanDurable(planId, ownerId);
    if (!plan) {
      return { error: 'Plan not found or access denied.' };
    }

    const updated = await updatePlanDurable(planId, ownerId, {
      status: 'cancelled',
      steps: plan.steps.map(s => s.status === 'executing' ? { ...s, status: 'cancelled' } : s)
    });

    return { plan: updated || undefined };
  }
}
