import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { AdminFilters } from '@/features/admin/AdminFilters';
import { FinancialReport } from '@/features/admin/FinancialReport';
import type { AdminFilterValues } from '@/types/admin';

export function ReportPage() {
  const [filters, setFilters] = useState<AdminFilterValues>({
    projectId: '',
    projectName: '',
    professionalId: '',
    professionalName: '',
    startDate: '',
    endDate: '',
  });

  const handleFilterChange = (newFilters: AdminFilterValues) => {
    setFilters(newFilters);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Relatório Financeiro</h1>
            <p className="mt-2 text-slate-600">
              Gere relatórios para impressão ou PDF
            </p>
          </div>
          <button
            onClick={handlePrint}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition print:hidden"
          >
            Imprimir / Salvar em PDF
          </button>
        </div>

        <div className="print:hidden">
          <AdminFilters onFilterChange={handleFilterChange} />
        </div>

        <FinancialReport filters={filters} />
      </div>
    </Layout>
  );
}
