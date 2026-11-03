/** Business timezone. India has no DST, so a fixed offset is exact. */
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;

/** Calendar date (YYYY-MM-DD) in IST for a UTC instant. */
export function toIstDate(instant: Date): string {
  return toIst(instant).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "02 Nov 2026, 11:00 AM IST" — used in emails and UI (NT-3). Deterministic, no locale data needed. */
export function formatIstDateTime(instant: Date): string {
  const ist = toIst(instant);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const hours = ist.getUTCHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const period = hours < 12 ? 'AM' : 'PM';
  return `${day} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${hour12}:${minutes} ${period} IST`;
}

/** Shifts a UTC instant so its UTC fields read as IST wall-clock time. */
function toIst(instant: Date): Date {
  return new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
}
