import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error';
import { type FieldError, ValidationFailedException } from './zod-validation.pipe';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  instance: string;
  errors?: FieldError[];
  details?: Record<string, unknown>;
}

/** Every error leaves the API as RFC 7807 application/problem+json with a stable `code` (spec 00 §4). */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const problem = this.toProblem(exception, req.path);

    if (problem.status >= 500) this.logger.error(exception);
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    const build = (status: number, code: string, title: string, extra: Partial<ProblemDetails> = {}) => ({
      type: `https://gatepass.coditas.com/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      code,
      instance,
      ...extra,
    });

    if (exception instanceof DomainError) {
      return build(
        exception.httpStatus,
        exception.code,
        exception.message,
        exception.details ? { details: exception.details } : {},
      );
    }
    if (exception instanceof ValidationFailedException) {
      return build(400, 'VALIDATION_FAILED', 'Validation failed', { errors: exception.errors });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return build(status, CODE_BY_STATUS[status] ?? 'HTTP_ERROR', exception.message);
    }
    return build(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Internal server error');
  }
}
