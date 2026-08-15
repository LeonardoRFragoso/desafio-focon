import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectHealthAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { ProjectHealthDetailsModal } from '@/features/project-workspace/ProjectHealthDetailsModal';
import type { ProjectHealthSummaryItem, HealthStatus } from '@/types/database';

/**
 * Visual styles per health status. `not_calculated` is a synthetic key used
 * when `health_status` is null (no state row exists yet). It MUST be shown
 * as "Não calculado" — distinct from `not_applicable` ("Não Aplicável",
 * used for completed/cancelled projects).
 */
const HEALTH_STYLES: Record<HealthStatus | 'not_calculated', { badge: string; label: string; icon: string }> = {
  healthy: { badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: 'Saudável', icon: '🟢' },
  attention: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'Em Atenção', icon: '🟡' },
  at_risk: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'Em Risco', icon: '🔴' },
  not_applicable: { badge: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-muted', label: 'Não Aplicável', icon: '⚪' },
  not_calculated: { badge: 'bg-slate-100 text-slate-500 bg-surface-secondary text-app-muted', label: 'Não calculado', icon: '❓' },
};

/**
 * Resolve the display key for a summary item. Returns `not_calculated` when
 * the project has no health state yet (health_status is null), otherwise
 * returns the concrete status.
 */
function displayStatus(item: ProjectHealthSummaryItem): HealthStatus | 'not_calculated' {
  if (item.health_status === null) return 'not_calculated';
  return item.health_status;
}

const FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'at_risk', label: 'Em Risco' },
  { value: 'attention', label: 'Em Atenção' },
  { value: 'healthy', label: 'Saudável' },
  { value: 'not_calculated', label: 'Não calculado' },
];

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

export function ProjectHealthPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProjectHealthSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [recalculatingAll, setRecalculatingAll] = useState(false);
  const [detailProject, setDetailProject] = useState<{ id: string; name: string } | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectHealthAPI.getSummary(filter || undefined);
      if (err) throw err;
      // RPC returns JSONB; cast through unknown because Supabase types it as Json.
      setItems((data as unknown as ProjectHealthSummaryItem[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar saúde dos projetos');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary();
  }, [fetchSummary]);

  const handleRecalculateAll = async () => {
    setRecalculatingAll(true);
    setError(null);
    try {
      const { error: err } = await projectHealthAPI.recalculateAll();
      if (err) throw err;
      await fetchSummary();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao recalcular');
    } finally {
      setRecalculatingAll(false);
    }
  };

  // Summary stats
  const stats = {
    total: items.length,
    at_risk: items.filter((i) => i.health_status === 'at_risk').length,
    attention: items.filter((i) => i.health_status === 'attention').length,
    healthy: items.filter((i) => i.health_status === 'healthy').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-primary">Saúde dos Projetos</h1>
          <p className="text-sm text-app-muted mt-1">
            Visão consolidada da saúde de todos os projetos ativos e planejados.
          </p>
        </div>
        <button
          onClick={handleRecalculateAll}
          disabled={recalculatingAll}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm disabled:opacity-50"
        >
          {recalculatingAll ? 'Recalculando...' : '🔄 Recalcular Todos'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-app-primary bg-surface-primary p-4">
          <p className="text-xs text-app-muted">Total</p>
          <p className="text-2xl font-bold text-app-primary mt-1">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-xs text-red-700 dark:text-red-300">Em Risco</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{stats.at_risk}</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-xs text-amber-700 dark:text-amber-300">Em Atenção</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.attention}</p>
        </div>
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
          <p className="text-xs text-green-700 dark:text-green-300">Saudável</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{stats.healthy}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-app-muted">Filtrar:</span>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              filter === opt.value
                ? 'bg-focon-600 text-white'
                : 'bg-surface-secondary text-app-secondary hover:bg-hover-surface'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
            <button
              onClick={fetchSummary}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-app-primary bg-surface-primary p-6 text-center">
          <p className="text-sm text-app-muted">Nenhum projeto encontrado com o filtro selecionado.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-app-primary bg-surface-primary">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-primary text-left text-xs text-app-muted uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Projeto</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Progresso</th>
                  <th className="px-4 py-3 font-medium">Marcos Atrasados</th>
                  <th className="px-4 py-3 font-medium">Tarefas Atrasadas</th>
                  <th className="px-4 py-3 font-medium">Previsão</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const style = HEALTH_STYLES[displayStatus(item)];
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-app-primary last:border-0 hover:bg-hover-surface/50 transition cursor-pointer"
                      onClick={() => setDetailProject({ id: item.id, name: item.name })}
                    >
                      <td className="px-4 py-3 font-medium text-app-primary">{item.name}</td>
                      <td className="px-4 py-3 text-app-muted">{item.client}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-app-primary">{item.health_score ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded ${style.badge}`}>
                          {style.icon} {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-app-muted">
                        {item.progress_percent !== null ? `${item.progress_percent.toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {item.overdue_milestones_count > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">{item.overdue_milestones_count}</span>
                        ) : (
                          <span className="text-app-muted">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.overdue_tasks_count > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">{item.overdue_tasks_count}</span>
                        ) : (
                          <span className="text-app-muted">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-app-muted text-xs">
                        {item.forecast_completion_date ? formatDate(item.forecast_completion_date) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailProject({ id: item.id, name: item.name });
                            }}
                            className="text-xs text-focon-600 dark:text-focon-400 hover:underline"
                          >
                            Detalhes
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/projects/${item.id}`);
                            }}
                            className="text-xs text-app-muted hover:text-focon-600 dark:hover:text-focon-400"
                          >
                            Abrir →
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {items.map((item) => {
              const style = HEALTH_STYLES[displayStatus(item)];
              return (
                <div
                  key={item.id}
                  onClick={() => setDetailProject({ id: item.id, name: item.name })}
                  className="rounded-xl border border-app-primary bg-surface-primary p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50 transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-app-primary truncate">{item.name}</p>
                      <p className="text-xs text-app-muted truncate">{item.client}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded shrink-0 ${style.badge}`}>
                      {style.icon} {item.health_score ?? '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-app-muted">
                    <div>
                      <span>Progresso</span>
                      <p className="font-medium text-app-secondary">
                        {item.progress_percent !== null ? `${item.progress_percent.toFixed(0)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <span>Marcos atrasados</span>
                      <p className={`font-medium ${item.overdue_milestones_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-app-secondary'}`}>
                        {item.overdue_milestones_count}
                      </p>
                    </div>
                    <div>
                      <span>Tarefas atrasadas</span>
                      <p className={`font-medium ${item.overdue_tasks_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-app-secondary'}`}>
                        {item.overdue_tasks_count}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Detail modal */}
      <ProjectHealthDetailsModal
        open={!!detailProject}
        onClose={() => setDetailProject(null)}
        projectId={detailProject?.id ?? ''}
        projectName={detailProject?.name ?? ''}
        isAdmin={true}
      />
    </div>
  );
}
