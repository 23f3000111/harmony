import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { Bus, configureKdf, createApp, ensureDemo, headerSession, nobleKdf, RateLimiter, schema, SESSION_HEADER, workspaces, type DB, type Env } from '@harmony/server/browser';

/**
 * The GitHub Pages demo has no server, so the real API runs here instead: the same Hono app,
 * on Postgres compiled to WebAssembly, saved in this browser's IndexedDB.
 * Requests the app makes to /api never leave the tab.
 */

const migrations = import.meta.glob('../../../server/drizzle/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const TOKEN_KEY = 'harmony:demo-session';
const DATABASE = 'idb://harmony-demo';

export type DemoStart = { ok: true; persistent: boolean } | { ok: false; reason: 'other-tab' };

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return memoryToken;
  }
}
let memoryToken: string | null = null;
function writeToken(token: string) {
  memoryToken = token || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the session lasts until the tab closes.
  }
}

/** One tab owns the database at a time, so two tabs can't overwrite each other's saved data. */
function claimTab(): Promise<boolean> {
  const locks = navigator.locks;
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void locks.request('harmony-demo-database', { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(() => undefined);
    });
  });
}

async function openClient(): Promise<{ client: PGlite; persistent: boolean }> {
  try {
    const client = new PGlite(DATABASE, { relaxedDurability: true });
    await client.waitReady;
    return { client, persistent: true };
  } catch {
    // Private windows can block IndexedDB. The demo still runs, it just forgets when the tab closes.
    const client = new PGlite();
    await client.waitReady;
    return { client, persistent: false };
  }
}

async function migrate(client: PGlite) {
  await client.exec('create table if not exists __harmony_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await client.query<{ name: string }>('select name from __harmony_migrations')).rows.map((row) => row.name));
  const ordered = Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b));
  for (const [path, sql] of ordered) {
    const name = path.split('/').pop()!;
    if (done.has(name)) continue;
    await client.transaction(async (tx) => {
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await tx.exec(statement);
      }
      await tx.query('insert into __harmony_migrations (name) values ($1)', [name]);
    });
  }
}

export async function startDemoBackend(onStep: (text: string) => void): Promise<DemoStart> {
  if (!(await claimTab())) return { ok: false, reason: 'other-tab' };

  onStep('Starting the database in your browser…');
  const { client, persistent } = await openClient();
  await migrate(client);
  const db = drizzle(client, { schema }) as unknown as DB;

  // Lower cost than the server: this only protects demo data that never leaves the device.
  configureKdf(nobleKdf({ N: 2 ** 12, r: 8, p: 1 }));

  onStep('Setting up the demo home, office and stores…');
  await ensureDemo(db, new Date());

  const env: Env = {
    nodeEnv: 'development',
    port: 0,
    appUrl: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/#`,
    secureCookies: false,
    dataDir: '',
    demoMode: true,
    google: null,
    mailFrom: 'Harmony demo <demo@harmony.local>',
    trustProxy: false,
  };
  const bus = new Bus();
  const app = createApp({
    db,
    env,
    mail: { enabled: false, send: async () => undefined },
    bus,
    limiter: new RateLimiter(),
    google: null,
    now: () => new Date(),
    ping: async () => void (await client.query('select 1')),
    session: headerSession,
  });

  const network = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const source = input instanceof Request ? input : null;
    const url = new URL(source ? source.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return network(input, init);

    const headers = new Headers(init?.headers ?? source?.headers);
    const token = readToken();
    if (token) headers.set(SESSION_HEADER, token);
    const method = (init?.method ?? source?.method ?? 'GET').toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? undefined : (init?.body ?? (source ? await source.text() : undefined));
    const response = await app.fetch(new Request(`https://harmony.demo${url.pathname}${url.search}`, { method, headers, body }));
    const session = response.headers.get(SESSION_HEADER);
    if (session !== null) writeToken(session);
    return response;
  };

  window.__harmonyLive = {
    subscribe(path, listener) {
      const workspace = path.match(/^\/api\/w\/([^/]+)\/stream$/);
      if (workspace) return bus.subscribe(workspace[1]!, listener);
      const board = path.match(/^\/api\/board\/([^/]+)\/stream$/);
      if (!board) return () => undefined;
      let stop = () => undefined as void;
      let cancelled = false;
      void db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.boardToken, board[1]!))
        .limit(1)
        .then(([row]) => {
          if (row && !cancelled) stop = bus.subscribe(row.id, (event) => listener({ scopes: event.scopes, at: event.at }));
        });
      return () => {
        cancelled = true;
        stop();
      };
    },
  };

  return { ok: true, persistent };
}
