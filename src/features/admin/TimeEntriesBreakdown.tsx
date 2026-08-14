import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

interface FilterValues {
  projectId: string;
  professionalId: string;
  startDate: string;
  endDate: string;
}

interface TimeEntryRow {
  id: string;
  professional_name: string;
  project_name: string;
  entry_date: string;
  duration_minutes: number;
  applied_hourly_rate: number;
  total_cost: number;
}

interface TimeEntriesBreakdownProps {
  filters: FilterValues;
}

export function TimeEntriesBreakdown({ filters }: TimeEntriesBreakdownProps) {
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('time_entries')
        .select(
          `
          id,
          entry_date,
          duration_minutes,
          applied_hourly_rate,
          profiles(full_name),
          projects(name)
        `
        )
        .eq('approval_status', 'approved');

      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters.professionalId) {
        query = query.eq('professional_id', filters.professionalId);
      }

      if (filters.startDate) {
        query = query.gte('entry_date', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('entry_date', filters.endDate);
      }

      const { data, error: err } = await query.order('entry_date', { ascending: false });

      if (err) throw err;

      const formatted = (data || []).map((entry: any) => ({
        id: entry.id,
        professional_name: entry.profiles?.full_name || 'Desconhecido',
        project_name: entry.projects?.name || 'Desconhecido',
        entry_date: entry.entry_date,
        duration_minutes: entry.duration_minutes,
        applied_hourly_rate: entry.applied_hourly_rate,
        total_cost: (entry.duration_minutes / 60) * entry.applied_hourly_rate,
      }));

      setEntries(formatted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar apontamentos';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters.projectId, filters.professionalId, filters.startDate, filters.endDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const totalCost = entries.reduce((sum, entry) => sum + entry.total_cost, 0);
  const totalHours = entries.reduce((sum, entry) => sum + entry.duration_minutes, 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm font-medium text-red-800">{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-8 text-center">
        <p className="text-slate-600">Nenhum apontamento aprovado encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Profissional</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Projeto</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Data</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Duração</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Custo/Hora</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4 text-sm text-slate-900">{entry.professional_name}</td>
                <td className="px-6 py-4 text-sm text-slate-900">{entry.project_name}</td>
                <td className="px-6 py-4 text-sm text-slate-900">{formatDate(entry.entry_date)}</td>
                <td className="px-6 py-4 text-sm text-slate-900">{formatDuration(entry.duration_minutes)}</td>
                <td className="px-6 py-4 text-sm text-slate-900">{formatCurrency(entry.applied_hourly_rate)}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(entry.total_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200">
            <tr>
              <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-slate-900">
                Total
              </td>
              <td className="px-6 py-3 text-sm font-semibold text-slate-900">
                {formatDuration(totalHours)}
              </td>
              <td colSpan={1}></td>
              <td className="px-6 py-3 text-sm font-semibold text-slate-900">
                {formatCurrency(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
