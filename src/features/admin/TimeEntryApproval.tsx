import { useState } from 'react';
import { usePendingTimeEntries } from '@/hooks/usePendingTimeEntries';
import type { TimeEntryWithRelations } from '@/types/database';

interface TimeEntryApprovalProps {
  onStatusChanged?: () => void;
}

export function TimeEntryApproval({ onStatusChanged }: TimeEntryApprovalProps) {
  const { entries, loading, error, actionLoading, successMessage, approve: apiApprove, reject: apiReject } =
    usePendingTimeEntries();
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithRelations | null>(null);

  // Wrapper functions that call onStatusChanged only after successful mutation
  const approve = async (entryId: string) => {
    try {
      await apiApprove(entryId);
      // Only call if approve succeeded (no error thrown)
      onStatusChanged?.();
    } catch {
      // Error already handled in hook, don't call callback
    }
  };

  const reject = async (entryId: string) => {
    try {
      await apiReject(entryId);
      // Only call if reject succeeded (no error thrown)
      onStatusChanged?.();
    } catch {
      // Error already handled in hook, don't call callback
    }
  };

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
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200">
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
                  <td className="px-6 py-4 text-sm space-x-2 flex" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => approve(entry.id)}
                      disabled={actionLoading === entry.id}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === entry.id ? 'Processando...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => reject(entry.id)}
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
                        Profissional
                      </label>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedEntry.professional?.full_name || 'Desconhecido'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">
                        Projeto
                      </label>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedEntry.project?.name || 'Desconhecido'}
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
      )}
    </div>
  );
}
