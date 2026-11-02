// Local Postgres 16 without Docker or admin rights (embedded-postgres). Data persists in <repo>/.data/postgres.
// Usage: pnpm db:dev   (Ctrl+C to stop). Matches DATABASE_URL in .env.example.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = fileURLToPath(new URL('../../../.data/postgres', import.meta.url));
const firstRun = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'gatepass',
  password: 'gatepass',
  port: Number(process.env.DEV_DB_PORT ?? 5432),
  persistent: true,
});

if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('gatepass');
console.log('Postgres ready: postgresql://gatepass:gatepass@localhost:5432/gatepass (Ctrl+C to stop)');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
