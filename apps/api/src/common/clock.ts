/** Injectable time source. Production code never calls `new Date()` directly (TESTING.md §3). */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Used when NODE_ENV=test: E2E and integration tests can pin or move time (POST /__test/clock). */
export class AdjustableClock extends Clock {
  private fixed: Date | null = null;
  private offsetMs = 0;

  now(): Date {
    return this.fixed ? new Date(this.fixed.getTime() + this.offsetMs) : new Date(Date.now() + this.offsetMs);
  }

  set(instant: Date): void {
    this.fixed = new Date(instant);
    this.offsetMs = 0;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.fixed = null;
    this.offsetMs = 0;
  }
}
