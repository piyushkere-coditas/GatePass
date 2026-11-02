import { Injectable } from '@nestjs/common';
import { formatVisitCode } from '@gatepass/shared';
import type { Prisma } from '@prisma/client';

/** Allocates GP-YYYYMMDD-NNNN codes from a per-IST-day counter; safe under concurrency (SM-I-06). */
@Injectable()
export class VisitCodeService {
  async next(tx: Prisma.TransactionClient, istDate: string): Promise<string> {
    const [row] = await tx.$queryRaw<Array<{ last: number }>>`
      INSERT INTO "VisitCodeCounter" ("date", "last") VALUES (${istDate}, 1)
      ON CONFLICT ("date") DO UPDATE SET "last" = "VisitCodeCounter"."last" + 1
      RETURNING "last"`;
    return formatVisitCode(istDate, Number(row!.last));
  }
}
