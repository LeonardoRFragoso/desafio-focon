import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { exportAdminExcel } from '@/lib/excel-export';
import type { AdminFilterValues } from '@/types/admin';
import type { TimeEntryWithRelations, Project, ProjectBudget } from '@/types/database';

interface Props {
  filters: AdminFilterValues;
}

/**
 * Exports comprehensive admin data to a multi-sheet Excel workbook.
 * Respects active filters for time entries.
 */
export function AdminExcelExportButton({ filters }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch entries with filters
      let query = supabase
        .from('time_entries')
        .select(
          'id, professional_id, project_id, entry_date, duration_minutes, description, approval_status, rejection_reason, applied_hourly_rate, rejected_at, created_at, project:projects!time_entries_project_id_fkey(name), professional:profiles!time_entries_professional_id_fkey(full_name)'
        )
        .order('entry_date', { ascending: false });

      if (filters.projectId) query = query.eq('project_id', filters.projectId);
      if (filters.professionalId) query = query.eq('professional_id', filters.professionalId);
      if (filters.startDate) query = query.gte('entry_date', filters.startDate);
      if (filters.endDate) query = query.lte('entry_date', filters.endDate);

      const { data: entriesData, error: entriesErr } = await query;
      if (entriesErr) throw entriesErr;

      // Fetch projects
      const { data: projectsData } = await supabase.from('projects').select('id, name, status, created_at');

      // Fetch professionals
      const { data: profData } = await supabase.from('profiles').select('id, full_name, role');

      // Fetch budgets
      const { data: budgetData } = await supabase
        .from('project_budgets')
        .select('id, project_id, budget_type, budget_value, fiscal_year, created_at, updated_at, project:projects!project_budgets_project_id_fkey(name)');

      // Calculate financial summary from entries
      const entries = (entriesData as TimeEntryWithRelations[]) || [];
      const approvedEntries = entries.filter((e) => e.approval_status === 'approved');
      const laborCost = approvedEntries.reduce((s, e) => s + (e.duration_minutes / 60) * e.applied_hourly_rate, 0);
      // Revenue, tax, indirect are not in time_entries — use 0 for now
      const revenue = 0;
      const tax = 0;
      const indirectCost = 0;
      const result = revenue - laborCost - tax - indirectCost;
      const margin = revenue > 0 ? (result / revenue) * 100 : 0;

      await exportAdminExcel({
        entries,
        projects: (projectsData as Project[]) || [],
        professionals: (profData as { id: string; full_name: string; role: string }[]) || [],
        budgets: (budgetData as (ProjectBudget & { project?: { name: string } | null })[]) || [],
        financial: { revenue, laborCost, tax, indirectCost, result, margin },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar Excel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg font-medium transition text-sm disabled:opacity-50"
      >
        {loading ? 'Gerando Excel...' : 'Exportar Excel'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
