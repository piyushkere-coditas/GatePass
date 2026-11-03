import * as crypto from 'node:crypto';
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  generateCode,
  hashCode,
  isExpired,
  registerFailedAttempt,
  verifyCode,
} from './otp-code';

// Pass-through spies: real crypto behaviour, but calls are observable.
jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomInt: jest.fn(actual.randomInt),
    timingSafeEqual: jest.fn(actual.timingSafeEqual),
  };
});

const SECRET = 'test-otp-secret';

describe('one-time codes', () => {
  it('[AU-U-10] always 6 digits, zero-padded', () => {
    expect(generateCode(() => 42)).toBe('000042');
    expect(generateCode(() => 999_999)).toBe('999999');
    for (let i = 0; i < 10_000; i += 1) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('[AU-U-10] uses a cryptographically secure source and is roughly uniform', () => {
    const firstDigits = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i += 1) firstDigits[Number(generateCode()[0])] += 1;
    expect(crypto.randomInt).toHaveBeenCalledWith(0, 1_000_000);
    // Expected ~1000 each; none more than 25% above that.
    for (const count of firstDigits) expect(count).toBeLessThan(1250);
  });

  it('[AU-U-11] stores a keyed hash, never the code, and verifies in constant time', () => {
    const hash = hashCode('123456', SECRET);
    expect(hash).not.toContain('123456');
    expect(hash).toBe(hashCode('123456', SECRET));
    expect(hash).not.toBe(hashCode('123456', 'other-secret'));

    expect(verifyCode('123456', hash, SECRET)).toBe(true);
    expect(verifyCode('123457', hash, SECRET)).toBe(false);
    expect(crypto.timingSafeEqual).toHaveBeenCalled();
  });

  it('[AU-U-11] malformed input never verifies', () => {
    const hash = hashCode('123456', SECRET);
    expect(verifyCode('', hash, SECRET)).toBe(false);
    expect(verifyCode('123456', 'not-a-hash', SECRET)).toBe(false);
  });

  it('[AU-U-12] expires exactly 10 minutes after issue', () => {
    expect(CODE_TTL_MS).toBe(10 * 60_000);
    const expiresAt = new Date('2026-11-02T04:40:00Z'); // issued 10:00 IST
    expect(isExpired(expiresAt, new Date('2026-11-02T04:39:59Z'))).toBe(false);
    expect(isExpired(expiresAt, new Date('2026-11-02T04:40:00Z'))).toBe(true);
  });

  it('[AU-U-13] the 5th wrong attempt invalidates the code', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    expect(registerFailedAttempt(3)).toEqual({ attempts: 4, invalidate: false });
    expect(registerFailedAttempt(4)).toEqual({ attempts: 5, invalidate: true });
  });
});
