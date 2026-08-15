import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { projectBudgetsAPI, projectsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Project, ProjectBudget } from '@/types/database';

interface BudgetWithActual extends ProjectBudget {
  project?: { name: string } | null;
  actual_hours: number;
  actual_cost: number;
  hours_variance: number;
  cost_variance: number;
  hours_variance_pct: number;
  cost_variance_pct: number;
}

export function BudgetVsActualPage() {
  const [budgets, setBudgets] = useState<BudgetWithActual[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetWithActual | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<BudgetWithActual | null>(null);

  const fetchBudgets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectBudgetsAPI.list();
      if (err) throw err;
      const budgetList = (data as ProjectBudget[]) || [];

      // For each budget, calculate actual (approved only)
      const enriched: BudgetWithActual[] = await Promise.all(
        budgetList.map(async (b) => {
          // Get approved time entries for this project
          const { data: entries } = await supabase
            .from('time_entries')
            .select('duration_minutes, applied_hourly_rate')
            .eq('project_id', b.project_id)
            .eq('approval_status', 'approved');

          const actualHours = ((entries as { duration_minutes: number }[]) || []).reduce(
            (s, e) => s + e.duration_minutes,
            0
          );
          const actualCost = ((entries as { duration_minutes: number; applied_hourly_rate: number }[]) || []).reduce(
            (s, e) => s + (e.duration_minutes / 60) * e.applied_hourly_rate,
            0
          );

          const budgetHours = b.budget_type === 'labor_hours' ? b.budget_value : 0;
          const budgetCost = b.budget_type === 'labor_cost' ? b.budget_value : 0;

          return {
            ...b,
            actual_hours: actualHours / 60, // convert to hours
            actual_cost: actualCost,
            hours_variance: budgetHours - actualHours / 60,
            cost_variance: budgetCost - actualCost,
            hours_variance_pct: budgetHours > 0 ? ((budgetHours - actualHours / 60) / budgetHours) * 100 : 0,
            cost_variance_pct: budgetCost > 0 ? ((budgetCost - actualCost) / budgetCost) * 100 : 0,
          };
        })
      );
      setBudgets(enriched);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar orçamentos');
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
    fetchBudgets();
     
    fetchProjects();
  }, [fetchBudgets, fetchProjects]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatHours = (h: number) => `${h.toFixed(1)}h`;
  const formatPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;

  const budgetTypeLabels: Record<string, string> = {
    labor_hours: 'Horas',
    labor_cost: 'Custo (R$)',
    total_cost: 'Custo Total (R$)',
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
          <h2 className="text-2xl font-bold text-app-primary">Orçamento × Realizado</h2>
          <p className="text-app-muted">Compare orçamento com horas e custos realizados (aprovados)</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Novo Orçamento
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-primary">
          <p className="text-app-muted">Nenhum orçamento cadastrado</p>
          <p className="text-sm text-app-muted mt-2">Crie um orçamento para acompanhar a performance dos projetos</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Projeto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Tipo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ano Fiscal</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Previsto</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Realizado</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Diferença</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">%</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {budgets.map((b) => {
                const isHours = b.budget_type === 'labor_hours';
                const budgetVal = isHours ? b.budget_value : b.budget_value;
                const actualVal = isHours ? b.actual_hours : b.actual_cost;
                const variance = isHours ? b.hours_variance : b.cost_variance;
                const variancePct = isHours ? b.hours_variance_pct : b.cost_variance_pct;
                const fmtVal = isHours ? formatHours : formatCurrency;
                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBudget(b)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedBudget(b);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver detalhes do orçamento de ${b.project?.name || 'projeto'}`}
                    className="hover:bg-hover-surface/50 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-app-primary">{b.project?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-app-secondary">{budgetTypeLabels[b.budget_type] || b.budget_type}</td>
                    <td className="px-4 py-3 text-sm text-app-secondary">{b.fiscal_year}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-app-primary">{fmtVal(budgetVal)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-app-primary">{fmtVal(actualVal)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtVal(Math.abs(variance))}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${variancePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPct(variancePct)}
                    </td>
                    <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <BudgetFormModal
          projects={projects}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchBudgets();
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Excluir orçamento"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await projectBudgetsAPI.remove(deleteTarget.id);
            if (err) {
              setError(mapDatabaseError(err));
              return;
            }
            await fetchBudgets();
          }}
          message={<p>Excluir o orçamento de <strong>{deleteTarget.project?.name}</strong>?</p>}
        />
      )}

      {selectedBudget && (
        <BudgetDetailsModal
          budget={selectedBudget}
          onClose={() => setSelectedBudget(null)}
        />
      )}
    </div>
  );
}

interface BudgetFormModalProps {
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function BudgetFormModal({ projects, onClose, onSaved, onError }: BudgetFormModalProps) {
  const [projectId, setProjectId] = useState('');
  const [budgetType, setBudgetType] = useState('labor_hours');
  const [budgetValue, setBudgetValue] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !budgetValue || !fiscalYear) {
      onError('Preencha todos os campos.');
      return;
    }
    const val = parseFloat(budgetValue);
    const year = parseInt(fiscalYear, 10);
    if (isNaN(val) || val <= 0) {
      onError('Valor inválido.');
      return;
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      onError('Ano fiscal inválido.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await projectBudgetsAPI.create({
        project_id: projectId,
        budget_type: budgetType,
        budget_value: val,
        fiscal_year: year,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao criar orçamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo Orçamento"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="budget-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Criar'}
          </button>
        </>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-sm font-medium text-app-secondary mb-1">Tipo *</label>
            <select value={budgetType} onChange={(e) => setBudgetType(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="labor_hours">Horas</option>
              <option value="labor_cost">Custo (R$)</option>
              <option value="total_cost">Custo Total (R$)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Ano Fiscal *</label>
            <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} min="2000" max="2100" className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">
            Valor * {budgetType === 'labor_hours' ? '(horas)' : '(R$)'}
          </label>
          <input type="number" step="0.01" min="0" value={budgetValue} onChange={(e) => setBudgetValue(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
      </form>
    </Modal>
  );
}

interface BudgetDetailsModalProps {
  budget: BudgetWithActual;
  onClose: () => void;
}

function BudgetDetailsModal({ budget, onClose }: BudgetDetailsModalProps) {
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatHours = (h: number) => `${h.toFixed(1)}h`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  const isHours = budget.budget_type === 'labor_hours';
  const budgetVal = budget.budget_value;
  const actualVal = isHours ? budget.actual_hours : budget.actual_cost;
  const variance = isHours ? budget.hours_variance : budget.cost_variance;
  const variancePct = isHours ? budget.hours_variance_pct : budget.cost_variance_pct;
  const fmtVal = isHours ? formatHours : formatCurrency;
  const consumedPct = budgetVal > 0 ? (actualVal / budgetVal) * 100 : 0;

  const budgetTypeLabels: Record<string, string> = {
    labor_hours: 'Horas',
    labor_cost: 'Custo (R$)',
    total_cost: 'Custo Total (R$)',
  };

  return (
    <Modal open onClose={onClose} title="Detalhes do Orçamento" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Projeto</p>
            <p className="text-sm text-app-primary font-medium">{budget.project?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Tipo de Orçamento</p>
            <p className="text-sm text-app-secondary">{budgetTypeLabels[budget.budget_type] || budget.budget_type}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Ano Fiscal</p>
            <p className="text-sm text-app-secondary">{budget.fiscal_year}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Criado em</p>
            <p className="text-sm text-app-secondary">{formatDate(budget.created_at)}</p>
          </div>
        </div>

        <div className="border-t border-app-primary pt-4">
          <h3 className="text-sm font-semibold text-app-primary mb-3">Orçamento × Realizado</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-secondary p-3">
              <p className="text-xs text-app-muted">Previsto</p>
              <p className="text-sm font-semibold text-app-primary">{fmtVal(budgetVal)}</p>
            </div>
            <div className="rounded-lg bg-surface-secondary p-3">
              <p className="text-xs text-app-muted">Realizado</p>
              <p className="text-sm font-semibold text-app-primary">{fmtVal(actualVal)}</p>
            </div>
            <div className={`rounded-lg p-3 ${variance >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <p className={`text-xs ${variance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>Diferença</p>
              <p className={`text-sm font-semibold ${variance >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                {fmtVal(Math.abs(variance))}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-app-primary pt-4">
          <h3 className="text-sm font-semibold text-app-primary mb-3">Consumo</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">Percentual consumido</span>
              <span className={`font-semibold ${consumedPct > 100 ? 'text-red-600 dark:text-red-400' : 'text-app-primary'}`}>
                {consumedPct.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-surface-secondary rounded-full h-3 overflow-hidden border border-app-primary">
              <div
                className={`h-full rounded-full transition-all ${consumedPct > 100 ? 'bg-red-500' : consumedPct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(consumedPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-app-muted">
              <span>Variância: {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%</span>
              <span>{consumedPct > 100 ? 'Acima do orçamento' : 'Dentro do orçamento'}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
