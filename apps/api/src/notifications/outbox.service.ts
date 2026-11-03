import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Clock } from '../common/clock';
import type { TemplateName, TemplatePayload } from './templates/registry';

export const OUTBOX_PRIORITY_NORMAL = 0;
export const OUTBOX_PRIORITY_HIGH = 10;

export interface OutboxItem<T extends TemplateName = TemplateName> {
  /** Idempotency key (NT-6): enqueueing the same key twice keeps one row. */
  dedupeKey: string;
  to: string;
  template: T;
  payload: TemplatePayload<T>;
  priority?: number;
}

type Db = Pick<Prisma.TransactionClient, 'emailOutbox'>;

/**
 * Transactional outbox (NT-1): pass the caller's transaction client so the email row commits or rolls back
 * together with the state change. Delivery happens later in OutboxWorker.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly clock: Clock) {}

  async enqueue<T extends TemplateName>(db: Db, item: OutboxItem<T>): Promise<void> {
    await db.emailOutbox.createMany({
      data: [
        {
          dedupeKey: item.dedupeKey,
          to: item.to,
          template: item.template,
          payload: item.payload as unknown as Prisma.InputJsonObject,
          priority: item.priority ?? OUTBOX_PRIORITY_NORMAL,
          sendAfter: this.clock.now(),
        },
      ],
      skipDuplicates: true,
    });
  }
}
