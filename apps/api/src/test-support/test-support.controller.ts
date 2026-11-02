import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdjustableClock, Clock } from '../common/clock';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const clockSchema = z.object({
  now: z.string().datetime().optional(),
  advanceMs: z.number().int().optional(),
  reset: z.boolean().optional(),
});

/**
 * Test-only hooks for E2E/integration tests. The module is imported only when NODE_ENV=test (SM-I-13, AU-13).
 * /__test/login and /__test/jobs/:name are added with the auth (Phase 1) and job (Phase 4) modules.
 */
@Controller('__test')
export class TestSupportController {
  constructor(private readonly clock: Clock) {}

  @Post('clock')
  @HttpCode(200)
  setClock(@Body(new ZodValidationPipe(clockSchema)) body: z.infer<typeof clockSchema>): { now: string } {
    const clock = this.clock as AdjustableClock;
    if (body.reset) clock.reset();
    if (body.now) clock.set(new Date(body.now));
    if (body.advanceMs) clock.advance(body.advanceMs);
    return { now: clock.now().toISOString() };
  }
}
