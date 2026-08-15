import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { exportToCSV, exportToPDF } from '@/lib/export';
import type { AdminFilterValues } from '@/types/admin';
import type { TimeEntryWithRelations } from '@/types/database';

interface TimeEntryRow {
  id: string;
  professional_name: string;
  project_name: string;
  entry_date: string;
  duration_minutes: number;
  applied_hourly_rate: number;
  total_cost: number;
  description?: string;
  created_at?: string;
}

interface TimeEntriesBreakdownProps {
  filters: AdminFilterValues;
  dataRevision?: number;
}

export function TimeEntriesBreakdown({ filters, dataRevision }: TimeEntriesBreakdownProps) {
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryRow | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      let query = supabase
        .from('time_entries')
        .select(
          `
          id,
          entry_date,
          duration_minutes,
          applied_hourly_rate,
          description,
          created_at,
          professional:profiles!time_entries_professional_id_fkey(full_name),
          project:projects!time_entries_project_id_fkey(name)
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

      const formatted = ((data as TimeEntryWithRelations[]) || []).map((entry) => ({
        id: entry.id,
        professional_name: entry.professional?.full_name || 'Desconhecido',
        project_name: entry.project?.name || 'Desconhecido',
        entry_date: entry.entry_date,
        duration_minutes: entry.duration_minutes,
        applied_hourly_rate: entry.applied_hourly_rate,
        total_cost: (entry.duration_minutes / 60) * entry.applied_hourly_rate,
        description: entry.description,
        created_at: entry.created_at,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (dataRevision !== undefined && dataRevision > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchEntries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRevision]);

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
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
        <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg bg-surface-secondary/50 border border-app-primary p-8 text-center">
        <p className="text-app-muted">Nenhum apontamento aprovado encontrado</p>
      </div>
    );
  }

  const handleExportCSV = () => {
    const dataForExport: TimeEntryWithRelations[] = entries.map((entry) => ({
      id: entry.id,
      project_id: '',
      professional_id: '',
      entry_date: entry.entry_date,
      duration_minutes: entry.duration_minutes,
      description: entry.description || '',
      approval_status: 'approved',
      applied_hourly_rate: entry.applied_hourly_rate,
      professional: { id: '', full_name: entry.professional_name, role: 'member', created_at: '', updated_at: '' },
      project: { id: '', name: entry.project_name, client: '', status: 'active', start_date: '', end_date: '', created_at: '', updated_at: '' },
      created_at: entry.created_at || '',
      updated_at: '',
    }));
    exportToCSV(dataForExport, 'apontamentos.csv');
  };

  const handleExportPDF = () => {
    const dataForExport: TimeEntryWithRelations[] = entries.map((entry) => ({
      id: entry.id,
      project_id: '',
      professional_id: '',
      entry_date: entry.entry_date,
      duration_minutes: entry.duration_minutes,
      description: entry.description || '',
      approval_status: 'approved',
      applied_hourly_rate: entry.applied_hourly_rate,
      professional: { id: '', full_name: entry.professional_name, role: 'member', created_at: '', updated_at: '' },
      project: { id: '', name: entry.project_name, client: '', status: 'active', start_date: '', end_date: '', created_at: '', updated_at: '' },
      created_at: entry.created_at || '',
      updated_at: '',
    }));
    exportToPDF(dataForExport, 'Apontamentos');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 text-sm font-medium text-app-secondary bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
        >
          Exportar CSV
        </button>
        <button
          onClick={handleExportPDF}
          className="px-4 py-2 text-sm font-medium text-app-secondary bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
        >
          Exportar PDF
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
        <table className="w-full">
          <thead className="bg-surface-secondary border-b border-app-primary">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">Profissional</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">Projeto</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">Data</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">Duração</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-app-primary">Custo/Hora</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-app-primary">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-table-divider">
            {entries.map((entry) => (
              <tr
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className="hover:bg-hover-surface transition cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedEntry(entry);
                  }
                }}
              >
                <td className="px-6 py-4 text-sm text-app-primary">{entry.professional_name}</td>
                <td className="px-6 py-4 text-sm text-app-primary">{entry.project_name}</td>
                <td className="px-6 py-4 text-sm text-app-primary">{formatDate(entry.entry_date)}</td>
                <td className="px-6 py-4 text-sm text-app-primary">{formatDuration(entry.duration_minutes)}</td>
                <td className="px-6 py-4 text-sm text-app-primary text-right">{formatCurrency(entry.applied_hourly_rate)}</td>
                <td className="px-6 py-4 text-sm font-medium text-app-primary text-right">{formatCurrency(entry.total_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-secondary border-t border-app-primary">
            <tr>
              <td colSpan={3} className="px-6 py-4 text-sm font-semibold text-app-primary">
                Total
              </td>
              <td className="px-6 py-4 text-sm font-semibold text-app-primary">
                {formatDuration(totalHours)}
              </td>
              <td colSpan={1}></td>
              <td className="px-6 py-4 text-sm font-semibold text-app-primary text-right">
                {formatCurrency(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Modal de Detalhes */}
        {selectedEntry && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedEntry(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div
              className="bg-surface-primary rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-surface-primary border-b border-app-primary p-6 flex justify-between items-center">
                <h2 id="modal-title" className="text-2xl font-bold text-app-primary">
                  Detalhes do Apontamento
                </h2>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-app-muted hover:text-app-secondary text-2xl leading-none"
                  aria-label="Fechar modal"
                >
                  ×
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Profissional
                    </label>
                    <p className="text-lg font-semibold text-app-primary">
                      {selectedEntry.professional_name}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Projeto
                    </label>
                    <p className="text-lg font-semibold text-app-primary">
                      {selectedEntry.project_name}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Data
                    </label>
                    <p className="text-lg font-semibold text-app-primary">
                      {formatDate(selectedEntry.entry_date)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Duração
                    </label>
                    <p className="text-lg font-semibold text-app-primary">
                      {formatDuration(selectedEntry.duration_minutes)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Custo/Hora
                    </label>
                    <p className="text-lg font-semibold text-app-primary">
                      {formatCurrency(selectedEntry.applied_hourly_rate)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Custo Total
                    </label>
                    <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                      {formatCurrency(selectedEntry.total_cost)}
                    </p>
                  </div>
                </div>

                {selectedEntry.description && (
                  <div>
                    <label className="block text-sm font-medium text-app-muted mb-2">
                      Descrição
                    </label>
                    <div className="bg-surface-secondary rounded-lg p-4 border border-app-primary">
                      <p className="text-app-primary whitespace-pre-wrap">
                        {selectedEntry.description}
                      </p>
                    </div>
                  </div>
                )}

                {selectedEntry.created_at && (
                  <div className="text-xs text-app-muted">
                    <p>Registrado em: {new Date(selectedEntry.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-app-primary p-6 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="px-6 py-2 border border-app-strong rounded-lg text-app-primary font-medium hover:bg-hover-surface transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
