import { type DynamicModule, Module } from '@nestjs/common';
import { Mailer, SmtpMailer } from './mailer';
import { OutboxService } from './outbox.service';
import { OUTBOX_WORKER_OPTIONS, OutboxWorker } from './outbox.worker';

@Module({})
export class NotificationsModule {
  static forEnv(nodeEnv: string): DynamicModule {
    return {
      module: NotificationsModule,
      global: true,
      providers: [
        OutboxService,
        OutboxWorker,
        {
          provide: Mailer,
          useFactory: () =>
            new SmtpMailer({
              host: process.env.SMTP_HOST ?? 'localhost',
              port: Number(process.env.SMTP_PORT ?? 1025),
              from: process.env.SMTP_FROM ?? 'Coditas Gate Pass <gatepass@coditas.com>',
              user: process.env.SMTP_USER || undefined,
              pass: process.env.SMTP_PASS || undefined,
            }),
        },
        {
          provide: OUTBOX_WORKER_OPTIONS,
          // Tests drive the worker explicitly (runOnce/kick); everywhere else it polls every 15 s (NT-2).
          useValue: { intervalMs: 15_000, batchSize: 20, autoStart: nodeEnv !== 'test' },
        },
      ],
      exports: [OutboxService, OutboxWorker, Mailer],
    };
  }
}
