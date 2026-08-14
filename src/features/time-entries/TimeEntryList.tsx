import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';

interface TimeEntry {
  id: string;
  project_id: string;
  project_name: string;
  entry_date: string;
  duration_minutes: number;
  description: string;
  approval_status: string;
  created_at: string;
}

export function TimeEntryList() {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEntries = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const { data, error: err } = await supabase
          .from('time_entries')
          .select(
            `
            id,
            project_id,
            projects(name),
            entry_date,
            duration_minutes,
            description,
            approval_status,
            created_at
          `
          )
          .eq('professional_id', user.id)
          .order('entry_date', { ascending: false });

        if (err) throw err;

        interface RawTimeEntry {
          id: string;
          project_id: string;
          projects: { name: string } | null;
          entry_date: string;
          duration_minutes: number;
          description: string;
          approval_status: string;
          created_at: string;
        }

        const formattedData = ((data as unknown as RawTimeEntry[]) || []).map((entry) => ({
          id: entry.id,
          project_id: entry.project_id,
          project_name: entry.projects?.name || 'Projeto desconhecido',
          entry_date: entry.entry_date,
          duration_minutes: entry.duration_minutes,
          description: entry.description,
          approval_status: entry.approval_status,
          created_at: entry.created_at,
        }));

        setEntries(formattedData);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao carregar apontamentos';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [user]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };

    const labels: Record<string, string> = {
      pending: 'Pendente',
      approved: 'Aprovado',
      rejected: 'Rejeitado',
    };

    const statusStyle = styles[status] || styles['pending'];
    const statusLabel = labels[status] || status;

    return (
      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusStyle}`}>
        {statusLabel}
      </span>
    );
  };

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
      <div className="rounded-lg border-2 border-dashed border-slate-300 p-12 text-center">
        <p className="text-slate-600 mb-2">Nenhum apontamento registrado</p>
        <p className="text-sm text-slate-500">
          Registre suas horas usando o formulário acima
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Projeto</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Data</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Duração</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Descrição</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
              <td className="px-6 py-4 text-sm text-slate-900">{entry.project_name}</td>
              <td className="px-6 py-4 text-sm text-slate-900">{formatDate(entry.entry_date)}</td>
              <td className="px-6 py-4 text-sm text-slate-900">{formatDuration(entry.duration_minutes)}</td>
              <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                {entry.description}
              </td>
              <td className="px-6 py-4 text-sm">{getStatusBadge(entry.approval_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
