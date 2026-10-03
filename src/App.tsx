import { useEffect } from 'react';
import { applyTheme, useStore } from './lib/store';
import { useShortcuts } from './hooks/useShortcuts';
import { useAutomationScheduler } from './hooks/useAutomationScheduler';
import { Sidebar } from './components/Sidebar';
import { HomeView } from './components/HomeView';
import { ChatView } from './components/ChatView';
import { CodebaseView } from './components/CodebaseView';
import { AutomationsView } from './components/AutomationsView';
import { IntegrationsView } from './components/IntegrationsView';
import { Modals } from './components/Modals';
import { Toasts } from './components/ui';

export default function App() {
  const view = useStore((s) => s.view);
  const activeChatId = useStore((s) => s.activeChatId);
  const chatExists = useStore((s) => s.chats.some((c) => c.id === s.activeChatId));
  const theme = useStore((s) => s.theme);
  useShortcuts();
  useAutomationScheduler();

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  // Clear stale running flags from a previous page load
  useEffect(() => {
    useStore.setState({ runningChats: [] });
  }, []);

  const content =
    view === 'chat' && activeChatId && chatExists ? (
      <ChatView />
    ) : view === 'codebase' ? (
      <CodebaseView />
    ) : view === 'automations' ? (
      <AutomationsView />
    ) : view === 'integrations' ? (
      <IntegrationsView />
    ) : (
      <HomeView />
    );

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 border-t border-line/60 bg-bg">{content}</main>
      <Modals />
      <Toasts />
    </div>
  );
}
