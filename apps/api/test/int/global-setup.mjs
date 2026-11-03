// Plain ESM (not TS): embedded-postgres is ESM-only and Jest loads .mjs global setup natively.
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Starts one real Postgres 16 for the whole run as a plain process (no Docker or admin rights needed),
 * then applies the real migrations. Same setup locally and in CI.
 */
export default async function globalSetup() {
  const port = Number(process.env.INT_DB_PORT ?? 54329);
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), 'gatepass-int-pg-')),
    user: 'gatepass',
    password: 'gatepass',
    port,
    persistent: false,
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('gatepass_test');
  globalThis.__PG_EMBEDDED__ = pg;

  const url = `postgresql://gatepass:gatepass@localhost:${port}/gatepass_test?schema=public`;
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
