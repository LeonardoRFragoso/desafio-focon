import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { HourGoalWidget } from '@/features/time-entries/HourGoalWidget';
import { QuickEntryModal } from '@/features/time-entries/QuickEntryModal';
import { Timer } from '@/features/time-entries/Timer';
import { TimeEntryDetailsModal, type TimeEntryDetail } from '@/features/time-entries/TimeEntryDetailsModal';
import { ProfessionalActionCenter } from '@/features/professional/ProfessionalActionCenter';
import { MyTasks } from '@/features/professional/MyTasks';
import { commandCenterAPI } from '@/lib/supabase/api';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';
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
  const [dashboardStats, setDashboardStats] = useState<ProfessionalDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchUserEntries = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Try the new RPC first; fall back to individual queries if RPC not deployed yet
      let dashStats: ProfessionalDashboardStats | null = null;
      try {
        const { data: rpcData, error: rpcError } = await commandCenterAPI.getProfessionalStats(user.id);
        if (!rpcError && rpcData) {
          dashStats = rpcData as unknown as ProfessionalDashboardStats;
          setDashboardStats(dashStats);
          setStats({
            approvedHours: dashStats.stats.approved_minutes,
            approvedCount: dashStats.stats.approved_count,
            pendingCount: dashStats.stats.pending_count,
            rejectedCount: dashStats.stats.rejected_count,
          });
        }
      } catch {
        // RPC not deployed yet — fall back to individual queries below
      }

      // If RPC failed, use the old query-based approach for stats
      if (!dashStats) {
        const { count: pendingCount } = await supabase
          .from('time_entries')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', user.id)
          .eq('approval_status', 'pending');

        const { count: approvedCount } = await supabase
          .from('time_entries')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', user.id)
          .eq('approval_status', 'approved');

        const { count: rejectedCount } = await supabase
          .from('time_entries')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', user.id)
          .eq('approval_status', 'rejected');

        const { data: approvedData } = await supabase
          .from('time_entries')
          .select('duration_minutes')
          .eq('professional_id', user.id)
          .eq('approval_status', 'approved');

        const approvedHours = (approvedData || []).reduce((sum, e) => sum + (e as { duration_minutes: number }).duration_minutes, 0);

        setStats({
          approvedHours,
          approvedCount: approvedCount || 0,
          pendingCount: pendingCount || 0,
          rejectedCount: rejectedCount || 0,
        });
      }

      // Fetch recent entries for the table
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
          rejection_reason,
          rejected_by,
          rejected_at,
          created_at,
          updated_at,
          phase_id,
          task_id,
          project:projects!time_entries_project_id_fkey(name),
          phase:project_phases!time_entries_phase_id_fkey(name),
          task:project_tasks!time_entries_task_id_fkey(title),
          rejected_by_profile:profiles!time_entries_rejected_by_fkey(full_name)
        `
        )
        .eq('professional_id', user.id)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (err) throw err;

      const typedEntries = (data as TimeEntryWithRelations[]) || [];
      setEntries(typedEntries);
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
        return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400`;
      default:
        return `${baseClasses} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300`;
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

  const handleRowClick = (entry: TimeEntryWithRelations) => {
    const detail: TimeEntryDetail = {
      id: entry.id,
      project_id: entry.project_id,
      professional_id: entry.professional_id,
      entry_date: entry.entry_date,
      duration_minutes: entry.duration_minutes,
      description: entry.description,
      approval_status: entry.approval_status,
      applied_hourly_rate: null,
      rejection_reason: entry.rejection_reason ?? null,
      rejected_by: entry.rejected_by ?? null,
      rejected_at: entry.rejected_at ?? null,
      created_at: entry.created_at,
      updated_at: entry.updated_at ?? null,
      phase_id: entry.phase_id ?? null,
      task_id: entry.task_id ?? null,
      project: entry.project ?? null,
      phase: entry.phase ?? null,
      task: entry.task ?? null,
      rejected_by_profile: entry.rejected_by_profile ?? null,
    };
    setSelectedEntry(detail);
  };

  const handleQuickEntrySaved = () => {
    setQuickEntryOpen(false);
    fetchUserEntries();
    setToast('Apontamento criado com sucesso!');
    setTimeout(() => setToast(null), 3000);
  };

  const handleTimerEntryCreated = () => {
    fetchUserEntries();
    setToast('Apontamento criado a partir do timer!');
    setTimeout(() => setToast(null), 3000);
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
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-green-600 text-white px-4 py-3 shadow-lg" role="status" aria-live="polite">
          <p className="text-sm font-medium">{toast}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Horas Aprovadas</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatDuration(stats.approvedHours)}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Aprovados</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.approvedCount}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Pendentes</p>
          <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pendingCount}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Rejeitados</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.rejectedCount}</p>
        </div>
      </div>

      {/* Minhas Pendências — Action Center for professionals */}
      <ProfessionalActionCenter stats={dashboardStats} loading={false} />

      {/* Minhas Tarefas */}
      <MyTasks stats={dashboardStats} loading={false} />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <button
          onClick={() => setQuickEntryOpen(true)}
          className="px-4 py-3 bg-focon-600 hover:bg-focon-700 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Apontamento
        </button>
        {user && <Timer userId={user.id} onEntryCreated={handleTimerEntryCreated} />}
      </div>

      {/* Hour Goal Widget */}
      <HourGoalWidget />

      {/* Entries Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Meus Apontamentos</h2>
          <a href="/time-entries" className="text-sm text-focon-600 dark:text-focon-400 hover:underline">
            Ver histórico completo →
          </a>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 text-center">
            <p className="text-slate-600 dark:text-slate-400">Nenhum apontamento registrado</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Use o botão "Novo Apontamento" ou o Timer para registrar suas horas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full">
              <caption className="sr-only">Apontamentos recentes</caption>
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">
                    Projeto
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">
                    Data
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">
                    Duração
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => handleRowClick(entry)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                  >
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                      {entry.project?.name ?? '—'}
                      {entry.phase && <span className="block text-xs text-slate-500 dark:text-slate-400">{entry.phase.name}</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatDate(entry.entry_date)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatDuration(entry.duration_minutes)}</td>
                    <td className="px-6 py-4">
                      <span className={getStatusBadge(entry.approval_status)}>
                        {getStatusLabel(entry.approval_status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-focon-600 dark:text-focon-400">Ver detalhes</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Entry Modal */}
      {user && (
        <QuickEntryModal
          isOpen={quickEntryOpen}
          onClose={() => setQuickEntryOpen(false)}
          userId={user.id}
          onSaved={handleQuickEntrySaved}
        />
      )}

      {/* Time Entry Details Modal */}
      {selectedEntry && (
        <TimeEntryDetailsModal
          entry={selectedEntry}
          isOpen={true}
          isAdmin={false}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
