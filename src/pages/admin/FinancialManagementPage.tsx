import { useState, useEffect, useCallback } from 'react';
import { financialAPI, projectsAPI } from '@/lib/supabase/api';
import { supabase } from '@/lib/supabase/client';
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
  const [selectedFinancial, setSelectedFinancial] = useState<FinancialRow | null>(null);
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
          <h2 className="text-2xl font-bold text-app-primary">Gestão Financeira</h2>
          <p className="text-app-muted">Configure receita, impostos e custos indiretos por projeto</p>
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
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhum dado financeiro cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Projeto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Receita Contratada</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Taxa de Imposto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Custo Indireto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {financials.map((f) => (
                <tr
                  key={f.project_id}
                  onClick={() => setSelectedFinancial(f)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedFinancial(f);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes de ${f.project?.name || 'projeto'}`}
                  className="hover:bg-hover-surface transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600"
                >
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">
                    {f.project?.name || 'Desconhecido'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-primary font-semibold">{formatCurrency(f.contracted_revenue)}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatPercent(f.tax_rate)}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatCurrency(f.indirect_cost)}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditTarget(f)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition"
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

      {selectedFinancial && (
        <FinancialDetailsModal
          financial={selectedFinancial}
          onClose={() => setSelectedFinancial(null)}
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
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
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
          <label className="block text-sm font-medium text-app-secondary mb-1">Projeto *</label>
          {existing ? (
            <p className="text-app-primary font-medium">{existing.project?.name || 'Desconhecido'}</p>
          ) : (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="">Selecione...</option>
              {(availableProjects ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Receita Contratada (R$) *</label>
          <input type="number" step="0.01" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Taxa de Imposto (0-1) *</label>
          <input type="number" step="0.01" min="0" max="1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          <p className="text-xs text-app-muted mt-1">Ex: 0.08 para 8%</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Custo Indireto (R$) *</label>
          <input type="number" step="0.01" min="0" value={indirectCost} onChange={(e) => setIndirectCost(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
      </form>
    </Modal>
  );
}

interface FinancialDetailsModalProps {
  financial: FinancialRow;
  onClose: () => void;
}

function FinancialDetailsModal({ financial, onClose }: FinancialDetailsModalProps) {
  const [approvedCost, setApprovedCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('time_entries')
          .select('duration_minutes, applied_hourly_rate')
          .eq('project_id', financial.project_id)
          .eq('approval_status', 'approved');
        if (cancelled) return;
        const entries = (data as { duration_minutes: number; applied_hourly_rate: number }[]) || [];
        const cost = entries.reduce((s, e) => s + (e.duration_minutes / 60) * e.applied_hourly_rate, 0);
        setApprovedCost(cost);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [financial.project_id]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;

  const netRevenue = financial.contracted_revenue * (1 - financial.tax_rate) - financial.indirect_cost;
  const cost = approvedCost ?? 0;
  const margin = netRevenue - cost;
  const marginPct = netRevenue > 0 ? (margin / netRevenue) * 100 : 0;

  return (
    <Modal open onClose={onClose} title="Detalhes Financeiros" maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Projeto</p>
              <p className="text-sm text-app-primary font-medium">{financial.project?.name || 'Desconhecido'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Receita Contratada</p>
              <p className="text-sm text-app-primary font-semibold">{formatCurrency(financial.contracted_revenue)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Taxa de Imposto</p>
              <p className="text-sm text-app-secondary">{formatPercent(financial.tax_rate)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Custo Indireto</p>
              <p className="text-sm text-app-secondary">{formatCurrency(financial.indirect_cost)}</p>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Resultados Calculados</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="text-xs text-app-muted">Receita Líquida</p>
                <p className="text-sm font-semibold text-app-primary">{formatCurrency(netRevenue)}</p>
              </div>
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="text-xs text-app-muted">Custo de Horas Aprovadas</p>
                <p className="text-sm font-semibold text-app-primary">{formatCurrency(cost)}</p>
              </div>
              <div className={`rounded-lg p-3 ${margin >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                <p className={`text-xs ${margin >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>Margem</p>
                <p className={`text-sm font-semibold ${margin >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                  {formatCurrency(margin)} ({marginPct.toFixed(1)}%)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
