/**
 * Shared duration formatting helper.
 *
 * Produces compact, human-readable strings from a minute count:
 *   30  -> "30m"
 *   90  -> "1h30"
 *   60  -> "1h"
 *   2250 -> "37h30"
 *   2400 -> "40h"
 *
 * Used by HourGoalWidget, ProfessionalActionCenter, and any other component
 * that displays weekly-goal durations so the formatting is consistent across
 * the dashboard.
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Convert minutes to a fractional hours string suitable for number inputs
 * with step=0.5. Preserves half-hour precision:
 *   2250 -> "37.5"
 *   2400 -> "40"
 *   90   -> "1.5"
 */
export function minutesToHoursInput(minutes: number): string {
  const hours = minutes / 60;
  // Avoid floating-point artifacts (e.g. 37.50000000001)
  return String(Math.round(hours * 10) / 10);
}

/**
 * Convert a fractional hours value (from a number input) to minutes.
 *   "37.5" -> 2250
 *   "40"   -> 2400
 */
export function hoursInputToMinutes(hours: number): number {
  return Math.round(hours * 60);
}
