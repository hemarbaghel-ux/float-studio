import { apiFetch } from './api';

export interface ProjectExecutionFile { path: string; content?: string }
export interface ProjectExecutionResult {
  status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  exitCode: number | null;
  durationMs: number;
  changedFiles?: ProjectExecutionFile[];
  deletedFiles?: string[];
}

export async function executeProjectCommand(options: {
  projectId: string;
  command: string;
  files: ProjectExecutionFile[];
  signal?: AbortSignal;
  onOutput: (stream: 'stdout' | 'stderr', text: string) => void;
}): Promise<ProjectExecutionResult> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(options.projectId)}/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ command: options.command, files: options.files }),
    signal: options.signal
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Project command request failed (${response.status}).`);
  }
  if (!response.body) throw new Error('The server did not provide a process output stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ProjectExecutionResult | null = null;
  const processEvent = (raw: string) => {
    const data = raw.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim();
    if (!data) return;
    const event = JSON.parse(data);
    if (event.type === 'output') options.onOutput(event.stream, event.text);
    else if (event.type === 'error') throw new Error(event.message || 'Project command failed to start.');
    else if (event.type === 'completed') result = event;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      processEvent(buffer.slice(0, boundary).replace(/\r/g, ''));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) processEvent(buffer.replace(/\r/g, ''));
  if (!result) {
    if (options.signal?.aborted) return { status: 'cancelled', exitCode: null, durationMs: 0 };
    throw new Error('Project command stream ended without an exit status.');
  }
  return result;
}
