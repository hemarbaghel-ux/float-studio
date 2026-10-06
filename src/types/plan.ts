export type PlanStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PlanStepStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface PlanStep {
  id: string;
  order: number;
  objective: string;
  files: string[];
  tools: string[];
  validation: string;
  status: PlanStepStatus;
  result?: string;
  error?: string;
  proposalId?: string;
  agentId?: string;
}

export interface Plan {
  id: string;
  conversationId: string;
  projectId: string;
  taskId?: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  status: PlanStatus;
  createdAt: number;
  approvedAt?: number;
  completedAt?: number;
  currentStepIndex?: number;
  error?: string;
}
