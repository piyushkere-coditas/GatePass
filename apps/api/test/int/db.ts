import { Purpose, VisitStatus, VisitType } from '@gatepass/shared';
import type { PrismaClient, Visit } from '@prisma/client';
import { NOW, TODAY, users, visitors } from '../fixtures';

/** Empties every table between tests (TESTING.md §4: no test depends on another's data). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: Object.values(users).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
    })),
  });
}

let seq = 0;

/** Inserts a visit directly (bypassing the API) in any status, for state-machine integration tests. */
export async function createVisit(prisma: PrismaClient, overrides: Partial<Visit> = {}): Promise<Visit> {
  const visitor = await prisma.visitor.upsert({
    where: { phone: visitors.rahul.phone },
    update: {},
    create: visitors.rahul,
  });
  seq += 1;
  return prisma.visit.create({
    data: {
      code: `GP-TEST-${String(seq).padStart(4, '0')}`,
      type: VisitType.PLANNED,
      status: VisitStatus.SCHEDULED,
      visitorId: visitor.id,
      hostId: users.alice.id,
      createdById: users.alice.id,
      purpose: Purpose.INTERVIEW,
      visitDate: new Date(`${TODAY}T00:00:00Z`),
      expectedArrival: NOW,
      expectedDurationMin: 60,
      ...overrides,
    },
  });
}
