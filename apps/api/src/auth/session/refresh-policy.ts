export interface RefreshTokenState {
  familyId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * Rotating refresh tokens with reuse detection (AU-6): presenting a token that was already rotated (revoked)
 * means it was stolen or replayed, so the caller must revoke the whole family.
 */
export type RefreshVerdict = 'valid' | 'reuse' | 'expired' | 'invalid';

export function evaluateRefreshToken(token: RefreshTokenState | null, now: Date): RefreshVerdict {
  if (!token) return 'invalid';
  if (token.revokedAt) return 'reuse';
  if (now.getTime() >= token.expiresAt.getTime()) return 'expired';
  return 'valid';
}
