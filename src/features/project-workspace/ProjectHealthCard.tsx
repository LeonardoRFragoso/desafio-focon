import { useState, useEffect, useCallback } from 'react';
import { projectHealthAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import type { ProjectHealthState, HealthStatus } from '@/types/database';

interface ProjectHealthCardProps {
  projectId: string;
  isAdmin: boolean;
  onOpenDetails?: (() => void) | undefined;
}

const HEALTH_STYLES: Record<HealthStatus, { badge: string; label: string; icon: string; bar: string }> = {
  healthy: {
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    label: 'Saudável',
    icon: '🟢',
    bar: 'bg-green-500',
  },
  attention: {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    label: 'Em Atenção',
    icon: '🟡',
    bar: 'bg-amber-500',
  },
  at_risk: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    label: 'Em Risco',
    icon: '🔴',
    bar: 'bg-red-500',
  },
  not_applicable: {
    badge: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-muted',
    label: 'Não Aplicável',
    icon: '⚪',
    bar: 'bg-slate-400',
  },
};

/**
 * Resolve the display key for a health state. `not_calculated` is a
 * synthetic key used when `status` is null (no state row exists yet). It
 * MUST be shown as "Não calculado" — distinct from `not_applicable`
 * ("Não Aplicável", used for completed/cancelled projects).
 */
function displayStatus(status: HealthStatus | null): HealthStatus | 'not_calculated' {
  if (status === null) return 'not_calculated';
  return status;
}

const NOT_CALCULATED_STYLE = {
  badge: 'bg-slate-100 text-slate-500 bg-surface-secondary text-app-muted',
  label: 'Não calculado',
  icon: '❓',
  bar: 'bg-slate-300',
} as const;

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

function formatRelative(d: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'amanhã';
  if (diffDays === -1) return 'ontem';
  if (diffDays > 0) return `em ${diffDays} dias`;
  return `há ${Math.abs(diffDays)} dias`;
}

export function ProjectHealthCard({ projectId, isAdmin, onOpenDetails }: ProjectHealthCardProps) {
  const [health, setHealth] = useState<ProjectHealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectHealthAPI.get(projectId);
      if (err) throw err;
      // RPC returns JSONB; cast through unknown because Supabase types it as Json.
      setHealth(data as unknown as ProjectHealthState | null);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar saúde do projeto');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHealth();
  }, [fetchHealth]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);
    try {
      const { error: err } = await projectHealthAPI.recalculate(projectId);
      if (err) throw err;
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao recalcular saúde');
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-app-primary bg-surface-primary p-4">
        <div className="h-24 animate-pulse rounded bg-surface-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!health || !health.status) {
    return (
      <div className="rounded-xl border border-app-primary bg-surface-primary p-4">
        <h3 className="text-sm font-semibold text-app-secondary mb-2">Saúde do Projeto</h3>
        <p className="text-sm text-app-muted">
          Saúde ainda não calculada.
          {isAdmin && (
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="ml-2 text-focon-600 dark:text-focon-400 hover:underline disabled:opacity-50"
            >
              {recalculating ? 'Calculando...' : 'Calcular agora'}
            </button>
          )}
        </p>
      </div>
    );
  }

  const statusKey = displayStatus(health.status);
  const style = statusKey === 'not_calculated' ? NOT_CALCULATED_STYLE : HEALTH_STYLES[health.status];
  const isNotApplicable = health.status === 'not_applicable';
  const score = isNotApplicable ? null : health.score;

  return (
    <div className="rounded-xl border border-app-primary bg-surface-primary p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-secondary">Saúde do Projeto</h3>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="text-xs text-app-muted hover:text-focon-600 dark:hover:text-focon-400 disabled:opacity-50 transition"
              title="Recalcular saúde"
            >
              {recalculating ? '⏳' : '🔄'} {recalculating ? 'Calculando...' : 'Recalcular'}
            </button>
          )}
          {onOpenDetails && (
            <button
              onClick={onOpenDetails}
              className="text-xs text-focon-600 dark:text-focon-400 hover:underline"
            >
              Ver detalhes →
            </button>
          )}
        </div>
      </div>

      {/* Score + Status */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            {isNotApplicable ? (
              <span className="text-3xl font-bold text-app-muted">—</span>
            ) : (
              <>
                <span className="text-3xl font-bold text-app-primary">{score}</span>
                <span className="text-sm text-app-muted">/100</span>
              </>
            )}
          </div>
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${style.badge}`}>
              {style.icon} {style.label}
            </span>
          </div>
        </div>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${style.bar}`}
              style={{ width: isNotApplicable ? '0%' : `${score ?? 0}%` }}
            />
          </div>
          {health.progress !== null && (
            <p className="text-xs text-app-muted mt-2">
              Progresso: <span className="font-medium text-app-secondary">{health.progress.toFixed(0)}%</span>
            </p>
          )}
        </div>
      </div>

      {/* Drivers summary (admin sees more) */}
      {health.drivers && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {health.drivers.schedule && (
            <div className="rounded-lg bg-surface-secondary p-2">
              <p className="text-app-muted">Cronograma</p>
              <p className={`font-medium ${health.drivers.schedule.penalty > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-app-secondary'}`}>
                -{health.drivers.schedule.penalty} pts
                {health.drivers.schedule.overdue_milestones > 0 && ` · ${health.drivers.schedule.overdue_milestones} marco(s) atrasado(s)`}
              </p>
            </div>
          )}
          {health.drivers.critical_delivery && (
            <div className="rounded-lg bg-surface-secondary p-2">
              <p className="text-app-muted">Entrega Crítica</p>
              <p className={`font-medium ${health.drivers.critical_delivery.penalty > 0 ? 'text-red-600 dark:text-red-400' : 'text-app-secondary'}`}>
                -{health.drivers.critical_delivery.penalty} pts
              </p>
            </div>
          )}
          {isAdmin && health.drivers.budget && (
            <div className="rounded-lg bg-surface-secondary p-2">
              <p className="text-app-muted">Orçamento</p>
              <p className={`font-medium ${health.drivers.budget.penalty > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-app-secondary'}`}>
                -{health.drivers.budget.penalty} pts
                {health.drivers.budget.utilization !== null && ` · ${health.drivers.budget.utilization.toFixed(0)}%`}
              </p>
            </div>
          )}
          {isAdmin && health.drivers.profitability && (
            <div className="rounded-lg bg-surface-secondary p-2">
              <p className="text-app-muted">Rentabilidade</p>
              <p className={`font-medium ${health.drivers.profitability.penalty > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-app-secondary'}`}>
                -{health.drivers.profitability.penalty} pts
                {health.drivers.profitability.active_alerts > 0 && ` · ${health.drivers.profitability.active_alerts} alerta(s)`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hard override warning */}
      {health.drivers?.hard_override && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2">
          <p className="text-xs font-medium text-red-800 dark:text-red-400">
            ⚠️ Risco crítico detectado ({health.drivers.hard_override})
          </p>
        </div>
      )}

      {/* Forecast (admin only) */}
      {isAdmin && (health.forecast_completion_date || health.forecast_labor_cost !== null) && (
        <div className="border-t border-app-primary pt-3 space-y-1">
          <p className="text-xs font-semibold text-app-secondary">Previsão</p>
          {health.forecast_completion_date && (
            <p className="text-xs text-app-muted">
              Conclusão estimada: <span className="font-medium text-app-secondary">{formatDate(health.forecast_completion_date)}</span>
              <span className="text-app-muted"> ({formatRelative(health.forecast_completion_date)})</span>
            </p>
          )}
          {health.forecast_labor_cost !== null && (
            <p className="text-xs text-app-muted">
              Custo de mão de obra projetado: <span className="font-medium text-app-secondary">{formatCurrency(health.forecast_labor_cost)}</span>
            </p>
          )}
        </div>
      )}

      {health.calculated_at && (
        <p className="text-xs text-app-muted text-right">
          Atualizado em {formatDate(health.calculated_at)}
        </p>
      )}
    </div>
  );
}
