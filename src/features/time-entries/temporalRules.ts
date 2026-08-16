/**
 * Shared temporal validation helpers for time entries.
 *
 * All "today" calculations use the canonical business timezone
 * (America/Sao_Paulo) via src/lib/businessDate. The previous implementation
 * used `new Date().toISOString().slice(0, 10)`, which returns the UTC date
 * and silently rolls over to tomorrow after 21:00 BRT — breaking temporal
 * classification, max-date inputs, and retroactive justification, and
 * causing the frontend to disagree with the database's CURRENT_DATE.
 *
 * Every function accepts an optional `now` parameter (Date | string) so
 * tests can inject a deterministic clock. No test should depend on the
 * real machine time.
 */
import {
  businessTodayStr,
  businessMaxEntryDate,
  businessDaysLate,
  businessRequiresLateReason,
  businessIsFutureDate,
  BUSINESS_TIMEZONE,
} from '../../lib/businessDate';

export { BUSINESS_TIMEZONE };

/**
 * Returns today's date as YYYY-MM-DD in the canonical business timezone
 * (America/Sao_Paulo).
 *
 * @param now The instant to compute "today" from. Defaults to now. Tests
 *            should inject a deterministic value.
 */
export function todayStr(now: Date | string = new Date()): string {
  return businessTodayStr(now);
}

/** Returns the max date allowed for time entry date inputs (today). */
export function maxEntryDate(now: Date | string = new Date()): string {
  return businessMaxEntryDate(now);
}

/**
 * Computes the number of days an entry is late (positive = past, negative =
 * future), in business-calendar terms (America/Sao_Paulo).
 */
export function daysLate(entryDate: string, now: Date | string = new Date()): number {
  return businessDaysLate(entryDate, now);
}

/** Whether a late submission reason is required for the given date. */
export function requiresLateReason(entryDate: string, now: Date | string = new Date()): boolean {
  return businessRequiresLateReason(entryDate, now);
}

/**
 * Whether the entry date is in the future (after today).
 * Uses calendar-date comparison (not timestamp) to avoid timezone bugs.
 * entry_date is a DATE column (YYYY-MM-DD), so we compare as calendar dates.
 */
export function isFutureDate(entryDate: string, now: Date | string = new Date()): boolean {
  return businessIsFutureDate(entryDate, now);
}

/**
 * Classifies a time entry into a temporal category for UI display.
 *
 * Categories:
 *   - 'today'          — entry_date === today
 *   - 'past_normal'    — entry_date in the past, < 3 days late
 *   - 'retroactive'    — entry_date >= 3 days in the past
 *   - 'future_legacy'  — entry_date in the future (should not exist but may be legacy)
 *
 * This helper centralizes temporal classification so components don't
 * scatter `new Date(entry.entry_date) > new Date()` checks.
 */
export type TimeEntryTemporalState = 'today' | 'past_normal' | 'retroactive' | 'future_legacy';

export function getTimeEntryTemporalState(
  entryDate: string,
  now: Date | string = new Date(),
): TimeEntryTemporalState {
  const late = daysLate(entryDate, now);
  if (late < 0) return 'future_legacy';
  if (late === 0) return 'today';
  if (late >= 3) return 'retroactive';
  return 'past_normal';
}

/** Minimum length for a valid late submission reason. */
export const LATE_REASON_MIN_LENGTH = 10;
/** Maximum length for a valid late submission reason. */
export const LATE_REASON_MAX_LENGTH = 500;
/** Threshold in days after which a late submission reason is required. */
export const LATE_REASON_THRESHOLD_DAYS = 3;
