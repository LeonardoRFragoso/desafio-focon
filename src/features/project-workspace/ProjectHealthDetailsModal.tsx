import { useState, useEffect, useCallback } from 'react';
import { projectHealthAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import type {
  ProjectHealthState,
  ProjectHealthEvent,
  HealthStatus,
  HealthDrivers,
} from '@/types/database';

interface ProjectHealthDetailsModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  isAdmin: boolean;
}

const HEALTH_STYLES: Record<HealthStatus, { badge: string; label: string; icon: string }> = {
  healthy: { badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: 'Saudável', icon: '🟢' },
  attention: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'Em Atenção', icon: '🟡' },
  at_risk: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'Em Risco', icon: '🔴' },
  not_applicable: { badge: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-muted', label: 'Não Aplicável', icon: '⚪' },
};

const NOT_CALCULATED_STYLE = {
  badge: 'bg-slate-100 text-slate-500 bg-surface-secondary text-app-muted',
  label: 'Não calculado',
  icon: '❓',
} as const;

const OVERRIDE_LABELS: Record<string, string> = {
  budget_over_110: 'Orçamento excedeu 110%',
  critical_milestone_overdue_7d: 'Marco crítico atrasado há mais de 7 dias',
  project_overdue_14d: 'Projeto ativo há mais de 14 dias após o prazo',
};

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

function formatDateTime(d: string | null): string {
  return d ? new Date(d).toLocaleString('pt-BR') : '—';
}

export function ProjectHealthDetailsModal({
  open,
  onClose,
  projectId,
  projectName,
  isAdmin,
}: ProjectHealthDetailsModalProps) {
  const [health, setHealth] = useState<ProjectHealthState | null>(null);
  const [history, setHistory] = useState<ProjectHealthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [healthRes, historyRes] = await Promise.all([
        projectHealthAPI.get(projectId),
        projectHealthAPI.getHistory(projectId),
      ]);
      if (healthRes.error) throw healthRes.error;
      if (historyRes.error) throw historyRes.error;
      // RPCs return JSONB; cast through unknown because Supabase types it as Json.
      setHealth(healthRes.data as unknown as ProjectHealthState | null);
      setHistory((historyRes.data as unknown as ProjectHealthEvent[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar detalhes');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAll();
    }
  }, [open, fetchAll]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);
    try {
      const { error: err } = await projectHealthAPI.recalculate(projectId);
      if (err) throw err;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao recalcular');
    } finally {
      setRecalculating(false);
    }
  };

  const renderDriverRow = (label: string, penalty: number, detail?: string) => (
    <div className="flex items-center justify-between py-2 border-b border-app-primary last:border-0">
      <div>
        <span className="text-sm text-app-secondary">{label}</span>
        {detail && <span className="text-xs text-app-muted ml-2">{detail}</span>}
      </div>
      <span className={`text-sm font-medium ${penalty > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-app-muted'}`}>
        {penalty > 0 ? `-${penalty}` : '0'}
      </span>
    </div>
  );

  const drivers: HealthDrivers | null = health?.drivers ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Saúde do Projeto — ${projectName}`}
      maxWidth="max-w-4xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-app-secondary bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
          >
            Fechar
          </button>
          {isAdmin && (
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="px-4 py-2 text-sm font-medium text-white bg-focon-600 hover:bg-focon-700 disabled:opacity-50 rounded-lg transition"
            >
              {recalculating ? 'Recalculando...' : '🔄 Recalcular'}
            </button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
        </div>
      ) : !health || !health.status ? (
        <p className="text-sm text-app-muted py-4 text-center">
          Saúde ainda não calculada para este projeto.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Score + Status */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              {health.status === 'not_applicable' ? (
                <>
                  <div className="text-4xl font-bold text-app-muted">—</div>
                  <div className="text-xs text-app-muted">n/a</div>
                </>
              ) : (
                <>
                  <div className="text-4xl font-bold text-app-primary">{health.score ?? 0}</div>
                  <div className="text-xs text-app-muted">/100</div>
                </>
              )}
            </div>
            <div className="flex-1">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${HEALTH_STYLES[health.status]?.badge ?? NOT_CALCULATED_STYLE.badge}`}>
                {HEALTH_STYLES[health.status]?.icon ?? NOT_CALCULATED_STYLE.icon} {HEALTH_STYLES[health.status]?.label ?? NOT_CALCULATED_STYLE.label}
              </span>
              {health.progress !== null && (
                <p className="text-sm text-app-muted mt-2">
                  Progresso: <span className="font-medium text-app-secondary">{health.progress.toFixed(1)}%</span>
                </p>
              )}
            </div>
          </div>

          {/* Hard override */}
          {drivers?.hard_override && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                ⚠️ Risco Crítico Detectado
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                {OVERRIDE_LABELS[drivers.hard_override] ?? drivers.hard_override}
              </p>
            </div>
          )}

          {/* Drivers breakdown */}
          {drivers && (
            <div>
              <h4 className="text-sm font-semibold text-app-secondary mb-2">Fatores de Saúde (penalidades)</h4>
              <div className="rounded-lg border border-app-primary bg-surface-primary p-3">
                {drivers.schedule && renderDriverRow(
                  'Cronograma',
                  drivers.schedule.penalty,
                  `${drivers.schedule.overdue_milestones} marco(s) atrasado(s), ${drivers.schedule.overdue_tasks} tarefa(s) atrasada(s)${drivers.schedule.overdue_end_penalty > 0 ? ', projeto atrasado' : ''}`
                )}
                {drivers.budget && isAdmin && renderDriverRow(
                  'Orçamento',
                  drivers.budget.penalty,
                  drivers.budget.utilization !== null ? `${drivers.budget.utilization.toFixed(1)}% utilizado` : 'sem orçamento'
                )}
                {drivers.profitability && isAdmin && renderDriverRow(
                  'Rentabilidade',
                  drivers.profitability.penalty,
                  `${drivers.profitability.active_alerts} alerta(s) não reconhecido(s)`
                )}
                {drivers.capacity && isAdmin && renderDriverRow(
                  'Capacidade',
                  drivers.capacity.penalty,
                  drivers.capacity.overallocated_members > 0
                    ? `${drivers.capacity.overallocated_members} profissional(is) sobrecarregado(s), máximo: ${drivers.capacity.max_utilization.toFixed(0)}%${drivers.capacity.cross_project ? ' (multi-projeto)' : ''}`
                    : 'dentro do limite'
                )}
                {drivers.critical_delivery && renderDriverRow(
                  'Entrega Crítica',
                  drivers.critical_delivery.penalty,
                  `${drivers.critical_delivery.critical_milestones_overdue + drivers.critical_delivery.critical_tasks_overdue} crítico(s) atrasado(s)`
                )}
              </div>
            </div>
          )}

          {/* Forecast (admin only) */}
          {isAdmin && (health.forecast_completion_date || health.forecast_labor_cost !== null) && (
            <div>
              <h4 className="text-sm font-semibold text-app-secondary mb-2">Previsão</h4>
              <p className="text-xs text-app-muted mb-2">⚠️ Estimativa baseada em progresso e custos atuais — não é uma garantia.</p>
              <div className="rounded-lg border border-app-primary bg-surface-primary p-3 space-y-2">
                {health.forecast_completion_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-app-muted">Data de conclusão estimada</span>
                    <span className="font-medium text-app-secondary">{formatDate(health.forecast_completion_date)}</span>
                  </div>
                )}
                {health.forecast_labor_cost !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-app-muted">Custo de mão de obra projetado</span>
                    <span className="font-medium text-app-secondary">{formatCurrency(health.forecast_labor_cost)}</span>
                  </div>
                )}
                {health.budget_utilization !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-app-muted">Utilização do orçamento</span>
                    <span className="font-medium text-app-secondary">{health.budget_utilization.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* History */}
          <div>
            <h4 className="text-sm font-semibold text-app-secondary mb-2">Histórico de Transições</h4>
            {history.length === 0 ? (
              <p className="text-sm text-app-muted py-2">Nenhuma transição registrada.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((evt) => (
                  <div key={evt.id} className="rounded-lg border border-app-primary bg-surface-primary p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {evt.previous_status && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${HEALTH_STYLES[evt.previous_status]?.badge}`}>
                            {HEALTH_STYLES[evt.previous_status]?.label}
                          </span>
                        )}
                        <span className="text-app-muted text-xs">→</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${HEALTH_STYLES[evt.new_status]?.badge}`}>
                          {HEALTH_STYLES[evt.new_status]?.label}
                        </span>
                      </div>
                      <span className="text-xs text-app-muted">{formatDateTime(evt.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-app-muted">
                      <span>Score: {evt.previous_score ?? '—'} → {evt.new_score ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {health.calculated_at && (
            <p className="text-xs text-app-muted text-right">
              Última atualização: {formatDateTime(health.calculated_at)}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
