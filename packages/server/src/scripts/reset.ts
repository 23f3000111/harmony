import { openDatabase } from '../db/client';
import { nodeKdf } from '../kdf-node';
import { configureKdf } from '../security';
import { loadEnv } from '../env';
import { reseedDemo } from '../seed/demo';

/** Rebuilds the dummy accounts and their data. Real accounts and workspaces aren't touched. */
configureKdf(nodeKdf);
const env = loadEnv();
const database = await openDatabase({ databaseUrl: env.databaseUrl, dataDir: env.dataDir });
await reseedDemo(database.db, new Date());
console.log('Demo data rebuilt.');
await database.close();
process.exit(0);
