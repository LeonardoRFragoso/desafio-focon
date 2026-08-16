import { useState, useMemo } from 'react';
import { usePendingTimeEntries } from '@/hooks/usePendingTimeEntries';
import type { TimeEntryWithRelations, TimeEntryApprovalHistory } from '@/types/database';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/useToast';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { useDebounce } from '@/hooks/usePagination';
import { isFutureDate } from '@/features/time-entries/temporalRules';

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
  const { showToast } = useToast();
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
  const [approveTarget, setApproveTarget] = useState<TimeEntryWithRelations | null>(null);
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

  // Count of future legacy entries among filtered results
  const futureLegacyCount = useMemo(
    () => filteredEntries.filter((e) => isFutureDate(e.entry_date)).length,
    [filteredEntries]
  );

  const approveEntry = async (entryId: string) => {
    const ok = await approve(entryId);
    if (ok) {
      showToast('Apontamento aprovado com sucesso!', 'success');
      onStatusChanged?.();
    }
  };

  const openApprove = (entry: TimeEntryWithRelations) => {
    setApproveTarget(entry);
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    await approveEntry(approveTarget.id);
    setApproveTarget(null);
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
      showToast('Apontamento rejeitado com sucesso!', 'success');
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
    // Filter out future legacy entries — they cannot be approved
    const approvableIds = ids.filter((id) => {
      const entry = entries.find((e) => e.id === id);
      return entry && !isFutureDate(entry.entry_date);
    });
    if (approvableIds.length === 0) {
      setBatchError('Nenhum dos apontamentos selecionados pode ser aprovado (todos possuem data futura).');
      return;
    }
    if (approvableIds.length < ids.length) {
      setBatchError(`${ids.length - approvableIds.length} apontamento(s) com data futura foram excluídos da aprovação em lote.`);
    } else {
      setBatchError(null);
    }
    const results = await batchApprove(approvableIds);
    if (results) {
      const successes = results.filter((r) => r.status === 'approved').length;
      const failures = results.filter((r) => r.status === 'failed').length;
      const toastMessage = failures > 0
        ? `${successes} apontamento(s) aprovado(s); ${failures} falhou/falharam.`
        : `${successes} apontamento(s) aprovado(s) com sucesso!`;
      showToast(toastMessage, failures > 0 ? 'error' : 'success');
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
      const successes = results.filter((r) => r.status === 'rejected').length;
      const failures = results.filter((r) => r.status === 'failed').length;
      const toastMessage = failures > 0
        ? `${successes} apontamento(s) rejeitado(s); ${failures} falhou/falharam.`
        : `${successes} apontamento(s) rejeitado(s) com sucesso!`;
      showToast(toastMessage, failures > 0 ? 'error' : 'success');
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
        <h2 className="text-2xl font-bold text-app-primary mb-2">Aprovação de Apontamentos</h2>
        <p className="text-app-muted">Revise e aprove os apontamentos pendentes</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
          <p className="text-sm font-medium text-green-800 dark:text-green-400">{successMessage}</p>
        </div>
      )}

      {/* Search and filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por profissional, projeto ou descrição..."
          className="flex-1 min-w-[180px] px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        >
          <option value="">Todos os projetos</option>
          {[...new Set(entries.map((e) => e.project?.name).filter(Boolean))].map((name) => {
            const entry = entries.find((e) => e.project?.name === name);
            return <option key={entry?.project_id} value={entry?.project_id ?? ''}>{name}</option>;
          })}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg bg-surface-secondary/50 border border-app-primary p-8 text-center">
          <p className="text-app-muted">Nenhum apontamento pendente de aprovação</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Batch actions bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-app-primary bg-surface-secondary/50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-app-secondary">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-app-strong text-focon-600 focus:ring-focon-600"
                aria-label="Selecionar todos visíveis"
              />
              Selecionar todos
            </label>
            <span className="text-sm text-app-muted">
              {selectedCount > 0 ? `${selectedCount} selecionado(s)` : 'Nenhum selecionado'}
              {futureLegacyCount > 0 && (
                <span className="ml-2 text-orange-600 dark:text-orange-400">
                  · {futureLegacyCount} com data futura (não aprovável)
                </span>
              )}
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

          <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
            <table className="w-full">
              <thead className="bg-surface-secondary border-b border-app-primary">
                <tr>
                  <th className="px-4 py-3 w-10" scope="col">
                    <span className="sr-only">Selecionar</span>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Projeto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Data</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Duração</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Descrição</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Custo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-table-divider">
                {filteredEntries.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-app-muted">Nenhum apontamento encontrado com os filtros selecionados</td></tr>
                ) : (
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="hover:bg-hover-surface transition cursor-pointer"
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
                        className="h-4 w-4 rounded border-app-strong text-focon-600 focus:ring-focon-600"
                        aria-label={`Selecionar apontamento de ${entry.professional?.full_name}`}
                      />
                    </td>
                    <td className="px-4 py-4 text-sm text-app-primary">
                      {entry.professional?.full_name || 'Desconhecido'}
                    </td>
                    <td className="px-4 py-4 text-sm text-app-primary">
                      {entry.project?.name || 'Desconhecido'}
                    </td>
                    <td className="px-4 py-4 text-sm text-app-primary whitespace-nowrap">
                      {formatDate(entry.entry_date)}
                      {isFutureDate(entry.entry_date) && (
                        <span
                          className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                          title="Apontamento com data futura — não pode ser aprovado"
                        >
                          DATA FUTURA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-app-primary whitespace-nowrap">
                      {formatDuration(entry.duration_minutes)}
                    </td>
                    <td className="px-4 py-4 text-sm text-app-muted max-w-[260px] truncate">
                      {entry.description}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-app-primary whitespace-nowrap">
                      {formatCurrency((entry.duration_minutes / 60) * entry.applied_hourly_rate)}
                    </td>
                    <td className="px-4 py-4 text-sm space-x-2 flex" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openApprove(entry)}
                        disabled={actionLoading === entry.id || batchBusy || isFutureDate(entry.entry_date)}
                        title={isFutureDate(entry.entry_date) ? 'Apontamentos com data futura não podem ser aprovados.' : undefined}
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
                <label className="block text-sm font-medium text-app-muted mb-2">Profissional</label>
                <p className="text-lg font-semibold text-app-primary">
                  {selectedEntry.professional?.full_name || 'Desconhecido'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-2">Projeto</label>
                <p className="text-lg font-semibold text-app-primary">
                  {selectedEntry.project?.name || 'Desconhecido'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-2">Data</label>
                <p className="text-lg font-semibold text-app-primary">{formatDate(selectedEntry.entry_date)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-2">Duração</label>
                <p className="text-lg font-semibold text-app-primary">
                  {formatDuration(selectedEntry.duration_minutes)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-2">Custo/Hora</label>
                <p className="text-lg font-semibold text-app-primary">
                  {formatCurrency(selectedEntry.applied_hourly_rate)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-2">Custo Total</label>
                <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                  {formatCurrency(
                    (selectedEntry.duration_minutes / 60) * selectedEntry.applied_hourly_rate
                  )}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-muted mb-2">Descrição</label>
              <div className="bg-surface-secondary rounded-lg p-4 border border-app-primary">
                <p className="text-app-primary whitespace-pre-wrap">{selectedEntry.description}</p>
              </div>
            </div>
            <ApprovalHistorySection entryId={selectedEntry.id} />
            <div className="flex justify-end gap-3 border-t border-app-primary pt-4">
              {isFutureDate(selectedEntry.entry_date) && (
                <div className="mr-auto rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 px-3 py-2">
                  <p className="text-xs text-orange-800 dark:text-orange-400">
                    ⚠ Data futura — não pode ser aprovado. Corrija a data ou rejeite.
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  openApprove(selectedEntry);
                  setSelectedEntry(null);
                }}
                disabled={actionLoading === selectedEntry.id || isFutureDate(selectedEntry.entry_date)}
                title={isFutureDate(selectedEntry.entry_date) ? 'Apontamentos com data futura não podem ser aprovados.' : undefined}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
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
            <p className="text-sm text-app-muted">
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
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              placeholder="Descreva o motivo da rejeição (mínimo 10 caracteres)..."
              aria-label="Motivo da rejeição"
            />
            <p className="text-xs text-app-muted">{rejectReason.length}/1000 caracteres</p>
            {rejectError && <p className="text-sm text-red-600 dark:text-red-400">{rejectError}</p>}
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
                className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
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
          <p className="text-sm text-app-muted">
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
                className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
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
            <p className="text-sm text-app-muted">
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
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              placeholder="Motivo da rejeição (mínimo 10 caracteres)..."
              aria-label="Motivo da rejeição em lote"
            />
            <p className="text-xs text-app-muted">{batchReason.length}/1000 caracteres</p>
            {batchError && <p className="text-sm text-red-600 dark:text-red-400">{batchError}</p>}
          </div>
        </Modal>
      )}

      {/* Single approve confirmation */}
      <ConfirmDialog
        open={approveTarget !== null}
        title="Aprovar Apontamento"
        message={
          approveTarget ? (
            <>
              Confirmar a aprovação do apontamento de{' '}
              <strong>{approveTarget.professional?.full_name ?? 'profissional'}</strong> no projeto{' '}
              <strong>{approveTarget.project?.name ?? 'projeto'}</strong> ({formatDate(approveTarget.entry_date)} —{' '}
              {formatDuration(approveTarget.duration_minutes)})?
              <br />
              <span className="text-app-muted">Esta ação não pode ser desfeita.</span>
            </>
          ) : null
        }
        confirmLabel="Aprovar"
        onConfirm={confirmApprove}
        onClose={() => setApproveTarget(null)}
      />
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
    return <p className="text-sm text-app-muted">Carregando histórico...</p>;
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div>
      <label className="block text-sm font-medium text-app-muted mb-2">Histórico de aprovação</label>
      <ul className="space-y-2">
        {history.map((h) => (
          <li
            key={h.id}
            className="rounded-lg border border-app-primary bg-surface-secondary px-3 py-2 text-sm text-app-secondary"
          >
            <span className="font-medium capitalize">{h.previous_status}</span> →{' '}
            <span className="font-medium capitalize">{h.new_status}</span>
            {h.changed_by_profile?.full_name && ` por ${h.changed_by_profile.full_name}`}
            {h.reason && <span className="block text-app-muted mt-1">Motivo: {h.reason}</span>}
            <span className="block text-xs text-app-muted mt-1">
              {new Date(h.created_at).toLocaleString('pt-BR')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
