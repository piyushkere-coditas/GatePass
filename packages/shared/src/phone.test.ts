import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    '98765 43210',
    '+91-98765-43210',
    '009198765 43210',
    '919876543210',
    '09876543210',
    '(98765) 43210',
  ])('[SM-U-20] normalizes "%s" to +919876543210', (input) => {
    expect(normalizePhone(input)).toBe('+919876543210');
  });

  it('[SM-U-20] keeps valid international numbers in E.164', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it.each(['12345', 'abc', '', '   ', '+12', '55555 55555', '+91 98765'])(
    '[SM-U-20] rejects "%s"',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});
