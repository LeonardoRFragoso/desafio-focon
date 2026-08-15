import { describe, it, expect } from 'vitest';
import { mapDatabaseError } from './errors';

describe('mapDatabaseError — domain error mapping for time entry approval', () => {
  it('maps FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY to friendly message', () => {
    const err = new Error('FOCONFLOW_CANNOT_APPROVE_FUTURE_ENTRY: Não é possível aprovar um apontamento com data futura (2026-08-26). Corrija a data ou rejeite o apontamento.');
    const result = mapDatabaseError(err);
    expect(result).toContain('Não é possível aprovar este apontamento porque a data informada ainda não ocorreu');
    expect(result).not.toBe('Erro ao aprovar');
  });

  it('maps FOCONFLOW_FUTURE_DATE to friendly message', () => {
    const err = new Error('FOCONFLOW_FUTURE_DATE: Não é possível registrar horas em uma data futura (2026-08-26)');
    const result = mapDatabaseError(err);
    expect(result).toContain('Não é possível registrar horas em uma data futura');
  });

  it('maps FOCONFLOW_LATE_JUSTIFICATION to friendly message', () => {
    const err = new Error('FOCONFLOW_LATE_JUSTIFICATION: Este apontamento está sendo registrado com 10 dias de atraso.');
    const result = mapDatabaseError(err);
    expect(result).toContain('retroativo');
    expect(result).toContain('justificativa');
  });

  it('maps closed accounting period error', () => {
    const err = new Error('Cannot approve a time entry in a closed accounting period (2026-06)');
    const result = mapDatabaseError(err);
    expect(result).toContain('período contábil fechado');
  });

  it('maps "only pending can be approved" to already processed message', () => {
    const err = new Error('Only pending time entries can be approved (current: approved)');
    const result = mapDatabaseError(err);
    expect(result).toContain('já foi processado');
  });

  it('maps "only administrators can approve" to access denied message', () => {
    const err = new Error('Only administrators can approve time entries');
    const result = mapDatabaseError(err);
    expect(result).toContain('não possui permissão');
  });

  it('returns original message for unknown errors', () => {
    const err = new Error('Some unknown database error');
    const result = mapDatabaseError(err);
    expect(result).toBe('Some unknown database error');
  });

  it('returns empty string for null error', () => {
    expect(mapDatabaseError(null)).toBe('');
  });
});
