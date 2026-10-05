import { useEffect, useState } from 'react';
import { ArchiveRestore, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useIDEStore } from '../store';
import { useAutomations } from '../features/float/automationStore';
import { inspectLegacyCache, migrateLegacyCache, type LegacyCacheInventory } from '../services/legacyCacheMigration';

export function LegacyCacheRecovery() {
  const user = useAuthStore((state) => state.user);
  const [inventory, setInventory] = useState<LegacyCacheInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setError(null);
    if (!user || typeof localStorage === 'undefined') {
      setInventory(null);
      return;
    }
    try {
      setInventory(inspectLegacyCache(localStorage, user.uid));
    } catch {
      setInventory(null);
    }
  }, [user?.uid]);

  if (!user || !inventory) return null;

  const handleImport = () => {
    setWorking(true);
    setError(null);
    try {
      migrateLegacyCache(localStorage, user.uid);
      useAutomations.setState((state) => ({
        automations: state.automations.map((automation) =>
          automation.ownerId ? automation : { ...automation, ownerId: user.uid },
        ),
      }));
      useIDEStore.getState().switchAccount(user.uid);
      setInventory(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import the older browser data.');
    } finally {
      setWorking(false);
    }
  };

  const counts = [
    inventory.project ? 'workspace files' : '',
    inventory.transcripts.length ? `${inventory.transcripts.length} chat transcripts` : '',
    inventory.conversations.length ? `${inventory.conversations.length} saved conversations` : '',
    inventory.conversationLists.length ? `${inventory.conversationLists.length} conversation lists` : '',
    inventory.unownedAutomations ? `${inventory.unownedAutomations} automations` : '',
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" role="presentation">
      <section
        aria-labelledby="legacy-cache-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#121212] dark:text-white"
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-300"><ArchiveRestore size={18} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold" id="legacy-cache-title">Older browser data found</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-[#A0A0A0]">
              This browser has data saved before FLOAT separated local work by account. Import it into {user.displayName || user.email || 'your account'} only if it is yours.
            </p>
          </div>
          <button aria-label="Not now" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" onClick={() => setInventory(null)}>
            <X size={16} />
          </button>
        </div>

        <ul className="my-4 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-[#C9D1D9]">
          {counts.map((count) => <li key={count}>{count}</li>)}
        </ul>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-[#8B949E]">
          Existing account data will not be overwritten. Original workspace, transcript, and conversation cache entries are kept; the old automation data is backed up. Once claimed, another account in this browser cannot import the same legacy data.
        </p>
        {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-[#C9D1D9] dark:hover:bg-white/5" disabled={working} onClick={() => setInventory(null)}>
            Not now
          </button>
          <button className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black" disabled={working} onClick={handleImport}>
            {working ? 'Importing…' : 'Import into my account'}
          </button>
        </div>
      </section>
    </div>
  );
}
