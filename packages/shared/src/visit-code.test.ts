import { describe, expect, it } from 'vitest';
import { formatVisitCode } from './visit-code';

describe('formatVisitCode', () => {
  it('[SM-U-22] formats GP-YYYYMMDD-NNNN with zero padding', () => {
    expect(formatVisitCode('2026-11-02', 7)).toBe('GP-20261102-0007');
  });

  it('[SM-U-22] does not truncate sequences above 9999', () => {
    expect(formatVisitCode('2026-11-02', 10000)).toBe('GP-20261102-10000');
  });

  it('[SM-U-22] rejects invalid input', () => {
    expect(() => formatVisitCode('2026-11-02', 0)).toThrow();
    expect(() => formatVisitCode('02-11-2026', 1)).toThrow();
  });
});
