import { MAX_SEND_ATTEMPTS, afterSendFailure } from './backoff';

const NOW = new Date('2026-11-02T04:30:00Z');
const plusMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe('afterSendFailure', () => {
  it.each([
    [0, 1, 1],
    [1, 2, 2],
    [2, 3, 4],
    [3, 4, 8],
  ])(
    '[NT-U-06] failure with %i previous attempts -> attempt %i, retry in %i min',
    (previous, attempts, minutes) => {
      expect(afterSendFailure(previous, NOW)).toEqual({
        status: 'PENDING',
        attempts,
        sendAfter: plusMinutes(minutes),
      });
    },
  );

  it('[NT-U-06] the 5th failure is final', () => {
    expect(MAX_SEND_ATTEMPTS).toBe(5);
    expect(afterSendFailure(4, NOW)).toEqual({ status: 'FAILED', attempts: 5 });
  });
});
