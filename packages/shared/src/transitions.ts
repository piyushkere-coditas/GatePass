import { VisitStatus } from './enums';

/** Actions that move a visit through its lifecycle (spec 00 §3). */
export const VisitAction = {
  EDIT: 'EDIT',
  CANCEL: 'CANCEL',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  WITHDRAW: 'WITHDRAW',
  EXPIRE: 'EXPIRE',
  CHECK_IN: 'CHECK_IN',
  MEETING_OVER: 'MEETING_OVER',
  CHECK_OUT: 'CHECK_OUT',
} as const;
export type VisitAction = (typeof VisitAction)[keyof typeof VisitAction];

type Rule = { from: readonly VisitStatus[]; to: VisitStatus };

/** Single source of truth for legal status changes. Permissions are enforced by the API state machine. */
export const TRANSITIONS: Readonly<Record<VisitAction, Rule>> = {
  EDIT: { from: [VisitStatus.SCHEDULED], to: VisitStatus.SCHEDULED },
  CANCEL: { from: [VisitStatus.SCHEDULED], to: VisitStatus.CANCELLED },
  APPROVE: { from: [VisitStatus.PENDING_APPROVAL], to: VisitStatus.APPROVED },
  REJECT: { from: [VisitStatus.PENDING_APPROVAL], to: VisitStatus.REJECTED },
  WITHDRAW: { from: [VisitStatus.PENDING_APPROVAL], to: VisitStatus.REJECTED },
  EXPIRE: { from: [VisitStatus.PENDING_APPROVAL], to: VisitStatus.REJECTED },
  CHECK_IN: { from: [VisitStatus.SCHEDULED, VisitStatus.APPROVED], to: VisitStatus.CHECKED_IN },
  MEETING_OVER: { from: [VisitStatus.CHECKED_IN], to: VisitStatus.MEETING_OVER },
  CHECK_OUT: { from: [VisitStatus.CHECKED_IN, VisitStatus.MEETING_OVER], to: VisitStatus.CHECKED_OUT },
};

export function canTransition(status: VisitStatus, action: VisitAction): boolean {
  return TRANSITIONS[action].from.includes(status);
}
