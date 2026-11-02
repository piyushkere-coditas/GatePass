import { TRANSITIONS, VisitAction, VisitStatus, VisitType } from '@gatepass/shared';
import { DomainError, type DomainErrorCode } from '../../common/domain-error';
import { NOW, TODAY, TOMORROW, actors, makeVisit, photos } from '../../../test/fixtures';
import { decideTransition, type TransitionInput } from './visit-state.machine';

const { alice, bob, carol, guard1 } = actors;

function expectError(input: TransitionInput, code: DomainErrorCode) {
  let thrown: unknown;
  try {
    decideTransition(input);
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(DomainError);
  expect((thrown as DomainError).code).toBe(code);
}

const ALL_STATUSES = Object.values(VisitStatus);
const ALL_ACTIONS = Object.values(VisitAction);

describe('decideTransition', () => {
  describe('check-in', () => {
    it('[SM-U-01] SCHEDULED planned visit today -> CHECKED_IN by security', () => {
      const result = decideTransition({
        visit: makeVisit(),
        action: VisitAction.CHECK_IN,
        actor: guard1,
        payload: photos,
        now: NOW,
      });
      expect(result.toStatus).toBe(VisitStatus.CHECKED_IN);
      expect(result.patch).toEqual({
        status: VisitStatus.CHECKED_IN,
        checkedInAt: NOW,
        checkedInById: guard1.id,
        visitorPhotoKey: photos.visitorPhotoKey,
        idPhotoKey: photos.idPhotoKey,
      });
    });

    it('[SM-U-02] APPROVED unplanned visit -> CHECKED_IN', () => {
      const result = decideTransition({
        visit: makeVisit({ type: VisitType.UNPLANNED, status: VisitStatus.APPROVED }),
        action: VisitAction.CHECK_IN,
        actor: guard1,
        payload: photos,
        now: NOW,
      });
      expect(result.toStatus).toBe(VisitStatus.CHECKED_IN);
    });

    it('[SM-U-03] PENDING_APPROVAL cannot be checked in', () => {
      expectError(
        {
          visit: makeVisit({ type: VisitType.UNPLANNED, status: VisitStatus.PENDING_APPROVAL }),
          action: VisitAction.CHECK_IN,
          actor: guard1,
          payload: photos,
          now: NOW,
        },
        'VISIT_INVALID_TRANSITION',
      );
    });

    it('[SM-U-16] visit dated tomorrow -> VISIT_NOT_TODAY', () => {
      expectError(
        {
          visit: makeVisit({ visitDate: TOMORROW }),
          action: VisitAction.CHECK_IN,
          actor: guard1,
          payload: photos,
          now: NOW,
        },
        'VISIT_NOT_TODAY',
      );
    });

    it('[SM-U-17] IST day boundary: 23:59 IST allowed, 00:00 IST next day rejected', () => {
      const visit = makeVisit({ visitDate: TODAY });
      const base = { visit, action: VisitAction.CHECK_IN, actor: guard1, payload: photos };
      expect(decideTransition({ ...base, now: new Date('2026-11-02T18:29:00Z') }).toStatus).toBe(
        VisitStatus.CHECKED_IN,
      );
      expectError({ ...base, now: new Date('2026-11-02T18:30:00Z') }, 'VISIT_NOT_TODAY');
    });

    it('[SM-U-23] both photos are required', () => {
      const base = { visit: makeVisit(), action: VisitAction.CHECK_IN, actor: guard1, now: NOW };
      expectError({ ...base, payload: {} }, 'PHOTOS_REQUIRED');
      expectError({ ...base, payload: { visitorPhotoKey: photos.visitorPhotoKey } }, 'PHOTOS_REQUIRED');
      expectError(
        { ...base, payload: { idPhotoKey: photos.idPhotoKey, visitorPhotoKey: '  ' } },
        'PHOTOS_REQUIRED',
      );
    });

    it('[SM-U-23] only security can check in', () => {
      for (const actor of [alice, carol]) {
        expectError(
          { visit: makeVisit(), action: VisitAction.CHECK_IN, actor, payload: photos, now: NOW },
          'FORBIDDEN',
        );
      }
    });
  });

  describe('meeting over', () => {
    const checkedIn = makeVisit({ status: VisitStatus.CHECKED_IN });

    it('[SM-U-04] host marks meeting over', () => {
      const result = decideTransition({
        visit: checkedIn,
        action: VisitAction.MEETING_OVER,
        actor: alice,
        now: NOW,
      });
      expect(result.patch).toEqual({
        status: VisitStatus.MEETING_OVER,
        meetingOverAt: NOW,
        meetingOverById: alice.id,
      });
    });

    it('[SM-U-05] another employee (or security) cannot mark meeting over', () => {
      for (const actor of [bob, guard1]) {
        expectError({ visit: checkedIn, action: VisitAction.MEETING_OVER, actor, now: NOW }, 'FORBIDDEN');
      }
    });

    it('[SM-U-06] admin can mark meeting over', () => {
      const result = decideTransition({
        visit: checkedIn,
        action: VisitAction.MEETING_OVER,
        actor: carol,
        now: NOW,
      });
      expect(result.toStatus).toBe(VisitStatus.MEETING_OVER);
    });
  });

  describe('check-out', () => {
    it('[SM-U-07] MEETING_OVER -> CHECKED_OUT without a reason', () => {
      const result = decideTransition({
        visit: makeVisit({ status: VisitStatus.MEETING_OVER }),
        action: VisitAction.CHECK_OUT,
        actor: guard1,
        now: NOW,
      });
      expect(result.patch).toEqual({
        status: VisitStatus.CHECKED_OUT,
        checkedOutAt: NOW,
        checkedOutById: guard1.id,
        forcedCheckoutReason: null,
      });
    });

    it('[SM-U-08] force check-out from CHECKED_IN requires a reason', () => {
      expectError(
        {
          visit: makeVisit({ status: VisitStatus.CHECKED_IN }),
          action: VisitAction.CHECK_OUT,
          actor: guard1,
          now: NOW,
        },
        'REASON_REQUIRED',
      );
    });

    it('[SM-U-09] reason must be at least 5 characters after trimming', () => {
      const base = {
        visit: makeVisit({ status: VisitStatus.CHECKED_IN }),
        action: VisitAction.CHECK_OUT,
        actor: guard1,
        now: NOW,
      };
      expectError({ ...base, payload: { reason: 'abcd' } }, 'REASON_REQUIRED');
      expectError({ ...base, payload: { reason: '  abcd  ' } }, 'REASON_REQUIRED');
      expect(decideTransition({ ...base, payload: { reason: 'abcde' } }).patch.forcedCheckoutReason).toBe(
        'abcde',
      );
      expect(decideTransition({ ...base, payload: { reason: '  abcde ' } }).patch.forcedCheckoutReason).toBe(
        'abcde',
      );
    });

    it('[SM-U-07] only security can check out', () => {
      expectError(
        {
          visit: makeVisit({ status: VisitStatus.MEETING_OVER }),
          action: VisitAction.CHECK_OUT,
          actor: alice,
          now: NOW,
        },
        'FORBIDDEN',
      );
    });
  });

  describe('cancel and edit', () => {
    it('[SM-U-10] host and admin can cancel; security and other employees cannot', () => {
      const base = {
        visit: makeVisit(),
        action: VisitAction.CANCEL,
        now: NOW,
        payload: { reason: 'Rescheduled' },
      };
      const byAlice = decideTransition({ ...base, actor: alice });
      expect(byAlice.patch).toEqual({
        status: VisitStatus.CANCELLED,
        cancelledAt: NOW,
        cancelReason: 'Rescheduled',
      });
      expect(decideTransition({ ...base, actor: carol }).toStatus).toBe(VisitStatus.CANCELLED);
      expectError({ ...base, actor: guard1 }, 'FORBIDDEN');
      expectError({ ...base, actor: bob }, 'FORBIDDEN');
    });

    it('[SM-U-10] cancel reason is optional', () => {
      const result = decideTransition({
        visit: makeVisit(),
        action: VisitAction.CANCEL,
        actor: alice,
        now: NOW,
      });
      expect(result.patch.cancelReason).toBeNull();
    });

    it('[SM-U-27] only the host can edit a scheduled visit', () => {
      const base = { visit: makeVisit(), action: VisitAction.EDIT, now: NOW };
      const result = decideTransition({ ...base, actor: alice });
      expect(result.toStatus).toBe(VisitStatus.SCHEDULED);
      expect(result.patch).toEqual({});
      for (const actor of [bob, carol, guard1]) expectError({ ...base, actor }, 'FORBIDDEN');
    });
  });

  describe('approvals', () => {
    const pending = makeVisit({ type: VisitType.UNPLANNED, status: VisitStatus.PENDING_APPROVAL });
    const escalated = { ...pending, escalatedAt: new Date('2026-11-02T04:20:00Z') };

    it('[SM-U-11] host approves any time; admin cannot before escalation', () => {
      const result = decideTransition({
        visit: pending,
        action: VisitAction.APPROVE,
        actor: alice,
        now: NOW,
      });
      expect(result.patch).toEqual({ status: VisitStatus.APPROVED, decidedById: alice.id, decidedAt: NOW });
      expectError({ visit: pending, action: VisitAction.APPROVE, actor: carol, now: NOW }, 'NOT_ESCALATED');
    });

    it('[SM-U-11] another employee or security cannot decide', () => {
      for (const action of [VisitAction.APPROVE, VisitAction.REJECT]) {
        expectError({ visit: escalated, action, actor: bob, now: NOW }, 'FORBIDDEN');
        expectError({ visit: escalated, action, actor: guard1, now: NOW }, 'FORBIDDEN');
      }
    });

    it('[SM-U-11] an admin who is the host can decide before escalation', () => {
      const hostedByCarol = { ...pending, hostId: carol.id };
      expect(
        decideTransition({ visit: hostedByCarol, action: VisitAction.APPROVE, actor: carol, now: NOW })
          .toStatus,
      ).toBe(VisitStatus.APPROVED);
    });

    it('[SM-U-12] admin approves after escalation', () => {
      const result = decideTransition({
        visit: escalated,
        action: VisitAction.APPROVE,
        actor: carol,
        now: NOW,
      });
      expect(result.patch).toEqual({ status: VisitStatus.APPROVED, decidedById: carol.id, decidedAt: NOW });
    });

    it('[SM-U-13] host rejects with a reason', () => {
      const result = decideTransition({
        visit: pending,
        action: VisitAction.REJECT,
        actor: alice,
        payload: { reason: 'Not expected' },
        now: NOW,
      });
      expect(result.patch).toEqual({
        status: VisitStatus.REJECTED,
        decidedById: alice.id,
        decidedAt: NOW,
        rejectionReason: 'Not expected',
      });
    });

    it('[SM-U-13] reject reason is optional', () => {
      const result = decideTransition({ visit: pending, action: VisitAction.REJECT, actor: alice, now: NOW });
      expect(result.patch.rejectionReason).toBeNull();
    });

    it('[SM-U-24] only security can withdraw a pending request', () => {
      const result = decideTransition({
        visit: pending,
        action: VisitAction.WITHDRAW,
        actor: actors.guard1,
        now: NOW,
      });
      expect(result.patch).toEqual({
        status: VisitStatus.REJECTED,
        decidedById: guard1.id,
        decidedAt: NOW,
        rejectionReason: 'Withdrawn by security',
      });
      expectError({ visit: pending, action: VisitAction.WITHDRAW, actor: alice, now: NOW }, 'FORBIDDEN');
    });

    it('[SM-U-25] only the system can expire a pending request', () => {
      const result = decideTransition({ visit: pending, action: VisitAction.EXPIRE, actor: null, now: NOW });
      expect(result.patch).toEqual({
        status: VisitStatus.REJECTED,
        decidedById: null,
        decidedAt: NOW,
        rejectionReason: 'Expired',
      });
      expectError({ visit: pending, action: VisitAction.EXPIRE, actor: carol, now: NOW }, 'FORBIDDEN');
    });

    it('[SM-U-25] human actions require an actor', () => {
      expectError({ visit: pending, action: VisitAction.APPROVE, actor: null, now: NOW }, 'FORBIDDEN');
    });
  });

  describe('transition table', () => {
    it.each([VisitStatus.CHECKED_OUT, VisitStatus.CANCELLED, VisitStatus.REJECTED])(
      '[SM-U-14] terminal status %s rejects every action',
      (status) => {
        for (const action of ALL_ACTIONS) {
          expectError(
            { visit: makeVisit({ status }), action, actor: carol, payload: photos, now: NOW },
            'VISIT_INVALID_TRANSITION',
          );
        }
      },
    );

    const illegalPairs = ALL_STATUSES.flatMap((status) =>
      ALL_ACTIONS.filter((action) => !TRANSITIONS[action].from.includes(status)).map(
        (action) => [status, action] as const,
      ),
    );

    it.each(illegalPairs)('[SM-U-15] %s + %s -> VISIT_INVALID_TRANSITION', (status, action) => {
      expectError(
        { visit: makeVisit({ status }), action, actor: carol, payload: photos, now: NOW },
        'VISIT_INVALID_TRANSITION',
      );
    });
  });

  describe('domain events and audit record', () => {
    const pending = makeVisit({ type: VisitType.UNPLANNED, status: VisitStatus.PENDING_APPROVAL });
    const cases: Array<[string, TransitionInput, string]> = [
      [
        'check-in',
        { visit: makeVisit(), action: VisitAction.CHECK_IN, actor: guard1, payload: photos, now: NOW },
        'visit.checked_in',
      ],
      [
        'meeting over',
        {
          visit: makeVisit({ status: VisitStatus.CHECKED_IN }),
          action: VisitAction.MEETING_OVER,
          actor: alice,
          now: NOW,
        },
        'visit.meeting_over',
      ],
      [
        'check-out',
        {
          visit: makeVisit({ status: VisitStatus.MEETING_OVER }),
          action: VisitAction.CHECK_OUT,
          actor: guard1,
          now: NOW,
        },
        'visit.checked_out',
      ],
      [
        'force check-out',
        {
          visit: makeVisit({ status: VisitStatus.CHECKED_IN }),
          action: VisitAction.CHECK_OUT,
          actor: guard1,
          payload: { reason: 'Left via side exit' },
          now: NOW,
        },
        'visit.force_checked_out',
      ],
      [
        'cancel',
        { visit: makeVisit(), action: VisitAction.CANCEL, actor: alice, now: NOW },
        'visit.cancelled',
      ],
      ['edit', { visit: makeVisit(), action: VisitAction.EDIT, actor: alice, now: NOW }, 'visit.edited'],
      ['approve', { visit: pending, action: VisitAction.APPROVE, actor: alice, now: NOW }, 'visit.approved'],
      ['reject', { visit: pending, action: VisitAction.REJECT, actor: alice, now: NOW }, 'visit.rejected'],
      [
        'withdraw',
        { visit: pending, action: VisitAction.WITHDRAW, actor: guard1, now: NOW },
        'visit.withdrawn',
      ],
      ['expire', { visit: pending, action: VisitAction.EXPIRE, actor: null, now: NOW }, 'visit.expired'],
    ];

    it.each(cases)('[SM-U-18] %s emits %s', (_label, input, eventName) => {
      expect(decideTransition(input).domainEvent).toBe(eventName);
    });

    it('[SM-U-26] audit event records from/to status, actor and note', () => {
      const result = decideTransition({
        visit: makeVisit({ status: VisitStatus.CHECKED_IN }),
        action: VisitAction.CHECK_OUT,
        actor: guard1,
        payload: { reason: 'Left via side exit' },
        now: NOW,
      });
      expect(result.event).toEqual({
        action: 'FORCE_CHECKED_OUT',
        fromStatus: VisitStatus.CHECKED_IN,
        toStatus: VisitStatus.CHECKED_OUT,
        actorId: guard1.id,
        note: 'Left via side exit',
      });
    });

    it('[SM-U-26] system actions record a null actor', () => {
      const result = decideTransition({ visit: pending, action: VisitAction.EXPIRE, actor: null, now: NOW });
      expect(result.event).toMatchObject({ action: 'EXPIRED', actorId: null, note: 'Expired' });
    });
  });
});
