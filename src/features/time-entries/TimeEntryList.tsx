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
  applied_hourly_rate: number;
}

export function TimeEntryList() {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);

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
            created_at,
            applied_hourly_rate
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
          applied_hourly_rate: number;
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
          applied_hourly_rate: entry.applied_hourly_rate,
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

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
      <div
        className="flex justify-center items-center py-12"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
          <p className="text-sm text-slate-600">Carregando apontamentos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const handleRetry = () => {
      window.location.reload();
    };

    return (
      <div
        className="rounded-xl bg-red-50 border border-red-200 p-4"
        role="alert"
      >
        <p className="text-sm font-medium text-red-800 mb-3">{error}</p>
        <button
          onClick={handleRetry}
          className="text-sm font-medium text-red-700 hover:text-red-800 underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-12 text-center bg-slate-50">
        <p className="text-slate-600 mb-2">Nenhum apontamento registrado</p>
        <p className="text-sm text-slate-500">
          Registre suas horas usando o formulário acima
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full">
        <caption className="sr-only">Histórico de apontamentos de horas</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100">
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900" scope="col">Projeto</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900" scope="col">Data</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900" scope="col">Duração</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900" scope="col">Descrição</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900" scope="col">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              onClick={() => setSelectedEntry(entry)}
              className="hover:bg-slate-50 transition cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedEntry(entry);
                }
              }}
            >
              <td className="px-6 py-4 text-sm text-slate-900">{entry.project_name}</td>
              <td className="px-6 py-4 text-sm text-slate-900">{formatDate(entry.entry_date)}</td>
              <td className="px-6 py-4 text-sm text-slate-900">{formatDuration(entry.duration_minutes)}</td>
              <td className="px-6 py-4 text-sm text-slate-600 min-w-[240px] whitespace-normal break-words">
                {entry.description}
              </td>
              <td className="px-6 py-4 text-sm">{getStatusBadge(entry.approval_status)}</td>
            </tr>
          ))}
        </tbody>
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
            className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex justify-between items-center">
              <h2 id="modal-title" className="text-2xl font-bold text-slate-900">
                Detalhes do Apontamento
              </h2>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                aria-label="Fechar modal"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Projeto
                  </label>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedEntry.project_name}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Data
                  </label>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatDate(selectedEntry.entry_date)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Duração
                  </label>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatDuration(selectedEntry.duration_minutes)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Custo/Hora
                  </label>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrency(selectedEntry.applied_hourly_rate)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Custo Total
                  </label>
                  <p className="text-lg font-semibold text-green-700">
                    {formatCurrency(
                      (selectedEntry.duration_minutes / 60) * selectedEntry.applied_hourly_rate
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Status
                  </label>
                  <div>{getStatusBadge(selectedEntry.approval_status)}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Descrição
                </label>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-slate-900 whitespace-pre-wrap">
                    {selectedEntry.description}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                <p>Registrado em: {new Date(selectedEntry.created_at).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 p-6 flex justify-end gap-3">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-6 py-2 border border-slate-300 rounded-lg text-slate-900 font-medium hover:bg-slate-50 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
