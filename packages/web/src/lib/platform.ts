import type { RealtimeEvent } from '@harmony/shared';
import { api, ApiError } from './api';

/** True in the GitHub Pages build, where the API runs inside this browser tab instead of on a server. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';

/** A link someone can open on another device, such as the fridge board or an invite. */
export function appLink(path: string): string {
  if (STATIC_DEMO) return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/#${path}`;
  return `${window.location.origin}${path}`;
}

/** Downloads an export through the same request path as everything else, so it works with or without a server. */
export async function downloadFile(apiPath: string, filename: string) {
  const response = await fetch(`/api${apiPath}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(response.status, 'download_failed', body?.error?.message ?? 'The download didn’t work. Try again.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface LiveHub {
  subscribe(path: string, listener: (data: unknown) => void): () => void;
}

declare global {
  interface Window {
    __harmonyLive?: LiveHub;
  }
}

/** Listens for changes: a server stream normally, or the in-tab event bus in the demo. */
export function subscribeLive(path: string, handlers: { onChange: (event: RealtimeEvent) => void; onStatus: (live: boolean) => void }): () => void {
  if (STATIC_DEMO) {
    const hub = window.__harmonyLive;
    if (!hub) return () => undefined;
    handlers.onStatus(true);
    const stop = hub.subscribe(`/api${path}`, (data) => handlers.onChange(data as RealtimeEvent));
    return () => {
      stop();
      handlers.onStatus(false);
    };
  }
  if (typeof EventSource === 'undefined') return () => undefined;
  const source = new EventSource(`/api${path}`);
  source.addEventListener('ready', () => handlers.onStatus(true));
  source.onerror = () => handlers.onStatus(false);
  source.addEventListener('change', (message) => handlers.onChange(JSON.parse((message as MessageEvent<string>).data) as RealtimeEvent));
  return () => {
    source.close();
    handlers.onStatus(false);
  };
}

export { api };
