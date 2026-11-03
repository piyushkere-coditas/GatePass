import * as crypto from 'node:crypto';

/** Email one-time-code rules (spec 01, AU-14). */
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;

/** 6 digits from a CSPRNG, zero-padded. `random` is injectable for tests only. */
export function generateCode(random: () => number = () => crypto.randomInt(0, 1_000_000)): string {
  return String(random()).padStart(6, '0');
}

/** Keyed hash (HMAC-SHA256): a leaked table can't be brute-forced without the secret. */
export function hashCode(code: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

export function verifyCode(code: string, storedHash: string, secret: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const actual = Buffer.from(hashCode(code, secret), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function registerFailedAttempt(attempts: number): { attempts: number; invalidate: boolean } {
  const next = attempts + 1;
  return { attempts: next, invalidate: next >= MAX_ATTEMPTS };
}
