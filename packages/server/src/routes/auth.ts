import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  forgotInput,
  loginInput,
  passwordChangeInput,
  profileInput,
  resetInput,
  signupInput,
  type PublicConfig,
  type UserDTO,
} from '@harmony/shared';
import { clientIp, endSession, loadSession, readBody, requireUser, startSession, type AppDeps, type AppEnv, type Ctx } from '../context';
import { members, passwordResets, sessions, users, workspaces, type UserRow } from '../db/schema';
import { conflict, forbidden, HttpError, notFound } from '../errors';
import type { GoogleIdentity } from '../ports';
import { log } from '../log';
import { hashPassword, hashToken, newToken, verifyAgainstDecoy, verifyPassword } from '../security';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed/demo';

const MINUTE = 60_000;
const RESET_LIFETIME_MS = 60 * MINUTE;

export function userDTO(user: UserRow): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleSub),
    isDemo: user.isDemo,
    lastWorkspaceId: user.lastWorkspaceId,
  };
}

/**
 * Only ever redirect back into this app. Browsers drop tabs and newlines and read backslashes as slashes,
 * so "/\t/evil.com" would become "//evil.com". Anything like that is refused, then the result is
 * parsed the way a browser would and must still land on this app's own address.
 */
export function safeNext(next: string | undefined | null, appUrl: string): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\u0000-\u001f\u007f\s\\]/.test(next)) return null;
  try {
    const base = new URL(appUrl);
    const target = new URL(next, base);
    if (target.origin !== base.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/**
 * Finds or creates the account for a Google identity. If someone earlier signed up with this
 * email but never proved they own it, Google's proof wins: their password and sessions are
 * removed so a squatter can't share the real owner's account.
 */
export async function signInWithGoogle(deps: AppDeps, identity: GoogleIdentity): Promise<UserRow> {
  if (!identity.emailVerified) throw new HttpError(403, 'email_unverified', 'This Google account has no verified email.');
  const now = deps.now();

  const [existingBySub] = await deps.db.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1);
  if (existingBySub) return existingBySub;

  const [existingByEmail] = await deps.db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  if (existingByEmail) {
    const proved = Boolean(existingByEmail.emailVerifiedAt);
    if (!proved) await deps.db.delete(sessions).where(eq(sessions.userId, existingByEmail.id));
    const [updated] = await deps.db
      .update(users)
      .set({
        googleSub: identity.sub,
        avatarUrl: existingByEmail.avatarUrl ?? identity.picture,
        emailVerifiedAt: existingByEmail.emailVerifiedAt ?? now,
        passwordHash: proved ? existingByEmail.passwordHash : null,
        updatedAt: now,
      })
      .where(eq(users.id, existingByEmail.id))
      .returning();
    return updated!;
  }

  const [created] = await deps.db
    .insert(users)
    .values({ email: identity.email, name: identity.name, googleSub: identity.sub, avatarUrl: identity.picture, emailVerifiedAt: now })
    .returning();
  return created!;
}

const GOOGLE_COOKIE_PATH = '/api/auth/google';

export function authRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db, env, limiter } = deps;

  r.get('/config', (c) => {
    const config: PublicConfig = {
      demoMode: env.demoMode,
      googleEnabled: Boolean(deps.google),
      mailEnabled: deps.mail.enabled,
      demoAccounts: env.demoMode ? DEMO_ACCOUNTS : [],
      demoPassword: env.demoMode ? DEMO_PASSWORD : null,
    };
    return c.json(config);
  });

  r.get('/me', async (c) => {
    const user = await loadSession(deps, c as Ctx);
    return c.json({ user: user ? userDTO(user) : null });
  });

  r.post('/signup', async (c) => {
    limiter.hit(`signup:${clientIp(c, deps)}`, 20, 60 * MINUTE);
    const input = await readBody(c, signupInput);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (taken) throw new HttpError(409, 'email_taken', 'That email already has an account. Sign in instead.', { email: 'That email already has an account.' });
    const [user] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) })
      .returning();
    await startSession(deps, c, user!.id);
    return c.json({ user: userDTO(user!) }, 201);
  });

  r.post('/login', async (c) => {
    const ip = clientIp(c, deps);
    limiter.hit(`login-ip:${ip}`, 100, 15 * MINUTE);
    const input = await readBody(c, loginInput);
    limiter.hit(`login:${ip}:${input.email}`, 10, 15 * MINUTE);

    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const valid = user?.passwordHash ? await verifyPassword(input.password, user.passwordHash) : (await verifyAgainstDecoy(input.password), false);
    if (!user || !valid) throw new HttpError(401, 'bad_credentials', 'That email or password is wrong.');

    await startSession(deps, c, user.id);
    return c.json({ user: userDTO(user) });
  });

  r.post('/logout', async (c) => {
    await endSession(deps, c);
    return c.json({ ok: true });
  });

  r.post('/forgot', async (c) => {
    const ip = clientIp(c, deps);
    limiter.hit(`forgot-ip:${ip}`, 20, 60 * MINUTE);
    const input = await readBody(c, forgotInput);
    limiter.hit(`forgot:${input.email}`, 5, 60 * MINUTE);

    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    let devLink: string | undefined;
    if (user && !user.isDemo) {
      const token = newToken();
      await db.insert(passwordResets).values({
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(deps.now().getTime() + RESET_LIFETIME_MS),
      });
      const link = `${env.appUrl}/reset/${token}`;
      await deps.mail
        .send({
          to: user.email,
          subject: 'Reset your Harmony password',
          text: `Open this link within an hour to choose a new password:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
        })
        .catch((error) => log.error('password reset email failed', { error: String(error) }));
      if (!deps.mail.enabled && env.nodeEnv === 'development') devLink = link;
    }
    // The answer is the same whether or not the account exists.
    return c.json({ ok: true, devLink });
  });

  r.post('/reset', async (c) => {
    limiter.hit(`reset:${clientIp(c, deps)}`, 20, 60 * MINUTE);
    const input = await readBody(c, resetInput);
    const tokenHash = hashToken(input.token);
    const now = deps.now();
    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
      .limit(1);
    if (!reset) throw new HttpError(410, 'reset_expired', 'This reset link has expired or was already used. Ask for a new one.');

    await db.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.tokenHash, tokenHash));
    await db.delete(sessions).where(eq(sessions.userId, reset.userId));
    const [user] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, reset.userId))
      .returning();
    await startSession(deps, c, user!.id);
    return c.json({ user: userDTO(user!) });
  });

  // Google sign-in

  r.get('/google', (c) => {
    const next = safeNext(c.req.query('next'), env.appUrl);
    if (!deps.google) {
      if (env.demoMode) return c.redirect(`/auth/google-demo${next ? `?next=${encodeURIComponent(next)}` : ''}`);
      return c.redirect('/login?error=google_unavailable');
    }
    const state = newToken(16);
    const codeVerifier = newToken(32);
    const nonce = newToken(16);
    const options = { httpOnly: true, sameSite: 'Lax', secure: env.secureCookies, path: GOOGLE_COOKIE_PATH, maxAge: 600 } as const;
    setCookie(c, 'g_state', state, options);
    setCookie(c, 'g_verifier', codeVerifier, options);
    setCookie(c, 'g_nonce', nonce, options);
    if (next) setCookie(c, 'g_next', next, options);
    return c.redirect(deps.google.authUrl({ state, codeVerifier, nonce, redirectUri: `${env.appUrl}/api/auth/google/callback` }));
  });

  r.get('/google/callback', async (c) => {
    const state = getCookie(c, 'g_state');
    const codeVerifier = getCookie(c, 'g_verifier');
    const nonce = getCookie(c, 'g_nonce');
    const next = safeNext(getCookie(c, 'g_next'), env.appUrl);
    for (const name of ['g_state', 'g_verifier', 'g_nonce', 'g_next']) deleteCookie(c, name, { path: GOOGLE_COOKIE_PATH });

    const code = c.req.query('code');
    if (c.req.query('error')) return c.redirect('/login?error=google_cancelled');
    if (!deps.google || !code || !state || state !== c.req.query('state') || !codeVerifier || !nonce) {
      return c.redirect('/login?error=google_failed');
    }

    try {
      const identity = await deps.google.exchange({ code, codeVerifier, nonce, redirectUri: `${env.appUrl}/api/auth/google/callback` });
      const user = await signInWithGoogle(deps, identity);
      await startSession(deps, c, user.id);
    } catch (error) {
      log.warn('google sign-in failed', { error: String(error) });
      return c.redirect('/login?error=google_failed');
    }
    return c.redirect(next ?? '/');
  });

  /**
   * Stand-in for Google while no Google credentials are set, so the new-account path can still be tried.
   * It only exists in demo mode, and the page in front of it says plainly that this isn't real Google.
   */
  r.post('/google-demo', async (c) => {
    if (!env.demoMode || deps.google) throw notFound();
    limiter.hit(`google-demo:${clientIp(c, deps)}`, 30, 15 * MINUTE);
    const email = 'google.demo@example.com';
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user =
      existing ??
      (await db.insert(users).values({ email, name: 'Demo Google User', googleSub: 'demo-google', isDemo: true, emailVerifiedAt: deps.now() }).returning())[0]!;
    await startSession(deps, c, user.id);
    return c.json({ user: userDTO(user) });
  });

  // Account settings

  const account = new Hono<AppEnv>();
  account.use('*', requireUser(deps));

  const refuseDemo = (user: UserRow) => {
    if (user.isDemo) throw forbidden('Demo accounts are shared, so their sign-in details stay fixed.');
  };

  account.patch('/me', async (c) => {
    const user = c.get('user');
    refuseDemo(user);
    const input = await readBody(c, profileInput);
    const [updated] = await db.update(users).set({ name: input.name, updatedAt: deps.now() }).where(eq(users.id, user.id)).returning();
    return c.json({ user: userDTO(updated!) });
  });

  account.post('/me/password', async (c) => {
    const user = c.get('user');
    refuseDemo(user);
    limiter.hit(`password:${user.id}`, 10, 15 * MINUTE);
    const input = await readBody(c, passwordChangeInput);
    if (user.passwordHash) {
      if (!input.current || !(await verifyPassword(input.current, user.passwordHash))) {
        throw new HttpError(422, 'bad_password', 'Your current password is wrong.', { current: 'Your current password is wrong.' });
      }
    }
    await db.update(users).set({ passwordHash: await hashPassword(input.next), updatedAt: deps.now() }).where(eq(users.id, user.id));
    // Signs out every other device, which is what people expect after changing a password.
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, c.get('sessionId'))));
    return c.json({ ok: true });
  });

  account.delete('/me', async (c) => {
    const user = c.get('user');
    refuseDemo(user);
    const memberships = await db
      .select({ member: members, workspace: workspaces })
      .from(members)
      .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
      .where(and(eq(members.userId, user.id), isNull(members.archivedAt)));

    const toDelete: string[] = [];
    for (const { member, workspace } of memberships) {
      if (member.role !== 'owner') continue;
      const others = await db
        .select({ role: members.role, userId: members.userId })
        .from(members)
        .where(and(eq(members.workspaceId, workspace.id), ne(members.id, member.id), isNull(members.archivedAt)));
      if (others.some((other) => other.role === 'owner' && other.userId)) continue;
      if (others.some((other) => other.userId)) throw conflict(`Make someone else the owner of ${workspace.name} first.`);
      toDelete.push(workspace.id);
    }
    await db.transaction(async (tx) => {
      for (const id of toDelete) await tx.delete(workspaces).where(eq(workspaces.id, id));
      await tx.delete(users).where(eq(users.id, user.id));
    });
    await endSession(deps, c);
    return c.json({ ok: true });
  });

  r.route('/', account);

  return r;
}
