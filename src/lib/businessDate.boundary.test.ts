import { describe, it, expect } from 'vitest';
import { businessTodayStr, formatBusinessDate } from '@/lib/businessDate';

/**
 * Boundary tests for the canonical business timezone helpers.
 *
 * These verify that the helpers used by DuplicateEntryModal, Timer,
 * WeeklyCalendar, and all other time-entry flows produce the correct
 * business date at critical UTC↔BRT boundary instants.
 *
 * America/Sao_Paulo is UTC-3 (no DST since 2019). So:
 *   20:59 BRT = 23:59 UTC  → same calendar day
 *   21:00 BRT = 00:00 UTC  → UTC rolls to next day, BRT stays same day
 *   23:59 BRT = 02:59 UTC  → UTC is next day, BRT stays same day
 *   00:00 BRT = 03:00 UTC  → both are same calendar day
 */
describe('businessDate boundary tests', () => {
  // All test instants are in August 2026 for determinism.
  // BRT = UTC-3

  it('20:59 BRT (23:59 UTC) — same calendar day', () => {
    // 2026-08-15T23:59:00.000Z = 2026-08-15 20:59 BRT
    const instant = '2026-08-15T23:59:00.000Z';
    expect(businessTodayStr(instant)).toBe('2026-08-15');
    expect(formatBusinessDate(instant)).toBe('2026-08-15');
  });

  it('21:00 BRT (00:00 UTC next day) — BRT still on the 15th', () => {
    // 2026-08-16T00:00:00.000Z = 2026-08-15 21:00 BRT
    const instant = '2026-08-16T00:00:00.000Z';
    expect(businessTodayStr(instant)).toBe('2026-08-15');
    expect(formatBusinessDate(instant)).toBe('2026-08-15');
  });

  it('23:59 BRT (02:59 UTC next day) — BRT still on the 15th', () => {
    // 2026-08-16T02:59:00.000Z = 2026-08-15 23:59 BRT
    const instant = '2026-08-16T02:59:00.000Z';
    expect(businessTodayStr(instant)).toBe('2026-08-15');
    expect(formatBusinessDate(instant)).toBe('2026-08-15');
  });

  it('00:00 BRT (03:00 UTC) — BRT rolls to the 16th', () => {
    // 2026-08-16T03:00:00.000Z = 2026-08-16 00:00 BRT
    const instant = '2026-08-16T03:00:00.000Z';
    expect(businessTodayStr(instant)).toBe('2026-08-16');
    expect(formatBusinessDate(instant)).toBe('2026-08-16');
  });

  it('DuplicateEntryModal default date matches businessTodayStr, not UTC', () => {
    // At 21:00 BRT (00:00 UTC next day), UTC would give 2026-08-16
    // but business date should be 2026-08-15.
    // This is the exact scenario that was buggy with toISOString().slice(0,10).
    const instant = '2026-08-16T00:00:00.000Z';
    const utcResult = new Date(instant).toISOString().slice(0, 10);
    const businessResult = businessTodayStr(instant);

    // UTC gives the wrong day (next day)
    expect(utcResult).toBe('2026-08-16');
    // Business date gives the correct day (still the 15th in BRT)
    expect(businessResult).toBe('2026-08-15');
    // They must differ — this proves the fix is necessary
    expect(businessResult).not.toBe(utcResult);
  });

  it('formatBusinessDate with Date object (not just string)', () => {
    const d = new Date('2026-08-16T00:00:00.000Z');
    expect(formatBusinessDate(d)).toBe('2026-08-15');
  });

  it('noon BRT — straightforward same-day case', () => {
    // 2026-08-15T15:00:00.000Z = 2026-08-15 12:00 BRT
    const instant = '2026-08-15T15:00:00.000Z';
    expect(businessTodayStr(instant)).toBe('2026-08-15');
  });
});
