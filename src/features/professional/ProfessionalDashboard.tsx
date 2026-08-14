import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';
import type { TimeEntryWithRelations } from '@/types/database';

interface ProfessionalStats {
  approvedHours: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
}

export function ProfessionalDashboard() {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([]);
  const [stats, setStats] = useState<ProfessionalStats>({
    approvedHours: 0,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserEntries = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
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
          project:projects!time_entries_project_id_fkey(name)
        `
        )
        .eq('professional_id', user.id)
        .order('entry_date', { ascending: false });

      if (err) throw err;

      const typedEntries = (data as TimeEntryWithRelations[]) || [];
      setEntries(typedEntries);

      // Calculate stats - only approved hours count
      let approvedHours = 0;
      let approvedCount = 0;
      let pendingCount = 0;
      let rejectedCount = 0;

      typedEntries.forEach((entry) => {
        if (entry.approval_status === 'approved') {
          approvedHours += entry.duration_minutes;
          approvedCount++;
        } else if (entry.approval_status === 'pending') {
          pendingCount++;
        } else if (entry.approval_status === 'rejected') {
          rejectedCount++;
        }
      });

      setStats({
        approvedHours,
        approvedCount,
        pendingCount,
        rejectedCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar apontamentos';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUserEntries();
  }, [fetchUserEntries]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-3 py-1 rounded-full text-xs font-semibold';
    switch (status) {
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-slate-100 text-slate-800`;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Aprovado';
      case 'pending':
        return 'Pendente';
      case 'rejected':
        return 'Rejeitado';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 mb-2">Horas Aprovadas</p>
          <p className="text-3xl font-bold text-green-600">{formatDuration(stats.approvedHours)}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 mb-2">Aprovados</p>
          <p className="text-3xl font-bold text-green-600">{stats.approvedCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 mb-2">Pendentes</p>
          <p className="text-3xl font-bold text-yellow-600">{stats.pendingCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 mb-2">Rejeitados</p>
          <p className="text-3xl font-bold text-red-600">{stats.rejectedCount}</p>
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">Meus Apontamentos</h2>

        {entries.length === 0 ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-8 text-center">
            <p className="text-slate-600">Nenhum apontamento registrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">
                    Projeto
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">
                    Data
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">
                    Duração
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {entry.project?.name || 'Desconhecido'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {formatDate(entry.entry_date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {formatDuration(entry.duration_minutes)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={getStatusBadge(entry.approval_status)}>
                        {getStatusLabel(entry.approval_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
