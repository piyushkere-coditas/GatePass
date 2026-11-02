import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

/**
 * Structured JSON logs with a request id. No PII: query strings (e.g. ?phone=) and bodies are never logged,
 * cookies/authorization are redacted (SM-I-11).
 */
export function loggerParams(nodeEnv: string, stream?: DestinationStream): Params {
  const options = {
    level: nodeEnv === 'production' ? 'info' : 'debug',
    genReqId: (req: IncomingMessage) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    serializers: {
      req: (req: IncomingMessage & { id?: string }) => ({
        id: req.id,
        method: req.method,
        url: stripQuery(req.url),
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
    redact: ['req.headers.cookie', 'req.headers.authorization'],
    transport:
      nodeEnv === 'development' && !stream
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  };
  return { pinoHttp: stream ? [options, stream] : options };
}

function stripQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}
