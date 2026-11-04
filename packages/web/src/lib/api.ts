import type { ApiErrorBody } from '@harmony/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const NETWORK_MESSAGE = 'Can’t reach Harmony. Check your connection and try again.';

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers: options.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'network', NETWORK_MESSAGE);
  }

  const text = await response.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // A proxy's error page isn't JSON. It falls through to the general error below.
  }

  if (!response.ok) {
    const body = data as ApiErrorBody | undefined;
    if (response.status === 401) window.dispatchEvent(new Event('harmony:signed-out'));
    throw new ApiError(response.status, body?.error?.code ?? 'error', body?.error?.message ?? 'Something went wrong. Try again in a moment.', body?.error?.fields);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });

export const fieldError = (error: unknown, name: string) => (error instanceof ApiError ? error.fields?.[name] : undefined);

/** The message for anything that isn't already shown beside a form field. */
export function generalError(error: unknown, fieldNames: string[] = []): string | undefined {
  if (!error) return undefined;
  if (error instanceof ApiError) {
    if (error.fields && Object.keys(error.fields).some((key) => fieldNames.includes(key))) return undefined;
    return error.message;
  }
  return 'Something went wrong. Try again in a moment.';
}
