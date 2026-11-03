import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type EmailOutbox, EmailStatus, Prisma } from '@prisma/client';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { afterSendFailure } from './backoff';
import { Mailer } from './mailer';
import { isTemplateName, renderEmail } from './templates/registry';

export interface OutboxWorkerOptions {
  intervalMs: number;
  batchSize: number;
  autoStart: boolean;
}
export const OUTBOX_WORKER_OPTIONS = Symbol('OUTBOX_WORKER_OPTIONS');

/** A worker that died mid-send leaves rows in SENDING; they are retried after this long (NT-I-13). */
const STALE_LOCK_MS = 5 * 60_000;

/**
 * Delivers outbox rows (NT-2): claims a batch with FOR UPDATE SKIP LOCKED so several workers never send the
 * same email, sends outside the DB transaction, then records SENT (scrubbing secrets, NT-7) or schedules a retry.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private queue: Promise<number> = Promise.resolve(0);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    @Inject(OUTBOX_WORKER_OPTIONS) private readonly options: OutboxWorkerOptions,
  ) {}

  onModuleInit(): void {
    if (this.options.autoStart) this.timer = setInterval(() => void this.kick(), this.options.intervalMs);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Runs a batch now, after any run in progress. Used on priority enqueue (login codes) and by the timer. */
  kick(): Promise<number> {
    this.queue = this.queue
      .catch(() => 0)
      .then(() => this.runOnce())
      .catch((error: unknown) => {
        this.logger.error(error);
        return 0;
      });
    return this.queue;
  }

  /** Sends one batch; returns how many rows were attempted. */
  async runOnce(): Promise<number> {
    const rows = await this.claim();
    for (const row of rows) await this.deliver(row);
    return rows.length;
  }

  private async claim(): Promise<EmailOutbox[]> {
    const now = this.clock.now();
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
    const rows = await this.prisma.$queryRaw<EmailOutbox[]>(Prisma.sql`
      UPDATE "EmailOutbox" SET "status" = 'SENDING'::"EmailStatus", "lockedAt" = ${utc(now)}
      WHERE "id" IN (
        SELECT "id" FROM "EmailOutbox"
        WHERE ("status" = 'PENDING'::"EmailStatus" AND "sendAfter" <= ${utc(now)})
           OR ("status" = 'SENDING'::"EmailStatus" AND "lockedAt" < ${utc(staleBefore)})
        ORDER BY "priority" DESC, "createdAt" ASC
        LIMIT ${this.options.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`);
    return rows.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());
  }

  private async deliver(row: EmailOutbox): Promise<void> {
    try {
      if (!isTemplateName(row.template)) throw new Error(`Unknown email template: ${row.template}`);
      const email = renderEmail(row.template, row.payload as never);
      await this.mailer.send({ to: row.to, subject: email.subject, html: email.html, text: email.text });
      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: EmailStatus.SENT,
          sentAt: this.clock.now(),
          lockedAt: null,
          lastError: null,
          payload: scrub(row.payload, email.secretFields),
        },
      });
    } catch (error) {
      const next = afterSendFailure(row.attempts, this.clock.now());
      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: { ...next, lockedAt: null, lastError: (error as Error).message.slice(0, 500) },
      });
      // Log the row id only: recipients and payloads are personal data / secrets.
      this.logger.warn(`Email ${row.id} failed (attempt ${next.attempts}, ${next.status})`);
    }
  }
}

/**
 * Prisma stores DateTime as UTC in `timestamp` (no time zone) columns. In raw SQL a JS Date would be converted
 * using the DB session time zone (IST on dev machines), so convert explicitly to a UTC timestamp.
 */
function utc(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

function scrub(payload: Prisma.JsonValue, secretFields: string[]): Prisma.InputJsonObject {
  const copy = { ...(payload as Prisma.JsonObject) };
  for (const field of secretFields) delete copy[field];
  return copy as Prisma.InputJsonObject;
}
