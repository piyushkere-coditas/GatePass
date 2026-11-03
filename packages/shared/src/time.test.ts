import { describe, expect, it } from 'vitest';
import { formatIstDateTime, toIstDate } from './time';

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

describe('formatIstDateTime', () => {
  it.each([
    ['2026-11-02T05:30:00Z', '02 Nov 2026, 11:00 AM IST'],
    ['2026-11-02T06:30:00Z', '02 Nov 2026, 12:00 PM IST'],
    ['2026-11-01T18:30:00Z', '02 Nov 2026, 12:00 AM IST'],
    ['2026-11-02T13:05:00Z', '02 Nov 2026, 6:35 PM IST'],
  ])('[NT-U-03] %s -> %s', (instant, text) => {
    expect(formatIstDateTime(new Date(instant))).toBe(text);
  });
});
