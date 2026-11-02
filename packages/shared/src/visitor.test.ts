import { describe, expect, it } from 'vitest';
import { visitorNameSchema } from './visitor';

describe('visitorNameSchema', () => {
  it.each([
    ['a', false],
    ['ab', true],
    ['a'.repeat(100), true],
    ['a'.repeat(101), false],
    ['   ', false],
  ])('[SM-U-21] name of length %#  -> valid=%s', (name, valid) => {
    expect(visitorNameSchema.safeParse(name).success).toBe(valid);
  });

  it('[SM-U-21] trims surrounding whitespace', () => {
    expect(visitorNameSchema.parse('  Rahul Sharma  ')).toBe('Rahul Sharma');
  });

  it('[SM-U-21] counts length after trimming', () => {
    expect(visitorNameSchema.safeParse(' a ').success).toBe(false);
  });
});
