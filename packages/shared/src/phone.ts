const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const ALLOWED_CHARS = /^[\d+\-\s().]+$/;
const SEPARATORS = /[\s\-().]/g;

/**
 * Normalizes a visitor phone number to E.164.
 * Indian mobiles may be entered as 10 digits, 0 + 10 digits, 91 + 10 digits, +91 / 0091 prefixed.
 * Other countries must be entered with + or 00 prefix. Returns null when invalid.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || !ALLOWED_CHARS.test(trimmed)) return null;

  let value = trimmed.replace(SEPARATORS, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;

  if (value.startsWith('+')) {
    const digits = value.slice(1);
    if (!/^\d+$/.test(digits)) return null;
    if (digits.startsWith('91')) return indian(digits.slice(2));
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? `+${digits}` : null;
  }

  if (!/^\d+$/.test(value)) return null;
  if (value.length === 10) return indian(value);
  if (value.length === 11 && value.startsWith('0')) return indian(value.slice(1));
  if (value.length === 12 && value.startsWith('91')) return indian(value.slice(2));
  return null;
}

function indian(national: string): string | null {
  return INDIAN_MOBILE.test(national) ? `+91${national}` : null;
}
