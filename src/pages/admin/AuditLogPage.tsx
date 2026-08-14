import { useState, useEffect, useCallback } from 'react';
import { auditAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import type { AuditLog } from '@/types/database';

interface AuditRow extends AuditLog {}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await auditAPI.list(200);
      if (err) throw err;
      setLogs((data as AuditRow[]) || []);
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
        <h2 className="text-2xl font-bold text-slate-900">Auditoria</h2>
        <p className="text-slate-600">Registro de alterações em apontamentos e períodos</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-12 text-center bg-slate-50">
          <p className="text-slate-600">Nenhum registro de auditoria</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Data/Hora</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ação</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Entidade</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ator</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium font-mono">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{log.entity_type}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {log.actor?.full_name || log.actor_id?.slice(0, 8) || 'Sistema'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => setSelected(log)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Entidade</p>
                  <p className="font-medium text-slate-900">{selected.entity_type}</p>
                </div>
                <div>
                  <p className="text-slate-500">ID da entidade</p>
                  <p className="font-mono text-xs text-slate-900 break-all">{selected.entity_id || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Ator</p>
                  <p className="font-medium text-slate-900">{selected.actor?.full_name || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Data/Hora</p>
                  <p className="font-medium text-slate-900">{formatDateTime(selected.created_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Antes</p>
                <pre className="bg-slate-50 rounded-lg p-3 text-xs text-slate-800 overflow-x-auto border border-slate-200">
                  {formatData(selected.before_data)}
                </pre>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Depois</p>
                <pre className="bg-slate-50 rounded-lg p-3 text-xs text-slate-800 overflow-x-auto border border-slate-200">
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
