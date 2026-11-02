import { VisitAction, VisitStatus } from '@gatepass/shared';
import { PrismaClient } from '@prisma/client';
import { AdjustableClock } from '../../common/clock';
import { DomainError } from '../../common/domain-error';
import type { PrismaService } from '../../prisma/prisma.service';
import { NOW, actors, photos, users } from '../../../test/fixtures';
import { createVisit, resetDb, seedUsers } from '../../../test/int/db';
import { type TransitionHook, VisitStateService } from './visit-state.service';

describe('VisitStateService (Postgres)', () => {
  const prisma = new PrismaClient();
  const clock = new AdjustableClock();
  const hooks: TransitionHook[] = [];
  const service = new VisitStateService(prisma as unknown as PrismaService, clock, hooks);

  beforeAll(() => clock.set(NOW));
  beforeEach(async () => {
    hooks.length = 0;
    await resetDb(prisma);
    await seedUsers(prisma);
  });
  afterAll(() => prisma.$disconnect());

  const checkIn = (visitId: string, actor = actors.guard1, expectedVersion = 0) =>
    service.transition({ visitId, action: VisitAction.CHECK_IN, actor, expectedVersion, payload: photos });

  it('[SM-I-01] applies the patch, bumps the version and writes exactly one event in one transaction', async () => {
    const visit = await createVisit(prisma);

    const updated = await checkIn(visit.id);

    expect(updated).toMatchObject({
      status: VisitStatus.CHECKED_IN,
      version: 1,
      checkedInAt: NOW,
      checkedInById: users.guard1.id,
      visitorPhotoKey: photos.visitorPhotoKey,
      idPhotoKey: photos.idPhotoKey,
    });
    const events = await prisma.visitEvent.findMany({ where: { visitId: visit.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'CHECKED_IN',
      fromStatus: VisitStatus.SCHEDULED,
      toStatus: VisitStatus.CHECKED_IN,
      actorId: users.guard1.id,
    });
  });

  it('[SM-I-02] a stale version is rejected with VISIT_STALE and changes nothing', async () => {
    const visit = await createVisit(prisma, { version: 1 });

    await expect(checkIn(visit.id, actors.guard1, 0)).rejects.toMatchObject({ code: 'VISIT_STALE' });

    expect(await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).toMatchObject({
      status: VisitStatus.SCHEDULED,
      version: 1,
    });
    expect(await prisma.visitEvent.count()).toBe(0);
  });

  it('[SM-I-03] two concurrent transitions on the same version: exactly one wins', async () => {
    const visit = await createVisit(prisma, { status: VisitStatus.APPROVED });

    const results = await Promise.allSettled([
      checkIn(visit.id, actors.guard1),
      checkIn(visit.id, actors.guard2),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(DomainError);
    expect((rejected[0]!.reason as DomainError).code).toBe('VISIT_STALE');
    expect(await prisma.visitEvent.count({ where: { visitId: visit.id } })).toBe(1);
  });

  it('[SM-I-04] a failing in-transaction hook (e.g. outbox insert) rolls the whole transition back', async () => {
    const visit = await createVisit(prisma);
    hooks.push({
      afterTransition: async () => {
        throw new Error('outbox insert failed');
      },
    });

    await expect(checkIn(visit.id)).rejects.toThrow('outbox insert failed');

    expect(await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).toMatchObject({
      status: VisitStatus.SCHEDULED,
      version: 0,
    });
    expect(await prisma.visitEvent.count()).toBe(0);
  });

  it('[SM-I-04] hooks receive the transaction and see the updated visit', async () => {
    const visit = await createVisit(prisma);
    const seen: string[] = [];
    hooks.push({ afterTransition: async (_tx, v, r) => void seen.push(`${v.status}:${r.domainEvent}`) });

    await checkIn(visit.id);

    expect(seen).toEqual(['CHECKED_IN:visit.checked_in']);
  });

  it('[SM-I-05] illegal transition is rejected without writing an event', async () => {
    const visit = await createVisit(prisma, { status: VisitStatus.CHECKED_OUT });

    await expect(checkIn(visit.id)).rejects.toMatchObject({ code: 'VISIT_INVALID_TRANSITION' });
    expect(await prisma.visitEvent.count()).toBe(0);
  });

  it('[SM-I-12] unknown visit id -> NOT_FOUND', async () => {
    await expect(checkIn('00000000-0000-4000-8000-0000000000ff')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
