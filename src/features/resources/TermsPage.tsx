import React from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { AlertTriangle } from 'lucide-react';

export function TermsPage() {
  React.useEffect(() => { document.title = 'Terms — FLOAT'; }, []);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] text-slate-900 dark:text-[#E6EDF3] flex flex-col">
      <ResourcesHeader currentPath="/terms" />
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-32">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-semibold uppercase tracking-wide mb-5"><AlertTriangle size={16} /> Draft — not final terms</div>
        <h1 className="text-4xl font-bold mb-5">Terms of Service</h1>
        <p className="text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
          FLOAT is currently a preview application. These terms have not been completed or approved for public release. The service owner must provide the contracting entity, applicable jurisdiction, acceptable-use and liability terms, service and data-retention commitments, and a contact for legal notices before accepting public users.
        </p>
        <p className="mt-5 text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
          Do not treat access to this preview as acceptance of final service terms. Review the <a className="text-blue-500 underline" href="/privacy">data-handling draft</a> for current implementation notes.
        </p>
      </main>
      <ResourcesFooter />
    </div>
  );
}
