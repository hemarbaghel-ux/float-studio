import React from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { ArrowRight, History } from 'lucide-react';

export function ChangelogPage() {
  React.useEffect(() => { document.title = 'Release notes — FLOAT'; }, []);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-white flex flex-col">
      <ResourcesHeader currentPath="/resources/changelog" />
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-36 text-center">
        <History size={30} className="mx-auto mb-6 text-slate-400" />
        <h1 className="text-4xl font-semibold mb-4">Release notes</h1>
        <p className="text-slate-600 dark:text-[#A1A1AA] mb-8">Public release notes have not been published yet.</p>
        <a href="/resources/docs" className="inline-flex items-center gap-2 text-[#FF5F56] font-medium">Read the documentation <ArrowRight size={16} /></a>
      </main>
      <ResourcesFooter />
    </div>
  );
}
