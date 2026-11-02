/** Business timezone. India has no DST, so a fixed offset is exact. */
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;

/** Calendar date (YYYY-MM-DD) in IST for a UTC instant. */
export function toIstDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}
