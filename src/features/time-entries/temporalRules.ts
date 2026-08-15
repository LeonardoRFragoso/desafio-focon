/**
 * Shared temporal validation helpers for time entries.
 */

/** Returns today's date as YYYY-MM-DD string (local timezone). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the max date allowed for time entry date inputs (today). */
export function maxEntryDate(): string {
  return todayStr();
}

/** Computes the number of days an entry is late (positive = past, negative = future). */
export function daysLate(entryDate: string): number {
  const entry = new Date(entryDate + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
}

/** Whether a late submission reason is required for the given date. */
export function requiresLateReason(entryDate: string): boolean {
  return daysLate(entryDate) >= 3;
}

/** Minimum length for a valid late submission reason. */
export const LATE_REASON_MIN_LENGTH = 10;
/** Maximum length for a valid late submission reason. */
export const LATE_REASON_MAX_LENGTH = 500;
/** Threshold in days after which a late submission reason is required. */
export const LATE_REASON_THRESHOLD_DAYS = 3;
