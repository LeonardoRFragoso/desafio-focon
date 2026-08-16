import { describe, it, expect } from 'vitest';
import {
  getAuditActionLabel,
  getAuditEntityLabel,
  getAuditActionColor,
  isKnownAction,
  AUDIT_COLOR_BADGE_CLASSES,
  formatAuditDateTime,
  diffAuditData,
  formatAuditMetadata,
  getAuditSummary,
  sanitizeAuditData,
} from '@/lib/audit-format';
import type { AuditLog } from '@/types/database';

describe('audit-format', () => {
  describe('P11 — Action wording (event-based)', () => {
    it('returns event-based labels for known actions', () => {
      expect(getAuditActionLabel('approve_time_entry')).toBe('Apontamento aprovado');
      expect(getAuditActionLabel('reject_time_entry')).toBe('Apontamento rejeitado');
      expect(getAuditActionLabel('close_accounting_period')).toBe('Período contábil fechado');
      expect(getAuditActionLabel('reopen_accounting_period')).toBe('Período contábil reaberto');
    });

    it('returns "Ação não reconhecida" for unknown actions', () => {
      expect(getAuditActionLabel('unknown_action')).toBe('Ação não reconhecida');
    });

    it('isKnownAction returns true for known, false for unknown', () => {
      expect(isKnownAction('approve_time_entry')).toBe(true);
      expect(isKnownAction('unknown')).toBe(false);
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
    it('formats an ISO date string in America/Sao_Paulo timezone', () => {
      const result = formatAuditDateTime('2024-01-15T10:00:00Z');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  // ==========================================================================
  // P8 — Recursive sanitization
  // ==========================================================================
  describe('P8 — sanitizeAuditData', () => {
    it('redacts top-level sensitive keys', () => {
      const result = sanitizeAuditData({ password: 'secret123', name: 'John' });
      expect(result).toEqual({ password: '[REDACTED]', name: 'John' });
    });

    it('redacts nested sensitive keys in objects', () => {
      const result = sanitizeAuditData({
        user: { access_token: 'abc123', name: 'John' },
      });
      expect(result).toEqual({
        user: { access_token: '[REDACTED]', name: 'John' },
      });
    });

    it('redacts sensitive keys in arrays', () => {
      const result = sanitizeAuditData([
        { token: 'abc' },
        { name: 'John', api_key: 'xyz' },
      ]);
      expect(result).toEqual([
        { token: '[REDACTED]' },
        { name: 'John', api_key: '[REDACTED]' },
      ]);
    });

    it('matches keys case-insensitively', () => {
      const result = sanitizeAuditData({ Password: 'x', API_KEY: 'y', TOKEN: 'z' });
      expect(result).toEqual({ Password: '[REDACTED]', API_KEY: '[REDACTED]', TOKEN: '[REDACTED]' });
    });

    it('redacts all sensitive key patterns', () => {
      const data = {
        authorization: 'Bearer x',
        access_token: 'x',
        refresh_token: 'x',
        token: 'x',
        password: 'x',
        passwd: 'x',
        secret: 'x',
        service_role: 'x',
        service_role_key: 'x',
        api_key: 'x',
        apikey: 'x',
        cookie: 'x',
        'set-cookie': 'x',
        signed_url: 'x',
        signedurl: 'x',
        private_url: 'x',
        bearer: 'x',
        credential: 'x',
        private_key: 'x',
        session_token: 'x',
      };
      const result = sanitizeAuditData(data) as Record<string, string>;
      for (const key of Object.keys(result)) {
        expect(result[key]).toBe('[REDACTED]');
      }
    });

    it('preserves non-sensitive nested objects', () => {
      const result = sanitizeAuditData({
        config: { host: 'localhost', port: 5432 },
      });
      expect(result).toEqual({ config: { host: 'localhost', port: 5432 } });
    });

    it('handles deeply nested structures', () => {
      const result = sanitizeAuditData({
        level1: { level2: { level3: { password: 'deep' } } },
      });
      expect(result).toEqual({
        level1: { level2: { level3: { password: '[REDACTED]' } } },
      });
    });

    it('returns primitives as-is', () => {
      expect(sanitizeAuditData('hello')).toBe('hello');
      expect(sanitizeAuditData(42)).toBe(42);
      expect(sanitizeAuditData(null)).toBe(null);
      expect(sanitizeAuditData(undefined)).toBe(undefined);
    });
  });

  // ==========================================================================
  // P9 — Domain formatters
  // ==========================================================================
  describe('P9 — diffAuditData with domain formatters', () => {
    it('formats duration_minutes as h:mm', () => {
      const fields = diffAuditData(
        { duration_minutes: 60 },
        { duration_minutes: 90 }
      );
      const field = fields.find((f) => f.key === 'duration_minutes');
      expect(field?.before).toBe('1h');
      expect(field?.after).toBe('1h30');
    });

    it('formats currency fields as BRL', () => {
      const fields = diffAuditData(
        { applied_hourly_rate: 100 },
        { applied_hourly_rate: 150 }
      );
      const field = fields.find((f) => f.key === 'applied_hourly_rate');
      expect(field?.before).toContain('R$');
      expect(field?.after).toContain('R$');
    });

    it('translates approval_status enum', () => {
      const fields = diffAuditData(
        { approval_status: 'pending' },
        { approval_status: 'approved' }
      );
      const field = fields.find((f) => f.key === 'approval_status');
      expect(field?.before).toBe('Pendente');
      expect(field?.after).toBe('Aprovado');
    });

    it('formats date-only fields as dd/MM/yyyy', () => {
      const fields = diffAuditData(
        { entry_date: '2024-08-05' },
        { entry_date: '2024-08-06' }
      );
      const field = fields.find((f) => f.key === 'entry_date');
      expect(field?.before).toBe('05/08/2024');
      expect(field?.after).toBe('06/08/2024');
    });

    it('formats booleans as Sim/Não', () => {
      const fields = diffAuditData(
        { is_active: false },
        { is_active: true }
      );
      const field = fields.find((f) => f.key === 'is_active');
      expect(field?.before).toBe('Não');
      expect(field?.after).toBe('Sim');
    });

    it('sanitizes sensitive keys in diff data', () => {
      const fields = diffAuditData(
        { password: 'old', name: 'test' },
        { password: 'new', name: 'test' }
      );
      const pwField = fields.find((f) => f.key === 'password');
      expect(pwField?.before).toBe('[REDACTED]');
      expect(pwField?.after).toBe('[REDACTED]');
      expect(pwField?.changed).toBe(false); // both redacted, so no change
    });

    it('returns empty array when both null', () => {
      expect(diffAuditData(null, null)).toEqual([]);
    });

    it('sorts changed fields first', () => {
      const fields = diffAuditData(
        { a: 'x', b: 'y', c: 'z' },
        { a: 'x', b: 'changed', c: 'z' }
      );
      const changedIdx = fields.findIndex((f) => f.key === 'b');
      expect(changedIdx).toBe(0);
    });

    it('uses human-readable field labels', () => {
      const fields = diffAuditData(
        { duration_minutes: 60 },
        { duration_minutes: 120 }
      );
      expect(fields[0]?.label).toBe('Duração');
    });
  });

  describe('formatAuditMetadata', () => {
    it('returns null when metadata is null', () => {
      expect(formatAuditMetadata(null)).toBeNull();
    });

    it('returns null when metadata is empty', () => {
      expect(formatAuditMetadata({})).toBeNull();
    });

    it('sanitizes sensitive keys in metadata', () => {
      const result = formatAuditMetadata({ token: 'abc123', reason: 'Test' });
      const tokenEntry = result?.find((e) => e.key === 'token' || e.value === '[REDACTED]');
      expect(tokenEntry?.value).toBe('[REDACTED]');
    });

    it('returns formatted key-value pairs', () => {
      const result = formatAuditMetadata({ batch_size: 5, reason: 'Test reason' });
      expect(result).toHaveLength(2);
      expect(result?.[0]?.value).toBe('5');
    });
  });

  describe('getAuditSummary', () => {
    it('returns combined action and entity label (event wording)', () => {
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
      expect(getAuditSummary(log)).toBe('Apontamento aprovado — Apontamento');
    });
  });
});
