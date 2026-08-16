import { useNavigate } from 'react-router-dom';
import type { ProjectHealthSummaryItem } from '@/types/database';

interface ProjectHealthSummaryProps {
  /** Canonical project health items (shared with Projetos que exigem atenção). */
  items: ProjectHealthSummaryItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Compact health summary card for the admin dashboard.
 * Shows counts of at-risk / attention / healthy projects and links to the
 * full Project Health page.
 *
 * Derives from the SAME canonical source as "Projetos que exigem atenção"
 * so both widgets always agree. `not_calculated` (null) and `not_applicable`
 * are NOT counted as healthy.
 */
export function ProjectHealthSummary({ items, loading, error, onRetry }: ProjectHealthSummaryProps) {
  const navigate = useNavigate();

  const atRisk = items.filter((i) => i.health_status === 'at_risk');
  const attention = items.filter((i) => i.health_status === 'attention');
  const healthy = items.filter((i) => i.health_status === 'healthy');
  const notCalculated = items.filter((i) => i.health_status === null);

  if (loading) {
    return (
      <section aria-label="Saúde dos projetos" className="space-y-3">
        <h2 className="text-2xl font-semibold text-app-primary">Saúde dos Projetos</h2>
        <div className="h-24 rounded-xl border border-app-primary bg-surface-secondary animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Saúde dos projetos" className="space-y-3">
        <h2 className="text-2xl font-semibold text-app-primary">Saúde dos Projetos</h2>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
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
      <section aria-label="Saúde dos projetos" className="space-y-3">
        <h2 className="text-2xl font-semibold text-app-primary">Saúde dos Projetos</h2>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-6 text-center">
          <p className="text-sm text-app-muted">Nenhum projeto cadastrado</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Saúde dos projetos" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-app-primary">Saúde dos Projetos</h2>
        <button
          onClick={() => navigate('/admin/project-health')}
          className="text-sm text-focon-600 dark:text-focon-400 hover:underline"
        >
          Ver detalhes →
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/admin/project-health')}
          className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-left transition hover:border-red-300 dark:hover:border-red-700"
        >
          <p className="text-xs text-red-700 dark:text-red-300 font-medium uppercase tracking-wide">Em Risco</p>
          <p className="text-3xl font-bold text-red-700 dark:text-red-300 mt-1">{atRisk.length}</p>
          {atRisk.length > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
              {atRisk[0]?.name}{atRisk.length > 1 && ` +${atRisk.length - 1}`}
            </p>
          )}
        </button>
        <button
          onClick={() => navigate('/admin/project-health')}
          className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-left transition hover:border-amber-300 dark:hover:border-amber-700"
        >
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium uppercase tracking-wide">Em Atenção</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300 mt-1">{attention.length}</p>
          {attention.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 truncate">
              {attention[0]?.name}{attention.length > 1 && ` +${attention.length - 1}`}
            </p>
          )}
        </button>
        <button
          onClick={() => navigate('/admin/project-health')}
          className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-left transition hover:border-green-300 dark:hover:border-green-700"
        >
          <p className="text-xs text-green-700 dark:text-green-300 font-medium uppercase tracking-wide">Saudável</p>
          <p className="text-3xl font-bold text-green-700 dark:text-green-300 mt-1">{healthy.length}</p>
        </button>
      </div>
      {notCalculated.length > 0 && (
        <p className="text-xs text-app-muted">
          {notCalculated.length} projeto(s) sem cálculo de saúde — não contabilizados como saudáveis.
        </p>
      )}
    </section>
  );
}
