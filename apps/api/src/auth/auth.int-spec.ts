import { Role, VisitStatus } from '@gatepass/shared';
import { EmailStatus } from '@prisma/client';
import request from 'supertest';
import { NOW, users } from '../../test/fixtures';
import {
  type CookieJar,
  type TestApp,
  cookieHeader,
  cookiesFrom,
  createTestApp,
  setCookieLine,
  waitFor,
} from '../../test/int/app';
import { createVisit, resetDb, seedUsers } from '../../test/int/db';
import { ensureBootstrapAdmin } from '../users/bootstrap-admin';

const GENERIC = { message: 'If this is a Coditas account, a code has been sent.' };
const MIN = 60_000;

describe('Sign-in with an email code (Postgres)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  const requestCode = (email: string) => http().post('/auth/otp/request').send({ email });
  const verify = (email: string, code: string) => http().post('/auth/otp/verify').send({ email, code });

  /** Reads the code from the (fake) mailbox, as the user would. */
  const codeFor = (email: string, nth = 1) =>
    waitFor(() => {
      const mails = t.mailer.sent.filter((m) => m.to === email);
      return mails.length >= nth ? /\b(\d{6})\b/.exec(mails[nth - 1]!.subject)![1]! : undefined;
    });

  const signIn = async (email: string) => {
    expect((await requestCode(email)).status).toBe(202);
    return verify(email, await codeFor(email));
  };

  const otherCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());

  beforeEach(async () => {
    t.clock.set(NOW);
    t.mailer.sent.length = 0;
    t.logs.length = 0;
    await resetDb(t.prisma);
    await seedUsers(t.prisma);
  });

  describe('request & verify', () => {
    it('[AU-I-01] a code request stores only a hash and emails the code immediately', async () => {
      const res = await requestCode('alice@coditas.com');

      expect(res.status).toBe(202);
      expect(res.body).toEqual(GENERIC);
      const code = await codeFor('alice@coditas.com'); // waitFor: within 2 s
      const rows = await t.prisma.loginCode.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.email).toBe('alice@coditas.com');
      expect(rows[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows[0])).not.toContain(code);
    });

    it('[AU-I-02] a new Coditas user is created on first sign-in and gets session cookies', async () => {
      const res = await signIn('dave@coditas.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        email: 'dave@coditas.com',
        name: 'Dave',
        role: Role.EMPLOYEE,
      });
      expect(await t.prisma.user.findUnique({ where: { email: 'dave@coditas.com' } })).toMatchObject({
        role: Role.EMPLOYEE,
        lastLoginAt: NOW,
      });
      for (const name of ['access', 'refresh']) {
        const line = setCookieLine(res, name)!;
        expect(line).toMatch(/HttpOnly/i);
        expect(line).toMatch(/Secure/i);
        expect(line).toMatch(/SameSite=Lax/i);
      }
      // Browsers reach the API through /api, so the refresh cookie must be scoped there.
      expect(setCookieLine(res, 'refresh')).toMatch(/Path=\/api\/auth(;|$)/);
      expect((await t.prisma.loginCode.findFirstOrThrow()).consumedAt).toEqual(NOW);
    });

    it('[AU-I-03] an existing user signs in without a duplicate and keeps their role', async () => {
      const res = await signIn('carol@coditas.com');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: users.carol.id, role: Role.ADMIN, name: 'Carol Admin' });
      expect(await t.prisma.user.count({ where: { email: 'carol@coditas.com' } })).toBe(1);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: users.carol.id } })).lastLoginAt).toEqual(
        NOW,
      );
    });

    it('[AU-I-04] an inactive user gets the same answer but no code, and cannot verify', async () => {
      const active = await requestCode('alice@coditas.com');
      const inactive = await requestCode('eve@coditas.com');

      expect(inactive.status).toBe(active.status);
      expect(inactive.body).toEqual(active.body);
      expect(await t.prisma.loginCode.count({ where: { email: 'eve@coditas.com' } })).toBe(0);
      expect(await t.prisma.emailOutbox.count({ where: { to: 'eve@coditas.com' } })).toBe(0);

      const res = await verify('eve@coditas.com', '123456');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CODE');
    });

    it.each(['x@gmail.com', 'x@coditas.com.evil.io'])(
      '[AU-I-05] %s is refused and nothing is stored or sent',
      async (email) => {
        const res = await requestCode(email);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('DOMAIN_NOT_ALLOWED');
        expect(await t.prisma.loginCode.count()).toBe(0);
        expect(await t.prisma.emailOutbox.count()).toBe(0);
      },
    );

    it('[AU-I-06] the bootstrap admin is seeded into an empty database and stays ADMIN after sign-in', async () => {
      await resetDb(t.prisma);

      await ensureBootstrapAdmin(t.prisma, ' Carol@Coditas.com ');

      expect(await t.prisma.user.findUniqueOrThrow({ where: { email: 'carol@coditas.com' } })).toMatchObject({
        role: Role.ADMIN,
        isActive: true,
        name: 'Carol',
      });
      const res = await signIn('carol@coditas.com');
      expect(res.body.role).toBe(Role.ADMIN);
    });

    it('[AU-I-07] a pre-registered guard is matched on first sign-in', async () => {
      const guard3 = await t.prisma.user.create({
        data: {
          email: 'guard3@coditas.com',
          name: 'Guard Three',
          role: Role.SECURITY,
          createdById: users.carol.id,
        },
      });

      const res = await signIn('guard3@coditas.com');

      expect(res.body).toEqual({
        id: guard3.id,
        email: 'guard3@coditas.com',
        name: 'Guard Three',
        role: Role.SECURITY,
      });
      expect(await t.prisma.user.count({ where: { email: 'guard3@coditas.com' } })).toBe(1);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: guard3.id } })).lastLoginAt).toEqual(NOW);
    });

    it('[AU-I-08] the email is matched case-insensitively', async () => {
      const guard3 = await t.prisma.user.create({
        data: { email: 'guard3@coditas.com', name: 'Guard Three', role: Role.SECURITY },
      });

      await requestCode('Guard3@Coditas.com');
      const res = await verify(' GUARD3@coditas.com ', await codeFor('guard3@coditas.com'));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(guard3.id);
    });

    it('[AU-I-25] five wrong codes invalidate the code, so the right one no longer works', async () => {
      await requestCode('alice@coditas.com');
      const code = await codeFor('alice@coditas.com');

      for (let i = 0; i < 5; i += 1) {
        const wrong = await verify('alice@coditas.com', otherCode(code));
        expect(wrong.status).toBe(401);
        expect(wrong.body.code).toBe('INVALID_CODE');
      }
      const right = await verify('alice@coditas.com', code);

      expect(right.status).toBe(401);
      expect((await t.prisma.loginCode.findFirstOrThrow()).invalidatedAt).toEqual(NOW);
    });

    it('[AU-I-26] a code entered 10 minutes after issue has expired', async () => {
      await requestCode('alice@coditas.com');
      const code = await codeFor('alice@coditas.com');

      t.clock.advance(10 * MIN);
      const res = await verify('alice@coditas.com', code);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CODE');
    });

    it('[AU-I-27] a code can be used only once', async () => {
      await requestCode('alice@coditas.com');
      const code = await codeFor('alice@coditas.com');

      expect((await verify('alice@coditas.com', code)).status).toBe(200);
      expect((await verify('alice@coditas.com', code)).status).toBe(401);
    });

    it('[AU-I-28] requesting a new code invalidates the previous one', async () => {
      await requestCode('alice@coditas.com');
      const c1 = await codeFor('alice@coditas.com', 1);
      t.clock.advance(1000);
      await requestCode('alice@coditas.com');
      const c2 = await codeFor('alice@coditas.com', 2);

      if (c1 !== c2) expect((await verify('alice@coditas.com', c1)).status).toBe(401);
      expect((await verify('alice@coditas.com', c2)).status).toBe(200);
    });

    it('[AU-I-29] a 4th request for the same email within 15 minutes is rate-limited', async () => {
      for (const at of [0, 5, 10]) {
        t.clock.set(new Date(NOW.getTime() + at * MIN));
        expect((await requestCode('alice@coditas.com')).status).toBe(202);
      }
      await codeFor('alice@coditas.com', 3);

      t.clock.set(new Date(NOW.getTime() + 14 * MIN));
      const res = await requestCode('alice@coditas.com');

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
      expect(res.body.details.retryAfterSeconds).toBe(60);
      expect(await t.prisma.emailOutbox.count()).toBe(3);
    });

    it('[AU-I-30] a 21st request from one IP within 15 minutes is rate-limited', async () => {
      for (let n = 1; n <= 20; n += 1) {
        expect((await requestCode(`user${n}@coditas.com`)).status).toBe(202);
      }

      const res = await requestCode('user21@coditas.com');

      expect(res.status).toBe(429);
      expect(await t.prisma.loginCode.count({ where: { email: 'user21@coditas.com' } })).toBe(0);
    });

    it('[AU-I-31] the code is scrubbed from the outbox once sent and never logged', async () => {
      const res = await signIn('alice@coditas.com');
      expect(res.status).toBe(200);
      const code = /\b(\d{6})\b/.exec(t.mailer.sent[0]!.subject)![1]!;

      const row = await waitFor(async () => {
        const r = await t.prisma.emailOutbox.findFirstOrThrow();
        return r.status === EmailStatus.SENT ? r : undefined;
      });

      expect(row.payload).toEqual({});
      expect(t.logs.join('\n')).not.toContain(code);
    });
  });

  describe('sessions', () => {
    const login = async (email: string): Promise<CookieJar> => {
      const res = await http().post('/__test/login').send({ email });
      expect(res.status).toBe(200);
      return cookiesFrom(res);
    };
    const me = (jar: CookieJar) => http().get('/me').set('Cookie', cookieHeader(jar));
    const refresh = (jar: CookieJar) => http().post('/auth/refresh').set('Cookie', cookieHeader(jar));

    it('[AU-I-09] an expired access token is renewed with the refresh token', async () => {
      const jar = await login('alice@coditas.com');
      expect((await me(jar)).status).toBe(200);

      t.clock.advance(16 * MIN);
      const expired = await me(jar);
      expect(expired.status).toBe(401);
      expect(expired.body.code).toBe('UNAUTHORIZED');

      const res = await refresh(jar);
      expect(res.status).toBe(200);
      const renewed = cookiesFrom(res);
      expect(renewed.refresh).toBeTruthy();
      expect(renewed.refresh).not.toBe(jar.refresh);

      const after = await me(renewed);
      expect(after.status).toBe(200);
      expect(after.body).toEqual({
        id: users.alice.id,
        email: users.alice.email,
        name: users.alice.name,
        role: Role.EMPLOYEE,
      });
    });

    it('[AU-I-10] a session older than 8 hours cannot be refreshed', async () => {
      const jar = await login('alice@coditas.com');

      t.clock.advance(8 * 60 * MIN);

      expect((await refresh(jar)).status).toBe(401);
    });

    it('[AU-I-11] reusing a rotated refresh token revokes the whole session', async () => {
      const first = await login('alice@coditas.com');
      const second = cookiesFrom(await refresh(first));

      const replay = await refresh(first);

      expect(replay.status).toBe(401);
      expect((await refresh(second)).status).toBe(401);
      expect((await me(second)).status).toBe(401);
      expect(await t.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('[AU-I-12] a deactivated user is rejected on the next request and cannot refresh', async () => {
      const jar = await login('guard1@coditas.com');
      expect((await me(jar)).status).toBe(200);

      await t.prisma.user.update({ where: { id: users.guard1.id }, data: { isActive: false } });

      expect((await me(jar)).status).toBe(401);
      expect((await refresh(jar)).status).toBe(401);
    });

    it('[AU-I-13] a role change applies to the next request without signing in again', async () => {
      const jar = await login('bob@coditas.com');
      expect((await me(jar)).body.role).toBe(Role.EMPLOYEE);

      await t.prisma.user.update({ where: { id: users.bob.id }, data: { role: Role.SECURITY } });

      expect((await me(jar)).body.role).toBe(Role.SECURITY);
    });

    it('[AU-I-14] logout ends the session but leaves visits untouched', async () => {
      const visit = await createVisit(t.prisma, { status: VisitStatus.CHECKED_IN });
      const jar = await login('guard1@coditas.com');

      const res = await http().post('/auth/logout').set('Cookie', cookieHeader(jar));

      expect(res.status).toBe(204);
      expect(cookiesFrom(res)).toEqual({ access: '', refresh: '' });
      expect(await t.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      expect((await me(jar)).status).toBe(401);
      expect((await refresh(jar)).status).toBe(401);
      expect((await t.prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe(
        VisitStatus.CHECKED_IN,
      );
    });

    it('[AU-I-32] a user can change their display name (2-100 characters)', async () => {
      const jar = await login('alice@coditas.com');

      const ok = await http().patch('/me').set('Cookie', cookieHeader(jar)).send({ name: 'Alice H.' });
      expect(ok.status).toBe(200);
      expect(ok.body.name).toBe('Alice H.');

      const bad = await http().patch('/me').set('Cookie', cookieHeader(jar)).send({ name: 'A' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
    });

    it('[AU-I-21a] anonymous requests to /me are rejected; sign-in routes are public', async () => {
      expect((await http().get('/me')).status).toBe(401);
      expect((await http().post('/auth/refresh')).status).toBe(401);
      expect((await requestCode('alice@coditas.com')).status).toBe(202);
    });
  });

  it('[AU-I-24] /__test/login does not exist in production', async () => {
    const prod = await createTestApp({ nodeEnv: 'production' });
    try {
      const res = await request(prod.app.getHttpServer())
        .post('/__test/login')
        .send({ email: 'alice@coditas.com' });
      expect(res.status).toBe(404);
    } finally {
      await prod.app.close();
    }
  });
});
