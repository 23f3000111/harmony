import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Env } from './ports';

export type { Env } from './ports';

/** The repository root, found the same way from the source files and from the built bundle. */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, 'utf8')).workspaces) return dir;
      } catch {
        // An unreadable package.json just means this isn't the root.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const rootPath = (relative: string) => join(repoRoot(), relative);

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** The address people open in their browser. Used for Google sign-in and links in emails. */
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default(rootPath('.data/pg')),
  /** Seeds the dummy accounts and shows them on the sign-in page. Never turn this on for real customers. */
  DEMO_MODE: bool.optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Harmony <no-reply@example.com>'),
  /** Set when running behind a proxy or load balancer, so rate limits see the real visitor address. */
  TRUST_PROXY: bool.default(false),
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const dotenv = rootPath('.env');
  if (source === process.env && existsSync(dotenv)) process.loadEnvFile(dotenv);

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n  ');
    throw new Error(`Invalid environment settings:\n  ${problems}`);
  }

  const env = parsed.data;
  const hasGoogleId = Boolean(env.GOOGLE_CLIENT_ID);
  if (hasGoogleId !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.');
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    appUrl: env.APP_URL.replace(/\/$/, ''),
    secureCookies: env.APP_URL.startsWith('https://'),
    databaseUrl: env.DATABASE_URL || undefined,
    dataDir: env.DATA_DIR,
    demoMode: env.DEMO_MODE ?? env.NODE_ENV !== 'production',
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null,
    smtpUrl: env.SMTP_URL || undefined,
    mailFrom: env.MAIL_FROM,
    trustProxy: env.TRUST_PROXY,
  };
}
