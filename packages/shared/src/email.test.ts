import { describe, expect, it } from 'vitest';
import { coditasEmailSchema, defaultNameFromEmail, isCoditasEmail, normalizeEmail } from './email';

describe('Coditas email rules', () => {
  it.each(['alice@coditas.com', 'Alice@Coditas.COM', ' piyush.kere@coditas.com '])(
    '[AU-U-01] accepts %s',
    (email) => {
      expect(isCoditasEmail(email)).toBe(true);
    },
  );

  it.each([
    'x@gmail.com',
    'x@coditas.com.evil.io',
    'x@evil-coditas.com',
    'x@sub.coditas.com',
    'coditas.com',
    'x@coditas.com@evil.io',
    '@coditas.com',
    '',
  ])('[AU-U-02] rejects "%s"', (email) => {
    expect(isCoditasEmail(email)).toBe(false);
  });

  it.each([
    ['piyush.kere@coditas.com', 'Piyush Kere'],
    ['guard_1@coditas.com', 'Guard 1'],
    ['anne-marie.dsouza@coditas.com', 'Anne Marie Dsouza'],
  ])('[AU-U-03] derives a display name from %s', (email, name) => {
    expect(defaultNameFromEmail(email)).toBe(name);
  });

  it('[AU-U-04] normalizes case and whitespace', () => {
    expect(normalizeEmail(' Guard1@Coditas.COM ')).toBe('guard1@coditas.com');
  });

  it('[AU-U-04] schema returns the normalized address and rejects other domains', () => {
    expect(coditasEmailSchema.parse(' Guard1@Coditas.COM ')).toBe('guard1@coditas.com');
    expect(coditasEmailSchema.safeParse('x@gmail.com').success).toBe(false);
  });
});
