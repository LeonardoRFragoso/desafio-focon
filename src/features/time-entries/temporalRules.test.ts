import { describe, it, expect } from 'vitest';
import {
  todayStr,
  daysLate,
  isFutureDate,
  getTimeEntryTemporalState,
  requiresLateReason,
} from './temporalRules';

/** Helper: shift today's business date by N days and return YYYY-MM-DD.
 * Uses businessTodayStr() (America/Sao_Paulo) so the test is timezone-independent
 * and doesn't break on CI runners where the system TZ is UTC. */
function shiftDate(days: number): string {
  const today = todayStr();
  const parts = today.split('-').map(Number);
  const shifted = new Date(parts[0]!, parts[1]! - 1, parts[2]! + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

describe('temporalRules', () => {
  describe('todayStr', () => {
    it('returns YYYY-MM-DD format', () => {
      const today = todayStr();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('daysLate', () => {
    it('returns 0 for today', () => {
      expect(daysLate(todayStr())).toBe(0);
    });

    it('returns positive for past dates', () => {
      expect(daysLate('2020-01-01')).toBeGreaterThan(0);
    });

    it('returns negative for future dates', () => {
      expect(daysLate(shiftDate(10))).toBeLessThan(0);
    });
  });

  describe('isFutureDate', () => {
    it('returns false for today', () => {
      expect(isFutureDate(todayStr())).toBe(false);
    });

    it('returns false for past dates', () => {
      expect(isFutureDate('2020-01-01')).toBe(false);
    });

    it('returns true for tomorrow', () => {
      expect(isFutureDate(shiftDate(1))).toBe(true);
    });

    it('returns true for 11 days in the future', () => {
      expect(isFutureDate(shiftDate(11))).toBe(true);
    });
  });

  describe('getTimeEntryTemporalState', () => {
    it('returns "today" for today', () => {
      expect(getTimeEntryTemporalState(todayStr())).toBe('today');
    });

    it('returns "past_normal" for 1 day ago', () => {
      expect(getTimeEntryTemporalState(shiftDate(-1))).toBe('past_normal');
    });

    it('returns "retroactive" for 3+ days ago', () => {
      expect(getTimeEntryTemporalState(shiftDate(-10))).toBe('retroactive');
    });

    it('returns "future_legacy" for future dates', () => {
      expect(getTimeEntryTemporalState(shiftDate(5))).toBe('future_legacy');
    });
  });

  describe('requiresLateReason', () => {
    it('returns false for today', () => {
      expect(requiresLateReason(todayStr())).toBe(false);
    });

    it('returns false for 2 days ago', () => {
      expect(requiresLateReason(shiftDate(-2))).toBe(false);
    });

    it('returns true for 3 days ago', () => {
      expect(requiresLateReason(shiftDate(-3))).toBe(true);
    });
  });
});
