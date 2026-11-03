import { type DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AdjustableClock, Clock, SystemClock } from './common/clock';
import { loggerParams } from './common/logging';
import { HealthController } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { TestSupportController } from './test-support/test-support.controller';
import { VisitsModule } from './visits/visits.module';

export interface AppOptions {
  nodeEnv?: string;
  /** Lets tests capture log output (SM-I-11). */
  logStream?: DestinationStream;
}

@Global()
@Module({})
class ClockModule {
  static forEnv(nodeEnv: string): DynamicModule {
    const clock = nodeEnv === 'test' ? new AdjustableClock() : new SystemClock();
    return { module: ClockModule, providers: [{ provide: Clock, useValue: clock }], exports: [Clock] };
  }
}

@Module({})
export class AppModule {
  static forRoot(options: AppOptions = {}): DynamicModule {
    const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
    const isTest = nodeEnv === 'test';
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot(loggerParams(nodeEnv, options.logStream)),
        ClockModule.forEnv(nodeEnv),
        PrismaModule,
        NotificationsModule.forEnv(nodeEnv),
        VisitsModule,
      ],
      // Test-only routes are not registered at all outside NODE_ENV=test.
      controllers: [HealthController, ...(isTest ? [TestSupportController] : [])],
    };
  }
}
