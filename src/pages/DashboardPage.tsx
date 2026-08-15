import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminActionCenter } from '@/features/admin/AdminActionCenter';
import { ExecutiveKpis } from '@/features/admin/ExecutiveKpis';
import { ExecutivePeriodSelector, getPeriodRange, type PeriodPreset } from '@/features/admin/ExecutivePeriodSelector';
import { ProjectsAttention } from '@/features/admin/ProjectsAttention';
import { ApprovalQueueSummary } from '@/features/admin/ApprovalQueueSummary';
import { FinancialOverview } from '@/features/admin/FinancialOverview';
import { TeamOverview } from '@/features/admin/TeamOverview';
import { AdminExcelExportButton } from '@/features/admin/AdminExcelExportButton';
import { commandCenterAPI, capacityAPI } from '@/lib/supabase/api';
import type { AdminCommandCenterSummary } from '@/lib/supabase/api';
import type { CapacityOverview } from '@/types/database';
import { mapDatabaseError } from '@/lib/errors';

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPreset = (searchParams.get('period') as PeriodPreset) ?? '30d';
  const [preset, setPreset] = useState<PeriodPreset>(initialPreset);
  const [range, setRange] = useState(() => getPeriodRange(initialPreset));
  const [summary, setSummary] = useState<AdminCommandCenterSummary | null>(null);
  const [overloadedCount, setOverloadedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Sync period to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (preset !== '30d') {
      params.set('period', preset);
    } else {
      params.delete('period');
    }
    setSearchParams(params, { replace: true });
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePeriodChange = useCallback((newPreset: PeriodPreset, newRange: typeof range) => {
    setPreset(newPreset);
    setRange(newRange);
  }, []);

  // Single fetch for admin summary — passed to all child components
  // Also fetch capacity overview for the overloaded signal (non-blocking)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    commandCenterAPI
      .getAdminSummary(range.start_date, range.end_date)
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) throw new Error(mapDatabaseError(rpcError));
        setSummary(data as unknown as AdminCommandCenterSummary);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard');
          setSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Capacity overview (current week) — non-blocking, just for the signal
    capacityAPI
      .getOverview()
      .then(({ data }) => {
        if (cancelled) return;
        const overview = data as CapacityOverview | null;
        setOverloadedCount(overview?.summary?.overloaded_count ?? 0);
      })
      .catch(() => {
        // Non-critical — don't surface capacity errors in the main dashboard
      });
    return () => { cancelled = true; };
  }, [range.start_date, range.end_date, refreshKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-app-primary pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-app-primary">Painel Administrativo</h1>
          <p className="mt-2 text-lg text-app-muted">
            Centro de comando executivo
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ExecutivePeriodSelector preset={preset} onChange={handlePeriodChange} />
          <AdminExcelExportButton filters={{ projectId: '', projectName: '', professionalId: '', professionalName: '', startDate: range.start_date, endDate: range.end_date }} />
        </div>
      </div>

      {/* Error banner (global fetch error) */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">Dados indisponíveis: {error}</p>
            <button
              onClick={handleRefresh}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Action Center — receives summary from single fetch, no duplicate RPC */}
      <AdminActionCenter
        summary={summary}
        loading={loading}
        error={error}
        onRetry={handleRefresh}
        overloadedProfessionalsCount={overloadedCount}
      />

      {/* Executive KPIs — ERROR state shows error, not zeros */}
      <ExecutiveKpis
        kpis={summary?.kpis ?? null}
        loading={loading}
        error={error}
        onRetry={handleRefresh}
      />

      {/* Projects that need attention — separate RPC (different data shape) */}
      <ProjectsAttention />

      {/* Approval queue summary — from same summary */}
      <ApprovalQueueSummary summary={summary} loading={loading} error={error} onRetry={handleRefresh} />

      {/* Financial overview — from same summary */}
      <FinancialOverview summary={summary} loading={loading} error={error} onRetry={handleRefresh} />

      {/* Team overview — from same summary */}
      <TeamOverview summary={summary} loading={loading} error={error} onRetry={handleRefresh} />
    </div>
  );
}
