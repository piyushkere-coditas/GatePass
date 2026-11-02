import { describe, expect, it } from 'vitest';
import { toIstDate } from './time';

describe('toIstDate', () => {
  it('[SM-U-19] maps UTC instants to the IST calendar date across the 18:30Z boundary', () => {
    expect(toIstDate(new Date('2026-11-01T18:29:59Z'))).toBe('2026-11-01');
    expect(toIstDate(new Date('2026-11-01T18:30:00Z'))).toBe('2026-11-02');
  });

  it('[SM-U-19] handles month and year rollover', () => {
    expect(toIstDate(new Date('2026-11-30T18:30:00Z'))).toBe('2026-12-01');
    expect(toIstDate(new Date('2026-12-31T18:30:00Z'))).toBe('2027-01-01');
  });
});
