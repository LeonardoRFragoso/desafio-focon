import { describe, it, expect } from 'vitest';
import {
  getAuditActionLabel,
  getAuditEntityLabel,
  getAuditActionColor,
  AUDIT_COLOR_BADGE_CLASSES,
  formatAuditDateTime,
  diffAuditData,
  formatAuditMetadata,
  getAuditSummary,
} from '@/lib/audit-format';
import type { AuditLog } from '@/types/database';

describe('audit-format', () => {
  describe('getAuditActionLabel', () => {
    it('returns human-readable label for known actions', () => {
      expect(getAuditActionLabel('approve_time_entry')).toBe('Aprovar apontamento');
      expect(getAuditActionLabel('reject_time_entry')).toBe('Rejeitar apontamento');
      expect(getAuditActionLabel('close_accounting_period')).toBe('Fechar período contábil');
      expect(getAuditActionLabel('reopen_accounting_period')).toBe('Reabrir período contábil');
    });

    it('falls back to raw action for unknown', () => {
      expect(getAuditActionLabel('unknown_action')).toBe('unknown_action');
    });
  });

  describe('getAuditEntityLabel', () => {
    it('returns human-readable label for known entities', () => {
      expect(getAuditEntityLabel('time_entry')).toBe('Apontamento');
      expect(getAuditEntityLabel('accounting_period')).toBe('Período contábil');
    });

    it('falls back to raw entity for unknown', () => {
      expect(getAuditEntityLabel('unknown_entity')).toBe('unknown_entity');
    });
  });

  describe('getAuditActionColor', () => {
    it('returns green for approve actions', () => {
      expect(getAuditActionColor('approve_time_entry')).toBe('green');
      expect(getAuditActionColor('batch_approve_time_entries')).toBe('green');
    });

    it('returns red for reject actions', () => {
      expect(getAuditActionColor('reject_time_entry')).toBe('red');
    });

    it('returns orange for close, blue for reopen', () => {
      expect(getAuditActionColor('close_accounting_period')).toBe('orange');
      expect(getAuditActionColor('reopen_accounting_period')).toBe('blue');
    });

    it('falls back to gray for unknown', () => {
      expect(getAuditActionColor('unknown')).toBe('gray');
    });
  });

  describe('AUDIT_COLOR_BADGE_CLASSES', () => {
    it('has classes for all colors', () => {
      expect(AUDIT_COLOR_BADGE_CLASSES.green).toContain('bg-green');
      expect(AUDIT_COLOR_BADGE_CLASSES.red).toContain('bg-red');
      expect(AUDIT_COLOR_BADGE_CLASSES.gray).toContain('bg-gray');
    });
  });

  describe('formatAuditDateTime', () => {
    it('formats an ISO date string', () => {
      const result = formatAuditDateTime('2024-01-15T10:00:00Z');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('diffAuditData', () => {
    it('returns empty array when both null', () => {
      expect(diffAuditData(null, null)).toEqual([]);
    });

    it('marks changed fields', () => {
      const fields = diffAuditData(
        { status: 'pending', duration_minutes: 60 },
        { status: 'approved', duration_minutes: 60 }
      );
      const statusField = fields.find((f) => f.key === 'status');
      expect(statusField?.changed).toBe(true);
      expect(statusField?.before).toBe('pending');
      expect(statusField?.after).toBe('approved');

      const durationField = fields.find((f) => f.key === 'duration_minutes');
      expect(durationField?.changed).toBe(false);
    });

    it('uses human-readable field labels', () => {
      const fields = diffAuditData(
        { duration_minutes: 60 },
        { duration_minutes: 120 }
      );
      expect(fields[0].label).toBe('Duração (min)');
    });

    it('sorts changed fields first', () => {
      const fields = diffAuditData(
        { a: 'x', b: 'y', c: 'z' },
        { a: 'x', b: 'changed', c: 'z' }
      );
      const changedIdx = fields.findIndex((f) => f.key === 'b');
      expect(changedIdx).toBe(0);
    });

    it('formats boolean values', () => {
      const fields = diffAuditData(
        { is_active: false },
        { is_active: true }
      );
      const field = fields.find((f) => f.key === 'is_active');
      expect(field?.before).toBe('Não');
      expect(field?.after).toBe('Sim');
    });

    it('formats ISO date strings in values', () => {
      const fields = diffAuditData(
        { rejected_at: null },
        { rejected_at: '2024-01-15T10:00:00Z' }
      );
      const field = fields.find((f) => f.key === 'rejected_at');
      expect(field?.after).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('handles fields only in before', () => {
      const fields = diffAuditData({ removed_field: 'value' }, null);
      const field = fields.find((f) => f.key === 'removed_field');
      expect(field?.before).toBe('value');
      expect(field?.after).toBe('—');
      expect(field?.changed).toBe(true);
    });

    it('handles fields only in after', () => {
      const fields = diffAuditData(null, { new_field: 'value' });
      const field = fields.find((f) => f.key === 'new_field');
      expect(field?.before).toBe('—');
      expect(field?.after).toBe('value');
      expect(field?.changed).toBe(true);
    });
  });

  describe('formatAuditMetadata', () => {
    it('returns null when metadata is null', () => {
      expect(formatAuditMetadata(null)).toBeNull();
    });

    it('returns null when metadata is empty', () => {
      expect(formatAuditMetadata({})).toBeNull();
    });

    it('returns formatted key-value pairs', () => {
      const result = formatAuditMetadata({ batch_size: 5, reason: 'Test reason' });
      expect(result).toHaveLength(2);
      expect(result?.[0].value).toBe('5');
    });
  });

  describe('getAuditSummary', () => {
    it('returns combined action and entity label', () => {
      const log: AuditLog = {
        id: '1',
        actor_id: null,
        action: 'approve_time_entry',
        entity_type: 'time_entry',
        entity_id: null,
        before_data: null,
        after_data: null,
        metadata: null,
        created_at: '2024-01-15T10:00:00Z',
      };
      expect(getAuditSummary(log)).toBe('Aprovar apontamento — Apontamento');
    });
  });
});
