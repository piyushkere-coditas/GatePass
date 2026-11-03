import { Inject, Injectable } from '@nestjs/common';
import { isCoditasEmail, normalizeEmail } from '@gatepass/shared';
import type { User } from '@prisma/client';
import { Clock } from '../../common/clock';
import { DomainError } from '../../common/domain-error';
import { OUTBOX_PRIORITY_HIGH, OutboxService } from '../../notifications/outbox.service';
import { OutboxWorker } from '../../notifications/outbox.worker';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config';
import { SessionService, type SessionTokens } from '../session/session.service';
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  generateCode,
  hashCode,
  isExpired,
  registerFailedAttempt,
  verifyCode,
} from './otp-code';
import { type RateLimit, checkRateLimit } from './rate-limit';

const WINDOW_MS = 15 * 60_000;
export const PER_EMAIL_LIMIT: RateLimit = { max: 3, windowMs: WINDOW_MS };
export const PER_IP_LIMIT: RateLimit = { max: 20, windowMs: WINDOW_MS };

const invalidCode = () => new DomainError('INVALID_CODE', 'That code is invalid or expired.');

/** Email one-time-code sign-in (spec 01: AU-1, AU-7, AU-14..17). */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly outbox: OutboxService,
    private readonly worker: OutboxWorker,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /**
   * Issues a code and emails it at once. Unknown emails get a code (JIT sign-up); inactive users silently get
   * nothing, so the response never reveals whether an account exists (AU-16).
   */
  async request(rawEmail: string, ip: string | undefined): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!isCoditasEmail(email)) {
      throw new DomainError('DOMAIN_NOT_ALLOWED', 'Use your Coditas email (@coditas.com)');
    }
    const user = await this.prisma.user.findUnique({ where: { email }, select: { isActive: true } });
    if (user && !user.isActive) return;

    const now = this.clock.now();
    await this.enforceRateLimits(email, ip, now);

    const code = generateCode();
    await this.prisma.$transaction(async (tx) => {
      // Only the newest code is valid (AU-14).
      await tx.loginCode.updateMany({
        where: { email, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      const row = await tx.loginCode.create({
        data: {
          email,
          codeHash: hashCode(code, this.config.otpSecret),
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
          requestIp: ip ?? null,
          createdAt: now,
        },
      });
      await this.outbox.enqueue(tx, {
        dedupeKey: `login-code:${row.id}`,
        to: email,
        template: 'login-code',
        payload: { code },
        priority: OUTBOX_PRIORITY_HIGH,
      });
    });
    // Send now rather than on the next poll (AU-17); failures are retried by the outbox.
    void this.worker.kick();
  }

  /** Every failure is the same 401 INVALID_CODE (AU-16). */
  async verify(rawEmail: string, code: string): Promise<{ user: User; tokens: SessionTokens }> {
    const email = normalizeEmail(rawEmail);
    const now = this.clock.now();
    const row = await this.prisma.loginCode.findFirst({
      where: { email, consumedAt: null, invalidatedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || isExpired(row.expiresAt, now)) throw invalidCode();

    // Reserve the attempt before comparing, so parallel guesses can't exceed MAX_ATTEMPTS.
    const reserved = await this.prisma.loginCode.updateMany({
      where: { id: row.id, consumedAt: null, invalidatedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) throw invalidCode();

    if (!verifyCode(code, row.codeHash, this.config.otpSecret)) {
      if (registerFailedAttempt(row.attempts).invalidate) {
        await this.prisma.loginCode.updateMany({
          where: { id: row.id, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
      }
      throw invalidCode();
    }

    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.loginCode.updateMany({
        where: { id: row.id, consumedAt: null, invalidatedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count === 0) throw invalidCode();
      const user = await this.users.recordSignIn(tx, email);
      if (!user) throw invalidCode();
      return { user, tokens: await this.sessions.start(tx, user.id) };
    });
  }

  private async enforceRateLimits(email: string, ip: string | undefined, now: Date): Promise<void> {
    const since = new Date(now.getTime() - WINDOW_MS);
    const times = async (where: { email: string } | { requestIp: string }) =>
      (
        await this.prisma.loginCode.findMany({
          where: { ...where, createdAt: { gt: since } },
          select: { createdAt: true },
        })
      ).map((r) => r.createdAt);

    const checks = [checkRateLimit(await times({ email }), now, PER_EMAIL_LIMIT)];
    if (ip) checks.push(checkRateLimit(await times({ requestIp: ip }), now, PER_IP_LIMIT));
    for (const result of checks) {
      if (!result.allowed) {
        throw new DomainError('TOO_MANY_REQUESTS', 'Too many code requests. Try again later.', {
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
    }
  }
}
