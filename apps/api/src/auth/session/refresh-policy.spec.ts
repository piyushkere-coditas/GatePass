import { evaluateRefreshToken } from './refresh-policy';

const NOW = new Date('2026-11-02T04:30:00Z');
const token = (overrides: Partial<{ revokedAt: Date | null; expiresAt: Date }> = {}) => ({
  familyId: 'fam-1',
  revokedAt: null,
  expiresAt: new Date('2026-11-02T12:30:00Z'),
  ...overrides,
});

describe('evaluateRefreshToken', () => {
  it('[AU-U-06] a current, unexpired token may be rotated', () => {
    expect(evaluateRefreshToken(token(), NOW)).toBe('valid');
  });

  it('[AU-U-06] reusing an already-rotated token is reuse: the whole family must be revoked', () => {
    expect(evaluateRefreshToken(token({ revokedAt: new Date('2026-11-02T04:00:00Z') }), NOW)).toBe('reuse');
  });

  it('[AU-U-06] an expired or unknown token is rejected', () => {
    expect(evaluateRefreshToken(token({ expiresAt: NOW }), NOW)).toBe('expired');
    expect(evaluateRefreshToken(null, NOW)).toBe('invalid');
  });
});
