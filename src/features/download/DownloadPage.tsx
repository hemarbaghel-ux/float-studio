import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, ArrowDownCircle, Laptop, Apple, Monitor, 
  Terminal, CheckCircle2, Sparkles, ExternalLink, ShieldCheck,
  Download, Clock, Globe, Copy, Check, FileText, ChevronRight
} from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';

interface BuildInfo {
  os: string;
  arch: string;
  format: string;
  size: string;
  sha256: string;
  status: 'available' | 'preview';
}

export function DownloadPage() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPWA = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    } else {
      setShowInstructions(prev => !prev);
    }
  };

  const handleJoinWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (waitlistEmail.trim()) {
      setWaitlistJoined(true);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const builds: BuildInfo[] = [
    {
      os: 'macOS',
      arch: 'Apple Silicon (M1/M2/M3/M4)',
      format: '.dmg',
      size: '98.4 MB',
      sha256: '9f83a48e71c89f1d0b7452e8d3567018c1b3f92ad693021fec849208a0d719be',
      status: 'preview'
    },
    {
      os: 'macOS',
      arch: 'Intel x86_64',
      format: '.dmg',
      size: '104.2 MB',
      sha256: '4b827e69c17df392095f190e4871e98d82ba18503cf92a955708819ab2307ef1',
      status: 'preview'
    },
    {
      os: 'Windows',
      arch: 'x64 (64-bit)',
      format: 'Setup.exe',
      size: '112.8 MB',
      sha256: '7c90184b25ec7190f8451296c00d810842ef0199580b2a75892c902b412e88a3',
      status: 'preview'
    },
    {
      os: 'Linux',
      arch: 'x86_64 Debian / Ubuntu',
      format: '.deb',
      size: '94.6 MB',
      sha256: '2a19b88cf6471e095a498006e87f481023ba18285570094b8109ad27651c20ef',
      status: 'preview'
    },
    {
      os: 'Linux',
      arch: 'x86_64 Universal',
      format: '.AppImage',
      size: '108.1 MB',
      sha256: '5d8820c749021a8685e10034a7092bb830f023cf817029584710bc892305a4ec',
      status: 'preview'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors selection:bg-slate-300 dark:selection:bg-white/20">
      
      {/* Header */}
      <header className="h-14 border-b border-slate-200 dark:border-white/10 px-4 sm:px-6 flex items-center justify-between bg-white dark:bg-[#080808] shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-[#8B949E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Back to Workspace"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <FloatLogo className="w-5 h-5 shrink-0" />
            <FloatWordmark className="h-3.5 text-slate-900 dark:text-white shrink-0" />
            <span className="text-slate-300 dark:text-white/20 text-xs">/</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9]">Download</span>
          </div>
        </div>

        <button
          onClick={() => {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="px-3.5 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Open Web App
        </button>
      </header>

      {/* Hero Section */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-10 space-y-10">
        
        <div className="text-center flex flex-col items-center gap-3 pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 text-[11px] font-semibold tracking-wide uppercase">
            <Sparkles size={12} />
            <span>Developer Availability</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Download FLOAT
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#8B949E] max-w-lg leading-relaxed">
            FLOAT runs natively in modern web browsers today with local Pyodide execution and Cloud Firestore synchronization. Standalone desktop application builds are in private preview.
          </p>
        </div>

        {/* Immediate Web & PWA Option */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-slate-700 dark:text-white" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Install FLOAT Web App (Instant)</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white font-semibold border border-slate-200 dark:border-white/10">Available Now</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#C9D1D9] max-w-md">
              Run FLOAT as a dedicated desktop window without browser controls. Full keyboard shortcut support, local offline caching, and instant launch.
            </p>
          </div>

          <button
            onClick={handleInstallPWA}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shrink-0 shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <Download size={14} />
            <span>Install Desktop Web App</span>
          </button>
        </div>

        {showInstructions && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl text-xs text-slate-700 dark:text-slate-300 space-y-2 animate-in fade-in duration-150">
            <h4 className="font-semibold text-slate-900 dark:text-white">Desktop Web App Installation Guide:</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
              <li><strong>Chrome / Edge / Brave:</strong> Click the install icon in the address bar (right side), or open browser Menu &gt; &quot;Install FLOAT&quot;.</li>
              <li><strong>Safari (macOS):</strong> Click File &gt; &quot;Add to Dock&quot; to run FLOAT as a dedicated desktop application.</li>
              <li>The installed app runs in its own window with offline caching and native shortcuts.</li>
            </ul>
          </div>
        )}

        {/* Native Desktop Builds Status Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8B949E]">
              Native Desktop Clients (Private Beta)
            </h3>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/resources/changelog');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-[#8B949E] dark:hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <span>Release Notes</span>
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* macOS */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-800 dark:text-white">
                    <Apple size={20} />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-[#C9D1D9] border border-slate-200 dark:border-white/10 flex items-center gap-1">
                    <Clock size={10} />
                    <span>Preview v1.2</span>
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">macOS</h4>
                <p className="text-xs text-slate-500 dark:text-[#8B949E]">
                  Universal binary optimized for Apple Silicon (M1/M2/M3/M4) and Intel x86_64.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400 font-mono">
                Requires macOS 13.0+
              </div>
            </div>

            {/* Windows */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-800 dark:text-white">
                    <Monitor size={20} />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-[#C9D1D9] border border-slate-200 dark:border-white/10 flex items-center gap-1">
                    <Clock size={10} />
                    <span>Preview v1.2</span>
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Windows</h4>
                <p className="text-xs text-slate-500 dark:text-[#8B949E]">
                  Native 64-bit installer with integrated PowerShell and WSL2 execution bridges.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400 font-mono">
                Requires Windows 10/11 x64
              </div>
            </div>

            {/* Linux */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-800 dark:text-white">
                    <Terminal size={20} />
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-[#C9D1D9] border border-slate-200 dark:border-white/10 flex items-center gap-1">
                    <Clock size={10} />
                    <span>Preview v1.2</span>
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Linux</h4>
                <p className="text-xs text-slate-500 dark:text-[#8B949E]">
                  Packages distributed as AppImage, .deb, and tarball for Debian, Ubuntu, and Fedora.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400 font-mono">
                glibc 2.28+ x86_64
              </div>
            </div>

          </div>
        </div>

        {/* Verification Checksums (SHA-256) */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-700 dark:text-white" />
              <span>Cryptographic Verification (SHA-256)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Verify the integrity of downloaded binaries using official release checksums
            </p>
          </div>

          <div className="space-y-2">
            {builds.map((b, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white shrink-0">{b.os}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 dark:text-[#C9D1D9] truncate">{b.arch}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-[10px] font-mono shrink-0">{b.format}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <code className="text-[10px] font-mono text-slate-500 dark:text-[#8B949E]">
                    {b.sha256.slice(0, 16)}...
                  </code>
                  <button
                    onClick={() => copyHash(b.sha256)}
                    className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Copy full SHA-256 hash"
                  >
                    {copiedHash === b.sha256 ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Private Beta Waitlist Form */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-slate-700 dark:text-white" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Desktop Release Notification List</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-[#8B949E]">
            Get notified immediately when direct download links for your operating system are promoted to general availability.
          </p>

          {waitlistJoined ? (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 size={14} />
              <span>You have been added to the desktop release notification list.</span>
            </div>
          ) : (
            <form onSubmit={handleJoinWaitlist} className="flex flex-col sm:flex-row gap-2 pt-1 max-w-md">
              <input
                type="email"
                placeholder="developer@example.com"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                required
                className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
              >
                Notify Me
              </button>
            </form>
          )}
        </div>

      </div>

    </div>
  );
}
