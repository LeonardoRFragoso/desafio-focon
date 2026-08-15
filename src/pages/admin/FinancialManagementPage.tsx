import { useState, useEffect, useCallback } from 'react';
import { financialAPI, projectsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import type { Project } from '@/types/database';

interface FinancialRow {
  project_id: string;
  contracted_revenue: number;
  tax_rate: number;
  indirect_cost: number;
  created_at: string;
  updated_at: string;
  project?: { name: string } | null;
}

export function FinancialManagementPage() {
  const [financials, setFinancials] = useState<FinancialRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<FinancialRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchFinancials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await financialAPI.getProjectFinancials();
      if (err) throw err;
      setFinancials((data as FinancialRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error: err } = await projectsAPI.list();
      if (err) throw err;
      setProjects((data as Project[]) || []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFinancials();
     
    fetchProjects();
  }, [fetchFinancials, fetchProjects]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  const projectsWithoutFinancials = projects.filter(
    (p) => !financials.some((f) => f.project_id === p.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gestão Financeira</h2>
          <p className="text-slate-600 dark:text-slate-400">Configure receita, impostos e custos indiretos por projeto</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          disabled={projectsWithoutFinancials.length === 0}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={projectsWithoutFinancials.length === 0 ? 'Todos os projetos já têm dados financeiros' : ''}
        >
          Novo Registro
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {financials.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-800/50">
          <p className="text-slate-600 dark:text-slate-400">Nenhum dado financeiro cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Projeto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Receita Contratada</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Taxa de Imposto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Custo Indireto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {financials.map((f) => (
                <tr key={f.project_id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 font-medium">
                    {f.project?.name || 'Desconhecido'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 font-semibold">{formatCurrency(f.contracted_revenue)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatPercent(f.tax_rate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatCurrency(f.indirect_cost)}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => setEditTarget(f)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <FinancialFormModal
          availableProjects={projectsWithoutFinancials}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchFinancials();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {editTarget && (
        <FinancialFormModal
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchFinancials();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}
    </div>
  );
}

interface FinancialFormModalProps {
  existing?: FinancialRow;
  availableProjects?: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function FinancialFormModal({ existing, availableProjects, onClose, onSaved, onError }: FinancialFormModalProps) {
  const [projectId, setProjectId] = useState(existing?.project_id ?? '');
  const [revenue, setRevenue] = useState(existing ? String(existing.contracted_revenue) : '');
  const [taxRate, setTaxRate] = useState(existing ? String(existing.tax_rate) : '0.08');
  const [indirectCost, setIndirectCost] = useState(existing ? String(existing.indirect_cost) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !revenue || !taxRate || !indirectCost) {
      onError('Preencha todos os campos.');
      return;
    }
    const rev = parseFloat(revenue);
    const tax = parseFloat(taxRate);
    const cost = parseFloat(indirectCost);
    if (isNaN(rev) || isNaN(tax) || isNaN(cost)) {
      onError('Valores numéricos inválidos.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await financialAPI.upsert({
        project_id: projectId,
        contracted_revenue: rev,
        tax_rate: tax,
        indirect_cost: cost,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar dados financeiros');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Editar Dados Financeiros' : 'Novo Registro Financeiro'}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="financial-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="financial-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Projeto *</label>
          {existing ? (
            <p className="text-slate-900 dark:text-slate-100 font-medium">{existing.project?.name || 'Desconhecido'}</p>
          ) : (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="">Selecione...</option>
              {(availableProjects ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Receita Contratada (R$) *</label>
          <input type="number" step="0.01" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Taxa de Imposto (0-1) *</label>
          <input type="number" step="0.01" min="0" max="1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Ex: 0.08 para 8%</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Custo Indireto (R$) *</label>
          <input type="number" step="0.01" min="0" value={indirectCost} onChange={(e) => setIndirectCost(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
      </form>
    </Modal>
  );
}
