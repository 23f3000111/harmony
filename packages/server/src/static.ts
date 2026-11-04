import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import type { AppEnv } from './context';
import { HttpError } from './errors';

/** Serves the built web app next to the API. Node only; the browser demo has no use for it. */
export function serveWebApp(app: Hono<AppEnv>, webRoot: string) {
  const indexFile = join(webRoot, 'index.html');
  if (!existsSync(indexFile)) return false;

  // serveStatic wants a path relative to where the server was started.
  const root = relative(process.cwd(), webRoot).replace(/\\/g, '/') || '.';
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.ok) c.header('cache-control', 'public, max-age=31536000, immutable');
  });
  // A missing asset is a real 404. Answering with the app's page would hide a stale deploy.
  app.get('/assets/*', serveStatic({ root }), () => {
    throw new HttpError(404, 'not_found', 'That file is not part of this version of the app.');
  });
  app.use('*', serveStatic({ root, rewriteRequestPath: (path) => (path === '/' ? '/__app__' : path) }));
  // Every other address belongs to the single-page app. It's read fresh, so a new build shows up without a restart.
  app.get('*', (c) => {
    c.header('cache-control', 'no-cache');
    return c.html(readFileSync(indexFile, 'utf8'));
  });
  return true;
}
