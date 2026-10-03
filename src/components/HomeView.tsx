import { ArrowRight } from 'lucide-react';
import { useStore } from '../lib/store';
import { Composer, sendPrompt } from './Composer';
import { FloatMark } from './ui';

const SUGGESTIONS = ['Build a responsive dashboard in React', 'Explain Python asyncio event loop', 'Debug authentication race condition'];

export function HomeView() {
  const setModal = useStore((s) => s.setModal);
  return (
    <div className="relative flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[712px] flex-1 flex-col px-5 pt-[12vh]">
        <Composer autoFocus />
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void sendPrompt(s)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-fg/85 transition-colors hover:border-fg/20 hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center px-5 pb-6 pt-10">
        <button
          onClick={() => setModal('desktop')}
          className="group flex w-full max-w-[420px] items-center gap-3.5 rounded-2xl border border-line bg-surface px-5 py-3.5 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0b0d12] text-white">
            <FloatMark />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold">Download the Desktop App</span>
            <span className="block text-[12px] text-sub">Open your code and keep building locally with full speed.</span>
          </span>
          <ArrowRight size={16} className="text-faint transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
