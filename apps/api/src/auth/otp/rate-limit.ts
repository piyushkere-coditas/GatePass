export interface RateLimit {
  max: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Sliding window over previous request times (AU-15). A request exactly `windowMs` old no longer counts. */
export function checkRateLimit(previous: Date[], now: Date, limit: RateLimit): RateLimitResult {
  const windowStart = now.getTime() - limit.windowMs;
  const inWindow = previous.map((d) => d.getTime()).filter((t) => t > windowStart);
  if (inWindow.length < limit.max) return { allowed: true };
  const oldest = Math.min(...inWindow);
  return { allowed: false, retryAfterSeconds: Math.ceil((oldest - windowStart) / 1000) };
}
