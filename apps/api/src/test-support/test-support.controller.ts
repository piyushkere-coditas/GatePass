import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { coditasEmailSchema } from '@gatepass/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/guards/public.decorator';
import { setSessionCookies } from '../auth/session/cookies';
import { SessionService } from '../auth/session/session.service';
import { AdjustableClock, Clock } from '../common/clock';
import { DomainError } from '../common/domain-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { type UserProfile, UsersService, toProfile } from '../users/users.service';

const clockSchema = z.object({
  now: z.string().datetime().optional(),
  advanceMs: z.number().int().optional(),
  reset: z.boolean().optional(),
});

const loginSchema = z.object({ email: coditasEmailSchema });

/**
 * Test-only hooks for E2E/integration tests. The controller is registered only when NODE_ENV=test (SM-I-13, AU-13).
 * /__test/jobs/:name is added with the job module (Phase 4).
 */
@Public()
@Controller('__test')
export class TestSupportController {
  constructor(
    private readonly clock: Clock,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  @Post('clock')
  @HttpCode(200)
  setClock(@Body(new ZodValidationPipe(clockSchema)) body: z.infer<typeof clockSchema>): { now: string } {
    const clock = this.clock as AdjustableClock;
    if (body.reset) clock.reset();
    if (body.now) clock.set(new Date(body.now));
    if (body.advanceMs) clock.advance(body.advanceMs);
    return { now: clock.now().toISOString() };
  }

  /** Signs in without an emailed code, with the same provisioning rules as the real sign-in (AU-13). */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserProfile> {
    const { user, tokens } = await this.prisma.$transaction(async (tx) => {
      const signedIn = await this.users.recordSignIn(tx, body.email);
      if (!signedIn) throw new DomainError('UNAUTHORIZED', 'User is inactive');
      return { user: signedIn, tokens: await this.sessions.start(tx, signedIn.id) };
    });
    setSessionCookies(res, tokens);
    return toProfile(user);
  }
}
