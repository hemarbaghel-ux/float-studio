import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './components/LanguageProvider';
import './index.css';

// Global resilience handler to gracefully intercept benign cancellation and script errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonStr = typeof reason === 'string' 
      ? reason 
      : (reason?.message || reason?.msg || JSON.stringify(reason || ''));

    const isCancellation = 
      reason?.type === 'cancelation' ||
      reason?.type === 'cancelled' ||
      reason?.name === 'AbortError' ||
      reasonStr.includes('operation is manually canceled') ||
      reasonStr.includes('cancelation') ||
      /cancel/i.test(reasonStr);

    if (isCancellation) {
      // Gracefully prevent unhandled rejection from bubbling to error monitors
      event.preventDefault();
      return;
    }

    if (reasonStr === 'Script error.' || reasonStr.includes('Script error')) {
      event.preventDefault();
      return;
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message || '';
    const error = event.error;
    const errorStr = typeof error === 'string'
      ? error
      : (error?.message || error?.msg || JSON.stringify(error || ''));

    const isCancellation = 
      message === 'Script error.' ||
      message.includes('Script error') ||
      message.includes('operation is manually canceled') ||
      message.includes('cancelation') ||
      error?.type === 'cancelation' ||
      error?.name === 'AbortError' ||
      errorStr.includes('operation is manually canceled');

    if (isCancellation) {
      event.preventDefault();
      return true;
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
