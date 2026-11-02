import { Inject, Injectable, Optional } from '@nestjs/common';
import type { VisitAction } from '@gatepass/shared';
import type { Prisma, Visit } from '@prisma/client';
import { Clock } from '../../common/clock';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type Actor,
  type TransitionPayload,
  type TransitionResult,
  type VisitSnapshot,
  decideTransition,
} from './visit-state.machine';

/** Runs inside the transition's DB transaction (e.g. outbox writer, NT-1). A throw rolls everything back. */
export interface TransitionHook {
  afterTransition(tx: Prisma.TransactionClient, visit: Visit, result: TransitionResult): Promise<void>;
}
export const TRANSITION_HOOKS = Symbol('TRANSITION_HOOKS');

export interface TransitionCommand {
  visitId: string;
  action: VisitAction;
  actor: Actor | null;
  expectedVersion: number;
  payload?: TransitionPayload;
}

/**
 * The only way a visit changes status (spec 00 §3): validates via the state machine, applies the patch with
 * an optimistic-lock version check, and writes exactly one VisitEvent — all in one transaction.
 */
@Injectable()
export class VisitStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Optional() @Inject(TRANSITION_HOOKS) private readonly hooks: TransitionHook[] = [],
  ) {}

  transition(cmd: TransitionCommand): Promise<Visit> {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({ where: { id: cmd.visitId } });
      if (!visit) throw new DomainError('NOT_FOUND', 'Visit not found');
      if (visit.version !== cmd.expectedVersion) throw stale();

      const result = decideTransition({
        visit: toSnapshot(visit),
        action: cmd.action,
        actor: cmd.actor,
        payload: cmd.payload,
        now: this.clock.now(),
      });

      // The version predicate makes a concurrent writer that read the same version lose (SM-I-03).
      const { count } = await tx.visit.updateMany({
        where: { id: visit.id, version: cmd.expectedVersion },
        data: { ...result.patch, version: { increment: 1 } },
      });
      if (count === 0) throw stale();

      await tx.visitEvent.create({ data: { visitId: visit.id, ...result.event } });

      const updated = await tx.visit.findUniqueOrThrow({ where: { id: visit.id } });
      for (const hook of this.hooks) await hook.afterTransition(tx, updated, result);
      return updated;
    });
  }
}

export function toSnapshot(visit: Visit): VisitSnapshot {
  return {
    id: visit.id,
    type: visit.type,
    status: visit.status,
    hostId: visit.hostId,
    visitDate: visit.visitDate.toISOString().slice(0, 10),
    escalatedAt: visit.escalatedAt,
  };
}

function stale(): DomainError {
  return new DomainError('VISIT_STALE', 'This visit was updated by someone else. Reload and try again.');
}
