import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { z } from 'zod';
import { canManage, FEATURES, isOwner, todayIn, type EditionFeatures } from '@harmony/shared';
import type { DB } from './db/types';
import { activity, members, sessions, users, workspaces, type MemberRow, type UserRow, type WorkspaceRow } from './db/schema';
import { badRequest, forbidden, notFound, unauthorized, validationError } from './errors';
import type { Env, GoogleClient, Mailer } from './ports';
import type { Bus } from './realtime';
import { hashToken, newToken, type RateLimiter } from './security';

/** How the session token travels. Browsers get an HttpOnly cookie; the in-browser demo passes a header instead. */
export interface SessionTransport {
  read(c: Context): string | undefined;
  write(c: Context, token: string, maxAgeSeconds: number): void;
  clear(c: Context): void;
}

export interface AppDeps {
  db: DB;
  env: Env;
  mail: Mailer;
  bus: Bus;
  limiter: RateLimiter;
  google: GoogleClient | null;
  now: () => Date;
  ping: () => Promise<void>;
  session?: SessionTransport;
  /** The visitor's network address, used for rate limits. */
  remoteAddress?: (c: Context) => string | undefined;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    user: UserRow;
    sessionId: string;
    workspace: WorkspaceRow;
    member: MemberRow;
    today: string;
  };
}

export type Ctx = Context<AppEnv>;

export const SESSION_COOKIE = 'harmony_session';
const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('Send a valid JSON body.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed IDs read as "not found" rather than reaching the database as an error. */
export function idParam(c: Context, name = 'id'): string {
  const value = c.req.param(name);
  if (!value || !UUID.test(value)) throw notFound();
  return value;
}

export function clientIp(c: Context, deps: AppDeps): string {
  if (deps.env.trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return deps.remoteAddress?.(c) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function cookieSession(env: Env): SessionTransport {
  return {
    read: (c) => getCookie(c, SESSION_COOKIE),
    write: (c, token, maxAgeSeconds) =>
      setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: env.secureCookies, path: '/', maxAge: maxAgeSeconds }),
    clear: (c) => deleteCookie(c, SESSION_COOKIE, { path: '/' }),
  };
}

export const SESSION_HEADER = 'x-harmony-session';

/** For the in-browser demo, where script-made responses can't carry cookies. An empty value means signed out. */
export const headerSession: SessionTransport = {
  read: (c) => c.req.header(SESSION_HEADER) || undefined,
  write: (c, token) => c.header(SESSION_HEADER, token),
  clear: (c) => c.header(SESSION_HEADER, ''),
};

const transport = (deps: AppDeps) => deps.session ?? cookieSession(deps.env);

export async function startSession(deps: AppDeps, c: Context, userId: string) {
  const token = newToken();
  const expiresAt = new Date(deps.now().getTime() + SESSION_DAYS * DAY_MS);
  await deps.db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: c.req.header('user-agent')?.slice(0, 300) });
  transport(deps).write(c, token, SESSION_DAYS * 86_400);
}

export async function endSession(deps: AppDeps, c: Context) {
  const token = transport(deps).read(c);
  if (token) await deps.db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  transport(deps).clear(c);
}

export async function loadSession(deps: AppDeps, c: Ctx): Promise<UserRow | null> {
  const token = transport(deps).read(c);
  if (!token) return null;
  const id = hashToken(token);
  const now = deps.now();
  const [row] = await deps.db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;

  // Keep active people signed in; only touch the row once a fortnight to spare the database.
  if (row.expiresAt.getTime() - now.getTime() < (SESSION_DAYS - 14) * DAY_MS) {
    await deps.db.update(sessions).set({ expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) }).where(eq(sessions.id, id));
    transport(deps).write(c, token, SESSION_DAYS * 86_400);
  }
  c.set('user', row.user);
  c.set('sessionId', id);
  return row.user;
}

export function requireUser(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!(await loadSession(deps, c))) throw unauthorized();
    await next();
  };
}

/** Every workspace route passes through here. Outsiders get "not found", so they can't even confirm it exists. */
export function workspaceAccess(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const workspaceId = idParam(c, 'wid');
    const user = c.get('user');
    const [row] = await deps.db
      .select({ workspace: workspaces, member: members })
      .from(members)
      .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
      .where(and(eq(members.workspaceId, workspaceId), eq(members.userId, user.id), isNull(members.archivedAt)))
      .limit(1);
    if (!row) throw notFound('That workspace');
    c.set('workspace', row.workspace);
    c.set('member', row.member);
    c.set('today', todayIn(row.workspace.timezone, deps.now()));
    await next();
  };
}

export function needManager(c: Ctx) {
  if (!canManage(c.get('member').role)) throw forbidden();
}

export function needOwner(c: Ctx) {
  if (!isOwner(c.get('member').role)) throw forbidden('Only the owner can do this.');
}

export function needFeature(c: Ctx, feature: keyof EditionFeatures) {
  if (!FEATURES[c.get('workspace').edition][feature]) throw notFound();
}

interface ChangeNote {
  scopes: string[];
  summary?: string;
  objectType?: string;
  objectId?: string | null;
}

/** Records a change in the activity feed and tells every open screen to refresh those areas. */
export async function announce(deps: AppDeps, workspaceId: string, actor: { id: string; name: string } | null, note: ChangeNote) {
  if (note.summary) {
    await deps.db.insert(activity).values({
      workspaceId,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      summary: note.summary,
      objectType: note.objectType ?? 'other',
      objectId: note.objectId ?? null,
    });
  }
  deps.bus.publish(workspaceId, {
    scopes: note.summary ? [...note.scopes, 'activity', 'dashboard'] : [...note.scopes, 'dashboard'],
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    summary: note.summary ?? null,
    at: deps.now().toISOString(),
  });
}

export const announceFrom = (deps: AppDeps, c: Ctx, note: ChangeNote) => announce(deps, c.get('workspace').id, c.get('member'), note);
