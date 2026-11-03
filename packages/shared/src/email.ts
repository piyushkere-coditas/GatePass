import { z } from 'zod';

/** Only exact @coditas.com addresses (no subdomains or look-alikes) can sign in (AU-1). */
const CODITAS_EMAIL = /^[a-z0-9._%+-]+@coditas\.com$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCoditasEmail(email: string): boolean {
  return CODITAS_EMAIL.test(normalizeEmail(email));
}

/** "piyush.kere@coditas.com" -> "Piyush Kere" (AU-2 default display name). */
export function defaultNameFromEmail(email: string): string {
  const local = normalizeEmail(email).split('@')[0] ?? '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

export const coditasEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .refine(isCoditasEmail, 'Use your Coditas email (@coditas.com)');
