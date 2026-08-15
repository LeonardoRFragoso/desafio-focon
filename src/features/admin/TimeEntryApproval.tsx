import { useState, useMemo } from 'react';
import { usePendingTimeEntries } from '@/hooks/usePendingTimeEntries';
import type { TimeEntryWithRelations, TimeEntryApprovalHistory } from '@/types/database';
import { Modal } from '@/components/Modal';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { useDebounce } from '@/hooks/usePagination';

interface TimeEntryApprovalProps {
  onStatusChanged?: () => void;
}

export function TimeEntryApproval({ onStatusChanged }: TimeEntryApprovalProps) {
  const {
    entries,
    loading,
    error,
    actionLoading,
    successMessage,
    approve,
    reject,
    batchApprove,
    batchReject,
  } = usePendingTimeEntries();
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithRelations | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TimeEntryWithRelations | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState<'approve' | 'reject' | null>(null);
  const [batchReason, setBatchReason] = useState('');
  const [batchError, setBatchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (e) =>
          (e.description ?? '').toLowerCase().includes(q) ||
          (e.professional?.full_name ?? '').toLowerCase().includes(q) ||
          (e.project?.name ?? '').toLowerCase().includes(q)
      );
    }
    if (projectFilter) {
      result = result.filter((e) => e.project_id === projectFilter);
    }
    return result;
  }, [entries, debouncedSearch, projectFilter]);

  const allVisibleSelected = useMemo(
    () => filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id)),
    [filteredEntries, selectedIds]
  );

  const approveEntry = async (entryId: string) => {
    const ok = await approve(entryId);
    if (ok) onStatusChanged?.();
  };

  const openReject = (entry: TimeEntryWithRelations) => {
    setRejectTarget(entry);
    setRejectReason('');
    setRejectError(null);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 10) {
      setRejectError('Informe um motivo com pelo menos 10 caracteres.');
      return;
    }
    const ok = await reject(rejectTarget.id, rejectReason.trim());
    if (ok) {
      setRejectTarget(null);
      onStatusChanged?.();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
    }
  };

  const confirmBatchApprove = async () => {
    const ids = Array.from(selectedIds);
    const results = await batchApprove(ids);
    if (results) {
      setSelectedIds(new Set());
      setBatchMode(null);
      onStatusChanged?.();
    }
  };

  const confirmBatchReject = async () => {
    if (batchReason.trim().length < 10) {
      setBatchError('Informe um motivo com pelo menos 10 caracteres.');
      return;
    }
    const ids = Array.from(selectedIds);
    const results = await batchReject(ids, batchReason.trim());
    if (results) {
      setSelectedIds(new Set());
      setBatchMode(null);
      setBatchReason('');
      setBatchError(null);
      onStatusChanged?.();
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const batchBusy = actionLoading === 'batch';

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

      {/* Search and filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por profissional, projeto ou descrição..."
          className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        >
          <option value="">Todos os projetos</option>
          {[...new Set(entries.map((e) => e.project?.name).filter(Boolean))].map((name) => {
            const entry = entries.find((e) => e.project?.name === name);
            return <option key={entry?.project_id} value={entry?.project_id ?? ''}>{name}</option>;
          })}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Nenhum apontamento pendente de aprovação</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Batch actions bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-focon-600 focus:ring-focon-600"
                aria-label="Selecionar todos visíveis"
              />
              Selecionar todos
            </label>
            <span className="text-sm text-slate-600">
              {selectedCount > 0 ? `${selectedCount} selecionado(s)` : 'Nenhum selecionado'}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => {
                  setBatchMode('approve');
                  setBatchError(null);
                }}
                disabled={selectedCount === 0 || batchBusy}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aprovar em lote
              </button>
              <button
                onClick={() => {
                  setBatchMode('reject');
                  setBatchError(null);
                }}
                disabled={selectedCount === 0 || batchBusy}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rejeitar em lote
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-10" scope="col">
                    <span className="sr-only">Selecionar</span>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Profissional</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Projeto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Data</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Duração</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Descrição</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Custo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredEntries.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Nenhum apontamento encontrado com os filtros selecionados</td></tr>
                ) : (
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="hover:bg-slate-50 transition cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(entry);
                    }}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="h-4 w-4 rounded border-slate-300 text-focon-600 focus:ring-focon-600"
                        aria-label={`Selecionar apontamento de ${entry.professional?.full_name}`}
                      />
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-900">
                      {entry.professional?.full_name || 'Desconhecido'}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-900">
                      {entry.project?.name || 'Desconhecido'}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-900 whitespace-nowrap">
                      {formatDate(entry.entry_date)}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-900 whitespace-nowrap">
                      {formatDuration(entry.duration_minutes)}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600 max-w-[260px] truncate">
                      {entry.description}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-900 whitespace-nowrap">
                      {formatCurrency((entry.duration_minutes / 60) * entry.applied_hourly_rate)}
                    </td>
                    <td className="px-4 py-4 text-sm space-x-2 flex" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => approveEntry(entry.id)}
                        disabled={actionLoading === entry.id || batchBusy}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === entry.id ? '...' : 'Aprovar'}
                      </button>
                      <button
                        onClick={() => openReject(entry)}
                        disabled={actionLoading === entry.id || batchBusy}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Rejeitar
                      </button>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details modal */}
      {selectedEntry && (
        <Modal open onClose={() => setSelectedEntry(null)} title="Detalhes do Apontamento" maxWidth="max-w-2xl">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Profissional</label>
                <p className="text-lg font-semibold text-slate-900">
                  {selectedEntry.professional?.full_name || 'Desconhecido'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Projeto</label>
                <p className="text-lg font-semibold text-slate-900">
                  {selectedEntry.project?.name || 'Desconhecido'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Data</label>
                <p className="text-lg font-semibold text-slate-900">{formatDate(selectedEntry.entry_date)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Duração</label>
                <p className="text-lg font-semibold text-slate-900">
                  {formatDuration(selectedEntry.duration_minutes)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Custo/Hora</label>
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(selectedEntry.applied_hourly_rate)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Custo Total</label>
                <p className="text-lg font-semibold text-green-700">
                  {formatCurrency(
                    (selectedEntry.duration_minutes / 60) * selectedEntry.applied_hourly_rate
                  )}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Descrição</label>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-slate-900 whitespace-pre-wrap">{selectedEntry.description}</p>
              </div>
            </div>
            <ApprovalHistorySection entryId={selectedEntry.id} />
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                onClick={() => {
                  approveEntry(selectedEntry.id);
                  setSelectedEntry(null);
                }}
                disabled={actionLoading === selectedEntry.id}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                onClick={() => {
                  openReject(selectedEntry);
                  setSelectedEntry(null);
                }}
                disabled={actionLoading === selectedEntry.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Rejeitar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Single reject modal (reason required) */}
      {rejectTarget && (
        <Modal
          open
          onClose={() => setRejectTarget(null)}
          title="Rejeitar Apontamento"
          footer={
            <>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={actionLoading === rejectTarget.id}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={actionLoading === rejectTarget.id}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
              >
                {actionLoading === rejectTarget.id ? 'Rejeitando...' : 'Rejeitar'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Informe o motivo da rejeição. O profissional visualizará esta justificativa.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setRejectError(null);
              }}
              rows={4}
              maxLength={1000}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              placeholder="Descreva o motivo da rejeição (mínimo 10 caracteres)..."
              aria-label="Motivo da rejeição"
            />
            <p className="text-xs text-slate-500">{rejectReason.length}/1000 caracteres</p>
            {rejectError && <p className="text-sm text-red-600">{rejectError}</p>}
          </div>
        </Modal>
      )}

      {/* Batch approve confirmation */}
      {batchMode === 'approve' && (
        <Modal
          open
          onClose={() => setBatchMode(null)}
          title="Aprovar em lote"
          footer={
            <>
              <button
                type="button"
                onClick={() => setBatchMode(null)}
                disabled={batchBusy}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBatchApprove}
                disabled={batchBusy}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
              >
                {batchBusy ? 'Processando...' : `Aprovar ${selectedCount}`}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Confirmar a aprovação de <strong>{selectedCount}</strong> apontamento(s) pendente(s)?
            Apenas os pendentes serão processados; já avaliados retornarão como falha.
          </p>
        </Modal>
      )}

      {/* Batch reject (reason required) */}
      {batchMode === 'reject' && (
        <Modal
          open
          onClose={() => setBatchMode(null)}
          title="Rejeitar em lote"
          footer={
            <>
              <button
                type="button"
                onClick={() => setBatchMode(null)}
                disabled={batchBusy}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBatchReject}
                disabled={batchBusy}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
              >
                {batchBusy ? 'Processando...' : `Rejeitar ${selectedCount}`}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Rejeitar <strong>{selectedCount}</strong> apontamento(s). O motivo será aplicado a todos.
            </p>
            <textarea
              value={batchReason}
              onChange={(e) => {
                setBatchReason(e.target.value);
                setBatchError(null);
              }}
              rows={4}
              maxLength={1000}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              placeholder="Motivo da rejeição (mínimo 10 caracteres)..."
              aria-label="Motivo da rejeição em lote"
            />
            <p className="text-xs text-slate-500">{batchReason.length}/1000 caracteres</p>
            {batchError && <p className="text-sm text-red-600">{batchError}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ApprovalHistorySection({ entryId }: { entryId: string }) {
  const [history, setHistory] = useState<TimeEntryApprovalHistory[] | null>(null);

  if (history === null) {
    // Lazily load history on first render of the section.
    Promise.resolve()
      .then(async () => {
        const { data } = await timeEntriesAPI.getHistory(entryId);
        setHistory((data as TimeEntryApprovalHistory[]) || []);
      })
      .catch(() => setHistory([]));
    return <p className="text-sm text-slate-500">Carregando histórico...</p>;
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-2">Histórico de aprovação</label>
      <ul className="space-y-2">
        {history.map((h) => (
          <li
            key={h.id}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            <span className="font-medium capitalize">{h.previous_status}</span> →{' '}
            <span className="font-medium capitalize">{h.new_status}</span>
            {h.changed_by_profile?.full_name && ` por ${h.changed_by_profile.full_name}`}
            {h.reason && <span className="block text-slate-600 mt-1">Motivo: {h.reason}</span>}
            <span className="block text-xs text-slate-400 mt-1">
              {new Date(h.created_at).toLocaleString('pt-BR')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
