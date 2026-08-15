import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Date to a fixed value for deterministic tests
const FIXED_DATE = '2024-08-23T12:00:00.000Z';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_DATE));
});

afterEach(() => {
  vi.useRealTimers();
});

// Import after mock setup
import {
  todayStr,
  maxEntryDate,
  daysLate,
  requiresLateReason,
  LATE_REASON_THRESHOLD_DAYS,
  LATE_REASON_MIN_LENGTH,
  LATE_REASON_MAX_LENGTH,
} from '@/features/time-entries/temporalRules';

describe('temporalRules', () => {
  describe('todayStr', () => {
    it('returns today as YYYY-MM-DD', () => {
      // 2024-08-23T12:00:00.000Z → 2024-08-23
      expect(todayStr()).toBe('2024-08-23');
    });
  });

  describe('maxEntryDate', () => {
    it('returns today (no future dates allowed)', () => {
      expect(maxEntryDate()).toBe('2024-08-23');
    });
  });

  describe('daysLate', () => {
    it('returns 0 for today', () => {
      expect(daysLate('2024-08-23')).toBe(0);
    });

    it('returns 1 for yesterday', () => {
      expect(daysLate('2024-08-22')).toBe(1);
    });

    it('returns 3 for 3 days ago', () => {
      expect(daysLate('2024-08-20')).toBe(3);
    });

    it('returns 10 for 10 days ago', () => {
      expect(daysLate('2024-08-13')).toBe(10);
    });

    it('returns negative for future dates', () => {
      expect(daysLate('2024-08-24')).toBe(-1);
      expect(daysLate('2024-08-30')).toBe(-7);
    });
  });

  describe('requiresLateReason', () => {
    it('returns false for today', () => {
      expect(requiresLateReason('2024-08-23')).toBe(false);
    });

    it('returns false for yesterday', () => {
      expect(requiresLateReason('2024-08-22')).toBe(false);
    });

    it('returns false for 2 days ago', () => {
      expect(requiresLateReason('2024-08-21')).toBe(false);
    });

    it('returns true for 3 days ago (threshold)', () => {
      expect(requiresLateReason('2024-08-20')).toBe(true);
    });

    it('returns true for 10 days ago', () => {
      expect(requiresLateReason('2024-08-13')).toBe(true);
    });

    it('returns false for future dates', () => {
      expect(requiresLateReason('2024-08-24')).toBe(false);
    });
  });

  describe('constants', () => {
    it('LATE_REASON_THRESHOLD_DAYS is 3', () => {
      expect(LATE_REASON_THRESHOLD_DAYS).toBe(3);
    });

    it('LATE_REASON_MIN_LENGTH is 10', () => {
      expect(LATE_REASON_MIN_LENGTH).toBe(10);
    });

    it('LATE_REASON_MAX_LENGTH is 500', () => {
      expect(LATE_REASON_MAX_LENGTH).toBe(500);
    });
  });
});
