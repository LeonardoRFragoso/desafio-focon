import { useState, useEffect, useCallback, useMemo } from 'react';
import { auditAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { useDebounce, usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import type { AuditLog } from '@/types/database';

const PAGE_SIZE = 20;

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { page, setPage, resetPage } = usePagination({ pageSize: PAGE_SIZE });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await auditAPI.list(500);
      if (err) throw err;
      setLogs((data as AuditLog[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
     
    resetPage();
  }, [debouncedSearch, actionFilter, resetPage]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.entity_type.toLowerCase().includes(q) ||
          (l.actor?.full_name?.toLowerCase().includes(q) ?? false)
      );
    }
    if (actionFilter) {
      result = result.filter((l) => l.action === actionFilter);
    }
    return result;
  }, [logs, debouncedSearch, actionFilter]);

  // Paginate
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, page]);

  const uniqueActions = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.action))).sort();
  }, [logs]);

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const formatData = (data: Record<string, unknown> | null) => {
    if (!data) return '—';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Auditoria</h2>
        <p className="text-slate-600 dark:text-slate-400">Registro de alterações em apontamentos e períodos</p>
      </div>

      {/* Search and filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por ação, entidade ou ator..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
        >
          <option value="">Todas as ações</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {filteredLogs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-400">Nenhum registro de auditoria</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <table className="w-full">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ação</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Entidade</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ator</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 font-medium font-mono">{log.action}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{log.entity_type}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {log.actor?.full_name || log.actor_id?.slice(0, 8) || 'Sistema'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelected(log)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filteredLogs.length}
            onPageChange={setPage}
          />
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Detalhes: {selected.action}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Entidade</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{selected.entity_type}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">ID da entidade</p>
                  <p className="font-mono text-xs text-slate-900 dark:text-slate-100 break-all">{selected.entity_id || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Ator</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{selected.actor?.full_name || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Data/Hora</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{formatDateTime(selected.created_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Antes</p>
                <pre className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-xs text-slate-800 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-700">
                  {formatData(selected.before_data)}
                </pre>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Depois</p>
                <pre className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-xs text-slate-800 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-700">
                  {formatData(selected.after_data)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
