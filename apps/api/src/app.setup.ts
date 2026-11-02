import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/problem-details.filter';

/** HTTP cross-cutting setup shared by main.ts and the integration tests (spec 00 §4). */
export function configureApp(app: INestApplication): INestApplication {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  // Array form: the header is only echoed for the allowed origin, never for others (SM-I-09).
  app.enableCors({ origin: [process.env.APP_BASE_URL ?? 'http://localhost:5173'], credentials: true });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
