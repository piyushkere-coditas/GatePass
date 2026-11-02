const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Human-readable visit code shown to security, e.g. GP-20261102-0007. `istDate` is YYYY-MM-DD (IST). */
export function formatVisitCode(istDate: string, sequence: number): string {
  if (!ISO_DATE.test(istDate)) throw new Error(`Invalid IST date: ${istDate}`);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error(`Invalid sequence: ${sequence}`);
  return `GP-${istDate.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`;
}
