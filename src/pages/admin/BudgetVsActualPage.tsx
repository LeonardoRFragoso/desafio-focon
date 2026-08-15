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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Orçamento × Realizado</h2>
          <p className="text-slate-600 dark:text-slate-400">Compare orçamento com horas e custos realizados (aprovados)</p>
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
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-400">Nenhum orçamento cadastrado</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Crie um orçamento para acompanhar a performance dos projetos</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Projeto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Tipo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ano Fiscal</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">Previsto</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">Realizado</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">Diferença</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">%</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {budgets.map((b) => {
                const isHours = b.budget_type === 'labor_hours';
                const budgetVal = isHours ? b.budget_value : b.budget_value;
                const actualVal = isHours ? b.actual_hours : b.actual_cost;
                const variance = isHours ? b.hours_variance : b.cost_variance;
                const variancePct = isHours ? b.hours_variance_pct : b.cost_variance_pct;
                const fmtVal = isHours ? formatHours : formatCurrency;
                return (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{b.project?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{budgetTypeLabels[b.budget_type] || b.budget_type}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{b.fiscal_year}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-900 dark:text-slate-100">{fmtVal(budgetVal)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-900 dark:text-slate-100">{fmtVal(actualVal)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtVal(Math.abs(variance))}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${variancePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPct(variancePct)}
                    </td>
                    <td className="px-4 py-3 text-sm">
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
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50">
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Projeto *</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo *</label>
            <select value={budgetType} onChange={(e) => setBudgetType(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="labor_hours">Horas</option>
              <option value="labor_cost">Custo (R$)</option>
              <option value="total_cost">Custo Total (R$)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ano Fiscal *</label>
            <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} min="2000" max="2100" className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Valor * {budgetType === 'labor_hours' ? '(horas)' : '(R$)'}
          </label>
          <input type="number" step="0.01" min="0" value={budgetValue} onChange={(e) => setBudgetValue(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
      </form>
    </Modal>
  );
}
