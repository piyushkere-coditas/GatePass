import { describe, expect, it } from 'vitest';
import { VisitStatus } from './enums';
import { TRANSITIONS, VisitAction, canTransition } from './transitions';

describe('TRANSITIONS', () => {
  // Written out independently from spec 00 §3 so a wrong table entry fails here
  // (the API's SM-U-15 derives its illegal pairs from the table itself).
  it('[SM-U-28] matches the spec 00 §3 transition table exactly', () => {
    expect(TRANSITIONS).toEqual({
      EDIT: { from: ['SCHEDULED'], to: 'SCHEDULED' },
      CANCEL: { from: ['SCHEDULED'], to: 'CANCELLED' },
      APPROVE: { from: ['PENDING_APPROVAL'], to: 'APPROVED' },
      REJECT: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
      WITHDRAW: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
      EXPIRE: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
      CHECK_IN: { from: ['SCHEDULED', 'APPROVED'], to: 'CHECKED_IN' },
      MEETING_OVER: { from: ['CHECKED_IN'], to: 'MEETING_OVER' },
      CHECK_OUT: { from: ['CHECKED_IN', 'MEETING_OVER'], to: 'CHECKED_OUT' },
    });
  });

  it('[SM-U-28] canTransition reflects the table', () => {
    expect(canTransition(VisitStatus.APPROVED, VisitAction.CHECK_IN)).toBe(true);
    expect(canTransition(VisitStatus.PENDING_APPROVAL, VisitAction.CHECK_IN)).toBe(false);
    expect(canTransition(VisitStatus.CHECKED_OUT, VisitAction.CHECK_OUT)).toBe(false);
  });

  it('[SM-U-28] terminal statuses have no outgoing transitions', () => {
    const sources = new Set(Object.values(TRANSITIONS).flatMap((t) => t.from));
    for (const terminal of [VisitStatus.CHECKED_OUT, VisitStatus.CANCELLED, VisitStatus.REJECTED]) {
      expect(sources.has(terminal)).toBe(false);
    }
  });
});
