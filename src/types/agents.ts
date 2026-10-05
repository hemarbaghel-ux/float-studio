export type AgentLifecycleState = 'QUEUED' | 'PLANNING' | 'INSPECTING' | 'WAITING_FOR_TOOL' | 'EXECUTING' | 'WAITING_FOR_APPROVAL' | 'VALIDATING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'PAUSED' | 'CANCELLED';

export interface AgentTask {
  id: string;
  name: string;
  description: string;
  assignedAgentId: string;
  modelId: string;
  status: AgentLifecycleState;
  progress: number; // 0-100
  createdAt: number;
  updatedAt: number;
  dependencies?: string[]; // Task IDs
  parentTaskId?: string;
  projectId?: string;
  ownerId?: string;
  result?: any;
  github?: {
    repository?: string;
    branch?: string;
    baseBranch?: string;
    baseSha?: string;
    commitSha?: string;
    commitUrl?: string;
    publishedAt?: number;
    pullRequest?: { number?: number; title?: string; state?: string; url?: string; draft?: boolean; merged?: boolean; mergeable?: boolean | null; reviewState?: string; headSha?: string; base?: string; head?: string } | null;
  };
  error?: string;
  requestedChecks?: Array<'test' | 'lint' | 'typecheck' | 'build'>;
  lastEvent?: { id: string; type: string; message: string; timestamp: number };
  context: {
    files?: Array<{ path: string; content: string; name?: string; type?: string }>;
    objectives?: string[];
    workspaceSnapshotId?: string;
    sourceProjectUpdatedAt?: number;
    sourceProjectName?: string;
  };
}

export interface AgentEvent {
  id: string;
  taskId: string;
  agentId: string;
  type: 'task_started' | 'agent_started' | 'agent_progress' | 'tool_requested' | 'approval_required' | 'tool_started' | 'tool_completed' | 'agent_completed' | 'validation_started' | 'validation_completed' | 'task_completed' | 'task_failed' | 'conflict_detected';
  message: string;
  timestamp: number;
  payload?: any;
}

export interface AgentApproval {
  id: string;
  taskId: string;
  agentId: string;
  type: 'terminal_command' | 'file_delete' | 'config_change' | 'install_dependency';
  description: string;
  status: 'pending' | 'approved' | 'denied';
  payload: any;
  createdAt: number;
}
