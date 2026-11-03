export const MAX_SEND_ATTEMPTS = 5;

export type AfterFailure =
  { status: 'PENDING'; attempts: number; sendAfter: Date } | { status: 'FAILED'; attempts: number };

/** Exponential retry: 1, 2, 4, 8 minutes, then FAILED on the 5th failure (NT-2). */
export function afterSendFailure(previousAttempts: number, now: Date): AfterFailure {
  const attempts = previousAttempts + 1;
  if (attempts >= MAX_SEND_ATTEMPTS) return { status: 'FAILED', attempts };
  return { status: 'PENDING', attempts, sendAfter: new Date(now.getTime() + 2 ** (attempts - 1) * 60_000) };
}
