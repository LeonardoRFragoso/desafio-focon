import { useState, useEffect, useCallback } from 'react';
import { accountingPeriodsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AccountingPeriod } from '@/types/database';

export function AccountingPeriodsPage() {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<AccountingPeriod | null>(null);
  const [reopenTarget, setReopenTarget] = useState<AccountingPeriod | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPeriods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await accountingPeriodsAPI.list();
      if (err) throw err;
      setPeriods((data as AccountingPeriod[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar fechamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPeriods();
  }, [fetchPeriods]);

  const formatDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Fechamentos Mensais</h2>
        <p className="text-slate-600 dark:text-slate-400">
          Feche períodos para bloquear alterações em apontamentos. Períodos fechados impedem
          criação, edição e exclusão de apontamentos por profissionais não-administradores.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-800/50">
          <p className="text-slate-600 dark:text-slate-400">Nenhum período de fechamento registrado</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Períodos são criados automaticamente quando há apontamentos. Feche um período
            para bloquear alterações.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Período</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Fechado por</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Fechado em</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {periods.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 font-medium">{p.period_key}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${p.status === 'closed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {p.status === 'closed' ? 'Fechado' : 'Aberto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {p.closed_by_profile?.full_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDateTime(p.closed_at)}</td>
                  <td className="px-4 py-3 text-sm">
                    {p.status === 'open' ? (
                      <button
                        onClick={() => setCloseTarget(p)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                      >
                        Fechar período
                      </button>
                    ) : (
                      <button
                        onClick={() => setReopenTarget(p)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        Reabrir período
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {closeTarget && (
        <ConfirmDialog
          open
          title="Fechar período"
          destructive
          confirmLabel="Fechar"
          onClose={() => setCloseTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const { error: err } = await accountingPeriodsAPI.close(closeTarget.period_key);
              if (err) {
                setActionError(mapDatabaseError(err));
                return;
              }
              await fetchPeriods();
            } finally {
              setBusy(false);
            }
          }}
          message={
            <>
              <p>Fechar o período <strong>{closeTarget.period_key}</strong>?</p>
              <p className="mt-2">
                Profissionais não poderão criar, editar ou excluir apontamentos neste período.
                Aprovações/rejeições administrativas também serão bloqueadas.
              </p>
            </>
          }
        />
      )}

      {reopenTarget && (
        <ConfirmDialog
          open
          title="Reabrir período"
          confirmLabel="Reabrir"
          onClose={() => setReopenTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const { error: err } = await accountingPeriodsAPI.reopen(reopenTarget.period_key);
              if (err) {
                setActionError(mapDatabaseError(err));
                return;
              }
              await fetchPeriods();
            } finally {
              setBusy(false);
            }
          }}
          message={
            <>
              <p>Reabrir o período <strong>{reopenTarget.period_key}</strong>?</p>
              <p className="mt-2">Alterações em apontamentos serão permitidas novamente.</p>
            </>
          }
        />
      )}
    </div>
  );
}
