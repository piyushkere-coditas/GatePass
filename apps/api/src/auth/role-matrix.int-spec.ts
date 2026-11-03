import request from 'supertest';
import { NOW, users } from '../../test/fixtures';
import { type TestApp, cookieHeader, cookiesFrom, createTestApp } from '../../test/int/app';
import { resetDb, seedUsers } from '../../test/int/db';

type Caller = 'anonymous' | 'EMPLOYEE' | 'SECURITY' | 'ADMIN';
/** `ok` = the role gets past authentication and authorization (any status other than 401/403). */
type Expect = 'ok' | 401 | 403;

interface Row {
  method: 'get' | 'post' | 'patch';
  path: string;
  body?: object;
  expect: Record<Caller, Expect>;
}

const ANY_USER = { anonymous: 401, EMPLOYEE: 'ok', SECURITY: 'ok', ADMIN: 'ok' } as const;
const PUBLIC = { anonymous: 'ok', EMPLOYEE: 'ok', SECURITY: 'ok', ADMIN: 'ok' } as const;
const ADMIN_ONLY = { anonymous: 401, EMPLOYEE: 403, SECURITY: 403, ADMIN: 'ok' } as const;
const SECURITY_OR_ADMIN = { anonymous: 401, EMPLOYEE: 403, SECURITY: 'ok', ADMIN: 'ok' } as const;

/**
 * Every endpoint × every role (AU-I-21). **Each module adds its endpoints here.**
 * Anonymous callers get 401 everywhere except /health and the sign-in routes.
 */
const MATRIX: Row[] = [
  { method: 'get', path: '/health', expect: PUBLIC },
  { method: 'post', path: '/auth/otp/request', body: { email: 'x@gmail.com' }, expect: PUBLIC },
  // No code: a 400 shows the route is reachable (any wrong code would be a 401 INVALID_CODE by design).
  { method: 'post', path: '/auth/otp/verify', body: { email: 'alice@coditas.com' }, expect: PUBLIC },
  { method: 'get', path: '/me', expect: ANY_USER },
  { method: 'patch', path: '/me', body: { name: 'Same Name' }, expect: ANY_USER },
  { method: 'get', path: '/users/search?q=al', expect: SECURITY_OR_ADMIN },
  { method: 'get', path: '/admin/users', expect: ADMIN_ONLY },
  {
    method: 'post',
    path: '/admin/users',
    body: { email: 'new.user@coditas.com', name: 'New User', role: 'EMPLOYEE' },
    expect: ADMIN_ONLY,
  },
  {
    method: 'patch',
    path: `/admin/users/${users.bob.id}`,
    body: { name: 'Bob Employee' },
    expect: ADMIN_ONLY,
  },
  // Keep last: it ends each caller's session.
  { method: 'post', path: '/auth/logout', expect: PUBLIC },
];

const CALLERS: Record<Exclude<Caller, 'anonymous'>, keyof typeof users> = {
  EMPLOYEE: 'alice',
  SECURITY: 'guard1',
  ADMIN: 'carol',
};

describe('Role matrix (Postgres)', () => {
  let t: TestApp;
  const cookies: Partial<Record<Caller, string>> = {};

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(NOW);
    await resetDb(t.prisma);
    await seedUsers(t.prisma);
    for (const [caller, who] of Object.entries(CALLERS)) {
      const res = await request(t.app.getHttpServer())
        .post('/__test/login')
        .send({ email: users[who].email });
      cookies[caller as Caller] = cookieHeader(cookiesFrom(res));
    }
  });
  afterAll(() => t.app.close());

  const cases = MATRIX.flatMap((row) =>
    (Object.keys(row.expect) as Caller[]).map(
      (caller) => [row.method.toUpperCase(), row.path, caller, row] as const,
    ),
  );

  it.each(cases)('[AU-I-21] %s %s as %s', async (_m, _p, caller, row) => {
    let req = request(t.app.getHttpServer())[row.method](row.path);
    if (cookies[caller]) req = req.set('Cookie', cookies[caller]);
    const res = await (row.body ? req.send(row.body) : req);

    const expected = row.expect[caller];
    if (expected === 'ok') expect([401, 403]).not.toContain(res.status);
    else expect(res.status).toBe(expected);
  });
});
