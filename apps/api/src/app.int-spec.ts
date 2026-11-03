import { Writable } from 'node:stream';
import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { normalizePhone, visitorNameSchema } from '@gatepass/shared';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Public } from './auth/guards/public.decorator';
import { DomainError } from './common/domain-error';
import { ZodValidationPipe } from './common/zod-validation.pipe';
import { PrismaService } from './prisma/prisma.service';

const APP_BASE_URL = 'http://localhost:5173';

const probeSchema = z.object({
  fullName: visitorNameSchema,
  phone: z.string().refine((p) => normalizePhone(p) !== null, 'Invalid phone number'),
  durationMin: z.number().int().min(15),
});

/** Throwaway endpoints that exercise the cross-cutting HTTP behaviour before real features exist. */
@Public()
@Controller('probe')
class ProbeController {
  @Post('transition')
  transition(): never {
    throw new DomainError('VISIT_INVALID_TRANSITION', 'Cannot CHECK_IN a visit that is CHECKED_OUT');
  }

  @Post('validate')
  validate(@Body(new ZodValidationPipe(probeSchema)) body: z.infer<typeof probeSchema>) {
    return body;
  }

  @Get('items/:id')
  item(@Param('id', ParseUUIDPipe) id: string) {
    return { id };
  }

  @Get('echo')
  echo(@Query('phone') _phone: string) {
    return { ok: true };
  }
}

async function createApp(opts: { nodeEnv?: string; logs?: string[]; prisma?: Partial<PrismaService> } = {}) {
  process.env.APP_BASE_URL = APP_BASE_URL;
  const logStream = opts.logs
    ? new Writable({
        write(chunk, _enc, cb) {
          opts.logs!.push(chunk.toString());
          cb();
        },
      })
    : undefined;
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot({ nodeEnv: opts.nodeEnv ?? 'test', logStream })],
    controllers: [ProbeController],
  });
  if (opts.prisma) builder = builder.overrideProvider(PrismaService).useValue(opts.prisma);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
  await app.init();
  return app;
}

describe('HTTP cross-cutting behaviour', () => {
  let app: INestApplication;
  const logs: string[] = [];

  beforeAll(async () => {
    app = await createApp({ logs });
  });
  afterAll(() => app.close());

  it('[SM-I-05] domain errors become problem+json with a stable code', async () => {
    const res = await request(app.getHttpServer()).post('/probe/transition');

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: expect.stringContaining('visit-invalid-transition'),
      title: expect.any(String),
      status: 409,
      code: 'VISIT_INVALID_TRANSITION',
      instance: '/probe/transition',
    });
  });

  it('[SM-I-07] GET /health reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('[SM-I-07] GET /health returns 503 when the database is down', async () => {
    const down = await createApp({
      prisma: {
        $queryRaw: (() =>
          Promise.reject(new Error('connection refused'))) as unknown as PrismaService['$queryRaw'],
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
      },
    });
    const res = await request(down.getHttpServer()).get('/health');
    await down.close();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'down' });
  });

  it('[SM-I-08] validation errors list every bad field', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/validate')
      .send({ fullName: 'a', phone: '12345', durationMin: 5 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'durationMin',
      'fullName',
      'phone',
    ]);
  });

  it('[SM-I-09] CORS is granted only to the web origin', async () => {
    const evil = await request(app.getHttpServer()).get('/health').set('Origin', 'https://evil.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const ours = await request(app.getHttpServer()).get('/health').set('Origin', APP_BASE_URL);
    expect(ours.headers['access-control-allow-origin']).toBe(APP_BASE_URL);
    expect(ours.headers['access-control-allow-credentials']).toBe('true');
  });

  it('[SM-I-10] security headers are present', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('[SM-I-11] logs carry a request id but never the phone number', async () => {
    logs.length = 0;
    await request(app.getHttpServer())
      .get('/probe/echo')
      .query({ phone: '+919876543210' })
      .set('x-request-id', 'req-123');

    const output = logs.join('\n');
    expect(output).toContain('req-123');
    expect(output).toContain('/probe/echo');
    expect(output).not.toContain('9876543210');
  });

  it('[SM-I-12] unknown routes and malformed UUIDs return problem+json', async () => {
    const missing = await request(app.getHttpServer()).get('/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const badId = await request(app.getHttpServer()).get('/probe/items/abc');
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('VALIDATION_FAILED');
  });

  it('[SM-I-13] test-only routes exist when NODE_ENV=test', async () => {
    const res = await request(app.getHttpServer())
      .post('/__test/clock')
      .send({ now: '2026-11-02T04:30:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.now).toBe('2026-11-02T04:30:00.000Z');
  });

  it('[SM-I-13] test-only routes are not registered in production', async () => {
    const prod = await createApp({ nodeEnv: 'production' });
    const res = await request(prod.getHttpServer()).post('/__test/clock').send({ reset: true });
    await prod.close();
    expect(res.status).toBe(404);
  });
});
