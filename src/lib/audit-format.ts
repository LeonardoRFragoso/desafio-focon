import type { AuditLog } from '@/types/database';

// ============================================================================
// P11 — ACTION WORDING (event-based, not command-based)
// ============================================================================

/**
 * Human-readable labels for audit log actions.
 * Uses EVENT wording (past tense — "Apontamento aprovado") rather than
 * command wording ("Aprovar apontamento") because the audit trail records
 * what HAPPENED, not what was requested.
 *
 * Unknown actions fall back to "Ação não reconhecida" (with the raw code
 * available in the technical section of the modal).
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  approve_time_entry: 'Apontamento aprovado',
  reject_time_entry: 'Apontamento rejeitado',
  batch_approve_time_entries: 'Apontamentos aprovados em lote',
  batch_reject_time_entries: 'Apontamentos rejeitados em lote',
  close_accounting_period: 'Período contábil fechado',
  reopen_accounting_period: 'Período contábil reaberto',
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
  return AUDIT_ACTION_LABELS[action] ?? 'Ação não reconhecida';
}

/**
 * Whether the action is known (has a human-readable label).
 * Used to decide whether to show the raw code in the technical section.
 */
export function isKnownAction(action: string): boolean {
  return action in AUDIT_ACTION_LABELS;
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

// ============================================================================
// P8 — RECURSIVE SANITIZATION OF SENSITIVE KEYS
// ============================================================================

/**
 * Keys whose values must be redacted from audit log display.
 * Matched case-insensitively against object keys.
 */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /^authorization$/i,
  /^access_token$/i,
  /^refresh_token$/i,
  /^token$/i,
  /^password$/i,
  /^passwd$/i,
  /^secret$/i,
  /^service_role$/i,
  /^service_role_key$/i,
  /^api_key$/i,
  /^apikey$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^signed_url$/i,
  /^signedurl$/i,
  /^private_url$/i,
  /^bearer$/i,
  /^credential$/i,
  /^private_key$/i,
  /^session_token$/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Recursively sanitize an unknown value, redacting any sensitive keys
 * found at any nesting level (objects, arrays, mixed structures).
 *
 * Returns a deep copy with sensitive values replaced by "[REDACTED]".
 * Non-object values are returned as-is.
 */
export function sanitizeAuditData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeAuditData(value);
    }
  }
  return result;
}

// ============================================================================
// P9 — DOMAIN-AWARE VALUE FORMATTERS
// ============================================================================

/**
 * Format a date string as a short pt-BR date/time in America/Sao_Paulo.
 */
export function formatAuditDateTime(d: string): string {
  return new Date(d).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * Format a date-only string (YYYY-MM-DD) as dd/MM/yyyy.
 */
function formatAuditDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  return d;
}

/**
 * Format duration in minutes as human-readable: 90 → "1h30", 60 → "1h".
 */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Format a monetary value in BRL: 150 → "R$ 150,00".
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Translate known enum values to Portuguese labels.
 */
const ENUM_LABELS: Record<string, string> = {
  // approval_status
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  // project status
  active: 'Ativo',
  planned: 'Planejado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  // accounting_period status
  open: 'Aberto',
  closed: 'Fechado',
  // budget_type
  labor_hours: 'Horas de trabalho',
  labor_cost: 'Custo de mão de obra',
  total_cost: 'Custo total',
  // alert metric
  margin_percent: 'Margem (%)',
  budget_utilization_percent: 'Utilização do orçamento (%)',
  // health_status
  healthy: 'Saudável',
  attention: 'Atenção',
  at_risk: 'Em risco',
  not_applicable: 'Não aplicável',
  not_calculated: 'Não calculado',
};

/**
 * Known field labels for the before/after data display.
 * Maps raw column names to human-readable Portuguese labels.
 */
const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  project_id: 'Projeto',
  professional_id: 'Profissional',
  entry_date: 'Data',
  duration_minutes: 'Duração',
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
  period_key: 'Período',
  period: 'Período',
  start_date: 'Data inicial',
  end_date: 'Data final',
  closed_at: 'Fechado em',
  closed_by: 'Fechado por',
  reopened_at: 'Reaberto em',
  reopened_by: 'Reaberto por',
  amount: 'Valor',
  budget_type: 'Tipo de orçamento',
  budget_value: 'Valor do orçamento',
  fiscal_year: 'Ano fiscal',
  threshold: 'Limite',
  metric: 'Métrica',
  triggered_at: 'Disparado em',
  acknowledged_by: 'Reconhecido por',
  acknowledged_at: 'Reconhecido em',
  threshold_percentage: 'Percentual limite',
  is_active: 'Ativo',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
  health_score: 'Pontuação de saúde',
  health_status: 'Status de saúde',
  progress_percent: 'Percentual de progresso',
  budget_utilization: 'Utilização do orçamento',
};

function getFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * Fields that should be formatted as duration (minutes).
 */
const DURATION_FIELDS = new Set(['duration_minutes']);

/**
 * Fields that should be formatted as currency (BRL).
 */
const CURRENCY_FIELDS = new Set([
  'applied_hourly_rate',
  'amount',
  'budget_value',
  'forecast_labor_cost',
  'indirect_cost',
  'contracted_revenue',
]);

/**
 * Fields that should be formatted as enum labels.
 */
const ENUM_FIELDS = new Set([
  'approval_status',
  'status',
  'budget_type',
  'metric',
  'health_status',
]);

/**
 * Fields that are date-only (YYYY-MM-DD), not timestamps.
 */
const DATE_ONLY_FIELDS = new Set([
  'entry_date',
  'start_date',
  'end_date',
  'valid_from',
  'valid_until',
  'next_run_date',
]);

/**
 * Format a single value for display, using domain-aware formatting
 * based on the field key.
 */
function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  // Duration fields
  if (DURATION_FIELDS.has(key) && typeof value === 'number') {
    return formatDuration(value);
  }

  // Currency fields
  if (CURRENCY_FIELDS.has(key) && typeof value === 'number') {
    return formatCurrency(value);
  }

  // Enum fields
  if (ENUM_FIELDS.has(key) && typeof value === 'string') {
    return ENUM_LABELS[value] ?? value;
  }

  // Date-only fields
  if (DATE_ONLY_FIELDS.has(key) && typeof value === 'string') {
    return formatAuditDate(value);
  }

  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Try to format ISO timestamp strings
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return formatAuditDateTime(value);
      } catch {
        return value;
      }
    }
    // Try date-only format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return formatAuditDate(value);
    }
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(sanitizeAuditData(value), null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ============================================================================
// DIFF (before/after comparison with sanitization + domain formatting)
// ============================================================================

export interface AuditDataField {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

/**
 * Compare before_data and after_data and return a list of fields with
 * human-readable labels, domain-formatted before/after values, and a
 * changed flag. Both inputs are recursively sanitized before comparison.
 */
export function diffAuditData(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): AuditDataField[] {
  const safeBefore = sanitizeAuditData(before) as Record<string, unknown> | null;
  const safeAfter = sanitizeAuditData(after) as Record<string, unknown> | null;

  const allKeys = new Set([...Object.keys(safeBefore ?? {}), ...Object.keys(safeAfter ?? {})]);
  const fields: AuditDataField[] = [];

  for (const key of allKeys) {
    const beforeVal = safeBefore?.[key] ?? null;
    const afterVal = safeAfter?.[key] ?? null;
    const beforeStr = formatFieldValue(key, beforeVal);
    const afterStr = formatFieldValue(key, afterVal);
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
 * Values are recursively sanitized.
 */
export function formatAuditMetadata(
  metadata: Record<string, unknown> | null
): { key: string; value: string }[] | null {
  const safe = sanitizeAuditData(metadata) as Record<string, unknown> | null;
  if (!safe || Object.keys(safe).length === 0) return null;
  return Object.entries(safe).map(([key, value]) => ({
    key: getFieldLabel(key),
    value: formatFieldValue(key, value),
  }));
}

// ============================================================================
// P10 — ID RESOLUTION HELPERS
// ============================================================================

/**
 * Fields that contain UUID references to other entities.
 * Used by the UI to resolve IDs to human-readable names when possible.
 */
const RELATIONAL_ID_FIELDS: Record<string, { table: string; label: string }> = {
  project_id: { table: 'projects', label: 'Projeto' },
  professional_id: { table: 'profiles', label: 'Profissional' },
  phase_id: { table: 'project_phases', label: 'Fase' },
  task_id: { table: 'project_tasks', label: 'Tarefa' },
  closed_by: { table: 'profiles', label: 'Fechado por' },
  rejected_by: { table: 'profiles', label: 'Rejeitado por' },
  acknowledged_by: { table: 'profiles', label: 'Reconhecido por' },
  uploaded_by: { table: 'profiles', label: 'Enviado por' },
};

/**
 * Get relational metadata for a field key, if it's a known relational ID.
 */
export function getRelationalField(key: string): { table: string; label: string } | null {
  return RELATIONAL_ID_FIELDS[key] ?? null;
}

/**
 * Get a human-readable summary for an audit log entry.
 * E.g. "Apontamento aprovado — Apontamento"
 */
export function getAuditSummary(log: AuditLog): string {
  return `${getAuditActionLabel(log.action)} — ${getAuditEntityLabel(log.entity_type)}`;
}
