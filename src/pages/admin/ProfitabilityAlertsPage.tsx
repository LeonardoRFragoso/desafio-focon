import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { projectsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNavigate } from 'react-router-dom';
import type { ProfitabilityAlert, Project } from '@/types/database';

export function ProfitabilityAlertsPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<ProfitabilityAlert[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProfitabilityAlert | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<ProfitabilityAlert | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('profitability_alerts')
        .select(
          'id, project_id, threshold, metric, triggered_at, acknowledged_by, acknowledged_at, created_at, updated_at, project:projects!profitability_alerts_project_id_fkey(name)'
        )
        .order('created_at', { ascending: false });
      if (err) throw err;
      setAlerts((data as ProfitabilityAlert[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await projectsAPI.listActive();
      setProjects((data as Project[]) || []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlerts();
     
    fetchProjects();
  }, [fetchAlerts, fetchProjects]);

  const acknowledge = async (alert: ProfitabilityAlert) => {
    if (!user) return;
    try {
      const { error: err } = await supabase
        .from('profitability_alerts')
        .update({
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      if (err) throw err;
      await fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao reconhecer alerta');
    }
  };

  const metricLabels: Record<string, string> = {
    margin_percent: 'Margem (%)',
    budget_utilization_percent: 'Utilização do Orçamento (%)',
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">Alertas de Rentabilidade</h2>
          <p className="text-app-muted">Configure thresholds e acompanhe alertas</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Novo Alerta
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-primary">
          <p className="text-app-muted">Nenhum alerta configurado</p>
          <p className="text-sm text-app-muted mt-2">Crie um alerta para monitorar a rentabilidade dos projetos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert) => {
            const isTriggered = !!alert.triggered_at;
            const isAcknowledged = !!alert.acknowledged_at;
            const status = isAcknowledged ? 'resolved' : isTriggered ? 'triggered' : 'active';
            const statusColors: Record<string, string> = {
              active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
              triggered: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
              resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            };
            const statusLabels: Record<string, string> = {
              active: 'Ativo',
              triggered: 'Disparado',
              resolved: 'Resolvido',
            };
            return (
              <div
                key={alert.id}
                onClick={() => setSelectedAlert(alert)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedAlert(alert);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Ver detalhes do alerta de ${alert.project?.name || 'projeto'}`}
                className={`rounded-xl border p-5 shadow-sm cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600 ${
                  isTriggered && !isAcknowledged
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                    : 'border-app-primary bg-surface-primary'
                } hover:bg-hover-surface`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <button
                      onClick={() => navigate('/admin/budget')}
                      className="text-lg font-semibold text-app-primary hover:text-focon-600 transition"
                    >
                      {alert.project?.name || '—'}
                    </button>
                    <p className="text-sm text-app-muted mt-1">
                      {metricLabels[alert.metric] || alert.metric}: threshold {alert.threshold}%
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[status]}`}>
                    {statusLabels[status]}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="text-xs text-app-muted">
                    {alert.triggered_at && <p>Disparado em: {new Date(alert.triggered_at).toLocaleString('pt-BR')}</p>}
                    {alert.acknowledged_at && <p>Resolvido em: {new Date(alert.acknowledged_at).toLocaleString('pt-BR')}</p>}
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {isTriggered && !isAcknowledged && (
                      <button
                        onClick={() => acknowledge(alert)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition"
                      >
                        Reconhecer
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(alert)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <AlertFormModal
          projects={projects}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchAlerts();
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Excluir alerta"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await supabase.from('profitability_alerts').delete().eq('id', deleteTarget.id);
            if (err) {
              setError(mapDatabaseError(err));
              return;
            }
            await fetchAlerts();
          }}
          message={<p>Excluir o alerta de <strong>{deleteTarget.project?.name}</strong>?</p>}
        />
      )}

      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}

interface AlertFormModalProps {
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function AlertFormModal({ projects, onClose, onSaved, onError }: AlertFormModalProps) {
  const [projectId, setProjectId] = useState('');
  const [metric, setMetric] = useState('margin_percent');
  const [threshold, setThreshold] = useState('20');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !threshold) {
      onError('Preencha todos os campos.');
      return;
    }
    const val = parseFloat(threshold);
    if (isNaN(val) || val < 0 || val > 100) {
      onError('Threshold inválido (0-100).');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await supabase.from('profitability_alerts').insert([
        { project_id: projectId, metric, threshold: val },
      ]);
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao criar alerta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo Alerta"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="alert-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Criar'}
          </button>
        </>
      }
    >
      <form id="alert-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Projeto *</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Métrica *</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="margin_percent">Margem (%)</option>
              <option value="budget_utilization_percent">Utilização do Orçamento (%)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Threshold (%) *</label>
            <input type="number" step="0.1" min="0" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
        </div>
        <p className="text-xs text-app-muted">
          O alerta dispara quando a métrica do projeto ficar abaixo do threshold configurado.
        </p>
      </form>
    </Modal>
  );
}

interface AlertDetailsModalProps {
  alert: ProfitabilityAlert;
  onClose: () => void;
}

function AlertDetailsModal({ alert, onClose }: AlertDetailsModalProps) {
  const [budgetInfo, setBudgetInfo] = useState<{ budget_type: string; budget_value: number; fiscal_year: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('project_budgets')
          .select('budget_type, budget_value, fiscal_year')
          .eq('project_id', alert.project_id)
          .order('fiscal_year', { ascending: false })
          .limit(1);
        if (cancelled) return;
        if (data && data.length > 0) {
          setBudgetInfo(data[0] as { budget_type: string; budget_value: number; fiscal_year: number });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alert.project_id]);

  const formatDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const metricLabels: Record<string, string> = {
    margin_percent: 'Margem (%)',
    budget_utilization_percent: 'Utilização do Orçamento (%)',
  };

  const budgetTypeLabels: Record<string, string> = {
    labor_hours: 'Horas',
    labor_cost: 'Custo (R$)',
    total_cost: 'Custo Total (R$)',
  };

  const isTriggered = !!alert.triggered_at;
  const isAcknowledged = !!alert.acknowledged_at;
  const status = isAcknowledged ? 'resolved' : isTriggered ? 'triggered' : 'active';
  const statusColors: Record<string, string> = {
    active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    triggered: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
  const statusLabels: Record<string, string> = {
    active: 'Ativo',
    triggered: 'Disparado',
    resolved: 'Resolvido',
  };

  return (
    <Modal open onClose={onClose} title="Detalhes do Alerta" maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Projeto</p>
              <p className="text-sm text-app-primary font-medium">{alert.project?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Status</p>
              <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[status]}`}>
                {statusLabels[status]}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Métrica</p>
              <p className="text-sm text-app-secondary">{metricLabels[alert.metric] || alert.metric}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Threshold</p>
              <p className="text-sm text-app-secondary">{alert.threshold}%</p>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Datas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Disparado em</p>
                <p className="text-sm text-app-secondary">{formatDateTime(alert.triggered_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Reconhecido em</p>
                <p className="text-sm text-app-secondary">{formatDateTime(alert.acknowledged_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Criado em</p>
                <p className="text-sm text-app-secondary">{formatDate(alert.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Atualizado em</p>
                <p className="text-sm text-app-secondary">{formatDate(alert.updated_at)}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Orçamento Relacionado</h3>
            {budgetInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-surface-secondary p-3">
                  <p className="text-xs text-app-muted">Tipo</p>
                  <p className="text-sm font-semibold text-app-primary">{budgetTypeLabels[budgetInfo.budget_type] || budgetInfo.budget_type}</p>
                </div>
                <div className="rounded-lg bg-surface-secondary p-3">
                  <p className="text-xs text-app-muted">Valor</p>
                  <p className="text-sm font-semibold text-app-primary">
                    {budgetInfo.budget_type === 'labor_hours' ? `${budgetInfo.budget_value}h` : formatCurrency(budgetInfo.budget_value)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-secondary p-3">
                  <p className="text-xs text-app-muted">Ano Fiscal</p>
                  <p className="text-sm font-semibold text-app-primary">{budgetInfo.fiscal_year}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-app-muted">Nenhum orçamento encontrado para este projeto</p>
            )}
          </div>

          <div className="border-t border-app-primary pt-4">
            <p className="text-xs text-app-muted">
              O alerta dispara quando a métrica <strong>{metricLabels[alert.metric] || alert.metric}</strong> do projeto
              fica abaixo do threshold de <strong>{alert.threshold}%</strong>.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
