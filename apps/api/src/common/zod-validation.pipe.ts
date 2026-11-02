import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

export interface FieldError {
  field: string;
  message: string;
}

/** Carries every field error so the problem filter can return them all at once (SM-I-08). */
export class ValidationFailedException extends BadRequestException {
  constructor(readonly errors: FieldError[]) {
    super('Validation failed');
  }
}

export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new ValidationFailedException(
      parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  }
}
