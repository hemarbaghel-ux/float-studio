import React from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { BookOpen, ArrowRight } from 'lucide-react';

export function BlogPage() {
  React.useEffect(() => { document.title = 'Blog — FLOAT'; }, []);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-white flex flex-col">
      <ResourcesHeader currentPath="/resources/blog" />
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-36 text-center">
        <BookOpen size={30} className="mx-auto mb-6 text-slate-400" />
        <h1 className="text-4xl font-semibold mb-4">FLOAT blog</h1>
        <p className="text-slate-600 dark:text-[#A1A1AA] mb-8">There are no published articles yet. We’ll post updates here when they’re ready.</p>
        <a href="/resources/docs" className="inline-flex items-center gap-2 text-[#FF5F56] font-medium">Read the documentation <ArrowRight size={16} /></a>
      </main>
      <ResourcesFooter />
    </div>
  );
}
