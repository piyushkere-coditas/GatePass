import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type Status = 'up' | 'down';

/** GET /health — public liveness/readiness. Storage check is added with the media module (Phase 3). */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const db = await this.probe(() => this.prisma.$queryRaw`SELECT 1`);
    const ok = db === 'up';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({ status: ok ? 'ok' : 'error', db });
  }

  private async probe(fn: () => Promise<unknown>): Promise<Status> {
    try {
      await fn();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
