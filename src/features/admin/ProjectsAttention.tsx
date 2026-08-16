import { useNavigate } from 'react-router-dom';
import type { ProjectHealthSummaryItem } from '@/types/database';
import type { HealthStatus } from '@/types/database';

const HEALTH_STYLES = {
  at_risk: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'EM RISCO', icon: '🔴' },
  attention: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'EM ATENÇÃO', icon: '🟡' },
  healthy: { badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: 'SAUDÁVEL', icon: '🟢' },
  not_calculated: { badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300', label: 'NÃO CALCULADO', icon: '⚪' },
} as const;

type HealthBadgeKey = keyof typeof HEALTH_STYLES;

function badgeKeyFor(status: HealthStatus | null): HealthBadgeKey {
  if (status === null) return 'not_calculated';
  if (status in HEALTH_STYLES) return status as HealthBadgeKey;
  return 'not_calculated';
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(0)}%`;
}

interface ProjectsAttentionProps {
  /** Canonical project health items (shared with Saúde dos Projetos widget). */
  items: ProjectHealthSummaryItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * "Projetos que exigem atenção" — lists projects whose canonical health status
 * is `at_risk` or `attention`. Derives from the SAME source as the
 * "Saúde dos Projetos" summary widget so both always agree.
 *
 * `not_calculated` (null) and `not_applicable` are NOT counted as healthy.
 */
export function ProjectsAttention({ items, loading, error, onRetry }: ProjectsAttentionProps) {
  const navigate = useNavigate();

  // Projects requiring attention = at_risk OR attention (canonical health status)
  const attentionProjects = items.filter(
    (p) => p.health_status === 'at_risk' || p.health_status === 'attention'
  );
  const healthyCount = items.filter((p) => p.health_status === 'healthy').length;
  const notCalculatedCount = items.filter((p) => p.health_status === null).length;

  if (loading) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="h-48 rounded-xl border border-app-primary bg-surface-secondary animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
            <button
              onClick={onRetry}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-6 text-center">
          <p className="text-sm text-app-muted">Nenhum projeto cadastrado</p>
        </div>
      </section>
    );
  }

  if (attentionProjects.length === 0) {
    const healthyText = healthyCount > 0 ? `(${healthyCount} projeto(s) saudável(is))` : '';
    const notCalculatedText =
      notCalculatedCount > 0 ? `, ${notCalculatedCount} sem cálculo de saúde` : '';
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Nenhum projeto requer atenção {healthyText}{notCalculatedText}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Projetos que exigem atenção" className="space-y-4">
      <h2 className="text-2xl font-semibold text-app-primary">
        Projetos que exigem atenção
      </h2>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-app-primary bg-surface-primary">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-primary text-left text-xs text-app-muted uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Projeto</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Progresso</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Tarefas atrasadas</th>
              <th className="px-4 py-3 font-medium">Marcos atrasados</th>
              <th className="px-4 py-3 font-medium">Saúde</th>
            </tr>
          </thead>
          <tbody>
            {attentionProjects.map((p) => {
              const style = HEALTH_STYLES[badgeKeyFor(p.health_status)];
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="border-b border-app-primary cursor-pointer hover:bg-hover-surface/50 transition"
                >
                  <td className="px-4 py-3 font-medium text-app-primary">{p.name}</td>
                  <td className="px-4 py-3 text-app-muted">{p.client}</td>
                  <td className="px-4 py-3 text-app-muted capitalize">{p.project_status}</td>
                  <td className="px-4 py-3 text-app-muted">{formatPercent(p.progress_percent)}</td>
                  <td className="px-4 py-3 text-app-muted">{formatPercent(p.budget_utilization)}</td>
                  <td className="px-4 py-3">
                    {p.overdue_tasks_count > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">{p.overdue_tasks_count}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.overdue_milestones_count > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">{p.overdue_milestones_count}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded ${style.badge}`}>
                      {style.icon} {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {attentionProjects.map((p) => {
          const style = HEALTH_STYLES[badgeKeyFor(p.health_status)];
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="rounded-xl border border-app-primary bg-surface-primary p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50 transition"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-medium text-app-primary truncate">{p.name}</p>
                  <p className="text-xs text-app-muted truncate">{p.client}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded shrink-0 ${style.badge}`}>
                  {style.icon} {style.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-app-muted">
                <div>
                  <p className="text-slate-400">Progresso</p>
                  <p className="font-medium text-app-secondary">{formatPercent(p.progress_percent)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Budget</p>
                  <p className="font-medium text-app-secondary">{formatPercent(p.budget_utilization)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Atrasadas</p>
                  <p className={`font-medium ${p.overdue_tasks_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-app-secondary'}`}>
                    {p.overdue_tasks_count}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
