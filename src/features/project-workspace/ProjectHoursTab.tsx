import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { mapDatabaseError } from '@/lib/errors';

interface ProjectHoursTabProps {
  projectId: string;
}

interface HoursRow {
  id: string;
  professional_id: string;
  entry_date: string;
  duration_minutes: number;
  approval_status: string;
  description: string;
  professional?: { full_name: string } | null;
  task?: { title: string } | null;
  phase?: { name: string } | null;
}

export function ProjectHoursTab({ projectId }: ProjectHoursTabProps) {
  const [entries, setEntries] = useState<HoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('time_entries')
        .select(
          `
          id, professional_id, entry_date, duration_minutes, approval_status, description,
          professional:profiles!time_entries_professional_id_fkey(full_name),
          task:project_tasks!time_entries_task_id_fkey(title),
          phase:project_phases!time_entries_phase_id_fkey(name)
          `
        )
        .eq('project_id', projectId)
        .order('entry_date', { ascending: false });

      if (statusFilter) {
        query = query.eq('approval_status', statusFilter);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setEntries((data as HoursRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar horas');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();
  }, [fetchEntries]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatHours = (m: number) => `${(m / 60).toFixed(1)}h`;

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const approvedMinutes = entries
    .filter((e) => e.approval_status === 'approved')
    .reduce((sum, e) => sum + e.duration_minutes, 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-app-primary">Horas do Projeto</h3>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-app-primary bg-surface-primary p-4 shadow-sm">
          <p className="text-xs font-medium text-app-muted uppercase">Total</p>
          <p className="mt-1 text-2xl font-bold text-app-primary">
            {formatHours(totalMinutes)}
          </p>
          <p className="text-xs text-app-muted">{entries.length} apontamentos</p>
        </div>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-4 shadow-sm">
          <p className="text-xs font-medium text-app-muted uppercase">Aprovadas</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {formatHours(approvedMinutes)}
          </p>
        </div>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-4 shadow-sm">
          <p className="text-xs font-medium text-app-muted uppercase">Pendentes</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatHours(totalMinutes - approvedMinutes)}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Rejeitado</option>
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhum apontamento encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Data</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Fase</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Tarefa</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Duração</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-hover-surface transition">
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(e.entry_date)}</td>
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">
                    {e.professional?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">
                    {e.phase?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">
                    {e.task?.title ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">
                    {formatHours(e.duration_minutes)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                        e.approval_status === 'approved'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : e.approval_status === 'pending'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {e.approval_status === 'approved'
                        ? 'Aprovado'
                        : e.approval_status === 'pending'
                          ? 'Pendente'
                          : 'Rejeitado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-app-muted max-w-xs truncate">
                    {e.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
