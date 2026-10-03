const fs = require('fs');

function patchModelsFilteredPage() {
  const p = 'src/features/models/ModelsFilteredPage.tsx';
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/<button\s+onClick=\{\(\) => setSelectedModelId\(model\.id\)\}\s+className="w-full flex items-center justify-center gap-2 py-2\.5 rounded-xl text-sm font-medium transition-colors bg-slate-50 dark:bg-white\/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white\/10 border border-slate-200 dark:border-white\/10"\s*>\s*View details\s*<\/button>/g, 
    `<a href={\`/models/\${providerId === 'openai' ? 'gpt' : providerId === 'google' ? 'gemini' : providerId}/\${model.id}\`} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10">View details</a>`);
  fs.writeFileSync(p, content);
}

function patchModelsPage() {
  const p = 'src/features/models/ModelsPage.tsx';
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/<button\s+onClick=\{\(\) => setSelectedModelId\(model\.id\)\}\s+className="w-full flex items-center justify-center gap-2 py-2\.5 rounded-xl text-sm font-medium transition-colors bg-slate-50 dark:bg-white\/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white\/10 border border-slate-200 dark:border-white\/10"\s*>\s*View details\s*<\/button>/g, 
    `<a href={\`/models/\${model.providerId === 'openai' ? 'gpt' : model.providerId === 'google' ? 'gemini' : model.providerId}/\${model.id}\`} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10">View details</a>`);
  fs.writeFileSync(p, content);
}

patchModelsFilteredPage();
patchModelsPage();
