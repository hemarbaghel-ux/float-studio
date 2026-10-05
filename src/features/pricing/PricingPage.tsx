import { ArrowLeft, Bot, Code2, CreditCard, ShieldCheck } from 'lucide-react';
import { FloatLogo } from '../../components/FloatLogo';

const capabilities = [
  {
    icon: Code2,
    title: 'Browser coding workspace',
    detail: 'Open a workspace, edit files, review proposed changes, and use the browser worker tools.',
  },
  {
    icon: Bot,
    title: 'AI model access',
    detail: 'Chat and agent responses depend on the model providers configured for this deployment.',
  },
  {
    icon: ShieldCheck,
    title: 'Your account and projects',
    detail: 'Sign in to use account features. Project persistence and integrations depend on the configured Firebase and OAuth services.',
  },
];

export function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#000] dark:text-[#E6EDF3]">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#080808]">
        <a href="/" aria-label="Back to FLOAT" className="flex items-center gap-2">
          <ArrowLeft size={15} className="text-slate-500" />
          <FloatLogo className="h-5 w-5" />
          <span className="text-sm font-semibold">FLOAT</span>
        </a>
        <a href="/" className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-black">
          Open FLOAT
        </a>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111]">
            <CreditCard size={20} />
          </div>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-[#8B949E]">Plans and availability</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">FLOAT is in preview</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-[#A1A1AA]">
            Paid subscriptions, billing, and team entitlements are not enabled in this release. We’ll publish plan details here when checkout and the features behind each plan are ready.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, detail }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#0A0A0A]">
              <Icon size={18} className="text-slate-500 dark:text-[#A1A1AA]" />
              <h2 className="mt-4 text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-[#8B949E]">{detail}</p>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-slate-500 dark:text-[#8B949E]">
          Model availability and usage costs are set by the deployment operator and configured providers. FLOAT does not collect subscription payments in this preview.
        </p>
      </section>
    </main>
  );
}
