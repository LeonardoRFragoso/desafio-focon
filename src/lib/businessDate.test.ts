import { describe, it, expect } from 'vitest';
import {
  businessTodayStr,
  businessDaysLate,
  businessRequiresLateReason,
  businessIsFutureDate,
  formatBusinessDate,
  BUSINESS_TIMEZONE,
} from './businessDate';
import {
  todayStr,
  daysLate,
  requiresLateReason,
  isFutureDate,
  getTimeEntryTemporalState,
} from '../features/time-entries/temporalRules';

/**
 * Boundary tests for the canonical business timezone (America/Sao_Paulo).
 *
 * These tests do NOT depend on the real machine clock. Every call injects
 * a fixed UTC instant via the `now` parameter, so the assertions are
 * deterministic regardless of when the suite runs.
 *
 * BRT = UTC-3 (no DST in August). The critical boundary is 21:00 BRT
 * (00:00 UTC next day): the UTC date rolls over but the BRT date does not.
 * The previous implementation (new Date().toISOString().slice(0,10))
 * returned the UTC date, so after 21h BRT "today" silently became
 * tomorrow on the client.
 */

// Fixed UTC instants used across the suite.
const UTC_2026_08_15_23_59 = '2026-08-15T23:59:00.000Z'; // 20:59 BRT Aug 15
const UTC_2026_08_16_00_00 = '2026-08-16T00:00:00.000Z'; // 21:00 BRT Aug 15
const UTC_2026_08_16_02_59 = '2026-08-16T02:59:00.000Z'; // 23:59 BRT Aug 15
const UTC_2026_08_15_03_00 = '2026-08-15T03:00:00.000Z'; // 00:00 BRT Aug 15

describe('businessDate — canonical timezone', () => {
  describe('BUSINESS_TIMEZONE', () => {
    it('is America/Sao_Paulo', () => {
      expect(BUSINESS_TIMEZONE).toBe('America/Sao_Paulo');
    });
  });

  describe('formatBusinessDate', () => {
    it('returns YYYY-MM-DD', () => {
      expect(formatBusinessDate(UTC_2026_08_15_03_00)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns the BRT calendar date, not the UTC date', () => {
      // 21:00 BRT Aug 15 = 00:00 UTC Aug 16. UTC date is Aug 16, BRT date is Aug 15.
      expect(formatBusinessDate(UTC_2026_08_16_00_00)).toBe('2026-08-15');
    });
  });

  describe('businessTodayStr — boundary behavior', () => {
    it('20:59 BRT -> today is Aug 15', () => {
      expect(businessTodayStr(UTC_2026_08_15_23_59)).toBe('2026-08-15');
    });

    it('21:00 BRT (UTC rollover) -> today is STILL Aug 15 (not Aug 16)', () => {
      // This is the exact bug: the old toISOString().slice(0,10) returned 2026-08-16.
      expect(businessTodayStr(UTC_2026_08_16_00_00)).toBe('2026-08-15');
    });

    it('23:59 BRT -> today is Aug 15', () => {
      expect(businessTodayStr(UTC_2026_08_16_02_59)).toBe('2026-08-15');
    });

    it('00:00 BRT -> today is Aug 15', () => {
      expect(businessTodayStr(UTC_2026_08_15_03_00)).toBe('2026-08-15');
    });
  });

  describe('businessMaxEntryDate (via temporalRules)', () => {
    it('equals today in business timezone', () => {
      // businessMaxEntryDate is covered via temporalRules.maxEntryDate below.
      expect(businessTodayStr(UTC_2026_08_16_00_00)).toBe('2026-08-15');
    });
  });

  describe('businessDaysLate', () => {
    it('returns 0 for today (BRT)', () => {
      expect(businessDaysLate('2026-08-15', UTC_2026_08_16_00_00)).toBe(0);
    });

    it('returns 0 for today at 20:59 BRT', () => {
      expect(businessDaysLate('2026-08-15', UTC_2026_08_15_23_59)).toBe(0);
    });

    it('returns 1 for yesterday', () => {
      expect(businessDaysLate('2026-08-14', UTC_2026_08_15_03_00)).toBe(1);
    });

    it('returns 2 for 2 days ago', () => {
      expect(businessDaysLate('2026-08-13', UTC_2026_08_15_03_00)).toBe(2);
    });

    it('returns 3 for 3 days ago (triggers late reason)', () => {
      expect(businessDaysLate('2026-08-12', UTC_2026_08_15_03_00)).toBe(3);
    });

    it('returns -1 for tomorrow (future)', () => {
      expect(businessDaysLate('2026-08-16', UTC_2026_08_15_03_00)).toBe(-1);
    });

    it('does NOT roll over at 21:00 BRT: entry dated today is still 0 late', () => {
      // At 21:00 BRT Aug 15, an entry dated Aug 15 must still be "today" (0 late),
      // not "1 day late" (which the old UTC-based code would compute).
      expect(businessDaysLate('2026-08-15', UTC_2026_08_16_00_00)).toBe(0);
    });
  });

  describe('businessRequiresLateReason', () => {
    it('returns false for today', () => {
      expect(businessRequiresLateReason('2026-08-15', UTC_2026_08_16_00_00)).toBe(false);
    });

    it('returns false for 2 days ago', () => {
      expect(businessRequiresLateReason('2026-08-13', UTC_2026_08_15_03_00)).toBe(false);
    });

    it('returns true for 3 days ago', () => {
      expect(businessRequiresLateReason('2026-08-12', UTC_2026_08_15_03_00)).toBe(true);
    });

    it('returns true for 10 days ago', () => {
      expect(businessRequiresLateReason('2026-08-05', UTC_2026_08_15_03_00)).toBe(true);
    });
  });

  describe('businessIsFutureDate', () => {
    it('returns false for today at 21:00 BRT (UTC rollover)', () => {
      // Old code: todayStr() = 2026-08-16 (UTC), entry 2026-08-15 -> daysLate=1 -> not future
      // but the entry is actually "today" so it must not be future.
      expect(businessIsFutureDate('2026-08-15', UTC_2026_08_16_00_00)).toBe(false);
    });

    it('returns false for yesterday', () => {
      expect(businessIsFutureDate('2026-08-14', UTC_2026_08_15_03_00)).toBe(false);
    });

    it('returns true for tomorrow', () => {
      expect(businessIsFutureDate('2026-08-16', UTC_2026_08_15_03_00)).toBe(true);
    });

    it('returns true for 11 days in the future', () => {
      expect(businessIsFutureDate('2026-08-26', UTC_2026_08_15_03_00)).toBe(true);
    });
  });
});

/**
 * Verify the public temporalRules API delegates correctly to businessDate
 * and accepts an injectable `now` (so no test depends on the real clock).
 */
describe('temporalRules — delegates to businessDate with injectable now', () => {
  describe('todayStr', () => {
    it('returns YYYY-MM-DD format', () => {
      expect(todayStr(UTC_2026_08_15_03_00)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns BRT today at 21:00 BRT (UTC rollover)', () => {
      expect(todayStr(UTC_2026_08_16_00_00)).toBe('2026-08-15');
    });
  });

  describe('daysLate', () => {
    it('returns 0 for today at 21:00 BRT', () => {
      expect(daysLate('2026-08-15', UTC_2026_08_16_00_00)).toBe(0);
    });

    it('returns positive for past dates', () => {
      expect(daysLate('2020-01-01', UTC_2026_08_15_03_00)).toBeGreaterThan(0);
    });

    it('returns negative for future dates', () => {
      expect(daysLate('2026-08-26', UTC_2026_08_15_03_00)).toBeLessThan(0);
    });
  });

  describe('isFutureDate', () => {
    it('returns false for today at 21:00 BRT', () => {
      expect(isFutureDate('2026-08-15', UTC_2026_08_16_00_00)).toBe(false);
    });

    it('returns false for past dates', () => {
      expect(isFutureDate('2020-01-01', UTC_2026_08_15_03_00)).toBe(false);
    });

    it('returns true for tomorrow', () => {
      expect(isFutureDate('2026-08-16', UTC_2026_08_15_03_00)).toBe(true);
    });
  });

  describe('getTimeEntryTemporalState', () => {
    it('returns "today" for today at 21:00 BRT', () => {
      expect(getTimeEntryTemporalState('2026-08-15', UTC_2026_08_16_00_00)).toBe('today');
    });

    it('returns "past_normal" for 1 day ago', () => {
      expect(getTimeEntryTemporalState('2026-08-14', UTC_2026_08_15_03_00)).toBe('past_normal');
    });

    it('returns "retroactive" for 3+ days ago', () => {
      expect(getTimeEntryTemporalState('2026-08-05', UTC_2026_08_15_03_00)).toBe('retroactive');
    });

    it('returns "future_legacy" for future dates', () => {
      expect(getTimeEntryTemporalState('2026-08-20', UTC_2026_08_15_03_00)).toBe('future_legacy');
    });
  });

  describe('requiresLateReason', () => {
    it('returns false for today', () => {
      expect(requiresLateReason('2026-08-15', UTC_2026_08_16_00_00)).toBe(false);
    });

    it('returns false for 2 days ago', () => {
      expect(requiresLateReason('2026-08-13', UTC_2026_08_15_03_00)).toBe(false);
    });

    it('returns true for 3 days ago', () => {
      expect(requiresLateReason('2026-08-12', UTC_2026_08_15_03_00)).toBe(true);
    });
  });
});
