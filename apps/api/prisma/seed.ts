import { formatVisitCode, toIstDate } from '@gatepass/shared';
import { Prisma, PrismaClient, Purpose, Role, VisitStatus, VisitType } from '@prisma/client';
import { ensureBootstrapAdmin } from '../src/users/bootstrap-admin';

/**
 * Always: ensures the bootstrap admin exists (AU-8).
 * Outside production: adds a small demo cast and today's visits so the UI has data.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim();
  if (!adminEmail) throw new Error('BOOTSTRAP_ADMIN_EMAIL is required');
  await ensureBootstrapAdmin(prisma, adminEmail);
  console.log('Bootstrap admin ensured');

  if (process.env.NODE_ENV === 'production') return;

  const demoUsers = [
    { email: 'alice@coditas.com', name: 'Alice Host', role: Role.EMPLOYEE },
    { email: 'bob@coditas.com', name: 'Bob Employee', role: Role.EMPLOYEE },
    { email: 'guard1@coditas.com', name: 'Guard One', role: Role.SECURITY },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: u });
  }
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@coditas.com' } });

  const now = new Date();
  const today = toIstDate(now);
  if ((await prisma.visit.count({ where: { visitDate: new Date(`${today}T00:00:00Z`) } })) > 0) return;

  const demoVisits = [
    {
      fullName: 'Rahul Sharma',
      phone: '+919876543210',
      company: 'Acme Corp',
      purpose: Purpose.CLIENT_MEETING,
      hoursFromNow: 1,
    },
    {
      fullName: 'Meera Iyer',
      phone: '+919812345678',
      company: null,
      purpose: Purpose.INTERVIEW,
      hoursFromNow: 2,
    },
  ];
  for (const v of demoVisits) {
    const visitor = await prisma.visitor.upsert({
      where: { phone: v.phone },
      update: {},
      create: { fullName: v.fullName, phone: v.phone, company: v.company },
    });
    await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ last: number }>>(Prisma.sql`
        INSERT INTO "VisitCodeCounter" ("date", "last") VALUES (${today}, 1)
        ON CONFLICT ("date") DO UPDATE SET "last" = "VisitCodeCounter"."last" + 1 RETURNING "last"`);
      const visit = await tx.visit.create({
        data: {
          code: formatVisitCode(today, Number(row!.last)),
          type: VisitType.PLANNED,
          status: VisitStatus.SCHEDULED,
          visitorId: visitor.id,
          hostId: alice.id,
          createdById: alice.id,
          purpose: v.purpose,
          visitDate: new Date(`${today}T00:00:00Z`),
          expectedArrival: new Date(now.getTime() + v.hoursFromNow * 3_600_000),
          expectedDurationMin: 60,
        },
      });
      await tx.visitEvent.create({
        data: { visitId: visit.id, action: 'CREATED', toStatus: VisitStatus.SCHEDULED, actorId: alice.id },
      });
    });
  }
  console.log(`Seeded demo users and ${demoVisits.length} visits for ${today}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
