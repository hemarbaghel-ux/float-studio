import { nanoid } from 'nanoid';
import { getState } from '../store';
import { normalizePath } from '../files';
import { runShell } from '../sandbox';

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  /** Whether the tool mutates the codebase (disabled in Ask mode) */
  mutates?: boolean;
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'list_files',
    description: 'List every file path in the workspace, optionally filtered by a directory prefix.',
    parameters: { type: 'object', properties: { dir: { type: 'string', description: 'Optional directory prefix, e.g. "src"' } }, required: [] },
  },
  {
    name: 'read_file',
    description: 'Read a file. Returns content with 1-based line numbers.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Workspace-relative path' } }, required: ['path'] },
  },
  {
    name: 'search_files',
    description: 'Search all files for a regex or plain string. Returns path:line:text matches.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Regex or text to search for' } }, required: ['query'] },
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing one with the complete content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
    mutates: true,
  },
  {
    name: 'edit_file',
    description:
      'Make a precise edit by replacing an exact, unique snippet (old_string) with new_string. Read the file first. Prefer this over write_file for small changes.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path' },
        old_string: { type: 'string', description: 'Exact existing text to replace (must be unique in the file)' },
        new_string: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    mutates: true,
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the workspace.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Workspace-relative path' } }, required: ['path'] },
    mutates: true,
  },
  {
    name: 'run_command',
    description:
      'Run a shell command in the Float cloud sandbox (requires an active cloud session). Supports ls, cat, grep, node <file>, npm test (Jest-compatible runner), and && chaining.',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'Command to run' } }, required: ['command'] },
    mutates: true,
  },
];

export interface ToolContext {
  chatId: string;
  messageId: string;
}

export interface ToolResult {
  output: string;
  ok: boolean;
  changeId?: string;
}

function recordChange(ctx: ToolContext, path: string, before: string | null, after: string | null) {
  const id = nanoid(8);
  getState().addChange(ctx.chatId, { id, path, before, after, status: 'pending', messageId: ctx.messageId, at: Date.now() });
  return id;
}

export async function executeTool(name: string, rawArgs: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const s = getState();
  const files = s.codebase.files;
  const args = rawArgs as Record<string, string>;
  const path = args.path ? normalizePath(String(args.path)) : '';

  switch (name) {
    case 'list_files': {
      const dir = args.dir ? normalizePath(args.dir) : '';
      const list = Object.keys(files)
        .filter((p) => !dir || p === dir || p.startsWith(dir + '/'))
        .sort();
      return { ok: true, output: list.length ? list.join('\n') : '(no files)' };
    }
    case 'read_file': {
      const f = files[path];
      if (!f) return { ok: false, output: `Error: file not found: ${path}` };
      const numbered = f.content
        .split('\n')
        .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
        .join('\n');
      return { ok: true, output: numbered.length > 60_000 ? numbered.slice(0, 60_000) + '\n…(truncated)' : numbered };
    }
    case 'search_files': {
      const q = String(args.query ?? '');
      let re: RegExp;
      try {
        re = new RegExp(q, 'i');
      } catch {
        re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      const hits: string[] = [];
      for (const [p, f] of Object.entries(files)) {
        f.content.split('\n').forEach((l, i) => {
          if (re.test(l)) hits.push(`${p}:${i + 1}: ${l.trim().slice(0, 200)}`);
        });
      }
      return { ok: true, output: hits.length ? hits.slice(0, 100).join('\n') : 'No matches.' };
    }
    case 'write_file': {
      if (!path) return { ok: false, output: 'Error: path is required' };
      const before = files[path]?.content ?? null;
      const content = String(args.content ?? '');
      s.writeFile(path, content);
      s.openFile(path);
      const changeId = recordChange(ctx, path, before, content);
      return { ok: true, changeId, output: `${before == null ? 'Created' : 'Updated'} ${path} (${content.split('\n').length} lines)` };
    }
    case 'edit_file': {
      const f = files[path];
      if (!f) return { ok: false, output: `Error: file not found: ${path}. Use write_file to create it.` };
      const oldS = String(args.old_string ?? '');
      const newS = String(args.new_string ?? '');
      const count = oldS ? f.content.split(oldS).length - 1 : 0;
      if (count === 0) return { ok: false, output: `Error: old_string not found in ${path}. Re-read the file and copy the exact text.` };
      if (count > 1) return { ok: false, output: `Error: old_string matches ${count} places in ${path}; include more surrounding context.` };
      const next = f.content.replace(oldS, () => newS);
      s.writeFile(path, next);
      s.openFile(path);
      const changeId = recordChange(ctx, path, f.content, next);
      return { ok: true, changeId, output: `Edited ${path}` };
    }
    case 'delete_file': {
      const f = files[path];
      if (!f) return { ok: false, output: `Error: file not found: ${path}` };
      s.deleteFile(path);
      const changeId = recordChange(ctx, path, f.content, null);
      return { ok: true, changeId, output: `Deleted ${path}` };
    }
    case 'run_command': {
      if (!getState().cloud.active)
        return {
          ok: false,
          output: 'Error: Cloud Agents require an active session. Ask the user to start a cloud session (banner above the composer) to run commands.',
        };
      const cmd = String(args.command ?? '');
      if (!getState().settings.autoRunCommands && !window.confirm(`FLOAT wants to run:\n\n${cmd}\n\nAllow?`))
        return { ok: false, output: 'User declined to run this command.' };
      const r = await runShell(cmd, {
        files: () => Object.fromEntries(Object.entries(getState().codebase.files).map(([p, f]) => [p, f.content])),
        write: (p, c) => {
          const before = getState().codebase.files[p]?.content ?? null;
          getState().writeFile(p, c);
          recordChange(ctx, p, before, c);
        },
        remove: (p) => {
          const before = getState().codebase.files[p]?.content;
          if (before == null) return;
          getState().deleteFile(p);
          recordChange(ctx, p, before, null);
        },
      });
      return { ok: r.code === 0, output: `$ ${cmd}\n${r.output}\n[exit code ${r.code}]` };
    }
    default:
      return { ok: false, output: `Error: unknown tool ${name}` };
  }
}
