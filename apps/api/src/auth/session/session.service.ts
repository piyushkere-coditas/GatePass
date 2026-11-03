import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { Clock } from '../../common/clock';
import { DomainError } from '../../common/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { type UserProfile, toProfile } from '../../users/users.service';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config';
import { evaluateRefreshToken } from './refresh-policy';

export const ACCESS_TTL_MS = 15 * 60_000;
/** One shift. Rotated refresh tokens keep the session's original expiry (AU-6). */
export const SESSION_TTL_MS = 8 * 60 * 60_000;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface AccessClaims {
  sub: string;
  /** Session (refresh token family) id, so logout and reuse detection also end the access token. */
  sid: string;
}

type Db = Pick<Prisma.TransactionClient, 'refreshToken'>;

const unauthorized = () => new DomainError('UNAUTHORIZED', 'Sign in required');

/**
 * Sessions = a family of rotating refresh tokens (stored hashed) plus short-lived JWT access tokens.
 * Every request re-checks the session and the user's active flag and role in the database (AU-5, AU-7).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  start(db: Db, userId: string): Promise<SessionTokens> {
    return this.issue(db, userId, randomUUID(), new Date(this.clock.now().getTime() + SESSION_TTL_MS));
  }

  async authenticate(accessToken: string | undefined): Promise<UserProfile> {
    const claims = accessToken ? this.verifyAccess(accessToken, false) : null;
    if (!claims) throw unauthorized();
    const session = await this.prisma.refreshToken.findFirst({
      where: {
        familyId: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      select: { user: true },
    });
    if (!session?.user.isActive) throw unauthorized();
    return toProfile(session.user);
  }

  /** Swaps a refresh token for a new pair. A token presented twice revokes its whole session (AU-I-11). */
  async rotate(refreshToken: string | undefined): Promise<{ user: UserProfile; tokens: SessionTokens }> {
    if (!refreshToken) throw unauthorized();
    const now = this.clock.now();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    const verdict = evaluateRefreshToken(stored, now);
    if (!stored || verdict !== 'valid') {
      if (stored && verdict === 'reuse') await this.revokeFamily(stored.familyId);
      throw unauthorized();
    }
    if (!stored.user.isActive) throw unauthorized();

    const tokens = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      });
      // Lost a race with another use of the same token: treated as reuse below.
      if (count === 0) return null;
      return this.issue(tx, stored.userId, stored.familyId, stored.expiresAt);
    });
    if (!tokens) {
      await this.revokeFamily(stored.familyId);
      throw unauthorized();
    }
    return { user: toProfile(stored.user), tokens };
  }

  /** Logout (AU-9): revokes the session found from either cookie. Never touches visits. */
  async end(refreshToken: string | undefined, accessToken: string | undefined): Promise<void> {
    const stored = refreshToken
      ? await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } })
      : null;
    const familyId =
      stored?.familyId ?? (accessToken ? this.verifyAccess(accessToken, true)?.sid : undefined);
    if (familyId) await this.revokeFamily(familyId);
  }

  private async issue(db: Db, userId: string, familyId: string, expiresAt: Date): Promise<SessionTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    await db.refreshToken.create({ data: { userId, familyId, tokenHash: sha256(refreshToken), expiresAt } });
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const claims = { sub: userId, sid: familyId, iat, exp: iat + ACCESS_TTL_MS / 1000 };
    const accessToken = jwt.sign(claims, this.config.jwtSecret, { algorithm: 'HS256' });
    return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
  }

  private verifyAccess(token: string, ignoreExpiration: boolean): AccessClaims | null {
    try {
      const claims = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
        ignoreExpiration,
      });
      if (typeof claims === 'string' || typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
        return null;
      }
      return { sub: claims.sub, sid: claims.sid };
    } catch {
      return null;
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }
}

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
