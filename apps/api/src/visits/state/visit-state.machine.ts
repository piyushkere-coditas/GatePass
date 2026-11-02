import {
  Role,
  TRANSITIONS,
  VisitAction,
  VisitStatus,
  canTransition,
  toIstDate,
  type VisitType,
} from '@gatepass/shared';
import { DomainError } from '../../common/domain-error';

/**
 * Pure visit state machine (spec 00 §3). Decides whether a transition is allowed and what it changes.
 * Persistence, optimistic locking and event publishing live in VisitStateService.
 */

export interface Actor {
  id: string;
  role: Role;
}

/** The fields of a visit the state machine needs. `visitDate` is the IST calendar date (YYYY-MM-DD). */
export interface VisitSnapshot {
  id: string;
  type: VisitType;
  status: VisitStatus;
  hostId: string;
  visitDate: string;
  escalatedAt: Date | null;
}

export interface TransitionPayload {
  visitorPhotoKey?: string;
  idPhotoKey?: string;
  reason?: string | null;
}

export interface TransitionInput {
  visit: VisitSnapshot;
  action: VisitAction;
  /** null = system job (only allowed for EXPIRE). */
  actor: Actor | null;
  payload?: TransitionPayload;
  now: Date;
}

export interface VisitPatch {
  status?: VisitStatus;
  checkedInAt?: Date;
  checkedInById?: string;
  visitorPhotoKey?: string;
  idPhotoKey?: string;
  meetingOverAt?: Date;
  meetingOverById?: string;
  checkedOutAt?: Date;
  checkedOutById?: string;
  forcedCheckoutReason?: string | null;
  cancelledAt?: Date;
  cancelReason?: string | null;
  decidedById?: string | null;
  decidedAt?: Date;
  rejectionReason?: string | null;
}

export type VisitEventAction =
  | 'EDITED'
  | 'CANCELLED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'CHECKED_IN'
  | 'MEETING_OVER'
  | 'CHECKED_OUT'
  | 'FORCE_CHECKED_OUT';

export type DomainEventName =
  | 'visit.edited'
  | 'visit.cancelled'
  | 'visit.approved'
  | 'visit.rejected'
  | 'visit.withdrawn'
  | 'visit.expired'
  | 'visit.checked_in'
  | 'visit.meeting_over'
  | 'visit.checked_out'
  | 'visit.force_checked_out';

export interface TransitionResult {
  toStatus: VisitStatus;
  patch: VisitPatch;
  event: {
    action: VisitEventAction;
    fromStatus: VisitStatus;
    toStatus: VisitStatus;
    actorId: string | null;
    note: string | null;
  };
  domainEvent: DomainEventName;
}

export const MIN_FORCED_CHECKOUT_REASON = 5;
export const WITHDRAWN_NOTE = 'Withdrawn by security';
export const EXPIRED_NOTE = 'Expired';

export function decideTransition(input: TransitionInput): TransitionResult {
  const { visit, action, actor, payload = {}, now } = input;

  if (!canTransition(visit.status, action)) {
    throw new DomainError('VISIT_INVALID_TRANSITION', `Cannot ${action} a visit that is ${visit.status}`);
  }
  authorize(visit, action, actor);

  const toStatus = TRANSITIONS[action].to;
  const actorId = actor?.id ?? null;
  const reason = cleanText(payload.reason);
  const result = (
    patch: VisitPatch,
    eventAction: VisitEventAction,
    domainEvent: DomainEventName,
    note: string | null = null,
  ) => ({
    toStatus,
    patch,
    event: { action: eventAction, fromStatus: visit.status, toStatus, actorId, note },
    domainEvent,
  });

  switch (action) {
    case VisitAction.CHECK_IN: {
      if (visit.visitDate !== toIstDate(now)) {
        throw new DomainError('VISIT_NOT_TODAY', `Visit is scheduled for ${visit.visitDate}`);
      }
      const visitorPhotoKey = cleanText(payload.visitorPhotoKey);
      const idPhotoKey = cleanText(payload.idPhotoKey);
      if (!visitorPhotoKey || !idPhotoKey) {
        throw new DomainError('PHOTOS_REQUIRED', 'Visitor photo and ID photo are both required');
      }
      return result(
        { status: toStatus, checkedInAt: now, checkedInById: actorId!, visitorPhotoKey, idPhotoKey },
        'CHECKED_IN',
        'visit.checked_in',
      );
    }

    case VisitAction.MEETING_OVER:
      return result(
        { status: toStatus, meetingOverAt: now, meetingOverById: actorId! },
        'MEETING_OVER',
        'visit.meeting_over',
      );

    case VisitAction.CHECK_OUT: {
      const forced = visit.status === VisitStatus.CHECKED_IN;
      if (forced && (!reason || reason.length < MIN_FORCED_CHECKOUT_REASON)) {
        throw new DomainError(
          'REASON_REQUIRED',
          `A reason of at least ${MIN_FORCED_CHECKOUT_REASON} characters is required when the meeting is not over`,
        );
      }
      const patch = {
        status: toStatus,
        checkedOutAt: now,
        checkedOutById: actorId!,
        forcedCheckoutReason: forced ? reason : null,
      };
      return forced
        ? result(patch, 'FORCE_CHECKED_OUT', 'visit.force_checked_out', reason)
        : result(patch, 'CHECKED_OUT', 'visit.checked_out');
    }

    case VisitAction.CANCEL:
      return result(
        { status: toStatus, cancelledAt: now, cancelReason: reason },
        'CANCELLED',
        'visit.cancelled',
        reason,
      );

    case VisitAction.EDIT:
      return result({}, 'EDITED', 'visit.edited');

    case VisitAction.APPROVE:
      return result({ status: toStatus, decidedById: actorId, decidedAt: now }, 'APPROVED', 'visit.approved');

    case VisitAction.REJECT:
      return result(
        { status: toStatus, decidedById: actorId, decidedAt: now, rejectionReason: reason },
        'REJECTED',
        'visit.rejected',
        reason,
      );

    case VisitAction.WITHDRAW:
      return result(
        { status: toStatus, decidedById: actorId, decidedAt: now, rejectionReason: WITHDRAWN_NOTE },
        'WITHDRAWN',
        'visit.withdrawn',
        WITHDRAWN_NOTE,
      );

    case VisitAction.EXPIRE:
      return result(
        { status: toStatus, decidedById: null, decidedAt: now, rejectionReason: EXPIRED_NOTE },
        'EXPIRED',
        'visit.expired',
        EXPIRED_NOTE,
      );
  }
}

function authorize(visit: VisitSnapshot, action: VisitAction, actor: Actor | null): void {
  if (action === VisitAction.EXPIRE) {
    if (actor !== null) throw new DomainError('FORBIDDEN', 'Only the system can expire a request');
    return;
  }
  if (!actor) throw new DomainError('FORBIDDEN', 'An authenticated user is required');

  const isHost = actor.id === visit.hostId;
  const isAdmin = actor.role === Role.ADMIN;
  const isSecurity = actor.role === Role.SECURITY;

  const allowed = (() => {
    switch (action) {
      case VisitAction.CHECK_IN:
      case VisitAction.CHECK_OUT:
      case VisitAction.WITHDRAW:
        return isSecurity;
      case VisitAction.MEETING_OVER:
      case VisitAction.CANCEL:
        return isHost || isAdmin;
      case VisitAction.EDIT:
        return isHost;
      case VisitAction.APPROVE:
      case VisitAction.REJECT:
        if (isHost) return true;
        if (isAdmin && !visit.escalatedAt) {
          throw new DomainError('NOT_ESCALATED', 'Admins can decide only after the request is escalated');
        }
        return isAdmin;
    }
  })();

  if (!allowed) throw new DomainError('FORBIDDEN', `Not allowed to ${action} this visit`);
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
