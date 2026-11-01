import type { FileNode } from '../../types';
import type { Automation } from './automationStore';
import { buildChatContextItems } from './chatContext';

export interface AutomationChatRequestInput {
  automation: Pick<Automation, 'prompt' | 'includeWorkspace'>;
  files: FileNode[];
  projectId: string | null;
  projectName: string | null;
  model: string;
}

/** Build the same bounded, path-filtered context request used by ordinary chat. */
export function buildAutomationChatRequest({
  automation,
  files,
  projectId,
  projectName,
  model,
}: AutomationChatRequestInput) {
  const prompt = automation.prompt.trim();
  const contextItems = automation.includeWorkspace
    ? buildChatContextItems(prompt, files, projectId || 'unsaved-automation-workspace')
    : [];

  return {
    messages: [{ role: 'user' as const, parts: [{ text: prompt }] }],
    model,
    systemInstruction:
      'You are FLOAT, generating a report for a user-created automation. Use only the supplied prompt and context. Do not claim to have edited files, run commands, or completed actions you did not perform. Return a concise, well-structured report in Markdown.',
    contextItems,
    projectName: projectName || 'Project Workspace',
    ...(projectId ? { projectId } : {}),
    stream: false as const,
  };
}
