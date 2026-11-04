import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGoogleClient, type GoogleClient, type GoogleIdentity } from '../src/google';
import { createHarness, signUp, type Harness } from './helpers';

describe('email sign-in', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('signs up, stays signed in and signs out', async () => {
    const agent = h.agent();
    const created = await agent.post('/api/auth/signup', { name: 'Aisyah', email: 'AISYAH@Example.com', password: 'long enough pass' });
    expect(created.status).toBe(201);
    expect(created.body.user.email).toBe('aisyah@example.com');
    expect(created.body.user.hasPassword).toBe(true);
    expect(JSON.stringify(created.body)).not.toContain('passwordHash');

    const setCookie = created.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    expect((await agent.get('/api/auth/me')).body.user.name).toBe('Aisyah');
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('rejects a short password and a bad email with field messages', async () => {
    const reply = await h.agent().post('/api/auth/signup', { name: 'A', email: 'nope', password: 'short' });
    expect(reply.status).toBe(422);
    expect(reply.body.error.fields.email).toBeTruthy();
    expect(reply.body.error.fields.password).toBeTruthy();
  });

  it('refuses a duplicate email', async () => {
    const { email } = await signUp(h);
    const reply = await h.agent().post('/api/auth/signup', { name: 'B', email, password: 'long enough pass' });
    expect(reply.status).toBe(409);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { email } = await signUp(h);
    const wrong = await h.agent().post('/api/auth/login', { email, password: 'not the password' });
    const unknown = await h.agent().post('/api/auth/login', { email: 'nobody@example.com', password: 'not the password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks out repeated guesses', async () => {
    const { email } = await signUp(h);
    const agent = h.agent();
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) last = (await agent.post('/api/auth/login', { email, password: 'guess' })).status;
    expect(last).toBe(429);
  });

  it('resets a password once, and signs out old sessions', async () => {
    const { agent, email } = await signUp(h);
    expect((await h.agent().post('/api/auth/forgot', { email })).status).toBe(200);
    const mail = h.mails.at(-1)!;
    expect(mail.to).toBe(email);
    const token = mail.text.match(/\/reset\/([\w-]+)/)![1]!;

    const fresh = h.agent();
    expect((await fresh.post('/api/auth/reset', { token, password: 'a brand new password' })).status).toBe(200);
    expect((await fresh.get('/api/auth/me')).body.user.email).toBe(email);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    expect((await h.agent().post('/api/auth/reset', { token, password: 'another new password' })).status).toBe(410);
    expect((await h.agent().post('/api/auth/login', { email, password: 'a brand new password' })).status).toBe(200);
  });

  it('answers the same for forgotten passwords on unknown emails, and sends nothing', async () => {
    const before = h.mails.length;
    const reply = await h.agent().post('/api/auth/forgot', { email: 'ghost@example.com' });
    expect(reply.status).toBe(200);
    expect(h.mails.length).toBe(before);
  });

  it('expires reset links after an hour', async () => {
    const { email } = await signUp(h);
    await h.agent().post('/api/auth/forgot', { email });
    const token = h.mails.at(-1)!.text.match(/\/reset\/([\w-]+)/)![1]!;
    const start = h.clock.now;
    h.clock.now = new Date(start.getTime() + 61 * 60_000);
    expect((await h.agent().post('/api/auth/reset', { token, password: 'a brand new password' })).status).toBe(410);
    h.clock.now = start;
  });

  it('changing a password needs the old one and signs out other devices', async () => {
    const { agent, email } = await signUp(h);
    const other = h.agent();
    await other.post('/api/auth/login', { email, password: 'correct horse battery' });

    expect((await agent.post('/api/auth/me/password', { current: 'wrong', next: 'a brand new password' })).status).toBe(422);
    expect((await agent.post('/api/auth/me/password', { current: 'correct horse battery', next: 'a brand new password' })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user).not.toBeNull();
    expect((await other.get('/api/auth/me')).body.user).toBeNull();
  });

  it('ends sessions when they expire', async () => {
    const { agent } = await signUp(h);
    const start = h.clock.now;
    h.clock.now = new Date(start.getTime() + 31 * 86_400_000);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    h.clock.now = start;
  });

  it('refuses writes from another website', async () => {
    const reply = await h.agent().post('/api/auth/login', { email: 'a@example.com', password: 'x' }, { origin: 'https://evil.example.org' });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe('bad_origin');
  });

  it('never shows demo details unless demo mode is on', async () => {
    const config = (await h.agent().get('/api/auth/config')).body;
    expect(config.demoMode).toBe(false);
    expect(config.demoAccounts).toEqual([]);
    expect(config.demoPassword).toBeNull();
    expect((await h.agent().post('/api/auth/google-demo')).status).toBe(404);
  });

  it('deletes an account and the workspaces only it could reach', async () => {
    const { agent } = await signUp(h);
    const made = await agent.post('/api/workspaces', { name: 'Mine', edition: 'home', starter: false });
    expect((await agent.delete('/api/auth/me')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    const { workspaces } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    expect(await h.deps.db.select().from(workspaces).where(eq(workspaces.id, made.body.workspace.id))).toHaveLength(0);
  });
});

describe('Google sign-in', () => {
  let h: Harness;
  const identity: GoogleIdentity = { sub: 'google-1', email: 'real.owner@example.com', emailVerified: true, name: 'Real Owner', picture: null };
  const seen: { verifier?: string; nonce?: string } = {};
  const fake: GoogleClient = {
    authUrl: ({ state }) => `https://accounts.google.test/auth?state=${state}`,
    exchange: async ({ codeVerifier, nonce }) => {
      seen.verifier = codeVerifier;
      seen.nonce = nonce;
      return identity;
    },
  };
  beforeAll(async () => {
    h = await createHarness({ google: fake });
  });
  afterAll(() => h.close());

  const startFlow = async (agent: ReturnType<Harness['agent']>) => {
    const start = await agent.get('/api/auth/google');
    expect(start.status).toBe(302);
    return new URL(start.headers.get('location')!).searchParams.get('state')!;
  };

  it('refuses a callback whose state does not match, which stops forged logins', async () => {
    const agent = h.agent();
    await startFlow(agent);
    const reply = await agent.get('/api/auth/google/callback?code=abc&state=forged');
    expect(reply.headers.get('location')).toBe('/login?error=google_failed');
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('creates an account on first sign-in and signs in again without a duplicate', async () => {
    const agent = h.agent();
    const state = await startFlow(agent);
    const reply = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(reply.headers.get('location')).toBe('/');
    expect(seen.verifier).toBeTruthy();
    const me = (await agent.get('/api/auth/me')).body.user;
    expect(me.email).toBe('real.owner@example.com');
    expect(me.hasGoogle).toBe(true);
    expect(me.hasPassword).toBe(false);

    const again = h.agent();
    const secondState = await startFlow(again);
    await again.get(`/api/auth/google/callback?code=abc&state=${secondState}`);
    expect((await again.get('/api/auth/me')).body.user.id).toBe(me.id);
  });

  it('takes an email back from someone who signed up without proving it', async () => {
    identity.sub = 'google-2';
    identity.email = 'squatted@example.com';
    const squatter = h.agent();
    await squatter.post('/api/auth/signup', { name: 'Squatter', email: 'squatted@example.com', password: 'squatter password' });

    const owner = h.agent();
    const state = await startFlow(owner);
    await owner.get(`/api/auth/google/callback?code=abc&state=${state}`);

    expect((await owner.get('/api/auth/me')).body.user.email).toBe('squatted@example.com');
    expect((await squatter.get('/api/auth/me')).body.user).toBeNull();
    expect((await h.agent().post('/api/auth/login', { email: 'squatted@example.com', password: 'squatter password' })).status).toBe(401);
  });

  it('returns only to addresses inside the app', async () => {
    for (const next of ['//evil.example.org', '/\t/evil.example.org', '/\n/evil.example.org', '/\\evil.example.org', 'https://evil.example.org']) {
      const agent = h.agent();
      const start = await agent.get(`/api/auth/google?next=${encodeURIComponent(next)}`);
      const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
      const reply = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);
      expect(reply.headers.get('location'), JSON.stringify(next)).toBe('/');
    }
  });

  it('keeps a safe return address, query and all', async () => {
    const agent = h.agent();
    const start = await agent.get(`/api/auth/google?next=${encodeURIComponent('/invite/abc?x=1')}`);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const reply = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(reply.headers.get('location')).toBe('/invite/abc?x=1');
  });
});

describe('return addresses', () => {
  it('only accepts paths on the app’s own origin', async () => {
    const { safeNext } = await import('../src/routes/auth');
    const app = 'https://harmony.example.com';
    expect(safeNext('/w/1/tasks?view=today', app)).toBe('/w/1/tasks?view=today');
    expect(safeNext('/%2F%2Fevil.example.org', app)).toBe('/%2F%2Fevil.example.org');
    for (const bad of ['//evil.example.org', '/\t/evil.example.org', '/\r\n/evil.example.org', '/\\evil.example.org', '/ /evil.example.org', 'evil.example.org', '', null, undefined]) {
      expect(safeNext(bad, app), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('Google ID token checks', () => {
  const clientId = 'client-123';

  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, audience = clientId, issuer = 'https://accounts.google.com') =>
      new SignJWT({ email: 'a@example.com', email_verified: true, name: 'A', ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('sub-1')
        .setAudience(audience)
        .setIssuer(issuer)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    const clientFor = (idToken: string) =>
      createGoogleClient({ clientId, clientSecret: 'secret' }, { keys, fetcher: (async () => new Response(JSON.stringify({ id_token: idToken }))) as typeof fetch });
    return { sign, clientFor };
  }

  const exchange = { code: 'c', codeVerifier: 'v', nonce: 'expected-nonce', redirectUri: 'http://localhost/cb' };

  it('accepts a properly signed token', async () => {
    const { sign, clientFor } = await setup();
    const result = await clientFor(await sign({ nonce: 'expected-nonce' })).exchange(exchange);
    expect(result).toMatchObject({ sub: 'sub-1', email: 'a@example.com', emailVerified: true });
  });

  it('rejects a token meant for another app', async () => {
    const { sign, clientFor } = await setup();
    await expect(clientFor(await sign({ nonce: 'expected-nonce' }, 'other-app')).exchange(exchange)).rejects.toThrow();
  });

  it('rejects a token from another issuer', async () => {
    const { sign, clientFor } = await setup();
    await expect(clientFor(await sign({ nonce: 'expected-nonce' }, clientId, 'https://evil.example.org')).exchange(exchange)).rejects.toThrow();
  });

  it('rejects a replayed token with the wrong nonce', async () => {
    const { sign, clientFor } = await setup();
    await expect(clientFor(await sign({ nonce: 'stale' })).exchange(exchange)).rejects.toThrow(/nonce/);
  });

  it('rejects a token signed with someone else’s key', async () => {
    const { clientFor } = await setup();
    const forged = await setup();
    await expect(clientFor(await forged.sign({ nonce: 'expected-nonce' })).exchange(exchange)).rejects.toThrow();
  });

  it('asks Google for PKCE and a nonce', async () => {
    const client = createGoogleClient({ clientId, clientSecret: 'secret' });
    const url = new URL(client.authUrl({ state: 's', codeVerifier: 'verifier', nonce: 'n', redirectUri: 'http://localhost/cb' }));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).not.toBe('verifier');
    expect(url.searchParams.get('nonce')).toBe('n');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });
});

describe('demo mode', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ env: { demoMode: true } });
  });
  afterAll(() => h.close());

  it('sends Google sign-in to the labelled stand-in when no credentials are set', async () => {
    const reply = await h.agent().get('/api/auth/google');
    expect(reply.headers.get('location')).toBe('/auth/google-demo');
  });

  it('signs in through the stand-in as a demo user', async () => {
    const agent = h.agent();
    const reply = await agent.post('/api/auth/google-demo');
    expect(reply.status).toBe(200);
    expect(reply.body.user.isDemo).toBe(true);
  });
});

describe('Google not set up and demo mode off', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('says Google is unavailable instead of pretending', async () => {
    const reply = await h.agent().get('/api/auth/google');
    expect(reply.headers.get('location')).toBe('/login?error=google_unavailable');
  });
});
