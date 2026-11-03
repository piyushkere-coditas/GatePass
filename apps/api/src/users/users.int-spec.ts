import { Role } from '@gatepass/shared';
import request from 'supertest';
import { NOW, users } from '../../test/fixtures';
import { type CookieJar, type TestApp, cookieHeader, cookiesFrom, createTestApp } from '../../test/int/app';
import { resetDb, seedUsers } from '../../test/int/db';

describe('Directory search and admin user management (Postgres)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const sessions: Record<string, CookieJar> = {};

  const as = async (who: keyof typeof users): Promise<string> => {
    if (!sessions[who]) {
      const res = await http().post('/__test/login').send({ email: users[who].email });
      expect(res.status).toBe(200);
      sessions[who] = cookiesFrom(res);
    }
    return cookieHeader(sessions[who]);
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());

  beforeEach(async () => {
    t.clock.set(NOW);
    for (const k of Object.keys(sessions)) delete sessions[k];
    await resetDb(t.prisma);
    await seedUsers(t.prisma);
  });

  describe('directory search', () => {
    it('[AU-I-15] returns at most 10 active employees/admins by name or email prefix, never guards', async () => {
      await t.prisma.user.createMany({
        data: [
          ...Array.from({ length: 15 }, (_, i) => ({
            email: `pi.emp${String(i).padStart(2, '0')}@coditas.com`,
            name: `Pi Employee ${String(i).padStart(2, '0')}`,
          })),
          { email: 'pi.guard@coditas.com', name: 'Pi Guard', role: Role.SECURITY },
          { email: 'pi.gone@coditas.com', name: 'Pi Gone', isActive: false },
        ],
      });

      const res = await http()
        .get('/users/search')
        .query({ q: 'PI' })
        .set('Cookie', await as('guard1'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(10);
      for (const u of res.body as Array<{ name: string; email: string }>) {
        expect(u).toEqual({
          id: expect.any(String),
          name: expect.stringMatching(/^Pi Employee/),
          email: expect.any(String),
        });
      }
    });

    it('[AU-I-15] matches the start of any word in the name and the start of the email', async () => {
      await t.prisma.user.create({ data: { email: 'piyush.kere@coditas.com', name: 'Piyush Kere' } });

      const byLastName = await http()
        .get('/users/search?q=ker')
        .set('Cookie', await as('carol'));
      const byEmail = await http()
        .get('/users/search?q=piyush.k')
        .set('Cookie', await as('carol'));
      const middle = await http()
        .get('/users/search?q=yus')
        .set('Cookie', await as('carol'));

      expect(byLastName.body.map((u: { name: string }) => u.name)).toEqual(['Piyush Kere']);
      expect(byEmail.body.map((u: { name: string }) => u.name)).toEqual(['Piyush Kere']);
      expect(middle.body).toEqual([]);
    });

    it('[AU-I-16] a one-letter query is refused', async () => {
      const res = await http()
        .get('/users/search?q=p')
        .set('Cookie', await as('guard1'));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('QUERY_TOO_SHORT');
    });

    it('[AU-I-17] employees cannot search the directory', async () => {
      const res = await http()
        .get('/users/search?q=bo')
        .set('Cookie', await as('alice'));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('admin user management', () => {
    const create = async (body: object) =>
      http()
        .post('/admin/users')
        .set('Cookie', await as('carol'))
        .send(body);
    const patch = async (id: string, body: object, who: keyof typeof users = 'carol') =>
      http()
        .patch(`/admin/users/${id}`)
        .set('Cookie', await as(who))
        .send(body);

    it('[AU-I-18] an admin pre-registers a guard; duplicates and other domains are refused', async () => {
      const res = await create({ email: ' Guard3@Coditas.com ', name: 'Guard Three', role: Role.SECURITY });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        email: 'guard3@coditas.com',
        name: 'Guard Three',
        role: Role.SECURITY,
        isActive: true,
        lastLoginAt: null,
        notSignedInYet: true,
      });
      const row = await t.prisma.user.findUniqueOrThrow({ where: { email: 'guard3@coditas.com' } });
      expect(row.createdById).toBe(users.carol.id);
      expect(await t.prisma.auditLog.findFirst({ where: { entityId: row.id } })).toMatchObject({
        actorId: users.carol.id,
        action: 'USER_CREATED',
        entity: 'User',
        data: { email: 'guard3@coditas.com', role: Role.SECURITY },
      });

      const again = await create({ email: 'guard3@coditas.com', name: 'Guard Three', role: Role.SECURITY });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('USER_EXISTS');

      const gmail = await create({ email: 'x@gmail.com', name: 'Outsider', role: Role.SECURITY });
      expect(gmail.status).toBe(400);
      expect(gmail.body.code).toBe('DOMAIN_NOT_ALLOWED');
    });

    it('[AU-I-19] role changes are applied and audited with old and new values', async () => {
      const up = await patch(users.alice.id, { role: Role.ADMIN });
      expect(up.status).toBe(200);
      expect(up.body.role).toBe(Role.ADMIN);
      t.clock.advance(1000);

      const down = await patch(users.alice.id, { role: Role.EMPLOYEE });
      expect(down.status).toBe(200);

      const audit = await t.prisma.auditLog.findMany({
        where: { entityId: users.alice.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => [a.action, a.actorId, a.data])).toEqual([
        ['USER_UPDATED', users.carol.id, { before: { role: Role.EMPLOYEE }, after: { role: Role.ADMIN } }],
        ['USER_UPDATED', users.carol.id, { before: { role: Role.ADMIN }, after: { role: Role.EMPLOYEE } }],
      ]);
    });

    it('[AU-I-19] a deactivated user is signed out on their next request', async () => {
      const bob = await as('bob');

      expect((await patch(users.bob.id, { isActive: false })).status).toBe(200);

      expect((await http().get('/me').set('Cookie', bob)).status).toBe(401);
    });

    it('[AU-I-20] the last active admin cannot be demoted, and admins cannot deactivate themselves', async () => {
      await t.prisma.user.update({ where: { id: users.frank.id }, data: { isActive: false } });

      const demote = await patch(users.carol.id, { role: Role.EMPLOYEE });
      expect(demote.status).toBe(422);
      expect(demote.body.code).toBe('LAST_ADMIN');

      const self = await patch(users.carol.id, { isActive: false });
      expect(self.status).toBe(422);
      expect(self.body.code).toBe('SELF_DEACTIVATION');

      expect(await t.prisma.user.findUniqueOrThrow({ where: { id: users.carol.id } })).toMatchObject({
        role: Role.ADMIN,
        isActive: true,
      });
      expect(await t.prisma.auditLog.count()).toBe(0);
    });

    it('[AU-I-20] with a second active admin, an admin can be demoted', async () => {
      const res = await patch(users.frank.id, { role: Role.EMPLOYEE });
      expect(res.status).toBe(200);
    });

    it('[AU-I-20] unknown users and bad input are rejected', async () => {
      expect((await patch('00000000-0000-4000-8000-0000000000ff', { name: 'Nobody' })).status).toBe(404);
      expect((await patch(users.alice.id, { role: 'OWNER' })).status).toBe(400);
      expect((await patch(users.alice.id, {})).status).toBe(400);
    });

    it('[AU-I-22] lists users with role/active filters, pagination and a not-signed-in flag', async () => {
      await t.prisma.user.createMany({
        data: Array.from({ length: 23 }, (_, i) => ({
          email: `guard${String(i + 10)}@coditas.com`,
          name: `Guard ${String(i + 10)}`,
          role: Role.SECURITY,
          isActive: i !== 0,
          lastLoginAt: i % 2 === 0 ? NOW : null,
        })),
      });
      const cookie = await as('carol');

      const page1 = await http().get('/admin/users?role=SECURITY&active=true&page=1').set('Cookie', cookie);
      const page2 = await http().get('/admin/users?role=SECURITY&active=true&page=2').set('Cookie', cookie);

      // 22 active new guards + guard1 + guard2 = 24 active guards
      expect(page1.status).toBe(200);
      expect(page1.body).toMatchObject({ page: 1, pageSize: 20, total: 24 });
      expect(page1.body.items).toHaveLength(20);
      expect(page2.body.items).toHaveLength(4);
      const all = [...page1.body.items, ...page2.body.items] as Array<{
        role: string;
        isActive: boolean;
        lastLoginAt: string | null;
        notSignedInYet: boolean;
      }>;
      expect(all.every((u) => u.role === Role.SECURITY && u.isActive)).toBe(true);
      expect(all.every((u) => u.notSignedInYet === (u.lastLoginAt === null))).toBe(true);
      expect(all.some((u) => u.notSignedInYet)).toBe(true);

      const search = await http().get('/admin/users?q=guard 1').set('Cookie', cookie);
      expect(search.body.items.map((u: { email: string }) => u.email)).toContain('guard10@coditas.com');
    });
  });
});
