import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { lt } from 'drizzle-orm';
import { createApp } from './app';
import { openDatabase } from './db/client';
import { passwordResets, sessions } from './db/schema';
import { loadEnv } from './env';
import { createGoogleClient } from './google';
import { nodeKdf } from './kdf-node';
import { log } from './log';
import { createMailer } from './mail';
import { Bus } from './realtime';
import { ensureDemo } from './seed/demo';
import { configureKdf, RateLimiter } from './security';
import { serveWebApp } from './static';

configureKdf(nodeKdf);
const env = loadEnv();
const database = await openDatabase({ databaseUrl: env.databaseUrl, dataDir: env.dataDir });

if (env.nodeEnv === 'production' && database.kind === 'embedded') {
  log.warn('running on the embedded database. Set DATABASE_URL to a Postgres server for real customers.');
}
if (env.nodeEnv === 'production' && env.demoMode) {
  log.warn('DEMO_MODE is on in production. The dummy accounts and their password are public on the sign-in page.');
}
if (env.demoMode) await ensureDemo(database.db, new Date());

const app = createApp({
  db: database.db,
  env,
  mail: createMailer(env),
  bus: new Bus(),
  limiter: new RateLimiter(),
  google: env.google ? createGoogleClient(env.google) : null,
  now: () => new Date(),
  ping: database.ping,
  remoteAddress: (c) => getConnInfo(c).remote.address,
});
serveWebApp(app, fileURLToPath(new URL('../../web/dist', import.meta.url)));

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  log.info('harmony is running', {
    url: `http://localhost:${info.port}`,
    database: database.kind,
    demoMode: env.demoMode,
    google: Boolean(env.google),
    mail: Boolean(env.smtpUrl),
  });
});

const cleanup = setInterval(
  () => {
    const now = new Date();
    void Promise.all([database.db.delete(sessions).where(lt(sessions.expiresAt, now)), database.db.delete(passwordResets).where(lt(passwordResets.expiresAt, now))]).catch(
      (error) => log.error('cleanup failed', { error: String(error) }),
    );
  },
  6 * 3_600_000,
);
cleanup.unref();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  clearInterval(cleanup);
  // Open live-update connections never end by themselves, so don't wait forever for them.
  const force = setTimeout(() => process.exit(0), 5_000);
  force.unref();
  server.close(async () => {
    await database.close().catch(() => undefined);
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
