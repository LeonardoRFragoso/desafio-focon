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
import { commandCenterAPI } from '@/lib/supabase/api';
import type { AdminCommandCenterSummary } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPreset = (searchParams.get('period') as PeriodPreset) ?? '30d';
  const [preset, setPreset] = useState<PeriodPreset>(initialPreset);
  const [range, setRange] = useState(() => getPeriodRange(initialPreset));
  const [summary, setSummary] = useState<AdminCommandCenterSummary | null>(null);
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

  // Fetch admin summary
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [range.start_date, range.end_date, refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Painel Administrativo</h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
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
            <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
            <button
              onClick={handleRefresh}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Action Center — first fold */}
      <AdminActionCenter
        startDate={range.start_date}
        endDate={range.end_date}
        onRefreshKey={refreshKey}
      />

      {/* Executive KPIs */}
      <ExecutiveKpis kpis={summary?.kpis ?? {
        total_revenue: 0, total_labor_cost: 0, total_result: 0, total_margin: 0,
        approved_hours_period: 0, active_projects: 0, pending_approvals: 0,
        open_tasks: 0, overdue_tasks: 0,
      }} loading={loading} />

      {/* Projects that need attention */}
      <ProjectsAttention />

      {/* Approval queue summary */}
      <ApprovalQueueSummary summary={summary} loading={loading} />

      {/* Financial overview */}
      <FinancialOverview summary={summary} loading={loading} />

      {/* Team overview */}
      <TeamOverview summary={summary} loading={loading} />
    </div>
  );
}
