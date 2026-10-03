import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  Cloud,
  Cpu,
  Loader2,
  Apple,
  Monitor,
  Terminal as TerminalIcon,
  Download,
  MonitorDown,
  Search,
  SquarePlus,
  FolderCode,
  Workflow,
  Plug,
  Sun,
  Moon,
  Settings,
  MessageSquare,
  FileCode2,
  Sparkles,
  Keyboard,
  PanelLeft,
  Upload,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { PLAN_LIMITS } from '../lib/models';
import { downloadBlob } from '../lib/files';
import { MOD } from '../hooks/useShortcuts';
import type { Plan } from '../lib/types';
import { FloatMark, Modal, Toggle } from './ui';

export function Modals() {
  const modal = useStore((s) => s.modal);
  const close = () => useStore.getState().setModal(null);
  return (
    <>
      <UpgradeModal open={modal === 'upgrade'} onClose={close} />
      <DesktopModal open={modal === 'desktop'} onClose={close} />
      <SessionModal open={modal === 'session'} onClose={close} />
      <SettingsModal open={modal === 'settings'} onClose={close} />
      <ShortcutsModal open={modal === 'shortcuts'} onClose={close} />
      {modal === 'palette' && <CommandPalette onClose={close} />}
    </>
  );
}

// ------------------------------------------------------------------ Upgrade
const PLANS: { id: Plan; name: string; monthly: number; features: string[] }[] = [
  { id: 'free', name: 'Free', monthly: 0, features: ['50 agent requests / month', 'Auto + Flash models', '2 vCPU cloud sessions', 'Unlimited Demo agent'] },
  { id: 'pro', name: 'Pro', monthly: 20, features: ['500 agent requests / month', 'Gemini 2.5 Pro & Max mode', '4 vCPU cloud sessions', 'Automations + Slack', 'Priority routing'] },
  { id: 'ultra', name: 'Ultra', monthly: 200, features: ['5,000 agent requests / month', 'Everything in Pro', '8 vCPU cloud sessions', 'Early access features'] },
];

function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useStore((s) => s.user.plan);
  const { setPlan, toast } = useStore.getState();
  const [yearly, setYearly] = useState(false);
  const [checkout, setCheckout] = useState<Plan | null>(null);
  const [card, setCard] = useState({ number: '', exp: '', cvc: '' });
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!open) {
      setCheckout(null);
      setCard({ number: '', exp: '', cvc: '' });
    }
  }, [open]);

  const price = (m: number) => (yearly ? Math.round(m * 0.8) : m);
  const validCard = card.number.replace(/\s/g, '').length >= 15 && /^\d\d\/\d\d$/.test(card.exp) && card.cvc.length >= 3;

  const pay = async () => {
    if (!checkout) return;
    setPaying(true);
    // Replace with your Stripe Checkout / Payment Element integration.
    await new Promise((r) => setTimeout(r, 1200));
    setPaying(false);
    setPlan(checkout);
    toast(`Welcome to FLOAT ${PLAN_LIMITS[checkout].label}`, 'success');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={checkout ? `Upgrade to ${PLAN_LIMITS[checkout].label}` : 'Plans'} width="max-w-3xl">
      {!checkout ? (
        <div className="p-5">
          <div className="mb-5 flex items-center justify-center gap-2 text-[13px]">
            <span className={clsx(!yearly && 'font-medium')}>Monthly</span>
            <Toggle checked={yearly} onChange={setYearly} label="Yearly billing" />
            <span className={clsx(yearly && 'font-medium')}>
              Yearly <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-600">−20%</span>
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.id} className={clsx('flex flex-col rounded-2xl border p-5', p.id === 'pro' ? 'border-fg shadow-lg' : 'border-line')}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.id === 'pro' && <span className="rounded-full bg-fg px-2 py-0.5 text-[10px] font-semibold text-bg">Popular</span>}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">${price(p.monthly)}</span>
                  <span className="text-[12px] text-faint">/ month</span>
                </div>
                <ul className="mt-4 flex-1 space-y-2 text-[13px]">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={plan === p.id}
                  onClick={() => (p.id === 'free' ? (setPlan('free'), toast('Switched to Free'), onClose()) : setCheckout(p.id))}
                  className={clsx('mt-5 w-full', p.id === 'pro' ? 'btn-primary' : 'btn-outline')}
                >
                  {plan === p.id ? 'Current plan' : p.id === 'free' ? 'Downgrade' : `Upgrade to ${p.name}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <div>
            <div className="text-[13px] text-sub">FLOAT {PLAN_LIMITS[checkout].label}</div>
            <div className="mt-1 text-3xl font-semibold">
              ${price(PLANS.find((p) => p.id === checkout)!.monthly) * (yearly ? 12 : 1)}
              <span className="text-[13px] font-normal text-faint"> / {yearly ? 'year' : 'month'}</span>
            </div>
            <ul className="mt-4 space-y-2 text-[13px]">
              {PLANS.find((p) => p.id === checkout)!.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={14} className="mt-0.5 text-emerald-600" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (validCard) void pay();
            }}
          >
            <label className="text-[12px] text-sub">
              Card number
              <input
                className="input mt-1 font-mono"
                inputMode="numeric"
                placeholder="4242 4242 4242 4242"
                value={card.number}
                onChange={(e) =>
                  setCard({
                    ...card,
                    number: e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 16)
                      .replace(/(\d{4})(?=\d)/g, '$1 '),
                  })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] text-sub">
                Expiry
                <input
                  className="input mt-1 font-mono"
                  placeholder="MM/YY"
                  value={card.exp}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCard({ ...card, exp: d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d });
                  }}
                />
              </label>
              <label className="text-[12px] text-sub">
                CVC
                <input className="input mt-1 font-mono" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
              </label>
            </div>
            <button type="submit" className="btn-primary mt-2 py-2" disabled={!validCard || paying}>
              {paying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {paying ? 'Processing…' : 'Subscribe'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCheckout(null)}>
              Back to plans
            </button>
            <p className="text-center text-[11px] text-faint">Test mode — no real charge. Wire this form to Stripe for production.</p>
          </form>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Desktop app
/** Point these at your release artifacts (e.g. GitHub Releases). */
export const DESKTOP_DOWNLOADS = {
  macArm: 'https://github.com/float-studio/float-desktop/releases/latest/download/FLOAT-arm64.dmg',
  macIntel: 'https://github.com/float-studio/float-desktop/releases/latest/download/FLOAT-x64.dmg',
  windows: 'https://github.com/float-studio/float-desktop/releases/latest/download/FLOAT-Setup.exe',
  linux: 'https://github.com/float-studio/float-desktop/releases/latest/download/FLOAT.AppImage',
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferredInstall: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e as BeforeInstallPromptEvent;
});

function detectOS() {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return 'mac';
  if (/Win/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}

function DesktopModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const os = detectOS();
  const toast = useStore((s) => s.toast);
  const installed = matchMedia('(display-mode: standalone)').matches;
  const options = [
    { id: 'mac', label: 'macOS', sub: 'Apple Silicon', icon: Apple, href: DESKTOP_DOWNLOADS.macArm },
    { id: 'mac-intel', label: 'macOS', sub: 'Intel', icon: Apple, href: DESKTOP_DOWNLOADS.macIntel },
    { id: 'windows', label: 'Windows', sub: '10 / 11 · x64', icon: Monitor, href: DESKTOP_DOWNLOADS.windows },
    { id: 'linux', label: 'Linux', sub: 'AppImage', icon: TerminalIcon, href: DESKTOP_DOWNLOADS.linux },
  ];
  const primary = options.find((o) => o.id === os) ?? options[0];

  const installPwa = async () => {
    if (installed) return toast('FLOAT is already installed on this device');
    if (!deferredInstall) return toast('Use your browser menu → “Install FLOAT” (Chrome / Edge) to install as an app');
    await deferredInstall.prompt();
    const r = await deferredInstall.userChoice;
    deferredInstall = null;
    if (r.outcome === 'accepted') toast('FLOAT installed', 'success');
  };

  return (
    <Modal open={open} onClose={onClose} title="Download FLOAT Desktop" width="max-w-xl">
      <div className="p-5">
        <div className="mb-5 flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0b0d12] text-white">
            <FloatMark size={30} />
          </span>
          <div>
            <div className="font-semibold">FLOAT for {primary.label}</div>
            <p className="text-[13px] text-sub">Open local folders, run real terminals, and keep building at native speed.</p>
          </div>
        </div>
        <a href={primary.href} className="btn-primary w-full py-2.5" onClick={() => toast(`Downloading FLOAT for ${primary.label}…`)}>
          <Download size={15} /> Download for {primary.label} {primary.sub && `(${primary.sub})`}
        </a>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {options
            .filter((o) => o.id !== primary.id)
            .map((o) => (
              <a key={o.id} href={o.href} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13px] hover:bg-muted">
                <o.icon size={15} className="text-sub" />
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-[11px] text-faint">{o.sub}</span>
                </span>
              </a>
            ))}
          <button onClick={() => void installPwa()} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left text-[13px] hover:bg-muted">
            <MonitorDown size={15} className="text-sub" />
            <span>
              <span className="block font-medium">Install web app</span>
              <span className="block text-[11px] text-faint">{installed ? 'Installed' : 'Any OS · instant'}</span>
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Cloud session
const REGIONS = [
  { id: 'ap-south-1', label: 'Mumbai', flag: 'IN' },
  { id: 'ap-southeast-1', label: 'Singapore', flag: 'SG' },
  { id: 'eu-west-1', label: 'Ireland', flag: 'EU' },
  { id: 'us-east-1', label: 'Virginia', flag: 'US' },
];
const MACHINES: { id: string; label: string; plan: Plan }[] = [
  { id: '2 vCPU · 4 GB', label: 'Standard', plan: 'free' },
  { id: '4 vCPU · 8 GB', label: 'Performance', plan: 'pro' },
  { id: '8 vCPU · 16 GB', label: 'Turbo', plan: 'ultra' },
];
const RANK: Record<Plan, number> = { free: 0, pro: 1, ultra: 2 };

function SessionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useStore((s) => s.user.plan);
  const { startSession, toast, setModal } = useStore.getState();
  const [region, setRegion] = useState('ap-south-1');
  const [machine, setMachine] = useState(MACHINES[0].id);
  const [boot, setBoot] = useState(-1);
  const steps = ['Provisioning sandbox', 'Mounting workspace', 'Starting runtime', 'Ready'];

  useEffect(() => {
    if (!open) setBoot(-1);
  }, [open]);

  const start = async () => {
    for (let i = 0; i < steps.length; i++) {
      setBoot(i);
      await new Promise((r) => setTimeout(r, 450 + Math.random() * 300));
    }
    startSession(region, machine);
    toast('Cloud session started', 'success');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Start a cloud session" width="max-w-md">
      <div className="p-5">
        <p className="mb-4 text-[13px] text-sub">Cloud Agents run commands, tests and scripts in an isolated sandbox with your workspace mounted.</p>
        <div className="mb-1.5 text-[12px] font-medium text-sub">Region</div>
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px]', region === r.id ? 'border-fg bg-muted' : 'border-line hover:bg-muted/60')}
            >
              <span className="rounded bg-bg px-1 font-mono text-[10px] text-sub">{r.flag}</span>
              <span>
                <span className="block font-medium">{r.label}</span>
                <span className="block font-mono text-[10px] text-faint">{r.id}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mb-1.5 text-[12px] font-medium text-sub">Machine</div>
        <div className="mb-5 flex flex-col gap-1.5">
          {MACHINES.map((m) => {
            const locked = RANK[m.plan] > RANK[plan];
            return (
              <button
                key={m.id}
                onClick={() => (locked ? setModal('upgrade') : setMachine(m.id))}
                className={clsx('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px]', machine === m.id ? 'border-fg bg-muted' : 'border-line hover:bg-muted/60')}
              >
                <Cpu size={14} className="text-sub" />
                <span className="flex-1 font-medium">{m.label}</span>
                <span className="font-mono text-[11px] text-faint">{m.id}</span>
                {locked && <span className="rounded bg-fg px-1.5 text-[10px] font-semibold uppercase text-bg">{m.plan}</span>}
              </button>
            );
          })}
        </div>
        {boot >= 0 ? (
          <div className="space-y-1.5 rounded-xl border border-line p-3">
            {steps.map((s, i) => (
              <div key={s} className={clsx('flex items-center gap-2 text-[13px]', i > boot && 'text-faint')}>
                {i < boot ? <Check size={13} className="text-emerald-600" /> : i === boot ? <Loader2 size={13} className="animate-spin" /> : <span className="h-[13px] w-[13px]" />}
                {s}
              </div>
            ))}
          </div>
        ) : (
          <button className="btn-primary w-full py-2" onClick={() => void start()}>
            <Cloud size={15} /> Start session
          </button>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Settings
function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useStore((s) => s.user);
  const settings = useStore((s) => s.settings);
  const { updateUser, updateSettings, toast } = useStore.getState();

  const exportData = () => {
    const raw = localStorage.getItem('float-store') ?? '{}';
    downloadBlob(new Blob([raw], { type: 'application/json' }), `float-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };
  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        JSON.parse(text);
        localStorage.setItem('float-store', text);
        location.reload();
      } catch {
        toast('Invalid backup file', 'error');
      }
    };
    input.click();
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-lg">
      <div className="flex flex-col gap-5 p-5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-sub">Display name</span>
          <input className="input" value={user.name} onChange={(e) => updateUser({ name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-sub">Rules for AI</span>
          <textarea
            className="input min-h-[110px] resize-y font-mono text-[12px]"
            value={settings.customInstructions}
            onChange={(e) => updateSettings({ customInstructions: e.target.value })}
            placeholder={'e.g.\n- Use TypeScript and functional React components\n- Prefer Tailwind for styling\n- Always add tests for new utilities'}
          />
          <span className="mt-1 block text-[11px] text-faint">Included in every agent request, like .cursorrules.</span>
        </label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[13px] font-medium">Auto-run terminal commands</div>
            <div className="text-[12px] text-faint">Let the agent run commands in an active cloud session without asking</div>
          </div>
          <Toggle checked={settings.autoRunCommands} onChange={(v) => updateSettings({ autoRunCommands: v })} label="Auto-run commands" />
        </div>
        <div className="flex gap-2 border-t border-line pt-4">
          <button className="btn-outline" onClick={exportData}>
            <Download size={14} /> Export data
          </button>
          <button className="btn-outline" onClick={importData}>
            <Upload size={14} /> Import data
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Shortcuts
function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    [`${MOD} K`, 'Command palette'],
    [`${MOD} I`, 'New chat'],
    [`${MOD} L`, 'Focus composer / add selection to chat (editor)'],
    [`${MOD} K (in editor)`, 'Inline AI edit of selection'],
    [`${MOD} B`, 'Toggle sidebar'],
    [`${MOD} ⇧ E`, 'Open codebase'],
    [`${MOD} ,`, 'Settings'],
    ['Enter / ⇧ Enter', 'Send / new line'],
    ['@', 'Mention a file'],
    ['/', 'Slash commands'],
    ['Esc', 'Close dialogs'],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-md">
      <div className="p-3">
        {rows.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between rounded-lg px-2 py-2 text-[13px] hover:bg-muted/60">
            <span>{d}</span>
            <span className="kbd">{k}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Command palette
interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const chats = useStore((s) => s.chats);
  const files = useStore((s) => s.codebase.files);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const cmds = useMemo<Cmd[]>(() => {
    const s = useStore.getState();
    const base: Cmd[] = [
      { id: 'new', label: 'New chat', hint: `${MOD} I`, icon: SquarePlus, run: () => s.newChat() },
      { id: 'cb', label: 'Open codebase', hint: `${MOD} ⇧ E`, icon: FolderCode, run: () => s.setView('codebase') },
      { id: 'auto', label: 'Automations', icon: Workflow, run: () => s.setView('automations') },
      { id: 'int', label: 'Integrations', icon: Plug, run: () => s.setView('integrations') },
      { id: 'sess', label: s.cloud.active ? 'End cloud session' : 'Start cloud session', icon: Cloud, run: () => (s.cloud.active ? s.stopSession() : s.setModal('session')) },
      { id: 'light', label: 'Theme: Light', icon: Sun, run: () => s.setTheme('light') },
      { id: 'dark', label: 'Theme: Dark', icon: Moon, run: () => s.setTheme('dark') },
      { id: 'side', label: 'Toggle sidebar', hint: `${MOD} B`, icon: PanelLeft, run: () => s.toggleSidebar() },
      { id: 'set', label: 'Settings', hint: `${MOD} ,`, icon: Settings, run: () => s.setModal('settings') },
      { id: 'keys', label: 'Keyboard shortcuts', icon: Keyboard, run: () => s.setModal('shortcuts') },
      { id: 'up', label: 'Upgrade to Pro', icon: Sparkles, run: () => s.setModal('upgrade') },
      { id: 'dl', label: 'Download desktop app', icon: Download, run: () => s.setModal('desktop') },
    ];
    const chatCmds: Cmd[] = chats.map((c) => ({ id: 'c' + c.id, label: c.title, hint: 'Chat', icon: MessageSquare, run: () => s.openChat(c.id) }));
    const fileCmds: Cmd[] = Object.keys(files).map((p) => ({
      id: 'f' + p,
      label: p,
      hint: 'File',
      icon: FileCode2,
      run: () => {
        s.openFile(p);
        s.setView('codebase');
      },
    }));
    return [...base, ...chatCmds, ...fileCmds];
  }, [chats, files]);

  const shown = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return cmds.slice(0, 14);
    return cmds
      .map((c) => ({ c, i: c.label.toLowerCase().indexOf(t) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)
      .slice(0, 30)
      .map((x) => x.c);
  }, [q, cmds]);

  const exec = (c: Cmd) => {
    onClose();
    c.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[14vh] animate-fade-in" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => (setQ(e.target.value), setSel(0))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(shown.length - 1, s + 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              if (e.key === 'Enter' && shown[sel]) exec(shown[sel]);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search commands, chats and files…"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          <span className="kbd">esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {shown.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-faint">No results</p>}
          {shown.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => exec(c)}
              className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px]', i === sel && 'bg-muted')}
            >
              <c.icon size={15} className="shrink-0 text-sub" />
              <span className="flex-1 truncate">{c.label}</span>
              {c.hint && <span className="text-[11px] text-faint">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
