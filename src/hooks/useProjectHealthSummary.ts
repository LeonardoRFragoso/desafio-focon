import { useState, useCallback, useEffect } from 'react';
import { projectHealthAPI } from '@/lib/supabase/api';
import { mapDatabaseError, logError } from '@/lib/errors';
import type { ProjectHealthSummaryItem } from '@/types/database';

interface UseProjectHealthSummaryReturn {
  items: ProjectHealthSummaryItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
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
      // RPC returns JSONB; cast through unknown because Supabase types it as Json.
      setItems((data as unknown as ProjectHealthSummaryItem[]) ?? []);
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
