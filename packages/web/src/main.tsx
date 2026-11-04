import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/bricolage-grotesque';
import './styles/index.css';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { EDITIONS, type Edition } from '@harmony/shared';
import { App } from './App';
import { Logo } from './art/Illustrations';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { ConfirmProvider } from './ui/Modal';
import { ToastProvider } from './ui/Toast';

// Start in the theme of the last workspace, so the first paint doesn't flash another colour.
try {
  const saved = localStorage.getItem('harmony:edition') as Edition | null;
  if (saved && EDITIONS.includes(saved)) document.documentElement.dataset.edition = saved;
} catch {
  // Storage can be blocked. The default theme is fine.
}

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
  mutationCache: new MutationCache(),
});

const root = createRoot(document.getElementById('root')!);

function BootScreen({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center" role="status">
      <div className="max-w-sm">
        <span className="inline-block animate-pulse">
          <Logo size={56} />
        </span>
        <p className="mt-5 text-[17px] font-semibold tracking-tight">{title}</p>
        {text && <p className="mt-1.5 text-[14px] text-ink-muted">{text}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

function renderApp() {
  root.render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

async function boot() {
  // Written out in full (not via STATIC_DEMO) so the server build can drop the demo backend entirely.
  if (import.meta.env.VITE_STATIC_DEMO !== 'true') {
    renderApp();
    return;
  }
  root.render(<BootScreen title="Opening the Harmony demo" text="Everything runs inside your browser. The first visit takes a few seconds." />);
  try {
    const { startDemoBackend } = await import('./demo/backend');
    const started = await startDemoBackend((text) => root.render(<BootScreen title="Opening the Harmony demo" text={text} />));
    if (!started.ok) {
      root.render(
        <BootScreen
          title="The demo is open in another tab"
          text="It keeps its data in one tab at a time. Switch to that tab, or close it and try again here."
          action={
            <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-full bg-brand-600 px-6 font-semibold text-white shadow-glow">
              Try again
            </button>
          }
        />,
      );
      return;
    }
    renderApp();
  } catch (error) {
    console.error(error);
    root.render(
      <BootScreen
        title="The demo couldn’t start"
        text="This browser may not support what it needs (WebAssembly and IndexedDB). Try a recent Chrome, Edge, Firefox or Safari."
        action={
          <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-full bg-brand-600 px-6 font-semibold text-white shadow-glow">
            Try again
          </button>
        }
      />,
    );
  }
}

void boot();
