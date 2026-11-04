/**
 * Everything the GitHub Pages demo needs to run the real API inside a browser tab.
 * Nothing here may import Node built-ins.
 */
export { createApp } from './app';
export { headerSession, SESSION_HEADER, type AppDeps } from './context';
export type { DB } from './db/types';
export * as schema from './db/schema';
export { workspaces } from './db/schema';
export { nobleKdf } from './kdf-noble';
export type { Env, Mailer } from './ports';
export { Bus } from './realtime';
export { configureKdf, RateLimiter } from './security';
export { ensureDemo } from './seed/demo';
