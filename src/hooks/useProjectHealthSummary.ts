import { useState, useCallback, useEffect } from 'react';
import { projectHealthAPI } from '@/lib/supabase/api';
import { mapDatabaseError, logError } from '@/lib/errors';
import type { ProjectHealthSummaryItem, HealthStatus } from '@/types/database';

interface UseProjectHealthSummaryReturn {
  items: ProjectHealthSummaryItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const VALID_HEALTH_STATUSES: readonly HealthStatus[] = [
  'healthy',
  'attention',
  'at_risk',
  'not_applicable',
];

/**
 * Type guard: validate that an unknown value is a HealthStatus.
 */
function isHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === 'string' && (VALID_HEALTH_STATUSES as readonly string[]).includes(value);
}

/**
 * Safely parse the JSONB result of `get_projects_health_summary` RPC into
 * `ProjectHealthSummaryItem[]`. Each row is validated field-by-field;
 * invalid rows are filtered out rather than crashing the UI.
 *
 * This replaces the previous unsafe `as unknown as ProjectHealthSummaryItem[]`
 * cast with a proper runtime parser.
 */
function parseHealthSummary(data: unknown): ProjectHealthSummaryItem[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((row): ProjectHealthSummaryItem | null => {
      if (typeof row !== 'object' || row === null) return null;

      const r = row as Record<string, unknown>;

      // Required string fields
      if (typeof r['id'] !== 'string' || typeof r['name'] !== 'string') return null;

      // health_status can be null (not_calculated) or a valid status string
      const healthStatus = r['health_status'];
      if (healthStatus !== null && !isHealthStatus(healthStatus)) return null;

      return {
        id: r['id'] as string,
        name: r['name'] as string,
        client: typeof r['client'] === 'string' ? r['client'] : '',
        project_status: typeof r['project_status'] === 'string' ? r['project_status'] : '',
        start_date: typeof r['start_date'] === 'string' ? r['start_date'] : '',
        end_date: typeof r['end_date'] === 'string' ? r['end_date'] : '',
        health_score:
          typeof r['health_score'] === 'number' ? r['health_score'] : null,
        health_status: healthStatus as HealthStatus | null,
        has_calculated_state: typeof r['has_calculated_state'] === 'boolean' ? r['has_calculated_state'] : false,
        progress_percent:
          typeof r['progress_percent'] === 'number' ? r['progress_percent'] : null,
        budget_utilization:
          typeof r['budget_utilization'] === 'number' ? r['budget_utilization'] : null,
        forecast_completion_date:
          typeof r['forecast_completion_date'] === 'string' ? r['forecast_completion_date'] : null,
        forecast_labor_cost:
          typeof r['forecast_labor_cost'] === 'number' ? r['forecast_labor_cost'] : null,
        calculated_at:
          typeof r['calculated_at'] === 'string' ? r['calculated_at'] : null,
        overdue_milestones_count:
          typeof r['overdue_milestones_count'] === 'number' ? r['overdue_milestones_count'] : 0,
        overdue_tasks_count:
          typeof r['overdue_tasks_count'] === 'number' ? r['overdue_tasks_count'] : 0,
        total_milestones:
          typeof r['total_milestones'] === 'number' ? r['total_milestones'] : 0,
      };
    })
    .filter((item): item is ProjectHealthSummaryItem => item !== null);
}

/**
 * Single canonical source of project health for the admin dashboard.
 *
 * Both "Projetos que exigem atenção" and "Saúde dos Projetos" widgets MUST
 * derive from this hook so they always reflect the same domain truth
 * (`get_projects_health_summary` RPC / `project_health_states` table).
 *
 * Health status semantics:
 * - `healthy`        — calculated and within safe thresholds
 * - `attention`      — calculated and approaching a threshold
 * - `at_risk`        — calculated and breaching a threshold
 * - `null`           — not_calculated (active/planned project with no persisted state)
 * - `not_applicable` — completed/cancelled project (excluded from the summary RPC)
 *
 * `null` (not_calculated) and `not_applicable` MUST NOT be counted as healthy.
 */
export function useProjectHealthSummary(): UseProjectHealthSummaryReturn {
  const [items, setItems] = useState<ProjectHealthSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const { data, error: rpcError } = await projectHealthAPI.getSummary();
      if (rpcError) throw rpcError;
      // RPC returns JSONB; parse and validate each row at runtime instead
      // of using an unsafe `as unknown as` cast.
      setItems(parseHealthSummary(data));
    } catch (err) {
      const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar saúde dos projetos';
      setError(message);
      logError(err, 'useProjectHealthSummary.fetchSummary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary();
  }, [fetchSummary]);

  return {
    items,
    loading,
    error,
    refetch: fetchSummary,
  };
}
