/**
 * Canonical business timezone helpers.
 *
 * FoconFlow operates in Brazil. The canonical business timezone is
 * America/Sao_Paulo (UTC-3, with DST historically handled by the IANA tzdb).
 *
 * WHY THIS EXISTS:
 *   The previous implementation used `new Date().toISOString().slice(0, 10)`,
 *   which returns the date in UTC. For Brazil (UTC-3), after 21:00 BRT the
 *   UTC date rolls over to the next day, so "today" on the client would
 *   silently become tomorrow. This broke temporal rules (today/future/late
 *   classification, max-date inputs, retroactive justification) and caused
 *   the frontend and the database (which uses CURRENT_DATE in its own
 *   timezone) to disagree on what "today" means.
 *
 *   The database side is centralized in the SQL helper
 *   `public.business_current_date()` (see migration
 *   20240824060000_canonical_business_timezone.sql), which returns
 *   `(now() AT TIME ZONE 'America/Sao_Paulo')::date`. The frontend helpers
 *   here mirror that exact definition so both sides agree.
 *
 * DESIGN:
 *   - All functions accept an optional `now` parameter (Date | string) so
 *     tests can inject a deterministic clock. No test should depend on the
 *     real machine time.
 *   - Dates are returned as YYYY-MM-DD strings (calendar dates), matching
 *     the `DATE` column format used by `time_entries.entry_date`.
 *   - We never use `toISOString()` for "today" — that returns UTC. Instead
 *     we format the America/Sao_Paulo calendar date explicitly.
 */

/** Canonical business timezone for FoconFlow. */
export const BUSINESS_TIMEZONE = 'America/Sao_Paulo' as const;

/**
 * Format a Date as YYYY-MM-DD in the canonical business timezone.
 *
 * Uses Intl.DateTimeFormat with timeZone to get the Y/M/D components in
 * America/Sao_Paulo, then zero-pads. This avoids any reliance on the host's
 * local timezone or on UTC.
 *
 * @param now The instant to format. Defaults to the current instant.
 */
export function formatBusinessDate(now: Date | string = new Date()): string {
  const instant = typeof now === 'string' ? new Date(now) : now;
  // Intl.DateTimeFormat gives us the wall-clock Y/M/D in the target tz.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's date as YYYY-MM-DD in the canonical business timezone
 * (America/Sao_Paulo). This replaces the buggy
 * `new Date().toISOString().slice(0, 10)` which returned the UTC date.
 *
 * @param now The instant to compute "today" from. Defaults to now. Tests
 *            should always inject a deterministic value.
 */
export function businessTodayStr(now: Date | string = new Date()): string {
  return formatBusinessDate(now);
}

/**
 * Returns the max date allowed for time entry date inputs (today, in the
 * canonical business timezone). Future dates are not allowed.
 */
export function businessMaxEntryDate(now: Date | string = new Date()): string {
  return businessTodayStr(now);
}

/**
 * Parses a YYYY-MM-DD calendar date into a UTC midnight Date object.
 * Used internally so that day-difference math is done on calendar days,
 * not on instants (which would be timezone-sensitive).
 */
function parseCalendarDate(dateStr: string): Date {
  // Construct at UTC midnight so the date components are stable regardless
  // of host timezone. We only ever read getUTC* on these.
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Computes the number of days an entry is late, in business-calendar terms.
 * Positive = past, 0 = today, negative = future.
 *
 * Both `entryDate` and "today" are treated as calendar dates in the
 * canonical business timezone, so the comparison is calendar-vs-calendar
 * and never drifts with UTC offset.
 *
 * @param entryDate YYYY-MM-DD calendar date of the time entry.
 * @param now        The instant to compare against. Defaults to now. Tests
 *                   should inject a deterministic value.
 */
export function businessDaysLate(entryDate: string, now: Date | string = new Date()): number {
  const entry = parseCalendarDate(entryDate);
  const today = parseCalendarDate(businessTodayStr(now));
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((today.getTime() - entry.getTime()) / msPerDay);
}

/**
 * Whether a late submission reason is required for the given entry date.
 * Threshold is 3 business-calendar days late (matches the DB rule in
 * enforce_temporal_rules_time_entries).
 */
export function businessRequiresLateReason(
  entryDate: string,
  now: Date | string = new Date(),
): boolean {
  return businessDaysLate(entryDate, now) >= 3;
}

/**
 * Whether the entry date is in the future (after today) in business-calendar
 * terms. Uses calendar-date comparison to avoid timezone bugs.
 */
export function businessIsFutureDate(entryDate: string, now: Date | string = new Date()): boolean {
  return businessDaysLate(entryDate, now) < 0;
}
