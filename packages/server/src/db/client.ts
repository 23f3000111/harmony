import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

import type { DB } from './types';

export type { DB } from './types';

export interface Database {
  db: DB;
  kind: 'postgres' | 'embedded';
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** The folder sits two levels up from this source file and one level up from the built bundle. */
function findMigrations(): string {
  for (const relative of ['../../drizzle', '../drizzle']) {
    const folder = fileURLToPath(new URL(relative, import.meta.url));
    if (existsSync(join(folder, 'meta', '_journal.json'))) return folder;
  }
  throw new Error('Database migrations folder not found.');
}

/**
 * Production talks to a real Postgres server through DATABASE_URL.
 * Without one, the app runs on embedded Postgres (PGlite), so it works with no install.
 * Passing no data directory keeps everything in memory, which is what the tests use.
 */
export async function openDatabase(options: { databaseUrl?: string; dataDir?: string }): Promise<Database> {
  const migrationsFolder = findMigrations();
  if (options.databaseUrl) {
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as DB;
    await migratePg(db as never, { migrationsFolder });
    return {
      db,
      kind: 'postgres',
      ping: async () => void (await pool.query('select 1')),
      close: () => pool.end(),
    };
  }

  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const client = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as DB;
  await migratePglite(db as never, { migrationsFolder });
  return {
    db,
    kind: 'embedded',
    ping: async () => void (await client.query('select 1')),
    close: () => client.close(),
  };
}
