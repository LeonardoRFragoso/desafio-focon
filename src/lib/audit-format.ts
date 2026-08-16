import type { AuditLog } from '@/types/database';

/**
 * Human-readable labels for audit log actions.
 * Maps the raw `action` string stored in the database to a Portuguese label
 * shown in the UI. Falls back to the raw action if unknown.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  approve_time_entry: 'Aprovar apontamento',
  reject_time_entry: 'Rejeitar apontamento',
  batch_approve_time_entries: 'Aprovar apontamentos em lote',
  batch_reject_time_entries: 'Rejeitar apontamentos em lote',
  close_accounting_period: 'Fechar período contábil',
  reopen_accounting_period: 'Reabrir período contábil',
};

/**
 * Human-readable labels for audit log entity types.
 */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  time_entry: 'Apontamento',
  accounting_period: 'Período contábil',
  project: 'Projeto',
  project_budget: 'Orçamento de projeto',
  profitability_alert: 'Alerta de rentabilidade',
  recurring_rule: 'Regra recorrente',
  capacity_rule: 'Regra de capacidade',
  capacity_allocation: 'Alocação de capacidade',
  hourly_rate: 'Taxa horária',
  project_member: 'Membro do projeto',
};

/**
 * Color variants for action types, used for badges in the list and modal.
 */
export type AuditActionColor = 'green' | 'red' | 'blue' | 'orange' | 'gray';

export const AUDIT_ACTION_COLORS: Record<string, AuditActionColor> = {
  approve_time_entry: 'green',
  batch_approve_time_entries: 'green',
  reject_time_entry: 'red',
  batch_reject_time_entries: 'red',
  close_accounting_period: 'orange',
  reopen_accounting_period: 'blue',
};

export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function getAuditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

export function getAuditActionColor(action: string): AuditActionColor {
  return AUDIT_ACTION_COLORS[action] ?? 'gray';
}

/**
 * Badge classes for each action color, compatible with dark mode.
 */
export const AUDIT_COLOR_BADGE_CLASSES: Record<AuditActionColor, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

/**
 * Format a date string as a short pt-BR date/time.
 */
export function formatAuditDateTime(d: string): string {
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Known field labels for the before/after data display.
 * Maps raw column names to human-readable Portuguese labels.
 */
const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  project_id: 'Projeto',
  professional_id: 'Profissional',
  entry_date: 'Data',
  duration_minutes: 'Duração (min)',
  description: 'Descrição',
  approval_status: 'Status de aprovação',
  applied_hourly_rate: 'Valor/hora aplicado',
  rejection_reason: 'Motivo da rejeição',
  rejected_by: 'Rejeitado por',
  rejected_at: 'Rejeitado em',
  late_submission_reason: 'Justificativa retroativa',
  phase_id: 'Fase',
  task_id: 'Tarefa',
  status: 'Status',
  name: 'Nome',
  period: 'Período',
  start_date: 'Data inicial',
  end_date: 'Data final',
  closed_at: 'Fechado em',
  closed_by: 'Fechado por',
  reopened_at: 'Reaberto em',
  reopened_by: 'Reaberto por',
  amount: 'Valor',
  threshold_percentage: 'Percentual limite',
  is_active: 'Ativo',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
};

function getFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * Format a single value for display.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Try to format ISO date strings
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return formatAuditDateTime(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export interface AuditDataField {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

/**
 * Compare before_data and after_data and return a list of fields with
 * human-readable labels, before/after values, and a changed flag.
 *
 * Only fields present in either before or after are included. Fields that
 * changed are marked so the UI can highlight them.
 */
export function diffAuditData(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): AuditDataField[] {
  const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const fields: AuditDataField[] = [];

  for (const key of allKeys) {
    const beforeVal = before?.[key] ?? null;
    const afterVal = after?.[key] ?? null;
    const beforeStr = formatValue(beforeVal);
    const afterStr = formatValue(afterVal);
    const changed = beforeStr !== afterStr;

    fields.push({
      key,
      label: getFieldLabel(key),
      before: beforeStr,
      after: afterStr,
      changed,
    });
  }

  // Sort: changed fields first, then alphabetical by label
  fields.sort((a, b) => {
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return fields;
}

/**
 * Format metadata for display. Returns null if no metadata.
 */
export function formatAuditMetadata(
  metadata: Record<string, unknown> | null
): { key: string; value: string }[] | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return Object.entries(metadata).map(([key, value]) => ({
    key: getFieldLabel(key),
    value: formatValue(value),
  }));
}

/**
 * Get a human-readable summary for an audit log entry.
 * E.g. "Aprovar apontamento — Apontamento"
 */
export function getAuditSummary(log: AuditLog): string {
  return `${getAuditActionLabel(log.action)} — ${getAuditEntityLabel(log.entity_type)}`;
}
