import { useState } from 'react';
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Relatório Financeiro</h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
            Gere relatórios para impressão, PDF ou exportação
          </p>
        </div>
        <div className="flex gap-3 print:hidden">
          <button
            onClick={handlePrint}
            className="px-6 py-3 bg-focon-600 hover:bg-focon-700 text-white font-semibold rounded-lg transition"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="print:hidden">
        <AdminFilters filters={filters} onFilterChange={handleFilterChange} />
      </div>

      <FinancialReport filters={filters} />
    </div>
  );
}
