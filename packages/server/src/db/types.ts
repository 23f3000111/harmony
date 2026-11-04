import type { PgDatabase } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

/** Works the same over a Postgres server, embedded Postgres in Node, or Postgres in the browser. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;
