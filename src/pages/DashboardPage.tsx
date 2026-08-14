import { useState, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { FinancialIndicators } from '@/features/admin/FinancialIndicators';
import { AdminFilters } from '@/features/admin/AdminFilters';
import { ProfessionalSummary } from '@/features/admin/ProfessionalSummary';
import { TimeEntryApproval } from '@/features/admin/TimeEntryApproval';
import { TimeEntriesBreakdown } from '@/features/admin/TimeEntriesBreakdown';
import { useFinancialData } from '@/hooks/useFinancialData';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import type { AdminFilterValues } from '@/types/admin';

export function DashboardPage() {
  const { filters, setFilters, clearFilters } = usePersistedFilters();
  const { revenue, laborCost, result, margin, professionalData, loading, error, refetch } =
    useFinancialData(filters);
  const [dataRevision, setDataRevision] = useState(0);

  const handleFilterChange = (newFilters: AdminFilterValues) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    clearFilters();
  };

  const handleStatusChanged = useCallback(async () => {
    await refetch();
    setDataRevision((prev) => prev + 1);
  }, [refetch]);

  return (
    <Layout>
      <div className="space-y-8">
        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-bold text-slate-900">Painel Administrativo</h1>
          <p className="mt-2 text-lg text-slate-600">
            Acompanhe a produção e rentabilidade dos projetos
          </p>
        </div>

        <AdminFilters 
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />

        {error && (
          <div 
            className="rounded-lg bg-red-50 border border-red-200 p-4"
            role="alert"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button
                onClick={refetch}
                className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        <FinancialIndicators
          revenue={revenue}
          laborCost={laborCost}
          result={result}
          margin={margin}
          loading={loading}
        />

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900 mb-6">
            Resumo por Profissional
          </h2>
          <ProfessionalSummary data={professionalData} loading={loading} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <TimeEntryApproval onStatusChanged={handleStatusChanged} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900 mb-6">
            Detalhamento de Apontamentos
          </h2>
          <TimeEntriesBreakdown filters={filters} dataRevision={dataRevision} />
        </div>
      </div>
    </Layout>
  );
}
