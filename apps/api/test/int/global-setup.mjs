// Plain ESM (not TS): embedded-postgres is ESM-only and Jest loads .mjs global setup natively.
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Starts one Postgres 16 for the whole run and applies the real migrations.
 * INT_DB=docker uses Testcontainers (CI); INT_DB=embedded runs Postgres as a plain process (no Docker/admin).
 * Default: docker when the Docker daemon is reachable, otherwise embedded.
 */
export default async function globalSetup() {
  const mode = process.env.INT_DB ?? (dockerAvailable() ? 'docker' : 'embedded');
  const url = mode === 'docker' ? await startContainer() : await startEmbedded();
  console.log(`\n[int] Postgres via ${mode}`);

  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}

async function startContainer() {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  globalThis.__PG_CONTAINER__ = container;
  return container.getConnectionUri();
}

async function startEmbedded() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
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
  return `postgresql://gatepass:gatepass@localhost:${port}/gatepass_test?schema=public`;
}

function dockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
