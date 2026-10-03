import { isImportable } from './files';

const GH = 'https://api.github.com';

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(GH + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub ${res.status}: ${(body as { message?: string }).message ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface GhUser {
  login: string;
  avatar_url: string;
  name: string | null;
}
export interface GhRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
  language: string | null;
}

export const githubUser = (token: string) => gh<GhUser>(token, '/user');

export const githubRepos = (token: string) =>
  gh<GhRepo[]>(token, '/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member');

export async function githubImport(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const tree = await gh<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated: boolean }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const blobs = tree.tree.filter((t) => t.type === 'blob' && isImportable(t.path, t.size ?? 0)).slice(0, 250);
  const out: Record<string, string> = {};
  let done = 0;
  const queue = [...blobs];
  const worker = async () => {
    while (queue.length) {
      const b = queue.shift()!;
      const blob = await gh<{ content: string; encoding: string }>(token, `/repos/${owner}/${repo}/git/blobs/${b.sha}`);
      const bin = atob(blob.content.replace(/\n/g, ''));
      out[b.path] = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      onProgress?.(++done, blobs.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

/** Commit the full workspace snapshot to a branch using the Git Data API (blobs → tree → commit → ref). */
export async function githubCommit(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: Record<string, string>,
  message: string,
) {
  const ref = await gh<{ object: { sha: string } }>(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = await gh<{ tree: { sha: string } }>(token, `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  const remote = await gh<{ tree: { path: string; type: string }[] }>(token, `/repos/${owner}/${repo}/git/trees/${parent.tree.sha}?recursive=1`);
  const entries = Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content }));
  // delete files that exist remotely (and were importable) but not locally
  const deletions = remote.tree
    .filter((t) => t.type === 'blob' && isImportable(t.path, 0) && !(t.path in files))
    .map((t) => ({ path: t.path, mode: '100644', type: 'blob', sha: null }));
  const tree = await gh<{ sha: string }>(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: [...entries, ...deletions] }),
  });
  const commit = await gh<{ sha: string; html_url: string }>(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit;
}

export async function slackNotify(webhook: string, text: string) {
  // Slack incoming webhooks don't send CORS headers; a form-encoded no-cors POST is accepted.
  await fetch(webhook, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'payload=' + encodeURIComponent(JSON.stringify({ text })),
  });
}

export async function testGemini(key: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  return true;
}

export async function testOpenAI(key: string, baseUrl: string) {
  const res = await fetch(baseUrl.replace(/\/$/, '') + '/models', { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Provider ${res.status}`);
  return true;
}
