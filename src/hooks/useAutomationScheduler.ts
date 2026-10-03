import { useEffect, useRef } from 'react';
import { getState, useStore } from '../lib/store';
import { isDue, runAutomation } from '../lib/automations';

/** Background scheduler: checks interval/daily automations every 10s and on-change triggers. */
export function useAutomationScheduler() {
  useEffect(() => {
    const tick = () => {
      for (const a of getState().automations) if (isDue(a)) void runAutomation(a.id);
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

  const filesRef = useRef(useStore.getState().codebase.files);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s) => {
      if (s.codebase.files === filesRef.current) return;
      filesRef.current = s.codebase.files;
      if (s.runningChats.length) return; // ignore edits made by agents
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const a of getState().automations)
          if (a.enabled && a.schedule.type === 'on-change' && !getState().runningChats.length) void runAutomation(a.id);
      }, 4000);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);
}
