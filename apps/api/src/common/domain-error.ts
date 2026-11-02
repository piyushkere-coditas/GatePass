/** Business-rule failures. Mapped to RFC 7807 problem+json responses by the HTTP layer. */
export const DOMAIN_ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  REASON_REQUIRED: 400,
  PHOTOS_REQUIRED: 400,
  FORBIDDEN: 403,
  NOT_ESCALATED: 403,
  NOT_FOUND: 404,
  VISIT_INVALID_TRANSITION: 409,
  VISIT_STALE: 409,
  VISIT_NOT_TODAY: 409,
  ALREADY_DECIDED: 409,
} as const;

export type DomainErrorCode = keyof typeof DOMAIN_ERROR_STATUS;

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get httpStatus(): number {
    return DOMAIN_ERROR_STATUS[this.code];
  }
}
