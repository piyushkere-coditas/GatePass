import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AdjustableClock, Clock } from '../../src/common/clock';
import { Mailer } from '../../src/notifications/mailer';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FakeMailer } from './fake-mailer';

export const APP_BASE_URL = 'http://localhost:5173';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  clock: AdjustableClock;
  mailer: FakeMailer;
  /** Every log line the app wrote (for "never logged" assertions). */
  logs: string[];
}

/** The real AppModule over the embedded Postgres, with a captured mailer and log stream. */
export async function createTestApp(
  opts: { nodeEnv?: string; controllers?: Array<new (...args: never[]) => unknown> } = {},
): Promise<TestApp> {
  process.env.APP_BASE_URL = APP_BASE_URL;
  const logs: string[] = [];
  const logStream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(chunk.toString());
      cb();
    },
  });
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ nodeEnv: opts.nodeEnv ?? 'test', logStream })],
    controllers: opts.controllers ?? [],
  })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
  // Listening (not just init) lets supertest reuse one server, so requests may overlap safely.
  await app.listen(0, '127.0.0.1');
  return {
    app,
    prisma: app.get(PrismaService),
    clock: app.get(Clock) as AdjustableClock,
    mailer,
    logs,
  };
}

export type CookieJar = Record<string, string>;

/** Name → value of every cookie the response sets (empty value = cleared). */
export function cookiesFrom(res: Response): CookieJar {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries(
    (header ?? []).map((c) => {
      const [pair] = c.split(';');
      const i = pair!.indexOf('=');
      return [pair!.slice(0, i), decodeURIComponent(pair!.slice(i + 1))];
    }),
  );
}

/** Raw Set-Cookie line for one cookie, to check its attributes. */
export function setCookieLine(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((c) => c.startsWith(`${name}=`));
}

export function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

/** Polls until `check` returns a value (or throws after `timeoutMs`). */
export async function waitFor<T>(
  check: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 2000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
