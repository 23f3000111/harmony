import { createApp } from '../src/app';
import { nodeKdf } from '../src/kdf-node';
import { configureKdf } from '../src/security';
import type { AppDeps } from '../src/context';
import { openDatabase, type Database } from '../src/db/client';
import type { Env } from '../src/env';
import type { GoogleClient } from '../src/google';
import type { MailMessage, Mailer } from '../src/mail';
import { Bus } from '../src/realtime';
import { RateLimiter } from '../src/security';

configureKdf(nodeKdf);

export const testEnv: Env = {
  nodeEnv: 'test',
  port: 0,
  appUrl: 'http://localhost:3000',
  secureCookies: false,
  dataDir: '',
  demoMode: false,
  google: null,
  mailFrom: 'test@example.com',
  trustProxy: true,
};

export interface Harness {
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  database: Database;
  mails: MailMessage[];
  clock: { now: Date };
  agent(): Agent;
  close(): Promise<void>;
}

export interface Reply<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export class Agent {
  private cookies = new Map<string, string>();

  constructor(private app: ReturnType<typeof createApp>) {}

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await this.app.request(path, {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair!.indexOf('=');
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (!value || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON: CSV exports and empty bodies stay as text.
    }
    return { status: response.status, body: parsed, headers: response.headers };
  }

  get = (path: string, headers?: Record<string, string>) => this.request('GET', path, undefined, headers);
  post = (path: string, body: unknown = {}, headers?: Record<string, string>) => this.request('POST', path, body, headers);
  patch = (path: string, body: unknown = {}) => this.request('PATCH', path, body);
  put = (path: string, body: unknown = {}) => this.request('PUT', path, body);
  delete = (path: string) => this.request('DELETE', path);
  cookie = (name: string) => this.cookies.get(name);
}

export async function createHarness(options: { env?: Partial<Env>; google?: GoogleClient | null; start?: string } = {}): Promise<Harness> {
  const database = await openDatabase({});
  const mails: MailMessage[] = [];
  const mailer: Mailer = { enabled: true, send: async (message) => void mails.push(message) };
  const clock = { now: new Date(options.start ?? '2026-11-04T04:00:00Z') };
  const deps: AppDeps = {
    db: database.db,
    env: { ...testEnv, ...options.env },
    mail: mailer,
    bus: new Bus(),
    limiter: new RateLimiter(() => clock.now.getTime()),
    google: options.google ?? null,
    now: () => clock.now,
    ping: database.ping,
  };
  const app = createApp(deps);
  return { app, deps, database, mails, clock, agent: () => new Agent(app), close: () => database.close() };
}

let counter = 0;

export async function signUp(harness: Harness, name = 'Test Person') {
  counter += 1;
  const agent = harness.agent();
  const email = `person${counter}@example.com`;
  // Each person signs up from their own address, so the suite doesn't trip the sign-up limit.
  const reply = await agent.post('/api/auth/signup', { name, email, password: 'correct horse battery' }, { 'x-forwarded-for': `10.0.${counter >> 8}.${counter & 255}` });
  if (reply.status !== 201) throw new Error(`Sign up failed: ${JSON.stringify(reply.body)}`);
  return { agent, email, user: reply.body.user };
}

export async function workspace(agent: Agent, edition: 'home' | 'people' | 'supply', name = 'Test space', starter = false) {
  const reply = await agent.post('/api/workspaces', { name, edition, starter });
  if (reply.status !== 201) throw new Error(`Workspace failed: ${JSON.stringify(reply.body)}`);
  return reply.body.workspace as { id: string; myMemberId: string; today: string };
}

/** Adds a second login to a workspace with the given role, using a real invite. */
export async function joinAs(harness: Harness, owner: Agent, workspaceId: string, role: 'manager' | 'member', name = 'Teammate') {
  const invite = await owner.post(`/api/w/${workspaceId}/invites`, { role });
  if (invite.status !== 201) throw new Error(`Invite failed: ${JSON.stringify(invite.body)}`);
  const token = (invite.body.url as string).split('/invite/')[1]!;
  const person = await signUp(harness, name);
  const accepted = await person.agent.post(`/api/invites/${token}/accept`);
  if (accepted.status !== 200) throw new Error(`Accept failed: ${JSON.stringify(accepted.body)}`);
  const me = await person.agent.get(`/api/w/${workspaceId}`);
  return { ...person, memberId: me.body.workspace.myMemberId as string };
}
