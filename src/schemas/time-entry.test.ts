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

import { timeEntrySchema } from '@/schemas/time-entry';

const validBase = {
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  entryDate: '2024-08-23',
  durationMinutes: 60,
  description: 'Trabalho realizado no projeto X',
};

describe('timeEntrySchema', () => {
  describe('entryDate — future date validation', () => {
    it('accepts today', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-23' });
      expect(result.success).toBe(true);
    });

    it('accepts yesterday', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-22' });
      expect(result.success).toBe(true);
    });

    it('rejects tomorrow (future date)', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-24' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(i => i.path.includes('entryDate'));
        expect(issue).toBeDefined();
        expect(issue!.message).toContain('data futura');
      }
    });

    it('rejects 7 days in the future', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-30' });
      expect(result.success).toBe(false);
    });
  });

  describe('lateSubmissionReason — retroactive justification', () => {
    it('does not require reason for 2 days ago', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-21' });
      expect(result.success).toBe(true);
    });

    it('requires reason for 3 days ago (threshold)', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-20' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const reasonIssue = result.error.issues.find(i => i.path.includes('lateSubmissionReason'));
        expect(reasonIssue).toBeDefined();
        expect(reasonIssue!.message).toContain('3 dias de atraso');
      }
    });

    it('requires reason for 10 days ago', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-13' });
      expect(result.success).toBe(false);
    });

    it('accepts 3 days ago with valid reason (>= 10 chars)', () => {
      const result = timeEntrySchema.safeParse({
        ...validBase,
        entryDate: '2024-08-20',
        lateSubmissionReason: 'Estava em campo e não pude registrar no tempo.',
      });
      expect(result.success).toBe(true);
    });

    it('rejects 3 days ago with short reason (< 10 chars)', () => {
      const result = timeEntrySchema.safeParse({
        ...validBase,
        entryDate: '2024-08-20',
        lateSubmissionReason: 'curto',
      });
      expect(result.success).toBe(false);
    });

    it('rejects 3 days ago with whitespace-only reason', () => {
      const result = timeEntrySchema.safeParse({
        ...validBase,
        entryDate: '2024-08-20',
        lateSubmissionReason: '     ',
      });
      expect(result.success).toBe(false);
    });

    it('accepts 3 days ago with empty string reason (treated as missing)', () => {
      const result = timeEntrySchema.safeParse({
        ...validBase,
        entryDate: '2024-08-20',
        lateSubmissionReason: '',
      });
      expect(result.success).toBe(false);
    });

    it('accepts today without reason', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, entryDate: '2024-08-23' });
      expect(result.success).toBe(true);
    });
  });

  describe('durationMinutes', () => {
    it('rejects 0 minutes', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, durationMinutes: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects negative minutes', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, durationMinutes: -10 });
      expect(result.success).toBe(false);
    });

    it('rejects more than 1440 minutes (24h)', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, durationMinutes: 1441 });
      expect(result.success).toBe(false);
    });

    it('accepts 1440 minutes (24h boundary)', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, durationMinutes: 1440 });
      expect(result.success).toBe(true);
    });
  });

  describe('description', () => {
    it('rejects description shorter than 10 chars', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, description: 'curto' });
      expect(result.success).toBe(false);
    });

    it('rejects description longer than 500 chars', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, description: 'a'.repeat(501) });
      expect(result.success).toBe(false);
    });

    it('accepts description of exactly 10 chars', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, description: '1234567890' });
      expect(result.success).toBe(true);
    });
  });

  describe('projectId', () => {
    it('rejects invalid UUID', () => {
      const result = timeEntrySchema.safeParse({ ...validBase, projectId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });
});
