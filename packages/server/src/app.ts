import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { requireUser, workspaceAccess, type AppDeps, type AppEnv } from './context';
import { HttpError } from './errors';
import { log } from './log';
import { authRoutes } from './routes/auth';
import { boardRoutes } from './routes/board';
import { checklistRoutes } from './routes/checklists';
import { insightRoutes } from './routes/insights';
import { itemRoutes, restockRoutes } from './routes/items';
import { eventRoutes, mealRoutes } from './routes/meals';
import { billRoutes, moneyRoutes } from './routes/money';
import { orderRoutes, supplierRoutes } from './routes/orders';
import { requestRoutes } from './routes/requests';
import { taskRoutes } from './routes/tasks';
import { accountWorkspaceRoutes, inviteRoutes, workspaceRoutes } from './routes/workspaces';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The whole API. It only uses web-standard APIs, so the browser demo runs this same code. */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const { env } = deps;

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    const started = Date.now();
    await next();
    if (c.req.path.startsWith('/api/')) {
      log.info('request', { id: requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started });
    }
  });

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      strictTransportSecurity: env.secureCookies ? 'max-age=15552000; includeSubDomains' : false,
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  );

  // Session cookies are SameSite=Lax. This second check stops a form on another site from posting here.
  app.use('/api/*', async (c, next) => {
    if (UNSAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin) {
        const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
        let originHost: string | null = null;
        try {
          originHost = new URL(origin).host;
        } catch {
          // A malformed Origin falls through to the refusal below.
        }
        const allowed = originHost === host || origin === env.appUrl || (env.nodeEnv !== 'production' && originHost?.startsWith('localhost:'));
        if (!allowed) throw new HttpError(403, 'bad_origin', 'This request came from another site.');
      }
    }
    await next();
  });

  app.use('*', compress());

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/readyz', async (c) => {
    try {
      await deps.ping();
      return c.json({ ok: true });
    } catch (error) {
      log.error('database is not reachable', { error: String(error) });
      return c.json({ ok: false }, 503);
    }
  });

  app.route('/api/auth', authRoutes(deps));
  app.route('/api/invites', inviteRoutes(deps));
  app.route('/api/board', boardRoutes(deps));

  const api = new Hono<AppEnv>();
  api.use('*', requireUser(deps));
  api.route('/', accountWorkspaceRoutes(deps));

  const workspace = new Hono<AppEnv>();
  workspace.use('*', workspaceAccess(deps));
  workspace.route('/', workspaceRoutes(deps));
  workspace.route('/', insightRoutes(deps));
  workspace.route('/tasks', taskRoutes(deps));
  workspace.route('/items', itemRoutes(deps));
  workspace.route('/restock', restockRoutes(deps));
  workspace.route('/money', moneyRoutes(deps));
  workspace.route('/bills', billRoutes(deps));
  workspace.route('/meals', mealRoutes(deps));
  workspace.route('/events', eventRoutes(deps));
  workspace.route('/requests', requestRoutes(deps));
  workspace.route('/suppliers', supplierRoutes(deps));
  workspace.route('/orders', orderRoutes(deps));
  workspace.route('/checklists', checklistRoutes(deps));
  api.route('/w/:wid', workspace);

  app.route('/api', api);
  app.all('/api/*', () => {
    throw new HttpError(404, 'not_found', 'There is nothing at this address.');
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: { code: error.code, message: error.message, fields: error.fields } }, error.status);
    }
    log.error('unhandled error', { id: c.get('requestId'), path: c.req.path, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    return c.json({ error: { code: 'server_error', message: 'Something went wrong on our side. Try again in a moment.' } }, 500);
  });

  return app;
}
