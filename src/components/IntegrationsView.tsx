import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Bot, Check, Eye, EyeOff, Loader2, Lock, RefreshCw, Download, ExternalLink } from 'lucide-react';
import { useStore } from '../lib/store';
import { githubImport, githubRepos, githubUser, slackNotify, testGemini, testOpenAI, type GhRepo, type GhUser } from '../lib/integrations';
import { GeminiIcon, GithubIcon, SlackIcon } from './ui';

function Card({ icon, title, desc, connected, children }: { icon: ReactNode; title: string; desc: string; connected: boolean; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-bg">{icon}</div>
        <div className="flex-1">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <p className="text-[12.5px] text-sub">{desc}</p>
        </div>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            connected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-faint',
          )}
        >
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>
      {children}
    </section>
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex-1">
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pr-9 font-mono" autoComplete="off" spellCheck={false} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg" aria-label={show ? 'Hide' : 'Show'}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function useAsync() {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<unknown>, okMsg = 'Connected') => {
    setState('busy');
    setMsg('');
    try {
      await fn();
      setState('ok');
      setMsg(okMsg);
    } catch (e) {
      setState('err');
      setMsg((e as Error).message);
    }
  };
  return { state, msg, run };
}

function Status({ s }: { s: ReturnType<typeof useAsync> }) {
  if (s.state === 'idle') return null;
  return (
    <p className={clsx('mt-2 text-[12px]', s.state === 'err' ? 'text-red-500' : s.state === 'ok' ? 'text-emerald-600' : 'text-faint')}>
      {s.state === 'busy' ? 'Checking…' : s.msg}
    </p>
  );
}

export function IntegrationsView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
        <p className="mb-6 mt-1 text-[13px] text-sub">Connect model providers and tools. Keys are stored only in this browser's local storage.</p>
        <div className="flex flex-col gap-4">
          <GeminiCard />
          <OpenAICard />
          <GitHubCard />
          <SlackCard />
        </div>
      </div>
    </div>
  );
}

function GeminiCard() {
  const key = useStore((s) => s.settings.geminiKey);
  const update = useStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(key);
  const st = useAsync();
  return (
    <Card icon={<GeminiIcon size={18} />} title="Google Gemini" desc="Powers Auto routing with Gemini 2.5 Pro, Flash and Flash-Lite, including streaming thoughts and tool calls." connected={!!key}>
      <div className="flex gap-2">
        <SecretInput value={draft} onChange={setDraft} placeholder="AIza…" />
        <button
          className="btn-primary"
          disabled={!draft || st.state === 'busy'}
          onClick={() =>
            st.run(async () => {
              await testGemini(draft.trim());
              update({ geminiKey: draft.trim() });
            }, 'Key verified and saved')
          }
        >
          {st.state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
        {key && (
          <button className="btn-ghost" onClick={() => (update({ geminiKey: '' }), setDraft(''))}>
            Disconnect
          </button>
        )}
      </div>
      <Status s={st} />
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12px] text-sub hover:text-fg">
        Get a key from Google AI Studio <ExternalLink size={11} />
      </a>
    </Card>
  );
}

function OpenAICard() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const [key, setKey] = useState(settings.openaiKey);
  const [base, setBase] = useState(settings.openaiBaseUrl);
  const [model, setModel] = useState(settings.openaiModel);
  const st = useAsync();
  return (
    <Card icon={<Bot size={18} className="text-sub" />} title="OpenAI-compatible" desc="OpenAI, OpenRouter, Groq, Together, local servers — any /chat/completions API with tool calling." connected={!!settings.openaiKey}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-sub">
          Base URL
          <input className="input mt-1 font-mono" value={base} onChange={(e) => setBase(e.target.value)} />
        </label>
        <label className="text-[12px] text-sub">
          Model
          <input className="input mt-1 font-mono" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4.1-mini" />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <SecretInput value={key} onChange={setKey} placeholder="sk-…" />
        <button
          className="btn-primary"
          disabled={!key || st.state === 'busy'}
          onClick={() =>
            st.run(async () => {
              await testOpenAI(key.trim(), base.trim());
              update({ openaiKey: key.trim(), openaiBaseUrl: base.trim(), openaiModel: model.trim() });
            }, 'Provider verified and saved')
          }
        >
          {st.state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
        {settings.openaiKey && (
          <button className="btn-ghost" onClick={() => (update({ openaiKey: '' }), setKey(''))}>
            Disconnect
          </button>
        )}
      </div>
      <Status s={st} />
    </Card>
  );
}

function GitHubCard() {
  const token = useStore((s) => s.settings.githubToken);
  const gh = useStore((s) => s.codebase.github);
  const update = useStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(token);
  const [user, setUser] = useState<GhUser | null>(null);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const st = useAsync();

  const connect = (t: string) =>
    st.run(async () => {
      const u = await githubUser(t);
      setUser(u);
      setRepos(await githubRepos(t));
      update({ githubToken: t });
    }, 'GitHub connected');

  const doImport = async (r: GhRepo) => {
    const s = useStore.getState();
    if (!confirm(`Replace the current workspace with ${r.full_name}?`)) return;
    setImporting(r.full_name);
    try {
      const files = await githubImport(token, r.owner.login, r.name, r.default_branch, (d, t) => setProgress(`${d}/${t}`));
      const now = Date.now();
      const first = Object.keys(files).find((p) => /^readme/i.test(p)) ?? Object.keys(files)[0] ?? null;
      s.replaceCodebase({
        name: r.name,
        files: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, { content: c, updatedAt: now }])),
        openTabs: first ? [first] : [],
        activePath: first,
        github: { owner: r.owner.login, repo: r.name, branch: r.default_branch },
      });
      s.toast(`Imported ${Object.keys(files).length} files from ${r.full_name}`, 'success');
      s.setView('codebase');
    } catch (e) {
      s.toast((e as Error).message, 'error');
    } finally {
      setImporting(null);
      setProgress('');
    }
  };

  const shown = repos.filter((r) => r.full_name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card icon={<GithubIcon size={18} />} title="GitHub" desc="Import repositories into the Codebase and commit agent changes back with one click." connected={!!token}>
      <div className="flex gap-2">
        <SecretInput value={draft} onChange={setDraft} placeholder="Fine-grained personal access token (contents: read & write)" />
        <button className="btn-primary" disabled={!draft || st.state === 'busy'} onClick={() => connect(draft.trim())}>
          {st.state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : token ? <RefreshCw size={14} /> : <Check size={14} />}
          {token ? 'Refresh' : 'Connect'}
        </button>
        {token && (
          <button className="btn-ghost" onClick={() => (update({ githubToken: '' }), setDraft(''), setUser(null), setRepos([]))}>
            Disconnect
          </button>
        )}
      </div>
      <Status s={st} />
      {gh && (
        <p className="mt-2 text-[12px] text-sub">
          Workspace linked to{' '}
          <span className="font-mono">
            {gh.owner}/{gh.repo}@{gh.branch}
          </span>{' '}
          — commit from the Codebase sidebar.
        </p>
      )}
      {token && !user && repos.length === 0 && (
        <button className="btn-outline mt-3 text-[12px]" onClick={() => connect(token)}>
          Load repositories
        </button>
      )}
      {user && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-[12.5px]">
            <img src={user.avatar_url} alt="" className="h-5 w-5 rounded-full" />
            <span className="font-medium">{user.name ?? user.login}</span>
            <span className="text-faint">· {repos.length} repositories</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="input ml-auto w-48 py-1" />
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line">
            {shown.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    {r.full_name} {r.private && <Lock size={11} className="text-faint" />}
                  </div>
                  <div className="truncate text-[11.5px] text-faint">
                    {r.language ?? '—'} · {r.default_branch} {r.description ? `· ${r.description}` : ''}
                  </div>
                </div>
                <button className="btn-outline px-2 py-1 text-[12px]" disabled={!!importing} onClick={() => void doImport(r)}>
                  {importing === r.full_name ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> {progress}
                    </>
                  ) : (
                    <>
                      <Download size={12} /> Import
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function SlackCard() {
  const hook = useStore((s) => s.settings.slackWebhook);
  const update = useStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(hook);
  const st = useAsync();
  return (
    <Card icon={<SlackIcon size={18} />} title="Slack" desc="Post automation results to a channel via an incoming webhook." connected={!!hook}>
      <div className="flex gap-2">
        <SecretInput value={draft} onChange={setDraft} placeholder="https://hooks.slack.com/services/…" />
        <button
          className="btn-primary"
          disabled={!/^https:\/\/hooks\.slack\.com\//.test(draft.trim()) || st.state === 'busy'}
          onClick={() =>
            st.run(async () => {
              update({ slackWebhook: draft.trim() });
              await slackNotify(draft.trim(), 'FLOAT is connected to this channel ✅');
            }, 'Saved — a test message was sent')
          }
        >
          <Check size={14} /> Save & test
        </button>
        {hook && (
          <button className="btn-ghost" onClick={() => (update({ slackWebhook: '' }), setDraft(''))}>
            Disconnect
          </button>
        )}
      </div>
      <Status s={st} />
    </Card>
  );
}
