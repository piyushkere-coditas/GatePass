import { checkRateLimit } from './rate-limit';

const at = (hhmmss: string) => new Date(`2026-11-02T${hhmmss}+05:30`);
const window = { max: 3, windowMs: 15 * 60_000 };

describe('checkRateLimit (sliding window)', () => {
  const previous = [at('10:00:00'), at('10:05:00'), at('10:10:00')];

  it('[AU-U-14] blocks the 4th request inside 15 minutes with retry-after', () => {
    expect(checkRateLimit(previous, at('10:14:59'), window)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('[AU-U-14] allows again once the oldest request leaves the window', () => {
    expect(checkRateLimit(previous, at('10:15:00'), window)).toEqual({ allowed: true });
    expect(checkRateLimit(previous, at('10:15:01'), window)).toEqual({ allowed: true });
  });

  it('[AU-U-14] allows when under the limit', () => {
    expect(checkRateLimit([], at('10:00:00'), window)).toEqual({ allowed: true });
    expect(checkRateLimit(previous.slice(1), at('10:11:00'), window)).toEqual({ allowed: true });
  });
});
