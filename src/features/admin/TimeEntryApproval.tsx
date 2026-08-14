import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';

interface TimeEntryForApproval {
  id: string;
  professional_id: string;
  project_id: string;
  entry_date: string;
  duration_minutes: number;
  description: string;
  approval_status: string;
  applied_hourly_rate: number;
  professional: { full_name: string };
  project: { name: string };
}

export function TimeEntryApproval() {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<TimeEntryForApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPendingEntries = useCallback(async () => {
    try {
      setError(null);

      const { data, error: err } = await supabase
        .from('time_entries')
        .select(
          `
          id,
          professional_id,
          project_id,
          entry_date,
          duration_minutes,
          description,
          approval_status,
          applied_hourly_rate,
          professional:profiles!time_entries_professional_id_fkey(full_name),
          project:projects!time_entries_project_id_fkey(name)
        `
        )
        .eq('approval_status', 'pending')
        .order('entry_date', { ascending: false });

      if (err) throw err;

      setEntries((data as TimeEntryForApproval[]) || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar apontamentos';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingEntries();
  }, [fetchPendingEntries]);

  const handleApprove = useCallback(async (entryId: string) => {
    if (!user) return;

    try {
      setActionLoading(entryId);
      setSuccessMessage(null);

      const { error: err } = await supabase
        .from('time_entries')
        .update({ approval_status: 'approved' })
        .eq('id', entryId);

      if (err) throw err;

      setSuccessMessage('Apontamento aprovado com sucesso!');
      await fetchPendingEntries();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao aprovar';
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }, [user, fetchPendingEntries]);

  const handleReject = useCallback(async (entryId: string) => {
    if (!user) return;

    try {
      setActionLoading(entryId);
      setSuccessMessage(null);

      const { error: err } = await supabase
        .from('time_entries')
        .update({ approval_status: 'rejected' })
        .eq('id', entryId);

      if (err) throw err;

      setSuccessMessage('Apontamento rejeitado!');
      await fetchPendingEntries();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao rejeitar';
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }, [user, fetchPendingEntries]);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Aprovação de Apontamentos</h2>
        <p className="text-slate-600">Revise e aprove os apontamentos pendentes</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-medium text-green-800">{successMessage}</p>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Nenhum apontamento pendente de aprovação</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Profissional</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Projeto</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Data</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Duração</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Descrição</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Custo</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {entry.professional?.full_name || 'Desconhecido'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {entry.project?.name || 'Desconhecido'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {formatDate(entry.entry_date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {formatDuration(entry.duration_minutes)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {entry.description}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {formatCurrency((entry.duration_minutes / 60) * entry.applied_hourly_rate)}
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2 flex">
                    <button
                      onClick={() => handleApprove(entry.id)}
                      disabled={actionLoading === entry.id}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === entry.id ? 'Processando...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => handleReject(entry.id)}
                      disabled={actionLoading === entry.id}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === entry.id ? 'Processando...' : 'Rejeitar'}
                    </button>
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
