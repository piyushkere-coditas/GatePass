import { PrismaClient } from '@prisma/client';
import { resetDb } from '../../test/int/db';
import { VisitCodeService } from './visit-code.service';

describe('VisitCodeService (Postgres)', () => {
  const prisma = new PrismaClient();
  const codes = new VisitCodeService();

  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  it('[SM-I-06] 20 parallel allocations on the same day produce 0001..0020 with no duplicates', async () => {
    const allocated = await Promise.all(
      Array.from({ length: 20 }, () => prisma.$transaction((tx) => codes.next(tx, '2026-11-02'))),
    );

    const expected = Array.from({ length: 20 }, (_, i) => `GP-20261102-${String(i + 1).padStart(4, '0')}`);
    expect([...allocated].sort()).toEqual(expected);
  });

  it('[SM-I-06] the sequence restarts on a new IST day', async () => {
    await prisma.$transaction((tx) => codes.next(tx, '2026-11-02'));
    expect(await prisma.$transaction((tx) => codes.next(tx, '2026-11-03'))).toBe('GP-20261103-0001');
  });
});
